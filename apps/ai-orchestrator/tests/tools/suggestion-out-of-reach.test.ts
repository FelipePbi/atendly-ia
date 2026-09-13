/**
 * Sugestao de resposta ao atendimento humano (Goal012/WU-04): nenhuma tool com
 * efeito e oferecida ao modelo, e nada que ela chame pode criar Message, hold,
 * rascunho ou outbox.
 *
 * No padrao do Goal011 (`exception-out-of-reach.test.ts`): existe para falhar
 * de verdade se algum dia alguem ligar uma tool com efeito ao binding de
 * sugestao, e nao so para registrar que hoje ninguem faz isso.
 *
 * 1. O gateway do Scheduling e um dublê que **explode ao ser tocado** em
 *    qualquer membro com efeito — inclusive se o modelo tentar chamar uma tool
 *    de efeito por nome, que nem existe neste binding (defesa em profundidade).
 * 2. Os alcances de leitura sao contados, para que "nada com efeito foi
 *    tocado" nao seja verdade so porque nada foi tocado.
 * 3. O Prisma dublê explode se `Message.create` ou `Conversation.update` com
 *    `pendingAction` forem chamados: sugestao nao e turno, e nao pode nascer
 *    nem rascunho nem mensagem de saida.
 */
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { AssistantService } from "../../src/modules/assistant/assistant.service.js";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../../src/modules/model/model-provider.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import type { SchedulingServiceDefinition } from "../../src/modules/scheduling-service/types.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

const EFFECT_SURFACE =
  /createHold|releaseHold|createAppointment|rescheduleAppointment|cancelAppointment|previewAppointmentSeries|confirmAppointmentSeries/i;

const TENANT = "tenant-1";
const CONVERSATION_ID = "conversation-1";
const CHANNEL_ID = "channel-1";
const CONTACT_ID = "contact-1";
const CUSTOMER_ID = "customer-1";
const PHONE = "555591359589";

const service: SchedulingServiceDefinition = {
  id: "service-1",
  name: "Corte",
  duration: 60,
  priceType: "FIXED",
  price: 90,
  colorId: 1,
  recurrenceIntervalDays: null,
};
const slot = { date: "2026-06-08", startTime: "13:30", endTime: "14:30" };

/**
 * Gateway dublê que falha se tocado num membro com efeito — inclusive um
 * chamado pelo modelo por nome, mesmo que o binding de sugestao nunca o
 * ofereca — e que conta os alcances de leitura.
 */
function createEffectTrap() {
  const touched: string[] = [];
  const reached: string[] = [];
  const base: Record<string, unknown> = {
    listActiveServices: async () => [service],
    findService: async () => service,
    getAvailableSlotsForServices: async () => [slot],
    findCustomerCandidatesByPhone: async () => [],
    getAuthorizedCustomerContext: async () => ({
      name: "Thais",
      notes: ["Prefere corte curto"],
      tags: ["fiel"],
    }),
    findFutureAppointmentsForPhone: async () => [],
    findFutureAppointmentsForCustomer: async () => [],
  };
  const gateway = new Proxy(base, {
    get(target, property) {
      const name = String(property);
      if (EFFECT_SURFACE.test(name)) {
        touched.push(name);
        throw new Error(
          `Uma tool do modo sugestao tocou um caminho com efeito do Scheduling: ${name}`,
        );
      }
      if (name in target) reached.push(name);
      return Reflect.get(target, property) as unknown;
    },
  }) as unknown as SchedulingGateway;
  return { gateway, touched, reached };
}

/**
 * Prisma dublê que falha se `Message.create` ou `Conversation.update` com
 * `pendingAction` forem chamados: sugestao nunca pode gerar nenhum dos dois.
 */
