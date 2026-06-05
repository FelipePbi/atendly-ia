import { buildWebhookUrl, connectEvolutionInstance, EvolutionGoError } from "@/services/evolution-go";
import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { instanceDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireSessionUser();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      return errorResponse("Crie uma instancia antes de conectar.", 404);
    }

    try {
      await connectEvolutionInstance(instance.evolutionInstanceToken, buildWebhookUrl());
    } catch (error) {
      if (error instanceof Error && error.message.includes("Variavel de ambiente ausente")) {
        throw error;
      }

      if (error instanceof EvolutionGoError && (error.status === 401 || error.status === 404)) {
        const updated = await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: {
            status: "ERROR",
            qrcode: null,
          },
        });

        return errorResponse("A instancia da Evolution nao foi encontrada. Recarregue a pagina para criar uma nova instancia.", 409, {
          whatsappInstance: instanceDto(updated),
        });
      }
    }

    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "CONNECTING",
      },
    });

    return ok({ ok: true, whatsappInstance: instanceDto(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
