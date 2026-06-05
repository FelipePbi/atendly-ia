import { conversationDto } from "@/lib/dto";
import { handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { whatsappPhoneCandidates } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { fetchBotHandoffStatusesFromBackend } from "@/services/backend-dispatch";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const showArchived = searchParams.get("archived") === "true";
    const conversations = await prisma.conversation.findMany({
      where: {
        userId: user.id,
        archivedAt: showArchived ? { not: null } : null,
      },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 100,
      include: {
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });
    const phonesByConversationId = new Map(
      conversations
        .map((conversation) => [conversation.id, whatsappPhoneCandidates(conversation.contactJid)] as const)
        .filter(([, phones]) => phones.length > 0)
    );
    const handoffStatuses = await fetchBotHandoffStatusesFromBackend({
      phones: [...new Set([...phonesByConversationId.values()].flat())],
    });
    const handoffByPhone = new Map(handoffStatuses.statuses.map((status) => [status.phone, status]));

    return ok({
      ok: true,
      conversations: conversations.map((conversation) => {
        const phones = phonesByConversationId.get(conversation.id) ?? [];
        const handoff = phones.map((phone) => handoffByPhone.get(phone)).find(Boolean);

        return conversationDto(
          conversation,
          handoff
            ? {
                aiHandoff: true,
                aiHandoffReason: handoff.reason,
                aiHandoffPauseUntil: handoff.pauseUntil,
              }
            : undefined
        );
      }),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
