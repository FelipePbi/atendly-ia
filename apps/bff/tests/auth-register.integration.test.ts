import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENT_LEGAL_VERSIONS } from "../src/config/legal-versions.js";
import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";

const runIntegration = process.env.BFF_RUN_INTEGRATION_TESTS === "true";
const email = `legal-integration-${Date.now()}@example.invalid`;
let app: FastifyInstance;
let tenantId: string | undefined;

describe.skipIf(!runIntegration)("auth registration persistence", () => {
  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await getPrisma().user.deleteMany({ where: { email } });
      if (tenantId) {
        await getPrisma().tenant.deleteMany({ where: { id: tenantId } });
      }
      await app.close();
    }
  });

  it("persists tenant foundation and legal acceptance atomically", async () => {
    const beforeRequest = new Date();
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
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
            tenant: { include: { businessProfile: true } },
          },
        },
      },
    });
    tenantId = user?.tenantMemberships[0]?.tenantId;
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
  });
});
