import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUser, requireAuth } from "../lib/auth.js";
import { AppError } from "../lib/errors.js";
import { dataResponse, parseBody, parseParams } from "../lib/http.js";
import { getPrisma } from "../lib/prisma.js";

const addIgnoredContactSchema = z.object({
  jid: z.string().trim().min(8).optional(),
  phoneNumber: z.string().trim().min(10).max(30).optional(),
  displayName: z.string().trim().max(120).optional().nullable(),
  pushName: z.string().trim().max(120).optional().nullable(),
  businessName: z.string().trim().max(120).optional().nullable(),
  reason: z.string().trim().max(300).optional().nullable()
});

const idParamSchema = z.object({
  id: z.string().min(1)
});

export async function registerIgnoredContactsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/ignored-contacts")) {
      await requireAuth(request);
    }
  });

  app.get("/ignored-contacts", async (request) => {
    const user = currentUser(request);
    const contacts = await getPrisma().ignoredContact.findMany({
      where: {
        userId: user.id,
        isActive: true
      },
      orderBy: { createdAt: "desc" },
      take: 500
    });
    return dataResponse(request, { contacts });
  });

  app.post("/ignored-contacts", async (request, reply) => {
    const user = currentUser(request);
    const data = parseBody(addIgnoredContactSchema, request.body);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id }
    });

    if (!instance) {
      throw new AppError("CONFLICT", "Connect WhatsApp before adding ignored contacts.", 409);
    }

    const jid = data.jid ?? buildJid(data.phoneNumber);
    if (!jid) {
      throw new AppError("VALIDATION_ERROR", "jid or phoneNumber is required.", 400);
    }

    const contact = await prisma.ignoredContact.upsert({
      where: {
        userId_instanceId_jid: {
          userId: user.id,
          instanceId: instance.id,
          jid
        }
      },
      create: {
        userId: user.id,
        instanceId: instance.id,
        jid,
        phoneNumber: data.phoneNumber ?? phoneFromJid(jid),
        displayName: data.displayName ?? null,
        pushName: data.pushName ?? null,
        businessName: data.businessName ?? null,
        reason: data.reason ?? null,
        source: "MANUAL",
        isActive: true
      },
      update: {
        phoneNumber: data.phoneNumber ?? phoneFromJid(jid),
        displayName: data.displayName ?? null,
        pushName: data.pushName ?? null,
        businessName: data.businessName ?? null,
        reason: data.reason ?? null,
        isActive: true,
        deletedAt: null
      }
    });

    reply.code(201);
    return dataResponse(request, { contact });
  });

  app.delete("/ignored-contacts/:id", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const contact = await getPrisma().ignoredContact.updateMany({
      where: {
        id: params.id,
        userId: user.id
      },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });

    if (contact.count === 0) {
      throw new AppError("NOT_FOUND", "Ignored contact not found.", 404);
    }

    return dataResponse(request, { ok: true });
  });
}

function buildJid(phoneNumber?: string): string | null {
  if (!phoneNumber) return null;
  const digits = phoneNumber.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : null;
}

function phoneFromJid(jid: string): string | null {
  return jid.endsWith("@s.whatsapp.net") ? (jid.split("@")[0] ?? null) : null;
}
