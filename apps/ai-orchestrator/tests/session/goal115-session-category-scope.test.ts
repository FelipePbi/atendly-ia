import { describe, expect, it, vi } from "vitest";

import { AssistantService } from "../../src/modules/assistant/assistant.service.js";
import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import { InboundMessageProcessor } from "../../src/modules/channel/InboundMessageProcessor.js";
import type { GraphRuntimePort } from "../../src/modules/graph/graph-runtime.js";
import { HandoffService } from "../../src/modules/handoff/HandoffService.js";
import { SessionService } from "../../src/modules/session/SessionService.js";
import { createFakePrisma } from "./support/fake-prisma.js";

/**
 * Goal115 — decisao de categoria "so esta conversa".
 *
 * `SessionService`, `HandoffService` e o grafo reais sobre o Prisma em
 * memoria. A decisao por conversa mora em `ConversationSession.categoryOverride`
 * e chega as guardas pela categoria efetiva da sessao, que elas ja leem; o
 * contato nao muda, e a sessao seguinte nasce sem a decisao.
 */

const TENANT = "tenant-1";
const CHANNEL = "channel-1";
const CONVERSATION = "conversation-1";
const CONTACT_PHONE = "5511999999999";

type Row = Record<string, unknown>;

function baseMessage(
  overrides: Partial<ChannelInboundMessage> = {},
): ChannelInboundMessage {
  return {
    provider: "evolution-go",
    tenantId: TENANT,
    channelId: CHANNEL,
    userId: "user-1",
    requestId: "request-1",
    instanceId: "instance-1",
    messageId: `message-${Math.random().toString(16).slice(2)}`,
    chatId: `${CONTACT_PHONE}@s.whatsapp.net`,
    customerPhone: CONTACT_PHONE,
    customerName: "Maria",
    fromMe: false,
    isGroup: false,
    kind: "text",
    text: "Oi, quero agendar",
    raw: {},
    ...overrides,
  };
}

function buildSubject() {
  const { store, prisma } = createFakePrisma();
  const sessions = new SessionService(prisma, { inactivitySeconds: 60 });
  const handoff = new HandoffService(
    prisma,
    { tenantId: TENANT, channelId: CHANNEL },
    sessions,
  );

  store.conversation.rows.push({
    id: CONVERSATION,
    tenantId: TENANT,
    channelId: CHANNEL,
    externalContactId: CONTACT_PHONE,
    customerName: "Maria",
    status: "ACTIVE",
    humanHandoff: false,
    handoffPausedUntil: null,
    contactId: null,
    state: {},
  });

  let inboundCounter = 0;
  const automation = {
    handleIncomingText: vi.fn(),
    markOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
    markOutboundDelivery: vi.fn().mockResolvedValue(undefined),
    recordManualOutboundText: vi.fn().mockResolvedValue({
      conversationId: CONVERSATION,
      messageRecordId: "manual-1",
    }),
    recordInboundText: vi.fn().mockImplementation(async () => {
      inboundCounter += 1;
      return {
        conversationId: CONVERSATION,
        messageRecordId: `inbound-${inboundCounter}`,
      };
    }),
    handleBufferedText: vi.fn(),
    prepareGraphTurn: vi.fn().mockResolvedValue({
      conversationId: CONVERSATION,
      tenantId: TENANT,
      channelId: CHANNEL,
    }),
    invokeGraphAgent: vi.fn().mockImplementation(async (session: unknown) => ({
      session,
      response: { id: "model-1", text: "ok", toolCalls: [], continuation: null },
    })),
    executeGraphTools: vi.fn(),
    advanceGraphTurn: vi.fn(),
    completeGraphTurn: vi.fn().mockResolvedValue({
      text: "Resposta",
      conversationId: CONVERSATION,
      messageRecordId: "outbound-1",
    }),
    failGraphTurn: vi.fn().mockResolvedValue(undefined),
  };
  const knowledge = {
    search: vi.fn().mockImplementation(() => {
      throw new Error("Knowledge retrieval must not run for blocked content.");
    }),
  };
  const provider = {
    sendText: vi
      .fn()
      .mockResolvedValue({ provider: "evolution-go", messageId: "sent-1", raw: {} }),
  };
  const idempotency = { remember: vi.fn().mockResolvedValue(true) };
  const runtime: GraphRuntimePort = {
    resolveConversationId: vi.fn().mockResolvedValue(CONVERSATION),
    loadTenantConfig: vi.fn().mockResolvedValue({
      channelConnected: true,
      tenantConfig: {
        aiEnabled: true,
        tone: "BALANCED",
        promptVersion: "scheduling_v1.0.0",
      },
    }),
    loadConversation: vi.fn().mockImplementation(async () => {
      const row = store.conversation.rows[0] as Row;
      return {
        status: row.status,
        humanHandoff: row.humanHandoff,
        externalContactId: row.externalContactId,
        contactId: row.contactId,
      };
    }),
    loadToolResults: vi.fn().mockResolvedValue([]),
  };
  const outboundGate = {
    shouldCancel: vi.fn().mockResolvedValue(null),
    requestCancel: vi.fn().mockResolvedValue(undefined),
  };

  return {
    store,
    prisma,
    sessions,
    automation,
    provider,
    processor: new InboundMessageProcessor(
      automation as never,
      provider as never,
      idempotency,
      handoff,
      undefined,
      {
        debounce: false,
        runtime,
        knowledge: knowledge as never,
        outboundGate,
        sessions,
      },
    ),
  };
}

