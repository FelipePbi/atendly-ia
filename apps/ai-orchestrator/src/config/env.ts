import "dotenv/config";

import { z } from "zod";

const stringEnv = (defaultValue = "") =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    return value.trim();
  }, z.string().default(defaultValue));

const intEnv = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return Number(value);
  }, z.number().int().default(defaultValue));

const numberEnv = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return Number(value);
  }, z.number().default(defaultValue));

const boolEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    }
    return value;
  }, z.boolean().default(defaultValue));

const envSchema = z.object({
  NODE_ENV: stringEnv("development"),
  AI_ORCHESTRATOR_PORT: intEnv(3000),
  PORT: intEnv(3000),
  DATABASE_URL: stringEnv(),
  OPENAI_API_KEY: stringEnv(),
  OPENAI_MODEL: stringEnv("gpt-5.4-mini"),
  OPENAI_EMBEDDING_MODEL: stringEnv("text-embedding-3-small"),
  OPENAI_MAX_OUTPUT_TOKENS: intEnv(600),
  KNOWLEDGE_SEARCH_LIMIT: intEnv(4),
  KNOWLEDGE_SEARCH_MIN_SCORE: numberEnv(0.65),
  CHANNEL_PROVIDER: z.literal("evolution-go").default("evolution-go"),
  EVOLUTION_WEBHOOK_TOKEN: stringEnv(),
  EVOLUTION_BASE_URL: stringEnv("http://evolution-go:8080"),
  EVOLUTION_API_KEY: stringEnv(),
  EVOLUTION_INSTANCE_ID: stringEnv(),
  EVOLUTION_INSTANCE_TOKEN: stringEnv(),
  EVOLUTION_INSTANCE_NAME: stringEnv("salao-principal"),
  EVOLUTION_SEND_TEXT_PATH: stringEnv("/send/text"),
  EVOLUTION_IGNORE_GROUPS: boolEnv(true),
  EVOLUTION_BOT_ENABLED: boolEnv(true),
  EVOLUTION_ALLOW_SELF_CHAT: boolEnv(false),
  HUMAN_HANDOFF_PAUSE_MINUTES: intEnv(120),
  AI_DEBOUNCE_MIN_SECONDS: intEnv(8),
  AI_DEBOUNCE_MAX_SECONDS: intEnv(35),
  AI_DEBOUNCE_MAX_WAIT_SECONDS: intEnv(60),
  AI_BUFFER_BETWEEN_SERVICES_MINUTES: intEnv(0),
  AI_PROMPT_VERSION: stringEnv("scheduling_v1.0.0"),
  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://localhost:3003"),
  ADMIN_API_TOKEN: stringEnv(),
  INTERNAL_SERVICE_TOKEN: stringEnv(),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;

export function requireEnv(keys: Array<keyof Env>): void {
  const missing = keys.filter((key) => {
    const value = env[key];
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

export function requireOpenAiEnv(): void {
  requireEnv(["OPENAI_API_KEY", "OPENAI_MODEL"]);
}

export function requireEvolutionEnv(): void {
  requireEnv(["EVOLUTION_BASE_URL"]);
  if (!env.EVOLUTION_INSTANCE_TOKEN && !env.EVOLUTION_API_KEY) {
    throw new Error(
      "Missing required environment variables: EVOLUTION_INSTANCE_TOKEN or EVOLUTION_API_KEY",
    );
  }
}
