import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENT_LEGAL_VERSIONS } from "../src/config/legal-versions.js";
import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { getPrisma } from "../src/lib/prisma.js";

const runIntegration = process.env.BFF_RUN_INTEGRATION_TESTS === "true";
const testDatabaseUrl = process.env.BFF_TEST_DATABASE_URL?.trim() ?? "";
const email = `legal-integration-${Date.now()}@example.invalid`;
let app: FastifyInstance;
let tenantId: string | undefined;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//u, ""));
}

function databasePort(url: string): number {
  return Number(new URL(url).port || "5432");
}

describe.skipIf(!runIntegration)("auth registration persistence", () => {
  beforeAll(async () => {
    // Sem URL de teste explícita a suíte falha em vez de cair no .env local:
    // um cadastro real não pode ser gravado no banco de desenvolvimento.
    if (!testDatabaseUrl) {
      throw new Error(
        "BFF_TEST_DATABASE_URL is required when BFF_RUN_INTEGRATION_TESTS=true.",
      );
    }
    if (env.DATABASE_URL !== testDatabaseUrl) {
      throw new Error(
        "DATABASE_URL must be the disposable database named by BFF_TEST_DATABASE_URL.",
      );
    }
    app = await buildApp();

    // Nome do banco sozinho não distingue dois servidores diferentes com o
    // mesmo nome: o endpoint efetivo também é conferido.
    const [endpoint] = await getPrisma().$queryRaw<
      { database: string; port: number; address: string | null }[]
    >`SELECT current_database() AS database, inet_server_port() AS port, host(inet_server_addr()) AS address`;
    if (endpoint.database !== databaseName(testDatabaseUrl)) {
      throw new Error(
        `Connected database ${endpoint.database} is not the declared test database.`,
      );
    }
    if (Number(endpoint.port) !== databasePort(testDatabaseUrl)) {
      throw new Error(
        `Connected server port ${endpoint.port} is not the declared test port.`,
      );
    }
    if (endpoint.address !== null && !LOOPBACK_HOSTS.has(endpoint.address)) {
      throw new Error(
        `Connected server address ${endpoint.address} is not loopback.`,
      );
    }
  });

  afterAll(async () => {
    if (app) {
      // Cascatas do schema removem legalAcceptance/tenantMember (via User) e
      // businessProfile/aiSettings/tenantMember (via Tenant).
      await getPrisma().user.deleteMany({ where: { email } });
      if (tenantId) {
        await getPrisma().tenant.deleteMany({ where: { id: tenantId } });
      }

      expect(await getPrisma().user.count({ where: { email } })).toBe(0);
      if (tenantId) {
        expect(await getPrisma().tenant.count({ where: { id: tenantId } })).toBe(
          0,
        );
        expect(
          await getPrisma().tenantMember.count({ where: { tenantId } }),
        ).toBe(0);
        expect(
          await getPrisma().businessProfile.count({ where: { tenantId } }),
        ).toBe(0);
        expect(
          await getPrisma().aiSettings.count({ where: { tenantId } }),
        ).toBe(0);
      }

      await app.close();
    }
  });

  it("persists tenant foundation and legal acceptance on POST /v1/auth/register", async () => {
    const beforeRequest = new Date();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "Integration-only-123",
        confirmPassword: "Integration-only-123",
        termsAccepted: true,
        ...CURRENT_LEGAL_VERSIONS,
      },
    });

    expect(response.statusCode).toBe(201);
    const user = await getPrisma().user.findUnique({
      where: { email },
      include: {
        legalAcceptances: true,
        tenantMemberships: {
          include: {
            tenant: { include: { businessProfile: true, aiSettings: true } },
          },
        },
      },
    });
    tenantId = user?.tenantMemberships[0]?.tenantId;
    expect(user?.id).toEqual(expect.any(String));
    expect(user?.legalAcceptances).toHaveLength(1);
    expect(user?.legalAcceptances[0]).toMatchObject(CURRENT_LEGAL_VERSIONS);
    expect(
      user?.legalAcceptances[0]?.acceptedAt.getTime(),
    ).toBeGreaterThanOrEqual(beforeRequest.getTime());
    expect(user?.legalAcceptances[0]?.acceptedAt.getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(user?.tenantMemberships).toHaveLength(1);
    expect(user?.tenantMemberships[0]?.role).toBe("OWNER");
    expect(user?.tenantMemberships[0]?.tenant.businessProfile).toMatchObject({
      businessName: "",
      timezone: "America/Sao_Paulo",
      language: "pt-BR",
      currency: "BRL",
    });
    expect(user?.tenantMemberships[0]?.tenant.aiSettings).toMatchObject({
      enabled: false,
    });
  });
});