type Subject = ReturnType<typeof buildSubject>;

function openSession(subject: Subject): Row {
  const open = (subject.store.conversationSession.rows as Row[]).filter(
    (row) => row.endedAt === null,
  );
  expect(open).toHaveLength(1);
  return open[0];
}

function contactRow(subject: Subject): Row {
  return subject.store.contact.rows[0] as Row;
}

function expireCurrentSession(subject: Subject): void {
  openSession(subject).expiresAt = new Date(Date.now() - 60_000);
}

function markOnlyThisConversation(
  subject: Subject,
  category: "PERSONAL" | "COMMERCIAL" | "UNCLASSIFIED" | null = "PERSONAL",
) {
  return subject.sessions.setCategoryOverride({
    tenantId: TENANT,
    conversationId: CONVERSATION,
    category,
    scope: "CONVERSATION",
    actor: "user-1",
  });
}

/** Sugestao de resposta: recusa antes de qualquer leitura de conteudo. */
function suggestionsService(subject: Subject) {
  const modelProvider = {
    invoke: vi.fn().mockImplementation(() => {
      throw new Error("The model must not run for a personal session.");
    }),
  };
  return new AssistantService(
    subject.prisma,
    undefined,
    modelProvider as never,
    {} as never,
  );
}

describe("Goal115 — decisao de categoria so nesta conversa", () => {
  it("deixa a sessao aberta Pessoal sem tocar o contato, e a IA nao responde", async () => {
    const subject = buildSubject();
    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });

    const snapshot = await markOnlyThisConversation(subject);

    expect(snapshot).toMatchObject({
      category: "PERSONAL",
      categorySource: "MANUAL",
    });
    expect(openSession(subject)).toMatchObject({
      category: "PERSONAL",
      categorySource: "MANUAL",
      categoryOverride: "PERSONAL",
      categoryUpdatedBy: "user-1",
    });
    expect(contactRow(subject)).toMatchObject({
      categoryOverride: null,
      categoryOverrideAt: null,
      categoryOverrideBy: null,
    });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "personal_session" });
    // A primeira mensagem foi respondida; a segunda nao chegou ao modelo.
    expect(subject.automation.invokeGraphAgent).toHaveBeenCalledTimes(1);
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
  });

  it("a sugestao de resposta recusa com SESSION_PERSONAL", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    await markOnlyThisConversation(subject);
    openSession(subject).humanHandling = true;

    await expect(
      suggestionsService(subject).generateSuggestions({
        tenantId: TENANT,
        conversationId: CONVERSATION,
        userId: "user-1",
        requestId: "request-1",
      }),
    ).resolves.toEqual({ ok: false, reason: "SESSION_PERSONAL" });
  });

  it("mensagem nova na mesma sessao e sugestao do agente nao desfazem a decisao", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    await markOnlyThisConversation(subject);

    await subject.sessions.recordCategorySuggestion({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      classification: "potential_customer",
      provenance: "agent:test",
    });
    expect(openSession(subject)).toMatchObject({
      category: "PERSONAL",
      categorySource: "MANUAL",
      categoryOverride: "PERSONAL",
      // A sugestao fica registrada ao lado, sem decidir nada.
      suggestedCategory: "COMMERCIAL",
    });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "personal_session" });
    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "personal_session" });

    expect(openSession(subject)).toMatchObject({
      category: "PERSONAL",
      categoryOverride: "PERSONAL",
    });
    expect(subject.automation.invokeGraphAgent).toHaveBeenCalledTimes(1);
  });

  it("a sessao seguinte volta a classificacao e a IA responde de novo", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    await markOnlyThisConversation(subject);
    const marked = openSession(subject);

    expireCurrentSession(subject);
    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });

    const next = openSession(subject);
    expect(next.id).not.toBe(marked.id);
    expect(marked).toMatchObject({ endedReason: "contact_inactivity" });
    expect(next.categoryOverride ?? null).toBe(null);
    expect(next).toMatchObject({
      category: "UNCLASSIFIED",
      categorySource: "AUTOMATIC",
    });
    expect(subject.automation.invokeGraphAgent).toHaveBeenCalledTimes(2);
  });

  it("a sessao seguinte volta a decisao do contato, que nao foi tocada", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    await subject.sessions.setCategoryOverride({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      category: "COMMERCIAL",
      actor: "user-1",
    });
    await markOnlyThisConversation(subject);
    expect(openSession(subject)).toMatchObject({ category: "PERSONAL" });
    expect(contactRow(subject)).toMatchObject({ categoryOverride: "COMMERCIAL" });

    expireCurrentSession(subject);
    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });
    expect(openSession(subject)).toMatchObject({
      category: "COMMERCIAL",
      categorySource: "MANUAL",
    });
  });

  it("scope CONTACT depois de so esta conversa limpa a decisao da sessao", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    await markOnlyThisConversation(subject);

    const snapshot = await subject.sessions.setCategoryOverride({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      category: "COMMERCIAL",
      scope: "CONTACT",
      actor: "user-2",
    });

    expect(snapshot).toMatchObject({
      category: "COMMERCIAL",
      categorySource: "MANUAL",
    });
    expect(openSession(subject)).toMatchObject({
      categoryOverride: null,
      category: "COMMERCIAL",
      categoryUpdatedBy: "user-2",
    });
    expect(contactRow(subject)).toMatchObject({
      categoryOverride: "COMMERCIAL",
      categoryOverrideBy: "user-2",
    });
    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });
  });

  it("category null sem scope limpa as duas decisoes", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    await subject.sessions.setCategoryOverride({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      category: "COMMERCIAL",
      actor: "user-1",
    });
    await markOnlyThisConversation(subject);

    await subject.sessions.setCategoryOverride({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      category: null,
      actor: "user-1",
    });

    expect(openSession(subject)).toMatchObject({
      categoryOverride: null,
      category: "UNCLASSIFIED",
      categorySource: "AUTOMATIC",
      categoryUpdatedAt: null,
      categoryUpdatedBy: null,
    });
    expect(contactRow(subject)).toMatchObject({
      categoryOverride: null,
      categoryOverrideAt: null,
      categoryOverrideBy: null,
    });
  });

  it("category null com scope CONVERSATION limpa so a decisao da sessao", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    await subject.sessions.setCategoryOverride({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      category: "COMMERCIAL",
      actor: "user-1",
    });
    await markOnlyThisConversation(subject);

    await markOnlyThisConversation(subject, null);

    expect(openSession(subject)).toMatchObject({
      categoryOverride: null,
      category: "COMMERCIAL",
      categorySource: "MANUAL",
      categoryUpdatedBy: "user-1",
    });
    expect(contactRow(subject)).toMatchObject({ categoryOverride: "COMMERCIAL" });
  });

  it("sem scope a decisao vai para o contato, como na baseline", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());

    await subject.sessions.setCategoryOverride({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      category: "PERSONAL",
      actor: "user-1",
    });

    expect(contactRow(subject)).toMatchObject({
      categoryOverride: "PERSONAL",
      categoryOverrideBy: "user-1",
    });
    expect(openSession(subject)).toMatchObject({
      categoryOverride: null,
      category: "PERSONAL",
      categorySource: "MANUAL",
      categoryUpdatedBy: "user-1",
    });

    // E atravessa a troca de sessao, como antes.
    expireCurrentSession(subject);
    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "personal_session" });
    expect(openSession(subject)).toMatchObject({ category: "PERSONAL" });
  });
});

