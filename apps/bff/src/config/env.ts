import "dotenv/config";
import { z } from "zod";

const boolEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    return value;
  }, z.boolean().default(defaultValue));

const intEnv = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return Number(value);
  }, z.number().int().positive().default(defaultValue));

const stringEnv = (defaultValue = "") =>
  z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().default(defaultValue));

const envSchema = z.object({
  NODE_ENV: stringEnv("development"),
  PORT: intEnv(3002),
  DATABASE_URL: stringEnv(),
  JWT_SECRET: stringEnv("dev-only-change-me-with-at-least-32-characters"),
  JWT_EXPIRES_IN: stringEnv("7d"),
  SESSION_COOKIE_NAME: stringEnv("atendly_session"),
  COOKIE_SECURE: boolEnv(false),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  FRONTEND_ORIGIN: stringEnv("http://localhost:3001"),
  API_BASE_URL: stringEnv("http://localhost:3000"),
  API_EVOLUTION_WEBHOOK_TOKEN: stringEnv(),
  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),
  EVOLUTION_GO_API_KEY: stringEnv(),
  EVOLUTION_GO_SEND_TEXT_PATH: stringEnv("/send/text"),
  INTERNAL_SERVICE_TOKEN: stringEnv(),
  BFF_PUBLIC_URL: stringEnv("http://localhost:3002"),
  EVOLUTION_WEBHOOK_SECRET: stringEnv()
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;

if (env.NODE_ENV === "production") {
  const insecureJwtSecret = env.JWT_SECRET.startsWith("dev-only") || env.JWT_SECRET.length < 32;
  if (insecureJwtSecret) {
    throw new Error("JWT_SECRET must be set to a strong value in production.");
  }
}

export function requireEnv(key: keyof Env): string {
  const value = env[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
