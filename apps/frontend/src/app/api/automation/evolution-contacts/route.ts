import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { normalizeWhatsappJid, phoneFromWhatsappJid } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { getEvolutionContacts } from "@/services/evolution-go";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        evolutionInstanceToken: true,
        status: true,
      },
    });

    if (!instance || instance.status !== "CONNECTED") {
      return errorResponse("Conecte seu WhatsApp para buscar seus contatos salvos.", 409);
    }

    const [contacts, ignoredContacts] = await Promise.all([
      getEvolutionContacts(instance.evolutionInstanceToken),
      prisma.ignoredContact.findMany({
        where: {
          userId: user.id,
          instanceId: instance.id,
          isActive: true,
        },
        select: { jid: true },
      }),
    ]);
    const ignoredJids = new Set(ignoredContacts.map((contact) => contact.jid));

    return ok({
      ok: true,
      data: contacts
        .map((contact) => {
          const jid = normalizeWhatsappJid(contact.jid);
          if (!jid) return null;
          return {
            jid,
            phoneNumber: phoneFromWhatsappJid(jid) || contact.phoneNumber,
            displayName: contact.fullName || contact.pushName || contact.firstName || contact.businessName || phoneFromWhatsappJid(jid),
            firstName: contact.firstName,
            fullName: contact.fullName,
            pushName: contact.pushName,
            businessName: contact.businessName,
            alreadyIgnored: ignoredJids.has(jid),
          };
        })
        .filter(Boolean),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
