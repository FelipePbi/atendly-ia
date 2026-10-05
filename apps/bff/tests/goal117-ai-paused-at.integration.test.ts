import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { settingsStateSchema } from "@avenly-ia/public-api-contract";

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
 * Goal117/WU-01 — `AiSettings.pausedAt`: o instante da pausa humana da IA.
 *
 * Contra PostgreSQL real e IA/Scheduling como dublês HTTP (mesmo padrão de
 * goal063). Só a passagem ligada -> desligada de `PATCH /v1/settings/ai`
 * grava o instante; toda outra escrita que muda `enabled` grava nulo.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function activationRun(
  overrides: { id?: string; supersededByChannelChange?: boolean } = {},
) {
  return {
    id: overrides.id ?? "run-1",
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubUpstream(run: ReturnType<typeof activationRun> | null): void {
  const effective = new Map<string, boolean>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const tenantId = request.headers.get("x-tenant-id");
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.pathname === "/internal/activation-test") {
        return jsonResponse({ data: run, requestId: "up-run" });
      }
      if (url.pathname === "/internal/calendar") {
        return jsonResponse({
          data: {
            source: "ATENDLY",
            timezone: "America/Sao_Paulo",
            integration: null,
            capabilities: {
              manageAvailability: true,
              manageServices: true,
              manageCustomers: true,
              createAppointments: true,
              migrate: true,
              aiActivationReady: true,
            },
          },
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
          if (tenantId) effective.set(tenantId, Boolean(body?.enabled));
          return jsonResponse({ ok: true, config: null });
        }
        return jsonResponse({
          data: {
            enabled: tenantId ? (effective.get(tenantId) ?? false) : false,
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

async function patchAi(
  owner: SessionHandle,
  body: { enabled: boolean; tone: string },
) {
  return app.inject({
    method: "PATCH",
    url: "/v1/settings/ai",
    headers: browserMutation(owner),
    payload: body,
  });
}

async function getSettings(owner: SessionHandle) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/settings",
    headers: browserRead(owner),
  });
  expect(response.statusCode).toBe(200);
  return response.json().data;
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

function aiRow(owner: SessionHandle) {
  return getPrisma().aiSettings.findUniqueOrThrow({
    where: { tenantId: owner.tenantId },
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

describe.skipIf(!RUN_INTEGRATION)("Goal117/WU-01: AiSettings.pausedAt", () => {
  it("a migration criou a coluna anulável, sem default", async () => {
    const rows = await getPrisma().$queryRaw<
      Array<{ is_nullable: string; column_default: string | null }>
    >`SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'AiSettings' AND column_name = 'pausedAt'`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_nullable).toBe("YES");
    expect(rows[0]?.column_default).toBeNull();
  });

  it("negócio novo e IA nunca ligada: ai.pausedAt é null e o contrato aceita", async () => {
    const owner = await business("paused-at-fresh");
    stubUpstream(null);

    const state = await getSettings(owner);

    expect(state.ai.pausedAt).toBeNull();
    expect(() => settingsStateSchema.parse(state)).not.toThrow();
    expect((await aiRow(owner)).pausedAt).toBeNull();
  });

  it("pausar (ligada -> desligada) grava o instante, e GET e PATCH o devolvem", async () => {
    const owner = await business("paused-at-pause");
    stubUpstream(activationRun({ id: "run-pause" }));
    expect((await patchAi(owner, { enabled: true, tone: "BALANCED" })).statusCode)
      .toBe(200);
    expect((await aiRow(owner)).pausedAt).toBeNull();

    const before = Date.now();
    const paused = await patchAi(owner, { enabled: false, tone: "BALANCED" });
    const after = Date.now();

    expect(paused.statusCode).toBe(200);
    const row = await aiRow(owner);
    expect(row.pausedAt).not.toBeNull();
    const writtenAt = row.pausedAt?.getTime() ?? 0;
    expect(writtenAt).toBeGreaterThanOrEqual(before - 1000);
    expect(writtenAt).toBeLessThanOrEqual(after + 1000);
    expect(paused.json().data.ai.pausedAt).toBe(row.pausedAt?.toISOString());
    expect(() => settingsStateSchema.parse(paused.json().data)).not.toThrow();
    expect((await getSettings(owner)).ai.pausedAt).toBe(
      row.pausedAt?.toISOString(),
    );
  });

  it("salvar só o estilo com a IA já desligada não muda pausedAt", async () => {
    const owner = await business("paused-at-style-only");
    stubUpstream(activationRun({ id: "run-style" }));
    await patchAi(owner, { enabled: true, tone: "BALANCED" });
    await patchAi(owner, { enabled: false, tone: "BALANCED" });
    const paused = await aiRow(owner);

    const styled = await patchAi(owner, { enabled: false, tone: "CASUAL" });

    expect(styled.statusCode).toBe(200);
    const row = await aiRow(owner);
    expect(row.tone).toBe("CASUAL");
    expect(row.pausedAt?.toISOString()).toBe(paused.pausedAt?.toISOString());
  });

  it("negócio que nunca ligou e salva só o estilo desligado fica com pausedAt null", async () => {
    const owner = await business("paused-at-never-on");
    stubUpstream(null);

    const styled = await patchAi(owner, { enabled: false, tone: "CASUAL" });

    expect(styled.statusCode).toBe(200);
    expect((await aiRow(owner)).pausedAt).toBeNull();
    expect(styled.json().data.ai.pausedAt).toBeNull();
  });

  it("ligar de novo (PATCH) grava pausedAt null", async () => {
    const owner = await business("paused-at-reactivate");
    stubUpstream(activationRun({ id: "run-react" }));
    await patchAi(owner, { enabled: true, tone: "BALANCED" });
    await patchAi(owner, { enabled: false, tone: "BALANCED" });
    expect((await aiRow(owner)).pausedAt).not.toBeNull();

    // Prova nova: a pausa consumiu a execução anterior no mesmo id; a
    // rota só exige que a prova valha, não que seja inédita.
    const on = await patchAi(owner, { enabled: true, tone: "BALANCED" });

    expect(on.statusCode).toBe(200);
    expect((await aiRow(owner)).pausedAt).toBeNull();
    expect(on.json().data.ai.pausedAt).toBeNull();
  });

  it("autoativação por teste novo grava pausedAt null", async () => {
    const owner = await business("paused-at-autoactivate");
    stubUpstream(activationRun({ id: "run-a" }));
    await patchAi(owner, { enabled: true, tone: "BALANCED" });
    await patchAi(owner, { enabled: false, tone: "BALANCED" });
    expect((await aiRow(owner)).pausedAt).not.toBeNull();

    stubUpstream(activationRun({ id: "run-b" }));
    const status = await readStatus(owner);

    expect(status.ai.reconciled).toBe("ACTIVATED");
    const row = await aiRow(owner);
    expect(row.enabled).toBe(true);
    expect(row.pausedAt).toBeNull();
  });

  it("desligamento por troca de canal grava pausedAt null", async () => {
    const owner = await business("paused-at-channel-change");
    stubUpstream(activationRun({ id: "run-c" }));
    await patchAi(owner, { enabled: true, tone: "BALANCED" });
    // Resíduo de uma pausa antiga: o desligamento por canal não é pausa humana
    // e precisa limpar o instante.
    await getPrisma().aiSettings.update({
      where: { tenantId: owner.tenantId },
      data: { pausedAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    stubUpstream(
      activationRun({ id: "run-c", supersededByChannelChange: true }),
    );
    const status = await readStatus(owner);

    expect(status.ai.reconciled).toBe("DEACTIVATED_BY_CHANNEL_CHANGE");
    const row = await aiRow(owner);
    expect(row.enabled).toBe(false);
    expect(row.pausedAt).toBeNull();
  });

  it("exclusão de conta desliga a IA e grava pausedAt null", async () => {
    const owner = await business("paused-at-deletion");
    stubUpstream(null);
    await getPrisma().aiSettings.update({
      where: { tenantId: owner.tenantId },
      data: {
        enabled: true,
        pausedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    const start = await app.inject({
      method: "POST",
      url: "/v1/account/deletion",
      headers: browserMutation(owner),
      payload: { password: owner.password },
    });

    expect(start.statusCode).toBe(200);
    const row = await aiRow(owner);
    expect(row.enabled).toBe(false);
    expect(row.pausedAt).toBeNull();
  });
});
