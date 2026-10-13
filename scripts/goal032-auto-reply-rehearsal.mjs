#!/usr/bin/env node

// Ensaio do Goal032: a resposta automática da IA pelo caminho de produção, do
// webhook até a saída entregue ao transporte, contra um banco PostgreSQL
// descartável de verdade.
//
// O que este ensaio faz, e que nenhum outro faz: sobe o orquestrador de IA
// real **com o worker da inbox ligado** e deixa o laço de produção trabalhar
// sozinho. O Goal030 provou recebimento durável e persistência na conversa e
// declarou, no cabeçalho do próprio ensaio, que a resposta automática ficava
// fora (`scripts/goal030-mvp-journey-rehearsal.mjs:81`). É essa lacuna que
// este arquivo fecha.
//
// O caminho exercitado, na ordem em que a produção o atravessa:
//
//   1. `POST /webhooks/evolution` por HTTP real contra a IA real;
//   2. `ProcessedEvent` gravado **antes** do `202`;
//   3. claim pelo `InboxWorker` real, dentro do processo da IA;
//   4. `InboundEventDispatcher` **sem** `buildProcessor` injetado;
//   5. `buildInboundMessageProcessor` — grafo, assistente, sessão, memória e
//      ferramentas reais;
//   6. `EvolutionProvider` real chamando o dublê de transporte em loopback.
//
// Regras que este arquivo cumpre, e que são o motivo de ele existir:
//
// - **Nenhum substituto interno.** Não existe processador dublê, assistente
//   dublê, grafo dublê nem transporte dublê. Os dois únicos dublês são os dois
//   serviços **externos** — OpenAI e Evolution Go —, e os dois escutam em
//   `127.0.0.1`. Redirecionar os dois é costura de ambiente
//   (`OPENAI_BASE_URL`, `EVOLUTION_BASE_URL`), que vale igual em produção.
// - **Nenhum claim manual e nenhum relógio falso.** O Goal030 adiantava o
//   relógio para reivindicar o lote na mão; aqui quem reivindica é o worker de
//   produção. As janelas que adiam o trabalho — `AI_DEBOUNCE_MIN_SECONDS`,
//   `AI_AMBIGUOUS_WAIT_SECONDS`, `INBOX_POLL_INTERVAL_MS` — são **encurtadas
//   por ambiente**, que é o que elas existem para permitir.
// - **A espera pelo worker tem teto declarado.** `WORKER_WAIT_TIMEOUT_MS` é o
//   teto; o estouro derruba o ensaio com mensagem própria, nunca com uma
//   asserção vaga de "nada aconteceu".
// - **Guards de destino primeiro.** Sem `AI_TEST_DATABASE_URL` apontando para
//   cluster descartável em loopback, o ensaio recusa (`exit 2`) **antes de
//   qualquer escrita** — antes do `DROP DATABASE`, antes da migration e antes
//   de qualquer subprocesso. Strings de conexão passam por
//   `redactConnectionStrings` e credencial nenhuma é impressa.
// - **Nenhum endereço fora de loopback.** Os dois dublês são conferidos depois
//   do `listen` (o endereço efetivo, não o pedido), e o que sobra de fronteira
//   — o scheduling-service — aponta para uma porta de loopback onde nada
//   escuta: o laço de ferramentas fica declaradamente fora deste ensaio.
//
// Limites declarados: o laço de entrega de notificações, a varredura de
// retenção e a purga de conta ficam desligados; áudio, mídia e o laço de
// ferramentas contra o Scheduling real não são exercitados; e **M4** — envio
// real a número real — continua aberto como gate operacional. Grupo é
// exercitado, mas só o suficiente para provar o descarte: nenhum caminho de
// resposta de grupo passa por aqui.
//
// Controle negativo: `GOAL032_BREAK_LINK` quebra um elo declarado do ensaio
// para demonstrar que ele cai (`exit 1`) quando a composição deixa de valer.
// Os cinco elos obrigatórios — `human-control`, `ignore-ai`, `idempotency`,
// `supersede` e `group` — estão em `BREAKABLE_LINKS`, e cada um reprova com
// mensagem própria. Quebrar um elo é **pular uma etapa do percurso**, nunca
// relaxar uma asserção nem alterar código de produção. Sem a variável o
// caminho verde é idêntico; e elo quebrado que mesmo assim passe também
// reprova, porque aí o ensaio não estaria provando o que diz provar.
//
// Códigos de saída: 0 sucesso, 1 falha de asserção, 2 recusa (destino inválido
// ou dependência ausente). Sem caminho de skip.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isMain } from "./lib/gate.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DISPOSABLE_NAME = /(?:^|[_-])test(?:[_-]|$)/iu;

/**
 * Teto da espera pelo worker real, em milissegundos.
 *
 * É o único tempo de parede do ensaio, e existe porque quem reivindica o lote
 * é o laço de produção: não há claim manual para encurtar o caminho. As
 * janelas já foram encurtadas por ambiente (ver `rehearsalEnvironment`), então
 * um minuto é folga larga sobre o que o percurso leva; o que ele protege é o
 * caso em que o worker **nunca** entrega, que precisa cair com mensagem
 * própria em vez de pendurar o gate.
 */
export const WORKER_WAIT_TIMEOUT_MS = 60_000;

/** Intervalo entre duas leituras do estado enquanto o ensaio espera. */
const WORKER_POLL_INTERVAL_MS = 250;

// Sintéticos e de uso único deste ensaio: nunca derivam de segredo real e
// nunca são impressos. O token interno é a raiz de onde o próprio ensaio
// deriva a credencial de provisionamento, exatamente como o BFF faria.
const INTERNAL_TOKEN = "goal032-auto-reply-rehearsal-synthetic-internal-token";
const WEBHOOK_TOKEN = "goal032-auto-reply-rehearsal-synthetic-webhook-token";
const CHANNEL_KEY_ID = "goal032";
// Exatamente 32 bytes em base64, fixos e sintéticos: banco descartável, chave
// descartável. O tamanho não é escolha — `parseKeys` descarta em silêncio
// qualquer material que não tenha 32 bytes, e a cifra ficaria sem chave.
const CHANNEL_KEY = "Z29hbDAzMi1hdXRvLXJlcGx5LXJlaGVhcnNhbC1rMzI=";
const INSTANCE_CREDENTIAL =
  "goal032-auto-reply-rehearsal-synthetic-instance-credential";
// Chave sintética da fronteira do OpenAI. Ela nunca sai para a internet: o
// único destino configurado é o dublê em loopback. Existe porque
// `requireOpenAiEnv()` continua exigindo chave, e o ensaio não afrouxa isso.
const OPENAI_KEY = "goal032-auto-reply-rehearsal-synthetic-openai-key";

/**
 * O negócio e o contato que atravessam o ensaio. Fixture de **entrada** — o
 * que o BFF projetaria e o que uma pessoa digitaria —, nunca de estado: nada
 * aqui é escrito direto na conversa.
 *
 * O texto do contato é escolhido para atravessar o caminho inteiro até o
 * modelo, e a escolha não é estética:
 *
 * - `classifyMessageIntent` o lê como `simple_response`, então o turno não
 *   chama o laço de ferramentas contra o Scheduling, que está declarado fora;
 * - ele não dispara nenhuma das decisões imediatas de `buildImmediateDecision`
 *   (humano, reclamação sensível, fornecedor, contato pessoal, saudação
 *   genérica), que respondem **sem** chamar o modelo. Uma delas — contato
 *   pessoal — chegou a ser disparada por "amiga" numa versão anterior deste
 *   texto, e a conversa foi para `HUMAN_HANDOFF` com a saída cancelada: o
 *   guardrail de privacidade funcionando, mas provando outra coisa.
 */
export const REHEARSAL = Object.freeze({
  tenantId: "goal032-auto-reply-tenant",
  userId: "goal032-auto-reply-user",
  businessName: "Estudio Goal032 Resposta",
  segment: "Beleza e estetica",
  timezone: "America/Sao_Paulo",
  address: "Rua do Ensaio, 32 - Sala 2",
  instanceId: "goal032-auto-reply-instance",
  contact: Object.freeze({
    phone: "5511990000032",
    name: "Nina da Resposta",
    text: "Boa tarde! Estou procurando um lugar novo para cuidar do meu cabelo.",
    messageId: "goal032-auto-reply-inbound-1",
  }),
});

/**
 * Elos que o controle negativo sabe quebrar, e o que cada um derruba.
 *
 * Cada elo é uma etapa do ensaio deixando de acontecer — nunca uma asserção
 * relaxada nem código de produção alterado. `GOAL032_BREAK_LINK=<elo>` derruba
 * o ensaio com `exit 1`, e o elo quebrado é nomeado na saída.
 */
export const BREAKABLE_LINKS = Object.freeze({
  "human-control":
    "pula o takeover pelo painel; a sessão continua da IA, a mensagem seguinte é respondida pelo modelo e o elo do controle humano cai",
  "ignore-ai":
    "pula a marcação de `Ignorar IA` do contato; a mensagem é atendida pelo modelo e o elo do contato ignorado cai",
  idempotency:
    "entrega o segundo evento com outro `messageId`, então ele deixa de ser o mesmo evento; nascem duas respostas e dois envios, e o elo da idempotência cai",
  supersede:
    "não entrega a mensagem nova enquanto a resposta está pendente; nada pede a reavaliação, a saída pendente sai e o elo do supersede cai",
  group:
    "entrega o mesmo evento sem a marca de grupo no `Chat`; a mensagem vira conversa pessoal comum, é atendida pelo modelo e o elo do grupo cai",
});

/**
 * Os contatos dos cinco elos de controle negativo.
 *
 * Um contato por elo, e nenhum deles é o da prova positiva: cada elo precisa da
 * própria conversa para que a contagem lida do banco seja dele, e não do que o
 * elo anterior deixou para trás. O texto continua sendo o da prova positiva,
 * pela mesma razão dela — atravessa o caminho inteiro sem cair numa decisão
 * imediata e sem chamar o laço de ferramentas.
 */
