import { errorResponse, handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { bulkIgnoredContactsSchema } from "@/lib/validation";
import { bulkUpsertIgnoredContacts } from "@/services/ignored-contacts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await readJson(request, bulkIgnoredContactsSchema);
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!instance) {
      return errorResponse("Conecte o WhatsApp antes de criar a lista de ignorados.", 409);
    }

    const result = await bulkUpsertIgnoredContacts({
      userId: user.id,
      instanceId: instance.id,
      contacts: body.contacts,
      reason: body.reason,
    });

    return ok({
      ok: true,
      ...result,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
