import { BffHttpError, type Conversation } from "@/data";
import { extractPhoneDigits, formatBrazilianPhone } from "@/shared/phone";

/** Nome da pessoa quando o contato já tem um; telefone formatado quando não. */
export function conversationLabel(conversation: Conversation): string {
  return (
    conversation.customerName?.trim() ||
    formatPhone(conversation.externalContactId)
  );
}

export function initials(value: string): string {
  const result = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return result || "?";
}

export function formatPhone(value: string): string {
  return (
    formatBrazilianPhone(value, "parens") ||
    extractPhoneDigits(value) ||
    "Contato sem telefone"
  );
}

export function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "Agora";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} h`;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Data completa de `contentExpiredThrough`, sem hora: é um corte de dias de retenção, não um instante. */
export function formatExpiredThroughDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function requestError(error: unknown, fallback: string): string {
  if (error instanceof BffHttpError)
    return `${error.message} (ID ${error.requestId})`;
  return fallback;
}

/**
 * O código original da IA numa recusa própria repassada pelo BFF
 * (`error.code: "UPSTREAM_ERROR"`, código em `error.details.upstreamCode`).
 * `undefined` para qualquer outro erro — rede, validação, ou recusa que não
 * veio da IA.
 */
export function upstreamErrorCode(error: unknown): string | undefined {
  if (!(error instanceof BffHttpError)) return undefined;
  const details = error.details;
  if (!details || typeof details !== "object") return undefined;
  const value = (details as { upstreamCode?: unknown }).upstreamCode;
  return typeof value === "string" ? value : undefined;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