export const NEGATIVE_CONTROL = Object.freeze({
  humanControl: Object.freeze({
    link: "human-control",
    phone: "5511990000033",
    name: "Bia do Controle Humano",
    // O primeiro turno existe só para haver conversa a assumir: takeover é
    // sobre uma conversa, e não existe conversa antes da primeira mensagem.
    setupMessageId: "goal032-human-control-inbound-1",
    probeMessageId: "goal032-human-control-inbound-2",
  }),
  ignoreAi: Object.freeze({
    link: "ignore-ai",
    phone: "5511990000034",
    name: "Cora do Ignorar IA",
    messageId: "goal032-ignore-ai-inbound-1",
  }),
  idempotency: Object.freeze({
    link: "idempotency",
    phone: "5511990000035",
    name: "Dora da Idempotencia",
    messageId: "goal032-idempotency-inbound-1",
    // Só o elo quebrado usa este id: com outro `messageId` o segundo evento
    // deixa de ser o mesmo evento, que é exatamente o que se quer mostrar.
    brokenMessageId: "goal032-idempotency-inbound-2",
  }),
  supersede: Object.freeze({
    link: "supersede",
    phone: "5511990000036",
    name: "Elis do Supersede",
    firstMessageId: "goal032-supersede-inbound-1",
    secondMessageId: "goal032-supersede-inbound-2",
  }),
  group: Object.freeze({
    link: "group",
    // Sufixo `@g.us`: a marca de grupo que `isGroupJid` lê direto do `Chat`,
    // sem depender de nenhuma flag do provedor.
    chatId: "120363019876543210@g.us",
    senderJid: "5511990000037@s.whatsapp.net",
    name: "Grupo do Goal034",
    messageId: "goal034-group-inbound-1",
    // Só o elo quebrado usa isto: sem o sufixo `@g.us` no `Chat`, o mesmo
    // evento vira uma conversa pessoal comum.
    brokenPhone: "5511990000037",
  }),
});

/** Teto da espera pelo worker real dentro de um elo, em milissegundos. */
export const LINK_WAIT_TIMEOUT_MS = 60_000;

/**
 * Teto da espera pela chamada ao dublê de modelo que o elo do supersede
 * segura. Estourar aqui significa que não houve saída pendente para cancelar,
 * e o elo cai dizendo isso em vez de esperar para sempre.
 */
const HELD_MODEL_CALL_TIMEOUT_MS = 30_000;

export class AutoReplyRehearsalError extends Error {
  constructor(message) {
    super(message);
    this.name = "AutoReplyRehearsalError";
  }
}

/** Remove usuário e senha de qualquer URL de conexão presente num texto. */
export function redactConnectionStrings(text) {
  return String(text ?? "").replace(
    /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]*@/gu,
    "$1***@",
  );
}

function refuse(message) {
  console.error(
    `goal032:auto-reply-rehearsal REFUSED — ${redactConnectionStrings(message)}`,
  );
  process.exit(2);
}

function fail(message) {
  console.error(
    `goal032:auto-reply-rehearsal FAILED — ${redactConnectionStrings(message)}`,
  );
  process.exitCode = 1;
}

function aiRequire() {
  return createRequire(
    path.join(repositoryRoot, "apps", "ai-orchestrator", "package.json"),
  );
}

/**
 * Valida o alvo e monta o plano, sem tocar em banco nem subprocesso.
 *
 * O banco do ensaio é **derivado** do alvo já validado, e o nome derivado
 * passa de novo pela allowlist: se o sufixo apagasse a marca de descarte, o
 * `DROP DATABASE` seguinte seria cego.
 */
