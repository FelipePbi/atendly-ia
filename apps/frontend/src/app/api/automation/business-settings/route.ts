import { handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { businessSettingsPatchSchema } from "@/lib/validation";
import {
  businessSettingsDto,
  getBusinessSettingsForUser,
  updateBusinessSettingsForUser,
} from "@/services/business-settings";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sessionUser = await requireSessionUser();
    const profile = await prisma.userProfile.findUnique({
      where: { userId: sessionUser.id },
      select: { businessName: true },
    });
    const settings = await getBusinessSettingsForUser(sessionUser.id, profile);

    return ok({ ok: true, businessSettings: businessSettingsDto(settings) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const data = await readJson(request, businessSettingsPatchSchema);
    const settings = await updateBusinessSettingsForUser(sessionUser.id, data);

    await prisma.userProfile.updateMany({
      where: { userId: sessionUser.id },
      data: {
        businessName: settings.businessName,
      },
    });

    return ok({ ok: true, businessSettings: businessSettingsDto(settings) });
  } catch (error) {
    return handleRouteError(error);
  }
}
