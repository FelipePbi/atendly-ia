import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { phoneFromWhatsappJid } from "@/lib/phone";
import { resumeBotHandoffsInBackend } from "@/services/backend-dispatch";
import { ignoredContactDto, resumeIgnoredContactById } from "@/services/ignored-contacts";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const contact = await resumeIgnoredContactById({ userId: user.id, id });

    if (!contact) {
      return errorResponse("Contato ignorado nao encontrado.", 404);
    }

    const phone = phoneFromWhatsappJid(contact.jid);
    if (phone) {
      await resumeBotHandoffsInBackend({ phones: [phone] }).catch(() => null);
    }

    return ok({
      ok: true,
      contact: ignoredContactDto(contact),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