export function resolveRehearsalPlan(environment = process.env) {
  const raw = environment.AI_TEST_DATABASE_URL?.trim();
  if (!raw) {
    throw new AutoReplyRehearsalError(
      "AI_TEST_DATABASE_URL is not set. This rehearsal refuses to run: it will not fall back to apps/ai-orchestrator/.env or to an inherited DATABASE_URL.",
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AutoReplyRehearsalError(
      "AI_TEST_DATABASE_URL is not a valid URL.",
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new AutoReplyRehearsalError(
      `AI_TEST_DATABASE_URL must use postgres:// or postgresql://, got ${url.protocol}//`,
    );
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new AutoReplyRehearsalError(
      `Host "${host}" is not loopback. This rehearsal drops and recreates a whole database and only accepts a locally provisioned PostgreSQL (127.0.0.1, localhost or ::1).`,
    );
  }

  const baseDatabase = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!baseDatabase) {
    throw new AutoReplyRehearsalError(
      "AI_TEST_DATABASE_URL must name a database.",
    );
  }
  if (!DISPOSABLE_NAME.test(baseDatabase)) {
    throw new AutoReplyRehearsalError(
      `Database "${baseDatabase}" is not recognised as disposable. This rehearsal issues DROP DATABASE and must never touch a shared or product database; the name must contain "test".`,
    );
  }

  const database = `${baseDatabase}_goal032`;
  if (!DISPOSABLE_NAME.test(database)) {
    throw new AutoReplyRehearsalError(
      `Derived database "${database}" is not recognised as disposable.`,
    );
  }

  const target = new URL(raw);
  target.pathname = `/${encodeURIComponent(database)}`;
  const maintenance = new URL(raw);
  maintenance.pathname = "/postgres";
  const port = url.port || "5432";

  return {
    maintenance: maintenance.href,
    host,
    port,
    ai: {
      database,
      url: target.href,
      // Seguro para log: sem usuário, senha ou query string.
      label: `${host}:${port}/${database}`,
    },
  };
}

/**
 * Exige, ANTES de qualquer conexão, que as dependências existam: o driver
 * `pg`, a CLI do Prisma da IA, `tsx` (o app é TypeScript e sobe sob ele) e o
 * cliente Prisma gerado. Ausência é recusa com exit 2, nunca skip.
 */
export function assertRequiredBinaries() {
  const required = aiRequire();
  try {
    required.resolve("pg");
  } catch {
    throw new AutoReplyRehearsalError(
      "The PostgreSQL driver (pg) is not installed for apps/ai-orchestrator. Run `npm ci --prefix apps/ai-orchestrator` before this rehearsal.",
    );
  }
  try {
    required.resolve("tsx/package.json");
  } catch {
    throw new AutoReplyRehearsalError(
      "tsx is not installed for apps/ai-orchestrator. Run `npm ci --prefix apps/ai-orchestrator` before this rehearsal — it boots the real AI orchestrator under a TypeScript loader.",
    );
  }
  try {
    required.resolve("prisma/package.json");
  } catch {
    throw new AutoReplyRehearsalError(
      "The Prisma CLI is not installed for apps/ai-orchestrator. Run `npm ci --prefix apps/ai-orchestrator` before this rehearsal.",
    );
  }
  // O cliente Prisma da IA é gerado, não versionado: sem ele o serviço nem
  // importa. Recusa, nunca skip — e a mensagem nomeia o passo do gate que o
  // produz, para não haver dúvida sobre o que rodar antes.
  if (
    !existsSync(
      path.join(
        repositoryRoot,
        "apps",
        "ai-orchestrator",
        "src",
        "generated",
        "prisma",
        "client.ts",
      ),
    )
  ) {
    throw new AutoReplyRehearsalError(
      "The AI orchestrator Prisma client has not been generated (apps/ai-orchestrator/src/generated/prisma/client.ts is missing). Run `npx prisma generate` in apps/ai-orchestrator — validate:integration does it in the `generate:ai-orchestrator-prisma-client` step.",
    );
  }
}

/**
 * As migrations da IA criam a extensão `vector`; sem ela no servidor alvo a
 * migration falharia no meio, e o ensaio prefere recusar antes de escrever.
 */
export async function assertVectorExtensionAvailable(maintenanceUrl) {
  const { Client } = aiRequire()("pg");
  const maintenance = new Client({ connectionString: maintenanceUrl });
  await maintenance.connect();
  let available;
  try {
    const result = await maintenance.query(
      "SELECT name FROM pg_available_extensions WHERE name = $1",
      ["vector"],
    );
    available = result.rows.length > 0;
  } finally {
    await maintenance.end();
  }
  if (!available) {
    throw new AutoReplyRehearsalError(
      "The target server does not offer the `vector` extension, which the AI orchestrator migrations require through CREATE EXTENSION. Install pgvector in this PostgreSQL installation and run the rehearsal again.",
    );
  }
}

async function recreateDatabase(maintenanceUrl, database) {
  const { Client } = aiRequire()("pg");
  const maintenance = new Client({ connectionString: maintenanceUrl });
  await maintenance.connect();
  try {
    const quoted = `"${database.replace(/"/gu, '""')}"`;
    // FORCE derruba conexão remanescente de uma execução anterior — é o que
    // torna a segunda execução seguida independente da primeira.
    await maintenance.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${quoted}`);
    await maintenance.query(`ALTER DATABASE ${quoted} SET TimeZone = 'UTC'`);
  } finally {
    await maintenance.end();
  }
}

/**
 * `prisma migrate deploy` do histórico versionado da IA contra o banco
 * descartável. Comando entregue como string única ao shell porque `npx` no
 * Windows é um script `.cmd` e o Node recusa executá-lo sem shell.
 */
function runPrisma(url) {
  const env = { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url };
  const outcome = spawnSync("npx prisma migrate deploy", {
    cwd: path.join(repositoryRoot, "apps", "ai-orchestrator"),
    env,
    encoding: "utf8",
    shell: true,
  });
  if (outcome.error) {
    return {
      status: null,
      output: `failed to start: ${outcome.error.message}`,
    };
  }
  return {
    status: outcome.status,
    output: redactConnectionStrings(
      `${outcome.stdout ?? ""}${outcome.stderr ?? ""}`,
    ).trim(),
  };
}

/** Contagem de linhas por tabela, com `pg` puro. */
async function countRows(url, tables) {
  const { Client } = aiRequire()("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const counts = {};
    for (const table of tables) {
      const result = await client.query(
        `SELECT count(*)::int AS total FROM "${table}"`,
      );
      counts[table] = result.rows[0].total;
    }
    return counts;
  } finally {
    await client.end();
  }
}

/**
 * O que o histórico de migrations da IA cria sozinho: o canal legado do tenant
 * `legacy-unassigned`, INATIVO, e a configuração correspondente, com a IA
 * desligada. Nenhuma das duas é estado do ensaio e nenhuma pertence a negócio
 * nenhum — são o marcador do estoque anterior ao vínculo por tenant.
 * Declaradas aqui para que "banco vazio" continue significando "nada do ensaio
 * foi semeado" em vez de virar exceção solta na conferência.
 */
const BASELINE_ROWS = Object.freeze({
  ChannelConnection: 1,
  AiTenantConfig: 1,
});

const REHEARSAL_TABLES = Object.freeze([
  "ChannelConnection",
  "AiTenantConfig",
  "Contact",
  "Conversation",
  "ConversationSession",
  "Message",
  "ProcessedEvent",
  "AiRun",
  "Handoff",
]);

/** Linhas além do que o histórico de migrations cria por conta própria. */
export function unexpectedRows(counts, baseline = BASELINE_ROWS) {
  return Object.entries(counts).filter(
    ([table, total]) => total !== (baseline[table] ?? 0),
  );
}

/**
 * Ambiente do subprocesso que sobe a IA real.
 *
 * Exportado porque é ele que carrega as decisões do ensaio, e elas são
 * verificáveis em teste sem subir nada: worker da inbox **ligado**, os outros
 * laços desligados, janelas encurtadas e as duas fronteiras externas apontando
 * para os dublês em loopback.
 */
export function rehearsalEnvironment({
  databaseUrl,
  openAiBaseUrl,
  evolutionBaseUrl,
}) {
  return {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: databaseUrl,
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    EVOLUTION_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
    CHANNEL_CREDENTIAL_KEYS: `${CHANNEL_KEY_ID}:${CHANNEL_KEY}`,
    CHANNEL_CREDENTIAL_ACTIVE_KEY_ID: CHANNEL_KEY_ID,
    OPENAI_API_KEY: OPENAI_KEY,
    // As duas fronteiras externas, e só elas, redirecionadas para os dublês.
    OPENAI_BASE_URL: openAiBaseUrl,
    EVOLUTION_BASE_URL: evolutionBaseUrl,
    // **Ligado**: é o ponto do ensaio. Quem reivindica o lote é o laço de
    // produção, não o ensaio.
    INBOX_WORKER_ENABLED: "true",
    // Desligados, como no Goal030: eles rodariam fora do que este ensaio
    // prova, e a entrega de notificações chamaria o transporte por conta
    // própria.
    NOTIFICATION_DELIVERY_ENABLED: "false",
    RETENTION_SWEEP_ENABLED: "false",
    ACCOUNT_PURGE_ENABLED: "false",
    // As janelas que adiam o trabalho, encurtadas **por ambiente**. É o que
    // substitui o relógio falso: o código de produção continua sendo o mesmo,
    // com a configuração que ele já aceita.
    AI_DEBOUNCE_MIN_SECONDS: "1",
    AI_DEBOUNCE_MAX_SECONDS: "1",
    AI_DEBOUNCE_MAX_WAIT_SECONDS: "1",
    AI_AMBIGUOUS_WAIT_SECONDS: "1",
    AI_AMBIGUOUS_MAX_WAIT_SECONDS: "1",
    INBOX_POLL_INTERVAL_MS: "200",
    // Fronteira que o ensaio não exercita: porta de loopback onde nada escuta.
    // O laço de ferramentas contra o Scheduling real está declarado fora; se
    // algum caminho passasse a chamá-lo, a chamada morreria aqui dentro em vez
    // de sair da máquina.
    SCHEDULING_SERVICE_BASE_URL: "http://127.0.0.1:1",
    // Instância oficial da plataforma: vazia de propósito. Nenhum caminho
    // deste ensaio envia pela identidade da Avenly.
    PLATFORM_WHATSAPP_INSTANCE_ID: "",
    PLATFORM_WHATSAPP_CREDENTIAL: "",
    PLATFORM_WHATSAPP_NUMBER: "",
  };
}

/**
 * Roda o ensaio num subprocesso `tsx`: este mesmo arquivo, reinvocado com
 * `--rehearse`. É o único jeito de subir o app TypeScript real sem duplicar a
 * lógica dele aqui.
 */
function runRehearsalChildProcess(plan) {
  const scriptPath = fileURLToPath(import.meta.url);
  const cwd = path.join(repositoryRoot, "apps", "ai-orchestrator");
  // Caminho relativo com barra normal: evita qualquer questão de escape de
  // barra invertida na string de comando entregue ao shell.
  const relativeScriptPath = path
    .relative(cwd, scriptPath)
    .split(path.sep)
    .join("/");

  const outcome = spawnSync(`npx tsx ${relativeScriptPath} --rehearse`, {
    cwd,
    env: { ...process.env, GOAL032_AI_DB_URL: plan.ai.url },
    encoding: "utf8",
    shell: true,
  });
  if (outcome.error) {
    return {
      status: null,
      output: `failed to start: ${outcome.error.message}`,
    };
  }
  return {
    status: outcome.status,
    output: redactConnectionStrings(
      `${outcome.stdout ?? ""}${outcome.stderr ?? ""}`,
    ).trim(),
  };
}

const REHEARSAL_RESULT_MARKER = "GOAL032_REHEARSAL_RESULT ";

export function parseRehearsalResult(output) {
  const line = output
    .split("\n")
    .find((entry) => entry.startsWith(REHEARSAL_RESULT_MARKER));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(REHEARSAL_RESULT_MARKER.length));
  } catch {
    return null;
  }
}

// --- Dublês das duas fronteiras externas -----------------------------------
//
// São os dois únicos dublês autorizados, e os dois são **serviços externos**.
// Nada do produto é substituído aqui: o `ChatOpenAI`, o `OpenAIEmbeddings` e o
// `EvolutionProvider` que falam com eles são os de produção, e o que muda é
// só o endereço.

/** Sobe um servidor HTTP em loopback e confere o endereço efetivo. */
function listenOnLoopback(server, label) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(
          new AutoReplyRehearsalError(
            `The ${label} double did not report a TCP address.`,
          ),
        );
        return;
      }
      // Conferido no endereço **efetivo**, não no pedido: é o que transforma
      // "escuta em loopback" em fato observado.
      if (address.address !== "127.0.0.1") {
        reject(
          new AutoReplyRehearsalError(
            `The ${label} double bound to ${address.address}, which is not 127.0.0.1. This rehearsal never listens outside loopback.`,
          ),
        );
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Dublê do OpenAI: Responses API (o que o `ChatOpenAI` usa, com
 * `useResponsesApi` e `zdrEnabled`) e embeddings.
 *
 * O texto da resposta é gerado **nesta execução** e devolvido pelo dublê; é
 * ele que o resto do ensaio compara com o que chegou ao banco e ao transporte.
 * Texto fixo comparado consigo mesmo não provaria nada.
 */
export function createOpenAiDouble({ replyText }) {
  const calls = { responses: [], embeddings: [], unexpected: [] };
  // Resposta segurada: é o que abre a janela do elo de supersede. Enquanto o
  // modelo "pensa", o evento continua PROCESSING e a mensagem nova do mesmo
  // contato chega a tempo de pedir a reavaliação. O dublê não decide nada com
  // isso — quem cancela é o gate de saída da produção.
  let hold = null;
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const body = await readJsonBody(request);

      if (request.method === "POST" && url.pathname.endsWith("/responses")) {
        if (hold) {
          const held = hold;
          hold = null;
          held.announce();
          await held.released;
        }
        const id = `resp_goal032_${calls.responses.length + 1}`;
        calls.responses.push({
          at: new Date().toISOString(),
          id,
          model: body?.model ?? null,
          store: body?.store ?? null,
          tools: Array.isArray(body?.tools) ? body.tools.length : 0,
          text: replyText,
        });
        reply(
          response,
          200,
          responsesPayload({ id, model: body?.model, text: replyText }),
        );
        return;
      }

      if (request.method === "POST" && url.pathname.endsWith("/embeddings")) {
        const input = Array.isArray(body?.input) ? body.input : [body?.input];
        // O cliente oficial pede `base64` por padrão e decodifica o que vier
        // como `Float32Array`. Devolver o vetor como lista JSON nesse caso dá
        // 384 zeros em vez de 1536 floats — silenciosamente, porque nada
        // lança. O dublê honra o formato pedido em vez de escolher um.
        const encodeBase64 = body?.encoding_format === "base64";
        calls.embeddings.push({
          at: new Date().toISOString(),
          model: body?.model ?? null,
          inputs: input.length,
          encodingFormat: body?.encoding_format ?? null,
        });
        reply(response, 200, {
          object: "list",
          model: body?.model ?? "text-embedding-3-small",
          data: input.map((_, index) => {
            const vector = syntheticEmbedding(index);
            return {
              object: "embedding",
              index,
              embedding: encodeBase64
                ? Buffer.from(Float32Array.from(vector).buffer).toString(
                    "base64",
                  )
                : vector,
            };
          }),
          usage: { prompt_tokens: 0, total_tokens: 0 },
        });
        return;
      }

      // Qualquer outra rota é desvio do que o ensaio declara exercitar, e fica
      // registrada como tal em vez de passar despercebida.
      calls.unexpected.push({
        at: new Date().toISOString(),
        method: request.method ?? null,
        path: url.pathname,
      });
      reply(response, 404, {
        error: { message: "goal032 openai double: unexpected route" },
      });
    })();
  });

  return {
    calls,
    /**
     * Segura a PRÓXIMA chamada de resposta até `release()`.
     *
     * `called` resolve no instante em que a chamada chega, então quem espera
     * sabe que o turno está mesmo em execução — nada aqui dorme um tempo
     * arbitrário torcendo para a janela existir.
     */
    holdNextResponse: () => {
      let announce;
      let release;
      const called = new Promise((resolve) => {
        announce = resolve;
      });
      const released = new Promise((resolve) => {
        release = resolve;
      });
      hold = { announce, released };
      return { called, release };
    },
    listen: () => listenOnLoopback(server, "OpenAI"),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Corpo mínimo, porém completo, de uma resposta da Responses API. */
function responsesPayload({ id, model, text }) {
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: model ?? "gpt-5.4-mini",
    output: [
      {
        type: "message",
        id: `${id}_msg`,
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    parallel_tool_calls: false,
    previous_response_id: null,
    store: false,
    temperature: 1,
    text: { format: { type: "text" } },
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    truncation: "disabled",
    usage: {
      input_tokens: 0,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 0,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 0,
    },
    metadata: {},
  };
}

/**
 * Vetor sintético de 1536 dimensões (`KNOWLEDGE_EMBEDDING_DIMENSIONS`).
 * Determinístico de propósito: o ensaio não prova semântica de busca, e um
 * vetor aleatório só tornaria a execução irreprodutível.
 */
function syntheticEmbedding(seed) {
  const dimensions = 1536;
  const vector = new Array(dimensions);
  for (let index = 0; index < dimensions; index += 1) {
    vector[index] = Math.sin((index + 1) * (seed + 1) * 0.001);
  }
  return vector;
}

/**
 * Dublê do Evolution Go: responde ao `POST` de envio de texto, no caminho de
 * `EVOLUTION_SEND_TEXT_PATH`.
 *
 * `observe` é chamado **antes** da resposta, com o envio ainda em curso: é a
 * janela em que dá para olhar o banco e saber o que já existia quando o
 * transporte foi chamado. O dublê não decide nada com isso — ele só registra.
 */
export function createEvolutionDouble({
  sendTextPath = "/send/text",
  observe,
} = {}) {
  const sends = [];
  const unexpected = [];
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const body = await readJsonBody(request);

      if (request.method === "POST" && url.pathname === sendTextPath) {
        const messageId = `goal032-transport-${sends.length + 1}`;
        const send = {
          at: new Date().toISOString(),
          to: typeof body?.number === "string" ? body.number : null,
          text: typeof body?.text === "string" ? body.text : null,
          correlationId: typeof body?.id === "string" ? body.id : null,
          quotedMessageId: body?.quoted?.messageId ?? null,
          // Presença, nunca o valor: credencial de instância não sai daqui.
          hasApiKeyHeader: Boolean(request.headers.apikey),
          instanceId:
            typeof request.headers.instanceid === "string"
              ? request.headers.instanceid
              : null,
          messageId,
        };
        if (observe) send.observedAtSendTime = await observe(send);
        sends.push(send);
        reply(response, 200, { messageId });
        return;
      }

      unexpected.push({
        at: new Date().toISOString(),
        method: request.method ?? null,
        path: url.pathname,
      });
      reply(response, 404, {
        error: "goal032 evolution double: unexpected route",
      });
    })();
  });

  return {
    sends,
    unexpected,
    listen: () => listenOnLoopback(server, "Evolution"),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function reply(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

// --- Metade `--rehearse`: a IA real, o worker real e a espera ---------------

/** O evento do contato, na forma em que o Evolution Go o entrega. */
export function inboundWebhookPayload(overrides = {}) {
  const { contact, instanceId } = REHEARSAL;
  // Contato da prova positiva por padrão; os elos de controle negativo passam
  // o próprio telefone e o próprio nome, porque cada elo tem conversa própria.
  const phone = overrides.phone ?? contact.phone;
  const pushName = overrides.name ?? contact.name;
  // O elo do grupo passa `chat`/`sender` explícitos: um JID `@g.us` não deriva
  // de telefone nenhum. Os demais elos continuam derivando os dois do phone,
  // como sempre.
  const chat = overrides.chat ?? `${phone}@s.whatsapp.net`;
  const sender = overrides.sender ?? chat;
  return {
    event: "Message",
    instanceId: overrides.instanceId ?? instanceId,
    data: {
      Info: {
        ID: overrides.messageId ?? contact.messageId,
        Chat: chat,
        Sender: sender,
        PushName: pushName,
        Type: "text",
      },
      Message: { conversation: overrides.text ?? contact.text },
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Espera o worker real concluir o evento, com teto declarado.
 *
 * Não há claim manual e não há relógio adiantado: o ensaio só observa, em
 * leituras sucessivas do banco do dono, até o evento sair de `RECEIVED` /
 * `PROCESSING`. O estouro do teto derruba o ensaio com mensagem própria, que
 * diz o que foi observado na última leitura — silêncio não vira "não houve
 * resposta".
 */
export async function waitForWorkerOutcome({
  aiDb,
  timeoutMs = WORKER_WAIT_TIMEOUT_MS,
  pollIntervalMs = WORKER_POLL_INTERVAL_MS,
}) {
  const startedAt = Date.now();
  let observed = null;

  while (Date.now() - startedAt < timeoutMs) {
    const events = await aiDb.query(
      `SELECT "id", "status"::text AS "status", "attempts", "error", "result",
              "completedAt" IS NOT NULL AS "completed"
         FROM "ProcessedEvent"
        ORDER BY "receivedAt"`,
    );
    const outbound = await aiDb.query(
      `SELECT count(*)::int AS "total" FROM "Message" WHERE "direction" = 'OUTBOUND'`,
    );
    observed = {
      events: events.rows,
      outboundMessages: outbound.rows[0].total,
      waitedMs: Date.now() - startedAt,
    };

    const settled =
      events.rows.length > 0 &&
      events.rows.every(
        (row) => row.status !== "RECEIVED" && row.status !== "PROCESSING",
      );
    if (settled) return observed;

    await delay(pollIntervalMs);
  }

  throw new AutoReplyRehearsalError(
    `The real inbox worker did not settle the delivered event within the declared ceiling of ${timeoutMs} ms. Last read: ${JSON.stringify(observed)}. This rehearsal never shortens the path with a manual claim or a fake clock, so an event still RECEIVED/PROCESSING here means the production loop did not do the work.`,
  );
}

/**
 * Espera os eventos de UM elo saírem de `RECEIVED`/`PROCESSING`, por
 * `messageId`.
 *
 * `waitForWorkerOutcome` olha a inbox inteira, e é o certo para a prova
 * positiva, que roda sozinha. Os elos de controle negativo correm depois dela,
 * no mesmo banco: contagem global deixaria de dizer de quem é o evento. Aqui a
 * leitura é escopada aos eventos que o elo entregou — e continua sem claim
 * manual e sem relógio falso, porque quem trabalha é o worker de produção.
 */
export async function waitForEventsSettled({
  aiDb,
  messageIds,
  expected = messageIds.length,
  timeoutMs = LINK_WAIT_TIMEOUT_MS,
  pollIntervalMs = WORKER_POLL_INTERVAL_MS,
}) {
  const startedAt = Date.now();
  let observed = null;

  while (Date.now() - startedAt < timeoutMs) {
    const events = await aiDb.query(
      `SELECT "messageId", "status"::text AS "status", "attempts", "error",
              "result", "supersedeRequestedAt" IS NOT NULL AS "supersedeRequested"
         FROM "ProcessedEvent"
        WHERE "messageId" = ANY($1::text[])
        ORDER BY "receivedAt"`,
      [messageIds],
    );
    observed = { events: events.rows, waitedMs: Date.now() - startedAt };

    const settled =
      events.rows.length === expected &&
      events.rows.every(
        (row) => row.status !== "RECEIVED" && row.status !== "PROCESSING",
      );
    if (settled) return observed;

    await delay(pollIntervalMs);
  }

  throw new AutoReplyRehearsalError(
    `The real inbox worker did not settle ${expected} event(s) (${messageIds.join(", ")}) within the declared ceiling of ${timeoutMs} ms. Last read: ${JSON.stringify(observed)}.`,
  );
}

/**
 * Espera o pedido de reavaliação aparecer gravado no evento que ainda executa.
 *
 * Quem grava é o webhook real ao receber a mensagem nova do mesmo contato
 * (`InboxStore.requestSupersede`). Observar a marca no banco — em vez de
 * dormir — é o que torna o elo determinístico: só depois dela a resposta
 * segurada do modelo é liberada.
 */
async function waitForSupersedeRequest({
  aiDb,
  messageId,
  timeoutMs = LINK_WAIT_TIMEOUT_MS,
  pollIntervalMs = 50,
}) {
  const startedAt = Date.now();
  let observed = null;

  while (Date.now() - startedAt < timeoutMs) {
    const found = await aiDb.query(
      `SELECT "status"::text AS "status",
              "supersedeRequestedAt" IS NOT NULL AS "requested"
         FROM "ProcessedEvent"
        WHERE "messageId" = $1`,
      [messageId],
    );
    observed = found.rows[0] ?? null;
    if (observed?.requested) return { waitedMs: Date.now() - startedAt };
    await delay(pollIntervalMs);
  }

  throw new AutoReplyRehearsalError(
    `The new inbound message did not flag the pending event ${messageId} for re-evaluation within ${timeoutMs} ms. Last read: ${JSON.stringify(observed)}.`,
  );
}

/** Teto próprio para uma espera que não é do banco, com mensagem própria. */
function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    promise.then((value) => {
      clearTimeout(timer);
      return value;
    }),
    new Promise((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new AutoReplyRehearsalError(message)),
        timeoutMs,
      );
    }),
  ]);
}

async function runRehearsalChild() {
  const aiDbUrl = process.env.GOAL032_AI_DB_URL;
  if (!aiDbUrl) {
    throw new AutoReplyRehearsalError(
      "GOAL032_AI_DB_URL is not set in the rehearsal subprocess.",
    );
  }

  // Elo quebrado desta execução, quando houver. Nome desconhecido é erro, não
  // execução silenciosamente verde.
  const breakLink = process.env.GOAL032_BREAK_LINK?.trim() || null;
  if (breakLink && !(breakLink in BREAKABLE_LINKS)) {
    throw new AutoReplyRehearsalError(
      `Unknown GOAL032_BREAK_LINK "${breakLink}". Known links: ${Object.keys(BREAKABLE_LINKS).join(", ")}.`,
    );
  }

  // O texto desta execução, e só dela. É o que o dublê de modelo devolve, e o
  // que o resto do ensaio procura no banco e no transporte.
  const replyText = `Oi, Nina! Aqui e o Estudio Goal032 - resposta ${randomNonce()}.`;

  const aiDb = await connectAiDatabase(aiDbUrl);
  const openAi = createOpenAiDouble({ replyText });
  const evolution = createEvolutionDouble({
    // Lido no instante em que o transporte é chamado: é a janela que mostra o
    // que já estava gravado antes do envio.
    observe: async () => {
      const outbound = await aiDb.query(
        `SELECT count(*)::int AS "total" FROM "Message" WHERE "direction" = 'OUTBOUND'`,
      );
      return { outboundMessages: outbound.rows[0].total };
    },
  });

  const openAiBaseUrl = await openAi.listen();
  const evolutionBaseUrl = await evolution.listen();

  // Aplicado ANTES do primeiro import de `config/env.ts`: o schema é lido uma
  // vez, no import, e é por isso que o dublê precisa já estar de pé aqui.
  Object.assign(
    process.env,
    rehearsalEnvironment({
      databaseUrl: aiDbUrl,
      openAiBaseUrl,
      evolutionBaseUrl,
    }),
  );

  const aiSource = (...segments) =>
    pathToFileURL(
      path.join(repositoryRoot, "apps", "ai-orchestrator", "src", ...segments),
    ).href;

  const { buildApp } = await import(aiSource("app.ts"));
  const { env } = await import(aiSource("config", "env.ts"));
  const { deriveInternalToken, SERVICE_AUDIENCE, TRUSTED_CALLER_ID } =
    await import(aiSource("lib", "internal-credentials.ts"));

  assertLoopback(env.OPENAI_BASE_URL, "OPENAI_BASE_URL");
  assertLoopback(env.EVOLUTION_BASE_URL, "EVOLUTION_BASE_URL");
  assertLoopback(
    env.SCHEDULING_SERVICE_BASE_URL,
    "SCHEDULING_SERVICE_BASE_URL",
  );
  if (!env.INBOX_WORKER_ENABLED) {
    throw new AutoReplyRehearsalError(
      "INBOX_WORKER_ENABLED is off inside the rehearsal process. This rehearsal exists to let the production loop do the work; with the worker off there is nothing to prove.",
    );
  }

  const app = await buildApp();
  const address = await app.listen({ host: "127.0.0.1", port: 0 });

  const provisioningToken = deriveInternalToken(
    env.INTERNAL_SERVICE_TOKEN,
    TRUSTED_CALLER_ID,
    SERVICE_AUDIENCE,
    "provisioning",
  );
  // Takeover e `Ignorar IA` são comando comum, não provisionamento: a IA exige
  // `conversations:write`, e o token de provisionamento não serve de fallback.
  const commandToken = deriveInternalToken(
    env.INTERNAL_SERVICE_TOKEN,
    TRUSTED_CALLER_ID,
    SERVICE_AUDIENCE,
    "command",
  );

  const rehearsal = {
    replyText,
    waitCeilingMs: WORKER_WAIT_TIMEOUT_MS,
    doubles: { openAiBaseUrl, evolutionBaseUrl, aiAddress: address },
  };

  try {
    // --- Seed: o vínculo do canal e a projeção do negócio -----------------
    //
    // Os dois entram pelas rotas internas REAIS da IA, com a credencial
    // derivada exatamente como o BFF a derivaria. Não há `INSERT` de
    // conveniência: o que é semeado é a configuração que o outro serviço
    // projetaria, nunca a conversa nem a mensagem.
    rehearsal.seed = {
      channel: await internalRequest(
        address,
        "PUT",
        "/internal/channel-connections/evolution",
        {
          token: provisioningToken,
          body: {
            externalInstanceId: REHEARSAL.instanceId,
            displayName: REHEARSAL.businessName,
            instanceCredential: INSTANCE_CREDENTIAL,
          },
        },
      ),
      tenantConfig: await internalRequest(
        address,
        "PUT",
        "/internal/ai-tenant-config",
        {
          token: provisioningToken,
          body: {
            enabled: true,
            tone: "BALANCED",
            businessContext: {
              version: 1,
              businessName: REHEARSAL.businessName,
              timezone: REHEARSAL.timezone,
              segment: REHEARSAL.segment,
              modalities: ["ON_SITE"],
              address: REHEARSAL.address,
            },
          },
        },
      ),
    };
    if (rehearsal.seed.channel.status !== 200) {
      throw new AutoReplyRehearsalError(
        `seed: PUT /internal/channel-connections/evolution answered ${rehearsal.seed.channel.status}, expected 200`,
      );
    }
    if (rehearsal.seed.tenantConfig.status !== 200) {
      throw new AutoReplyRehearsalError(
        `seed: PUT /internal/ai-tenant-config answered ${rehearsal.seed.tenantConfig.status}, expected 200`,
      );
    }

    // --- Entrega: o webhook do provedor, por HTTP real --------------------
    const deliveredAt = Date.now();
    const webhook = await fetch(
      new URL(
        `/webhooks/evolution?token=${encodeURIComponent(WEBHOOK_TOKEN)}`,
        address,
      ),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(inboundWebhookPayload()),
      },
    );
    rehearsal.webhook = { status: webhook.status };
    if (webhook.status !== 202) {
      throw new AutoReplyRehearsalError(
        `delivery: POST /webhooks/evolution answered ${webhook.status}, expected 202`,
      );
    }

    // Gravado ANTES do ACK: a linha já tem de estar aqui.
    const storedBeforeAck = await aiDb.query(
      `SELECT "status"::text AS "status", "eventType",
              "conversationKey" IS NOT NULL AS "hasConversationKey"
         FROM "ProcessedEvent"`,
    );
    rehearsal.storedBeforeAck = storedBeforeAck.rows;

    // --- Espera pelo worker real, com teto declarado -----------------------
    rehearsal.worker = await waitForWorkerOutcome({ aiDb });
    rehearsal.elapsedMs = Date.now() - deliveredAt;

    // --- O que ficou gravado, lido do banco do dono ------------------------
    const messages = await aiDb.query(
      `SELECT "direction"::text AS "direction", "role", "body",
              "source"::text AS "source", "deliveryState"::text AS "deliveryState",
              "correlationId" IS NOT NULL AS "hasCorrelationId",
              "conversationId", "createdAt"
         FROM "Message"
        ORDER BY "createdAt"`,
    );
    rehearsal.messages = messages.rows.map((row) => ({
      ...row,
      createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
    }));

    const conversations = await aiDb.query(
      `SELECT "id", "tenantId", "status"::text AS "status" FROM "Conversation"`,
    );
    rehearsal.conversations = conversations.rows;

    // Fotografia da prova positiva, tirada ANTES dos elos de controle
    // negativo: eles rodam no mesmo banco e nos mesmos dublês, e guardar a
    // lista por referência faria os envios deles aparecerem aqui.
    rehearsal.model = {
      responses: openAi.calls.responses.length,
      embeddings: openAi.calls.embeddings.length,
      unexpected: [...openAi.calls.unexpected],
      returnedTexts: openAi.calls.responses.map((call) => call.text),
    };
    rehearsal.transport = {
      sends: [...evolution.sends],
      unexpected: [...evolution.unexpected],
    };

    // --- Controle negativo: os quatro elos obrigatórios -------------------
    //
    // Rodam depois da prova positiva, no mesmo processo e no mesmo banco, cada
    // um na própria conversa. Aqui só se observa; quem aprova ou reprova é o
    // processo pai, com uma asserção e uma mensagem por elo.
    rehearsal.breakLink = breakLink;
    rehearsal.links = await exerciseNegativeControlLinks({
      aiDb,
      address,
      openAi,
      evolution,
      commandToken,
      breakLink,
    });
  } finally {
    await aiDb.end().catch(() => {});
    await app.close().catch(() => {});
    await openAi.close();
    await evolution.close();
  }

  process.stdout.write(
    `${REHEARSAL_RESULT_MARKER}${JSON.stringify(rehearsal)}\n`,
  );
}

async function connectAiDatabase(url) {
  const { Client } = aiRequire()("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Sufixo de uso único do texto desta execução. */
function randomNonce() {
  return Math.random().toString(36).slice(2, 10);
}

/** Recusa qualquer destino fora de loopback, com o nome da variável. */
function assertLoopback(value, name) {
  let host;
  try {
    host = new URL(
      /^https?:\/\//u.test(value) ? value : `http://${value}`,
    ).hostname
      .toLowerCase()
      .replace(/^\[|\]$/gu, "");
  } catch {
    throw new AutoReplyRehearsalError(`${name} is not a valid URL.`);
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new AutoReplyRehearsalError(
      `${name} resolves to "${host}", which is not loopback. This rehearsal never reaches an address outside 127.0.0.1.`,
    );
  }
}

