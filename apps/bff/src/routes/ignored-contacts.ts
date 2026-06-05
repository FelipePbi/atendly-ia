import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import type { IgnoredContact, IgnoredContactSource, Prisma } from "../generated/prisma/client.js";
import { currentUser, requireAuth } from "../lib/auth.js";
import { ignoredContactDto } from "../lib/dto.js";
import { AppError } from "../lib/errors.js";
import { dataResponse, parseBody, parseParams } from "../lib/http.js";
import { normalizeWhatsappJid, phoneFromWhatsappJid } from "../lib/phone.js";
import { getPrisma } from "../lib/prisma.js";
import { dispatchToApi } from "../services/internal-api.js";

const addIgnoredContactSchema = z.object({
  jid: z.string().trim().min(8).optional().nullable(),
  phoneNumber: z.string().trim().min(10).max(30).optional().nullable(),
  displayName: z.string().trim().max(120).optional().nullable(),
  pushName: z.string().trim().max(120).optional().nullable(),
  businessName: z.string().trim().max(120).optional().nullable(),
  reason: z.string().trim().max(300).optional().nullable()
});

const bulkIgnoredContactsSchema = z.object({
  contacts: z
    .array(
      z.object({
        jid: z.string().trim().min(1).optional().nullable(),
        phoneNumber: z.string().trim().optional().nullable(),
        displayName: z.string().trim().max(120).optional().nullable(),
        pushName: z.string().trim().max(120).optional().nullable(),
        businessName: z.string().trim().max(120).optional().nullable()
      })
    )
    .min(1)
    .max(500),
  reason: z.string().trim().max(300).optional().nullable()
});

const ignoredContactsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(["active", "inactive", "all"]).optional(),
  q: z.string().trim().optional().nullable()
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
    const query = parseIgnoredContactsQuery(request.query);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
      select: { id: true }
    });

    if (!instance) {
      return dataResponse(request, {
        contacts: [],
        pagination: { page: query.page, pageSize: query.pageSize, total: 0 }
      });
    }

    const where = ignoredContactsWhere({
      userId: user.id,
      instanceId: instance.id,
      q: query.q,
      status: query.status
    });
    const [contacts, total] = await prisma.$transaction([
      prisma.ignoredContact.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      prisma.ignoredContact.count({ where })
    ]);

    return dataResponse(request, {
      contacts: contacts.map(ignoredContactDto),
      pagination: { page: query.page, pageSize: query.pageSize, total }
    });
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

    const jid = normalizeWhatsappJid(data.jid ?? data.phoneNumber ?? "");
    if (!jid) {
      throw new AppError("VALIDATION_ERROR", "A valid jid or phoneNumber is required.", 400);
    }

    const reason = cleanOptionalText(data.reason) ?? "Contato adicionado manualmente";
    const contact = await pauseConversationAi({
      userId: user.id,
      instanceId: instance.id,
      jid,
      displayName: data.displayName,
      pushName: data.pushName,
      businessName: data.businessName,
      source: "MANUAL",
      reason,
      createdByUserId: user.id
    });

    await pauseBotHandoffInApi(request, user.id, jid, reason);

    reply.code(201);
    return dataResponse(request, { contact: ignoredContactDto(contact) });
  });

  app.post("/ignored-contacts/bulk", async (request) => {
    const user = currentUser(request);
    const data = parseBody(bulkIgnoredContactsSchema, request.body);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
      select: { id: true }
    });

    if (!instance) {
      throw new AppError("CONFLICT", "Connect WhatsApp before adding ignored contacts.", 409);
    }

    const result = await bulkUpsertIgnoredContacts({
      userId: user.id,
      instanceId: instance.id,
      contacts: data.contacts,
      reason: data.reason
    });

    return dataResponse(request, result);
  });

  app.delete("/ignored-contacts/:id", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const contact = await resumeIgnoredContactById({ userId: user.id, id: params.id });

    if (!contact) {
      throw new AppError("NOT_FOUND", "Ignored contact not found.", 404);
    }

    await resumeBotHandoffInApi(request, user.id, contact.jid);

    return dataResponse(request, { contact: ignoredContactDto(contact) });
  });
}

