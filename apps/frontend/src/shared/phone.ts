const MOBILE_LEGACY_FIRST_DIGITS = new Set(["6", "7", "8", "9"]);

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
  if (!digits.startsWith("55")) return null;

  const core = digits.slice(2);
  if (core.length === 11) {
    return { ddd: core.slice(0, 2), subscriber: core.slice(2) };
  }
  if (core.length === 10) {
    const ddd = core.slice(0, 2);
    const subscriber = core.slice(2);
    const firstDigit = subscriber[0] ?? "";
    return MOBILE_LEGACY_FIRST_DIGITS.has(firstDigit)
      ? { ddd, subscriber: `9${subscriber}` }
      : { ddd, subscriber };
  }
  return null;
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