/** Chamada a uma rota interna real da IA, com a credencial derivada. */
async function internalRequest(baseUrl, method, route, { token, body }) {
  const response = await fetch(new URL(route, baseUrl), {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-service-audience": "ai-orchestrator",
      "x-tenant-id": REHEARSAL.tenantId,
      "x-user-id": REHEARSAL.userId,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

// --- Controle negativo: os cinco elos obrigatórios --------------------------
//
// Cada elo é um cenário completo pelo mesmo caminho de produção da prova
// positiva — webhook real, worker real, dispatcher real, grafo real — só que
// com uma condição de controle no meio. O que muda quando o elo é quebrado é
// sempre a MESMA coisa: uma etapa do percurso deixa de acontecer. Nenhuma
// asserção é relaxada e nenhum código de produção é tocado.

/**
 * Id da resposta a que um envio pertence. A resposta da IA sai em partes
 * (decisão de produto de 2026-10-11): as anteriores à última levam
 * `<correlationId>-p<n>` e a última leva o `correlationId` da linha. Envio
 * sem id conta como resposta própria.
 */
export function replyIdOfSend(send, index) {
  return typeof send.correlationId === "string"
    ? send.correlationId.replace(/-p\d+$/u, "")
    : `no-correlation-${index}`;
}

/** Quantas respostas distintas os envios carregam. */
export function replyCount(sends) {
  return new Set(sends.map(replyIdOfSend)).size;
}

/** Contagens dos dois dublês num instante: a base de todo delta de elo. */
function doubleCounters(openAi, evolution) {
  return {
    responses: openAi.calls.responses.length,
    embeddings: openAi.calls.embeddings.length,
    sends: evolution.sends.length,
    replies: replyCount(evolution.sends),
  };
}

function countersDelta(before, after) {
  return {
    modelResponses: after.responses - before.responses,
    modelEmbeddings: after.embeddings - before.embeddings,
    sends: after.sends - before.sends,
    replies: after.replies - before.replies,
  };
}

/** Uma mensagem do contato do elo, pelo webhook real, por HTTP real. */
async function deliverInbound(
  address,
  { phone, name, messageId, text, chat, sender },
) {
  const response = await fetch(
    new URL(
      `/webhooks/evolution?token=${encodeURIComponent(WEBHOOK_TOKEN)}`,
      address,
    ),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        inboundWebhookPayload({ phone, name, messageId, text, chat, sender }),
      ),
    },
  );
  if (response.status !== 202) {
    throw new AutoReplyRehearsalError(
      `negative control: POST /webhooks/evolution for ${messageId} answered ${response.status}, expected 202`,
    );
  }
  return { messageId, status: response.status };
}

/** A conversa do contato, lida do banco do dono. */
async function conversationOf(aiDb, phone) {
  const found = await aiDb.query(
    `SELECT "id", "status"::text AS "status", "humanHandoff"
       FROM "Conversation"
      WHERE "externalContactId" = $1`,
    [phone],
  );
  return found.rows[0] ?? null;
}

/** As mensagens de uma conversa, na ordem em que foram gravadas. */
async function messagesOf(aiDb, conversationId) {
  const rows = await aiDb.query(
    `SELECT "direction"::text AS "direction", "body",
            "deliveryState"::text AS "deliveryState", "deliveryDetail",
            "createdAt"
       FROM "Message"
      WHERE "conversationId" = $1
      ORDER BY "createdAt", "id"`,
    [conversationId],
  );
  return rows.rows.map((row) => ({
    ...row,
    createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
  }));
}

/** Os cinco elos, em ordem, um depois do outro. */
async function exerciseNegativeControlLinks(context) {
  return {
    "human-control": await exerciseHumanControlLink(context),
    "ignore-ai": await exerciseIgnoreAiLink(context),
    idempotency: await exerciseIdempotencyLink(context),
    supersede: await exerciseSupersedeLink(context),
    group: await exerciseGroupLink(context),
  };
}

/**
 * Elo 1 — controle humano.
 *
 * A profissional assume a conversa pelo painel (`takeover`), e a mensagem
 * seguinte do cliente não é respondida: nenhum envio no transporte e **nenhuma
 * chamada ao dublê de modelo**. O primeiro turno é preparo, não prova: sem ele
 * não existe conversa para assumir, e é por isso que a contagem do elo só
 * começa depois que ele assenta.
 */
async function exerciseHumanControlLink({
  aiDb,
  address,
  openAi,
  evolution,
  commandToken,
  breakLink,
}) {
  const contact = NEGATIVE_CONTROL.humanControl;
  const broken = breakLink === contact.link;

  await deliverInbound(address, {
    ...contact,
    messageId: contact.setupMessageId,
  });
  const setup = await waitForEventsSettled({
    aiDb,
    messageIds: [contact.setupMessageId],
  });
  const opened = await conversationOf(aiDb, contact.phone);
  if (!opened) {
    throw new AutoReplyRehearsalError(
      "negative control human-control: the setup turn did not open a conversation, so there is nothing for the human to take over.",
    );
  }

  // O elo quebrado pula exatamente isto: o painel não assume a conversa.
  let takeover = null;
  if (!broken) {
    takeover = await internalRequest(
      address,
      "POST",
      `/internal/conversations/${opened.id}/takeover`,
      { token: commandToken, body: {} },
    );
    if (takeover.status !== 200) {
      throw new AutoReplyRehearsalError(
        `negative control human-control: POST /internal/conversations/:id/takeover answered ${takeover.status}, expected 200`,
      );
    }
  }

  const before = doubleCounters(openAi, evolution);
  await deliverInbound(address, {
    ...contact,
    messageId: contact.probeMessageId,
  });
  const probe = await waitForEventsSettled({
    aiDb,
    messageIds: [contact.probeMessageId],
  });
  const delta = countersDelta(before, doubleCounters(openAi, evolution));

  return {
    link: contact.link,
    broken,
    setupWaitedMs: setup.waitedMs,
    waitedMs: probe.waitedMs,
    takeoverStatus: takeover?.status ?? null,
    event: probe.events[0] ?? null,
    delta,
    conversation: await conversationOf(aiDb, contact.phone),
    messages: await messagesOf(aiDb, opened.id),
  };
}

/**
 * Elo 2 — `Ignorar IA`.
 *
 * O contato é marcado como ignorado antes de falar, pela rota real do painel,
 * e a mensagem dele não é atendida nem processada: mesmo par de asserções do
 * elo 1 — nenhum envio e nenhuma chamada ao dublê de modelo. Aqui não há turno
 * de preparo: `Ignorar IA` por telefone não precisa de conversa aberta.
 */
async function exerciseIgnoreAiLink({
  aiDb,
  address,
  openAi,
  evolution,
  commandToken,
  breakLink,
}) {
  const contact = NEGATIVE_CONTROL.ignoreAi;
  const broken = breakLink === contact.link;

  // O elo quebrado pula exatamente isto: o contato nunca é marcado.
  let ignored = null;
  if (!broken) {
    ignored = await internalRequest(
      address,
      "PUT",
      "/internal/contacts/ignore",
      { token: commandToken, body: { phone: contact.phone, ignored: true } },
    );
    if (ignored.status !== 200) {
      throw new AutoReplyRehearsalError(
        `negative control ignore-ai: PUT /internal/contacts/ignore answered ${ignored.status}, expected 200`,
      );
    }
  }

  const before = doubleCounters(openAi, evolution);
  await deliverInbound(address, { ...contact });
  const settled = await waitForEventsSettled({
    aiDb,
    messageIds: [contact.messageId],
  });
  const delta = countersDelta(before, doubleCounters(openAi, evolution));
  const conversation = await conversationOf(aiDb, contact.phone);

  return {
    link: contact.link,
    broken,
    ignoreStatus: ignored?.status ?? null,
    ignoredFlag: ignored?.payload?.data?.ignored ?? null,
    waitedMs: settled.waitedMs,
    event: settled.events[0] ?? null,
    delta,
    conversation,
    messages: conversation ? await messagesOf(aiDb, conversation.id) : [],
  };
}

/**
 * Elo 3 — idempotência.
 *
 * O mesmo evento entregue duas vezes produz **uma** resposta e **um** envio. A
 * segunda entrega só sai depois que a primeira assentou: duas entregas na
 * mesma janela cairiam no mesmo lote, a segunda resposta nunca existiria, e a
 * quebra ficaria escondida em vez de aparecer.
 */
async function exerciseIdempotencyLink({
  aiDb,
  address,
  openAi,
  evolution,
  breakLink,
}) {
  const contact = NEGATIVE_CONTROL.idempotency;
  const broken = breakLink === contact.link;
  // O elo quebrado troca exatamente isto: com outro `messageId` o segundo
  // evento deixa de ser o mesmo evento.
  const secondMessageId = broken ? contact.brokenMessageId : contact.messageId;

  const before = doubleCounters(openAi, evolution);
  const first = await deliverInbound(address, {
    ...contact,
    messageId: contact.messageId,
  });
  await waitForEventsSettled({ aiDb, messageIds: [contact.messageId] });

  const second = await deliverInbound(address, {
    ...contact,
    messageId: secondMessageId,
  });
  const messageIds = [...new Set([contact.messageId, secondMessageId])];
  const settled = await waitForEventsSettled({ aiDb, messageIds });
  const delta = countersDelta(before, doubleCounters(openAi, evolution));
  const conversation = await conversationOf(aiDb, contact.phone);
  const messages = conversation ? await messagesOf(aiDb, conversation.id) : [];

  return {
    link: contact.link,
    broken,
    deliveredMessageIds: [first.messageId, second.messageId],
    acks: [first.status, second.status],
    events: settled.events,
    waitedMs: settled.waitedMs,
    delta,
    outboundMessages: messages.filter(
      (message) => message.direction === "OUTBOUND",
    ).length,
    sendsToContact: evolution.sends.filter((send) => send.to === contact.phone)
      .length,
    repliesToContact: replyCount(
      evolution.sends.filter((send) => send.to === contact.phone),
    ),
    messages,
  };
}

/**
 * Elo 4 — supersede.
 *
 * Mensagem nova do mesmo contato antes de a saída pendente sair cancela essa
 * saída, em vez de mandar as duas. A janela é aberta pelo dublê de modelo, que
 * segura a resposta do primeiro turno: enquanto ele "pensa", o evento continua
 * PROCESSING e a segunda mensagem chega a tempo. O ensaio só libera a resposta
 * depois de ver, no banco, o pedido de reavaliação gravado.
 */
async function exerciseSupersedeLink({
  aiDb,
  address,
  openAi,
  evolution,
  breakLink,
}) {
  const contact = NEGATIVE_CONTROL.supersede;
  const broken = breakLink === contact.link;

  const before = doubleCounters(openAi, evolution);
  const held = openAi.holdNextResponse();
  await deliverInbound(address, {
    ...contact,
    messageId: contact.firstMessageId,
  });
  await withTimeout(
    held.called,
    HELD_MODEL_CALL_TIMEOUT_MS,
    `negative control supersede: the model double was never called for ${contact.firstMessageId} within ${HELD_MODEL_CALL_TIMEOUT_MS} ms, so there was never a pending output to supersede.`,
  );

  // O elo quebrado pula exatamente isto: nenhuma mensagem nova chega enquanto
  // a saída está pendente, e nada pede a reavaliação.
  let supersede = null;
  if (!broken) {
    await deliverInbound(address, {
      ...contact,
      messageId: contact.secondMessageId,
    });
    supersede = await waitForSupersedeRequest({
      aiDb,
      messageId: contact.firstMessageId,
    });
  }
  held.release();

  const messageIds = broken
    ? [contact.firstMessageId]
    : [contact.firstMessageId, contact.secondMessageId];
  const settled = await waitForEventsSettled({ aiDb, messageIds });
  const delta = countersDelta(before, doubleCounters(openAi, evolution));
  const conversation = await conversationOf(aiDb, contact.phone);
  const messages = conversation ? await messagesOf(aiDb, conversation.id) : [];
  const outbound = messages.filter(
    (message) => message.direction === "OUTBOUND",
  );

  return {
    link: contact.link,
    broken,
    supersedeRequestedInMs: supersede?.waitedMs ?? null,
    waitedMs: settled.waitedMs,
    events: settled.events,
    firstEvent:
      settled.events.find(
        (event) => event.messageId === contact.firstMessageId,
      ) ?? null,
    delta,
    cancelledOutbound: outbound.filter(
      (message) => message.deliveryState === "FAILED",
    ).length,
    sentOutbound: outbound.filter((message) => message.deliveryState === "SENT")
      .length,
    cancelReasons: outbound
      .filter((message) => message.deliveryState === "FAILED")
      .map((message) => message.deliveryDetail),
    sendsToContact: evolution.sends.filter((send) => send.to === contact.phone)
      .length,
    repliesToContact: replyCount(
      evolution.sends.filter((send) => send.to === contact.phone),
    ),
    messages,
  };
}

/**
 * Elo 5 — grupo.
 *
 * Um evento de grupo entra pelo mesmo webhook real e nunca vira `Message`
 * OUTBOUND, nunca chama o dublê de modelo e nunca chega ao dublê de
 * transporte: `InboundMessageProcessor` devolve `ignored_group` antes de
 * resolver conversa. O elo quebrado troca exatamente a marca de grupo no
 * `Chat` — sem o sufixo `@g.us` a mesma mensagem vira conversa pessoal comum
 * e é atendida pelo modelo.
 */
async function exerciseGroupLink({ aiDb, address, openAi, evolution, breakLink }) {
  const contact = NEGATIVE_CONTROL.group;
  const broken = breakLink === contact.link;

  const before = doubleCounters(openAi, evolution);
  const outboundBefore = await aiDb.query(
    `SELECT count(*)::int AS "total" FROM "Message" WHERE "direction" = 'OUTBOUND'`,
  );

  await deliverInbound(address, {
    messageId: contact.messageId,
    name: contact.name,
    text: REHEARSAL.contact.text,
    chat: broken ? `${contact.brokenPhone}@s.whatsapp.net` : contact.chatId,
    sender: broken
      ? `${contact.brokenPhone}@s.whatsapp.net`
      : contact.senderJid,
  });
  const settled = await waitForEventsSettled({
    aiDb,
    messageIds: [contact.messageId],
  });
  const delta = countersDelta(before, doubleCounters(openAi, evolution));
  const outboundAfter = await aiDb.query(
    `SELECT count(*)::int AS "total" FROM "Message" WHERE "direction" = 'OUTBOUND'`,
  );

  return {
    link: contact.link,
    broken,
    waitedMs: settled.waitedMs,
    event: settled.events[0] ?? null,
    delta,
    outboundDelta: outboundAfter.rows[0].total - outboundBefore.rows[0].total,
  };
}

// --- Prova positiva: a resposta automática, ponta a ponta ------------------
//
// O texto conferido em cada asserção é `result.model.returnedTexts[0]` — o
// que o dublê de modelo devolveu **nesta execução** —, nunca uma constante
// comparada consigo mesma. Cada asserção imprime sua própria contagem, e a
// primeira falha reprova o ensaio com o estado observado anexado à mensagem.

/**
 * As três asserções da resposta automática, sobre o que `--rehearse` já
 * coletou do banco do dono e dos dois dublês. Cada uma imprime nome, contagem
 * e resultado antes de a função decidir aprovar ou reprovar — a contagem fica
 * visível mesmo quando a asserção falha.
 */
export function assertAutoReply(result) {
  const assertions = [];

  const events = result.worker.events;
  const returnedText = result.model.returnedTexts[0];
  const outboundMessages = result.messages.filter(
    (message) => message.direction === "OUTBOUND",
  );
  const matchingOutbound = outboundMessages.filter(
    (message) => message.body === returnedText,
  );
  assertions.push({
    name: "event settled DONE with exactly one outbound message carrying the model double's text",
    count: matchingOutbound.length,
    pass:
      events.length === 1 &&
      events[0]?.status === "DONE" &&
      outboundMessages.length === 1 &&
      matchingOutbound.length === 1,
  });

  const sends = result.transport.sends;
  const sendsToContact = sends.filter(
    (send) => send.to === REHEARSAL.contact.phone,
  );
  const collapse = (text) => String(text ?? "").replace(/\s+/gu, " ").trim();
  const lastSend = sends.at(-1);
  assertions.push({
    name: "transport double received exactly one reply, in parts that rebuild that text, to the contact's phone",
    count: sends.length,
    pass:
      sends.length >= 1 &&
      sendsToContact.length === sends.length &&
      replyCount(sends) === 1 &&
      collapse(sends.map((send) => send.text).join(" ")) ===
        collapse(returnedText) &&
      typeof lastSend?.correlationId === "string" &&
      !/-p\d+$/u.test(lastSend.correlationId),
  });

  const sendsAfterOutboundPersisted = sends.filter(
    (send) => (send.observedAtSendTime?.outboundMessages ?? 0) >= 1,
  );
  assertions.push({
    name: "the OUTBOUND row already existed when the transport double was called",
    count: sendsAfterOutboundPersisted.length,
    pass:
      sends.length > 0 && sendsAfterOutboundPersisted.length === sends.length,
  });

  for (const assertion of assertions) {
    console.log(
      `goal032: assertion "${assertion.name}" — count=${assertion.count} pass=${assertion.pass}`,
    );
  }

  const failed = assertions.filter((assertion) => !assertion.pass);
  if (failed.length > 0) {
    throw new AutoReplyRehearsalError(
      `auto-reply assertions failed: ${failed
        .map((assertion) => assertion.name)
        .join(
          "; ",
        )}. events=${JSON.stringify(events)} messages=${JSON.stringify(
        result.messages,
      )} sends=${JSON.stringify(sends)}`,
    );
  }
}

/**
 * Os cinco elos obrigatórios de controle negativo, cada um com asserção e
 * mensagem próprias.
 *
 * A prova de cada elo tem sempre a mesma forma: o que a produção deixou no
 * banco do dono e o que os dois dublês registraram, lidos só no recorte
 * daquele elo. Cada elo imprime nome e contagens antes de a função decidir, e
 * o que reprova o ensaio é a mensagem do elo que não fechou — nunca uma
 * mensagem genérica.
 */
export function assertNegativeControlLinks(result) {
  const links = result.links ?? {};
  const checks = [
    checkHumanControlLink(links["human-control"]),
    checkIgnoreAiLink(links["ignore-ai"]),
    checkIdempotencyLink(links.idempotency),
    checkSupersedeLink(links.supersede),
    checkGroupLink(links.group),
  ];

  for (const check of checks) {
    console.log(
      `goal032: negative-control link "${check.link}" — ${check.name} — ${check.counts} pass=${check.pass}`,
    );
  }

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) {
    throw new AutoReplyRehearsalError(
      failed.map((check) => check.message).join(" | "),
    );
  }
}

