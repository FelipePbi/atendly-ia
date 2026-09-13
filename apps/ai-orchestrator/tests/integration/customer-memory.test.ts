import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import type { AppointmentDraft } from "../../src/modules/assistant/assistant.service.js";
import { CustomerMemoryService } from "../../src/modules/memory/customer-memory-service.js";
import type { TurnAppointmentEvidence } from "../../src/modules/memory/memory-inference.js";

// Memória do cliente contra PostgreSQL real.
//
// Mesmo alvo descartável das demais suítes de integração. A tabela
// `CustomerMemory` é texto com proveniência e **não** depende da extensão
// `vector`: esta suíte roda no banco de durabilidade, que não a tem instalada.
// Sem AI_TEST_DATABASE_URL a suíte é pulada; validate:integration a fornece.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT_A = "tenant-memory-a";
const TENANT_B = "tenant-memory-b";
const CHANNEL_A = "channel-memory-a";
const CHANNEL_B = "channel-memory-b";
const CONVERSATION_A = "conversation-memory-a";
const CONVERSATION_B = "conversation-memory-b";
const CONTACT_A = "contact-memory-a";
const CONTACT_B = "contact-memory-b";
const CUSTOMER = "customer-memory-1";
const PHONE = "5511966666666";
const NOW = new Date("2026-09-13T12:00:00.000Z");

/**
 * Atendimento avulso confirmado pelas tools do turno. A evidência é o que
 * autoriza a inferência: rascunho em construção não vira memória da pessoa.
 */
const CONFIRMADO: TurnAppointmentEvidence = {
  appointmentConfirmed: true,
  recurringSeriesConfirmed: false,
};

function appointment(
  patch: Partial<AppointmentDraft>,
): Partial<AppointmentDraft> {
  return patch;
}

