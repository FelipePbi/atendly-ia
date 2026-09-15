import "dotenv/config";

import { z } from "zod";

import { DEFAULT_INBOX_RETENTION_DAYS } from "../modules/retention/inbox-retention.js";

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
  // Transcricao de audio (Goal013): mesma conta OpenAI ja configurada, sem
  // provider novo e sem SDK novo — a chamada e HTTP direta.
  OPENAI_BASE_URL: stringEnv("https://api.openai.com/v1"),
  OPENAI_TRANSCRIPTION_MODEL: stringEnv("gpt-4o-mini-transcribe"),
  // Idioma esperado do audio. Informar o idioma e o que evita a transcricao
  // "traduzir" sozinha um audio em portugues.
  OPENAI_TRANSCRIPTION_LANGUAGE: stringEnv("pt"),
  // Timeout proprio da transcricao: ela e chamada de rede dentro do lease da
  // inbox, que so continua valendo porque o heartbeat renova enquanto o lote
  // executa. Sem teto, um audio pendurado seguraria o lote inteiro.
  OPENAI_TRANSCRIPTION_TIMEOUT_MS: intEnv(120_000),
  // Tetos da transcricao, avaliados **antes** de qualquer byte ser buscado.
  // Acima deles o audio e SKIPPED com motivo nomeado, nunca transcrito pela
  // metade. O teto de tamanho e o da propria API de audio da OpenAI (25 MB);
  // ele fica acima do teto de embutir inline do Go de proposito: entre os
  // dois, o audio ainda e transcrito, so que por download sob demanda.
  AUDIO_TRANSCRIPTION_MAX_BYTES: intEnv(25 * 1024 * 1024),
  AUDIO_TRANSCRIPTION_MAX_SECONDS: intEnv(600),
  KNOWLEDGE_SEARCH_LIMIT: intEnv(4),
  KNOWLEDGE_SEARCH_MIN_SCORE: numberEnv(0.65),
  // Memoria do cliente: idade a partir da qual um item entra no prompt
  // **marcado como antigo**, de menor peso. Nao apaga e nao filtra — preferencia
  // inferida nao e verdade eterna, mas continua sendo material da conversa.
  CUSTOMER_MEMORY_STALE_DAYS: intEnv(180),
  // Teto do que entra no prompt por pessoa. O corte e por relevancia (recente
  // primeiro), nunca aleatorio.
  CUSTOMER_MEMORY_PROMPT_LIMIT: intEnv(12),
  EVOLUTION_WEBHOOK_TOKEN: stringEnv(),
  EVOLUTION_BASE_URL: stringEnv("http://evolution-go:8080"),
  EVOLUTION_API_KEY: stringEnv(),
  EVOLUTION_SEND_TEXT_PATH: stringEnv("/send/text"),
  // Download sob demanda da midia (Goal013): mesma credencial de instancia do
  // envio, nunca a chave global.
  EVOLUTION_DOWNLOAD_MEDIA_PATH: stringEnv("/message/downloadmedia"),
  // Baixar do WhatsApp demora mais que responder um envio de texto, entao o
  // teto e proprio em vez de reaproveitar EVOLUTION_SEND_TIMEOUT_MS.
  EVOLUTION_DOWNLOAD_MEDIA_TIMEOUT_MS: intEnv(60_000),
  EVOLUTION_IGNORE_GROUPS: boolEnv(true),
  EVOLUTION_BOT_ENABLED: boolEnv(true),
  EVOLUTION_ALLOW_SELF_CHAT: boolEnv(false),
  // Teto do corpo aceito pela rota do webhook (Goal013): mídia inline chega em
  // base64 dentro do JSON, então o limite padrão do Fastify (1 MiB) rejeitaria
  // um áudio ou imagem comuns antes de qualquer mapeamento.
  EVOLUTION_WEBHOOK_BODY_LIMIT_BYTES: intEnv(32 * 1024 * 1024),
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
  // Sessao de conversa: inatividade **do contato** que expira a sessao
  // (~24 h). E fronteira configuravel e testada; mudar este valor muda o
  // relogio da sessao, nunca em silencio (D-009).
  AI_SESSION_INACTIVITY_SECONDS: intEnv(86_400),
  // Inbox duravel: o loop roda no proprio processo da IA. Sem broker novo.
  INBOX_WORKER_ENABLED: boolEnv(true),
  INBOX_POLL_INTERVAL_MS: intEnv(1000),
  INBOX_LEASE_SECONDS: intEnv(120),
  INBOX_MAX_ATTEMPTS: intEnv(5),
  INBOX_RETRY_BASE_SECONDS: intEnv(15),
  INBOX_RETRY_MAX_SECONDS: intEnv(900),
  INBOX_MAX_CONCURRENT_CONVERSATIONS: intEnv(4),
  // Heartbeat do lease: o lote longo (LLM + tools + envio) renova o lease
  // enquanto executa, em vez de perde-lo para outro ciclo no meio do trabalho.
  INBOX_LEASE_HEARTBEAT_SECONDS: intEnv(30),
  INBOX_GROUP_BATCH_LIMIT: intEnv(20),
  // Retencao tecnica do inbox duravel (Goal023/§6). Nao e conteudo de
  // conversa e nao e escolha da profissional: `ProcessedEvent` e rastro de
  // execucao do transporte, entao o prazo vem daqui e nunca de
  // `RetentionSettings`. O default folgado e deliberado — a consequencia
  // sobre o dedupe de entrada esta escrita junto da constante, em
  // `modules/retention/inbox-retention.ts`.
  INBOX_RETENTION_DAYS: intEnv(DEFAULT_INBOX_RETENTION_DAYS),
  // Entrega das intencoes de envio (Goal021). Mesmo desenho da inbox: o loop
  // roda no proprio processo da IA, sem broker novo e sem servico novo.
  NOTIFICATION_DELIVERY_ENABLED: boolEnv(true),
  // Varrer a cada 15s e suficiente: a antecedencia do lembrete e medida em
  // horas, e varrer mais rapido so gastaria chamada interna.
  NOTIFICATION_DELIVERY_POLL_INTERVAL_MS: intEnv(15_000),
  // Tetos do lote. O de tenant existe contra a rajada: uma importacao recem
  // concluida nao pode virar dezenas de lembretes de um negocio so.
  NOTIFICATION_DELIVERY_BATCH_LIMIT: intEnv(50),
  NOTIFICATION_DELIVERY_TENANT_LIMIT: intEnv(10),
  // Lease pedido ao dono. Folgado em relacao ao envio de texto, para que uma
  // entrega lenta nao seja recuperada por outra varredura no meio do caminho.
  NOTIFICATION_DELIVERY_LEASE_SECONDS: intEnv(120),
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
  // Instancia oficial da Atendly (Goal019): **configuracao do servico**, nunca
  // vinculo de negocio. Ela nao cabe como linha de `ChannelConnection` — que e
  // unica por (tenantId, provider) — e nao pertence a nenhum tenant, entao mora
  // aqui e e lida por resolvedor proprio (`config/platform-whatsapp.ts`).
  // O caminho que resolve credencial de negocio nao le nenhuma destas chaves.
  PLATFORM_WHATSAPP_INSTANCE_ID: stringEnv(),
  PLATFORM_WHATSAPP_CREDENTIAL: stringEnv(),
  PLATFORM_WHATSAPP_NUMBER: stringEnv(),
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