function parseIgnoredContactsQuery(query: unknown) {
  const parsed = ignoredContactsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query params.", 400, parsed.error.flatten());
  }

  return {
    page: parsed.data.page ?? 1,
    pageSize: parsed.data.pageSize ?? 20,
    status: parsed.data.status ?? "active",
    q: cleanOptionalText(parsed.data.q)
  };
}

function ignoredContactsWhere(input: {
  userId: string;
  instanceId: string;
  q?: string | null;
  status?: "active" | "inactive" | "all";
}): Prisma.IgnoredContactWhereInput {
  const where: Prisma.IgnoredContactWhereInput = {
    userId: input.userId,
    instanceId: input.instanceId
  };

  if (input.status === "inactive") {
    where.isActive = false;
  } else if (input.status !== "all") {
    where.isActive = true;
  }

  const query = cleanOptionalText(input.q);
  if (query) {
    where.OR = [
      { displayName: { contains: query, mode: "insensitive" } },
      { pushName: { contains: query, mode: "insensitive" } },
      { businessName: { contains: query, mode: "insensitive" } },
      { phoneNumber: { contains: query, mode: "insensitive" } },
      { jid: { contains: query, mode: "insensitive" } }
    ];
  }

  return where;
}

async function upsertIgnoredContact(input: {
  userId: string;
  instanceId: string;
  jid: string;
  displayName?: string | null;
  pushName?: string | null;
  businessName?: string | null;
  source: IgnoredContactSource;
  reason?: string | null;
  createdByUserId?: string | null;
  createdByMessageId?: string | null;
}): Promise<IgnoredContact> {
  const jid = normalizeWhatsappJid(input.jid);
  if (!jid) {
    throw new AppError("VALIDATION_ERROR", "Invalid WhatsApp JID.", 400);
  }

  const phoneNumber = phoneFromWhatsappJid(jid) || null;
  const updateData: Prisma.IgnoredContactUpdateInput = {
    phoneNumber,
    source: input.source,
    reason: cleanOptionalText(input.reason),
    isActive: true,
    deletedAt: null,
    ...(cleanOptionalText(input.displayName) !== undefined ? { displayName: cleanOptionalText(input.displayName) } : {}),
    ...(cleanOptionalText(input.pushName) !== undefined ? { pushName: cleanOptionalText(input.pushName) } : {}),
    ...(cleanOptionalText(input.businessName) !== undefined ? { businessName: cleanOptionalText(input.businessName) } : {}),
    ...(input.createdByUserId !== undefined ? { createdByUserId: input.createdByUserId } : {}),
    ...(input.createdByMessageId !== undefined ? { createdByMessageId: input.createdByMessageId } : {})
  };

  return getPrisma().ignoredContact.upsert({
    where: {
      userId_instanceId_jid: {
        userId: input.userId,
        instanceId: input.instanceId,
        jid
      }
    },
    update: updateData,
    create: {
      userId: input.userId,
      instanceId: input.instanceId,
      jid,
      phoneNumber,
      displayName: cleanOptionalText(input.displayName) ?? null,
      pushName: cleanOptionalText(input.pushName) ?? null,
      businessName: cleanOptionalText(input.businessName) ?? null,
      source: input.source,
      reason: cleanOptionalText(input.reason) ?? null,
      createdByUserId: input.createdByUserId ?? null,
      createdByMessageId: input.createdByMessageId ?? null
    }
  });
}

async function pauseConversationAi(input: {
  userId: string;
  instanceId: string;
  jid: string;
  displayName?: string | null;
  pushName?: string | null;
  businessName?: string | null;
  source: IgnoredContactSource;
  reason: string;
  createdByUserId?: string | null;
  createdByMessageId?: string | null;
}) {
  const contact = await upsertIgnoredContact(input);

  await getPrisma().conversation.updateMany({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      contactJid: contact.jid
    },
    data: {
      aiPaused: true,
      aiPausedReason: input.reason,
      aiPausedUpdatedAt: new Date()
    }
  });

  return contact;
}