function createPrisma(
  overrides: {
    contactIgnored?: boolean;
    contactCategoryOverride?: string | null;
    sessionCategory?: string;
    humanHandling?: boolean;
    conversationHumanHandoff?: boolean;
    aiEnabled?: boolean;
  } = {},
) {
  const state: Record<string, unknown> = {};
  const conversationUpdates: Array<Record<string, unknown>> = [];
  const aiRuns: Array<{ id: string; data: Record<string, unknown> }> = [];
  let aiRunSequence = 0;

  const prisma = {
    conversation: {
      findFirst: async () => ({
        id: CONVERSATION_ID,
        channelId: CHANNEL_ID,
        contactId: CONTACT_ID,
        externalContactId: PHONE,
        humanHandoff: overrides.conversationHumanHandoff ?? true,
        state,
      }),
      findUnique: async () => ({ id: CONVERSATION_ID, state }),
      update: async (args: { data: Record<string, unknown> }) => {
        conversationUpdates.push(args.data);
        const nextState = args.data.state as
          | Record<string, unknown>
          | undefined;
        if (nextState && "pendingAction" in nextState) {
          throw new Error(
            "Sugestao nunca pode criar pendingAction: nao ha turno para confirmar depois.",
          );
        }
        if (nextState) Object.assign(state, nextState);
        return { id: CONVERSATION_ID, state };
      },
    },
    contact: {
      findUnique: async () => ({
        ignored: overrides.contactIgnored ?? false,
        categoryOverride: overrides.contactCategoryOverride ?? null,
        customerId: CUSTOMER_ID,
      }),
    },
    conversationSession: {
      findFirst: async () => ({
        category: overrides.sessionCategory ?? "COMMERCIAL",
        humanHandling: overrides.humanHandling ?? true,
      }),
    },
    aiTenantConfig: {
      findUnique: async () => ({
        enabled: overrides.aiEnabled ?? true,
        tone: "BALANCED",
        settings: { configured: true },
      }),
    },
    message: {
      findMany: async () => [
        {
          id: "message-1",
          direction: "INBOUND",
          role: "user",
          body: "Quanto custa o corte e voces tem horario amanha?",
          createdAt: new Date("2026-06-08T09:00:00.000Z"),
        },
      ],
      create: async () => {
        throw new Error(
          "Sugestao nunca pode criar Message: nao existe caminho de envio aqui.",
        );
      },
    },
    aiRun: {
      create: async (args: { data: Record<string, unknown> }) => {
        aiRunSequence += 1;
        const id = `ai-run-${aiRunSequence}`;
        aiRuns.push({ id, data: args.data });
        return { id, ...args.data };
      },
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => ({ id: args.where.id, ...args.data }),
    },
  } as unknown as PrismaClient;

  return { prisma, conversationUpdates, aiRuns };
}

/**
 * Modelo dublê: no primeiro turno chama as quatro tools de leitura do binding
 * de sugestao mais uma tool com efeito por nome (defesa em profundidade — ela
 * nem existe neste binding); no segundo turno devolve as sugestoes.
 */
function createModelProvider(): {
  provider: ModelProvider;
  requests: ModelRequest[];
} {
  const requests: ModelRequest[] = [];
  let turn = 0;
  return {
    requests,
    provider: {
      async invoke(request): Promise<ModelResponse> {
        requests.push(request);
        turn += 1;
        if (turn === 1) {
          return {
            id: "response-1",
            text: "",
            toolCalls: [
              { id: "call-1", name: "list_services", args: {} },
              {
                id: "call-2",
                name: "get_availability",
                args: { serviceId: service.id, startDate: slot.date },
              },
              {
                id: "call-3",
                name: "get_customer_context",
                args: { customerId: CUSTOMER_ID },
              },
              { id: "call-4", name: "list_customer_appointments", args: {} },
              {
                id: "call-5",
                name: "create_appointment",
                args: {
                  action: "prepare",
                  serviceId: service.id,
                  date: slot.date,
                  startTime: slot.startTime,
                  customerName: "Thais",
                },
              },
            ],
            continuation: null,
          };
        }
        return {
          id: "response-2",
          text: JSON.stringify({
            suggestions: [
              "Oi! Temos horario amanha as 13h30 para o corte.",
              "Posso confirmar o valor certinho: R$ 90.",
            ],
          }),
          toolCalls: [],
          continuation: null,
        };
      },
    },
  };
}

