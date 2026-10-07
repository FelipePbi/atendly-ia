import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { CustomerMemoryService } from "../../src/modules/memory/customer-memory-service.js";
import { CustomerSummaryService } from "../../src/modules/memory/customer-summary-service.js";
import type { TurnAppointmentEvidence } from "../../src/modules/memory/memory-inference.js";
import type { ModelProvider } from "../../src/modules/model/model-provider.js";
import { normalizeBusinessContext } from "../../src/modules/tenant-config/business-context.js";
import {
  type ContactRow,
  fakeMemoryPrisma,
  type FakeMemoryWorld,
  memoryRow,
} from "./fake-memory-prisma.js";

const TENANT = "tenant-a";
const MARIA = "customer-maria";
const PEDRO = "customer-pedro";
const ANA = "customer-ana";
const NOW = new Date("2026-10-07T12:00:00.000Z");

const CONFIRMADO: TurnAppointmentEvidence = {
  appointmentConfirmed: true,
  recurringSeriesConfirmed: false,
};
const SERIE_CONFIRMADA: TurnAppointmentEvidence = {
  appointmentConfirmed: true,
  recurringSeriesConfirmed: true,
};

/** O número da Maria: ela escreve (`customerId`) e acabou de agendar o Pedro. */
function contact(overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    id: "contact-maria",
    tenantId: TENANT,
    ignored: false,
    customerId: MARIA,
    lastScheduledCustomerId: PEDRO,
    lastScheduledAt: NOW,
    categoryOverride: null,
    ...overrides,
  };
}

function world(overrides: Partial<FakeMemoryWorld> = {}): FakeMemoryWorld {
  return {
    memories: [],
    contacts: [contact()],
    conversations: [
      {
        id: "conversation-maria",
        tenantId: TENANT,
        contactId: "contact-maria",
      },
    ],
    sessions: [],
    ...overrides,
  };
}

function memoryService(initial: Partial<FakeMemoryWorld> = {}) {
  const { state, prisma } = fakeMemoryPrisma(world(initial));
  return {
    state,
    memory: new CustomerMemoryService(prisma, {
      staleDays: 180,
      promptLimit: 12,
    }),
  };
}

function infer(
  subject: ReturnType<typeof memoryService>,
  evidence: TurnAppointmentEvidence,
) {
  return subject.memory.recordTurnInference({
    tenantId: TENANT,
    conversationId: "conversation-maria",
    appointment: {
      desiredPeriod: "afternoon",
      services: [
        {
          serviceId: "svc-1",
          name: "Limpeza de pele",
          durationMinutes: 60,
          price: 120,
        },
      ],
    },
    evidence,
    sourceMessageIds: ["message-1"],
    now: NOW,
  });
}

describe("Goal146 — memória inferida vai para a última pessoa agendada", () => {
  it("depois da confirmação para o Pedro, a memória inferida é do Pedro", async () => {
    const subject = memoryService();

    const outcome = await infer(subject, CONFIRMADO);

    expect(outcome.applied).toBeGreaterThan(0);
    expect(subject.state.memories.length).toBeGreaterThan(0);
    expect(
      subject.state.memories.every((row) => row.customerId === PEDRO),
    ).toBe(true);
  });

  it("depois da série do Pedro, a memória inferida também é do Pedro", async () => {
    const subject = memoryService();

    const outcome = await infer(subject, SERIE_CONFIRMADA);

    expect(outcome.applied).toBeGreaterThan(0);
    expect(subject.state.memories.map((row) => row.customerId)).not.toContain(
      MARIA,
    );
    expect(
      subject.state.memories.every((row) => row.customerId === PEDRO),
    ).toBe(true);
  });

  it("agendamento da própria Maria grava a memória na Maria", async () => {
    const subject = memoryService({
      contacts: [contact({ lastScheduledCustomerId: MARIA })],
    });

    await infer(subject, CONFIRMADO);

    expect(
      subject.state.memories.every((row) => row.customerId === MARIA),
    ).toBe(true);
  });

  it("sem lastScheduledCustomerId o motivo continua customer_not_linked, mesmo com vínculo", async () => {
    const subject = memoryService({
      contacts: [contact({ lastScheduledCustomerId: null })],
    });

    expect(await infer(subject, CONFIRMADO)).toEqual({
      applied: 0,
      skipped: "customer_not_linked",
    });
    expect(subject.state.memories).toHaveLength(0);
  });

  it("loadForPrompt lê a memória de quem escreve, não a da última pessoa agendada", async () => {
    const subject = memoryService({
      memories: [
        memoryRow({
          id: "da-maria",
          customerId: MARIA,
          kind: "OBSERVATION",
          value: "prefere cafe sem acucar",
        }),
        memoryRow({
          id: "do-pedro",
          customerId: PEDRO,
          kind: "OBSERVATION",
          value: "alergia a latex",
        }),
      ],
    });

    const items = await subject.memory.loadForPrompt({
      tenantId: TENANT,
      contactId: "contact-maria",
      now: NOW,
    });

    expect(items.map((item) => item.value)).toEqual([
      "prefere cafe sem acucar",
    ]);
  });
});

