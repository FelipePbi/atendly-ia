/**
 * Encaixe, override de disponibilidade, alteração de preço e desconto estão
 * **fora do alcance da IA** (Goal011, critério 6).
 *
 * No padrão do Goal010 (`import-out-of-reach.test.ts`): este arquivo existe
 * para falhar de verdade quando alguém acrescentar, no futuro, um caminho que
 * force um horário ocupado ou mexa em valor — e não para registrar que hoje
 * ninguém faz isso. São quatro provas independentes, cada uma fechando uma
 * porta diferente:
 *
 * 1. Nenhuma tool **se chama** encaixe, override, exceção ou desconto.
 * 2. O gateway do Scheduling é um dublê que **explode ao ser tocado** em
 *    qualquer membro desse vocabulário. Toda tool registrada é executada
 *    contra ele e os alcances são contados: sem a contagem, "ninguém tocou"
 *    seria verdade só porque ninguém chegou ao gateway.
 * 3. O que o modelo consegue **expressar**: mandar `discount`, `price`,
 *    `overlapOverride`, `overbook` ou `forceSlot` para qualquer tool é
 *    recusado na validação do argumento, não silenciosamente ignorado.
 * 4. O que chega ao Scheduling nos caminhos com efeito — criar, remarcar,
 *    cancelar, confirmar série — é inspecionado campo a campo: nenhum
 *    payload carrega override, encaixe, desconto ou preço.
 *
 * Não há asserção sobre a *descrição* das tools de propósito: algumas dizem
 * explicitamente "nunca cria exceção, bloqueio ou override", e proibir o
 * vocabulário no texto castigaria justamente a frase que protege a regra.
 * O que vale é o que a tool aceita e o que ela envia.
 */
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import type {
  SchedulingAppointment,
  SchedulingServiceDefinition,
} from "../../src/modules/scheduling-service/types.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

/**
 * Vocabulário de exceção em qualquer superfície: membro do gateway, nome de
 * tool, campo de argumento, campo de payload ou URL.
 *
 * Cobre encaixe/sobreposição, override de disponibilidade, alteração de preço
 * e desconto/cortesia. Nenhum membro real do `SchedulingGateway` casa com ele.
 */
const EXCEPTION_SURFACE =
  /overbook|overlap|encaixe|override|forcar|force|squeeze|discount|desconto|cortesia|waive|freeofcharge|setprice|updateprice|changeprice|customprice|adjustprice|pricechange|priceoverride/i;

/** Campos que o modelo poderia tentar inventar para forçar exceção. */
const FORBIDDEN_ARGS = {
  overlapOverride: true,
  overbook: true,
  forceSlot: true,
  discount: 50,
  price: 1,
};

const conversationId = "conversation-1";
const phone = "555591359589";
const firstTurn = "channel-1:message-1";
const secondTurn = "channel-1:message-2";

const service: SchedulingServiceDefinition = {
  id: "service-1",
  name: "Aplicacao 5D",
  duration: 60,
  priceType: "FIXED",
  price: 190,
  colorId: 1,
  recurrenceIntervalDays: null,
};
const slot = { date: "2026-06-08", startTime: "13:30", endTime: "14:30" };
const appointment: SchedulingAppointment = {
  id: "appointment-1",
  title: null,
  date: slot.date,
  startTime: slot.startTime,
  endTime: slot.endTime,
  duration: service.duration,
  customerId: "customer-1",
  customer: { id: "customer-1", name: "Thais", phone },
  services: [
    {
      serviceId: service.id,
      name: service.name,
      duration: service.duration,
      priceType: "FIXED",
      price: 190,
    },
  ],
  price: 190,
  totalPriceType: "FIXED",
  comments: null,
  status: "CONFIRMED",
  serviceId: service.id,
  serviceIds: [service.id],
  serviceName: service.name,
  customerName: "Thais",
};

function context(turnId = firstTurn) {
  return {
    conversationId,
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    turnId,
    phone,
    customerName: "Thais",
    businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
    aiRunId: "ai-run-1",
  };
}

/** Argumentos válidos por tool: sem eles a recusa do campo proibido seria vácuo. */
const VALID_ARGS: Record<string, Record<string, unknown>> = {
  list_services: { includePrices: true },
  get_availability: { serviceId: service.id, startDate: slot.date },
  create_appointment: {
    action: "prepare",
    serviceId: service.id,
    date: slot.date,
    startTime: slot.startTime,
    customerName: "Thais",
  },
  prepare_recurring_appointments: {
    serviceId: service.id,
    occurrenceCount: 2,
    intervalDays: 7,
    firstDate: slot.date,
    firstStartTime: slot.startTime,
  },
  confirm_recurring_appointments: {
    serviceId: service.id,
    holdIds: ["hold-series-0"],
    intervalDays: 7,
    customerName: "Thais",
  },
  list_customer_candidates: {},
  get_customer_context: { customerId: "customer-1" },
  list_customer_appointments: {},
  reschedule_appointment: {
    action: "prepare",
    appointmentId: appointment.id,
    date: "2026-06-09",
    startTime: "10:00",
  },
  cancel_appointment: { action: "prepare", appointmentId: appointment.id },
  request_human_handoff: { reason: "cliente pediu um encaixe" },
};

