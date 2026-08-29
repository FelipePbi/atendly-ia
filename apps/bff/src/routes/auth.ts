import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { CURRENT_LEGAL_VERSIONS } from "../config/legal-versions.js";
import {
  clearSessionCookie,
  currentUser,
  setSessionCookie,
  signSession,
} from "../lib/auth.js";
import {
  businessProfileDto,
  instanceDto,
  onboardingDto,
  profileDto,
  settingsDto,
  tenantDto,
  userDto,
} from "../lib/dto.js";
import { AppError } from "../lib/errors.js";
import { dataResponse, parseBody } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { getPrisma } from "../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../lib/tenant-context.js";

const emailSchema = z.string().email().trim().toLowerCase();

const registerSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    termsAccepted: z.literal(true, { error: "Terms of Use must be accepted." }),
    termsVersion: z.literal(CURRENT_LEGAL_VERSIONS.termsVersion, {
      error: "Terms of Use version is not current.",
    }),
    privacyPolicyVersion: z.literal(
      CURRENT_LEGAL_VERSIONS.privacyPolicyVersion,
      {
        error: "Privacy Policy version is not current.",
      },
    ),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "New password must be different.",
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const data = parseBody(registerSchema, request.body);
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });

    if (existing) {
      throw new AppError("CONFLICT", "Email is already registered.", 409);
    }

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          email: data.email,
          passwordHash,
          settings: {
            create: {
              aiEnabled: false,
            },
          },
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      });
      const tenant = await transaction.tenant.create({
        data: { name: "Novo negócio" },
        select: { id: true },
      });

      await transaction.tenantMember.create({
        data: {
          tenantId: tenant.id,
          userId: createdUser.id,
          role: "OWNER",
        },
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
          userId: createdUser.id,
          termsVersion: data.termsVersion,
          privacyPolicyVersion: data.privacyPolicyVersion,
        },
      });

      return createdUser;
    });

    const token = await signSession(user);
    setSessionCookie(reply, token);
    reply.code(201);
    return dataResponse(request, { user: userDto(user) });
  });

  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const data = parseBody(loginSchema, request.body);
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
        throw new AppError("UNAUTHORIZED", "Invalid credentials.", 401);
      }

      const token = await signSession({ id: user.id, email: user.email });
      setSessionCookie(reply, token);
      return dataResponse(request, {
        user: userDto(user),
      });
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    clearSessionCookie(reply);
    return dataResponse(request, { ok: true });
  });

  app.get("/auth/me", { preHandler: requireTenantContext }, async (request) => {
    const user = currentUser(request);
    const tenantContext = currentTenantContext(request);
    const prisma = getPrisma();
    const [record, tenant] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          profile: true,
          settings: true,
          businessSettings: true,
          whatsappInstance: true,
        },
      }),
      prisma.tenant.findUnique({
        where: { id: tenantContext.tenantId },
        include: { businessProfile: true },
      }),
    ]);

    if (!record || !tenant) {
      throw new AppError("NOT_FOUND", "Session context not found.", 404);
    }

    return dataResponse(request, {
      user: userDto(record),
      tenant: tenantDto(tenant, tenantContext.role),
      businessProfile: businessProfileDto(tenant.businessProfile),
      profile: profileDto(record.profile),
      onboarding: onboardingDto(
        record.profile,
        record.whatsappInstance,
        record.settings,
      ),
      settings: settingsDto(record.settings),
      whatsappInstance: instanceDto(record.whatsappInstance),
      businessSettings: record.businessSettings,
    });
  });

  app.post(
    "/auth/change-password",
    { preHandler: requireTenantContext },
    async (request) => {
      const sessionUser = currentUser(request);
      const data = parseBody(changePasswordSchema, request.body);
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { id: sessionUser.id },
      });

      if (!user) {
        throw new AppError("NOT_FOUND", "User not found.", 404);
      }

      if (!(await verifyPassword(data.currentPassword, user.passwordHash))) {
        throw new AppError(
          "UNAUTHORIZED",
          "Current password is incorrect.",
          401,
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(data.newPassword),
        },
      });

      return dataResponse(request, { ok: true });
    },
  );
}
