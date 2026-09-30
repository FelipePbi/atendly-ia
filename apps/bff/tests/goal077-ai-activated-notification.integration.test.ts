import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import * as notificationStore from "../src/modules/notifications/store.js";
import {
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal077/WU-01 — a espécie `AI_ACTIVATED` nasce na mesma transação que liga a
 * IA (`enabled: false -> true`), na autoativação e em `PATCH /v1/settings/ai`.
 *
 * O que é provado aqui, contra PostgreSQL real e a IA/Scheduling como dublês
 * HTTP (mesmo padrão de `goal063-ai-activation`):
 *
 * - §6.1 execução `SUCCEEDED` cria exatamente uma `AI_ACTIVATED` INFO/EVENT,
 *   payload vazio, `subjectId` nulo, só visível ao negócio da sessão;
 * - §6.2 reconciliar de novo com a mesma execução não duplica;
 * - §6.3 `PATCH /v1/settings/ai` desligada->ligada cria; pausar não cria;
 *   religar com a mesma execução não duplica;
 * - §6.4 troca de canal, conta em exclusão e ativação recusada não criam;
 * - §6.5 falha forçada na gravação da notificação desfaz o `enabled: true`
 *   da mesma passada, nos dois caminhos.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

/** Execução do teste real, no recorte que a reconciliação/rota leem. */
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
    milestones: [],
  };
}

function calendarPayload(aiActivationReady: boolean) {
  return {
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
    integration: null,
    capabilities: {
      manageAvailability: true,
      manageServices: true,
      manageCustomers: true,
      createAppointments: true,
      migrate: true,
      aiActivationReady,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface TenantUpstream {
  run?: ReturnType<typeof activationRun> | null;
  aiActivationReady?: boolean;
}

function stubUpstream(perTenant: Record<string, TenantUpstream> = {}): void {
  const effectiveByTenant = new Map<string, boolean>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const tenantId = request.headers.get("x-tenant-id");
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const cfg: TenantUpstream = (tenantId && perTenant[tenantId]) ?? {};

      if (url.pathname === "/internal/activation-test") {
        return jsonResponse({ data: cfg.run ?? null, requestId: "up-run" });
      }
      if (url.pathname === "/internal/calendar") {
        return jsonResponse({
          data: calendarPayload(cfg.aiActivationReady ?? true),
          requestId: "up-calendar",
        });
      }
      if (url.pathname === "/internal/availability-settings") {
        return jsonResponse({
          data: { timezone: "America/Sao_Paulo", rules: [] },
          requestId: "up-availability",
        });
      }
      if (url.pathname === "/internal/ai-tenant-config") {
        if (request.method === "PUT") {
          if (tenantId) {
            effectiveByTenant.set(tenantId, Boolean(body?.enabled));
          }
          return jsonResponse({ ok: true, config: null });
        }
        return jsonResponse({
          data: {
            enabled: tenantId ? (effectiveByTenant.get(tenantId) ?? false) : false,
            tone: "BALANCED",
            promptVersion: "v1",
          },
          requestId: "up-get",
        });
      }
      if (url.pathname === "/internal/channel-connections/evolution") {
        return jsonResponse({ ok: true, deactivated: 0 });
      }
      throw new Error(
        `Unexpected upstream call: ${request.method} ${url.pathname}`,
      );
    }),
  );
}

async function patchAi(owner: SessionHandle, enabled: boolean) {
  return app.inject({
    method: "PATCH",
    url: "/v1/settings/ai",
    headers: browserMutation(owner),
    payload: { enabled, tone: "BALANCED" },
  });
}

async function readStatus(owner: SessionHandle) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/status",
    headers: browserRead(owner),
  });
  expect(response.statusCode).toBe(200);
  return response.json().data;
}

async function aiSettingsRow(owner: SessionHandle) {
  return getPrisma().aiSettings.findUnique({
    where: { tenantId: owner.tenantId },
  });
}

