import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  assertDisposableTarget,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal019 §7 — autoativação por teste real e reconciliação desired/effective.
 *
 * O que é provado aqui, contra dublê HTTP da IA e do Scheduling:
 *
 * - **só** execução `SUCCEEDED` ativa a IA; qualquer outro estado não ativa;
 * - a ativação passa pela regra vigente (ao menos um serviço operacional):
 *   este Goal acrescenta exigência, não substitui a que já existia;
 * - reconciliar a mesma execução duas vezes não gera duas ativações;
 * - a reconciliação é limitada, não lança e deixa estado honesto legível em
 *   `GET /v1/status`;
 * - trocar/revincular o WhatsApp invalida o teste e a IA volta a ficar
 *   desligada — o estado de "testado" não sobrevive à troca.
 *
 * Cada teste falha se o comportamento for removido: sem a reconciliação a IA
 * fica desligada com execução bem-sucedida, e sem a supersessão ela continua
 * ligada depois da troca do número.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  body: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

/** Execução do teste real como a IA a devolve. Só o que o BFF lê. */
function activationRun(
  overrides: {
    id?: string;
    state?: "RUNNING" | "PAUSED_BY_HUMAN" | "SUCCEEDED" | "FAILED" | "DISCARDED";
    supersededByChannelChange?: boolean;
  } = {},
) {
  const state = overrides.state ?? "SUCCEEDED";
  return {
    id: overrides.id ?? "run-1",
    state,
    terminal: state !== "RUNNING" && state !== "PAUSED_BY_HUMAN",
    startedAt: "2026-09-14T12:00:00.000Z",
    finishedAt: state === "RUNNING" ? null : "2026-09-14T12:10:00.000Z",
    pausedAt: null,
    currentStep: null,
    completedStep: null,
    attempts: 1,
    maxAttempts: 3,
    failedStep: null,
    failedStepLabel: null,
    failureCode: null,
    appointmentId: "appointment-1",
    channelId: "channel-1",
    supersededByChannelChange: overrides.supersededByChannelChange ?? false,
    cleanupState: "CLEAN" as const,
    cleanupAt: "2026-09-14T12:09:00.000Z",
    cleanupResidue: [],
    milestones: [
      "MESSAGE_SENT",
      "SERVICE_IDENTIFIED",
      "PRICE_INFORMED",
      "AVAILABILITY_CHECKED",
      "SLOT_SELECTED",
      "APPOINTMENT_CONFIRMED",
    ].map((milestone) => ({
      milestone,
      reached: true,
      reachedAt: "2026-09-14T12:05:00.000Z",
      sourceKind: "MESSAGE",
      sourceId: `fact-${milestone}`,
    })),
  };
}

interface Upstream {
  calls: UpstreamCall[];
  /** Estado efetivo que a IA reporta. Muda quando o BFF projeta. */
  effectiveEnabled: boolean;
}

function projections(upstream: Upstream): number {
  return upstream.calls.filter(
    (call) =>
      call.method === "PUT" && call.path === "/internal/ai-tenant-config",
  ).length;
}

function stubUpstream(options: {
  run?: ReturnType<typeof activationRun> | null;
  aiActivationReady?: boolean;
  effectiveEnabled?: boolean;
  failProjection?: boolean;
}): Upstream {
  const upstream: Upstream = {
    calls: [],
    effectiveEnabled: options.effectiveEnabled ?? false,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      upstream.calls.push({ method: request.method, path: url.pathname, body });

      if (url.pathname === "/internal/activation-test") {
        return jsonResponse({ data: options.run ?? null, requestId: "up-run" });
      }
      if (url.pathname === "/internal/ai-tenant-config") {
        if (request.method === "PUT") {
          if (options.failProjection) {
            return jsonResponse({ error: { code: "BOOM" } }, 500);
          }
          upstream.effectiveEnabled = Boolean(
            (body as { enabled?: boolean } | null)?.enabled,
          );
          return jsonResponse({ ok: true, config: null });
        }
        return jsonResponse({
          data: {
            enabled: upstream.effectiveEnabled,
            tone: "BALANCED",
            promptVersion: "v1",
          },
          requestId: "up-get",
        });
      }
      if (url.pathname === "/internal/calendar") {
        return jsonResponse({
          data: {
            source: "ATENDLY",
            timezone: "America/Sao_Paulo",
            capabilities: {
              manageAvailability: true,
              manageServices: true,
              manageCustomers: true,
              createAppointments: true,
              migrate: true,
              aiActivationReady: options.aiActivationReady ?? true,
            },
            integration: null,
          },
          requestId: "up-calendar",
        });
      }
      if (url.pathname === "/instance/status") {
        return jsonResponse({ data: { connected: false, loggedIn: false } });
      }
      throw new Error(
        `Unexpected upstream call: ${request.method} ${url.pathname}`,
      );
    }),
  );
  return upstream;
}

async function readStatus(session: SessionHandle) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/status",
    headers: browserRead(session),
  });
  expect(response.statusCode).toBe(200);
  return response.json().data;
}

