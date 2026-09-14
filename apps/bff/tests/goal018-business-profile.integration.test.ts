import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Perfil do negocio completo (Goal018, WU-01) — modalidades de atendimento,
 * endereco nulavel e versionamento do contexto, contra persistencia real.
 *
 * Prova o que e do BFF: migration aditiva nunca fabrica escolha para linha
 * existente; corpo sem `modalities` preserva o gravado; ON_SITE exige
 * endereco nao vazio com erro proprio; retirar ON_SITE nunca apaga um
 * endereco existente; e nenhum campo novo viaja para o Scheduling.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

function calendarPayload(overrides: Record<string, unknown> = {}) {
  return {
    source: null,
    timezone: null,
    integration: null,
    capabilities: {
      manageAvailability: false,
      manageServices: false,
      manageCustomers: false,
      createAppointments: false,
      migrate: false,
      aiActivationReady: false,
    },
    ...overrides,
  };
}

interface UpstreamCall {
  method: string;
  path: string;
  body: string | null;
}

const upstream: UpstreamCall[] = [];

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const body =
        request.method === "GET" || request.method === "DELETE"
          ? null
          : await request.text();
      upstream.push({ method: request.method, path: url.pathname, body });

      if (url.pathname === "/internal/calendar") {
        return new Response(
          JSON.stringify({ data: calendarPayload(), requestId: "upstream-calendar" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/ai-tenant-config") {
        return new Response(JSON.stringify({ ok: true, config: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: null, requestId: "upstream" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

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

afterEach(() => {
  vi.unstubAllGlobals();
  upstream.length = 0;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("Goal018/WU-01: perfil do negocio completo", () => {
  it("migração aditiva: linha sem os campos novos nasce com modalidades vazias, endereço nulo e versão projetada distinta da corrente", async () => {
    const owner = await business("profile-legacy-row");
    const prisma = getPrisma();
    // Simula a linha como ela existia antes desta migration: só as colunas
    // anteriores ao Goal018, nada de modalities/address/version no INSERT —
    // o Postgres aplica os defaults das colunas novas, exatamente como faz
    // para uma linha que já existia quando a migration rodou.
    await prisma.businessProfile.deleteMany({ where: { tenantId: owner.tenantId } });
    await prisma.$executeRaw`
      INSERT INTO "BusinessProfile" ("id", "tenantId", "businessName", "category", "timezone", "language", "currency", "createdAt", "updatedAt")
      VALUES (${`bp_${owner.tenantId}`}, ${owner.tenantId}, 'Legado', 'Beleza', 'America/Sao_Paulo', 'pt-BR', 'BRL', now(), now())
    `;

    const row = await prisma.businessProfile.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    expect(row.modalities).toEqual([]);
    expect(row.address).toBeNull();
    expect(row.businessContextVersion).not.toBe(row.businessContextProjectedVersion);
    expect(row.businessContextVersion).toBe(1);
    expect(row.businessContextProjectedVersion).toBe(0);
    // category continua sendo o segmento: nenhuma coluna concorrente nasceu.
    expect(row.category).toBe("Beleza");
  });

  it("corpo sem modalities preserva o que está gravado em PATCH /v1/settings/business", async () => {
    const owner = await business("profile-preserve-modalities");
    stubUpstream();

    const first = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio A",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: ["ONLINE"],
      },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.business.modalities).toEqual(["ONLINE"]);

    const second = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio A",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.business.modalities).toEqual(["ONLINE"]);

    const row = await getPrisma().businessProfile.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    expect(row.modalities).toEqual(["ONLINE"]);
    // O contador de versão sobe a cada escrita de negócio, nunca é timestamp.
    expect(row.businessContextVersion).toBe(3);
  });

  it("um conjunto vazio explícito de modalities é gravado, distinto de omissão", async () => {
    const owner = await business("profile-explicit-empty-modalities");
    stubUpstream();

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio B",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: ["ONLINE"],
      },
    });

    const cleared = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio B",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: [],
      },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().data.business.modalities).toEqual([]);
  });

  it("recusa ON_SITE sem endereço com 400 BUSINESS_ADDRESS_REQUIRED, apontando o campo, sem gravar nada", async () => {
    const owner = await business("profile-onsite-missing-address");
    stubUpstream();

    // O cadastro já provisiona a linha vazia (nome "", categoria nula); a
    // prova de "sem gravar nada" é essa linha continuar exatamente assim.
    const before = await getPrisma().businessProfile.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });

    const missing = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio C",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: ["ON_SITE"],
      },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe("BUSINESS_ADDRESS_REQUIRED");
    expect(missing.json().error.details.field).toBe("address");

    const empty = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio C",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: ["ON_SITE"],
        address: "   ",
      },
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe("BUSINESS_ADDRESS_REQUIRED");

    const after = await getPrisma().businessProfile.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    expect(after).toEqual(before);
  });

  it("sem ON_SITE o endereço nulo é aceito, e retirar ON_SITE de um perfil com endereço não apaga o endereço", async () => {
    const owner = await business("profile-remove-onsite-keeps-address");
    stubUpstream();

    const onSite = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio D",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: ["ON_SITE"],
        address: "Rua das Flores, 123",
      },
    });
    expect(onSite.statusCode).toBe(200);
    expect(onSite.json().data.business.address).toBe("Rua das Flores, 123");

    const removeOnSite = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio D",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: ["AT_HOME"],
      },
    });
    expect(removeOnSite.statusCode).toBe(200);
    expect(removeOnSite.json().data.business.modalities).toEqual(["AT_HOME"]);
    // Endereço não foi apagado por a rota não ter recebido a chave `address`.
    expect(removeOnSite.json().data.business.address).toBe("Rua das Flores, 123");

    const other = await business("profile-online-only-null-address");
    const onlineOnly = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(other),
      payload: {
        name: "Studio E",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: ["ONLINE"],
      },
    });
    expect(onlineOnly.statusCode).toBe(200);
    expect(onlineOnly.json().data.business.address).toBeNull();
  });

  it("PATCH /v1/onboarding recusa ON_SITE sem endereço com o mesmo erro próprio", async () => {
    const owner = await business("profile-onboarding-onsite-missing");
    stubUpstream();

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/onboarding",
      headers: browserMutation(owner),
      payload: {
        business: {
          name: "Studio F",
          category: "Beleza",
          timezone: "America/Sao_Paulo",
          modalities: ["ON_SITE"],
        },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("BUSINESS_ADDRESS_REQUIRED");
  });

  it("lê e grava modalidades e endereço na seção business de GET/PATCH /v1/onboarding", async () => {
    const owner = await business("profile-onboarding-read-write");
    stubUpstream();

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/onboarding",
      headers: browserMutation(owner),
      payload: {
        business: {
          name: "Studio G",
          category: "Beleza",
          timezone: "America/Sao_Paulo",
          modalities: ["ON_SITE", "ONLINE"],
          address: "Av. Central, 456",
        },
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.business.modalities).toEqual(["ON_SITE", "ONLINE"]);
    expect(patch.json().data.business.address).toBe("Av. Central, 456");

    const get = await app.inject({
      method: "GET",
      url: "/v1/onboarding",
      headers: browserMutation(owner),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.business.modalities).toEqual(["ON_SITE", "ONLINE"]);
    expect(get.json().data.business.address).toBe("Av. Central, 456");
  });

  it("nenhum campo de modalidade ou endereço viaja para o Scheduling em PATCH /v1/settings/business", async () => {
    const owner = await business("profile-no-scheduling-projection");
    stubUpstream();

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio H",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: ["ON_SITE"],
        address: "Rua Nova, 789",
      },
    });

    const schedulingCalls = upstream.filter(
      (call) => !call.path.startsWith("/internal/ai-tenant-config"),
    );
    for (const call of schedulingCalls) {
      if (!call.body) continue;
      const parsed = JSON.parse(call.body) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty("modalities");
      expect(parsed).not.toHaveProperty("address");
    }
  });
});
