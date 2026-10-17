import type { Prisma } from "../../generated/prisma/client.js";
import {
  type ActivityActor,
  type ActivityArea,
  type ActivityChange,
  recordActivity,
} from "./activity-log.js";

type Writer = Pick<Prisma.TransactionClient, "activityLog" | "contact">;

/** Texto longo (FAQ, instrução, observação) entra cortado no antes/depois. */
export const ACTIVITY_TEXT_LIMIT = 280;

export function clipActivityText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > ACTIVITY_TEXT_LIMIT
    ? `${text.slice(0, ACTIVITY_TEXT_LIMIT - 1)}…`
    : text;
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
    entityLabel: conversation.customerName ?? conversation.externalContactId,
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
    entityLabel: row?.displayName ?? contact.externalContactId,
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
