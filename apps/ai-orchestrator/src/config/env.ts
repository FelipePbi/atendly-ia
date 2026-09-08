import "dotenv/config";

import { z } from "zod";

const stringEnv = (defaultValue = "") =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    return value.trim();
  }, z.string().default(defaultValue));

const serviceTokenEnv = () =>
  z.preprocess(
    (value) =>
      typeof value === "string"
        ? value.trim().replace(/^Bearer\s+/iu, "")
        : value,
    z.string().default(""),
  );

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
  EVOLUTION_WEBHOOK_TOKEN: stringEnv(),
  EVOLUTION_BASE_URL: stringEnv("http://evolution-go:8080"),
  EVOLUTION_API_KEY: stringEnv(),
  EVOLUTION_SEND_TEXT_PATH: stringEnv("/send/text"),
  EVOLUTION_IGNORE_GROUPS: boolEnv(true),
  EVOLUTION_BOT_ENABLED: boolEnv(true),
  EVOLUTION_ALLOW_SELF_CHAT: boolEnv(false),
  HUMAN_HANDOFF_PAUSE_MINUTES: intEnv(120),
  AI_DEBOUNCE_MIN_SECONDS: intEnv(8),
  AI_DEBOUNCE_MAX_SECONDS: intEnv(35),
  AI_DEBOUNCE_MAX_WAIT_SECONDS: intEnv(60),
  // Espera da mensagem ambigua: primeira mensagem de um numero sem historico,
  // curta e sem pedido. A resposta e adiada para a pessoa dizer o que quer,
  // com teto desde a primeira mensagem.
  AI_AMBIGUOUS_WAIT_SECONDS: intEnv(120),
  AI_AMBIGUOUS_MAX_WAIT_SECONDS: intEnv(300),
  AI_BUFFER_BETWEEN_SERVICES_MINUTES: intEnv(0),
  // Inbox duravel: o loop roda no proprio processo da IA. Sem broker novo.
  INBOX_WORKER_ENABLED: boolEnv(true),
  INBOX_POLL_INTERVAL_MS: intEnv(1000),
  INBOX_LEASE_SECONDS: intEnv(120),
  INBOX_MAX_ATTEMPTS: intEnv(5),
  INBOX_RETRY_BASE_SECONDS: intEnv(15),
  INBOX_RETRY_MAX_SECONDS: intEnv(900),
  INBOX_MAX_CONCURRENT_CONVERSATIONS: intEnv(4),
  INBOX_GROUP_BATCH_LIMIT: intEnv(20),
  // Timeout do envio: sem ele o transporte fica pendurado e o estado da saida
  // nunca sai de PENDING.
  EVOLUTION_SEND_TIMEOUT_MS: intEnv(15000),
  AI_PROMPT_VERSION: stringEnv("scheduling_v1.0.0"),
  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://localhost:3003"),
  INTERNAL_SERVICE_TOKEN: serviceTokenEnv(),
  // Credenciais que a IA aceita, por uso. Vazias, são derivadas de
  // INTERNAL_SERVICE_TOKEN por HMAC; o valor bruto do segredo compartilhado
  // deixa de ser aceito, então provisionamento e comando não se substituem.
  INTERNAL_PROVISIONING_TOKEN: serviceTokenEnv(),
  INTERNAL_COMMAND_TOKEN: serviceTokenEnv(),
  // Credencial que a IA apresenta ao scheduling-service.
  SCHEDULING_SERVICE_COMMAND_TOKEN: serviceTokenEnv(),
  // Cifra da projeção da credencial de instância: "<keyId>:<chave base64 de 32
  // bytes>", separadas por vírgula.
  CHANNEL_CREDENTIAL_KEYS: stringEnv(),
  CHANNEL_CREDENTIAL_ACTIVE_KEY_ID: stringEnv(),
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