/**
 * Gateway dublê que falha se tocado num membro de exceção — inclusive num que
 * ainda não existe — e que registra os payloads dos caminhos com efeito.
 */
function createExceptionTrap() {
  const touched: string[] = [];
  const reached: string[] = [];
  const payloads: Array<{ member: string; input: unknown }> = [];
  const record = (member: string, input: unknown) => {
    payloads.push({ member, input });
  };
  const base: Record<string, unknown> = {
    listActiveServices: async () => [service],
    findService: async () => service,
    getAvailableSlotsForServices: async () => [slot],
    findCustomerCandidatesByPhone: async () => [],
    getAuthorizedCustomerContext: async () => null,
    findFutureAppointmentsForPhone: async () => [appointment],
    findFutureAppointmentsForCustomer: async () => [appointment],
    createHold: async (input: {
      date: string;
      startTime: string;
      serviceIds: string[];
    }) => {
      record("createHold", input);
      return {
        id: "hold-1",
        date: input.date,
        startTime: input.startTime,
        endTime: slot.endTime,
        duration: service.duration,
        serviceIds: input.serviceIds,
        expiresAt: "2026-06-08T13:45:00.000Z",
        status: "ACTIVE" as const,
      };
    },
    releaseHold: async () => undefined,
    createAppointment: async (input: unknown) => {
      record("createAppointment", input);
      return appointment;
    },
    rescheduleAppointment: async (input: unknown) => {
      record("rescheduleAppointment", input);
      return appointment;
    },
    cancelAppointment: async (appointmentId: string) => {
      record("cancelAppointment", { appointmentId });
      return { appointmentId, cancelled: true as const };
    },
    previewAppointmentSeries: async (input: {
      occurrenceCount: number;
      firstStartTime: string;
    }) => {
      record("previewAppointmentSeries", input);
      return Array.from({ length: input.occurrenceCount }, (_, index) => ({
        index,
        requestedDate: slot.date,
        date: slot.date,
        startTime: input.firstStartTime,
        endTime: slot.endTime,
        adjusted: false,
        holdId: `hold-series-${index}`,
        unavailable: false,
      }));
    },
    confirmAppointmentSeries: async (input: unknown) => {
      record("confirmAppointmentSeries", input);
      return [appointment];
    },
  };
  const gateway = new Proxy(base, {
    get(target, property) {
      const name = String(property);
      if (EXCEPTION_SURFACE.test(name)) {
        touched.push(name);
        throw new Error(
          `Uma tool da IA tocou um caminho de excecao do Scheduling: ${name}`,
        );
      }
      if (name in target) reached.push(name);
      return Reflect.get(target, property) as unknown;
    },
  }) as unknown as SchedulingGateway;
  return { gateway, touched, reached, payloads };
}

