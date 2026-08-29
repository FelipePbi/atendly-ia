import { createHash, randomBytes } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { PasswordResetDeliveryClient } from "../../clients/password-reset-delivery.js";
import { env } from "../../config/env.js";
import { CURRENT_LEGAL_VERSIONS } from "../../config/legal-versions.js";
import {
  clearSessionCookie,
  currentUser,
  setSessionCookie,
  signSession,
} from "../../lib/auth.js";
import { businessProfileDto, tenantDto, userDto } from "../../lib/dto.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse, parseBody } from "../../lib/http.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";

const emailSchema = z.string().email().trim().toLowerCase();
const registerSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
    termsAccepted: z.literal(true),
    termsVersion: z.literal(CURRENT_LEGAL_VERSIONS.termsVersion),
    privacyPolicyVersion: z.literal(
      CURRENT_LEGAL_VERSIONS.privacyPolicyVersion,
    ),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "New password must differ from current password.",
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
const forgotPasswordSchema = z.object({ email: emailSchema });
const resetPasswordSchema = z
  .object({
    token: z.string().min(32).max(512),
    newPassword: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export async function registerV1AuthRoutes(
  app: FastifyInstance,
): Promise<void> {
  const passwordResetDelivery = new PasswordResetDeliveryClient();
  app.post("/v1/auth/register", async (request, reply) => {
    const body = parseBody(registerSchema, request.body);
    const prisma = getPrisma();
    if (
      await prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true },
      })
    ) {
      throw new AppError("CONFLICT", "Email is already registered.", 409);
    }

    const passwordHash = await hashPassword(body.password);
    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: body.email,
          passwordHash,
          settings: { create: { aiEnabled: false } },
        },
        select: { id: true, email: true, createdAt: true },
      });
      const tenant = await transaction.tenant.create({
        data: { name: "Novo negócio" },
      });
      await transaction.tenantMember.create({
        data: { tenantId: tenant.id, userId: user.id, role: "OWNER" },
      });
      await transaction.businessProfile.create({
        data: {
          tenantId: tenant.id,
          businessName: "",
          timezone: "America/Sao_Paulo",
          language: "pt-BR",
          currency: "BRL",
        },
      });
      await transaction.legalAcceptance.create({
        data: {
          userId: user.id,
          termsVersion: body.termsVersion,
          privacyPolicyVersion: body.privacyPolicyVersion,
        },
      });
      return { user, tenant };
    });

    setSessionCookie(reply, await signSession(result.user));
    return reply.code(201).send(
      dataResponse(request, {
        user: userDto(result.user),
        tenant: tenantDto(result.tenant, "OWNER"),
      }),
    );
  });

  app.post(
    "/v1/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = parseBody(loginSchema, request.body);
      const user = await getPrisma().user.findUnique({
        where: { email: body.email },
      });
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        throw new AppError("UNAUTHORIZED", "Invalid credentials.", 401);
      }
      setSessionCookie(
        reply,
        await signSession({ id: user.id, email: user.email }),
      );
      return dataResponse(request, { user: userDto(user) });
    },
  );

  app.post("/v1/auth/logout", async (request, reply) => {
    clearSessionCookie(reply);
    return dataResponse(request, { ok: true });
  });

  app.get(
    "/v1/auth/session",
    { preHandler: requireTenantContext },
    async (request) => {
      const sessionUser = currentUser(request);
      const context = currentTenantContext(request);
      const [user, tenant] = await Promise.all([
        getPrisma().user.findUnique({ where: { id: sessionUser.id } }),
        getPrisma().tenant.findUnique({
          where: { id: context.tenantId },
          include: { businessProfile: true },
        }),
      ]);
      if (!user || !tenant) {
        throw new AppError("NOT_FOUND", "Session context was not found.", 404);
      }
      return dataResponse(request, {
        user: userDto(user),
        tenant: tenantDto(tenant, context.role),
        businessProfile: businessProfileDto(tenant.businessProfile),
        onboardingCompleted: Boolean(
          tenant.businessProfile?.onboardingCompletedAt,
        ),
      });
    },
  );

  app.patch(
    "/v1/auth/password",
    { preHandler: requireTenantContext },
    async (request) => {
      const sessionUser = currentUser(request);
      const body = parseBody(passwordSchema, request.body);
      const user = await getPrisma().user.findUnique({
        where: { id: sessionUser.id },
      });
      if (!user) throw new AppError("NOT_FOUND", "User was not found.", 404);
      if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
        throw new AppError(
          "UNAUTHORIZED",
          "Current password is incorrect.",
          401,
        );
      }
      await getPrisma().user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.newPassword) },
      });
      return dataResponse(request, { ok: true });
    },
  );

  app.post(
    "/v1/auth/forgot-password",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request) => {
      if (!env.PASSWORD_RESET_DELIVERY_URL) {
        throw new AppError(
          "CONFIGURATION_ERROR",
          "Password recovery is temporarily unavailable.",
          503,
        );
      }
      const body = parseBody(forgotPasswordSchema, request.body);
      const user = await getPrisma().user.findUnique({
        where: { email: body.email },
        select: { id: true, email: true },
      });
      if (user) {
        try {
          const token = randomBytes(32).toString("base64url");
          const expiresAt = new Date(
            Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000,
          );
          await getPrisma().$transaction([
            getPrisma().passwordResetToken.deleteMany({
              where: { userId: user.id, usedAt: null },
            }),
            getPrisma().passwordResetToken.create({
              data: {
                userId: user.id,
                tokenHash: tokenHash(token),
                expiresAt,
              },
            }),
          ]);
          const resetUrl = new URL(env.PASSWORD_RESET_PUBLIC_URL);
          resetUrl.searchParams.set("token", token);
          await passwordResetDelivery.send({
            to: user.email,
            resetUrl: resetUrl.toString(),
            expiresAt: expiresAt.toISOString(),
            requestId: request.id,
          });
        } catch (error) {
          request.log.warn(
            { error: error instanceof Error ? error.name : "DELIVERY_ERROR" },
            "Password reset delivery unavailable",
          );
        }
      }
      return dataResponse(request, {
        message:
          "If an account exists for this email, recovery instructions will be sent.",
      });
    },
  );

  app.post("/v1/auth/reset-password", async (request) => {
    const body = parseBody(resetPasswordSchema, request.body);
    const prisma = getPrisma();
    const reset = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: tokenHash(body.token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Password reset token is invalid or expired.",
        400,
      );
    }
    const passwordHash = await hashPassword(body.newPassword);
    await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.passwordResetToken.updateMany({
        where: {
          id: reset.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Password reset token is invalid or expired.",
          400,
        );
      }
      await transaction.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await transaction.passwordResetToken.deleteMany({
        where: { userId: reset.userId, id: { not: reset.id } },
      });
    });
    return dataResponse(request, { ok: true });
  });
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