describe.skipIf(!databaseUrl)("customer memory against PostgreSQL", () => {
  let prisma: PrismaClient;
  let memory: CustomerMemoryService;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    memory = new CustomerMemoryService(prisma, {
      staleDays: 180,
      promptLimit: 12,
    });

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
        where: {
          tenantId_channelId_id: { tenantId, channelId, id: conversationId },
        },
        update: {},
        create: {
          id: conversationId,
          tenantId,
          channelId,
          externalContactId: PHONE,
          state: {},
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.customerMemory.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.customerMemory.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.conversationSession.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.conversation.updateMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
      data: { contactId: null },
    });
    await prisma.contact.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });

    for (const [tenantId, channelId, conversationId, contactId] of [
      [TENANT_A, CHANNEL_A, CONVERSATION_A, CONTACT_A],
      [TENANT_B, CHANNEL_B, CONVERSATION_B, CONTACT_B],
    ] as const) {
      await prisma.contact.create({
        data: {
          id: contactId,
          tenantId,
          channelId,
          externalContactId: PHONE,
          customerId: CUSTOMER,
          customerLinkedAt: NOW,
        },
      });
      await prisma.conversation.update({
        where: {
          tenantId_channelId_id: { tenantId, channelId, id: conversationId },
        },
        data: { contactId },
      });
      await prisma.conversationSession.create({
        data: {
          tenantId,
          channelId,
          conversationId,
          contactId,
          expiresAt: new Date("2026-09-14T12:00:00.000Z"),
        },
      });
    }
  });

  it("guarda a memória inferida com origem, conversa e mensagens de origem", async () => {
    const outcome = await memory.recordTurnInference({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      appointment: appointment({ desiredPeriod: "afternoon" }),
      evidence: CONFIRMADO,
      sourceMessageIds: ["message-1"],
      now: NOW,
    });

    expect(outcome).toEqual({ applied: 1 });
    const [row] = await memory.list({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
    });
    expect(row).toMatchObject({
      kind: "PREFERRED_PERIOD",
      value: "tarde",
      origin: "AI_INFERRED",
      aiAllowed: true,
      sourceConversationId: CONVERSATION_A,
      sourceMessageIds: ["message-1"],
    });
    expect(row?.confidence).toBeGreaterThan(0);
  });

  it("substitui a memória contraditória sem apagar a anterior", async () => {
    await memory.recordTurnInference({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      appointment: appointment({ desiredPeriod: "morning" }),
      evidence: CONFIRMADO,
      sourceMessageIds: ["message-1"],
      now: new Date("2026-09-01T12:00:00.000Z"),
    });
    await memory.recordTurnInference({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      appointment: appointment({ desiredPeriod: "afternoon" }),
      evidence: CONFIRMADO,
      sourceMessageIds: ["message-2"],
      now: NOW,
    });

    const all = await memory.list({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      includeInactive: true,
    });
    const active = await memory.list({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
    });

    expect(all).toHaveLength(2);
    expect(active).toHaveLength(1);
    expect(active[0]?.value).toBe("tarde");

    const previous = all.find((row) => row.value === "manha");
    expect(previous?.removedAt).toBeNull();
    expect(previous?.supersededById).toBe(active[0]?.id);
  });

  it("reforço atualiza lastReinforcedAt sem criar linha nova", async () => {
    await memory.recordTurnInference({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      appointment: appointment({ desiredPeriod: "afternoon" }),
      evidence: CONFIRMADO,
      sourceMessageIds: ["message-1"],
      now: new Date("2026-09-01T12:00:00.000Z"),
    });
    await memory.recordTurnInference({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      appointment: appointment({ desiredPeriod: "afternoon" }),
      evidence: CONFIRMADO,
      sourceMessageIds: ["message-2"],
      now: NOW,
    });

    const rows = await memory.list({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      includeInactive: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastReinforcedAt).toEqual(NOW);
  });

  it("o cadastro da profissional nasce com permissão negada e substitui o tipo anterior", async () => {
    const inferred = await memory.create({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      kind: "PREFERRED_PERIOD",
      value: "manha",
      origin: "AI_INFERRED",
      confidence: 0.6,
      now: new Date("2026-09-01T12:00:00.000Z"),
      observedAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    const professional = await memory.create({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      kind: "PREFERRED_PERIOD",
      value: "noite",
      origin: "PROFESSIONAL",
      now: NOW,
      observedAt: NOW,
    });

    expect(inferred.aiAllowed).toBe(true);
    expect(professional.aiAllowed).toBe(false);
    expect(professional.confidence).toBeNull();

    const all = await memory.list({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      includeInactive: true,
    });
    expect(all.find((row) => row.id === inferred.id)?.supersededById).toBe(
      professional.id,
    );
    expect(
      (await memory.list({ tenantId: TENANT_A, customerId: CUSTOMER })).map(
        (row) => row.id,
      ),
    ).toEqual([professional.id]);
  });

  it("a profissional permite, revoga e remove — inclusive memória inferida", async () => {
    await memory.recordTurnInference({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      appointment: appointment({ desiredPeriod: "afternoon" }),
      evidence: CONFIRMADO,
      sourceMessageIds: ["message-1"],
      now: NOW,
    });
    const [inferred] = await memory.list({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
    });

    const revoked = await memory.setPermission({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      memoryId: inferred!.id,
      aiAllowed: false,
    });
    expect(revoked.aiAllowed).toBe(false);
    expect(
      await memory.loadForPrompt({
        tenantId: TENANT_A,
        contactId: CONTACT_A,
        now: NOW,
      }),
    ).toEqual([]);

    const allowed = await memory.setPermission({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      memoryId: inferred!.id,
      aiAllowed: true,
    });
    expect(allowed.aiAllowed).toBe(true);
    expect(
      await memory.loadForPrompt({
        tenantId: TENANT_A,
        contactId: CONTACT_A,
        now: NOW,
      }),
    ).toEqual([
      {
        kind: "PREFERRED_PERIOD",
        value: "tarde",
        origin: "AI_INFERRED",
        ageDays: 0,
        stale: false,
      },
    ]);

    const removed = await memory.remove({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      memoryId: inferred!.id,
      removedBy: "user-1",
      now: NOW,
    });
    expect(removed.removedAt).toEqual(NOW);
    expect(removed.removedBy).toBe("user-1");
    // Removida continua no banco, fora da listagem vigente e fora do prompt.
    expect(
      await prisma.customerMemory.count({ where: { id: inferred!.id } }),
    ).toBe(1);
    expect(
      await memory.list({ tenantId: TENANT_A, customerId: CUSTOMER }),
    ).toEqual([]);
    expect(
      await memory.loadForPrompt({
        tenantId: TENANT_A,
        contactId: CONTACT_A,
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("memória mais velha que o limite entra marcada como antiga", async () => {
    await memory.create({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      kind: "OBSERVATION",
      value: "Prefere sala silenciosa",
      origin: "PROFESSIONAL",
      aiAllowed: true,
      observedAt: new Date("2025-01-01T12:00:00.000Z"),
    });

    const [item] = await memory.loadForPrompt({
      tenantId: TENANT_A,
      contactId: CONTACT_A,
      now: NOW,
    });

    expect(item?.stale).toBe(true);
    expect(item?.ageDays).toBeGreaterThan(180);
  });

  it("memória de um negócio não alcança o outro, mesmo com a mesma pessoa e o mesmo telefone", async () => {
    await memory.create({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      kind: "OBSERVATION",
      value: "somente do negocio A",
      origin: "PROFESSIONAL",
      aiAllowed: true,
      observedAt: NOW,
    });

    expect(
      await memory.list({ tenantId: TENANT_B, customerId: CUSTOMER }),
    ).toEqual([]);
    expect(
      await memory.loadForPrompt({
        tenantId: TENANT_B,
        contactId: CONTACT_B,
        now: NOW,
      }),
    ).toEqual([]);
    expect(
      (
        await memory.loadForPrompt({
          tenantId: TENANT_A,
          contactId: CONTACT_A,
          now: NOW,
        })
      ).map((item) => item.value),
    ).toEqual(["somente do negocio A"]);
  });

  it("o item de um negócio não é removível nem editável pelo outro", async () => {
    const created = await memory.create({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      kind: "OBSERVATION",
      value: "somente do negocio A",
      origin: "PROFESSIONAL",
      observedAt: NOW,
    });

    await expect(
      memory.remove({
        tenantId: TENANT_B,
        customerId: CUSTOMER,
        memoryId: created.id,
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_MEMORY_NOT_FOUND" });
    await expect(
      memory.setPermission({
        tenantId: TENANT_B,
        customerId: CUSTOMER,
        memoryId: created.id,
        aiAllowed: true,
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_MEMORY_NOT_FOUND" });
    expect(
      (await memory.list({ tenantId: TENANT_A, customerId: CUSTOMER }))[0]
        ?.aiAllowed,
    ).toBe(false);
  });

  it("contato ignorado não infere nem carrega memória", async () => {
    await memory.create({
      tenantId: TENANT_A,
      customerId: CUSTOMER,
      kind: "OBSERVATION",
      value: "memoria existente",
      origin: "PROFESSIONAL",
      aiAllowed: true,
      observedAt: NOW,
    });
    await prisma.contact.update({
      where: { tenantId_id: { tenantId: TENANT_A, id: CONTACT_A } },
      data: { ignored: true, ignoredAt: NOW },
    });

    expect(
      await memory.recordTurnInference({
        tenantId: TENANT_A,
        conversationId: CONVERSATION_A,
        appointment: appointment({ desiredPeriod: "afternoon" }),
        evidence: CONFIRMADO,
        sourceMessageIds: ["message-1"],
        now: NOW,
      }),
    ).toEqual({ applied: 0, skipped: "contact_ignored" });
    expect(
      await memory.loadForPrompt({
        tenantId: TENANT_A,
        contactId: CONTACT_A,
        now: NOW,
      }),
    ).toEqual([]);
    expect(
      await memory.list({ tenantId: TENANT_A, customerId: CUSTOMER }),
    ).toHaveLength(1);
  });

  it("sessão pessoal e atendimento humano não viram memória da pessoa", async () => {
    await prisma.conversationSession.updateMany({
      where: { tenantId: TENANT_A, conversationId: CONVERSATION_A },
      data: { category: "PERSONAL" },
    });
    expect(
      await memory.recordTurnInference({
        tenantId: TENANT_A,
        conversationId: CONVERSATION_A,
        appointment: appointment({ desiredPeriod: "afternoon" }),
        evidence: CONFIRMADO,
        sourceMessageIds: ["message-1"],
        now: NOW,
      }),
    ).toEqual({ applied: 0, skipped: "personal_session" });

    await prisma.conversationSession.updateMany({
      where: { tenantId: TENANT_A, conversationId: CONVERSATION_A },
      data: { category: "COMMERCIAL", humanHandling: true },
    });
    expect(
      await memory.recordTurnInference({
        tenantId: TENANT_A,
        conversationId: CONVERSATION_A,
        appointment: appointment({ desiredPeriod: "afternoon" }),
        evidence: CONFIRMADO,
        sourceMessageIds: ["message-1"],
        now: NOW,
      }),
    ).toEqual({ applied: 0, skipped: "human_handled" });

    expect(
      await memory.list({ tenantId: TENANT_A, customerId: CUSTOMER }),
    ).toEqual([]);
  });

  it("contato sem pessoa vinculada não gera memória", async () => {
    await prisma.contact.update({
      where: { tenantId_id: { tenantId: TENANT_A, id: CONTACT_A } },
      data: { customerId: null, customerLinkedAt: null },
    });

    expect(
      await memory.recordTurnInference({
        tenantId: TENANT_A,
        conversationId: CONVERSATION_A,
        appointment: appointment({ desiredPeriod: "afternoon" }),
        evidence: CONFIRMADO,
        sourceMessageIds: ["message-1"],
        now: NOW,
      }),
    ).toEqual({ applied: 0, skipped: "customer_not_linked" });
    expect(
      await prisma.customerMemory.count({ where: { tenantId: TENANT_A } }),
    ).toBe(0);
  });
});