interface AiRunRow {
  id: string;
  conversationId: string;
  channelId: string;
}

function summaryService(initial: Partial<FakeMemoryWorld>) {
  const { prisma } = fakeMemoryPrisma(world(initial));
  const runs: AiRunRow[] = [];
  const withRuns = {
    ...(prisma as unknown as Record<string, unknown>),
    conversation: {
      findFirst: async ({ where }: { where: { contactId: string } }) => {
        const conversation = (
          initial.conversations ?? world().conversations
        ).find((row) => row.contactId === where.contactId);
        return conversation
          ? { id: conversation.id, channelId: "channel-1" }
          : null;
      },
    },
    aiRun: {
      create: async ({ data }: { data: Omit<AiRunRow, "id"> }) => {
        const row = { ...data, id: `run-${runs.length + 1}` };
        runs.push(row);
        return { ...row };
      },
      update: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
      }),
    },
  } as unknown as PrismaClient;

  const model: ModelProvider = {
    async invoke() {
      return {
        id: "model-1",
        text: "Resumo.",
        toolCalls: [],
        continuation: null,
      };
    },
  };
  const service = new CustomerSummaryService(
    withRuns,
    { loadAllowedForCustomer: async () => [] },
    {
      async getAuthorizedCustomerContext(customerId: string) {
        return {
          id: customerId,
          name: "Pessoa",
          notes: [],
          tags: [],
        } as never;
      },
      async findFutureAppointmentsForCustomer() {
        return [];
      },
    },
    model,
  );
  return { runs, service };
}

function generate(
  subject: ReturnType<typeof summaryService>,
  customerId: string,
) {
  return subject.service.generate({
    tenantId: TENANT,
    userId: "user-1",
    requestId: "request-1",
    customerId,
    businessContext: normalizeBusinessContext({}),
  });
}

describe("Goal146 — âncora do resumo", () => {
  const twoContacts = {
    contacts: [
      contact(),
      contact({
        id: "contact-joao",
        customerId: "customer-joao",
        lastScheduledCustomerId: "customer-joao",
      }),
    ],
    conversations: [
      {
        id: "conversation-maria",
        tenantId: TENANT,
        contactId: "contact-maria",
      },
      { id: "conversation-joao", tenantId: TENANT, contactId: "contact-joao" },
    ],
  };

  it("o resumo do Pedro, sem contato com customerId = Pedro, ancora na conversa da Maria", async () => {
    const subject = summaryService(twoContacts);

    const result = await generate(subject, PEDRO);

    expect(result.customerId).toBe(PEDRO);
    expect(subject.runs).toHaveLength(1);
    expect(subject.runs[0]?.conversationId).toBe("conversation-maria");
  });

  it("a Maria ancora no contato vinculado a ela", async () => {
    const subject = summaryService(twoContacts);

    await generate(subject, MARIA);

    expect(subject.runs[0]?.conversationId).toBe("conversation-maria");
  });

  it("o vínculo vence a última pessoa agendada quando os dois existem", async () => {
    const subject = summaryService({
      contacts: [
        contact(),
        contact({
          id: "contact-pedro",
          customerId: PEDRO,
          lastScheduledCustomerId: PEDRO,
        }),
      ],
      conversations: [
        {
          id: "conversation-maria",
          tenantId: TENANT,
          contactId: "contact-maria",
        },
        {
          id: "conversation-pedro",
          tenantId: TENANT,
          contactId: "contact-pedro",
        },
      ],
    });

    await generate(subject, PEDRO);

    expect(subject.runs[0]?.conversationId).toBe("conversation-pedro");
  });

  it("a Ana, sem nenhum dos dois campos, dá CUSTOMER_NOT_LINKED", async () => {
    const subject = summaryService(twoContacts);

    await expect(generate(subject, ANA)).rejects.toMatchObject({
      code: "CUSTOMER_NOT_LINKED",
      statusCode: 404,
    });
    expect(subject.runs).toHaveLength(0);
  });
});
