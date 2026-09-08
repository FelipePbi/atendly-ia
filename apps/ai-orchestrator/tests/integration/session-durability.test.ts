import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { buildConversationKey } from "../../src/modules/inbox/inbox-policy.js";
import { InboxStore } from "../../src/modules/inbox/InboxStore.js";
import { SessionService } from "../../src/modules/session/SessionService.js";

// Contato, sessão e controle humano contra PostgreSQL real.
//
// Mesmo alvo descartável da suíte de transporte, preparado pelos ensaios de
// migration. Sem AI_TEST_DATABASE_URL a suíte é pulada, para que o gate local
// não dependa de banco pessoal; validate:integration a fornece.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT_A = "tenant-session-a";
const TENANT_B = "tenant-session-b";
const CHANNEL_A = "channel-session-a";
const CHANNEL_B = "channel-session-b";
const CONVERSATION_A = "conversation-session-a";
const CONVERSATION_B = "conversation-session-b";
const CONTACT = "5511977777777";

// Fronteira curta de propósito: a política é configurável e o teste exercita os
// limites dela, não um valor fixo de 24 h.
const policy = { inactivitySeconds: 60 };

describe.skipIf(!databaseUrl)("contact and session against PostgreSQL", () => {
  let prisma: PrismaClient;
  let sessions: SessionService;

  const scopeA = {
    tenantId: TENANT_A,
    channelId: CHANNEL_A,
    conversationId: CONVERSATION_A,
    externalContactId: CONTACT,
  };
  const scopeB = {
    tenantId: TENANT_B,
    channelId: CHANNEL_B,
    conversationId: CONVERSATION_B,
    externalContactId: CONTACT,
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    sessions = new SessionService(prisma, policy);

    for (const [tenantId, channelId, conversationId] of [
      [TENANT_A, CHANNEL_A, CONVERSATION_A],
      [TENANT_B, CHANNEL_B, CONVERSATION_B],
    ] as const) {
      await prisma.channelConnection.upsert({
        where: { tenantId_id: { tenantId, id: channelId } },
        update: {},
        create: {
          id: channelId,
          tenantId,
          userId: `user-${tenantId}`,
          provider: "EVOLUTION_GO",
          externalInstanceId: `instance-${tenantId}`,
        },
      });
      await prisma.conversation.upsert({
        where: { tenantId_channelId_id: { tenantId, channelId, id: conversationId } },
        update: {},
        create: {
          id: conversationId,
          tenantId,
          channelId,
          externalContactId: CONTACT,
          state: {},
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.conversationSession.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.conversation.updateMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
      data: {
        contactId: null,
        humanHandoff: false,
        status: "ACTIVE",
        state: {},
      },
    });
    await prisma.contact.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
  });

  it("creates the contact once and links the conversation to it", async () => {
    const first = await sessions.resolveContext(scopeA);
    const second = await sessions.resolveContext(scopeA);

    expect(second.contactId).toBe(first.contactId);
    expect(second.sessionId).toBe(first.sessionId);
    expect(
      await prisma.contact.count({ where: { tenantId: TENANT_A } }),
    ).toBe(1);
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: CONVERSATION_A },
    });
    expect(conversation.contactId).toBe(first.contactId);
  });

  it("rotates the session at the configured inactivity boundary, not before", async () => {
    const start = new Date("2026-09-07T10:00:00.000Z");
    const opened = await sessions.resolveContext(scopeA, start);
    await sessions.recordContactMessage({
      tenantId: TENANT_A,
      sessionId: opened.sessionId,
      now: start,
    });

    // Exatamente no limite a sessão ainda é a mesma.
    const atBoundary = await sessions.resolveContext(
      scopeA,
      new Date(start.getTime() + policy.inactivitySeconds * 1000),
    );
    expect(atBoundary.sessionId).toBe(opened.sessionId);

    const afterBoundary = await sessions.resolveContext(
      scopeA,
      new Date(start.getTime() + policy.inactivitySeconds * 1000 + 1),
    );
    expect(afterBoundary.sessionId).not.toBe(opened.sessionId);

    const closed = await prisma.conversationSession.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: TENANT_A, id: opened.sessionId } },
    });
    expect(closed.endedAt).not.toBeNull();
    expect(closed.endedReason).toBe("contact_inactivity");
  });

  it("keeps the manual override across sessions and lets the suggestion be only a suggestion", async () => {
    const start = new Date("2026-09-07T10:00:00.000Z");
    const opened = await sessions.resolveContext(scopeA, start);
    await sessions.setCategoryOverride({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      category: "COMMERCIAL",
      actor: "owner-a",
      now: start,
    });

    // A classificação do agente chega depois e não desfaz a decisão manual.
    await sessions.recordCategorySuggestion({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      classification: "personal_contact",
      provenance: "agent:test",
      now: start,
    });
    const afterSuggestion = await prisma.conversationSession.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: TENANT_A, id: opened.sessionId } },
    });
    expect(afterSuggestion.category).toBe("COMMERCIAL");
    expect(afterSuggestion.categorySource).toBe("MANUAL");
    expect(afterSuggestion.suggestedCategory).toBe("PERSONAL");
    expect(afterSuggestion.suggestionProvenance).toBe("agent:test");

    // Sessão nova: a sugestão não atravessa, o override sim.
    const next = await sessions.resolveContext(
      scopeA,
      new Date(start.getTime() + 120_000),
    );
    expect(next.sessionId).not.toBe(opened.sessionId);
    expect(next.category).toBe("COMMERCIAL");
    expect(next.categorySource).toBe("MANUAL");
  });

  it("returns to automatic classification when the override is cleared", async () => {
    const opened = await sessions.resolveContext(scopeA);
    await sessions.recordCategorySuggestion({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      classification: "potential_customer",
      provenance: "agent:test",
    });
    await sessions.setCategoryOverride({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      category: "PERSONAL",
    });
    const cleared = await sessions.setCategoryOverride({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      category: null,
    });

    expect(cleared?.sessionId).toBe(opened.sessionId);
    expect(cleared?.category).toBe("COMMERCIAL");
    expect(cleared?.categorySource).toBe("AUTOMATIC");
  });

  it("a personal session turns the AI off only in that session", async () => {
    const start = new Date("2026-09-07T10:00:00.000Z");
    const opened = await sessions.resolveContext(scopeA, start);
    await sessions.recordCategorySuggestion({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      classification: "personal_contact",
      provenance: "agent:test",
      now: start,
    });

    await expect(
      sessions.evaluate({
        tenantId: TENANT_A,
        sessionId: opened.sessionId,
        observedInboundVersion: 0,
        aiEnabled: true,
        channelConnected: true,
      }),
    ).resolves.toEqual({ reason: "session_personal" });

    // Sessão nova reavalia a intenção: sem override, volta a Não classificadas.
    const next = await sessions.resolveContext(
      scopeA,
      new Date(start.getTime() + 120_000),
    );
    expect(next.category).toBe("UNCLASSIFIED");
    await expect(
      sessions.evaluate({
        tenantId: TENANT_A,
        sessionId: next.sessionId,
        observedInboundVersion: 0,
        aiEnabled: true,
        channelConnected: true,
      }),
    ).resolves.toEqual({ reason: null });
  });

  it("an ignored contact never comes back, not even in a new session", async () => {
    const start = new Date("2026-09-07T10:00:00.000Z");
    await sessions.resolveContext(scopeA, start);
    await sessions.setIgnored({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      ignored: true,
      actor: "owner-a",
      now: start,
    });

    const next = await sessions.resolveContext(
      scopeA,
      new Date(start.getTime() + 120_000),
    );
    await expect(
      sessions.evaluate({
        tenantId: TENANT_A,
        sessionId: next.sessionId,
        observedInboundVersion: 0,
        aiEnabled: true,
        channelConnected: true,
      }),
    ).resolves.toEqual({ reason: "contact_ignored" });
  });

  it("human control survives the clock inside the session and ends with the session", async () => {
    const start = new Date("2026-09-07T10:00:00.000Z");
    const opened = await sessions.resolveContext(scopeA, start);
    await sessions.assumeHumanControl({
      tenantId: TENANT_A,
      sessionId: opened.sessionId,
      source: "ATENDLY",
      actor: "owner-a",
      now: start,
    });

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: CONVERSATION_A },
    });
    expect(conversation.humanHandoff).toBe(true);
    await expect(
      sessions.isHumanControlActive({
        tenantId: TENANT_A,
        conversationId: CONVERSATION_A,
        now: new Date(start.getTime() + 30_000),
      }),
    ).resolves.toBe(true);

    // Expirou por inatividade do contato: o controle humano acaba com a sessão,
    // e a sessão nova volta à IA.
    await expect(
      sessions.isHumanControlActive({
        tenantId: TENANT_A,
        conversationId: CONVERSATION_A,
        now: new Date(start.getTime() + 120_000),
      }),
    ).resolves.toBe(false);
    const next = await sessions.resolveContext(
      scopeA,
      new Date(start.getTime() + 120_000),
    );
    expect(next.humanHandling).toBe(false);
  });

  it("release returns the conversation to the AI and asks for a fresh context", async () => {
    const start = new Date("2026-09-07T10:00:00.000Z");
    await prisma.conversation.update({
      where: { id: CONVERSATION_A },
      data: {
        state: {
          aiConversation: {
            aiEnabledForChat: false,
            stage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            lastProcessedMessageIds: ["message-old"],
          },
          appointmentDraft: {
            customerPhone: CONTACT,
            services: [],
            status: "waiting_confirmation",
          },
        },
      },
    });
    const opened = await sessions.resolveContext(scopeA, start);
    await sessions.assumeHumanControl({
      tenantId: TENANT_A,
      sessionId: opened.sessionId,
      source: "ATENDLY",
      now: start,
    });

    const released = await sessions.releaseToAi({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      actor: "owner-a",
      now: new Date(start.getTime() + 10_000),
    });

    expect(released?.humanHandling).toBe(false);
    expect(released?.contextResetAt).not.toBeNull();
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: CONVERSATION_A },
    });
    const state = conversation.state as Record<string, Record<string, unknown>>;
    // Tool pendente do contexto antigo não é retomada automaticamente.
    expect(state.appointmentDraft.status).toBe("waiting_info");
    expect(state.aiConversation.stage).toBe("GENERAL_CONVERSATION");
    expect(state.aiConversation.lastProcessedMessageIds).toEqual([]);
  });

  it("the input version guards the send against a message that arrived mid-turn", async () => {
    const opened = await sessions.resolveContext(scopeA);
    const observed = opened.inboundVersion;
    await sessions.recordContactMessage({
      tenantId: TENANT_A,
      sessionId: opened.sessionId,
    });

    await expect(
      sessions.evaluate({
        tenantId: TENANT_A,
        sessionId: opened.sessionId,
        observedInboundVersion: observed,
        aiEnabled: true,
        channelConnected: true,
      }),
    ).resolves.toEqual({ reason: "input_superseded" });
  });

  it("keeps two tenants with the same phone completely apart", async () => {
    const a = await sessions.resolveContext(scopeA);
    const b = await sessions.resolveContext(scopeB);
    expect(a.contactId).not.toBe(b.contactId);

    await sessions.setIgnored({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      ignored: true,
    });
    await sessions.setCategoryOverride({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      category: "PERSONAL",
    });

    const untouched = await sessions.resolveContext(scopeB);
    expect(untouched.ignored).toBe(false);
    expect(untouched.category).toBe("UNCLASSIFIED");
    expect(untouched.categorySource).toBe("AUTOMATIC");

    // E o tenant B não alcança a conversa de A nem pedindo por id.
    await expect(
      sessions.setIgnored({
        tenantId: TENANT_B,
        conversationId: CONVERSATION_A,
        ignored: true,
      }),
    ).resolves.toBeNull();
    const stillIgnored = await prisma.contact.findFirstOrThrow({
      where: { tenantId: TENANT_A },
    });
    expect(stillIgnored.ignored).toBe(true);
  });
});

