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
