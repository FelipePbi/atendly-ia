import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { CustomerSummaryService } from "../../src/modules/memory/customer-summary-service.js";
import type {
  ModelProvider,
  ModelRequest,
} from "../../src/modules/model/model-provider.js";
import { deriveSummaryPromptVersion } from "../../src/modules/prompts/summary.js";
import type { SchedulingAppointment } from "../../src/modules/scheduling-service/types.js";
import { normalizeBusinessContext } from "../../src/modules/tenant-config/business-context.js";
import { CustomerMemoryService } from "../../src/modules/memory/customer-memory-service.js";
import { fakeMemoryPrisma, memoryRow } from "./fake-memory-prisma.js";

const TENANT = "tenant-a";
const CUSTOMER = "customer-1";

interface AiRunRow {
  id: string;
  tenantId: string;
  channelId: string;
  conversationId: string;
  promptVersion: string;
  kind: string;
  status: string;
  outputText: string | null;
}

/**
 * Prisma em dobro com o que o resumo toca: o contato vinculado, a conversa onde
 * o `AiRun` fica e o próprio `AiRun`. Nenhuma tabela de nota ou tag existe aqui
 * de propósito — se o resumo tentasse ler nota por fora do `ai-context`, o
 * teste quebraria por ausência da tabela, não por asserção.
 */
function fakePrisma(
  options: { linked?: boolean; conversation?: boolean } = {},
) {
  const runs: AiRunRow[] = [];
  const writes: string[] = [];
  let sequence = 0;

  const prisma = {
    contact: {
      findFirst: async () =>
        options.linked === false
          ? null
          : { id: "contact-1", tenantId: TENANT, customerId: CUSTOMER },
    },
    conversation: {
      findFirst: async () =>
        options.conversation === false
          ? null
          : { id: "conversation-1", channelId: "channel-1" },
    },
    aiRun: {
      create: async ({ data }: { data: Omit<AiRunRow, "id" | "status"> }) => {
        sequence += 1;
        const row: AiRunRow = {
          ...data,
          id: `run-${sequence}`,
          status: "STARTED",
          outputText: null,
        };
        runs.push(row);
        writes.push("aiRun.create");
        return { ...row };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<AiRunRow>;
      }) => {
        const row = runs.find((item) => item.id === where.id);
        if (!row) throw new Error("AiRun not found");
        Object.assign(row, data);
        writes.push("aiRun.update");
        return { ...row };
      },
    },
  };

  return { runs, writes, prisma: prisma as unknown as PrismaClient };
}

function recordingModel(text = "Cliente prefere a tarde.") {
  const requests: ModelRequest[] = [];
  const provider: ModelProvider = {
    async invoke(request) {
      requests.push(request);
      return { id: "model-1", text, toolCalls: [], continuation: null };
    },
  };
  return { requests, provider };
}

function appointment(
  overrides: Partial<SchedulingAppointment> = {},
): SchedulingAppointment {
  return {
    id: "appointment-1",
    title: null,
    date: "2026-09-20",
    startTime: "14:00",
    endTime: "15:00",
    duration: 60,
    customerId: CUSTOMER,
    customer: null,
    services: [],
    price: null,
    totalPriceType: "FIXED",
    comments: "comentario interno do atendimento",
    status: "SCHEDULED",
    serviceId: "svc-1",
    serviceIds: ["svc-1"],
    serviceName: "Limpeza de pele",
    customerName: "Ana",
    ...overrides,
  };
}

function buildService(options: {
  memory?: Array<{
    kind: string;
    value: string;
    origin: "AI_INFERRED" | "PROFESSIONAL" | "CUSTOMER_STATED";
    ageDays: number;
    stale: boolean;
  }>;
  notes?: string[];
  tags?: string[];
  appointments?: SchedulingAppointment[];
  prismaOptions?: { linked?: boolean; conversation?: boolean };
  text?: string;
}) {
  const db = fakePrisma(options.prismaOptions);
  const model = recordingModel(options.text);
  const schedulingCalls: string[] = [];

  const service = new CustomerSummaryService(
    db.prisma,
    {
      async loadAllowedForCustomer() {
        return options.memory ?? [];
      },
    },
    {
      async getAuthorizedCustomerContext(customerId: string) {
        schedulingCalls.push(`ai-context:${customerId}`);
        return {
          id: customerId,
          name: "Ana",
          phone: "5511999999999",
          notes: options.notes ?? [],
          tags: options.tags ?? [],
          primaryGuardian: null,
        };
      },
      async findFutureAppointmentsForCustomer(customerId: string) {
        schedulingCalls.push(`appointments:${customerId}`);
        return options.appointments ?? [];
      },
    },
    model.provider,
  );

  return { service, db, model, schedulingCalls };
}

