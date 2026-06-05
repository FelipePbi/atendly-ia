import { handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { listPersonaImportsForUser } from "@/services/virtual-attendant";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const imports = await listPersonaImportsForUser(user.id);
    return ok({ ok: true, imports });
  } catch (error) {
    return handleRouteError(error);
  }
}
