import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { conversationDto } from "@/lib/dto";
import { whatsappPhoneCandidates } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { resumeBotHandoffsInBackend } from "@/services/backend-dispatch";
import { resumeConversationAiByJid } from "@/services/ignored-contacts";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });

    if (!conversation) {
      return errorResponse("Conversa nao encontrada.", 404);
    }

    const phones = whatsappPhoneCandidates(conversation.contactJid);
    if (phones.length === 0) {
      return errorResponse("Telefone da conversa invalido.", 400);
    }

    await resumeBotHandoffsInBackend({ phones }).catch(() => null);

    await resumeConversationAiByJid({
      userId: user.id,
      instanceId: conversation.instanceId,
      jid: conversation.contactJid,
    });

    const updated = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: {
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });

    return ok({
      ok: true,
      conversation: conversationDto(updated, {
        aiHandoff: false,
        aiHandoffReason: null,
        aiHandoffPauseUntil: null,
      }),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
