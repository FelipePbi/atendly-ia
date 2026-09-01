const sensitiveKeys = new Set([
  "authorization",
  "access_token",
  "token",
  "password",
  "senha",
  "api_key",
  "apikey",
  "secret",
  "credentials",
  "integration_credentials",
  "client_secret",
  "cookie",
  "set-cookie",
  "evolution_api_key",
  "evolution_webhook_token",
  "minha_agenda_password",
  "openai_api_key",
]);

export function redactSensitive<T>(value: T): T;
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => redactSensitive(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        const normalized = key.toLowerCase();
        if (
          sensitiveKeys.has(normalized) ||
          normalized.includes("token") ||
          normalized.includes("password") ||
          normalized.includes("secret") ||
          normalized.includes("credential")
        ) {
          return [key, "[REDACTED]"];
        }
        return [key, redactSensitive(nested)];
      }),
    );
  }

  return value;
}
