import { handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { instanceDto, onboardingDto, profileDto, settingsDto, userDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { syncWhatsAppInstanceStatus } from "@/services/whatsapp-instance-status";

export const runtime = "nodejs";

export async function GET() {
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
      return ok({ ok: false, error: "Usuario nao encontrado." }, { status: 404 });
    }

    const whatsappInstance = user.whatsappInstance
      ? (
          await syncWhatsAppInstanceStatus({
            instance: user.whatsappInstance,
            profile: user.profile,
          })
        ).instance
      : null;

    return ok({
      ok: true,
      user: userDto(user),
      profile: profileDto(user.profile),
      onboarding: onboardingDto(user.profile, whatsappInstance, user.settings),
      settings: settingsDto(user.settings),
      whatsappInstance: instanceDto(whatsappInstance),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
