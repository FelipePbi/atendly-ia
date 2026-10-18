/**
 * Telefone das excecoes do modo sandbox (D-199).
 *
 * Mesma regra de numero brasileiro do BFF (`normalizeBrazilianWhatsappPhone`
 * em `apps/bff/src/lib/phone.ts`): 55 + DDD valido + 8 ou 9 digitos, sem
 * grupo nem LID. A comparacao tolera o 9o digito, como `phonesMatch` do BFF:
 * o WhatsApp ainda entrega numeros antigos sem ele.
 */

const BRAZILIAN_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Teto de excecoes por negocio: e lista de teste, nao agenda de contatos. */
export const SANDBOX_MAX_EXCEPTION_PHONES = 20;

/** Digitos do numero, sem dominio de JID (`@s.whatsapp.net`) nem aparelho (`:12`). */
export function jidDigits(value: string): string {
  const beforeServer = value.split("@")[0] ?? value;
  const withoutDevice = beforeServer.split(":")[0] ?? beforeServer;
  return withoutDevice.replace(/\D/g, "");
}

/**
 * Numero brasileiro canonico (`55DDDNNNNNNNNN`) ou `null`. Aceita com ou sem
 * 55, com 0 de longa distancia e com mascara; recusa grupo e LID.
 */
export function normalizeSandboxPhone(value: string): string | null {
  const lowered = value.trim().toLowerCase();
  if (lowered.endsWith("@g.us") || lowered.endsWith("@lid")) return null;

  let digits = jidDigits(lowered);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!digits.startsWith("55") || (digits.length !== 12 && digits.length !== 13)) {
    return null;
  }
  const ddd = Number(digits.slice(2, 4));
  const subscriber = digits.slice(4);
  if (!BRAZILIAN_DDDS.has(ddd)) return null;
  if (subscriber.length === 9 && subscriber[0] !== "9") return null;
  return digits;
}

/** O numero e a variante com/sem o 9o digito, para comparar. */
function candidates(phone: string): string[] {
  const set = new Set([phone]);
  if (phone.length === 13 && phone[4] === "9") {
    set.add(`${phone.slice(0, 4)}${phone.slice(5)}`);
  }
  if (phone.length === 12) set.add(`${phone.slice(0, 4)}9${phone.slice(4)}`);
  return [...set];
}

/** `true` quando o telefone do destinatario e uma das excecoes. */
export function isSandboxException(
  recipientPhone: string,
  exceptionPhones: readonly string[],
): boolean {
  const recipient = normalizeSandboxPhone(recipientPhone);
  if (!recipient) return false;
  const wanted = new Set(candidates(recipient));
  return exceptionPhones.some((exception) => {
    const normalized = normalizeSandboxPhone(exception);
    return normalized !== null && candidates(normalized).some((c) => wanted.has(c));
  });
}
