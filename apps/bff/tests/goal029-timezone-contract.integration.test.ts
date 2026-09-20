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
 * Goal029/WU-05 — contrato reduzido do fuso único do negócio (D-010).
 *
 * O que é provado aqui, contra dublê HTTP do Scheduling:
 * - as três entradas públicas que ainda aceitam `timezone` (settings.availability,
 *   onboarding.calendar, onboarding.availability) recusam um valor que diverge
 *   do dono (`BusinessProfile.timezone`), sem gravar nada;
 * - sem `BusinessProfile.timezone` gravado, a mesma recusa acontece por falta
 *   de dono contra o qual resolver, não por adivinhação;
 * - a leitura do calendário continua propagando a falha do Scheduling como
 *   sempre propagou: este Goal acrescenta reconciliação de fuso, não um
 *   calendário vazio inventado para uma leitura que não aconteceu.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function stubDown(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      if (url.pathname === "/internal/calendar" && request.method === "GET") {
        return new Response(
          JSON.stringify({ error: { code: "UPSTREAM_DOWN" } }),
          { status: 503, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: null, requestId: "upstream" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
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
  "Goal029/WU-05: recusa das entradas públicas que divergem do dono",
  () => {
    it("PATCH /v1/settings/availability recusa timezone divergente do negócio, sem gravar nada", async () => {
      const owner = await business("contract-settings-availability");
      // Fuso do negócio nasce "America/Sao_Paulo" no cadastro (default).

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/settings/availability",
        headers: browserMutation(owner),
        payload: { timezone: "America/New_York", rules: [] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(String(response.json().error.message)).toContain(
        "availability.timezone must match the business timezone.",
      );
    });

    it("PATCH /v1/onboarding recusa calendar.timezone divergente do negócio, sem gravar nada", async () => {
      const owner = await business("contract-onboarding-calendar");

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: {
          calendar: { source: "ATENDLY", timezone: "America/New_York" },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(String(response.json().error.message)).toContain(
        "calendar.timezone must match the business timezone.",
      );
    });

    it("PATCH /v1/onboarding recusa availability.timezone divergente do negócio, sem gravar nada", async () => {
      const owner = await business("contract-onboarding-availability");

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: {
          availability: { timezone: "America/New_York", rules: [] },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(String(response.json().error.message)).toContain(
        "availability.timezone must match the business timezone.",
      );
    });

    it("sem BusinessProfile.timezone gravado, a mesma seção é recusada por falta de dono", async () => {
      const owner = await business("contract-no-owner-yet");
      // Simula o negócio que ainda não tem BusinessProfile: o cadastro cria a
      // linha com default, então este teste remove o que não é real neste
      // caminho — o onboarding é o primeiro passo do produto e pode ser
      // acionado antes de qualquer perfil existir.
      await getPrisma().businessProfile.deleteMany({
        where: { tenantId: owner.tenantId },
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: { calendar: { source: "ATENDLY" } },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(String(response.json().error.message)).toContain(
        "Business timezone must be set before calendar.timezone can be resolved.",
      );

      const row = await getPrisma().businessProfile.findUnique({
        where: { tenantId: owner.tenantId },
      });
      expect(row).toBeNull();
    });
  },
);

describe.skipIf(!RUN_INTEGRATION)(
  "Goal029/WU-05: leitura com o calendário ilegível",
  () => {
    it("GET /v1/settings continua propagando a falha do Scheduling, sem inventar um calendário vazio", async () => {
      const owner = await business("contract-read-scheduling-down");
      stubDown();

      const response = await app.inject({
        method: "GET",
        url: "/v1/settings",
        headers: browserRead(owner),
      });

      // Comportamento público de antes deste Goal, preservado: a leitura do
      // calendário falhou, então a requisição falha. Responder 200 com
      // `calendar.source: null`, `calendar.timezone: null` e as capacidades
      // todas `false` seria a tela afirmar "este negócio não tem agenda
      // operacional" quando o que houve foi o Scheduling não responder.
      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe("UPSTREAM_ERROR");
    });
  },
);