async function resumeIgnoredContactById(input: { userId: string; id: string }) {
  const prisma = getPrisma();
  const existing = await prisma.ignoredContact.findFirst({
    where: {
      id: input.id,
      userId: input.userId
    }
  });

  if (!existing) return null;

  const now = new Date();
  const contact = await prisma.ignoredContact.update({
    where: { id: existing.id },
      data: {
        isActive: false,
        deletedAt: now
      }
    });

  await prisma.conversation.updateMany({
    where: {
      userId: existing.userId,
      instanceId: existing.instanceId,
      contactJid: existing.jid
    },
    data: {
      aiPaused: false,
      aiPausedReason: null,
      aiPausedUpdatedAt: now
    }
  });

  return contact;
}

async function bulkUpsertIgnoredContacts(input: {
  userId: string;
  instanceId: string;
  contacts: Array<{
    jid?: string | null;
    phoneNumber?: string | null;
    displayName?: string | null;
    pushName?: string | null;
    businessName?: string | null;
  }>;
  reason?: string | null;
}) {
  const normalized: Array<(typeof input.contacts)[number] & { jid: string }> = [];
  for (const contact of input.contacts) {
    const jid = normalizeWhatsappJid(contact.jid ?? contact.phoneNumber ?? "");
    if (jid) {
      normalized.push({ ...contact, jid });
    }
  }

  const uniqueContacts = [...new Map(normalized.map((contact) => [contact.jid, contact])).values()];
  const existing = await getPrisma().ignoredContact.findMany({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      jid: { in: uniqueContacts.map((contact) => contact.jid) }
    },
    select: {
      jid: true,
      isActive: true
    }
  });
  const activeJids = new Set(existing.filter((contact) => contact.isActive).map((contact) => contact.jid));

  let added = 0;
  let alreadyExisting = 0;
  const reason = cleanOptionalText(input.reason) ?? "Selecionado nos contatos do WhatsApp";

  for (const contact of uniqueContacts) {
    if (activeJids.has(contact.jid)) {
      alreadyExisting += 1;
    } else {
      added += 1;
    }

    await upsertIgnoredContact({
      userId: input.userId,
      instanceId: input.instanceId,
      jid: contact.jid,
      displayName: contact.displayName,
      pushName: contact.pushName,
      businessName: contact.businessName,
      source: "EVOLUTION_CONTACT_IMPORT",
      reason,
      createdByUserId: input.userId
    });
  }

  if (uniqueContacts.length > 0) {
    await getPrisma().conversation.updateMany({
      where: {
        userId: input.userId,
        instanceId: input.instanceId,
        contactJid: { in: uniqueContacts.map((contact) => contact.jid) }
      },
      data: {
        aiPaused: true,
        aiPausedReason: reason,
        aiPausedUpdatedAt: new Date()
      }
    });
  }

  return {
    added,
    alreadyExisting,
    total: uniqueContacts.length
  };
}

async function pauseBotHandoffInApi(request: FastifyRequest, userId: string, jid: string, reason: string): Promise<void> {
  const phone = phoneFromWhatsappJid(jid);
  if (!phone || !env.INTERNAL_SERVICE_TOKEN) return;

  await dispatchToApi("/internal/handoffs", {
    userId,
    requestId: request.id,
    body: {
      phone,
      reason: "IA pausada por lista de ignorados",
      summary: reason
    }
  }).catch((error: unknown) => {
    request.log.warn({ err: errorMessage(error) }, "Backend bot pause failed");
  });
}

async function resumeBotHandoffInApi(request: FastifyRequest, userId: string, jid: string): Promise<void> {
  const phone = phoneFromWhatsappJid(jid);
  if (!phone || !env.INTERNAL_SERVICE_TOKEN) return;

  await dispatchToApi("/internal/bot/resume", {
    userId,
    requestId: request.id,
    body: { phones: [phone] }
  }).catch((error: unknown) => {
    request.log.warn({ err: errorMessage(error) }, "Backend bot resume failed");
  });
}

function cleanOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const text = value?.trim() ?? "";
  return text ? text : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
