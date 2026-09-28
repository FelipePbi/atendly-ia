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
 * Goal063/WU-01 — `PATCH /v1/settings/ai` só liga a IA com prova válida.
 *
 * O que é provado aqui, contra PostgreSQL real e a IA/Scheduling como dublês
 * HTTP (mesmo padrão de `goal019-ai-activation-reconciliation`):
 *
 * - ligar (desligada -> ligada) sem execução, com execução `FAILED` ou
 *   `PAUSED_BY_HUMAN`, com execução `SUCCEEDED` superada por troca de canal,
 *   ou com a leitura do teste falhando, recusa com `409
 *   AI_ACTIVATION_TEST_REQUIRED` e não grava nada;
 * - com prova válida e serviço operacional, liga e grava `activatedByRunId`;
 * - a ordem das recusas continua exclusão, prova, serviço;
 * - já ligada, `enabled: true` só troca o estilo, sem exigir prova nova e sem
 *   mudar `activatedByRunId`;
 * - pausar grava a execução válida corrente como usada, e a reconciliação de
 *   `GET /v1/status` não desfaz a pausa humana — inclusive da IA ligada antes
 *   deste Goal, sem `activatedByRunId`;
 * - a IA religada à mão desliga sozinha quando a execução é superada por
 *   troca de canal, exatamente como a autoativação (Goal019 §7);
 * - a prova de um negócio nunca liga a IA de outro.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  tenantId: string | null;
  body: Record<string, unknown> | null;
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

/** Execução do teste real, no recorte que a rota lê. Mesma forma de goal019. */
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

/** Configuração de dublê por negócio; ausente cai nos defaults. */
interface TenantUpstream {
  /** `"FAIL"` simula a leitura do teste real respondendo erro. */
  run?: ReturnType<typeof activationRun> | null | "FAIL";
  aiActivationReady?: boolean;
}

function stubUpstream(perTenant: Record<string, TenantUpstream> = {}): {
  calls: UpstreamCall[];
  effectiveByTenant: Map<string, boolean>;
} {
  const calls: UpstreamCall[] = [];
  const effectiveByTenant = new Map<string, boolean>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const tenantId = request.headers.get("x-tenant-id");
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method: request.method, path: url.pathname, tenantId, body });
      const cfg: TenantUpstream = (tenantId && perTenant[tenantId]) ?? {};

      if (url.pathname === "/internal/activation-test") {
        if (cfg.run === "FAIL") {
          return jsonResponse(
            { error: { code: "UPSTREAM_UNAVAILABLE", message: "boom" } },
            500,
          );
        }
        return jsonResponse({ data: cfg.run ?? null, requestId: "up-run" });
      }
      if (url.pathname === "/internal/calendar") {
        return jsonResponse({
          data: calendarPayload(cfg.aiActivationReady ?? true),
          requestId: "up-calendar",
        });
      }
      // `settingsState` lê a disponibilidade na resposta de sucesso de
      // qualquer PATCH de configurações quando a agenda é da Atendly.
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
  return { calls, effectiveByTenant };
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

async function aiSettingsRow(owner: SessionHandle) {
  return getPrisma().aiSettings.findUnique({
    where: { tenantId: owner.tenantId },
  });
}

/**
 * O cadastro já cria `AiSettings` desligada (`registerBusiness`), então "não
 * gravou nada" é a linha continuar exatamente como estava antes da recusa:
 * desligada, sem execução marcada, com o mesmo estilo e o mesmo `updatedAt`.
 */
