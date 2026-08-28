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

const envSchema = z.object({
  NODE_ENV: stringEnv("development"),
  PORT: intEnv(3003),
  DATABASE_URL: stringEnv(),
  INTERNAL_SERVICE_TOKEN: stringEnv(),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production") {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured in production.");
  }

  if (env.INTERNAL_SERVICE_TOKEN.length < 32) {
    throw new Error(
      "INTERNAL_SERVICE_TOKEN must contain at least 32 characters in production.",
    );
  }
}
