import type { PrismaClient } from "../../generated/prisma/client.js";
import { brazilianMobileVariants } from "../channel/conversation-resolution.js";
import { returnDestinationDigits } from "./ReturnDeliveryService.js";

/**
 * Quem nunca entra na lista do retorno pelo lado da IA (D-202): contato
 * ignorado e conversa marcada como pessoal. O BFF pergunta pelos telefones
 * da lista pre-selecionada e tira esses dela antes de mostrar.
 *
 * O telefone da agenda casa com o contato pelas duas formas do celular
 * brasileiro (com e sem o 9o digito), como a entrega faz.
 */

export type ReturnContactExclusionReason = "IGNORED" | "PERSONAL";

export interface ReturnContactExclusion {
  phone: string;
  reason: ReturnContactExclusionReason;
}

export async function returnContactExclusions(
  prisma: Pick<PrismaClient, "contact" | "conversationSession">,
  tenantId: string,
  phones: string[],
): Promise<ReturnContactExclusion[]> {
  const variantsByPhone = new Map<string, string[]>();
  for (const phone of phones) {
    const digits = returnDestinationDigits(phone);
    if (digits.length < 10) continue;
    variantsByPhone.set(phone, brazilianMobileVariants(digits));
  }
  const keys = [...new Set([...variantsByPhone.values()].flat())];
  if (keys.length === 0) return [];
  const contacts = await prisma.contact.findMany({
    where: { tenantId, externalContactId: { in: keys } },
    select: {
      id: true,
      externalContactId: true,
      ignored: true,
      categoryOverride: true,
    },
  });
  const openSessions = await prisma.conversationSession.findMany({
    where: {
      tenantId,
      contactId: { in: contacts.map((contact) => contact.id) },
      endedAt: null,
    },
    select: { contactId: true, category: true, categoryOverride: true },
  });
  const personalContacts = new Set(
    openSessions
      .filter(
        (session) =>
          (session.categoryOverride ?? session.category) === "PERSONAL",
      )
      .map((session) => session.contactId),
  );
  const result: ReturnContactExclusion[] = [];
  for (const [phone, variants] of variantsByPhone) {
    const matches = contacts.filter((contact) =>
      variants.includes(contact.externalContactId),
    );
    if (matches.some((contact) => contact.ignored)) {
      result.push({ phone, reason: "IGNORED" });
    } else if (
      matches.some(
        (contact) =>
          contact.categoryOverride === "PERSONAL" ||
          personalContacts.has(contact.id),
      )
    ) {
      result.push({ phone, reason: "PERSONAL" });
    }
  }
  return result;
}
