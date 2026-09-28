import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
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
 * Goal067/WU-02 — regra de pausa em `PATCH /v1/settings/ai` (review063
 * observação 2) e `PATCH /v1/account/profile` (review064 observação 4).
 *
 * O que é provado aqui, contra PostgreSQL real e a IA/Scheduling como dublês
 * HTTP (mesmo padrão de `goal063-ai-activation`):
 *
 * - salvar só o estilo com a IA desligada, com prova válida disponível, não
 *   grava `activatedByRunId` — só a passagem ligada -> desligada é pausa;
 * - a reconciliação de `GET /v1/status` ainda liga a IA com essa mesma prova,
 *   porque nada a marcou como usada;
 * - pausar (ligada -> desligada) continua gravando `activatedByRunId`;
 * - `PATCH /v1/account/profile` grava o nome da sessão e não toca outro User;
 * - nome vazio, só espaço ou fora do limite recusa com `VALIDATION_ERROR`;
 * - sem sessão, `401`.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function activationRun(id: string) {
  return {
    id,
    state: "SUCCEEDED" as const,
    terminal: true,
    startedAt: "2026-09-14T12:00:00.000Z",
    finishedAt: "2026-09-14T12:10:00.000Z",
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
    supersededByChannelChange: false,
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

/** Dublê HTTP da IA/Scheduling, no mesmo padrão de goal063. */
function stubUpstream(perTenant: Record<string, { run: ReturnType<typeof activationRun> | null }>) {
  const effectiveByTenant = new Map<string, boolean>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const tenantId = request.headers.get("x-tenant-id");
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const cfg = (tenantId && perTenant[tenantId]) ?? { run: null };

      if (url.pathname === "/internal/activation-test") {
        return jsonResponse({ data: cfg.run, requestId: "up-run" });
      }
      if (url.pathname === "/internal/calendar") {
        return jsonResponse({
          data: calendarPayload(true),
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
          if (tenantId) effectiveByTenant.set(tenantId, Boolean(body?.enabled));
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
      throw new Error(
        `Unexpected upstream call: ${request.method} ${url.pathname}`,
      );
    }),
  );
}

async function patchAi(owner: SessionHandle, body: { enabled: boolean; tone: string }) {
  return app.inject({
    method: "PATCH",
    url: "/v1/settings/ai",
    headers: browserMutation(owner),
    payload: body,
  });
}

async function aiSettingsRow(owner: SessionHandle) {
  return getPrisma().aiSettings.findUnique({ where: { tenantId: owner.tenantId } });
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

async function patchProfile(owner: SessionHandle, body: Record<string, unknown>) {
  return app.inject({
    method: "PATCH",
    url: "/v1/account/profile",
    headers: browserMutation(owner),
    payload: body,
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

describe.skipIf(!RUN_INTEGRATION)(
  "Goal067/WU-02: pausa em PATCH /v1/settings/ai e PATCH /v1/account/profile",
  () => {
    it("salvar só o estilo com a IA desligada e prova válida não grava activatedByRunId, e a reconciliação ainda liga a IA com essa prova", async () => {
      const owner = await business("style-only-while-off");
      stubUpstream({ [owner.tenantId]: { run: activationRun("run-style-only") } });

      // Negócio nasce com a IA desligada (registerBusiness). Este PATCH só
      // troca o estilo: `enabled` continua `false`.
      const patch = await patchAi(owner, { enabled: false, tone: "CASUAL" });
      expect(patch.statusCode).toBe(200);

      const afterStyle = await aiSettingsRow(owner);
      expect(afterStyle?.enabled).toBe(false);
      expect(afterStyle?.activatedByRunId).toBeNull();
      expect(afterStyle?.tone).toBe("CASUAL");

      // A prova nunca foi marcada como usada: a reconciliação de GET /v1/status
      // liga a IA sozinha com ela, exatamente como a autoativação (Goal019 §7).
      const status = await readStatus(owner);
      expect(status.ai.reconciled).toBe("ACTIVATED");
      expect(status.ai.desiredEnabled).toBe(true);

      const afterReconciliation = await aiSettingsRow(owner);
      expect(afterReconciliation?.enabled).toBe(true);
      expect(afterReconciliation?.activatedByRunId).toBe("run-style-only");
    });

    it("pausar (ligada -> desligada) continua gravando activatedByRunId", async () => {
      const owner = await business("pause-still-marks-run");
      stubUpstream({ [owner.tenantId]: { run: activationRun("run-pause") } });

      const activated = await patchAi(owner, { enabled: true, tone: "BALANCED" });
      expect(activated.statusCode).toBe(200);
      expect((await aiSettingsRow(owner))?.activatedByRunId).toBe("run-pause");

      const paused = await patchAi(owner, { enabled: false, tone: "BALANCED" });
      expect(paused.statusCode).toBe(200);

      const row = await aiSettingsRow(owner);
      expect(row?.enabled).toBe(false);
      expect(row?.activatedByRunId).toBe("run-pause");
    });

    it("PATCH /v1/account/profile grava o nome da sessão e não toca outro User", async () => {
      const owner = await business("profile-write-own");
      const other = await business("profile-write-other");

      const patch = await patchProfile(owner, { name: "  Novo Nome Aqui  " });

      expect(patch.statusCode).toBe(200);
      expect(patch.json().data.user.name).toBe("Novo Nome Aqui");

      const ownerRow = await getPrisma().user.findUniqueOrThrow({
        where: { id: owner.userId },
      });
      expect(ownerRow.name).toBe("Novo Nome Aqui");

      const otherRow = await getPrisma().user.findUniqueOrThrow({
        where: { id: other.userId },
      });
      expect(otherRow.name).not.toBe("Novo Nome Aqui");
    });

    it("recusa nome vazio, só espaço ou fora do limite com VALIDATION_ERROR, sem gravar; sem sessão devolve 401", async () => {
      const owner = await business("profile-invalid-name");
      const before = await getPrisma().user.findUniqueOrThrow({
        where: { id: owner.userId },
      });

      for (const name of ["", "   ", "a".repeat(121)]) {
        const patch = await patchProfile(owner, { name });
        expect(patch.statusCode).toBe(400);
        expect(patch.json().error.code).toBe("VALIDATION_ERROR");
      }

      const unchanged = await getPrisma().user.findUniqueOrThrow({
        where: { id: owner.userId },
      });
      expect(unchanged.name).toBe(before.name);

      const noSession = await app.inject({
        method: "PATCH",
        url: "/v1/account/profile",
        payload: { name: "Alguém" },
      });
      expect(noSession.statusCode).toBe(401);
    });
  },
);
