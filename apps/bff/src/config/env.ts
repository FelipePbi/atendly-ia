import "dotenv/config";

import { z } from "zod";

const boolEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string")
      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    return value;
  }, z.boolean().default(defaultValue));

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
  PORT: intEnv(3002),
  DATABASE_URL: stringEnv(),
  JWT_SECRET: stringEnv("dev-only-change-me-with-at-least-32-characters"),
  JWT_EXPIRES_IN: stringEnv("7d"),
  SESSION_COOKIE_NAME: stringEnv("avenly_session"),
  CSRF_COOKIE_NAME: stringEnv("avenly_csrf"),
  CSRF_HEADER_NAME: stringEnv("x-csrf-token"),
  SESSION_TTL_HOURS: intEnv(24 * 7),
  COOKIE_SECURE: boolEnv(false),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  FRONTEND_ORIGIN: stringEnv("http://localhost:3001"),
  AI_ORCHESTRATOR_BASE_URL: stringEnv("http://localhost:3000"),
  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://localhost:3003"),
  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),
  EVOLUTION_GO_API_KEY: stringEnv(),
  INTERNAL_SERVICE_TOKEN: serviceTokenEnv(),
  // Credenciais por chamador/uso. Vazias, são derivadas de
  // INTERNAL_SERVICE_TOKEN por HMAC — nunca o próprio valor bruto, para que o
  // token de provisionamento não sirva de fallback de comando comum.
  AI_ORCHESTRATOR_PROVISIONING_TOKEN: serviceTokenEnv(),
  AI_ORCHESTRATOR_COMMAND_TOKEN: serviceTokenEnv(),
  SCHEDULING_SERVICE_COMMAND_TOKEN: serviceTokenEnv(),
  // Cifra da credencial de instância: "<keyId>:<chave base64 de 32 bytes>",
  // separadas por vírgula. A chave ativa é a usada em novas gravações.
  WHATSAPP_CREDENTIAL_KEYS: stringEnv(),
  WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID: stringEnv(),
  INTERNAL_HTTP_TIMEOUT_MS: intEnv(10_000),
  INTERNAL_HTTP_GET_RETRIES: intEnv(2),
  // Teto de bytes que o BFF aceita repassar de um corpo binário do serviço
  // interno (Goal013: rota de mídia). Nao e o teto de mídia embutida do
  // webhook nem o de transcrição — é so a salvaguarda de transporte do BFF.
  INTERNAL_HTTP_MEDIA_MAX_BYTES: intEnv(32 * 1024 * 1024),
  // Teto proprio do proxy de midia (Goal017/WU-01), maior que
  // EVOLUTION_DOWNLOAD_MEDIA_TIMEOUT_MS (60s) da IA: o download upstream da
  // Evolution acontece dentro daquele prazo antes da IA responder ao BFF, e
  // INTERNAL_HTTP_TIMEOUT_MS (rotas JSON) e curto demais para esperar por ele.
  INTERNAL_HTTP_MEDIA_TIMEOUT_MS: intEnv(90_000),
  // Janela minima entre duas reconciliacoes da central de notificacoes do
  // mesmo negocio (Goal022). A materializacao roda dentro de requisicao que ja
  // existe, entao o throttle e o que impede uma tela aberta de transformar
  // cada poll em uma rodada de leituras nos donos. Configuravel de proposito:
  // nao e constante magica espalhada pelo codigo.
  NOTIFICATIONS_RECONCILE_MIN_INTERVAL_SECONDS: intEnv(60),
  // Varredura de retencao (Goal023/WU-05). Defaults conservadores e
  // declarados: **desligada**, porque purga e destrutiva e ligar por omissao
  // seria apagar conteudo de negocio sem ninguem ter pedido. Desligada, nada
  // mais do produto muda — nenhuma rota, leitura ou tela depende do laco — e
  // as suites nunca o sobem.
  RETENTION_SWEEP_ENABLED: boolEnv(false),
  // Intervalo entre passadas quando a anterior nao deixou trabalho. Com
  // trabalho restante o laco reagenda imediato, como o entregador do Goal021.
  RETENTION_SWEEP_INTERVAL_SECONDS: intEnv(900),
  // Validade do lease por negocio. Folgado em relacao a uma passada (tres
  // chamadas com teto de linhas), curto o bastante para que um processo morto
  // nao prenda o negocio por muito tempo.
  RETENTION_SWEEP_LEASE_TTL_SECONDS: intEnv(300),
  // Quantos negocios uma passada tenta varrer. Teto do fôlego do ciclo, nao
  // do trabalho: o que sobra fica para a passada seguinte, mais antigo
  // primeiro.
  RETENTION_SWEEP_TENANT_BATCH: intEnv(20),
  // Teto de linhas por store, por negocio, por passada. O que passar dele
  // volta como `hasMore` e espera a proxima — nenhuma passada varre sem fim.
  RETENTION_SWEEP_MAX_ROWS_PER_STORE: intEnv(500),
  // Piso entre duas passadas **completas** do mesmo negocio. Varrer o mesmo
  // negocio de novo minutos depois nao apaga nada (a passada e idempotente) e
  // so gastaria chamada interna nos tres donos; uma hora e folgado para um
  // prazo medido em dezenas de dias. O piso nao se aplica a passada que parou
  // no teto: `lastHasMore` significa que ainda ha resto declarado, e o resto
  // continua imediatamente, como o laco ja reagenda.
  RETENTION_SWEEP_MIN_TENANT_INTERVAL_SECONDS: intEnv(3_600),
  // Prazo **tecnico** do conteudo das intencoes de lembrete (Goal023/§6).
  // `facts`/`detail` sao rastro de execucao do envio, nao conteudo de
  // conversa: eles nao carregam a categoria da sessao que os originou e por
  // isso nao podem herdar o prazo que a profissional escolheu em
  // Configuracoes -> Conversas. Um negocio que escolhe 365/365 nao esta
  // pedindo para guardar telefone de lembrete por um ano, e um que escolhe
  // 30/30 nao esta pedindo para apagar rastro de entrega em um mes. 90 dias
  // cobre com folga qualquer auditoria de "o lembrete saiu?" — que e a unica
  // pergunta que esses campos respondem — sem virar deposito indefinido. A
  // **linha** nunca e apagada: ela e a identidade de dedupe do Goal021.
  RETENTION_INTENT_CONTENT_DAYS: intEnv(90),
  // Purga da conta vencida (Goal025/WU-07). Variavel **propria**, separada da
  // varredura de retencao de proposito: ligar a expiracao de conteudo nao pode
  // ligar, por consequencia, o apagamento de contas inteiras. Desligada por
  // default pelo mesmo motivo do Goal023, agora mais forte — a passada apaga o
  // negocio e o dono. Desligada, nada mais do produto muda: nenhuma rota,
  // leitura ou tela depende do laco, e as suites nunca o sobem.
  ACCOUNT_PURGE_ENABLED: boolEnv(false),
  // Intervalo entre passadas quando a anterior nao deixou trabalho. Uma conta
  // vencida ha 15 minutos e uma vencida ha 1 minuto sao a mesma coisa para um
  // prazo de sete dias.
  ACCOUNT_PURGE_INTERVAL_SECONDS: intEnv(900),
  // Validade do lease por conta. Folgado em relacao a uma passada (duas
  // chamadas internas com teto de linhas mais o apagamento local), curto o
  // bastante para que um processo morto nao prenda a conta por muito tempo.
  ACCOUNT_PURGE_LEASE_TTL_SECONDS: intEnv(300),
  // Quantas contas uma passada tenta purgar. Baixo de proposito: o volume
  // normal de exclusoes vencidas no mesmo minuto e proximo de zero, e cada
  // conta custa duas chamadas internas e um DELETE em cascata.
  ACCOUNT_PURGE_BATCH: intEnv(5),
  // Teto de linhas por loja remota, por conta, por passada. O que passar dele
  // volta como `hasMore`, a conta continua SCHEDULED e a passada seguinte
  // continua de onde parou — nenhuma passada purga sem fim. O teto das rotas
  // internas (WU-05/WU-06) e 5000; ficar abaixo dele e escolha do chamador.
  ACCOUNT_PURGE_MAX_ROWS_PER_STORE: intEnv(2_000),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: intEnv(30),
  PASSWORD_RESET_PUBLIC_URL: stringEnv("http://localhost:3001/nova-senha"),
  PASSWORD_RESET_DELIVERY_URL: stringEnv(),
  PASSWORD_RESET_DELIVERY_TOKEN: stringEnv(),
  EVOLUTION_WEBHOOK_SECRET: stringEnv(),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;

if (env.NODE_ENV === "production") {
  const insecureJwtSecret =
    env.JWT_SECRET.startsWith("dev-only") || env.JWT_SECRET.length < 32;
  if (insecureJwtSecret) {
    throw new Error("JWT_SECRET must be set to a strong value in production.");
  }
  if (!env.WHATSAPP_CREDENTIAL_KEYS) {
    throw new Error(
      "WHATSAPP_CREDENTIAL_KEYS must be configured in production: the WhatsApp instance credential is never stored in plain text.",
    );
  }
}

export function requireEnv(key: keyof Env): string {
  const value = env[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
