/**
 * IA Loop — capacity/failure classification.
 *
 * Turns whatever the Claude CLI reported into one of a small, fixed set of
 * causes, so policy decisions are made on a classification rather than on ad-hoc
 * string matching spread through the workers.
 *
 * Structured signals (our own error codes, the envelope's terminal_reason and
 * any HTTP status present) are preferred; text matching is the last resort.
 *
 * Nothing sensitive is retained: diagnostics are truncated and scrubbed.
 */

export const CAPACITY_REASONS = Object.freeze({
  RATE_LIMIT: 'RATE_LIMIT',
  USAGE_LIMIT: 'USAGE_LIMIT',
  AUTH_ERROR: 'AUTH_ERROR',
  BILLING_ERROR: 'BILLING_ERROR',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  UNKNOWN_TRANSIENT: 'UNKNOWN_TRANSIENT',
  UNKNOWN_FATAL: 'UNKNOWN_FATAL',
});

/**
 * Our own error codes map directly, without touching text.
 * A detected model fallback is fatal on purpose: it is a violated invariant,
 * never something to retry around.
 */
const CODE_MAP = Object.freeze({
  TIMEOUT: CAPACITY_REASONS.UNKNOWN_TRANSIENT,
  EMPTY_OUTPUT: CAPACITY_REASONS.UNKNOWN_TRANSIENT,
  INVALID_ENVELOPE_JSON: CAPACITY_REASONS.UNKNOWN_TRANSIENT,
  INVALID_AGENT_JSON: CAPACITY_REASONS.UNKNOWN_TRANSIENT,
  INVALID_AGENT_SHAPE: CAPACITY_REASONS.UNKNOWN_TRANSIENT,
  MISSING_RESULT: CAPACITY_REASONS.UNKNOWN_TRANSIENT,

  EXECUTABLE_NOT_FOUND: CAPACITY_REASONS.UNKNOWN_FATAL,
  SPAWN_FAILED: CAPACITY_REASONS.UNKNOWN_FATAL,
  MODEL_FALLBACK_DETECTED: CAPACITY_REASONS.UNKNOWN_FATAL,
  RESOLVED_MODEL_AMBIGUOUS: CAPACITY_REASONS.UNKNOWN_FATAL,
  RESOLVED_MODEL_UNKNOWN: CAPACITY_REASONS.UNKNOWN_FATAL,
});

/** Ordered: the first match wins, so the more specific patterns come first. */
const TEXT_PATTERNS = Object.freeze([
  [CAPACITY_REASONS.AUTH_ERROR, /not logged in|please run \/login|unauthorized|authentication_error|invalid[_ ]api[_ ]key|oauth|401\b/i],
  [CAPACITY_REASONS.BILLING_ERROR, /billing|payment|credit balance|insufficient (credit|funds|balance)|402\b/i],
  [CAPACITY_REASONS.USAGE_LIMIT, /usage limit|quota|out of (usage|credits)|limit will reset|weekly limit|\d+-hour limit|upgrade to (a )?(higher|paid)/i],
  [CAPACITY_REASONS.RATE_LIMIT, /rate[_ ]?limit|too many requests|429\b|overloaded|529\b/i],
  [CAPACITY_REASONS.MODEL_UNAVAILABLE, /model[_ ]not[_ ]found|unknown model|model .*(not available|unavailable|not found)|not_found_error/i],
  [CAPACITY_REASONS.UNKNOWN_TRANSIENT, /timeout|timed out|econnreset|etimedout|socket hang up|network|temporarily|5\d\d\b|internal server error/i],
]);

/** Redacts anything that could carry a secret before we keep a diagnostic. */
export function sanitizeDiagnostic(text, { maxLength = 300 } = {}) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/sk-[A-Za-z0-9_\-]+/g, '<redacted>')
    .replace(/\b(Bearer|Token)\s+[^\s",}]+/gi, '$1 <redacted>')
    .replace(/\bAuthorization\b\s*[:=]\s*[^\s",}]+/gi, 'Authorization <redacted>')
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|password|secret)("?\s*[:=]\s*)("?)[^\s",}]+/gi, '$1$2$3<redacted>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Extracts a server-provided wait, when the CLI surfaced one.
 * Returns milliseconds, or null when nothing reliable was found.
 */
export function extractRetryAfterMs(source) {
  if (source && typeof source === 'object') {
    // Prefer structured values when the envelope carries them.
    const structured = source.retryAfterMs ?? source.retry_after_ms;
    if (Number.isFinite(structured) && structured >= 0) return structured;

    const seconds = source.retryAfter ?? source.retry_after;
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }

  const text = typeof source === 'string' ? source : String(source?.message ?? '');
  if (!text) return null;

  const header = text.match(/retry[- ]after["'\s:=]+(\d+)/i);
  if (header) return Number(header[1]) * 1000;

  const phrase = text.match(/(?:try again|retry|available again)\s+in\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|h|m|s)\b/i);
  if (phrase) {
    const amount = Number(phrase[1]);
    const unit = phrase[2].toLowerCase();
    if (unit.startsWith('h')) return amount * 3_600_000;
    if (unit.startsWith('m') && unit !== 's') return amount * 60_000;
    return amount * 1000;
  }

  return null;
}

/**
 * Classifies a failed agent outcome.
 *
 * `outcome` is what invokeAgent returns; `envelope` is optional extra structure
 * when the caller has it.
 */
export function classifyFailure(outcome, { envelope = null } = {}) {
  const code = outcome?.error?.code ?? null;
  const message = outcome?.error?.message ?? '';

  // Structured first: our own codes are unambiguous.
  let reason = code ? CODE_MAP[code] ?? null : null;

  // NON_ZERO_EXIT carries the CLI's own message, which is where API causes live.
  if (!reason) {
    const haystack = [message, envelope?.result, envelope?.terminal_reason]
      .filter((v) => typeof v === 'string')
      .join(' ');

    for (const [candidate, pattern] of TEXT_PATTERNS) {
      if (pattern.test(haystack)) {
        reason = candidate;
        break;
      }
    }
  }

  if (!reason) reason = CAPACITY_REASONS.UNKNOWN_FATAL;

  return {
    reason,
    code,
    retryAfterMs: extractRetryAfterMs(message) ?? extractRetryAfterMs(envelope),
    // Kept only for debugging; scrubbed and truncated.
    diagnostic: sanitizeDiagnostic(message),
  };
}