/** Status e ação do evento, como o dispatcher os gravou. */
function eventOutcome(event) {
  return {
    status: event?.status ?? null,
    action: event?.result?.action ?? null,
  };
}

function missingLink(link) {
  return {
    link,
    name: "the link ran and reported what it observed",
    counts: "observed=none",
    pass: false,
    message: `${link}: the rehearsal subprocess reported nothing for this link, so it was never exercised.`,
  };
}

function checkHumanControlLink(observed) {
  if (!observed) return missingLink("human-control");
  const { delta } = observed;
  const { status, action } = eventOutcome(observed.event);
  return {
    link: "human-control",
    name: "a conversation under panel takeover answers nothing and never calls the model double",
    counts: `model=${delta.modelResponses} response(s), ${delta.modelEmbeddings} embedding(s), transport=${delta.sends} send(s), event=${status}/${action}`,
    pass:
      delta.modelResponses === 0 &&
      delta.modelEmbeddings === 0 &&
      delta.sends === 0 &&
      status === "DONE" &&
      action === "paused_conversation",
    message: `human-control: with the human holding the conversation the next inbound message must produce no answer and no model call, but the model double answered ${delta.modelResponses} time(s) and embedded ${delta.modelEmbeddings} time(s), the transport double received ${delta.sends} send(s), and the event settled ${status}/${action} instead of DONE/paused_conversation. Observed: ${JSON.stringify(observed)}`,
  };
}