function createPrisma() {
  const store: { state: Record<string, unknown> } = { state: {} };
  return {
    contact: {
      findUnique: async () => null,
      updateMany: async () => ({ count: 1 }),
    },
    conversation: {
      findUnique: async () => ({ id: conversationId, state: store.state }),
      update: async (args: { data: { state?: Record<string, unknown> } }) => {
        if (args.data.state) store.state = args.data.state;
        return { id: conversationId, state: store.state };
      },
    },
    customerLink: { upsert: async () => ({}) },
    externalAppointment: {
      upsert: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    handoff: {
      findFirst: async () => null,
      create: async () => ({ id: "handoff-1" }),
    },
  } as unknown as PrismaClient;
}

/** Todas as chaves de um payload, em qualquer profundidade. */
function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

describe("excecao, encaixe, override e desconto fora do alcance da IA (Goal011, criterio 6)", () => {
  it("nenhuma tool registrada se chama encaixe, override, excecao ou desconto", () => {
    const { gateway } = createExceptionTrap();
    const registry = new AssistantToolRegistry(createPrisma(), gateway);

    const names = registry
      .createDefinitions(context())
      .map((definition) => definition.name);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).not.toMatch(EXCEPTION_SURFACE);
  });

  it("nenhuma tool registrada toca um caminho de excecao quando executada", async () => {
    const { gateway, touched, reached } = createExceptionTrap();
    const registry = new AssistantToolRegistry(createPrisma(), gateway);
    const definitions = registry.createDefinitions(context());

    for (const definition of definitions) {
      const result = await registry.execute(
        {
          id: `call-${definition.name}`,
          name: definition.name,
          args: VALID_ARGS[definition.name] ?? {},
        },
        context(),
      );
      expect(result.toolCallId).toBe(`call-${definition.name}`);
    }

    // Sem esta contagem, "ninguem tocou excecao" passaria mesmo que nenhuma
    // tool tivesse chegado ao gateway.
    expect(reached.length).toBeGreaterThan(0);
    expect(new Set(reached).size).toBeGreaterThan(3);
    expect(touched).toEqual([]);
  });

  it("nenhuma tool aceita override, encaixe, desconto ou preco no argumento", async () => {
    const { gateway } = createExceptionTrap();
    const registry = new AssistantToolRegistry(createPrisma(), gateway);
    const definitions = registry.createDefinitions(context());

    for (const definition of definitions) {
      // Os mesmos argumentos sem o campo proibido nao sao recusados pela
      // validacao: e isso que impede a assercao abaixo de ser vacuo.
      const accepted = await registry.execute(
        {
          id: `call-${definition.name}-baseline`,
          name: definition.name,
          args: VALID_ARGS[definition.name] ?? {},
        },
        context(),
      );
      expect({ tool: definition.name, accepted }).not.toMatchObject({
        tool: definition.name,
        accepted: { error: { code: "INVALID_TOOL_INPUT" } },
      });

      for (const [field, value] of Object.entries(FORBIDDEN_ARGS)) {
        const result = await registry.execute(
          {
            id: `call-${definition.name}-${field}`,
            name: definition.name,
            args: {
              ...(VALID_ARGS[definition.name] ?? {}),
              [field]: value,
            },
          },
          context(),
        );

        // INVALID_TOOL_INPUT e nao uma falha de dominio qualquer: a recusa
        // tem de vir da validacao do argumento, nao de um acaso do caminho.
        expect({ tool: definition.name, field, result }).toMatchObject({
          tool: definition.name,
          field,
          result: { ok: false, error: { code: "INVALID_TOOL_INPUT" } },
        });
      }
    }
  });

  it("nenhum payload com efeito carrega override, encaixe, desconto ou preco", async () => {
    const { gateway, payloads, touched } = createExceptionTrap();
    const registry = new AssistantToolRegistry(createPrisma(), gateway);

    // Fluxos completos: propor no turno 1, confirmar no turno 2.
    const flows: Array<[string, Record<string, unknown>, string]> = [
      ["create_appointment", VALID_ARGS.create_appointment, firstTurn],
      ["create_appointment", { action: "confirm" }, secondTurn],
      ["reschedule_appointment", VALID_ARGS.reschedule_appointment, firstTurn],
      ["reschedule_appointment", { action: "confirm" }, secondTurn],
      ["cancel_appointment", VALID_ARGS.cancel_appointment, firstTurn],
      ["cancel_appointment", { action: "confirm" }, secondTurn],
    ];
    for (const [name, args, turnId] of flows) {
      const result = await registry.execute(
        { id: `call-${name}-${turnId}`, name, args },
        context(turnId),
      );
      expect(result.ok).toBe(true);
    }

    const seriesPrisma = createPrisma();
    const seriesRegistry = new AssistantToolRegistry(seriesPrisma, gateway);
    for (const [args, turnId] of [
      [VALID_ARGS.prepare_recurring_appointments, firstTurn],
      [
        {
          ...VALID_ARGS.confirm_recurring_appointments,
          holdIds: ["hold-series-0", "hold-series-1"],
        },
        secondTurn,
      ],
    ] as const) {
      const name =
        turnId === firstTurn
          ? "prepare_recurring_appointments"
          : "confirm_recurring_appointments";
      const result = await seriesRegistry.execute(
        { id: `call-${name}`, name, args },
        context(turnId),
      );
      expect(result.ok).toBe(true);
    }

    // Os quatro caminhos com efeito precisam ter acontecido: sem isto a
    // inspecao de payload seria feita sobre uma lista vazia.
    const members = payloads.map((payload) => payload.member);
    for (const effect of [
      "createAppointment",
      "rescheduleAppointment",
      "cancelAppointment",
      "confirmAppointmentSeries",
    ]) {
      expect(members).toContain(effect);
    }
    expect(touched).toEqual([]);

    for (const payload of payloads) {
      for (const key of collectKeys(payload.input)) {
        // O membro entra na string so para nomear o payload culpado quando
        // este teste ficar vermelho.
        expect(`${payload.member}.${key}`).not.toMatch(EXCEPTION_SURFACE);
      }
    }
  });
});
