import { handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { onboardingDto, profileDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { onboardingProfileSchema } from "@/lib/validation";
import { getVirtualAttendantSettingsForUser } from "@/services/virtual-attendant";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const data = await readJson(request, onboardingProfileSchema);

    const profile = await prisma.userProfile.upsert({
      where: { userId: sessionUser.id },
      update: {
        fullName: data.fullName,
        birthDate: dateOnlyToUtc(data.birthDate),
        sex: data.sex,
        businessName: data.businessName,
      },
      create: {
        userId: sessionUser.id,
        fullName: data.fullName,
        birthDate: dateOnlyToUtc(data.birthDate),
        sex: data.sex,
        businessName: data.businessName,
      },
    });

    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: sessionUser.id },
    });
    const settings = await getVirtualAttendantSettingsForUser(sessionUser.id);

    return ok({
      ok: true,
      profile: profileDto(profile),
      onboarding: onboardingDto(profile, instance, settings),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function dateOnlyToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
