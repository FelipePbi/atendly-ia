import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DomainError } from "../../src/lib/errors.js";
import {
  type AssistantGraphSession,
  AssistantService,
} from "../../src/modules/assistant/assistant.service.js";
import { buildSchedulingPrompt } from "../../src/modules/prompts/scheduling.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import {
  CUSTOMER_CHANGE_OUTSIDE_POLICY,
  type SchedulingAppointment,
} from "../../src/modules/scheduling-service/types.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

/**
 * Politica de antecedencia minima do cliente (Goal073): prepare recusa fora
 * do prazo antes de gravar pendencia ou criar hold; confirm traduz a
 * recusa do Scheduling na mesma forma e limpa a pendencia.
 */

const phone = "5511999999999";
const conversationId = "conversation-1";
const businessContext = {
  ...DEFAULT_BUSINESS_CONTEXT,
  timezone: "America/Sao_Paulo",
};

// 13:30 em America/Sao_Paulo (UTC-3) e 16:30 UTC.
const appointment: SchedulingAppointment = {
  id: "appointment-1",
  title: null,
  date: "2026-06-08",
  startTime: "13:30",
  endTime: "14:00",
  duration: 30,
  customerId: "cust-1",
  customer: { id: "cust-1", name: "Thais", phone },
  services: [
    {
      serviceId: "service-1",
      name: "Aplicacao 5D",
      duration: 30,
      priceType: "FIXED",
      price: 190,
    },
  ],
  price: 190,
  totalPriceType: "FIXED",
  comments: null,
  status: "CONFIRMED",
  serviceId: "service-1",
  serviceIds: ["service-1"],
  serviceName: "Aplicacao 5D",
  customerName: "Thais",
};

function context(turnId = "channel-1:message-1") {
  return {
    turnId,
    conversationId,
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    phone,
    customerName: "Thais",
    businessContext,
    aiRunId: "ai-run-1",
  };
}

function createPrismaMock(initialState: Record<string, unknown>) {
  const store = { state: { ...initialState } as Record<string, unknown> };
  const prisma = {
    conversation: {
      findUnique: async () => ({ id: conversationId, state: store.state }),
      update: async (args: { data: { state?: Record<string, unknown> } }) => {
        if (args.data.state) store.state = args.data.state;
        return { id: conversationId, state: store.state };
      },
    },
  } as unknown as PrismaClient;
  return { prisma, store };
}

function createSchedulingMock(
  overrides: Partial<SchedulingGateway> & {
    minNoticeMinutes: number;
  },
) {
  const { minNoticeMinutes, ...rest } = overrides;
  const calls = { createHold: 0, releaseHold: 0 };
  const scheduling: Partial<SchedulingGateway> = {
    findFutureAppointmentsForPhone: async () => [appointment],
    getCustomerChangePolicy: async () => ({ minNoticeMinutes }),
    createHold: async (input) => {
      calls.createHold += 1;
      return {
        id: "hold-1",
        date: input.date,
        startTime: input.startTime,
        endTime: "10:30",
        duration: 30,
        serviceIds: input.serviceIds,
        expiresAt: "2026-06-08T13:35:00.000Z",
        status: "ACTIVE",
      };
    },
    releaseHold: async (id) => {
      calls.releaseHold += 1;
      return {
        id,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        duration: 30,
        serviceIds: appointment.serviceIds,
        expiresAt: "2026-06-08T13:35:00.000Z",
        status: "RELEASED",
      };
    },
    ...rest,
  };
  return { scheduling: scheduling as SchedulingGateway, calls };
}

// Fora do prazo: 59 minutos de antecedencia contra um minimo de 120.
const NOW_OUTSIDE_POLICY = () => new Date("2026-06-08T15:31:00.000Z");
// Dentro do prazo: 181 minutos de antecedencia contra o mesmo minimo.
const NOW_INSIDE_POLICY = () => new Date("2026-06-08T13:29:00.000Z");

