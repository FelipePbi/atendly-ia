import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENT_LEGAL_VERSIONS } from "../src/config/legal-versions.js";
import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";

const runIntegration = process.env.BFF_RUN_INTEGRATION_TESTS === "true";
const email = `legal-integration-${Date.now()}@example.invalid`;
let app: FastifyInstance;

describe.skipIf(!runIntegration)("auth registration persistence", () => {
  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await getPrisma().user.deleteMany({ where: { email } });
      await app.close();
    }
  });

  it("persists current versions and a database-generated acceptance timestamp", async () => {
    const beforeRequest = new Date();
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password: "Integration-only-123",
        confirmPassword: "Integration-only-123",
        termsAccepted: true,
        ...CURRENT_LEGAL_VERSIONS
      }
    });

    expect(response.statusCode).toBe(201);
    const user = await getPrisma().user.findUnique({
      where: { email },
      include: { legalAcceptances: true }
    });
    expect(user?.legalAcceptances).toHaveLength(1);
    expect(user?.legalAcceptances[0]).toMatchObject(CURRENT_LEGAL_VERSIONS);
    expect(user?.legalAcceptances[0]?.acceptedAt.getTime()).toBeGreaterThanOrEqual(beforeRequest.getTime());
    expect(user?.legalAcceptances[0]?.acceptedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
