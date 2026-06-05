import "server-only";

import type { Conversation, Message, Prisma } from "@/generated/prisma/client";
import {
  chooseCanonicalConversation,
  equivalentConversationGroups,
  groupEquivalentConversations,
} from "@/lib/conversation-dedupe";
import { previewText } from "@/lib/format";
import { normalizeWhatsappJid, whatsappConversationDedupeKey } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

type TransactionClient = Prisma.TransactionClient;
type ConversationWithLatestMessage = Conversation & { messages: Message[] };

export type ConversationConsolidationResult = {
  mergedGroups: number;
  movedMessages: number;
  removedConversations: number;
};

const emptyConsolidationResult: ConversationConsolidationResult = {
  mergedGroups: 0,
  movedMessages: 0,
  removedConversations: 0,
};

export function normalizeConversationContactJid(contactJid: string): string {
  return normalizeWhatsappJid(contactJid) || contactJid.trim().toLowerCase();
}

export async function consolidateEquivalentConversationsForUser(
  userId: string
): Promise<ConversationConsolidationResult> {
  return prisma.$transaction((tx) => consolidateEquivalentConversationsForUserTx(tx, userId));
}

export async function resolveCanonicalConversationForContact(
  tx: TransactionClient,
  input: {
    userId: string;
    contactJid: string;
  }
): Promise<ConversationWithLatestMessage | null> {
  const key = whatsappConversationDedupeKey(input.contactJid);
  if (!key) return null;

  const conversations = await tx.conversation.findMany({
    where: { userId: input.userId },
    include: latestMessageInclude(),
  });
  const matchingConversations = groupEquivalentConversations(conversations).get(key) ?? [];

  if (matchingConversations.length === 0) return null;

  if (matchingConversations.length > 1) {
    const merge = await mergeConversationGroup(tx, matchingConversations);
    return fetchConversationWithLatestMessage(tx, merge.canonicalId);
  }

  return matchingConversations[0];
}

async function consolidateEquivalentConversationsForUserTx(
  tx: TransactionClient,
  userId: string
): Promise<ConversationConsolidationResult> {
  const conversations = await tx.conversation.findMany({
    where: { userId },
    include: latestMessageInclude(),
  });
  const duplicateGroups = equivalentConversationGroups(conversations);

  let result = { ...emptyConsolidationResult };

  for (const group of duplicateGroups) {
    const merge = await mergeConversationGroup(tx, group);
    result = {
      mergedGroups: result.mergedGroups + 1,
      movedMessages: result.movedMessages + merge.movedMessages,
      removedConversations: result.removedConversations + merge.removedConversations,
    };
  }

  return result;
}

async function mergeConversationGroup(
  tx: TransactionClient,
  conversations: ConversationWithLatestMessage[]
): Promise<ConversationConsolidationResult & { canonicalId: string }> {
  const canonical = chooseCanonicalConversation(conversations);
  const duplicates = conversations.filter((conversation) => conversation.id !== canonical.id);
  const existingExternalMessageIds = new Set(
    (
      await tx.message.findMany({
        where: {
          conversationId: canonical.id,
          externalMessageId: { not: null },
        },
        select: { externalMessageId: true },
      })
    )
      .map((message) => message.externalMessageId)
      .filter((externalMessageId): externalMessageId is string => Boolean(externalMessageId))
  );

  let movedMessages = 0;

  for (const duplicate of duplicates) {
    const duplicateMessages = await tx.message.findMany({
      where: { conversationId: duplicate.id },
      select: {
        id: true,
        externalMessageId: true,
      },
    });
    const duplicateMessageIds = duplicateMessages
      .filter((message) => message.externalMessageId && existingExternalMessageIds.has(message.externalMessageId))
      .map((message) => message.id);
    const messageIdsToMove = duplicateMessages
      .filter((message) => !duplicateMessageIds.includes(message.id))
      .map((message) => message.id);

    if (duplicateMessageIds.length > 0) {
      await tx.message.deleteMany({
        where: { id: { in: duplicateMessageIds } },
      });
    }

    if (messageIdsToMove.length > 0) {
      await tx.message.updateMany({
        where: { id: { in: messageIdsToMove } },
        data: { conversationId: canonical.id },
      });
      movedMessages += messageIdsToMove.length;

      for (const message of duplicateMessages) {
        if (message.externalMessageId && messageIdsToMove.includes(message.id)) {
          existingExternalMessageIds.add(message.externalMessageId);
        }
      }
    }

    await tx.aiSuppressionLog.updateMany({
      where: { conversationId: duplicate.id },
      data: { conversationId: canonical.id },
    });

    await tx.conversation.delete({
      where: { id: duplicate.id },
    });
  }

  await recomputeConversationSummary(tx, canonical.id, conversations);

  return {
    canonicalId: canonical.id,
    mergedGroups: duplicates.length > 0 ? 1 : 0,
    movedMessages,
    removedConversations: duplicates.length,
  };
}

async function recomputeConversationSummary(
  tx: TransactionClient,
  canonicalId: string,
  mergedConversations: ConversationWithLatestMessage[]
) {
  const latestMessage = await tx.message.findFirst({
    where: { conversationId: canonicalId },
    orderBy: { timestamp: "desc" },
  });
  const newestConversation = [...mergedConversations].sort(
    (left, right) => conversationTime(right) - conversationTime(left)
  )[0];
  const pausedConversation = [...mergedConversations]
    .filter((conversation) => conversation.aiPaused)
    .sort((left, right) => {
      const leftTime = conversationPauseTime(left);
      const rightTime = conversationPauseTime(right);
      return rightTime - leftTime;
    })[0];

  await tx.conversation.update({
    where: { id: canonicalId },
    data: {
      instanceId: newestConversation.instanceId,
      contactName: newestConversation.contactName,
      profilePictureUrl: newestConversation.profilePictureUrl,
      lastMessagePreview: latestMessage
        ? previewText(latestMessage.contentText, buildMediaPreview(latestMessage.fromMe, latestMessage.mediaType))
        : newestConversation.lastMessagePreview,
      lastMessageAt: latestMessage?.timestamp ?? newestConversation.lastMessageAt,
      unreadCount: mergedConversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
      archivedAt: mergedConversations.some((conversation) => conversation.archivedAt === null)
        ? null
        : newestConversation.archivedAt,
      aiPaused: Boolean(pausedConversation),
      aiPausedReason: pausedConversation?.aiPausedReason ?? null,
      aiPausedUpdatedAt: pausedConversation?.aiPausedUpdatedAt ?? null,
    },
  });
}

async function fetchConversationWithLatestMessage(
  tx: TransactionClient,
  conversationId: string
): Promise<ConversationWithLatestMessage> {
  return tx.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: latestMessageInclude(),
  });
}

function latestMessageInclude() {
  return {
    messages: {
      orderBy: { timestamp: "desc" as const },
      take: 1,
    },
  };
}

function buildMediaPreview(fromMe: boolean, mediaType: string | null | undefined): string {
  if (mediaType) {
    return `Midia ${fromMe ? "enviada" : "recebida"}: ${mediaType}`;
  }

  return `Midia ${fromMe ? "enviada" : "recebida"}`;
}

function conversationTime(conversation: ConversationWithLatestMessage): number {
  return (conversation.messages[0]?.timestamp ?? conversation.lastMessageAt ?? conversation.updatedAt).getTime();
}

function conversationPauseTime(conversation: ConversationWithLatestMessage): number {
  return (conversation.aiPausedUpdatedAt ?? conversation.updatedAt).getTime();
}
