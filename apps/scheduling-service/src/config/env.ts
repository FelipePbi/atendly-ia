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

const boolEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    }
    return value;
  }, z.boolean().default(defaultValue));

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
  // Politica unica de escrita da agenda (Goal008): quantas vezes uma
  // transacao Serializable e tentada antes de devolver erro proprio diante de
  // aborto serializavel (40001/40P01/P2034). Uma tentativa e o comportamento
  // sem retry; o padrao repete duas vezes antes de desistir.
  CALENDAR_WRITE_MAX_ATTEMPTS: intEnv(3),
  // Hold de confirmacao (Goal008): por quantos segundos um horario fica
  // reservado enquanto a confirmacao acontece. O padrao e os cinco minutos da
  // regra de produto; a vigencia continua sendo decidida pelo relogio do
  // banco, este valor so define o TTL somado a `now()` na criacao.
  CALENDAR_HOLD_TTL_SECONDS: intEnv(300),
  // Conclusao automatica (Goal008): liga o loop que marca COMPLETED, com
  // origem AUTO, os atendimentos confirmados cujo termino venceu ha
  // `CALENDAR_AUTO_COMPLETE_GRACE_MINUTES` (relogio do banco). Desligavel
  // por variavel para operacao ou para os testes de integracao que nao
  // querem o loop competindo com o cenario.
  CALENDAR_AUTO_COMPLETE_ENABLED: boolEnv(true),
  CALENDAR_AUTO_COMPLETE_GRACE_MINUTES: intEnv(30),
  CALENDAR_AUTO_COMPLETE_POLL_INTERVAL_MS: intEnv(60_000),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production") {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured in production.");
  }

  const hasExplicitClientTokens =
    Boolean(env.BFF_COMMAND_TOKEN) &&
    Boolean(env.AI_ORCHESTRATOR_COMMAND_TOKEN);
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