async function desiredAi(session: SessionHandle) {
  return getPrisma().aiSettings.findUnique({
    where: { tenantId: session.tenantId },
  });
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("Goal019: autoativação por teste real", () => {
  it("execução bem-sucedida ativa a IA e a projeção chega na IA", async () => {
    const owner = await business("reconcile-activates");
    stubUpstream({ run: activationRun() });

    const status = await readStatus(owner);

    expect(status.ai.reconciled).toBe("ACTIVATED");
    expect(status.ai.desiredEnabled).toBe(true);
    expect(status.ai.effectiveEnabled).toBe(true);
    expect(status.ai.state).toBe("ACTIVE");
    // A execução que autorizou fica gravada: é ela que torna a segunda
    // reconciliação um no-op e a troca do WhatsApp detectável.
    expect((await desiredAi(owner))?.activatedByRunId).toBe("run-1");
  });

  it.each(["RUNNING", "PAUSED_BY_HUMAN", "FAILED", "DISCARDED"] as const)(
    "execução em %s não ativa a IA",
    async (state) => {
      const owner = await business(`reconcile-not-${state.toLowerCase()}`);
      stubUpstream({ run: activationRun({ state }) });

      const status = await readStatus(owner);

      expect(status.ai.desiredEnabled).toBe(false);
      expect(status.ai.state).toBe("OFF");
      expect((await desiredAi(owner))?.activatedByRunId ?? null).toBeNull();
    },
  );

  it("tenant que nunca testou não é ativado", async () => {
    const owner = await business("reconcile-never-tested");
    stubUpstream({ run: null });

    const status = await readStatus(owner);

    expect(status.ai.desiredEnabled).toBe(false);
    expect(status.ai.state).toBe("OFF");
  });

  it("sem serviço operacional a IA não é ativada nem por teste bem-sucedido", async () => {
    const owner = await business("reconcile-no-service");
    stubUpstream({ run: activationRun(), aiActivationReady: false });

    const status = await readStatus(owner);

    // A regra vigente continua inteira: este Goal acrescenta exigência, não
    // substitui a que já existia.
    expect(status.ai.reconciled).toBe("NOOP");
    expect(status.ai.desiredEnabled).toBe(false);
    expect((await desiredAi(owner))?.enabled ?? false).toBe(false);
  });

  it("reconciliar a mesma execução duas vezes não duplica ativação nem efeito", async () => {
    const owner = await business("reconcile-idempotent");
    const upstream = stubUpstream({ run: activationRun() });

    const first = await readStatus(owner);
    const afterFirst = projections(upstream);
    const second = await readStatus(owner);
    const afterSecond = projections(upstream);

    expect(first.ai.reconciled).toBe("ACTIVATED");
    expect(second.ai.reconciled).toBe("NOOP");
    expect(second.ai.state).toBe("ACTIVE");
    expect(afterFirst).toBe(1);
    // Segunda passada: nada divergia, então nada foi projetado de novo.
    expect(afterSecond).toBe(1);
  });

  it("projeção que falha não vira 500 e o estado lido continua honesto", async () => {
    const owner = await business("reconcile-projection-fails");
    stubUpstream({ run: activationRun(), failProjection: true });

    const status = await readStatus(owner);

    expect(status.ai.reconciled).toBe("FAILED");
    // O desejado foi gravado — é do BFF —, mas o efetivo não mente.
    expect(status.ai.desiredEnabled).toBe(true);
    expect(status.ai.effectiveEnabled).toBe(false);
    expect(status.ai.state).toBe("PENDING");
  });

  it("divergência sem teste novo converge: o desejado é reaplicado na IA", async () => {
    const owner = await business("reconcile-converges");
    await getPrisma().aiSettings.upsert({
      where: { tenantId: owner.tenantId },
      create: { tenantId: owner.tenantId, enabled: true },
      update: { enabled: true },
    });
    stubUpstream({ run: null, effectiveEnabled: false });

    const status = await readStatus(owner);

    expect(status.ai.reconciled).toBe("CONVERGED");
    expect(status.ai.effectiveEnabled).toBe(true);
    expect(status.ai.state).toBe("ACTIVE");
  });
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal019: o teste não sobrevive à troca do WhatsApp",
  () => {
    it("execução superada desliga a IA que ela mesma tinha ligado", async () => {
      const owner = await business("reconcile-channel-change");
      stubUpstream({ run: activationRun() });
      expect((await readStatus(owner)).ai.desiredEnabled).toBe(true);
      vi.unstubAllGlobals();

      // Mesmo negócio, mesma execução — mas o WhatsApp foi revinculado.
      stubUpstream({
        run: activationRun({ supersededByChannelChange: true }),
        effectiveEnabled: true,
      });
      const status = await readStatus(owner);

      expect(status.ai.reconciled).toBe("DEACTIVATED_BY_CHANNEL_CHANGE");
      expect(status.ai.desiredEnabled).toBe(false);
      expect(status.ai.state).toBe("OFF");
      // "Testado" não sobrevive: a autorização é apagada junto.
      expect((await desiredAi(owner))?.activatedByRunId ?? null).toBeNull();
    });

    it("execução superada não ativa a IA que nunca esteve ligada", async () => {
      const owner = await business("reconcile-superseded-no-activation");
      stubUpstream({ run: activationRun({ supersededByChannelChange: true }) });

      const status = await readStatus(owner);

      expect(status.ai.desiredEnabled).toBe(false);
      expect((await desiredAi(owner))?.activatedByRunId ?? null).toBeNull();
    });
  },
);