async function aiActivatedNotifications(owner: SessionHandle) {
  return getPrisma().tenantNotification.findMany({
    where: { tenantId: owner.tenantId, kind: "AI_ACTIVATED" },
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
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal077/WU-01: AI_ACTIVATED nasce com a ativação",
  () => {
    it("§6.1 autoativação SUCCEEDED cria exatamente uma AI_ACTIVATED INFO/EVENT, payload vazio, subjectId nulo, só do negócio da sessão", async () => {
      const owner = await business("ai-activated-autoactivation");
      const other = await business("ai-activated-autoactivation-other");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-auto-1" }) },
        [other.tenantId]: { run: null },
      });

      const status = await readStatus(owner);
      expect(status.ai.reconciled).toBe("ACTIVATED");

      const rows = await aiActivatedNotifications(owner);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.level).toBe("INFO");
      expect(rows[0]?.shape).toBe("EVENT");
      expect(rows[0]?.subjectId).toBeNull();
      expect(rows[0]?.payload).toEqual({});

      expect(await aiActivatedNotifications(other)).toHaveLength(0);
    });

    it("§6.2 reconciliar de novo com a mesma execução não cria outra", async () => {
      const owner = await business("ai-activated-reconcile-twice");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-auto-2" }) },
      });

      expect((await readStatus(owner)).ai.reconciled).toBe("ACTIVATED");
      expect((await readStatus(owner)).ai.reconciled).toBe("NOOP");

      expect(await aiActivatedNotifications(owner)).toHaveLength(1);
    });

    it("§6.3 PATCH /v1/settings/ai desligada->ligada cria a notificação; pausar não cria; religar com a mesma execução não cria outra", async () => {
      const owner = await business("ai-activated-patch-toggle");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-patch-1" }) },
      });

      const activated = await patchAi(owner, true);
      expect(activated.statusCode).toBe(200);
      expect(await aiActivatedNotifications(owner)).toHaveLength(1);

      const paused = await patchAi(owner, false);
      expect(paused.statusCode).toBe(200);
      expect(await aiActivatedNotifications(owner)).toHaveLength(1);

      const reactivated = await patchAi(owner, true);
      expect(reactivated.statusCode).toBe(200);
      expect(await aiActivatedNotifications(owner)).toHaveLength(1);
    });

    it("§6.3 pausar uma IA ligada antes da espécie existir não cria notificação", async () => {
      // IA ligada antes do Goal077: `enabled: true` sem nenhuma AI_ACTIVATED.
      // Pausar é a passagem ligada -> desligada, com a execução válida
      // corrente lida para marcá-la como consumida — e nunca vira notificação.
      const owner = await business("ai-activated-pause-legacy");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-legacy-1" }) },
      });
      await getPrisma().aiSettings.upsert({
        where: { tenantId: owner.tenantId },
        create: { tenantId: owner.tenantId, enabled: true },
        update: { enabled: true },
      });

      const paused = await patchAi(owner, false);
      expect(paused.statusCode).toBe(200);
      expect((await aiSettingsRow(owner))?.enabled).toBe(false);
      expect(await aiActivatedNotifications(owner)).toHaveLength(0);
    });

    it("§6.4 troca de canal (DEACTIVATED_BY_CHANNEL_CHANGE) não cria notificação nova", async () => {
      const owner = await business("ai-activated-channel-change");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-channel-1" }) },
      });
      expect((await readStatus(owner)).ai.reconciled).toBe("ACTIVATED");
      expect(await aiActivatedNotifications(owner)).toHaveLength(1);

      stubUpstream({
        [owner.tenantId]: {
          run: activationRun({
            id: "run-channel-1",
            supersededByChannelChange: true,
          }),
        },
      });
      const status = await readStatus(owner);
      expect(status.ai.reconciled).toBe("DEACTIVATED_BY_CHANNEL_CHANGE");

      expect(await aiActivatedNotifications(owner)).toHaveLength(1);
    });

    it("§6.4 conta em exclusão não cria notificação: PATCH recusa antes de checar a prova", async () => {
      const owner = await business("ai-activated-deletion-pending");
      stubUpstream({ [owner.tenantId]: { run: null } });

      const start = await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: { password: owner.password },
      });
      expect(start.statusCode).toBe(200);

      const patch = await patchAi(owner, true);
      expect(patch.statusCode).toBe(409);
      expect(patch.json().error.message).toContain("scheduled for deletion");

      expect(await aiActivatedNotifications(owner)).toHaveLength(0);
    });

    it("§6.4 ativação recusada por falta de prova válida não cria notificação", async () => {
      const owner = await business("ai-activated-no-proof");
      stubUpstream({ [owner.tenantId]: { run: null } });

      const patch = await patchAi(owner, true);
      expect(patch.statusCode).toBe(409);
      expect(patch.json().error.code).toBe("AI_ACTIVATION_TEST_REQUIRED");

      expect(await aiActivatedNotifications(owner)).toHaveLength(0);
    });

    it("§6.4 ativação recusada sem serviço operacional não cria notificação, nem pelo PATCH nem pela autoativação", async () => {
      const owner = await business("ai-activated-no-service");
      stubUpstream({
        [owner.tenantId]: {
          run: activationRun({ id: "run-no-service-1" }),
          aiActivationReady: false,
        },
      });

      const patch = await patchAi(owner, true);
      expect(patch.statusCode).toBe(409);
      expect(patch.json().error.message).toContain("operational service");

      expect((await readStatus(owner)).ai.reconciled).toBe("NOOP");

      expect((await aiSettingsRow(owner))?.enabled ?? false).toBe(false);
      expect(await aiActivatedNotifications(owner)).toHaveLength(0);
    });

    it("§6.5 falha forçada na escrita da notificação desfaz o enabled:true da mesma passada (autoativação)", async () => {
      const owner = await business("ai-activated-rollback-auto");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-rollback-1" }) },
      });
      vi.spyOn(notificationStore, "materialize").mockImplementationOnce(
        async () => {
          throw new Error("boom-goal077-materialize");
        },
      );

      const status = await readStatus(owner);
      expect(status.ai.reconciled).toBe("FAILED");

      const row = await aiSettingsRow(owner);
      expect(row?.enabled ?? false).toBe(false);
      expect(row?.activatedByRunId ?? null).toBeNull();
      expect(await aiActivatedNotifications(owner)).toHaveLength(0);
    });

    it("§6.5 falha forçada na escrita da notificação desfaz o enabled:true da mesma passada (PATCH /v1/settings/ai)", async () => {
      const owner = await business("ai-activated-rollback-patch");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-rollback-2" }) },
      });
      vi.spyOn(notificationStore, "materialize").mockImplementationOnce(
        async () => {
          throw new Error("boom-goal077-materialize");
        },
      );

      const patch = await patchAi(owner, true);
      expect(patch.statusCode).toBe(500);

      const row = await aiSettingsRow(owner);
      expect(row?.enabled ?? false).toBe(false);
      expect(row?.activatedByRunId ?? null).toBeNull();
      expect(await aiActivatedNotifications(owner)).toHaveLength(0);
    });
  },
);