describe("politica de antecedencia minima do cliente no prepare (Goal073)", () => {
  it("prepare de cancelar fora do prazo devolve outsidePolicy e nao grava acao pendente", async () => {
    const { prisma, store } = createPrismaMock({});
    const { scheduling } = createSchedulingMock({ minNoticeMinutes: 120 });
    const registry = new AssistantToolRegistry(
      prisma,
      scheduling,
      undefined,
      undefined,
      NOW_OUTSIDE_POLICY,
    );

    const result = await registry.execute(
      {
        id: "call-prepare-cancel",
        name: "cancel_appointment",
        args: { action: "prepare", appointmentId: appointment.id },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: CUSTOMER_CHANGE_OUTSIDE_POLICY,
        details: {
          outsidePolicy: true,
          minNoticeHours: 2,
          minNoticeMinutes: 120,
        },
      },
    });
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("prepare de remarcar fora do prazo nao cria hold nem grava acao pendente", async () => {
    const { prisma, store } = createPrismaMock({});
    const { scheduling, calls } = createSchedulingMock({
      minNoticeMinutes: 120,
    });
    const registry = new AssistantToolRegistry(
      prisma,
      scheduling,
      undefined,
      undefined,
      NOW_OUTSIDE_POLICY,
    );

    const result = await registry.execute(
      {
        id: "call-prepare-reschedule",
        name: "reschedule_appointment",
        args: {
          action: "prepare",
          appointmentId: appointment.id,
          date: "2026-06-09",
          startTime: "10:00",
        },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: CUSTOMER_CHANGE_OUTSIDE_POLICY,
        details: {
          outsidePolicy: true,
          minNoticeHours: 2,
          minNoticeMinutes: 120,
        },
      },
    });
    expect(calls.createHold).toBe(0);
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("dentro do prazo, prepare de cancelar segue normalmente e grava a pendencia", async () => {
    const { prisma, store } = createPrismaMock({});
    const { scheduling } = createSchedulingMock({ minNoticeMinutes: 120 });
    const registry = new AssistantToolRegistry(
      prisma,
      scheduling,
      undefined,
      undefined,
      NOW_INSIDE_POLICY,
    );

    const result = await registry.execute(
      {
        id: "call-prepare-cancel-ok",
        name: "cancel_appointment",
        args: { action: "prepare", appointmentId: appointment.id },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(store.state.pendingAction).toMatchObject({
      type: "cancel",
      appointmentId: appointment.id,
    });
  });

  it("politica zerada (default) nao restringe nada", async () => {
    const { prisma, store } = createPrismaMock({});
    const { scheduling } = createSchedulingMock({ minNoticeMinutes: 0 });
    const registry = new AssistantToolRegistry(
      prisma,
      scheduling,
      undefined,
      undefined,
      NOW_OUTSIDE_POLICY,
    );

    const result = await registry.execute(
      {
        id: "call-prepare-cancel-zero",
        name: "cancel_appointment",
        args: { action: "prepare", appointmentId: appointment.id },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(store.state.pendingAction).toMatchObject({ type: "cancel" });
  });
});

describe("politica de antecedencia minima do cliente no confirm (Goal073)", () => {
  it("confirm de cancelamento com CUSTOMER_CHANGE_OUTSIDE_POLICY devolve a recusa e limpa a pendencia", async () => {
    const cancelDraft = {
      type: "cancel",
      appointmentId: appointment.id,
      idempotencyKey: "key-c",
      preparedInTurnId: "channel-1:message-0",
    };
    const { prisma, store } = createPrismaMock({ pendingAction: cancelDraft });
    const { scheduling } = createSchedulingMock({
      minNoticeMinutes: 120,
      cancelAppointment: async () => {
        throw new DomainError(
          "The customer change notice policy no longer allows this change.",
          {
            code: CUSTOMER_CHANGE_OUTSIDE_POLICY,
            statusCode: 409,
            details: { minNoticeMinutes: 180 },
          },
        );
      },
    });
    const registry = new AssistantToolRegistry(prisma, scheduling);

    const result = await registry.execute(
      {
        id: "call-confirm-cancel",
        name: "cancel_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: CUSTOMER_CHANGE_OUTSIDE_POLICY,
        details: {
          outsidePolicy: true,
          minNoticeHours: 3,
          minNoticeMinutes: 180,
        },
      },
    });
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("confirm de remarcacao com CUSTOMER_CHANGE_OUTSIDE_POLICY devolve a recusa e limpa a pendencia", async () => {
    const rescheduleDraft = {
      type: "reschedule",
      appointmentId: appointment.id,
      date: "2026-06-09",
      startTime: "10:00",
      holdId: "hold-1",
      idempotencyKey: "key-r",
      preparedInTurnId: "channel-1:message-0",
    };
    const { prisma, store } = createPrismaMock({
      pendingAction: rescheduleDraft,
    });
    const { scheduling, calls } = createSchedulingMock({
      minNoticeMinutes: 120,
      rescheduleAppointment: async () => {
        throw new DomainError(
          "The customer change notice policy no longer allows this change.",
          {
            code: CUSTOMER_CHANGE_OUTSIDE_POLICY,
            statusCode: 409,
            details: { minNoticeMinutes: 60 },
          },
        );
      },
    });
    const registry = new AssistantToolRegistry(prisma, scheduling);

    const result = await registry.execute(
      {
        id: "call-confirm-reschedule",
        name: "reschedule_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: CUSTOMER_CHANGE_OUTSIDE_POLICY,
        details: {
          outsidePolicy: true,
          minNoticeHours: 1,
          minNoticeMinutes: 60,
        },
      },
    });
    expect(store.state.pendingAction).toBeUndefined();
    // O hold do horario novo e solto junto com a pendencia.
    expect(calls.releaseHold).toBe(1);
  });
});

describe("recusa por politica nunca vira evidencia de confirmacao (Goal057)", () => {
  function session(turnId: string): AssistantGraphSession {
    return {
      conversationId,
      tenantId: "tenant-1",
      channelId: "channel-1",
      userId: "user-1",
      requestId: "request-1",
      inputMessageIds: ["inbound-1"],
      turnId,
      phone,
      customerName: "Thais",
      businessContext,
      instructions: "",
      promptVersion: "test",
      input: [],
      turns: [],
      iteration: 1,
      aiRunId: "ai-run-1",
    };
  }

  function createFullHarness(initialState: Record<string, unknown>) {
    const store = {
      state: { ...initialState } as Record<string, unknown>,
      toolCalls: [] as Array<{
        id: string;
        tenantId: string;
        aiRunId: string;
        externalCallId: string;
        name: string;
        arguments: unknown;
        status: string;
        result?: unknown;
        completedAt?: Date | null;
      }>,
    };
    const prisma = {
      conversation: {
        findUnique: async () => ({ id: conversationId, state: store.state }),
        update: async (args: {
          data: { state?: Record<string, unknown> };
        }) => {
          if (args.data.state) store.state = args.data.state;
          return { id: conversationId, state: store.state };
        },
      },
      aiToolCall: {
        findFirst: async (args: {
          where: { aiRunId: string; externalCallId: string; name: string };
        }) =>
          store.toolCalls.find(
            (call) =>
              call.aiRunId === args.where.aiRunId &&
              call.externalCallId === args.where.externalCallId &&
              call.name === args.where.name,
          ) ?? null,
        create: async (args: { data: Record<string, unknown> }) => {
          const row = {
            id: `tool-call-${store.toolCalls.length + 1}`,
            ...args.data,
          } as (typeof store.toolCalls)[number];
          store.toolCalls.push(row);
          return row;
        },
        update: async (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = store.toolCalls.find(
            (call) => call.id === args.where.id,
          );
          Object.assign(row as object, args.data);
          return row;
        },
        findMany: async (args: {
          where: {
            tenantId: string;
            aiRunId: string;
            status: string;
            name?: { in: string[] };
          };
        }) =>
          store.toolCalls
            .filter(
              (call) =>
                call.tenantId === args.where.tenantId &&
                call.aiRunId === args.where.aiRunId &&
                call.status === args.where.status &&
                (args.where.name?.in ?? [call.name]).includes(call.name),
            )
            .map((call) => ({ name: call.name, arguments: call.arguments })),
      },
    } as unknown as PrismaClient;
    return { prisma, store };
  }

  /** `loadTurnConfirmedEffects` e privado; o teste le o mesmo conjunto que o guarda de afirmacao le. */
  function turnConfirmedEffects(
    assistant: AssistantService,
  ): Promise<ReadonlySet<string>> {
    return (
      assistant as unknown as {
        loadTurnConfirmedEffects(
          tenantId: string,
          aiRunId?: string,
        ): Promise<ReadonlySet<string>>;
      }
    ).loadTurnConfirmedEffects("tenant-1", "ai-run-1");
  }

  it("cancel_appointment confirm recusado por outsidePolicy grava AiToolCall FAILED, nunca SUCCEEDED", async () => {
    const cancelDraft = {
      type: "cancel",
      appointmentId: appointment.id,
      idempotencyKey: "key-c",
      preparedInTurnId: "turn-0",
    };
    const { prisma, store } = createFullHarness({ pendingAction: cancelDraft });
    const { scheduling } = createSchedulingMock({
      minNoticeMinutes: 120,
      cancelAppointment: async () => {
        throw new DomainError(
          "The customer change notice policy no longer allows this change.",
          {
            code: CUSTOMER_CHANGE_OUTSIDE_POLICY,
            statusCode: 409,
            details: { minNoticeMinutes: 180 },
          },
        );
      },
    });
    const tools = new AssistantToolRegistry(prisma, scheduling);
    const assistant = new AssistantService(
      prisma,
      undefined,
      { invoke: vi.fn() },
      tools,
    );

    await assistant.executeGraphTools(session("turn-1"), [
      { id: "call-1", name: "cancel_appointment", args: { action: "confirm" } },
    ]);

    expect(store.toolCalls).toHaveLength(1);
    expect(store.toolCalls[0]).toMatchObject({
      name: "cancel_appointment",
      status: "FAILED",
    });
    // `loadTurnConfirmedEffects` (assistant.service.ts) so le AiToolCall com
    // `status: "SUCCEEDED"`: uma linha FAILED nunca vira evidencia de
    // confirmacao, entao a recusa nunca autoriza a IA a afirmar o efeito.
    const confirmed = await turnConfirmedEffects(assistant);
    expect(confirmed.has("cancel")).toBe(false);
    expect(confirmed.has("reschedule")).toBe(false);
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("reschedule_appointment confirm recusado por outsidePolicy grava AiToolCall FAILED, nunca SUCCEEDED", async () => {
    const rescheduleDraft = {
      type: "reschedule",
      appointmentId: appointment.id,
      date: "2026-06-09",
      startTime: "10:00",
      holdId: "hold-1",
      idempotencyKey: "key-r",
      preparedInTurnId: "turn-0",
    };
    const { prisma, store } = createFullHarness({
      pendingAction: rescheduleDraft,
    });
    const { scheduling } = createSchedulingMock({
      minNoticeMinutes: 120,
      rescheduleAppointment: async () => {
        throw new DomainError(
          "The customer change notice policy no longer allows this change.",
          {
            code: CUSTOMER_CHANGE_OUTSIDE_POLICY,
            statusCode: 409,
            details: { minNoticeMinutes: 120 },
          },
        );
      },
    });
    const tools = new AssistantToolRegistry(prisma, scheduling);
    const assistant = new AssistantService(
      prisma,
      undefined,
      { invoke: vi.fn() },
      tools,
    );

    await assistant.executeGraphTools(session("turn-1"), [
      {
        id: "call-1",
        name: "reschedule_appointment",
        args: { action: "confirm" },
      },
    ]);

    expect(store.toolCalls).toHaveLength(1);
    expect(store.toolCalls[0]).toMatchObject({
      name: "reschedule_appointment",
      status: "FAILED",
    });
    expect(
      store.toolCalls.filter((call) => call.status === "SUCCEEDED"),
    ).toHaveLength(0);
    const confirmed = await turnConfirmedEffects(assistant);
    expect(confirmed.has("reschedule")).toBe(false);
    expect(confirmed.has("cancel")).toBe(false);
    expect(store.state.pendingAction).toBeUndefined();
  });
});

describe("isencao da politica: so ActivationTestCleanupService envia (Goal073)", () => {
  function collectTsFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "generated" || entry === "node_modules") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...collectTsFiles(full));
      } else if (entry.endsWith(".ts")) {
        files.push(full);
      }
    }
    return files;
  }

  it('nenhum outro arquivo em apps/ai-orchestrator/src passa "ACTIVATION_TEST_CLEANUP" como valor', () => {
    const srcDir = fileURLToPath(new URL("../../src", import.meta.url));
    // Linha so com o literal: distingue "enviar o valor" de so declarar o
    // tipo `policyExemption?: "ACTIVATION_TEST_CLEANUP"` na interface/impl.
    const standaloneLiteral = /^\s*"ACTIVATION_TEST_CLEANUP",?\s*$/;
    const matches = collectTsFiles(srcDir).filter((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .some((line) => standaloneLiteral.test(line)),
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toContain("ActivationTestCleanupService.ts");
  });
});

describe("buildSchedulingPrompt instrui a IA sobre a recusa por prazo (Goal073)", () => {
  it("explica o prazo e oferece falar com a profissional", () => {
    const prompt = buildSchedulingPrompt().join("\n");
    expect(prompt).toContain("outsidePolicy");
    expect(prompt.toLowerCase()).toContain("prazo");
    expect(prompt.toLowerCase()).toContain("profissional");
  });
});
