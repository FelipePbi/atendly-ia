import { errorResponse, handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { conversationDto, messageDto } from "@/lib/dto";
import { whatsappPhoneCandidates } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { sendMessageSchema } from "@/lib/validation";
import { dispatchMessageToBackend, pauseBotHandoffInBackend } from "@/services/backend-dispatch";
import { saveVisibleMessage } from "@/services/conversation-message-store";
import { sendEvolutionText } from "@/services/evolution-go";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!conversation) {
      return errorResponse("Conversa nao encontrada.", 404);
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        userId: user.id,
      },
      orderBy: { timestamp: "asc" },
      take: 300,
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0 },
    });

    return ok({
      ok: true,
      messages: messages.map(messageDto),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await readJson(request, sendMessageSchema);

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        instance: true,
        user: {
          include: {
            settings: true,
          },
        },
      },
    });

    if (!conversation) {
      return errorResponse("Conversa nao encontrada.", 404);
    }

    if (conversation.instance.status !== "CONNECTED") {
      return errorResponse("WhatsApp nao conectado.", 409);
    }

    const phone = whatsappPhoneCandidates(conversation.contactJid)[0];
    if (!phone) {
      return errorResponse("Telefone da conversa invalido.", 400);
    }

    const correlationId = `manual-${crypto.randomUUID()}`;
    const sent = await sendEvolutionText({
      instanceToken: conversation.instance.evolutionInstanceToken,
      to: phone,
      text: body.text,
      correlationId,
    });

    const saved = await saveVisibleMessage({
      userId: conversation.userId,
      instanceId: conversation.instanceId,
      contactJid: conversation.contactJid,
      contactName: conversation.contactName,
      profilePictureUrl: conversation.profilePictureUrl,
      externalMessageId: sent.messageId ?? correlationId,
      fromMe: true,
      senderJid: conversation.instance.phoneNumber,
      senderName: user.email ?? null,
      type: "TEXT",
      contentText: body.text,
      timestamp: new Date(),
      rawPayload: sent.raw,
    });

    let warning: string | undefined;
    if (conversation.user.settings?.aiEnabled) {
      const dispatchResult = await dispatchMessageToBackend({
        payload: buildManualOutboundPayload({
          instanceKey: conversation.instance.evolutionInstanceId ?? conversation.instance.evolutionInstanceName,
          contactJid: conversation.contactJid,
          senderJid: conversation.instance.phoneNumber,
          externalMessageId: sent.messageId ?? correlationId,
          senderName: user.email ?? null,
          text: body.text,
          timestamp: saved.message.timestamp,
        }),
        instanceToken: conversation.instance.evolutionInstanceToken,
      });

      if (dispatchResult.skipped) {
        const pauseResult = await pauseBotHandoffInBackend({
          phone,
          reason: "Atendimento humano iniciado pelo painel",
          summary: "Mensagem manual enviada pelo chat do frontend.",
        });

        if (pauseResult.skipped) {
          warning = "Mensagem enviada, mas nao foi possivel pausar a IA automaticamente.";
        }
      }
    }

    return ok({
      ok: true,
      message: messageDto(saved.message),
      conversation: conversationDto(saved.conversation),
      warning,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function buildManualOutboundPayload(input: {
  instanceKey: string;
  contactJid: string;
  senderJid: string | null;
  externalMessageId: string;
  senderName: string | null;
  text: string;
  timestamp: Date;
}) {
  return {
    event: "SendMessage",
    instanceId: input.instanceKey,
    data: {
      Info: {
        Chat: input.contactJid,
        Sender: input.senderJid ?? "",
        IsFromMe: true,
        IsGroup: input.contactJid.endsWith("@g.us"),
        ID: input.externalMessageId,
        Type: "text",
        Timestamp: input.timestamp.toISOString(),
        PushName: input.senderName,
      },
      Message: {
        conversation: input.text,
      },
    },
  };
}