async function expectUnchanged(
  owner: SessionHandle,
  before: Awaited<ReturnType<typeof aiSettingsRow>>,
) {
  const after = await aiSettingsRow(owner);
  expect(before).not.toBeNull();
  expect(after?.enabled).toBe(false);
  expect(after?.activatedByRunId).toBeNull();
  expect(after?.tone).toBe(before?.tone);
  expect(after?.updatedAt.toISOString()).toBe(before?.updatedAt.toISOString());
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
  "Goal063/WU-01: PATCH /v1/settings/ai exige prova válida para ligar",
  () => {
    it.each([
      ["sem execução nenhuma", null],
      ["execução FAILED", activationRun({ state: "FAILED" })],
      ["execução PAUSED_BY_HUMAN", activationRun({ state: "PAUSED_BY_HUMAN" })],
      [
        "execução SUCCEEDED superada por troca de canal",
        activationRun({ supersededByChannelChange: true }),
      ],
    ] as const)("recusa ligar com %s, sem gravar nada", async (_label, run) => {
      const owner = await business(`no-proof-${created.length}`);
      stubUpstream({ [owner.tenantId]: { run } });
      const before = await aiSettingsRow(owner);

      const patch = await patchAi(owner, { enabled: true, tone: "BALANCED" });

      expect(patch.statusCode).toBe(409);
      expect(patch.json().error.code).toBe("AI_ACTIVATION_TEST_REQUIRED");
      await expectUnchanged(owner, before);
    });

    it("recusa ligar quando a leitura do teste falha, sem gravar nada", async () => {
      const owner = await business("proof-read-fails");
      stubUpstream({ [owner.tenantId]: { run: "FAIL" } });
      const before = await aiSettingsRow(owner);

      const patch = await patchAi(owner, { enabled: true, tone: "BALANCED" });

      expect(patch.statusCode).toBe(409);
      expect(patch.json().error.code).toBe("AI_ACTIVATION_TEST_REQUIRED");
      await expectUnchanged(owner, before);
    });

    it("liga com prova válida e serviço operacional, e grava activatedByRunId", async () => {
      const owner = await business("proof-activates");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-42" }) },
      });

      const patch = await patchAi(owner, { enabled: true, tone: "BALANCED" });

      expect(patch.statusCode).toBe(200);
      expect(patch.json().data.ai.enabled).toBe(true);
      const row = await aiSettingsRow(owner);
      expect(row?.enabled).toBe(true);
      expect(row?.activatedByRunId).toBe("run-42");
    });

    it("com prova válida mas sem serviço operacional, recusa 409 CONFLICT (não o código de prova), sem gravar", async () => {
      const owner = await business("proof-no-service");
      stubUpstream({
        [owner.tenantId]: { run: activationRun(), aiActivationReady: false },
      });
      const before = await aiSettingsRow(owner);

      const patch = await patchAi(owner, { enabled: true, tone: "BALANCED" });

      expect(patch.statusCode).toBe(409);
      expect(patch.json().error.code).toBe("CONFLICT");
      expect(patch.json().error.message).toContain("operational service");
      await expectUnchanged(owner, before);
    });

    it("a exclusão agendada recusa antes de checar a prova", async () => {
      const owner = await business("deletion-before-proof");
      stubUpstream({ [owner.tenantId]: { run: null } });

      const start = await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: { password: owner.password },
      });
      expect(start.statusCode).toBe(200);

      const patch = await patchAi(owner, { enabled: true, tone: "BALANCED" });

      expect(patch.statusCode).toBe(409);
      expect(patch.json().error.message).toContain("scheduled for deletion");
      expect(patch.json().error.code).not.toBe("AI_ACTIVATION_TEST_REQUIRED");
      expect((await aiSettingsRow(owner))?.enabled).toBe(false);
    });

    it("já ligada, enabled:true só troca o estilo: sem prova nova e sem mudar activatedByRunId", async () => {
      const owner = await business("already-on-style-only");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-7" }) },
      });
      const activated = await patchAi(owner, {
        enabled: true,
        tone: "BALANCED",
      });
      expect(activated.statusCode).toBe(200);

      // A execução deixa de existir (ou deixaria de valer); se a rota exigisse
      // prova de novo, esta segunda chamada recusaria.
      stubUpstream({ [owner.tenantId]: { run: null } });
      const styled = await patchAi(owner, { enabled: true, tone: "CASUAL" });

      expect(styled.statusCode).toBe(200);
      expect(styled.json().data.ai.tone).toBe("CASUAL");
      const row = await aiSettingsRow(owner);
      expect(row?.activatedByRunId).toBe("run-7");
    });

    it("pausar grava a execução válida corrente; a reconciliação de GET /v1/status não desfaz a pausa humana", async () => {
      const owner = await business("pause-not-undone");
      const run = activationRun({ id: "run-9" });
      stubUpstream({ [owner.tenantId]: { run } });

      const activated = await patchAi(owner, {
        enabled: true,
        tone: "BALANCED",
      });
      expect(activated.statusCode).toBe(200);

      const paused = await patchAi(owner, { enabled: false, tone: "BALANCED" });
      expect(paused.statusCode).toBe(200);
      const pausedRow = await aiSettingsRow(owner);
      expect(pausedRow?.enabled).toBe(false);
      // A execução (ainda válida) fica gravada como já usada.
      expect(pausedRow?.activatedByRunId).toBe("run-9");

      // Mesma execução, ainda SUCCEEDED e não superada: a reconciliação não
      // pode religar o que a pessoa acabou de pausar.
      const status = await readStatus(owner);
      expect(status.ai.reconciled).toBe("NOOP");
      expect(status.ai.desiredEnabled).toBe(false);
      expect((await aiSettingsRow(owner))?.enabled).toBe(false);
    });

    it("pausar a IA ligada antes deste Goal (sem activatedByRunId), com execução bem-sucedida existente: GET /v1/status não religa", async () => {
      const owner = await business("pause-legacy-on");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-legacy" }) },
      });
      // Negócio ligado à mão antes deste Goal: `enabled` sem execução gravada.
      // É o caso em que a autoativação religaria a IA pausada, porque a
      // execução bem-sucedida nunca foi marcada como usada.
      await getPrisma().aiSettings.update({
        where: { tenantId: owner.tenantId },
        data: { enabled: true, activatedByRunId: null },
      });

      const paused = await patchAi(owner, { enabled: false, tone: "BALANCED" });
      expect(paused.statusCode).toBe(200);

      // A leitura que reconcilia vem primeiro: é ela que religaria a IA se a
      // pausa não tivesse marcado a execução como usada.
      const status = await readStatus(owner);
      expect(status.ai.reconciled).not.toBe("ACTIVATED");
      expect(status.ai.desiredEnabled).toBe(false);
      const row = await aiSettingsRow(owner);
      expect(row?.enabled).toBe(false);
      expect(row?.activatedByRunId).toBe("run-legacy");
    });

    it("a IA religada à mão desliga sozinha quando a execução é superada por troca de canal", async () => {
      const owner = await business("manual-then-superseded");
      stubUpstream({
        [owner.tenantId]: { run: activationRun({ id: "run-11" }) },
      });
      const activated = await patchAi(owner, {
        enabled: true,
        tone: "BALANCED",
      });
      expect(activated.statusCode).toBe(200);

      stubUpstream({
        [owner.tenantId]: {
          run: activationRun({
            id: "run-11",
            supersededByChannelChange: true,
          }),
        },
      });
      const status = await readStatus(owner);

      expect(status.ai.reconciled).toBe("DEACTIVATED_BY_CHANNEL_CHANGE");
      expect(status.ai.desiredEnabled).toBe(false);
      const row = await aiSettingsRow(owner);
      expect(row?.enabled).toBe(false);
      expect(row?.activatedByRunId).toBeNull();
    });

    it("a prova de um negócio nunca liga a IA de outro", async () => {
      const withProof = await business("cross-tenant-with-proof");
      const withoutProof = await business("cross-tenant-without-proof");
      stubUpstream({
        [withProof.tenantId]: { run: activationRun({ id: "run-only-mine" }) },
        [withoutProof.tenantId]: { run: null },
      });
      const before = await aiSettingsRow(withoutProof);

      const refused = await patchAi(withoutProof, {
        enabled: true,
        tone: "BALANCED",
      });
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error.code).toBe("AI_ACTIVATION_TEST_REQUIRED");
      await expectUnchanged(withoutProof, before);

      const activated = await patchAi(withProof, {
        enabled: true,
        tone: "BALANCED",
      });
      expect(activated.statusCode).toBe(200);
      expect((await aiSettingsRow(withProof))?.enabled).toBe(true);
      await expectUnchanged(withoutProof, before);
    });
  },
);
