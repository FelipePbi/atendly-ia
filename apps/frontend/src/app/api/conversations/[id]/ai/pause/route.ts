import { errorResponse, handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { conversationDto } from "@/lib/dto";
import { phoneFromWhatsappJid } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { pauseConversationAiSchema } from "@/lib/validation";
import { pauseBotHandoffInBackend } from "@/services/backend-dispatch";
import { pauseConversationAi } from "@/services/ignored-contacts";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await readJson(request, pauseConversationAiSchema);
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

    const reason = body.reason?.trim() || "Usuario pausou pelo chat";
    await pauseConversationAi({
      userId: user.id,
      instanceId: conversation.instanceId,
      jid: conversation.contactJid,
      displayName: conversation.contactName,
      source: "CHAT_ACTION",
      reason,
      createdByUserId: user.id,
    });

    const phone = phoneFromWhatsappJid(conversation.contactJid);
    if (phone) {
      await pauseBotHandoffInBackend({
        phone,
        reason: "IA pausada pela lista de ignorados",
        summary: reason,
      });
    }

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
      conversation: conversationDto(updated),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
