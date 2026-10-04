import { BffHttpError, type Conversation } from "@/data";
import { extractPhoneDigits, formatBrazilianPhone } from "@/shared/phone";

import { handoffReasonCopy } from "./conversationState";

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
    .filter((part) => /^[\p{L}\p{N}]/u.test(part))
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

export const DEFAULT_BUSINESS_TIMEZONE = "America/Sao_Paulo";

/** Telefone no formato do quadro de Conversas (`+55 11 97654-3210`). */
export function formatInboxPhone(value: string): string {
  return formatBrazilianPhone(value, "plus") || formatPhone(value);
}

/** Tempo de espera de quem aguarda a pessoa: `há 12 min`, `há 2 h`, `há 3 d`. */
export function formatWaitingTime(
  value: string,
  now: number = Date.now(),
): string {
  const elapsed = now - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "agora";
  if (elapsed < 3_600_000) return `há ${Math.floor(elapsed / 60_000)} min`;
  if (elapsed < 86_400_000) return `há ${Math.floor(elapsed / 3_600_000)} h`;
  return `há ${Math.floor(elapsed / 86_400_000)} d`;
}

/** Dia do instante no fuso do negócio, como `YYYY-MM-DD`. */
function businessDay(instant: number | string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).format(new Date(instant));
}

/** Quantos dias do negócio separam o instante de agora (0 = hoje). */
export function businessDaysAgo(
  value: string,
  timezone: string,
  now: number = Date.now(),
): number {
  if (!Number.isFinite(new Date(value).getTime())) return 0;
  return Math.round(
    (Date.parse(`${businessDay(now, timezone)}T00:00:00Z`) -
      Date.parse(`${businessDay(value, timezone)}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Horário de uma linha da lista, no fuso do negócio: hora no dia de hoje,
 * `ontem`, o dia da semana abreviado até seis dias atrás e `DD/MM` depois.
 */
export function formatInboxTime(
  value: string,
  timezone: string,
  now: number = Date.now(),
): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const days = businessDaysAgo(value, timezone, now);
  if (days <= 0) return formatBusinessTime(value, timezone);
  if (days === 1) return "ontem";
  if (days < 7) {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      weekday: "short",
    })
      .format(date)
      .replace(/\.$/, "");
  }
  const [, month = "--", day = "--"] = businessDay(value, timezone).split("-");
  return `${day}/${month}`;
}

/**
 * O motivo curto da pílula `Aguardando você · motivo`. Só existe quando
 * `handoffReasonCopy` tem texto legível; o texto que o pipeline gravou entra
 * como veio, e mídia que a IA não trata ganha uma frase curta. Imagem recebida
 * fica só `Aguardando você`, como a Fernanda nos quadros C1 e K2: quem diz o
 * motivo é a linha de evento do chat (Goal114).
 */
export function waitingReasonLabel(reason: string | null): string | null {
  if (!handoffReasonCopy(reason)) return null;
  const value = reason?.trim() ?? "";
  if (value === "OWNER_TAKEOVER") return null;
  const normalized = value.toLocaleLowerCase("pt-BR");
  if (normalized.includes("image_received")) return null;
  if (normalized.includes("suportada")) {
    return "enviou algo que a IA não trata";
  }
  return value;
}

/**
 * Rótulo do dia na timeline do chat (quadros K2 e K4): `Hoje`, `Ontem` e,
 * antes disso, o dia da semana com `DD/MM`, sempre no fuso do negócio.
 */
export function formatTimelineDay(
  value: string,
  timezone: string,
  now: number = Date.now(),
): string {
  const days = businessDaysAgo(value, timezone, now);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    weekday: "short",
  })
    .format(new Date(value))
    .replace(/\.$/, "");
  const [, month = "--", day = "--"] = businessDay(value, timezone).split("-");
  return `${weekday} ${day}/${month}`;
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

/**
 * Dia da semana abreviado de um `date` (`YYYY-MM-DD`) de evento de agenda
 * (Goal070). `date` é wall-clock do negócio, sem hora — por isso o cálculo
 * usa UTC, nunca o fuso do processo, para não mudar de dia perto da meia-noite.
 */
export function formatEventWeekday(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "short",
  })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(/\.$/, "");
}

/** `DD/MM` de um `date` (`YYYY-MM-DD`) de evento de agenda, sem conversão de fuso. */
export function formatEventDayMonth(date: string): string {
  const [, month = "--", day = "--"] = date.split("-");
  return `${day}/${month}`;
}

/**
 * Hora de um instante ISO no fuso do negócio (D-045), nunca no fuso do
 * navegador ou do processo — usada só para instantes reais (`occurredAt`,
 * `holdExpiresAt`), nunca para `date`/`startTime`, que já são wall-clock.
 */
export function formatBusinessTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
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
