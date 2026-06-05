import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { instanceDto, onboardingDto, profileDto } from "@/lib/dto";
import { profileComplete, virtualAttendantComplete } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { syncWhatsAppInstanceStatus } from "@/services/whatsapp-instance-status";
import { getVirtualAttendantSettingsForUser } from "@/services/virtual-attendant";

export const runtime = "nodejs";

export async function POST() {
  try {
    const sessionUser = await requireSessionUser();
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: {
        profile: true,
        whatsappInstance: true,
        settings: true,
      },
    });

    if (!user) {
      return errorResponse("Usuario nao encontrado.", 404);
    }

    const currentProfile = user.profile;
    if (!profileComplete(currentProfile)) {
      return errorResponse("Complete os dados basicos antes de finalizar.", 409);
    }

    const currentSettings = user.settings ?? (await getVirtualAttendantSettingsForUser(user.id));
    if (!virtualAttendantComplete(currentSettings)) {
      return errorResponse("Configure sua Atendente Virtual antes de finalizar.", 409);
    }

    if (!user.whatsappInstance) {
      return errorResponse("Crie e conecte uma instancia de WhatsApp antes de finalizar.", 409);
    }

    const synced = await syncWhatsAppInstanceStatus({
      instance: user.whatsappInstance,
      profile: currentProfile,
      updateProfile: false,
    });

    if (synced.invalidInstance) {
      return errorResponse("A instancia da Evolution nao foi encontrada. Recarregue a pagina para criar uma nova instancia.", 409, {
        whatsappInstance: instanceDto(synced.instance),
      });
    }

    if (!synced.connected) {
      return errorResponse("Escaneie o QR Code e aguarde o WhatsApp conectar.", 409, {
        whatsappInstance: instanceDto(synced.instance),
      });
    }

    if (synced.missingPhone || !synced.connectedPhone) {
      return errorResponse("Nao foi possivel identificar o numero conectado pela Evolution Go.", 409, {
        whatsappInstance: instanceDto(synced.instance),
      });
    }

    if (synced.invalidPhone || !synced.normalizedPhone) {
      return errorResponse("Nao foi possivel normalizar o numero conectado pela Evolution Go.", 409, {
        whatsappInstance: instanceDto(synced.instance),
      });
    }

    const profile = await prisma.userProfile.update({
      where: { userId: user.id },
      data: {
        whatsappPhoneRaw: synced.connectedPhone,
        whatsappPhoneNormalized: synced.normalizedPhone,
        onboardingCompletedAt: currentProfile.onboardingCompletedAt ?? new Date(),
      },
    });

    return ok({
      ok: true,
      profile: profileDto(profile),
      onboarding: onboardingDto(profile, synced.instance, currentSettings),
      whatsappInstance: instanceDto(synced.instance),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