/**
 * Leituras de sessao devolvem copia, como o Prisma real, e uma decisao manual
 * pode ser intercalada **depois** da leitura e **antes** da escrita.
 *
 * O Prisma em memoria devolve a propria linha, que a decisao mutaria por
 * baixo; com copia, o valor lido fica velho como ficaria contra o banco.
 */
function interleave(subject: Subject) {
  const table = subject.store.conversationSession;
  const findFirst = table.findFirst.bind(table);
  const findUnique = table.findUnique.bind(table);
  const findUniqueOrThrow = table.findUniqueOrThrow.bind(table);
  let pending: (() => Promise<unknown>) | null = null;
  let running = false;
  const copy = (row: Row | null) => (row ? { ...row } : row);

  const afterRead = async () => {
    if (!pending || running) return;
    const action = pending;
    pending = null;
    running = true;
    try {
      await action();
    } finally {
      running = false;
    }
  };

  table.findFirst = async (args) => {
    const row = copy(await findFirst(args));
    await afterRead();
    return row;
  };
  table.findUnique = async (args) => copy(await findUnique(args));
  table.findUniqueOrThrow = async (args) =>
    copy(await findUniqueOrThrow(args)) as Row;

  return {
    /** Roda `action` logo depois da proxima leitura da sessao aberta. */
    afterNextRead(action: () => Promise<unknown>) {
      pending = action;
    },
  };
}

