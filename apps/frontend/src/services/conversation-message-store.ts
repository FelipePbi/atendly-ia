import "server-only";

import type { Conversation, Message, MessageType } from "@/generated/prisma/client";
import { previewText } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  normalizeConversationContactJid,
  resolveCanonicalConversationForContact,
} from "@/services/conversation-consolidation";

type ConversationWithLatestMessage = Conversation & { messages: Message[] };

export type SaveVisibleMessageInput = {
  userId: string;
  instanceId: string;
  contactJid: string;
  contactName?: string | null;
  profilePictureUrl?: string | null;
  externalMessageId: string;
  fromMe: boolean;
  senderJid?: string | null;
  senderName?: string | null;
  type: MessageType;
  contentText?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  mediaBase64?: string | null;
  timestamp?: Date;
  rawPayload?: unknown;
};

export type SavedVisibleMessage = {
  conversation: ConversationWithLatestMessage;
  message: Message;
  duplicate: boolean;
};

export async function saveVisibleMessage(input: SaveVisibleMessageInput): Promise<SavedVisibleMessage> {
  return prisma.$transaction(async (tx) => {
    const existingMessage = await tx.message.findFirst({
      where: {
        instanceId: input.instanceId,
        externalMessageId: input.externalMessageId,
      },
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { timestamp: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (existingMessage) {
      return {
        conversation: existingMessage.conversation,
        message: existingMessage,
        duplicate: true,
      };
    }

    const contactJid = normalizeConversationContactJid(input.contactJid);
    const timestamp = input.timestamp ?? new Date();
    const mediaPreview = buildMediaPreview(input.fromMe, input.mediaType);
    const lastMessagePreview = previewText(input.contentText, mediaPreview);
    const existingConversation = await resolveCanonicalConversationForContact(tx, {
      userId: input.userId,
      contactJid,
    });

    const conversation = existingConversation
      ? await tx.conversation.update({
          where: { id: existingConversation.id },
          data: {
            instanceId: input.instanceId,
            ...(input.contactName ? { contactName: input.contactName } : {}),
            ...(input.profilePictureUrl ? { profilePictureUrl: input.profilePictureUrl } : {}),
            lastMessagePreview,
            lastMessageAt: timestamp,
            unreadCount: input.fromMe ? 0 : { increment: 1 },
            ...(input.fromMe ? {} : { archivedAt: null }),
          },
          include: {
            messages: {
              orderBy: { timestamp: "desc" },
              take: 1,
            },
          },
        })
      : await tx.conversation.upsert({
          where: {
            userId_contactJid: {
              userId: input.userId,
              contactJid,
            },
          },
          update: {
            instanceId: input.instanceId,
            ...(input.contactName ? { contactName: input.contactName } : {}),
            ...(input.profilePictureUrl ? { profilePictureUrl: input.profilePictureUrl } : {}),
            lastMessagePreview,
            lastMessageAt: timestamp,
            unreadCount: input.fromMe ? 0 : { increment: 1 },
            ...(input.fromMe ? {} : { archivedAt: null }),
          },
          create: {
            userId: input.userId,
            instanceId: input.instanceId,
            contactJid,
            contactName: input.contactName ?? null,
            profilePictureUrl: input.profilePictureUrl ?? null,
            lastMessagePreview,
            lastMessageAt: timestamp,
            unreadCount: input.fromMe ? 0 : 1,
          },
          include: {
            messages: {
              orderBy: { timestamp: "desc" },
              take: 1,
            },
          },
        });

    const message = await tx.message.create({
      data: {
        conversationId: conversation.id,
        userId: input.userId,
        instanceId: input.instanceId,
        externalMessageId: input.externalMessageId,
        fromMe: input.fromMe,
        senderJid: input.senderJid ?? null,
        senderName: input.senderName ?? null,
        type: input.type,
        contentText: input.contentText ?? null,
        mediaType: input.mediaType ?? null,
        mediaUrl: input.mediaUrl ?? null,
        mediaBase64: input.mediaBase64 ?? null,
        timestamp,
        rawPayload: input.rawPayload as object,
      },
    });

    return {
      conversation: {
        ...conversation,
        messages: [message],
      },
      message,
      duplicate: false,
    };
  });
}

function buildMediaPreview(fromMe: boolean, mediaType: string | null | undefined): string {
  if (mediaType) {
    return `Midia ${fromMe ? "enviada" : "recebida"}: ${mediaType}`;
  }

  return `Midia ${fromMe ? "enviada" : "recebida"}`;
}