describe.skipIf(!databaseUrl)("inbox lease heartbeat against PostgreSQL", () => {
  let prisma: PrismaClient;
  let inbox: InboxStore;

  const TENANT = "tenant-lease";
  const CHANNEL = "channel-lease";
  const conversationKey = buildConversationKey({
    tenantId: TENANT,
    channelId: CHANNEL,
    externalContactId: "5511966666666",
  });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    inbox = new InboxStore(prisma, {
      maxAttempts: 5,
      baseSeconds: 1,
      maxSeconds: 10,
    });
    await prisma.channelConnection.upsert({
      where: { tenantId_id: { tenantId: TENANT, id: CHANNEL } },
      update: {},
      create: {
        id: CHANNEL,
        tenantId: TENANT,
        userId: "user-lease",
        provider: "EVOLUTION_GO",
        externalInstanceId: "instance-lease",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.processedEvent.deleteMany({ where: { tenantId: TENANT } });
  });

  it("a long batch keeps its lease and is not claimed by another cycle", async () => {
    await inbox.record({
      tenantId: TENANT,
      channelId: CHANNEL,
      eventKey: "evt-lease-1",
      messageId: "evt-lease-1",
      eventType: "message",
      conversationKey,
      rawPayload: { event: "Message" },
    });

    const start = new Date();
    const claim = await inbox.claimNext({
      owner: "worker-long",
      leaseMs: 2_000,
      groupWindowMs: 1_000,
      batchLimit: 10,
      now: start,
    });
    expect(claim).not.toBeNull();

    // O lote passa do lease original. Sem heartbeat, o outro ciclo o
    // reivindicaria no meio do trabalho.
    const midWork = new Date(start.getTime() + 30_000);
    const renewed = await inbox.renewLease({
      ids: claim!.events.map((event) => event.id),
      leaseToken: claim!.leaseToken,
      leaseMs: 60_000,
      now: midWork,
    });
    expect(renewed).toBe(1);

    const competitor = await inbox.claimNext({
      owner: "worker-other",
      leaseMs: 2_000,
      groupWindowMs: 1_000,
      batchLimit: 10,
      now: midWork,
    });
    expect(competitor).toBeNull();

    // O dono original ainda conclui com o seu token.
    await expect(
      inbox.complete({
        ids: claim!.events.map((event) => event.id),
        leaseToken: claim!.leaseToken,
        status: "DONE",
        result: { kind: "message" },
      }),
    ).resolves.toBe(1);
  });

  it("a lost lease cannot be renewed back", async () => {
    await inbox.record({
      tenantId: TENANT,
      channelId: CHANNEL,
      eventKey: "evt-lease-2",
      messageId: "evt-lease-2",
      eventType: "message",
      conversationKey,
      rawPayload: { event: "Message" },
    });

    const start = new Date();
    const claim = await inbox.claimNext({
      owner: "worker-dead",
      leaseMs: 1_000,
      groupWindowMs: 1_000,
      batchLimit: 10,
      now: start,
    });
    expect(claim).not.toBeNull();

    // Lease vencido e recuperado por outro ciclo.
    const later = new Date(start.getTime() + 5_000);
    const recovered = await inbox.claimNext({
      owner: "worker-alive",
      leaseMs: 60_000,
      groupWindowMs: 1_000,
      batchLimit: 10,
      now: later,
    });
    expect(recovered).not.toBeNull();

    await expect(
      inbox.renewLease({
        ids: claim!.events.map((event) => event.id),
        leaseToken: claim!.leaseToken,
        leaseMs: 60_000,
        now: later,
      }),
    ).resolves.toBe(0);
  });
});