describe("Goal115 — recalculo intercalado com decisao manual", () => {
  it("sugestao calculada antes da decisao nao a apaga", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    const race = interleave(subject);

    race.afterNextRead(() => markOnlyThisConversation(subject));
    await subject.sessions.recordCategorySuggestion({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      classification: "potential_customer",
      provenance: "agent:test",
    });

    expect(openSession(subject)).toMatchObject({
      categoryOverride: "PERSONAL",
      category: "PERSONAL",
      categorySource: "MANUAL",
      suggestedCategory: "COMMERCIAL",
      suggestionProvenance: "agent:test",
    });
  });

  it("refresh do contexto calculado antes da decisao nao a apaga", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    // Decisao do contato gravada por fora: a sessao aberta esta defasada e o
    // proximo `resolveContext` precisa recalcular.
    contactRow(subject).categoryOverride = "COMMERCIAL";
    const race = interleave(subject);

    race.afterNextRead(() => markOnlyThisConversation(subject));
    const snapshot = await subject.sessions.resolveContext({
      tenantId: TENANT,
      channelId: CHANNEL,
      conversationId: CONVERSATION,
      externalContactId: CONTACT_PHONE,
    });

    expect(snapshot).toMatchObject({
      category: "PERSONAL",
      categorySource: "MANUAL",
    });
    expect(openSession(subject)).toMatchObject({
      categoryOverride: "PERSONAL",
      category: "PERSONAL",
      categorySource: "MANUAL",
    });
  });

  it("a decisao do contato tomada no meio de um refresh tambem prevalece", async () => {
    const subject = buildSubject();
    await subject.processor.handleInboundMessage(baseMessage());
    await subject.sessions.recordCategorySuggestion({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      classification: "potential_customer",
      provenance: "agent:test",
    });
    // Sessao defasada de proposito para o refresh querer escrever.
    openSession(subject).category = "UNCLASSIFIED";
    const race = interleave(subject);

    race.afterNextRead(() =>
      subject.sessions.setCategoryOverride({
        tenantId: TENANT,
        conversationId: CONVERSATION,
        category: "PERSONAL",
        scope: "CONTACT",
        actor: "user-1",
      }),
    );
    await subject.sessions.resolveContext({
      tenantId: TENANT,
      channelId: CHANNEL,
      conversationId: CONVERSATION,
      externalContactId: CONTACT_PHONE,
    });

    expect(contactRow(subject)).toMatchObject({ categoryOverride: "PERSONAL" });
    expect(openSession(subject)).toMatchObject({
      category: "PERSONAL",
      categorySource: "MANUAL",
    });
  });
});
