import { handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { ensureCustomPersonaGeneration } from "@/services/virtual-attendant";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireSessionUser();
    const settings = await ensureCustomPersonaGeneration(user.id);
    return ok({ ok: true, settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
