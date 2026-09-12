/**
 * Importação única (Goal010, critério 8): **nenhuma tool da IA inicia,
 * executa ou conclui importação**.
 *
 * Este arquivo existe para falhar de verdade quando alguém acrescentar, no
 * futuro, uma tool que toque o caminho de importação — e não para registrar
 * que hoje ninguém toca. São três provas independentes, porque cada uma
 * fecha uma porta diferente:
 *
 * 1. O registro de tools é comparado com a lista vigente. Tool nova quebra
 *    aqui e obriga quem a criou a declarar que ela não importa nada.
 * 2. O gateway do Scheduling é um **dublê que explode ao ser tocado** em
 *    qualquer membro de importação/migração: toda tool registrada é
 *    executada contra ele, então uma tool futura que chamasse
 *    `scheduling.startImport(...)` derrubaria esta suíte.
 * 3. O `fetch` global é um dublê que registra toda URL pedida: uma tool que
 *    contornasse o gateway e falasse HTTP direto com as rotas de importação
 *    apareceria na lista de URLs e quebraria a asserção.
 *
 * A importação é humana por definição (BFF, `requireHumanCaller`); a IA não
 * tem contrato de importação de lado nenhum.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

/** Vocabulário da importação em qualquer superfície: membro, URL ou texto. */
const IMPORT_SURFACE = /import|migrat/i;

/**
 * As tools que a IA tem hoje. A lista é literal de propósito: é ela que
 * transforma "apareceu uma tool nova" em um vermelho, em vez de deixar a
 * novidade passar despercebida.
 */
const REGISTERED_TOOLS = [
  "list_services",
  "get_availability",
  "create_appointment",
  "prepare_recurring_appointments",
  "confirm_recurring_appointments",
  "list_customer_candidates",
  "get_customer_context",
  "list_customer_appointments",
  "reschedule_appointment",
  "cancel_appointment",
  "request_human_handoff",
];

function context() {
  return {
    conversationId: "conversation-1",
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    phone: "555591359589",
    customerName: "Thais",
    businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
    aiRunId: "ai-run-1",
  };
}

/**
 * Gateway mínimo do Scheduling. Qualquer acesso a um membro de importação ou
 * migração — inclusive um que ainda não existe — lança: é o dublê que falha
 * se for chamado.
 */
function createImportTrap() {
  const touched: string[] = [];
  const reached: string[] = [];
  const base: Record<string, unknown> = {
    listActiveServices: async () => [],
    findService: async () => {
      throw new Error("service not found");
    },
    getAvailableSlotsForServices: async () => [],
    createAppointment: async () => {
      throw new Error("not scheduled in this test");
    },
    findFutureAppointmentsForPhone: async () => [],
    findFutureAppointmentsForCustomer: async () => [],
    findCustomerCandidatesByPhone: async () => [],
    getAuthorizedCustomerContext: async () => null,
    cancelAppointment: async () => ({ id: "appointment-1" }),
    rescheduleAppointment: async () => ({ id: "appointment-1" }),
    createHold: async () => null,
    releaseHold: async () => undefined,
    previewAppointmentSeries: async () => ({ occurrences: [] }),
    confirmAppointmentSeries: async () => ({ appointments: [] }),
  };
  const gateway = new Proxy(base, {
    get(target, property) {
      const name = String(property);
      if (IMPORT_SURFACE.test(name)) {
        touched.push(name);
        throw new Error(
          `Uma tool da IA tocou o caminho de importação do Scheduling: ${name}`,
        );
      }
      if (typeof name === "string" && name in target) reached.push(name);
      return Reflect.get(target, property);
    },
  }) as unknown as SchedulingGateway;
  return { gateway, touched, reached };
}

/** Prisma mínimo: o suficiente para as tools rodarem sem banco. */
function createPrismaStub() {
  return {
    contact: {
      findUnique: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
    conversation: {
      findUnique: async () => ({ id: "conversation-1", state: {} }),
      update: async () => ({ id: "conversation-1", state: {} }),
    },
    customerLink: { upsert: async () => ({}) },
    externalAppointment: {
      upsert: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    handoff: { create: async () => ({ id: "handoff-1" }) },
  } as unknown as PrismaClient;
}

describe("importação única fora do alcance da IA (Goal010, critério 8)", () => {
  const originalFetch = globalThis.fetch;
  let requestedUrls: string[];

  beforeEach(() => {
    requestedUrls = [];
    globalThis.fetch = (async (input: unknown) => {
      requestedUrls.push(
        typeof input === "string" ? input : String((input as Request).url),
      );
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("não registra nenhuma tool de importação, e tool nova quebra esta lista", () => {
    const { gateway } = createImportTrap();
    const registry = new AssistantToolRegistry(createPrismaStub(), gateway);
    const definitions = registry.createDefinitions(context());

    expect(definitions.map((definition) => definition.name).sort()).toEqual(
      [...REGISTERED_TOOLS].sort(),
    );
    for (const definition of definitions) {
      expect(definition.name).not.toMatch(IMPORT_SURFACE);
      // Nem por descrição: o modelo não pode sequer ser convidado a importar.
      expect(definition.description ?? "").not.toMatch(IMPORT_SURFACE);
    }
  });

  it("nenhuma tool registrada toca o caminho de importação quando executada", async () => {
    const { gateway, touched, reached } = createImportTrap();
    const registry = new AssistantToolRegistry(createPrismaStub(), gateway);
    const definitions = registry.createDefinitions(context());

    for (const definition of definitions) {
      // Argumentos vazios: o que interessa é por onde a tool tenta passar,
      // não o resultado dela. Erro de validação é resposta estruturada.
      const result = await registry.execute(
        { id: `call-${definition.name}`, name: definition.name, args: {} },
        context(),
      );
      expect(result.toolCallId).toBe(`call-${definition.name}`);
    }

    // O dublê precisa ter sido realmente exercitado: sem isto, "nenhuma tool
    // tocou importação" seria verdade só porque nenhuma tool chegou ao
    // gateway.
    expect(reached.length).toBeGreaterThan(0);
    expect(touched).toEqual([]);
    expect(
      requestedUrls.filter((url) => IMPORT_SURFACE.test(url)),
    ).toEqual([]);
  });

  it("pedir uma tool de importação ao registro é tool desconhecida", async () => {
    const { gateway } = createImportTrap();
    const registry = new AssistantToolRegistry(createPrismaStub(), gateway);

    for (const name of [
      "start_import",
      "execute_import",
      "complete_import",
      "import_minha_agenda",
    ]) {
      const result = await registry.execute(
        { id: "call-1", name, args: {} },
        context(),
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNKNOWN_TOOL" },
      });
    }
  });

  it("o cliente do Scheduling usado pela IA não conhece rota de importação", () => {
    const clientSource = readFileSync(
      fileURLToPath(
        new URL("../../src/modules/scheduling-service/client.ts", import.meta.url),
      ),
      "utf8",
    );
    const toolsSource = readFileSync(
      fileURLToPath(
        new URL("../../src/modules/tools/assistant-tools.ts", import.meta.url),
      ),
      "utf8",
    );

    for (const source of [clientSource, toolsSource]) {
      expect(source).not.toContain("/internal/calendar/imports");
      expect(source).not.toContain("/v1/calendar/imports");
      expect(source).not.toContain("/internal/calendar/migrations");
    }
  });
});
