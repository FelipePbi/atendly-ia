import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clearSessionCookie, currentUser, requireAuth, setSessionCookie, signSession } from "../lib/auth.js";
import { AppError } from "../lib/errors.js";
import { dataResponse, parseBody } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { getPrisma } from "../lib/prisma.js";

const emailSchema = z.string().email().trim().toLowerCase();

const registerSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match."
  });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1)
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "New password must be different."
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match."
  });

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const data = parseBody(registerSchema, request.body);
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true }
    });

    if (existing) {
      throw new AppError("CONFLICT", "Email is already registered.", 409);
    }

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: await hashPassword(data.password),
        settings: {
          create: {
            aiEnabled: false
          }
        }
      },
      select: {
        id: true,
        email: true
      }
    });

    const token = await signSession(user);
    setSessionCookie(reply, token);
    reply.code(201);
    return dataResponse(request, { user });
  });

  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes"
        }
      }
    },
    async (request, reply) => {
      const data = parseBody(loginSchema, request.body);
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { email: data.email }
      });

      if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
        throw new AppError("UNAUTHORIZED", "Invalid credentials.", 401);
      }

      const token = await signSession({ id: user.id, email: user.email });
      setSessionCookie(reply, token);
      return dataResponse(request, {
        user: {
          id: user.id,
          email: user.email
        }
      });
    }
  );

  app.post("/auth/logout", async (request, reply) => {
    clearSessionCookie(reply);
    return dataResponse(request, { ok: true });
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
        settings: true,
        businessSettings: true,
        whatsappInstance: true
      }
    });

    if (!record) {
      throw new AppError("NOT_FOUND", "User not found.", 404);
    }

    return dataResponse(request, { user: record });
  });

  app.post("/auth/change-password", { preHandler: requireAuth }, async (request) => {
    const sessionUser = currentUser(request);
    const data = parseBody(changePasswordSchema, request.body);
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });

    if (!user) {
      throw new AppError("NOT_FOUND", "User not found.", 404);
    }

    if (!(await verifyPassword(data.currentPassword, user.passwordHash))) {
      throw new AppError("UNAUTHORIZED", "Current password is incorrect.", 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(data.newPassword)
      }
    });

    return dataResponse(request, { ok: true });
  });
}
