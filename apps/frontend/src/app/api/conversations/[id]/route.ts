import { errorResponse, handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { conversationDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { conversationPatchSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await readJson(request, conversationPatchSchema);

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

    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        archivedAt: body.archived ? new Date() : null,
      },
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
