const MOBILE_LEGACY_FIRST_DIGITS = new Set(["6", "7", "8", "9"]);

// Copiada de `BRAZILIAN_DDDS` em apps/scheduling-service/src/shared/phone/phone.ts.
const BRAZILIAN_DDDS: ReadonlySet<string> = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "21", "22", "24", "27",
  "28", "31", "32", "33", "34", "35", "37", "38", "41", "42", "43", "44", "45",
  "46", "47", "48", "49", "51", "53", "54", "55", "61", "62", "63", "64", "65",
  "66", "67", "68", "69", "71", "73", "74", "75", "77", "79", "81", "82", "83",
  "84", "85", "86", "87", "88", "89", "91", "92", "93", "94", "95", "96", "97",
  "98", "99",
]);

export type NormalizedBrazilianPhone = {
  ddd: string;
  subscriber: string;
};

/** Dígitos crus, sem sufixo de aparelho (`:12`) nem domínio de JID (`@s.whatsapp.net`). */
export function extractPhoneDigits(value: string): string {
  const withoutJidDomain = value.split("@")[0] ?? value;
  const withoutDevice = withoutJidDomain.split(":")[0] ?? withoutJidDomain;
  return withoutDevice.replace(/\D/g, "");
}

/**
 * DDD + assinante de um número brasileiro (JID ou dígitos crus), com o 9º
 * dígito restaurado quando ausente e o assinante confirma celular (Goal059):
 * legado de 12 dígitos com assinante iniciado em 6–9 ganha o 9; iniciado em
 * 2–5 (fixo) permanece como está. Nunca grava nem altera chave de busca —
 * só formata para exibição.
 */
export function normalizeBrazilianPhoneDigits(
  value: string,
): NormalizedBrazilianPhone | null {
  const digits = extractPhoneDigits(value);

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const core = digits.slice(2);
    if (core.length === 11) {
      return { ddd: core.slice(0, 2), subscriber: core.slice(2) };
    }
    return withRestoredNinthDigit(core.slice(0, 2), core.slice(2));
  }

  let national = digits;
  if (national.startsWith("0") && (national.length === 11 || national.length === 12)) {
    national = national.slice(1);
  }
  if (national.length !== 10 && national.length !== 11) return null;

  const ddd = national.slice(0, 2);
  const subscriber = national.slice(2);
  if (!BRAZILIAN_DDDS.has(ddd)) return null;

  if (national.length === 11) {
    return subscriber.startsWith("9") ? { ddd, subscriber } : null;
  }
  if (!/^[2-9]/.test(subscriber)) return null;
  return withRestoredNinthDigit(ddd, subscriber);
}

function withRestoredNinthDigit(
  ddd: string,
  subscriber: string,
): NormalizedBrazilianPhone {
  return MOBILE_LEGACY_FIRST_DIGITS.has(subscriber[0] ?? "")
    ? { ddd, subscriber: `9${subscriber}` }
    : { ddd, subscriber };
}

/**
 * `null` quando o valor não é um número brasileiro reconhecível — quem chama
 * decide o que exibir nesse caso, nunca dígitos crus ou JID.
 */
export function formatBrazilianPhone(
  value: string,
  style: "parens" | "plus",
): string | null {
  const normalized = normalizeBrazilianPhoneDigits(value);
  if (!normalized) return null;

  const { ddd, subscriber } = normalized;
  const local =
    subscriber.length === 9
      ? `${subscriber.slice(0, 5)}-${subscriber.slice(5)}`
      : `${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;

  return style === "plus" ? `+55 ${ddd} ${local}` : `(${ddd}) ${local}`;
}

/**
 * Telefone pronto para tela: `formatBrazilianPhone` quando reconhecido,
 * senão o valor gravado como veio, e o `fallback` só quando não há valor.
 */
export function displayPhone(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) return fallback;
  return formatBrazilianPhone(value, "parens") ?? value;
}

const MAX_NATIONAL_DIGITS = 11;

/**
 * Dígitos nacionais (DDD + assinante) do que a pessoa digitou no campo de
 * telefone. O "+55" da máscara é prefixo de exibição e nunca entra nos dígitos.
 */
export function phoneInputDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  const national =
    (value.trimStart().startsWith("+") && digits.startsWith("55")) ||
    (digits.length > MAX_NATIONAL_DIGITS && digits.startsWith("55"))
      ? digits.slice(2)
      : digits;
  return national.slice(0, MAX_NATIONAL_DIGITS);
}

/** Máscara só de exibição do campo: "+55 (11) 99123-4567" conforme a pessoa digita. */
export function maskPhoneInput(value: string): string {
  const digits = phoneInputDigits(value);
  if (!digits) return "";
  const ddd = digits.slice(0, 2);
  if (digits.length <= 2) return `+55 (${ddd}`;
  const subscriber = digits.slice(2);
  const split = subscriber.startsWith("9") ? 5 : 4;
  const local =
    subscriber.length > split
      ? `${subscriber.slice(0, split)}-${subscriber.slice(split)}`
      : subscriber;
  return `+55 (${ddd}) ${local}`;
}
