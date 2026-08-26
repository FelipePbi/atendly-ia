import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { CURRENT_LEGAL_VERSIONS } from "../src/config/legal-versions.js";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  hashPassword: vi.fn(),
  signSession: vi.fn(),
  setSessionCookie: vi.fn()
}));

vi.mock("../src/lib/prisma.js", () => ({
  getPrisma: () => ({
    user: {
      findUnique: mocks.findUnique,
      create: mocks.create
    }
  })
}));

vi.mock("../src/lib/password.js", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: vi.fn()
}));

vi.mock("../src/lib/auth.js", () => ({
  clearSessionCookie: vi.fn(),
  currentUser: vi.fn(),
  requireAuth: vi.fn(),
  setSessionCookie: mocks.setSessionCookie,
  signSession: mocks.signSession
}));

async function authApp() {
  const { registerAuthRoutes } = await import("../src/routes/auth.js");
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    const appError = error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "Internal error.", 500);
    void reply.code(appError.statusCode).send({
      error: { code: appError.code, message: appError.message, details: appError.details },
      requestId: request.id
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
  ...CURRENT_LEGAL_VERSIONS
};

beforeEach(() => {
  mocks.findUnique.mockResolvedValue(null);
  mocks.hashPassword.mockResolvedValue("hashed-password");
  mocks.create.mockResolvedValue({
    id: "user-1",
    email: "owner@example.com",
    createdAt: new Date("2026-08-14T15:00:00.000Z")
  });
  mocks.signSession.mockResolvedValue("session-token");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /auth/register legal acceptance", () => {
  it("rejects registration without Terms acceptance", async () => {
    const app = await authApp();
    const { termsAccepted: _, ...payload } = validPayload;
    const response = await app.inject({ method: "POST", url: "/auth/register", payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(mocks.create).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ["termsVersion", "obsolete"],
    ["privacyPolicyVersion", "obsolete"]
  ])("rejects an invalid %s", async (field, value) => {
    const app = await authApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { ...validPayload, [field]: value }
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("creates the user and acceptance together with server-managed timestamp", async () => {
    const app = await authApp();
    const response = await app.inject({ method: "POST", url: "/auth/register", payload: validPayload });

    expect(response.statusCode).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: "owner@example.com",
        passwordHash: "hashed-password",
        legalAcceptances: {
          create: CURRENT_LEGAL_VERSIONS
        }
      })
    }));
    const createData = mocks.create.mock.calls[0]?.[0]?.data;
    expect(createData.legalAcceptances.create).not.toHaveProperty("acceptedAt");
    expect(mocks.setSessionCookie).toHaveBeenCalled();
    await app.close();
  });
});