function checkIgnoreAiLink(observed) {
  if (!observed) return missingLink("ignore-ai");
  const { delta } = observed;
  const { status, action } = eventOutcome(observed.event);
  return {
    link: "ignore-ai",
    name: "an ignored contact is neither answered nor processed, and never calls the model double",
    counts: `model=${delta.modelResponses} response(s), ${delta.modelEmbeddings} embedding(s), transport=${delta.sends} send(s), event=${status}/${action}`,
    pass:
      delta.modelResponses === 0 &&
      delta.modelEmbeddings === 0 &&
      delta.sends === 0 &&
      status === "DONE" &&
      action === "ignored_contact",
    message: `ignore-ai: a contact marked as ignored must be neither answered nor processed, but the model double answered ${delta.modelResponses} time(s) and embedded ${delta.modelEmbeddings} time(s), the transport double received ${delta.sends} send(s), and the event settled ${status}/${action} instead of DONE/ignored_contact. Observed: ${JSON.stringify(observed)}`,
  };
}

function checkIdempotencyLink(observed) {
  if (!observed) return missingLink("idempotency");
  const events = observed.events ?? [];
  return {
    link: "idempotency",
    name: "the same event delivered twice produces one answer and one reply",
    counts: `events=${events.length}, outbound=${observed.outboundMessages}, transport=${observed.delta.sends} send(s) in ${observed.delta.replies} reply(ies) (${observed.repliesToContact} to this contact), acks=${(observed.acks ?? []).join("/")}`,
    pass:
      (observed.acks ?? []).every((status) => status === 202) &&
      events.length === 1 &&
      events[0]?.status === "DONE" &&
      observed.outboundMessages === 1 &&
      observed.repliesToContact === 1 &&
      observed.delta.replies === 1,
    message: `idempotency: the same event delivered twice must leave one inbox event, one outbound message and one reply, but the rehearsal observed ${events.length} event(s), ${observed.outboundMessages} outbound message(s) and ${observed.repliesToContact} reply(ies) to the contact. Observed: ${JSON.stringify(observed)}`,
  };
}

