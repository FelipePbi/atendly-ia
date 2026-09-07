import "dotenv/config";

import { z } from "zod";

const intEnv = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return Number(value);
  }, z.number().int().positive().default(defaultValue));

const stringEnv = (defaultValue = "") =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().default(defaultValue),
  );

const serviceTokenEnv = () =>
  z.preprocess(
    (value) =>
      typeof value === "string"
        ? value.trim().replace(/^Bearer\s+/iu, "")
        : value,
    z.string().default(""),
  );

const envSchema = z.object({
  NODE_ENV: stringEnv("development"),
  PORT: intEnv(3003),
  DATABASE_URL: stringEnv(),
  // Raiz da derivação das credenciais internas quando não há valor explícito
  // por chamador. O valor bruto não é aceito como credencial.
  INTERNAL_SERVICE_TOKEN: serviceTokenEnv(),
  BFF_COMMAND_TOKEN: serviceTokenEnv(),
  AI_ORCHESTRATOR_COMMAND_TOKEN: serviceTokenEnv(),
  INTEGRATION_CREDENTIALS_KEY: stringEnv(),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production") {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured in production.");
  }

  const hasExplicitClientTokens =
    Boolean(env.BFF_COMMAND_TOKEN) && Boolean(env.AI_ORCHESTRATOR_COMMAND_TOKEN);
  if (!hasExplicitClientTokens && env.INTERNAL_SERVICE_TOKEN.length < 32) {
    throw new Error(
      "INTERNAL_SERVICE_TOKEN must contain at least 32 characters in production when per-caller tokens are not configured.",
    );
  }

  if (!env.INTEGRATION_CREDENTIALS_KEY) {
    throw new Error(
      "INTEGRATION_CREDENTIALS_KEY must be configured in production.",
    );
  }
}
