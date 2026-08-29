const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "apikey",
  "apiKey",
  "key",
  "secret",
  "password",
]);

export function redactRequestUrl(
  value: string | undefined,
): string | undefined {
  if (!value) return value;

  try {
    const url = new URL(value, "http://redact.local");
    let changed = false;

    for (const key of SENSITIVE_QUERY_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, "[REDACTED]");
        changed = true;
      }
    }

    return changed ? `${url.pathname}${url.search}${url.hash}` : value;
  } catch {
    return value.replace(
      /([?&](?:token|apikey|apiKey|key|secret|password)=)[^&]*/g,
      "$1[REDACTED]",
    );
  }
}
