import { logoutEvolutionInstance } from "@/services/evolution-go";
import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { instanceDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { deactivateAiForUserIfEnabled } from "@/services/ai-settings";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireSessionUser();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      return errorResponse("Instancia nao encontrada.", 404);
    }

    await logoutEvolutionInstance(instance.evolutionInstanceToken);

    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "LOGGED_OUT",
        qrcode: null,
        connectedAt: null,
      },
    });
    await deactivateAiForUserIfEnabled(user.id);

    return ok({ ok: true, whatsappInstance: instanceDto(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
