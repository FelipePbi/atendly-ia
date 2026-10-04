import { retentionSettingsSchema } from "@avenly-ia/public-api-contract";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
 * Goal023/WU-01 — GET/PATCH /v1/settings/retention contra PostgreSQL real.
 *
 * O que só o banco e o servidor HTTP inteiro provam: ausência de linha
 * responde Comercial 90 / Pessoal 30; fora da allowlist é recusado sem
 * gravar; reduzir sem `confirmReduction` é recusado com categoria e de/para
 * nomeados; aumentar nunca exige confirmação; as duas categorias divergem
 * livremente; a leitura devolve a allowlist, a invariante de Não
 * classificadas e a última varredura concluída; e nenhuma das rotas aceita
 * `tenantId` do chamador.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal023/WU-01: GET/PATCH /v1/settings/retention",
  () => {
    it("nega as duas rotas sem sessão", async () => {
      const get = await app.inject({
        method: "GET",
        url: "/v1/settings/retention",
      });
      expect(get.statusCode).toBe(401);

      const patch = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        payload: { commercialRetentionDays: 180 },
      });
      expect(patch.statusCode).toBe(401);
    });

    it("sem linha, GET responde Comercial 90 / Pessoal 30", async () => {
      const owner = await business("retention-default");

      const response = await app.inject({
        method: "GET",
        url: "/v1/settings/retention",
        headers: browserRead(owner),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        data: {
          commercialRetentionDays: number;
          personalRetentionDays: number;
          appliesFrom: string;
        };
      };
      expect(body.data.commercialRetentionDays).toBe(90);
      expect(body.data.personalRetentionDays).toBe(30);
      expect(body.data.appliesFrom).toBe("NEXT_SWEEP");
    });

    it("GET devolve a allowlist, a invariante de Não classificadas e a última varredura", async () => {
      const owner = await business("retention-contract");

      const response = await app.inject({
        method: "GET",
        url: "/v1/settings/retention",
        headers: browserRead(owner),
      });
      expect(response.statusCode).toBe(200);
      const data = (
        response.json() as {
          data: {
            retentionDaysOptions: number[];
            unclassifiedRetentionFollows: string;
            lastSweepCompletedAt: string | null;
          };
        }
      ).data;

      // A allowlist é do servidor, e é exatamente a do produto.
      expect(data.retentionDaysOptions).toEqual([30, 90, 180, 365]);
      // U-01 (D-096) dito no contrato, não só na tela.
      expect(data.unclassifiedRetentionFollows).toBe("COMMERCIAL");
      expect(data).not.toHaveProperty("unclassifiedPurged");
      expect(retentionSettingsSchema.safeParse(data).success).toBe(true);
      // Negócio nunca varrido responde nulo, nunca uma data inventada.
      expect(data.lastSweepCompletedAt).toBeNull();
    });

    it("PATCH devolve a mesma forma do GET, sem sugerir que varreu", async () => {
      const owner = await business("retention-patch-shape");

      const patch = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 180 },
      });
      expect(patch.statusCode).toBe(200);
      const data = (
        patch.json() as {
          data: {
            retentionDaysOptions: number[];
            unclassifiedRetentionFollows: string;
            lastSweepCompletedAt: string | null;
            appliesFrom: string;
          };
        }
      ).data;
      expect(data.retentionDaysOptions).toEqual([30, 90, 180, 365]);
      expect(data.unclassifiedRetentionFollows).toBe("COMMERCIAL");
      expect(data).not.toHaveProperty("unclassifiedPurged");
      expect(retentionSettingsSchema.safeParse(data).success).toBe(true);
      // Gravar prazo não varre: a última varredura continua nula.
      expect(data.lastSweepCompletedAt).toBeNull();
      expect(data.appliesFrom).toBe("NEXT_SWEEP");
    });

    it("grava o autor da escrita em updatedBy, da sessão e não do corpo", async () => {
      const owner = await business("retention-updated-by");

      const first = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 180, updatedBy: "nao-e-daqui" },
      });
      expect(first.statusCode).toBe(200);

      const row = await getPrisma().retentionSettings.findUnique({
        where: { tenantId: owner.tenantId },
        select: { updatedBy: true, commercialRetentionDays: true },
      });
      // O autor vem do `requireTenantContext`; `updatedBy` no corpo é ignorado
      // pelo schema e não tem como virar autor de nada.
      expect(row?.updatedBy).toBe(owner.userId);
      expect(row?.commercialRetentionDays).toBe(180);

      // Rastro da escrita, não da criação: a segunda gravação reafirma o autor.
      const second = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 365 },
      });
      expect(second.statusCode).toBe(200);
      const after = await getPrisma().retentionSettings.findUnique({
        where: { tenantId: owner.tenantId },
        select: { updatedBy: true },
      });
      expect(after?.updatedBy).toBe(owner.userId);

      // E nada disso vaza no contrato público: §7 não lista autor.
      expect(
        Object.keys((second.json() as { data: object }).data),
      ).not.toContain("updatedBy");
    });

    it("valores fora de 30/90/180/365 são recusados e não gravam", async () => {
      const owner = await business("retention-out-of-allowlist");

      const rejected = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 60 },
      });
      expect(rejected.statusCode).toBe(400);

      const after = await app.inject({
        method: "GET",
        url: "/v1/settings/retention",
        headers: browserRead(owner),
      });
      expect(
        (after.json() as { data: { commercialRetentionDays: number } }).data
          .commercialRetentionDays,
      ).toBe(90);
    });

    it("comercial e pessoal divergem ao mesmo tempo", async () => {
      const owner = await business("retention-diverge");

      const patch = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: {
          commercialRetentionDays: 365,
          personalRetentionDays: 180,
        },
      });
      expect(patch.statusCode).toBe(200);
      const body = patch.json() as {
        data: {
          commercialRetentionDays: number;
          personalRetentionDays: number;
        };
      };
      expect(body.data.commercialRetentionDays).toBe(365);
      expect(body.data.personalRetentionDays).toBe(180);
    });

    it("aumentar não exige confirmação", async () => {
      const owner = await business("retention-increase");

      const patch = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 365 },
      });
      expect(patch.statusCode).toBe(200);
      expect(
        (patch.json() as { data: { commercialRetentionDays: number } }).data
          .commercialRetentionDays,
      ).toBe(365);
    });

    it("reduzir sem confirmação é recusado nomeando categoria e de/para; a linha não muda", async () => {
      const owner = await business("retention-reduce-refused");

      await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 365, personalRetentionDays: 180 },
      });

      const refused = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 90 },
      });
      expect(refused.statusCode).toBe(409);
      const refusedBody = refused.json() as {
        error: { code: string; details: { reductions: unknown[] } };
      };
      expect(refusedBody.error.code).toBe(
        "RETENTION_REDUCTION_REQUIRES_CONFIRMATION",
      );
      expect(refusedBody.error.details.reductions).toEqual([
        { category: "COMMERCIAL", from: 365, to: 90 },
      ]);

      const unchanged = await app.inject({
        method: "GET",
        url: "/v1/settings/retention",
        headers: browserRead(owner),
      });
      expect(
        (unchanged.json() as { data: { commercialRetentionDays: number } }).data
          .commercialRetentionDays,
      ).toBe(365);
    });

    it("reduzir com confirmação explícita é aceito", async () => {
      const owner = await business("retention-reduce-confirmed");

      await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 365 },
      });

      const confirmed = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 90, confirmReduction: true },
      });
      expect(confirmed.statusCode).toBe(200);
      expect(
        (confirmed.json() as { data: { commercialRetentionDays: number } }).data
          .commercialRetentionDays,
      ).toBe(90);
    });

    it("tenantId enviado no corpo não escapa da sessão", async () => {
      const a = await business("retention-tenant-a");
      const b = await business("retention-tenant-b");

      const patch = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(a),
        payload: { commercialRetentionDays: 365, tenantId: b.tenantId },
      });
      expect(patch.statusCode).toBe(200);

      const bState = await app.inject({
        method: "GET",
        url: "/v1/settings/retention",
        headers: browserRead(b),
      });
      expect(
        (bState.json() as { data: { commercialRetentionDays: number } }).data
          .commercialRetentionDays,
      ).toBe(90);
    });
  },
);