describe("sugestao ao atendimento humano: sem tool com efeito e sem Message/pendingAction (Goal012/WU-04)", () => {
  it("o binding de sugestao expoe somente as quatro tools de leitura", () => {
    const { gateway } = createEffectTrap();
    const { prisma } = createPrisma();
    const tools = new AssistantToolRegistry(prisma, gateway);

    const names = tools
      .createReadOnlyDefinitions({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT,
        channelId: CHANNEL_ID,
        userId: "user-1",
        requestId: "request-1",
        turnId: "suggestion:ai-run-1",
        phone: PHONE,
        businessContext: { configured: true } as never,
        aiRunId: "ai-run-1",
      })
      .map((definition) => definition.name)
      .sort();

    expect(names).toEqual([
      "get_availability",
      "get_customer_context",
      "list_customer_appointments",
      "list_services",
    ]);
  });

  it("gera ate 3 sugestoes sem tocar nenhum caminho com efeito e sem criar Message ou pendingAction", async () => {
    const { gateway, touched, reached } = createEffectTrap();
    const { prisma, conversationUpdates, aiRuns } = createPrisma();
    const { provider: modelProvider } = createModelProvider();
    const tools = new AssistantToolRegistry(prisma, gateway);
    const service_ = new AssistantService(
      prisma,
      undefined,
      modelProvider,
      tools,
    );

    const result = await service_.generateSuggestions({
      tenantId: TENANT,
      conversationId: CONVERSATION_ID,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
    for (const suggestion of result.suggestions) {
      expect(suggestion.trim().length).toBeGreaterThan(0);
    }

    // Sem esta contagem, "nenhum efeito tocado" passaria mesmo que nenhuma
    // tool de leitura tivesse chegado ao gateway.
    expect(reached.length).toBeGreaterThan(0);
    expect(new Set(reached).size).toBeGreaterThan(3);
    expect(touched).toEqual([]);

    // Nenhum rascunho: toda escrita de estado feita pela tool de leitura
    // (cache de disponibilidade) precisa ter passado por aqui sem pendingAction.
    for (const update of conversationUpdates) {
      expect(update).not.toHaveProperty("pendingAction");
      const state = update.state as Record<string, unknown> | undefined;
      expect(state?.pendingAction).toBeUndefined();
    }

    expect(aiRuns).toHaveLength(1);
    expect(aiRuns[0]?.data).toMatchObject({ kind: "SUGGESTION" });
    expect(result.aiRunId).toBe(aiRuns[0]?.id);
  });

  it("mesmo que o modelo tente chamar uma tool com efeito por nome, ela nao existe no binding de sugestao", async () => {
    const { gateway, touched } = createEffectTrap();
    const { prisma } = createPrisma();
    const tools = new AssistantToolRegistry(prisma, gateway);

    const executed = await tools.executeReadOnly(
      { id: "call-5", name: "create_appointment", args: { action: "prepare" } },
      {
        conversationId: CONVERSATION_ID,
        tenantId: TENANT,
        channelId: CHANNEL_ID,
        userId: "user-1",
        requestId: "request-1",
        turnId: "suggestion:ai-run-1",
        phone: PHONE,
        businessContext: { configured: true } as never,
        aiRunId: "ai-run-1",
      },
    );

    expect(executed.ok).toBe(false);
    if (executed.ok) return;
    expect(executed.error.code).toBe("UNKNOWN_TOOL");
    expect(touched).toEqual([]);
  });
});

describe("sugestao ao atendimento humano: as quatro recusas proprias (Goal012/WU-04)", () => {
  /**
   * Cada teste aciona a porta de entrada real de `generateSuggestions`, nunca
   * um dublê do resultado: e a implementacao que decide a recusa, e nenhuma
   * delas pode chegar a chamar o modelo ou criar `AiRun`.
   */
  async function runWithOverrides(
    overrides: Parameters<typeof createPrisma>[0],
  ) {
    const { gateway } = createEffectTrap();
    const { prisma, aiRuns } = createPrisma(overrides);
    const { provider: modelProvider, requests } = createModelProvider();
    const tools = new AssistantToolRegistry(prisma, gateway);
    const service_ = new AssistantService(
      prisma,
      undefined,
      modelProvider,
      tools,
    );
    const result = await service_.generateSuggestions({
      tenantId: TENANT,
      conversationId: CONVERSATION_ID,
      userId: "user-1",
      requestId: "request-1",
    });
    return { result, aiRuns, requests };
  }

  it("CONTACT_IGNORED: contato ignorado recusa antes de qualquer leitura de conteudo", async () => {
    const { result, aiRuns, requests } = await runWithOverrides({
      contactIgnored: true,
    });

    expect(result).toEqual({ ok: false, reason: "CONTACT_IGNORED" });
    expect(aiRuns).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });

  it("SESSION_PERSONAL: sessao pessoal recusa mesmo com atendimento humano vigente", async () => {
    const { result, aiRuns, requests } = await runWithOverrides({
      sessionCategory: "PERSONAL",
    });

    expect(result).toEqual({ ok: false, reason: "SESSION_PERSONAL" });
    expect(aiRuns).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });

  it("SESSION_PERSONAL: override manual do contato tambem recusa, mesmo se a sessao ainda nao tiver sincronizado a categoria", async () => {
    const { result, aiRuns, requests } = await runWithOverrides({
      contactCategoryOverride: "PERSONAL",
      sessionCategory: "COMMERCIAL",
    });

    expect(result).toEqual({ ok: false, reason: "SESSION_PERSONAL" });
    expect(aiRuns).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });

  it("HUMAN_HANDLING_REQUIRED: sem atendimento humano vigente (sessao e handoff) nao ha para quem sugerir", async () => {
    const { result, aiRuns, requests } = await runWithOverrides({
      humanHandling: false,
      conversationHumanHandoff: false,
    });

    expect(result).toEqual({ ok: false, reason: "HUMAN_HANDLING_REQUIRED" });
    expect(aiRuns).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });

  it("AI_DISABLED: negocio com a IA desligada recusa mesmo com atendimento humano vigente", async () => {
    const { result, aiRuns, requests } = await runWithOverrides({
      aiEnabled: false,
    });

    expect(result).toEqual({ ok: false, reason: "AI_DISABLED" });
    expect(aiRuns).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });
});
