import { handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { consolidateEquivalentConversationsForUser } from "@/services/conversation-consolidation";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireSessionUser();
    const result = await consolidateEquivalentConversationsForUser(user.id);

    return ok({
      ok: true,
      ...result,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
