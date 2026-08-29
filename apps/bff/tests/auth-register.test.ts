import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { CURRENT_LEGAL_VERSIONS } from "../src/config/legal-versions.js";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  userCreate: vi.fn(),
  tenantCreate: vi.fn(),
  tenantMemberCreate: vi.fn(),
  businessProfileCreate: vi.fn(),
  legalAcceptanceCreate: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
  signSession: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("../src/lib/prisma.js", () => ({
  getPrisma: () => ({
    $transaction: mocks.transaction,
    user: {
      findUnique: mocks.findUnique,
    },
  }),
}));

vi.mock("../src/lib/password.js", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: vi.fn(),
}));

vi.mock("../src/lib/auth.js", () => ({
  clearSessionCookie: vi.fn(),
  currentUser: vi.fn(),
  requireAuth: vi.fn(),
  setSessionCookie: mocks.setSessionCookie,
  signSession: mocks.signSession,
}));

async function authApp() {
  const { registerAuthRoutes } = await import("../src/routes/auth.js");
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("INTERNAL_ERROR", "Internal error.", 500);
    void reply.code(appError.statusCode).send({
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
      },
      requestId: request.id,
    });
  });
  await registerAuthRoutes(app);
  return app;
}

const validPayload = {
  email: "owner@example.com",
  password: "safe-password",
  confirmPassword: "safe-password",
  termsAccepted: true,
  ...CURRENT_LEGAL_VERSIONS,
};

beforeEach(() => {
  mocks.findUnique.mockResolvedValue(null);
  mocks.hashPassword.mockResolvedValue("hashed-password");
  mocks.userCreate.mockResolvedValue({
    id: "user-1",
    email: "owner@example.com",
    createdAt: new Date("2026-08-14T15:00:00.000Z"),
  });
  mocks.tenantCreate.mockResolvedValue({ id: "tenant-1" });
  mocks.tenantMemberCreate.mockResolvedValue({ id: "member-1" });
  mocks.businessProfileCreate.mockResolvedValue({ id: "profile-1" });
  mocks.legalAcceptanceCreate.mockResolvedValue({ id: "acceptance-1" });
  mocks.transaction.mockImplementation(
    async (
      callback: (transaction: {
        user: { create: typeof mocks.userCreate };
        tenant: { create: typeof mocks.tenantCreate };
        tenantMember: { create: typeof mocks.tenantMemberCreate };
        businessProfile: { create: typeof mocks.businessProfileCreate };
        legalAcceptance: { create: typeof mocks.legalAcceptanceCreate };
      }) => Promise<unknown>,
    ) =>
      callback({
        user: { create: mocks.userCreate },
        tenant: { create: mocks.tenantCreate },
        tenantMember: { create: mocks.tenantMemberCreate },
        businessProfile: { create: mocks.businessProfileCreate },
        legalAcceptance: { create: mocks.legalAcceptanceCreate },
      }),
  );
  mocks.signSession.mockResolvedValue("session-token");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /auth/register legal acceptance", () => {
  it("rejects registration without Terms acceptance", async () => {
    const app = await authApp();
    const { termsAccepted: _, ...payload } = validPayload;
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(mocks.transaction).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ["termsVersion", "obsolete"],
    ["privacyPolicyVersion", "obsolete"],
  ])("rejects an invalid %s", async (field, value) => {
    const app = await authApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { ...validPayload, [field]: value },
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    await app.close();
  });

  it("creates the tenant foundation and acceptance in one transaction", async () => {
    const app = await authApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "owner@example.com",
          passwordHash: "hashed-password",
        }),
      }),
    );
    expect(mocks.tenantCreate).toHaveBeenCalledWith({
      data: { name: "Novo negócio" },
      select: { id: true },
    });
    expect(mocks.tenantMemberCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", userId: "user-1", role: "OWNER" },
    });
    expect(mocks.businessProfileCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        businessName: "",
        timezone: "America/Sao_Paulo",
        language: "pt-BR",
        currency: "BRL",
      },
    });
    expect(mocks.legalAcceptanceCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        ...CURRENT_LEGAL_VERSIONS,
      },
    });
    expect(
      mocks.legalAcceptanceCreate.mock.calls[0]?.[0]?.data,
    ).not.toHaveProperty("acceptedAt");
    expect(mocks.setSessionCookie).toHaveBeenCalled();
    await app.close();
  });
});