function generate(subject: ReturnType<typeof buildService>) {
  return subject.service.generate({
    tenantId: TENANT,
    userId: "user-1",
    requestId: "request-1",
    customerId: CUSTOMER,
    businessContext: normalizeBusinessContext(undefined),
  });
}

describe("resumo do cliente", () => {
  it("monta o prompt só com memória permitida, notas e tags autorizadas e próximos atendimentos", async () => {
    const subject = buildService({
      memory: [
        {
          kind: "PREFERRED_PERIOD",
          value: "tarde",
          origin: "AI_INFERRED",
          ageDays: 5,
          stale: false,
        },
      ],
      notes: ["Nota autorizada da cliente"],
      tags: ["vip"],
      appointments: [appointment()],
    });

    const result = await generate(subject);

    const prompt = subject.model.requests[0]?.instructions ?? "";
    expect(prompt).toContain("tarde");
    expect(prompt).toContain("Nota autorizada da cliente");
    expect(prompt).toContain("vip");
    expect(prompt).toContain("2026-09-20 14:00");
    expect(prompt).toContain("Limpeza de pele");
    expect(result.sources).toEqual({
      memory: 1,
      notes: 1,
      tags: 1,
      upcomingAppointments: 1,
    });
  });

  it("nota, tag ou memória não autorizada nunca chega ao dublê do modelo", async () => {
    // O material não autorizado simplesmente não existe nas portas: o
    // `ai-context` já devolve só o que a pessoa liberou, e a memória chega
    // filtrada por `aiAllowed`. O teste prova que o resumo não tem nenhuma
    // outra fonte por onde ele possa vazar.
    const subject = buildService({
      memory: [],
      notes: [],
      tags: [],
      appointments: [],
    });

    await generate(subject);

    const prompt = subject.model.requests[0]?.instructions ?? "";
    expect(prompt).toContain("Nenhuma memoria autorizada.");
    expect(prompt).toContain("Nenhuma observacao autorizada.");
    expect(prompt).toContain("Nenhuma tag autorizada.");
    expect(subject.schedulingCalls).toEqual([
      `ai-context:${CUSTOMER}`,
      `appointments:${CUSTOMER}`,
    ]);
  });

  it("memória negada, removida ou substituída nunca aparece no prompt recebido pelo dublê", async () => {
    // Aqui a porta de memória é o serviço **real**, sobre o banco em dobro: o
    // filtro de autorização é exercitado, não simulado.
    const memoryDb = fakeMemoryPrisma({
      memories: [
        memoryRow({
          id: "permitida",
          value: "prefere a tarde",
          aiAllowed: true,
        }),
        memoryRow({
          id: "negada",
          kind: "OBSERVATION",
          value: "segredo nao autorizado",
          aiAllowed: false,
        }),
        memoryRow({
          id: "removida",
          kind: "OBSERVATION",
          value: "memoria removida pela profissional",
          aiAllowed: true,
          removedAt: new Date("2026-09-01T12:00:00.000Z"),
        }),
        memoryRow({
          id: "substituida",
          kind: "OBSERVATION",
          value: "preferencia antiga contrariada",
          aiAllowed: true,
          supersededById: "permitida",
        }),
      ],
    });
    const db = fakePrisma();
    const model = recordingModel();
    const service = new CustomerSummaryService(
      db.prisma,
      new CustomerMemoryService(memoryDb.prisma, {
        staleDays: 180,
        promptLimit: 12,
      }),
      {
        async getAuthorizedCustomerContext(customerId: string) {
          return {
            id: customerId,
            name: "Ana",
            phone: null,
            notes: ["Nota autorizada"],
            tags: ["vip"],
            primaryGuardian: null,
          };
        },
        async findFutureAppointmentsForCustomer() {
          return [appointment()];
        },
      },
      model.provider,
    );

    await service.generate({
      tenantId: TENANT,
      userId: "user-1",
      requestId: "request-1",
      customerId: CUSTOMER,
      businessContext: normalizeBusinessContext(undefined),
    });

    const prompt = model.requests[0]?.instructions ?? "";
    expect(prompt).toContain("prefere a tarde");
    expect(prompt).not.toContain("segredo nao autorizado");
    expect(prompt).not.toContain("memoria removida pela profissional");
    expect(prompt).not.toContain("preferencia antiga contrariada");
    // Comentário interno do atendimento não é material autorizado do resumo.
    expect(prompt).not.toContain("comentario interno do atendimento");
  });

  it("não oferece nenhuma tool ao modelo: o resumo não tem caminho de efeito", async () => {
    const subject = buildService({});

    await generate(subject);

    expect(subject.model.requests[0]?.tools).toEqual([]);
    expect(subject.model.requests[0]?.turns).toEqual([]);
  });

  it("registra AiRun com kind SUMMARY e a versão do prompt de resumo", async () => {
    const subject = buildService({ text: "Resumo curto." });

    const result = await generate(subject);

    expect(result.promptVersion).toBe(deriveSummaryPromptVersion());
    expect(subject.db.runs).toHaveLength(1);
    expect(subject.db.runs[0]).toMatchObject({
      kind: "SUMMARY",
      promptVersion: deriveSummaryPromptVersion(),
      status: "SUCCEEDED",
      outputText: "Resumo curto.",
    });
    expect(result.summary).toBe("Resumo curto.");
  });

  it("o resumo não é persistido como verdade: a única escrita é o AiRun de auditoria", async () => {
    const subject = buildService({
      memory: [
        {
          kind: "OBSERVATION",
          value: "observacao permitida",
          origin: "PROFESSIONAL",
          ageDays: 1,
          stale: false,
        },
      ],
    });

    await generate(subject);

    expect(subject.db.writes).toEqual(["aiRun.create", "aiRun.update"]);
  });

  it("o prompt embute a versão que volta ao chamador", async () => {
    const subject = buildService({});

    const result = await generate(subject);

    expect(subject.model.requests[0]?.instructions).toContain(
      `Versao do prompt: ${result.promptVersion}`,
    );
  });

  it("recusa pessoa sem contato vinculado: memória do cliente só existe para pessoa vinculada", async () => {
    const subject = buildService({ prismaOptions: { linked: false } });

    await expect(generate(subject)).rejects.toMatchObject({
      code: "CUSTOMER_NOT_LINKED",
      statusCode: 404,
    });
    expect(subject.model.requests).toHaveLength(0);
  });

  it("recusa quando não há conversa onde ancorar o AiRun: resumo sem auditoria não é gerado", async () => {
    const subject = buildService({ prismaOptions: { conversation: false } });

    await expect(generate(subject)).rejects.toMatchObject({
      code: "SUMMARY_NOT_AUDITABLE",
      statusCode: 409,
    });
    // A recusa acontece antes da chamada de modelo: nenhum resumo real foi
    // gerado fora do registro.
    expect(subject.model.requests).toHaveLength(0);
    expect(subject.db.runs).toHaveLength(0);
    expect(subject.db.writes).toEqual([]);
  });

  it("marca o AiRun como falho quando o modelo falha", async () => {
    const db = fakePrisma();
    const service = new CustomerSummaryService(
      db.prisma,
      {
        async loadAllowedForCustomer() {
          return [];
        },
      },
      {
        async getAuthorizedCustomerContext(customerId: string) {
          return {
            id: customerId,
            name: null,
            phone: null,
            notes: [],
            tags: [],
            primaryGuardian: null,
          };
        },
        async findFutureAppointmentsForCustomer() {
          return [];
        },
      },
      {
        async invoke() {
          throw new Error("modelo indisponivel");
        },
      },
    );

    await expect(
      service.generate({
        tenantId: TENANT,
        userId: "user-1",
        requestId: "request-1",
        customerId: CUSTOMER,
        businessContext: normalizeBusinessContext(undefined),
      }),
    ).rejects.toThrow("modelo indisponivel");
    expect(db.runs[0]?.status).toBe("FAILED");
  });
});
