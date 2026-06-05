import "server-only";

import type { AiSuppressionReason, IgnoredContact, IgnoredContactSource, Prisma } from "@/generated/prisma/client";
import { normalizeWhatsappJid, phoneFromWhatsappJid } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export type IgnoredContactDto = {
  id: string;
  jid: string;
  phoneNumber: string | null;
  displayName: string | null;
  pushName: string | null;
  businessName: string | null;
  source: IgnoredContactSource;
  reason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function ignoredContactDto(contact: IgnoredContact): IgnoredContactDto {
  return {
    id: contact.id,
    jid: contact.jid,
    phoneNumber: contact.phoneNumber,
    displayName: contact.displayName,
    pushName: contact.pushName,
    businessName: contact.businessName,
    source: contact.source,
    reason: contact.reason,
    isActive: contact.isActive,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

export async function listIgnoredContacts(input: {
  userId: string;
  instanceId: string;
  q?: string | null;
  status?: "active" | "inactive" | "all";
  page: number;
  pageSize: number;
}) {
  const where: Prisma.IgnoredContactWhereInput = {
    userId: input.userId,
    instanceId: input.instanceId,
  };

  if (input.status === "inactive") {
    where.isActive = false;
  } else if (input.status !== "all") {
    where.isActive = true;
  }

  const query = input.q?.trim();
  if (query) {
    where.OR = [
      { displayName: { contains: query, mode: "insensitive" } },
      { pushName: { contains: query, mode: "insensitive" } },
      { businessName: { contains: query, mode: "insensitive" } },
      { phoneNumber: { contains: query, mode: "insensitive" } },
      { jid: { contains: query, mode: "insensitive" } },
    ];
  }

  const [contacts, total] = await prisma.$transaction([
    prisma.ignoredContact.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.ignoredContact.count({ where }),
  ]);

  return {
    contacts,
    total,
  };
}

export async function findActiveIgnoredContact(input: {
  userId: string;
  instanceId: string;
  jid: string;
}): Promise<IgnoredContact | null> {
  const jid = normalizeWhatsappJid(input.jid);
  if (!jid) return null;

  return prisma.ignoredContact.findFirst({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      jid,
      isActive: true,
    },
  });
}

export async function upsertIgnoredContact(input: {
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
    throw new Error("Invalid WhatsApp JID");
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
    ...(input.createdByMessageId !== undefined ? { createdByMessageId: input.createdByMessageId } : {}),
  };

  return prisma.ignoredContact.upsert({
    where: {
      userId_instanceId_jid: {
        userId: input.userId,
        instanceId: input.instanceId,
        jid,
      },
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
      createdByMessageId: input.createdByMessageId ?? null,
    },
  });
}

export async function pauseConversationAi(input: {
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

  await prisma.conversation.updateMany({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      contactJid: contact.jid,
    },
    data: {
      aiPaused: true,
      aiPausedReason: input.reason,
      aiPausedUpdatedAt: new Date(),
    },
  });

  return contact;
}

export async function resumeIgnoredContactById(input: { userId: string; id: string }) {
  const existing = await prisma.ignoredContact.findFirst({
    where: {
      id: input.id,
      userId: input.userId,
    },
  });

  if (!existing) return null;

  const now = new Date();
  const contact = await prisma.ignoredContact.update({
    where: { id: existing.id },
    data: {
      isActive: false,
      deletedAt: now,
    },
  });

  await prisma.conversation.updateMany({
    where: {
      userId: existing.userId,
      instanceId: existing.instanceId,
      contactJid: existing.jid,
    },
    data: {
      aiPaused: false,
      aiPausedReason: null,
      aiPausedUpdatedAt: now,
    },
  });

  return contact;
}

export async function resumeConversationAiByJid(input: { userId: string; instanceId: string; jid: string }) {
  const jid = normalizeWhatsappJid(input.jid);
  if (!jid) return;

  const now = new Date();
  await prisma.ignoredContact.updateMany({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      jid,
      isActive: true,
    },
    data: {
      isActive: false,
      deletedAt: now,
    },
  });

  await prisma.conversation.updateMany({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      contactJid: jid,
    },
    data: {
      aiPaused: false,
      aiPausedReason: null,
      aiPausedUpdatedAt: now,
    },
  });
}

export async function bulkUpsertIgnoredContacts(input: {
  userId: string;
  instanceId: string;
  contacts: Array<{
    jid: string;
    displayName?: string | null;
    pushName?: string | null;
    businessName?: string | null;
  }>;
  reason?: string | null;
}) {
  const normalized = input.contacts
    .map((contact) => ({
      ...contact,
      jid: normalizeWhatsappJid(contact.jid),
    }))
    .filter((contact) => Boolean(contact.jid));

  const uniqueContacts = [...new Map(normalized.map((contact) => [contact.jid, contact])).values()];
  const existing = await prisma.ignoredContact.findMany({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      jid: { in: uniqueContacts.map((contact) => contact.jid) },
    },
    select: {
      jid: true,
      isActive: true,
    },
  });
  const activeJids = new Set(existing.filter((contact) => contact.isActive).map((contact) => contact.jid));

  let added = 0;
  let alreadyExisting = 0;

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
      reason: input.reason ?? "Selecionado nos contatos do WhatsApp",
      createdByUserId: input.userId,
    });
  }

  if (uniqueContacts.length > 0) {
    await prisma.conversation.updateMany({
      where: {
        userId: input.userId,
        instanceId: input.instanceId,
        contactJid: { in: uniqueContacts.map((contact) => contact.jid) },
      },
      data: {
        aiPaused: true,
        aiPausedReason: input.reason?.trim() || "Selecionado nos contatos do WhatsApp",
        aiPausedUpdatedAt: new Date(),
      },
    });
  }

  return {
    added,
    alreadyExisting,
    total: uniqueContacts.length,
  };
}

export async function logAiSuppression(input: {
  userId: string;
  instanceId: string;
  conversationId?: string | null;
  messageId?: string | null;
  contactJid: string;
  reason: AiSuppressionReason;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.aiSuppressionLog.create({
      data: {
        userId: input.userId,
        instanceId: input.instanceId,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
        contactJid: input.contactJid,
        reason: input.reason,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    console.warn("Failed to log AI suppression", {
      reason: input.reason,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

function cleanOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const text = value?.trim() ?? "";
  return text ? text : null;
}
