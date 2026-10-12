import { phoneFromWhatsappJid } from "./phone.js";

/** Contato como a Evolution Go devolve em `GET /user/contacts` (whatsmeow). */
export interface RawWhatsappContact {
  Jid?: string;
  FirstName?: string;
  FullName?: string;
  PushName?: string;
  BusinessName?: string;
}

export interface WhatsappContact {
  /** Número em dígitos, com DDI (ex.: 5511999990000). */
  phone: string;
  /** Nome salvo na agenda do aparelho; na falta, o do perfil do WhatsApp. */
  name: string | null;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function folded(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

/**
 * Contatos do número conectado para a escolha dos contatos ignorados
 * (validação de 2026-10-11). Só pessoas: grupos, listas de transmissão,
 * status e IDs internos (`@lid`) ficam de fora. Um número aparece uma vez,
 * com o melhor nome conhecido. A busca ignora acento e caixa e casa por nome
 * ou por dígitos do telefone. A ordem é alfabética, com quem não tem nome no
 * fim. Nada disto é gravado: a lista é lida na hora, a cada pedido.
 */
export function selectWhatsappContacts(
  raw: readonly RawWhatsappContact[],
  options: { search?: string; limit: number; excludePhone?: string | null },
): WhatsappContact[] {
  const byPhone = new Map<string, WhatsappContact>();
  for (const contact of raw) {
    const jid = contact.Jid ?? "";
    if (!jid.endsWith("@s.whatsapp.net")) continue;
    const phone = phoneFromWhatsappJid(jid);
    if (!phone || phone === options.excludePhone) continue;
    const name =
      clean(contact.FullName) ??
      clean(contact.FirstName) ??
      clean(contact.BusinessName) ??
      clean(contact.PushName);
    const current = byPhone.get(phone);
    if (!current || (!current.name && name)) byPhone.set(phone, { phone, name });
  }

  const search = options.search?.trim() ?? "";
  const term = folded(search);
  const digits = search.replace(/\D/g, "");
  const matches = [...byPhone.values()].filter((contact) => {
    if (!search) return true;
    if (contact.name && folded(contact.name).includes(term)) return true;
    return digits.length >= 3 && contact.phone.includes(digits);
  });

  matches.sort((a, b) => {
    if (a.name && !b.name) return -1;
    if (!a.name && b.name) return 1;
    if (a.name && b.name) {
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    }
    return a.phone.localeCompare(b.phone);
  });
  return matches.slice(0, options.limit);
}
