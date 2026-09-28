import { createHash, randomBytes } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { CURRENT_LEGAL_VERSIONS } from "../src/config/legal-versions.js";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/lib/password.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  ALLOWED_ORIGIN,
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  cookieValue,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal064/WU-01 — nome no cadastro, regra de senha única (U-10) e
 * redefinição de senha com erros separados. Todos os casos rodam contra
 * PostgreSQL real; a entrega de recuperação é dublê (fetch stubado), nunca
 * um e-mail real.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];
const extraUserIds: string[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function uniqueEmail(label: string): string {
  return `goal064-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createResetToken(
  userId: string,
  overrides: { expiresAt?: Date; usedAt?: Date | null } = {},
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getPrisma().passwordResetToken.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 600_000),
      usedAt: overrides.usedAt ?? null,
    },
  });
  return token;
}

describe.skipIf(!RUN_INTEGRATION)(
  "goal064 — account name and single password rule",
  () => {
    beforeAll(async () => {
      app = await buildApp();
      await assertDisposableTarget();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      if (!app) return;
      await cleanupBusinesses(created);
      if (extraUserIds.length > 0) {
        await getPrisma().user.deleteMany({
          where: { id: { in: extraUserIds } },
        });
      }
      await app.close();
    });

    it("refuses registration without a name, with an empty name, and with a whitespace-only name, and creates nothing", async () => {
      for (const name of [undefined, "", "   "]) {
        const email = uniqueEmail("no-name");
        const payload: Record<string, unknown> = {
          email,
          password: "Integration-only-123",
          // Corpo antigo, com confirmPassword, para isolar a falta de nome
          // como único motivo da recusa em qualquer versão do schema.
          confirmPassword: "Integration-only-123",
          termsAccepted: true,
          ...CURRENT_LEGAL_VERSIONS,
        };
        if (name !== undefined) payload.name = name;

        const response = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          headers: { origin: ALLOWED_ORIGIN },
          payload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("VALIDATION_ERROR");
        expect(await getPrisma().user.count({ where: { email } })).toBe(0);
      }
    });

    it("accepts registration with a name and without confirmPassword, and returns the name on register, login and session", async () => {
      const email = uniqueEmail("with-name");

      const registered = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { origin: ALLOWED_ORIGIN },
        payload: {
          email,
          name: "  Maria Owner  ",
          password: "Integration-only-123",
          termsAccepted: true,
          ...CURRENT_LEGAL_VERSIONS,
        },
      });
      expect(registered.statusCode).toBe(201);
      expect(registered.json().data.user.name).toBe("Maria Owner");

      const user = await getPrisma().user.findUniqueOrThrow({
        where: { email },
      });
      extraUserIds.push(user.id);
      expect(user.name).toBe("Maria Owner");

      const login = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { email, password: "Integration-only-123" },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json().data.user.name).toBe("Maria Owner");

      const session = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: {
          cookie: `${env.SESSION_COOKIE_NAME}=${cookieValue(login, env.SESSION_COOKIE_NAME)}`,
        },
      });
      expect(session.statusCode).toBe(200);
      expect(session.json().data.user.name).toBe("Maria Owner");
    });

    it("applies the U-10 password rule to register, reset-password and PATCH password, but not to login", async () => {
      for (const weakPassword of ["abcdefgh", "12345678"]) {
        const email = uniqueEmail("weak-register");
        const response = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          headers: { origin: ALLOWED_ORIGIN },
          payload: {
            email,
            name: "Weak Password",
            password: weakPassword,
            termsAccepted: true,
            ...CURRENT_LEGAL_VERSIONS,
          },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("VALIDATION_ERROR");
        expect(response.json().error.details.fieldErrors.password).toBeDefined();
        expect(await getPrisma().user.count({ where: { email } })).toBe(0);
      }

      // Conta antiga com senha fora da regra nova (letras, sem número),
      // gravada direto no banco: login continua funcionando.
      const legacyEmail = uniqueEmail("legacy-login");
      const legacyPassword = "onlyletters";
      const legacyUser = await getPrisma().user.create({
        data: {
          email: legacyEmail,
          passwordHash: await hashPassword(legacyPassword),
          name: "Legacy Account",
        },
      });
      extraUserIds.push(legacyUser.id);
      const legacyLogin = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { email: legacyEmail, password: legacyPassword },
      });
      expect(legacyLogin.statusCode).toBe(200);

      // reset-password com senha fora da regra: 400 no campo, token não
      // consumido.
      const session = await business("weak-reset");
      const resetToken = await createResetToken(session.userId);
      const weakReset = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { token: resetToken, newPassword: "onlyletters" },
      });
      expect(weakReset.statusCode).toBe(400);
      expect(weakReset.json().error.code).toBe("VALIDATION_ERROR");
      const unusedRow = await getPrisma().passwordResetToken.findUniqueOrThrow(
        { where: { tokenHash: tokenHash(resetToken) } },
      );
      expect(unusedRow.usedAt).toBeNull();

      // PATCH /v1/auth/password com senha fora da regra: 400 no campo.
      const weakPatch = await app.inject({
        method: "PATCH",
        url: "/v1/auth/password",
        headers: browserMutation(session),
        payload: {
          currentPassword: session.password,
          newPassword: "onlyletters",
          confirmPassword: "onlyletters",
        },
      });
      expect(weakPatch.statusCode).toBe(400);
      expect(weakPatch.json().error.code).toBe("VALIDATION_ERROR");
      expect(
        weakPatch.json().error.details.fieldErrors.newPassword,
      ).toBeDefined();

      // PATCH /v1/auth/password com confirmPassword divergente: 400 no
      // campo confirmPassword, senha não trocada.
      const mismatchPatch = await app.inject({
        method: "PATCH",
        url: "/v1/auth/password",
        headers: browserMutation(session),
        payload: {
          currentPassword: session.password,
          newPassword: "Integration-only-321",
          confirmPassword: "Integration-only-999",
        },
      });
      expect(mismatchPatch.statusCode).toBe(400);
      expect(mismatchPatch.json().error.code).toBe("VALIDATION_ERROR");
      expect(
        mismatchPatch.json().error.details.fieldErrors.confirmPassword,
      ).toBeDefined();

      const stillOldPassword = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { email: session.email, password: session.password },
      });
      expect(stillOldPassword.statusCode).toBe(200);
    });

    it("refuses an invalid, expired or already used reset token with a dedicated code, distinct from VALIDATION_ERROR", async () => {
      const session = await business("token-invalid");

      const nonexistent = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        headers: { origin: ALLOWED_ORIGIN },
        payload: {
          token: randomBytes(32).toString("base64url"),
          newPassword: "Integration-only-999",
        },
      });
      expect(nonexistent.statusCode).toBe(400);
      expect(nonexistent.json().error.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
      expect(nonexistent.json().error.code).not.toBe("VALIDATION_ERROR");

      const expiredToken = await createResetToken(session.userId, {
        expiresAt: new Date(Date.now() - 60_000),
      });
      const expired = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { token: expiredToken, newPassword: "Integration-only-999" },
      });
      expect(expired.statusCode).toBe(400);
      expect(expired.json().error.code).toBe("PASSWORD_RESET_TOKEN_INVALID");

      const usedToken = await createResetToken(session.userId, {
        usedAt: new Date(),
      });
      const used = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { token: usedToken, newPassword: "Integration-only-999" },
      });
      expect(used.statusCode).toBe(400);
      expect(used.json().error.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
    });

    it("refuses resetting to the current password without consuming the token, and lets a valid password through next", async () => {
      const session = await business("token-reuse");
      const resetToken = await createResetToken(session.userId);

      const sameAsCurrent = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { token: resetToken, newPassword: session.password },
      });
      expect(sameAsCurrent.statusCode).toBe(400);
      expect(sameAsCurrent.json().error.code).toBe("VALIDATION_ERROR");
      expect(
        sameAsCurrent.json().error.details.fieldErrors.newPassword,
      ).toBeDefined();

      const stillUnused = await getPrisma().passwordResetToken.findUniqueOrThrow(
        { where: { tokenHash: tokenHash(resetToken) } },
      );
      expect(stillUnused.usedAt).toBeNull();

      const newPassword = "Integration-only-777";
      const validReset = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { token: resetToken, newPassword },
      });
      expect(validReset.statusCode).toBe(200);

      const loginNew = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { email: session.email, password: newPassword },
      });
      expect(loginNew.statusCode).toBe(200);
    });

    it("runs forgot-password -> reset-password -> login end to end with the delivery double", async () => {
      const originalUrl = env.PASSWORD_RESET_DELIVERY_URL;
      env.PASSWORD_RESET_DELIVERY_URL = "http://127.0.0.1:9/password-reset-delivery";
      try {
        const session = await business("delivery-flow");
        let capturedResetUrl = "";
        vi.stubGlobal(
          "fetch",
          vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input as RequestInfo, init);
            const body = (await request.json()) as { resetUrl: string };
            capturedResetUrl = body.resetUrl;
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }),
        );

        const forgot = await app.inject({
          method: "POST",
          url: "/v1/auth/forgot-password",
          headers: { origin: ALLOWED_ORIGIN },
          payload: { email: session.email },
        });
        expect(forgot.statusCode).toBe(200);
        expect(capturedResetUrl).not.toBe("");

        const token = new URL(capturedResetUrl).searchParams.get("token");
        expect(token).not.toBeNull();

        const newPassword = "Integration-only-888";
        const reset = await app.inject({
          method: "POST",
          url: "/v1/auth/reset-password",
          headers: { origin: ALLOWED_ORIGIN },
          payload: { token, newPassword },
        });
        expect(reset.statusCode).toBe(200);

        const loginNew = await app.inject({
          method: "POST",
          url: "/v1/auth/login",
          headers: { origin: ALLOWED_ORIGIN },
          payload: { email: session.email, password: newPassword },
        });
        expect(loginNew.statusCode).toBe(200);

        const loginOld = await app.inject({
          method: "POST",
          url: "/v1/auth/login",
          headers: { origin: ALLOWED_ORIGIN },
          payload: { email: session.email, password: session.password },
        });
        expect(loginOld.statusCode).toBe(401);
      } finally {
        env.PASSWORD_RESET_DELIVERY_URL = originalUrl;
      }
    });

    it("refuses forgot-password without PASSWORD_RESET_DELIVERY_URL configured, and writes no token", async () => {
      const originalUrl = env.PASSWORD_RESET_DELIVERY_URL;
      env.PASSWORD_RESET_DELIVERY_URL = "";
      try {
        const session = await business("no-delivery");

        const forgot = await app.inject({
          method: "POST",
          url: "/v1/auth/forgot-password",
          headers: { origin: ALLOWED_ORIGIN },
          payload: { email: session.email },
        });
        expect(forgot.statusCode).toBe(503);
        expect(forgot.json().error.code).toBe("CONFIGURATION_ERROR");

        expect(
          await getPrisma().passwordResetToken.count({
            where: { userId: session.userId },
          }),
        ).toBe(0);
      } finally {
        env.PASSWORD_RESET_DELIVERY_URL = originalUrl;
      }
    });
  },
);
