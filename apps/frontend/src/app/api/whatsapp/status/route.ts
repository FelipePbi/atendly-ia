import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { instanceDto, settingsDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { syncWhatsAppInstanceStatus } from "@/services/whatsapp-instance-status";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          include: {
            profile: true,
            settings: true,
          },
        },
      },
    });

    if (!instance) {
      return errorResponse("Instancia nao encontrada.", 404);
    }

    const synced = await syncWhatsAppInstanceStatus({
      instance,
      profile: instance.user.profile,
    });
    const settings = synced.settings ?? instance.user.settings;

    if (synced.invalidInstance) {
      return errorResponse("A instancia da Evolution nao foi encontrada. Recarregue a pagina para criar uma nova instancia.", 409, {
        whatsappInstance: instanceDto(synced.instance),
        settings: settingsDto(settings),
      });
    }

    if (synced.missingPhone) {
      return errorResponse("Nao foi possivel identificar o numero conectado pela Evolution Go.", 409, {
        whatsappInstance: instanceDto(synced.instance),
        settings: settingsDto(settings),
      });
    }

    if (synced.invalidPhone) {
      return errorResponse("Nao foi possivel normalizar o numero conectado pela Evolution Go.", 409, {
        whatsappInstance: instanceDto(synced.instance),
        settings: settingsDto(settings),
      });
    }

    return ok({
      ok: true,
      status: synced.status ?? {
        connected: false,
        loggedIn: false,
        phoneNumber: synced.instance.phoneNumber,
        displayName: null,
        statusText: "unavailable",
      },
      whatsappInstance: instanceDto(synced.instance),
      settings: settingsDto(settings),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
