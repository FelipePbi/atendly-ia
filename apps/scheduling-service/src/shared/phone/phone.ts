import { AppError } from "../errors/app-error.js";

/**
 * Mesma lista de DDDs válidos do BFF (`apps/bff/src/lib/phone.ts`). Exportada
 * para o teste que compara as duas listas (Goal062 §3).
 */
export const BRAZILIAN_DDDS: ReadonlySet<number> = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export interface NormalizedPhone {
  normalizedPhone: string;
  /** true quando reconhecido como número brasileiro válido (55 + DDD + assinante). */
  recognized: boolean;
}

export function normalizePhone(value: string): string {
  return normalizePhoneDetailed(value).normalizedPhone;
}

export function normalizePhoneDetailed(value: string): NormalizedPhone {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) {
    throw new AppError(
      "INVALID_PHONE",
      "Phone must contain between 6 and 15 digits.",
      400,
    );
  }

  const canonical = toCanonicalBrazilianPhone(digits);
  if (canonical) return { normalizedPhone: canonical, recognized: true };
  return { normalizedPhone: digits, recognized: false };
}

/**
 * Conjunto de formas equivalentes a um `normalizedPhone`: a canônica, sem o
 * 9º dígito, e as formas nacionais (sem `55`), com e sem o 9º dígito. Usado
 * para achar candidatos gravados antes deste Goal, em formato nacional.
 */
export function phoneEquivalenceCandidates(
  normalizedPhoneValue: string,
): string[] {
  const candidates = new Set<string>([normalizedPhoneValue]);
  if (
    !normalizedPhoneValue.startsWith("55") ||
    (normalizedPhoneValue.length !== 12 && normalizedPhoneValue.length !== 13)
  ) {
    return [...candidates];
  }

  const ddd = normalizedPhoneValue.slice(2, 4);
  const subscriber = normalizedPhoneValue.slice(4);
  if (!BRAZILIAN_DDDS.has(Number(ddd))) return [...candidates];

  if (subscriber.length === 9 && subscriber.startsWith("9")) {
    const withoutNinth = subscriber.slice(1);
    candidates.add(`55${ddd}${withoutNinth}`);
    candidates.add(`${ddd}${subscriber}`);
    candidates.add(`${ddd}${withoutNinth}`);
  } else if (subscriber.length === 8) {
    candidates.add(`${ddd}${subscriber}`);
    if (subscriber[0] >= "6" && subscriber[0] <= "9") {
      const withNinth = `9${subscriber}`;
      candidates.add(`55${ddd}${withNinth}`);
      candidates.add(`${ddd}${withNinth}`);
    }
  }

  return [...candidates];
}

export function phoneMatches(
  leftValue: string | null | undefined,
  rightValue: string | null | undefined,
): boolean {
  if (!leftValue || !rightValue) return false;
  const left = digitsOnly(leftValue);
  const right = digitsOnly(rightValue);
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Tenta ler `rawDigits` como número brasileiro: remove prefixos de discagem
 * (`00`, `0`), reconhece DDD válido e devolve `55 + DDD + assinante`, com o
 * 9º dígito completado para celular de 8 dígitos iniciado em 6–9. `null`
 * quando não reconhecido — o chamador mantém o comportamento atual.
 */
function toCanonicalBrazilianPhone(rawDigits: string): string | null {
  let digits = rawDigits;
  if (digits.startsWith("00")) digits = digits.slice(2);

  let ddd: string;
  let subscriber: string;

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    ddd = digits.slice(2, 4);
    subscriber = digits.slice(4);
  } else {
    let rest = digits;
    if (rest.startsWith("0") && (rest.length === 11 || rest.length === 12)) {
      rest = rest.slice(1);
    }
    if (rest.length !== 10 && rest.length !== 11) return null;
    ddd = rest.slice(0, 2);
    subscriber = rest.slice(2);
  }

  if (!BRAZILIAN_DDDS.has(Number(ddd))) return null;

  if (subscriber.length === 8) {
    if (subscriber[0] >= "6" && subscriber[0] <= "9") {
      subscriber = `9${subscriber}`;
    }
  } else if (subscriber.length !== 9) {
    return null;
  }

  return `55${ddd}${subscriber}`;
}
