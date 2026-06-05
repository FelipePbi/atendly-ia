import { handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { virtualAttendantSettingsPatchSchema } from "@/lib/virtual-attendant";
import {
  getVirtualAttendantSettingsForUser,
  updateVirtualAttendantSettingsForUser,
  virtualAttendantSettingsDto,
} from "@/services/virtual-attendant";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const settings = await getVirtualAttendantSettingsForUser(user.id);
    return ok({ ok: true, settings: virtualAttendantSettingsDto(settings) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    const data = await readJson(request, virtualAttendantSettingsPatchSchema);
    const settings = await updateVirtualAttendantSettingsForUser(user.id, data);
    return ok({ ok: true, settings: virtualAttendantSettingsDto(settings) });
  } catch (error) {
    return handleRouteError(error);
  }
}