function checkSupersedeLink(observed) {
  if (!observed) return missingLink("supersede");
  const { status, action } = eventOutcome(observed.firstEvent);
  return {
    link: "supersede",
    name: "a new inbound message cancels the pending output instead of sending both",
    counts: `first event=${status}/${action}, cancelled outbound=${observed.cancelledOutbound}, sent outbound=${observed.sentOutbound}, transport=${observed.repliesToContact} reply(ies) to this contact, reasons=${(observed.cancelReasons ?? []).join(",") || "none"}`,
    pass:
      status === "DONE" &&
      action === "superseded" &&
      observed.cancelledOutbound === 1 &&
      observed.sentOutbound === 1 &&
      observed.repliesToContact === 1,
    message: `supersede: a new message from the same contact must cancel the output that had not been sent yet, but the first turn settled ${status}/${action}, ${observed.cancelledOutbound} outbound message(s) were cancelled, ${observed.sentOutbound} were sent and the transport double received ${observed.repliesToContact} reply(ies) for this contact. Observed: ${JSON.stringify(observed)}`,
  };
}

function checkGroupLink(observed) {
  if (!observed) return missingLink("group");
  const { delta } = observed;
  const { status, action } = eventOutcome(observed.event);
  return {
    link: "group",
    name: "a group event never becomes an outbound message and never calls the model double",
    counts: `model=${delta.modelResponses} response(s), ${delta.modelEmbeddings} embedding(s), transport=${delta.sends} send(s), outbound-delta=${observed.outboundDelta}, event=${status}/${action}`,
    pass:
      delta.modelResponses === 0 &&
      delta.modelEmbeddings === 0 &&
      delta.sends === 0 &&
      observed.outboundDelta === 0 &&
      status === "DONE" &&
      action === "ignored_group",
    message: `group: an inbound event from a group chat must never become an outbound message, call the model double or reach the transport double, but the model double answered ${delta.modelResponses} time(s) and embedded ${delta.modelEmbeddings} time(s), the transport double received ${delta.sends} send(s), the outbound message count changed by ${observed.outboundDelta}, and the event settled ${status}/${action} instead of DONE/ignored_group. Observed: ${JSON.stringify(observed)}`,
  };
}

