export function normalizeWhatsappPhone(value: string): string {
  if (isWhatsappGroup(value)) return "";
  if (isWhatsappLid(value)) return "";

  let digits = extractPhoneDigits(value);

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  return /^\d{10,15}$/.test(digits) ? digits : "";
}

const BRAZILIAN_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99
]);

export function normalizeBrazilianWhatsappPhone(value: string): string {
  const normalized = normalizeWhatsappPhone(value);
  if (!normalized.startsWith("55") || (normalized.length !== 12 && normalized.length !== 13)) return "";

  const ddd = Number(normalized.slice(2, 4));
  const subscriber = normalized.slice(4);
  if (!BRAZILIAN_DDDS.has(ddd)) return "";
  if (subscriber.length === 9 && subscriber[0] !== "9") return "";

  return normalized;
}

export function normalizeWhatsappJid(value: string): string {
  const input = value.trim().toLowerCase();
  if (!input) return "";

  if (input.endsWith("@g.us")) {
    const groupId = jidLocalPart(input);
    return groupId ? `${groupId}@g.us` : "";
  }

  if (input.endsWith("@lid")) {
    const lid = jidLocalPart(input);
    return lid ? `${lid}@lid` : "";
  }

  if (input.endsWith("@s.whatsapp.net")) {
    const phone = normalizeWhatsappPhone(input);
    return phone ? `${phone}@s.whatsapp.net` : "";
  }

  const phone = normalizeWhatsappPhone(input);
  return phone ? `${phone}@s.whatsapp.net` : "";
}

export function phoneFromWhatsappJid(value: string): string {
  const input = value.trim().toLowerCase();
  if (isWhatsappGroup(input) || isWhatsappLid(input)) return "";
  return normalizeWhatsappPhone(value);
}

export function whatsappPhoneCandidates(value: string): string[] {
  if (isWhatsappGroup(value)) return [];
  if (isWhatsappLid(value)) return [];

  const normalized = normalizeWhatsappPhone(value);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  const withoutNinthDigit = removeBrazilianNinthDigit(normalized);
  const withNinthDigit = addBrazilianNinthDigit(normalized);

  if (withoutNinthDigit) candidates.add(withoutNinthDigit);
  if (withNinthDigit) candidates.add(withNinthDigit);

  return [...candidates];
}

export function phonesMatch(expected: string | null | undefined, connected: string | null | undefined): boolean {
  const expectedCandidates = whatsappPhoneCandidates(expected ?? "");
  const connectedCandidates = new Set(whatsappPhoneCandidates(connected ?? ""));

  if (expectedCandidates.length === 0 || connectedCandidates.size === 0) return false;

  for (const candidate of expectedCandidates) {
    if (connectedCandidates.has(candidate)) return true;
  }

  return false;
}

function removeBrazilianNinthDigit(value: string): string | null {
  if (value.length !== 13 || !value.startsWith("55")) return null;

  const ddd = Number(value.slice(2, 4));
  const firstSubscriberDigit = value[4];

  if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99 || firstSubscriberDigit !== "9") {
    return null;
  }

  return `${value.slice(0, 4)}${value.slice(5)}`;
}

function addBrazilianNinthDigit(value: string): string | null {
  if (value.length !== 12 || !value.startsWith("55")) return null;

  const ddd = Number(value.slice(2, 4));
  if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99) return null;

  return `${value.slice(0, 4)}9${value.slice(4)}`;
}

function isWhatsappLid(value: string): boolean {
  return value.trim().toLowerCase().endsWith("@lid");
}

function isWhatsappGroup(value: string): boolean {
  return value.trim().toLowerCase().endsWith("@g.us");
}

function jidLocalPart(value: string): string {
  const beforeServer = value.split("@")[0] ?? value;
  return beforeServer.split(":")[0]?.replace(/\s/g, "") ?? "";
}

function extractPhoneDigits(value: string): string {
  const beforeServer = value.split("@")[0] ?? value;
  const withoutDevice = beforeServer.split(":")[0] ?? beforeServer;
  return withoutDevice.replace(/\D/g, "");
}
