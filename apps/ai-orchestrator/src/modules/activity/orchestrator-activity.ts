import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  type ActivityActor,
  type ActivityArea,
  type ActivityChange,
  type ActivityRecord,
  recordActivity,
} from "./activity-log.js";

type Writer = Pick<Prisma.TransactionClient, "activityLog" | "contact">;

/** Texto longo (FAQ, instrução, observação) entra cortado no antes/depois. */
export const ACTIVITY_TEXT_LIMIT = 280;

export function clipActivityText(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > ACTIVITY_TEXT_LIMIT
    ? `${text.slice(0, ACTIVITY_TEXT_LIMIT - 1)}…`
    : text;
}

/** Rótulo só de dígitos: o número (ou o LID) de um contato ainda sem nome. */
const DIGITS_ONLY = /^\d+$/u;

function nameOf(value: string | null | undefined): string | null {
  const name = value?.trim();
  return name && !DIGITS_ONLY.test(name) ? name : null;
}

/**
 * Nome do contato de uma conversa: o da conversa, senão o do contato do
 * WhatsApp (D-200). Antes, conversa sem nome gravava só os dígitos.
 */
async function conversationContactName(
  writer: Pick<Prisma.TransactionClient, "contact">,
  tenantId: string,
  conversation: { customerName: string | null; externalContactId: string },
): Promise<string | null> {
  const fromConversation = nameOf(conversation.customerName);
  if (fromConversation) return fromConversation;
  const contact = await writer.contact.findFirst({
    where: {
      tenantId,
      externalContactId: conversation.externalContactId,
      displayName: { not: null },
    },
    select: { displayName: true },
  });
  return nameOf(contact?.displayName);
}

/** Conversa: o rótulo é o nome do contato, ou o número sem nome. */
export async function recordConversationActivity(
  writer: Writer,
  tenantId: string,
  actor: ActivityActor,
  conversation: {
    id: string;
    customerName: string | null;
    externalContactId: string;
  },
  action: string,
  extra: {
    changes?: ActivityChange[];
    details?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await recordActivity(writer, tenantId, {
    actor,
    area: "CONVERSATIONS",
    action,
    entityType: "conversation",
    entityId: conversation.id,
    entityLabel:
      (await conversationContactName(writer, tenantId, conversation)) ??
      conversation.externalContactId,
    changes: extra.changes,
    details: extra.details ?? null,
  });
}

/** Contato sem conversa aberta (ignorado pelo número). */
export async function recordContactActivity(
  writer: Writer,
  tenantId: string,
  actor: ActivityActor,
  contact: { contactId: string; channelId: string; externalContactId: string },
  action: string,
): Promise<void> {
  const row = await writer.contact.findUnique({
    where: {
      tenantId_channelId_externalContactId: {
        tenantId,
        channelId: contact.channelId,
        externalContactId: contact.externalContactId,
      },
    },
    select: { displayName: true },
  });
  await recordActivity(writer, tenantId, {
    actor,
    area: "CONVERSATIONS",
    action,
    entityType: "contact",
    entityId: contact.contactId,
    entityLabel: nameOf(row?.displayName) ?? contact.externalContactId,
  });
}

/**
 * Leitura do registro (D-200): conversa ou contato gravado só com o número
 * ganha o nome que o contato tem hoje, quando já tem. O número continua sendo
 * o rótulo quando ninguém deu nome; a tela o formata.
 */
export async function withCurrentContactNames(
  prisma: Pick<PrismaClient, "contact" | "conversation">,
  tenantId: string,
  items: ActivityRecord[],
): Promise<ActivityRecord[]> {
  const unnamed = items.filter(
    (item) =>
      item.area === "CONVERSATIONS" &&
      item.entityId !== null &&
      (item.entityLabel === null || DIGITS_ONLY.test(item.entityLabel)),
  );
  if (unnamed.length === 0) return items;
  const conversationIds = unnamed
    .filter((item) => item.entityType === "conversation")
    .map((item) => item.entityId as string);
  const conversations = conversationIds.length
    ? await prisma.conversation.findMany({
        where: { tenantId, id: { in: conversationIds } },
        select: {
          id: true,
          customerName: true,
          contact: { select: { displayName: true } },
        },
      })
    : [];
  const contactIds = unnamed
    .filter((item) => item.entityType === "contact")
    .map((item) => item.entityId as string);
  const contacts = contactIds.length
    ? await prisma.contact.findMany({
        where: { tenantId, id: { in: contactIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const names = new Map<string, string>();
  for (const conversation of conversations) {
    const name =
      nameOf(conversation.customerName) ??
      nameOf(conversation.contact?.displayName);
    if (name) names.set(`conversation:${conversation.id}`, name);
  }
  for (const contact of contacts) {
    const name = nameOf(contact.displayName);
    if (name) names.set(`contact:${contact.id}`, name);
  }
  if (names.size === 0) return items;
  return items.map((item) => {
    const name = names.get(`${item.entityType}:${item.entityId}`);
    return name && unnamed.includes(item)
      ? { ...item, entityLabel: name }
      : item;
  });
}

/**
 * Memória de cliente: `entityId` é o cliente do Scheduling, para a tela
 * levar ao perfil; o rótulo vem do contato vinculado, quando há.
 */
export async function recordMemoryActivity(
  writer: Writer,
  tenantId: string,
  actor: ActivityActor,
  customerId: string,
  action: string,
  changes: ActivityChange[],
  details?: Record<string, unknown>,
): Promise<void> {
  const contact = await writer.contact.findFirst({
    where: { tenantId, customerId },
    select: { displayName: true },
  });
  await recordActivity(writer, tenantId, {
    actor,
    area: "CUSTOMERS",
    action,
    entityType: "customer",
    entityId: customerId,
    entityLabel: contact?.displayName ?? null,
    changes,
    details: details ?? null,
  });
}

/** Conhecimento do negócio e instrução de serviço: sempre da profissional. */
export async function recordKnowledgeActivity(
  writer: Writer,
  tenantId: string,
  actor: ActivityActor,
  input: {
    action: string;
    area?: ActivityArea;
    entityType: string;
    entityId?: string | null;
    label?: string | null;
    changes?: ActivityChange[];
  },
): Promise<void> {
  await recordActivity(writer, tenantId, {
    actor,
    area: input.area ?? "SETTINGS",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    entityLabel: input.label ?? null,
    changes: input.changes,
  });
}
