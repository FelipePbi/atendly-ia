import { handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { businessSettingsDto, getBusinessSettingsForUser } from "@/services/business-settings";
import { buildVirtualAttendantPromptPreviewForUser } from "@/services/virtual-attendant";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const businessSettings = await getBusinessSettingsForUser(user.id);
    const preview = await buildVirtualAttendantPromptPreviewForUser({
      userId: user.id,
      businessSettings: businessSettingsDto(businessSettings),
    });

    return ok({ ok: true, preview });
  } catch (error) {
    return handleRouteError(error);
  }
}