// --- Orquestração do processo pai ------------------------------------------

export async function rehearse(plan) {
  console.log(`goal032:auto-reply-rehearsal target: ${plan.ai.label}`);

  await assertVectorExtensionAvailable(plan.maintenance);
  await recreateDatabase(plan.maintenance, plan.ai.database);

  const migrated = runPrisma(plan.ai.url);
  if (migrated.status !== 0) {
    fail(
      `prisma migrate deploy failed for the AI orchestrator (exit ${migrated.status}).\n${migrated.output}`,
    );
    return process.exitCode ?? 1;
  }

  const baseline = await countRows(plan.ai.url, REHEARSAL_TABLES);
  const seeded = unexpectedRows(baseline);
  if (seeded.length > 0) {
    fail(
      `the disposable database is not in its migration baseline: ${seeded
        .map(([table, total]) => `${table}=${total}`)
        .join(
          ", ",
        )}. This rehearsal only trusts state that the exercised path produced.`,
    );
    return process.exitCode ?? 1;
  }

  const outcome = runRehearsalChildProcess(plan);
  if (outcome.output) console.log(outcome.output);

  const result = parseRehearsalResult(outcome.output);
  if (outcome.status !== 0 || !result) {
    fail(
      `the rehearsal subprocess exited with ${outcome.status} and produced ${
        result ? "a result" : "no result"
      }.`,
    );
    return process.exitCode ?? 1;
  }

  console.log("");
  console.log(
    `goal032: waited ${result.worker.waitedMs} ms for the real inbox worker (declared ceiling ${result.waitCeilingMs} ms).`,
  );
  console.log(`goal032: the whole delivery took ${result.elapsedMs} ms.`);
  console.log(
    `goal032: doubles listened on ${result.doubles.openAiBaseUrl} (OpenAI) and ${result.doubles.evolutionBaseUrl} (Evolution).`,
  );
  console.log(
    `goal032: the model double answered ${result.model.responses} time(s); the transport double received ${result.transport.sends.length} send(s).`,
  );

  const assertionsStartedAt = Date.now();
  assertAutoReply(result);
  console.log(
    `goal032: auto-reply assertions passed in ${Date.now() - assertionsStartedAt} ms.`,
  );

  console.log("");
  for (const [link, observed] of Object.entries(result.links ?? {})) {
    console.log(
      `goal032: negative-control link "${link}" ran with broken=${observed.broken}, waited ${observed.waitedMs} ms, ` +
        `model ${observed.delta.modelResponses} response(s) and ${observed.delta.modelEmbeddings} embedding(s), ` +
        `transport ${observed.delta.sends} send(s).`,
    );
  }

  const linksStartedAt = Date.now();
  assertNegativeControlLinks(result);
  console.log(
    `goal032: the five negative-control links held in ${Date.now() - linksStartedAt} ms.`,
  );

  return process.exitCode ?? 0;
}

export async function main() {
  if (process.argv.includes("--rehearse")) {
    await runRehearsalChild();
    return 0;
  }

  let plan;
  const breakLink = process.env.GOAL032_BREAK_LINK?.trim() || null;
  try {
    assertRequiredBinaries();
    if (breakLink && !(breakLink in BREAKABLE_LINKS)) {
      throw new AutoReplyRehearsalError(
        `Unknown GOAL032_BREAK_LINK "${breakLink}". Known links: ${Object.keys(BREAKABLE_LINKS).join(", ")}.`,
      );
    }
    plan = resolveRehearsalPlan();
  } catch (error) {
    if (error instanceof AutoReplyRehearsalError) refuse(error.message);
    throw error;
  }

  if (breakLink) {
    console.log(
      `goal032:auto-reply-rehearsal NEGATIVE CONTROL: breaking the link "${breakLink}" — ${BREAKABLE_LINKS[breakLink]}`,
    );
  }

  let code;
  try {
    code = await rehearse(plan);
  } catch (error) {
    if (error instanceof AutoReplyRehearsalError) {
      fail(error.message);
      code = process.exitCode ?? 1;
    } else {
      throw error;
    }
  }

  if (!breakLink) return code;

  if (code !== 0) {
    console.error(
      `goal032:auto-reply-rehearsal FAILED — as the negative control demanded: the link "${breakLink}" was broken (${BREAKABLE_LINKS[breakLink]}) and the rehearsal stopped composing. See the assertion above.`,
    );
    return code;
  }

  // Verde com elo quebrado é pior notícia do que vermelho: significa que o
  // ensaio não estava provando o que diz provar.
  console.error(
    `goal032:auto-reply-rehearsal FAILED — the link "${breakLink}" was broken and the rehearsal still passed. It is not proving what it claims to prove.`,
  );
  process.exitCode = 1;
  return 1;
}

if (isMain(import.meta.url)) {
  main()
    .then((code) => process.exit(code ?? process.exitCode ?? 0))
    .catch((error) => {
      console.error(
        `goal032:auto-reply-rehearsal FAILED — ${redactConnectionStrings(
          error?.stack ?? String(error),
        )}`,
      );
      process.exit(1);
    });
}
