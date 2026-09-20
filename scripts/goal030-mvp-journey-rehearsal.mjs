#!/usr/bin/env node

// Ensaio do Goal030 (WU-01): o percurso único de produto, ponta a ponta,
// contra os serviços próprios reais e bancos PostgreSQL descartáveis de
// verdade — o BFF (dono da conta, da sessão e do perfil do negócio) e o
// Scheduling (dono do calendário, do catálogo, das pessoas e da agenda).
//
// O que este ensaio prova, e que nenhum outro prova: a **composição** das
// fatias. Vinte e nove Goals fecharam domínio por domínio, cada um com prova
// própria; ninguém tinha percorrido um negócio único do cadastro até a agenda
// ocupada passando por todas as etapas intermediárias, na ordem em que uma
// pessoa real as percorre.
//
// O percurso inteiro, na ordem em que uma pessoa real o atravessa, sempre
// sobre o mesmo tenant:
//
//   1. cadastro e sessão emitida pelo caminho de produção;
//   2. onboarding nos quatro blocos até `POST /v1/onboarding/complete`, com a
//      recusa por mínimo faltando exercitada antes de completar;
//   3. catálogo com serviço operacional;
//   4. cliente cadastrado como pessoa, com responsável e proveniência;
//   5. agendamento confirmado, com a ocupação refletida na leitura da agenda;
//   6. mensagem do contato entrando pelo transporte durável e aparecendo na
//      conversa, com categoria/privacidade e controle humano;
//   7. lembrete programado conforme a regra vigente do negócio;
//   8. notificação persistida na central, com nível e leitura;
//   9. alteração do fuso do negócio, que atravessa serviço pelo mecanismo do
//      Goal029 — sem duplicar o ensaio dele;
//  10. retenção declarada e purga de conteúdo aplicada;
//  11. exclusão de conta e o ciclo recuperável até o fim.
//
// As etapas 6 a 11 sobem um terceiro serviço próprio real, o orquestrador de
// IA, contra um terceiro banco descartável — ele é o dono da conversa, da
// mensagem e da sessão de atendimento, e nenhuma dessas etapas pode ser
// provada sem ler o banco dele.
//
// Regras que este arquivo cumpre, e que são o motivo de ele existir:
//
// - **Um tenant só atravessa o percurso inteiro.** Nada é semeado. Os dois
//   bancos nascem vazios (o ensaio confere isso lendo as tabelas antes de
//   começar) e cada etapa só encontra o estado que a etapa anterior produziu
//   pelo caminho público. Nenhum `INSERT` de conveniência em lugar nenhum.
// - **Sessão pelo caminho de produção.** O percurso chama
//   `POST /v1/auth/register` por HTTP real contra o BFF escutando em
//   loopback, guarda o cookie de sessão que veio em `Set-Cookie` e o token de
//   CSRF que veio no header `x-csrf-token`, e apresenta os dois em toda
//   mutação seguinte — exatamente como o frontend publicado faz. Não há
//   `signSession`, `createUserSession` nem header forjado: as duas recusas de
//   CSRF (origem e token) são exercitadas de propósito, para provar que a
//   barreira está de pé e não foi contornada.
// - **Prova por leitura direta do banco do serviço dono do dado**, com `pg`
//   puro, além da resposta HTTP. Resposta `200` não é evidência de
//   persistência — foi exatamente assim que o defeito da rodada 2 do Goal029
//   passou. Cada etapa é lida no banco logo depois de acontecer (dentro do
//   subprocesso), e o estado final é relido pelo processo pai, em conexões
//   novas, depois que os dois serviços já morreram.
// - **Fronteira externa nunca é chamada; serviço próprio é sempre real.**
//   Nenhum endereço fora de loopback. Os três dublês são declarados, e cada um
//   substitui exatamente uma fronteira que não é do produto:
//
//     * **WhatsApp (Evolution Go).** O vínculo do canal é escrito pelo cliente
//       real do BFF contra a rota interna real da IA, com credencial de
//       instância sintética; nenhuma instância remota é criada, consultada ou
//       apagada. A mensagem do contato chega como o webhook do provedor chega
//       — `POST /webhooks/evolution` por HTTP real contra a IA real —, porque
//       mensagem entrando é **entrada externa**, e semear entrada externa é o
//       que o Goal permite.
//     * **Provedor de LLM.** A etapa 6 monta o `AssistantService` real com um
//       `ModelProvider` dublê que **lança** se for chamado. Ele não é chamado:
//       a persistência da mensagem na conversa (`recordInboundText`) não passa
//       pelo modelo. É o dublê que transforma "nenhuma chamada ao provedor" em
//       asserção, em vez de promessa.
//     * **Relógio.** Duas etapas precisam de tempo que ainda não passou: a
//       varredura de retenção recebe o instante futuro por parâmetro (`now`,
//       que o próprio código de produção expõe) e a purga de conta tem o
//       vencimento antecipado por `UPDATE` na linha de `AccountDeletion`. O
//       relógio é entrada externa; nada além dele é semeado.
//
//   **Limite declarado:** a resposta automática da IA — o grafo, o modelo e o
//   envio pelo transporte — **não** é exercitada por este ensaio, e ele não
//   afirma nada sobre ela. A etapa 6 prova recebimento durável, persistência
//   na conversa, categoria/privacidade e controle humano; não prova resposta.
// - **Guards de destino:** loopback e nome de banco descartável, `exit 2` com
//   mensagem própria em qualquer outro destino, e nenhuma credencial
//   impressa — strings de conexão passam por `redactConnectionStrings`, e
//   cookie, token de CSRF, senha e token interno nunca saem do processo.
//
// Controle negativo: `GOAL030_BREAK_LINK` quebra um elo declarado do percurso
// para demonstrar que o ensaio cai (`exit 1`) quando a composição deixa de
// valer. Ver `BREAKABLE_LINKS`. Sem essa variável o caminho verde é idêntico.
//
// Códigos de saída: 0 sucesso, 1 falha de asserção, 2 recusa (destino
// inválido ou dependência ausente). Sem caminho de skip.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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

// Sintéticos e de uso único deste ensaio: nunca derivam de segredo real e
// nunca são impressos. O token interno serve para as duas metades do
// subprocesso (o Scheduling real e o `SchedulingClient` do BFF) concordarem
// na mesma credencial, como dois processos de produção fariam com
// `INTERNAL_SERVICE_TOKEN` compartilhado. O segredo de sessão assina o JWT
// que o próprio BFF emite, para que o ensaio não dependa de `.env` local.
const INTERNAL_TOKEN = "goal030-mvp-journey-rehearsal-synthetic-internal-token";
const SESSION_SECRET = "goal030-mvp-journey-rehearsal-synthetic-session-secret";
// Senha do cadastro do percurso: sintética, vive só nesta execução e nunca é
// impressa. O ensaio a envia a `POST /v1/auth/register` e, na etapa 11, à
// reautenticação que a exclusão de conta exige.
const ACCOUNT_PASSWORD = "goal030-journey-rehearsal-password";

// Credenciais sintéticas da fronteira do WhatsApp (etapa 6). Nenhuma delas
// abre nada fora deste processo: o token do webhook é o que a IA exige de quem
// entrega evento, a chave de cifra protege a projeção da credencial de
// instância dentro do banco descartável, e a própria credencial de instância
// nunca é apresentada a endereço nenhum — não existe Evolution Go no ensaio.
const WEBHOOK_TOKEN = "goal030-mvp-journey-rehearsal-synthetic-webhook-token";
const CHANNEL_KEY_ID = "goal030";
// Exatamente 32 bytes em base64, fixos e sintéticos: banco descartável, chave
// descartável. O tamanho não é escolha — `parseKeys` descarta em silêncio
// qualquer material que não tenha 32 bytes, e a cifra ficaria sem chave.
const CHANNEL_KEY = "Z29hbDAzMC1qb3VybmV5LXJlaGVhcnNhbC1rZXktMzI=";
const INSTANCE_CREDENTIAL =
  "goal030-mvp-journey-rehearsal-synthetic-instance-credential";

// Origem permitida do percurso. Precisa ser loopback como todo o resto, e é
// ela que o ensaio apresenta em `Origin` — a mesma allowlist que o BFF
// confere em `assertAllowedOrigin`.
const FRONTEND_ORIGIN = "http://127.0.0.1:3001";

/**
 * Elos que o controle negativo sabe quebrar, e o que cada um derruba.
 *
 * Cada elo é uma etapa do percurso deixando de acontecer — nunca uma asserção
 * relaxada nem código de produção alterado. `GOAL030_BREAK_LINK=<elo>` derruba
 * o ensaio com `exit 1`, e o elo quebrado é nomeado na saída.
 */
export const BREAKABLE_LINKS = Object.freeze({
  "onboarding-ai-block":
    "pula o quarto bloco do onboarding; a conclusão continua recusada e a etapa 2 cai",
  "catalog-active-service":
    "cria o serviço do catálogo inativo; a etapa 3 cai e a agenda da etapa 5 não teria o que oferecer",
  "customer-guardian-confirmation":
    "pula a confirmação do responsável; a relação fica PROPOSED e a etapa 4 cai",
  "conversation-category":
    "pula a categoria da conversa; a etapa 6 cai e a etapa 10 não teria conteúdo governado para purgar",
  "reminder-rule":
    "grava a regra de lembrete vazia; o agendamento da etapa 7 não programa lembrete nenhum e ela cai",
  "notification-read":
    "pula a leitura da notificação; a central continua com a condição não lida e a etapa 8 cai",
  "business-timezone":
    "pula a alteração de fuso; as duas cópias ficam no fuso antigo e a etapa 9 cai",
  "retention-declaration":
    "pula a declaração de retenção; o prazo padrão não vence no relógio do ensaio, a purga não apaga nada e a etapa 10 cai",
  "account-deletion-cancel":
    "pula o cancelamento; o ciclo deixa de ser recuperável e a etapa 11 cai",
});

export class JourneyRehearsalError extends Error {
  constructor(message) {
    super(message);
    this.name = "JourneyRehearsalError";
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
    `goal030:mvp-journey-rehearsal REFUSED — ${redactConnectionStrings(message)}`,
  );
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) {
    console.error(
      `goal030:mvp-journey-rehearsal FAILED — ${redactConnectionStrings(message)}`,
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

function bffRequire() {
  return createRequire(path.join(repositoryRoot, "apps", "bff", "package.json"));
}

/**
 * O negócio único que atravessa o percurso inteiro. É fixture de **entrada**
 * (o que uma pessoa digitaria), nunca de estado: nada aqui é escrito direto
 * no banco.
 */
export const JOURNEY = Object.freeze({
  email: "goal030-mvp-journey@example.invalid",
  businessName: "Estúdio Goal030 Percurso",
  businessCategory: "Beleza e estética",
  timezone: "America/Sao_Paulo",
  modalities: Object.freeze(["ON_SITE"]),
  address: "Rua do Ensaio, 30 — Sala 1",
  tone: "BALANCED",
  // Serviço mínimo gravado pelo próprio onboarding (seção `service`).
  onboardingService: Object.freeze({
    name: "Corte",
    durationMinutes: 30,
    priceType: "FIXED",
    price: 90,
  }),
  // Serviço do catálogo (etapa 3); é ele que o agendamento da etapa 5 usa.
  catalogService: Object.freeze({
    name: "Coloração completa",
    durationMinutes: 60,
    priceType: "FIXED",
    price: 240,
    colorToken: "VIOLET",
    description: "Coloração com avaliação prévia.",
  }),
  // Dias úteis, das 09:00 às 18:00: é a regra que o onboarding grava e a
  // única fonte dos horários que a etapa 5 encontra.
  availabilityDays: Object.freeze([1, 2, 3, 4, 5]),
  availabilityStartTime: "09:00",
  availabilityEndTime: "18:00",
  // Responsável principal e a pessoa atendida (etapa 4). A pessoa nasce sem
  // telefone de propósito: o produto aceita cliente que é só um nome, e o
  // telefone é contato, não identidade (D-005).
  guardian: Object.freeze({ name: "Marta Nogueira", phone: "+5511990000030" }),
  person: Object.freeze({ name: "Nina Nogueira" }),
  // Antecedência do agendamento, em dias. Fica muito abaixo do horizonte
  // padrão de oferta (`maxLeadDays` 90) e acima da antecedência mínima.
  appointmentLeadDays: 14,
  // Antecedência do segundo agendamento, o da etapa 7: outro dia útil, para
  // que o lembrete programado seja o dele e de mais nada.
  reminderAppointmentLeadDays: 21,
  // O contato que escreve na etapa 6. Telefone sintético, nunca discado: ele
  // só existe como identidade de conversa dentro dos bancos descartáveis.
  contact: Object.freeze({
    phone: "5511990000031",
    name: "Nina do Percurso",
    instanceId: "goal030-journey-instance",
    text: "Oi! Queria marcar uma coloração para a próxima semana.",
    messageId: "goal030-journey-inbound-1",
  }),
  // Regra de lembrete que a etapa 7 declara: um lembrete, 24 h antes.
  reminderLeadMinutes: 1_440,
  // Fuso novo da etapa 9. Mesmo deslocamento do anterior de propósito: o que
  // está sob prova é a travessia de serviço do valor, não aritmética de hora.
  newTimezone: "America/Belem",
  // Prazo de retenção declarado na etapa 10, em dias, e o quanto o relógio da
  // varredura anda para frente. O par é o que separa "purgou porque a regra
  // venceu" de "purgou porque o relógio foi longe demais": com o prazo padrão
  // (90) e este mesmo relógio, nada venceria.
  retentionDays: 30,
  retentionSweepAheadDays: 60,
});

/**
 * Valida o alvo e monta o plano do ensaio, sem tocar em banco nem
 * subprocesso. Dois bancos PRÓPRIOS e descartáveis são derivados do mesmo
 * alvo já validado — nunca as bases compartilhadas do resto do gate.
 */
export function resolveRehearsalPlan(environment = process.env) {
  const raw = environment.BFF_TEST_DATABASE_URL?.trim();
  if (!raw) {
    throw new JourneyRehearsalError(
      "BFF_TEST_DATABASE_URL is not set. This rehearsal refuses to run: it will not fall back to any app .env or to an inherited DATABASE_URL.",
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new JourneyRehearsalError("BFF_TEST_DATABASE_URL is not a valid URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new JourneyRehearsalError(
      `BFF_TEST_DATABASE_URL must use postgres:// or postgresql://, got ${url.protocol}//`,
    );
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new JourneyRehearsalError(
      `Host "${host}" is not loopback. This rehearsal drops and recreates whole databases and only accepts a locally provisioned PostgreSQL (127.0.0.1, localhost or ::1).`,
    );
  }

  const baseDatabase = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!baseDatabase) {
    throw new JourneyRehearsalError(
      "BFF_TEST_DATABASE_URL must name a database.",
    );
  }
  if (!DISPOSABLE_NAME.test(baseDatabase)) {
    throw new JourneyRehearsalError(
      `Database "${baseDatabase}" is not recognised as disposable. This rehearsal issues DROP DATABASE and must never touch a shared or product database; the name must contain "test".`,
    );
  }

  const port = url.port || "5432";
  const bff = derivedTarget(raw, baseDatabase, "goal030_bff", host, port);
  const scheduling = derivedTarget(
    raw,
    baseDatabase,
    "goal030_scheduling",
    host,
    port,
  );
  // Terceiro banco próprio: o orquestrador de IA é dono da conversa, da
  // mensagem e da sessão de atendimento, e as etapas 6 e 10 são provadas
  // lendo este banco.
  const ai = derivedTarget(raw, baseDatabase, "goal030_ai", host, port);

  const maintenance = new URL(raw);
  maintenance.pathname = "/postgres";

  return { maintenance: maintenance.href, host, port, bff, scheduling, ai };
}

function derivedTarget(raw, baseDatabase, suffix, host, port) {
  const database = `${baseDatabase}_${suffix}`;
  // O nome derivado também passa pela allowlist: se o sufixo apagasse a marca
  // de descarte, o DROP seguinte seria cego.
  if (!DISPOSABLE_NAME.test(database)) {
    throw new JourneyRehearsalError(
      `Derived database "${database}" is not recognised as disposable.`,
    );
  }
  const target = new URL(raw);
  target.pathname = `/${encodeURIComponent(database)}`;
  return {
    database,
    url: target.href,
    // Seguro para log: sem usuário, senha ou query string.
    label: `${host}:${port}/${database}`,
  };
}

/**
 * Exige, ANTES de qualquer conexão, que as dependências existam: o driver
 * `pg`, a CLI do Prisma de cada serviço e `tsx` (os dois apps são TypeScript
 * e sobem sob ele). Ausência é recusa com exit 2, nunca skip.
 */
export function assertRequiredBinaries() {
  try {
    bffRequire().resolve("pg");
  } catch {
    throw new JourneyRehearsalError(
      "The PostgreSQL driver (pg) is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal.",
    );
  }
  try {
    bffRequire().resolve("tsx/package.json");
  } catch {
    throw new JourneyRehearsalError(
      "tsx is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal — it drives the journey, which boots the real BFF and the real Scheduling service under a TypeScript loader.",
    );
  }
  try {
    bffRequire().resolve("prisma/package.json");
  } catch {
    throw new JourneyRehearsalError(
      "The Prisma CLI is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal.",
    );
  }
  const schedulingRequire = createRequire(
    path.join(repositoryRoot, "apps", "scheduling-service", "package.json"),
  );
  try {
    schedulingRequire.resolve("prisma/package.json");
  } catch {
    throw new JourneyRehearsalError(
      "The Prisma CLI is not installed for apps/scheduling-service. Run `npm ci --prefix apps/scheduling-service` before this rehearsal.",
    );
  }
  const aiRequire = createRequire(
    path.join(repositoryRoot, "apps", "ai-orchestrator", "package.json"),
  );
  try {
    aiRequire.resolve("prisma/package.json");
  } catch {
    throw new JourneyRehearsalError(
      "The Prisma CLI is not installed for apps/ai-orchestrator. Run `npm ci --prefix apps/ai-orchestrator` before this rehearsal — stages 6 to 11 boot the real AI orchestrator.",
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
    throw new JourneyRehearsalError(
      "The generated Prisma client of apps/ai-orchestrator is missing. Run `npx prisma generate` in apps/ai-orchestrator — it is the `generate:ai-orchestrator-prisma-client` step of validate:integration — before this rehearsal.",
    );
  }
}

/**
 * Recusa, ANTES de criar banco, quando o servidor não oferece a extensão que
 * o histórico de migrations da IA exige (`CREATE EXTENSION vector`, desde
 * `20260829180000_rag_pgvector`). Exit 2 com mensagem própria, nunca skip:
 * nenhuma migration instala extensão de servidor, e um servidor sem pgvector
 * não recebe o serviço de IA nem aqui nem em produção.
 */
export async function assertVectorExtensionAvailable(maintenanceUrl) {
  const { Client } = bffRequire()("pg");
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
    throw new JourneyRehearsalError(
      "The target server does not offer the `vector` extension, which the AI orchestrator migrations require through CREATE EXTENSION. Install pgvector in this PostgreSQL installation and run the rehearsal again.",
    );
  }
}

async function recreateDatabase(maintenanceUrl, database) {
  const { Client } = bffRequire()("pg");
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
 * `prisma migrate deploy` do histórico versionado de um serviço contra o seu
 * banco descartável. Comando entregue como string única ao shell porque
 * `npx` no Windows é um script `.cmd` e o Node recusa executá-lo sem shell.
 */
function runPrisma(appDir, url) {
  const env = { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url };
  const outcome = spawnSync("npx prisma migrate deploy", {
    cwd: path.join(repositoryRoot, "apps", appDir),
    env,
    encoding: "utf8",
    shell: true,
  });
  if (outcome.error) {
    return { status: null, output: `failed to start: ${outcome.error.message}` };
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
  const { Client } = bffRequire()("pg");
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

const BFF_JOURNEY_TABLES = Object.freeze([
  "User",
  "Tenant",
  "TenantMember",
  "BusinessProfile",
  "LegalAcceptance",
  "UserSession",
  "RetentionSettings",
  "TenantNotification",
  "AccountDeletion",
]);
const SCHEDULING_JOURNEY_TABLES = Object.freeze([
  "CalendarSettings",
  "AvailabilityRule",
  "Service",
  "Customer",
  "CustomerRelation",
  "Appointment",
  "AppointmentItem",
  "ReminderSettings",
  "ReminderRule",
  "AppointmentNotificationIntent",
]);
/**
 * A única linha que o histórico de migrations da IA cria sozinho: o canal
 * legado `legacy-evolution-channel`, do tenant `legacy-unassigned`, INATIVO.
 *
 * Ela não é estado do percurso e não pertence a negócio nenhum — é o
 * marcador que o histórico usa para o estoque anterior ao vínculo por tenant.
 * Declarada aqui para que "banco vazio" continue significando "nada do
 * percurso foi semeado", em vez de virar exceção solta em duas conferências.
 */
const AI_BASELINE_ROWS = Object.freeze({ ChannelConnection: 1 });

/** Linhas além do que o histórico de migrations cria por conta própria. */
function unexpectedRows(counts, baseline = {}) {
  return Object.entries(counts).filter(
    ([table, total]) => total !== (baseline[table] ?? 0),
  );
}

const AI_JOURNEY_TABLES = Object.freeze([
  "ChannelConnection",
  "Contact",
  "Conversation",
  "ConversationSession",
  "Message",
  "ProcessedEvent",
  "Handoff",
]);

/**
 * A composição inteira, lida direto das três bases com `pg` puro.
 *
 * Roda dentro do subprocesso depois da etapa 10 e **antes** da exclusão de
 * conta: é o retrato do negócio de pé, com tudo que cada etapa produziu e nada
 * além disso. O processo pai confere este retrato linha por linha e depois faz
 * a sua própria leitura, em conexões novas, para provar o vazio da etapa 11.
 *
 * Os clientes chegam conectados e continuam de quem os abriu: esta função lê,
 * nunca abre nem fecha conexão.
 */
async function readComposition(bffClient, schedulingClient, aiClient) {
  // Sequencial de propósito: uma conexão `pg` executa uma consulta por vez,
  // e disparar duas em paralelo no mesmo cliente é comportamento depreciado.
  const users = await bffClient.query(`SELECT "id", "email" FROM "User"`);
  const profiles = await bffClient.query(
    `SELECT "tenantId", "businessName", "category", "timezone",
            "modalities"::text[] AS "modalities", "address",
            "onboardingCompletedAt"::text AS "onboardingCompletedAt"
       FROM "BusinessProfile"`,
  );
  const members = await bffClient.query(
    `SELECT "tenantId", "userId", "role" FROM "TenantMember"`,
  );
  const sessions = await bffClient.query(
    `SELECT "userId", "csrfTokenHash" <> '' AS "hasCsrfHash", "revokedAt" IS NULL AS "active"
       FROM "UserSession"`,
  );
  const calendarSettings = await schedulingClient.query(
    `SELECT "tenantId", "source"::text AS "source", "timezone" FROM "CalendarSettings"`,
  );
  const availabilityRules = await schedulingClient.query(
    `SELECT "dayOfWeek", "active" FROM "AvailabilityRule" ORDER BY "dayOfWeek"`,
  );
  const services = await schedulingClient.query(
    `SELECT "id", "name", "active", "needsReview", "durationMinutes",
            "priceType"::text AS "priceType", "price"::text AS "price"
       FROM "Service" ORDER BY "name"`,
  );
  const customers = await schedulingClient.query(
    `SELECT "id", "name", "phone" FROM "Customer" ORDER BY "name"`,
  );
  const relations = await schedulingClient.query(
    `SELECT "customerId", "relatedCustomerId", "type"::text AS "type",
            "status"::text AS "status", "proposedBy"::text AS "proposedBy",
            "proposedByActor", "confirmedBy"::text AS "confirmedBy", "confirmedByActor"
       FROM "CustomerRelation"`,
  );
  const appointments = await schedulingClient.query(
    `SELECT "id", "customerId", "status", "source"::text AS "source", "createdBy",
            "startAt"::text AS "startAt", "endAt"::text AS "endAt"
       FROM "Appointment"`,
  );
  const appointmentItems = await schedulingClient.query(
    `SELECT "appointmentId", "serviceId", "serviceNameSnapshot",
            "durationMinutesSnapshot", "priceTypeSnapshot"::text AS "priceTypeSnapshot"
       FROM "AppointmentItem"`,
  );
  const reminderRules = await schedulingClient.query(
    `SELECT "slot"::text AS "slot", "leadMinutes" FROM "ReminderRule" ORDER BY "slot"`,
  );
  const intents = await schedulingClient.query(
    `SELECT i."appointmentId", i."kind"::text AS "kind", i."slot"::text AS "slot",
            i."state"::text AS "state",
            (EXTRACT(EPOCH FROM (a."startAt" - i."dueAt")) / 60)::int AS "leadMinutes"
       FROM "AppointmentNotificationIntent" i
       JOIN "Appointment" a ON a."id" = i."appointmentId"
      ORDER BY i."dueAt"`,
  );
  const notifications = await bffClient.query(
    `SELECT "kind"::text AS "kind", "level"::text AS "level", "shape"::text AS "shape",
            "readAt" IS NOT NULL AS "read", "resolvedAt" IS NULL AS "open"
       FROM "TenantNotification" ORDER BY "kind"`,
  );
  const retention = await bffClient.query(
    `SELECT "commercialRetentionDays", "personalRetentionDays" FROM "RetentionSettings"`,
  );
  const conversations = await aiClient.query(
    `SELECT "id", "status"::text AS "status", "humanHandoff",
            "contentExpiredThrough" IS NOT NULL AS "contentExpired"
       FROM "Conversation"`,
  );
  const conversationSessions = await aiClient.query(
    `SELECT "conversationId", "category"::text AS "category",
            "categorySource"::text AS "categorySource", "humanHandling"
       FROM "ConversationSession"`,
  );
  const messages = await aiClient.query(
    `SELECT "conversationId", "direction"::text AS "direction", "body" FROM "Message"`,
  );
  const inboundEvents = await aiClient.query(
    `SELECT "status"::text AS "status", "eventType" FROM "ProcessedEvent"`,
  );
  return {
    users: users.rows,
    profiles: profiles.rows,
    members: members.rows,
    sessions: sessions.rows,
    calendarSettings: calendarSettings.rows,
    availabilityRules: availabilityRules.rows,
    services: services.rows,
    customers: customers.rows,
    relations: relations.rows,
    appointments: appointments.rows,
    appointmentItems: appointmentItems.rows,
    reminderRules: reminderRules.rows,
    notificationIntents: intents.rows,
    notifications: notifications.rows,
    retention: retention.rows[0] ?? null,
    conversations: conversations.rows,
    conversationSessions: conversationSessions.rows,
    messages: messages.rows,
    inboundEvents: inboundEvents.rows,
  };
}

/**
 * Releitura independente do estado final, feita pelo processo pai em conexões
 * novas depois que os três serviços já morreram.
 *
 * Depois da etapa 11 o negócio não existe mais em base nenhuma, e é isso que
 * esta leitura prova: contagem por tabela nas três bases, todas em zero. É a
 * única forma honesta de provar exclusão de conta — a resposta `200` do pedido
 * diz que ele foi aceito, nunca que o dado saiu do disco.
 */
async function readFinalState(plan) {
  const [bff, scheduling, ai] = [
    await countRows(plan.bff.url, BFF_JOURNEY_TABLES),
    await countRows(plan.scheduling.url, SCHEDULING_JOURNEY_TABLES),
    await countRows(plan.ai.url, AI_JOURNEY_TABLES),
  ];
  const deletions = await readAccountDeletion(plan.bff.url);
  return { bff, scheduling, ai, deletions };
}

/** A linha da exclusão de conta sobrevive à purga de propósito: é o registro
 * de que a conta existiu e foi apagada. Lida aqui, no processo pai. */
async function readAccountDeletion(url) {
  const { Client } = bffRequire()("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT "status"::text AS "status", "purgedAt" IS NOT NULL AS "purged" FROM "AccountDeletion"`,
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

/**
 * Roda o percurso num subprocesso `tsx`: este mesmo arquivo, reinvocado com
 * `--journey`. É o único jeito de subir os dois apps TypeScript reais sem
 * duplicar a lógica deles aqui.
 */
function runJourney(plan) {
  const scriptPath = fileURLToPath(import.meta.url);
  const cwd = path.join(repositoryRoot, "apps", "bff");
  // Caminho relativo com barra normal: evita qualquer questão de escape de
  // barra invertida na string de comando entregue ao shell.
  const relativeScriptPath = path
    .relative(cwd, scriptPath)
    .split(path.sep)
    .join("/");

  const env = {
    ...process.env,
    GOAL030_BFF_DB_URL: plan.bff.url,
    GOAL030_SCHEDULING_DB_URL: plan.scheduling.url,
    GOAL030_AI_DB_URL: plan.ai.url,
    GOAL030_INTERNAL_TOKEN: INTERNAL_TOKEN,
    // Fixo e sintético: o BFF assina a sessão que ele mesmo emite, e herdar um
    // segredo de `.env` faria o ensaio depender de configuração local.
    JWT_SECRET: SESSION_SECRET,
    FRONTEND_ORIGIN,
    // Fronteira do WhatsApp, toda sintética (ver o cabeçalho): o token que a
    // IA exige de quem entrega evento e a chave que cifra a projeção da
    // credencial de instância dentro do banco descartável.
    EVOLUTION_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
    CHANNEL_CREDENTIAL_KEYS: `${CHANNEL_KEY_ID}:${CHANNEL_KEY}`,
    CHANNEL_CREDENTIAL_ACTIVE_KEY_ID: CHANNEL_KEY_ID,
    // Os quatro laços de fundo dos dois serviços ficam desligados. Não é
    // conveniência: ligados, o laço da inbox chamaria o provedor de LLM e o
    // transporte do WhatsApp pela fábrica de produção, e a varredura de
    // retenção e a purga de conta rodariam fora da etapa que as prova. O
    // percurso chama `runRetentionSweep` e `runAccountPurge` diretamente, como
    // as suítes fazem, e entrega a mensagem pelo caminho durável real.
    INBOX_WORKER_ENABLED: "false",
    NOTIFICATION_DELIVERY_ENABLED: "false",
    RETENTION_SWEEP_ENABLED: "false",
    ACCOUNT_PURGE_ENABLED: "false",
    // Cinto e suspensório do "nenhum endereço fora de loopback": as duas
    // fronteiras externas do produto apontam para uma porta de loopback onde
    // nada escuta. Nenhum caminho deste percurso as chama; se algum passasse a
    // chamar, a chamada morreria aqui dentro em vez de sair da máquina.
    EVOLUTION_GO_BASE_URL: "http://127.0.0.1:1",
    OPENAI_BASE_URL: "http://127.0.0.1:1",
  };

  const outcome = spawnSync(`npx tsx ${relativeScriptPath} --journey`, {
    cwd,
    env,
    encoding: "utf8",
    shell: true,
  });
  if (outcome.error) {
    return { status: null, output: `failed to start: ${outcome.error.message}` };
  }
  return {
    status: outcome.status,
    output: redactConnectionStrings(
      `${outcome.stdout ?? ""}${outcome.stderr ?? ""}`,
    ).trim(),
  };
}

const JOURNEY_RESULT_MARKER = "GOAL030_JOURNEY_RESULT ";

export function parseJourneyResult(output) {
  const line = output
    .split("\n")
    .find((entry) => entry.startsWith(JOURNEY_RESULT_MARKER));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(JOURNEY_RESULT_MARKER.length));
  } catch {
    return null;
  }
}

// --- Datas de parede do negócio --------------------------------------------
//
// O percurso raciocina em data de parede do negócio, que é o que as rotas
// aceitam (`YYYY-MM-DD`). Converter por `Date` local do processo colocaria o
// fuso da máquina no meio; estas três funções trabalham só sobre o texto.

export function localIsoDate(instant, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function addIsoDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function isoWeekday(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Primeira data, a partir da antecedência pedida, que cai num dia com regra de
 * disponibilidade. Determinística dado o relógio, e por isso a mesma em duas
 * execuções seguidas.
 */
export function firstBookableDate(today, leadDays, weekdays) {
  for (let offset = leadDays; offset < leadDays + 7; offset += 1) {
    const candidate = addIsoDays(today, offset);
    if (weekdays.includes(isoWeekday(candidate))) return candidate;
  }
  throw new JourneyRehearsalError(
    "No bookable weekday was found within a week of the requested lead time.",
  );
}

// --- Metade `--journey`: o percurso real ------------------------------------

/**
 * Cliente HTTP do percurso: fala com o BFF pela rede de verdade, em loopback,
 * com um cofre de cookies próprio.
 *
 * É o caminho de produção inteiro — `Origin` na allowlist, cookie de sessão
 * recebido em `Set-Cookie` e devolvido em toda requisição seguinte, token de
 * CSRF lido do header `x-csrf-token` (o canal documentado para cliente em
 * outra origem) e reapresentado em toda mutação. Nada aqui assina token nem
 * escreve sessão por dentro.
 */
function createJourneyClient(
  baseUrl,
  sessionCookieName,
  csrfCookieName,
  csrfHeaderName,
) {
  const jar = new Map();
  let csrfToken = null;

  function cookieHeader() {
    return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  function absorb(response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      // Valor vazio é o `clearCookie` do servidor: o cofre esquece o cookie,
      // como um browser faria.
      if (value === "") jar.delete(name);
      else jar.set(name, value);
    }
    const header = response.headers.get(csrfHeaderName);
    if (header) csrfToken = header;
  }

  async function request(method, route, options = {}) {
    const headers = { accept: "application/json" };
    headers.origin = options.origin ?? FRONTEND_ORIGIN;
    if (jar.size > 0) headers.cookie = cookieHeader();
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (csrfToken && !options.omitCsrf) headers[csrfHeaderName] = csrfToken;
    if (options.idempotencyKey) {
      headers["idempotency-key"] = options.idempotencyKey;
    }

    const response = await fetch(new URL(route, baseUrl), {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual",
    });
    absorb(response);
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    return { status: response.status, payload };
  }

  return {
    request,
    hasSessionCookie: () => jar.has(sessionCookieName),
    hasCsrfCookie: () => jar.has(csrfCookieName),
    hasCsrfToken: () => Boolean(csrfToken),
    // Os dois canais documentados carregam o MESMO valor. Comparar aqui prova
    // isso sem imprimir nenhum dos dois.
    csrfChannelsAgree: () => {
      if (!csrfToken || !jar.has(csrfCookieName)) return false;
      return decodeURIComponent(jar.get(csrfCookieName)) === csrfToken;
    },
  };
}

/** Falha do percurso: derruba o subprocesso, e com ele o ensaio inteiro. */
function step(condition, message) {
  if (!condition) throw new JourneyRehearsalError(message);
}

function issuesOf(payload) {
  const issues = payload?.error?.details?.issues;
  return Array.isArray(issues) ? [...issues].sort() : null;
}

async function runJourneyChild() {
  const bffDbUrl = process.env.GOAL030_BFF_DB_URL;
  const schedulingDbUrl = process.env.GOAL030_SCHEDULING_DB_URL;
  const aiDbUrl = process.env.GOAL030_AI_DB_URL;
  const internalToken = process.env.GOAL030_INTERNAL_TOKEN;
  const breakLink = process.env.GOAL030_BREAK_LINK?.trim() || null;
  if (breakLink && !(breakLink in BREAKABLE_LINKS)) {
    throw new JourneyRehearsalError(
      `Unknown GOAL030_BREAK_LINK "${breakLink}". Known links: ${Object.keys(BREAKABLE_LINKS).join(", ")}.`,
    );
  }

  process.env.NODE_ENV = "test";
  process.env.INTERNAL_SERVICE_TOKEN = internalToken;
  // Desligado de propósito: o percurso não depende do laço de conclusão
  // automática do Scheduling, e ele manteria o processo vivo além do
  // necessário.
  process.env.CALENDAR_AUTO_COMPLETE_ENABLED = "false";

  // Os três serviços próprios sobem aqui, na ordem das dependências:
  // Scheduling (não chama ninguém), IA (chama o Scheduling) e BFF (chama os
  // dois). Cada um captura a própria string de conexão no import do seu
  // `config/env`, e é por isso que `DATABASE_URL` é trocada entre um import e
  // o outro: é o que dá a cada serviço o seu banco descartável.
  process.env.DATABASE_URL = schedulingDbUrl;
  process.env.DIRECT_DATABASE_URL = schedulingDbUrl;

  const { buildApp: buildSchedulingApp } = await import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        "apps",
        "scheduling-service",
        "src",
        "app",
        "build-app.ts",
      ),
    ).href
  );
  const schedulingApp = await buildSchedulingApp();
  const schedulingAddress = await schedulingApp.listen({
    host: "127.0.0.1",
    port: 0,
  });

  const aiSource = (...segments) =>
    pathToFileURL(
      path.join(repositoryRoot, "apps", "ai-orchestrator", "src", ...segments),
    ).href;

  process.env.DATABASE_URL = aiDbUrl;
  process.env.DIRECT_DATABASE_URL = aiDbUrl;
  process.env.SCHEDULING_SERVICE_BASE_URL = schedulingAddress;

  const { buildApp: buildAiApp } = await import(aiSource("app.ts"));
  // Importados agora, enquanto a conexão vigente ainda é a da IA: o cliente
  // Prisma dela nasce no import de `db/prisma.ts`, e este é o mesmo módulo que
  // o serviço já está usando — não um segundo cliente montado por fora.
  const { prisma: aiPrisma } = await import(aiSource("db", "prisma.ts"));
  const { InboxStore, inboxRetryPolicyFromEnv } = await import(
    aiSource("modules", "inbox", "InboxStore.ts")
  );
  const { ChannelConnectionService } = await import(
    aiSource("modules", "channel", "ChannelConnectionService.ts")
  );
  const { mapEvolutionInbound } = await import(
    aiSource(
      "modules",
      "channel",
      "adapters",
      "evolution",
      "EvolutionInboundMapper.ts",
    )
  );
  const { AssistantService } = await import(
    aiSource("modules", "assistant", "assistant.service.ts")
  );
  const { PrismaGraphRuntime } = await import(
    aiSource("modules", "graph", "graph-runtime.ts")
  );
  const { SessionService } = await import(
    aiSource("modules", "session", "SessionService.ts")
  );

  const aiApp = await buildAiApp();
  const aiAddress = await aiApp.listen({ host: "127.0.0.1", port: 0 });

  process.env.DATABASE_URL = bffDbUrl;
  process.env.DIRECT_DATABASE_URL = bffDbUrl;
  process.env.AI_ORCHESTRATOR_BASE_URL = aiAddress;

  const bffSource = (...segments) =>
    pathToFileURL(path.join(repositoryRoot, "apps", "bff", "src", ...segments))
      .href;

  const { buildApp: buildBffApp } = await import(bffSource("app.ts"));
  const { env } = await import(bffSource("config", "env.ts"));
  const { CURRENT_LEGAL_VERSIONS } = await import(
    bffSource("config", "legal-versions.ts")
  );
  const { AiOrchestratorClient } = await import(
    bffSource("clients", "ai-orchestrator", "index.ts")
  );
  const { getPrisma } = await import(bffSource("lib", "prisma.ts"));
  const { defaultRetentionPorts, runRetentionSweep } = await import(
    bffSource("modules", "retention", "sweep.ts")
  );
  const { defaultAccountPurgePorts, runAccountPurge } = await import(
    bffSource("modules", "account", "purge.ts")
  );

  const bffApp = await buildBffApp();
  const bffAddress = await bffApp.listen({ host: "127.0.0.1", port: 0 });

  const { Client } = bffRequire()("pg");
  const bffDb = new Client({ connectionString: bffDbUrl });
  const schedulingDb = new Client({ connectionString: schedulingDbUrl });
  const aiDb = new Client({ connectionString: aiDbUrl });
  await Promise.all([bffDb.connect(), schedulingDb.connect(), aiDb.connect()]);

  const client = createJourneyClient(
    bffAddress,
    env.SESSION_COOKIE_NAME,
    env.CSRF_COOKIE_NAME,
    env.CSRF_HEADER_NAME.toLowerCase(),
  );

  // Tudo que a etapa 6 precisa da IA, montado com o código real dela. O único
  // substituto é o provedor de modelo, e ele existe para LANÇAR: se o caminho
  // exercitado chamasse o modelo, a etapa cairia com mensagem própria em vez
  // de sair calada para a internet. É assim que "nenhuma chamada a provedor de
  // LLM" vira asserção, e não promessa.
  const aiRuntime = {
    address: aiAddress,
    prisma: aiPrisma,
    mapEvolutionInbound,
    inbox: new InboxStore(aiPrisma, inboxRetryPolicyFromEnv()),
    channelConnections: new ChannelConnectionService(aiPrisma),
    runtime: new PrismaGraphRuntime(aiPrisma),
    sessions: new SessionService(aiPrisma),
    assistant: new AssistantService(aiPrisma, undefined, {
      invoke: async () => {
        throw new JourneyRehearsalError(
          "stage 6: the declared model double was invoked. This rehearsal never talks to an LLM provider: what it exercises is durable receipt and persistence in the conversation, never the automatic answer.",
        );
      },
    }),
    channelClient: new AiOrchestratorClient(),
  };

  // As duas rotinas de fundo do BFF chamadas de dentro do percurso, como as
  // suítes as chamam: o laço fica desligado, e quem decide o instante é a
  // etapa que prova o efeito.
  const bffRuntime = {
    getPrisma,
    defaultRetentionPorts,
    runRetentionSweep,
    defaultAccountPurgePorts,
    runAccountPurge,
  };

  const journey = { breakLink, stages: [] };
  try {
    const stage1 = await stageAccountAndSession(
      client,
      bffDb,
      CURRENT_LEGAL_VERSIONS,
    );
    journey.stages.push(stage1);

    const stage2 = await stageOnboarding(
      client,
      bffDb,
      schedulingDb,
      stage1.tenantId,
      breakLink,
    );
    journey.stages.push(stage2);

    const stage3 = await stageCatalog(client, schedulingDb, breakLink);
    journey.stages.push(stage3);

    const stage4 = await stageCustomer(
      client,
      schedulingDb,
      stage1.userId,
      breakLink,
    );
    journey.stages.push(stage4);

    const stage5 = await stageAppointment(
      client,
      schedulingDb,
      stage1.userId,
      stage3.catalogServiceId,
      stage4.personId,
    );
    journey.stages.push(stage5);

    const stage6 = await stageConversation(
      client,
      aiDb,
      aiRuntime,
      stage1,
      breakLink,
    );
    journey.stages.push(stage6);

    const stage7 = await stageReminder(
      client,
      schedulingDb,
      stage3.catalogServiceId,
      stage4.personId,
      breakLink,
    );
    journey.stages.push(stage7);

    const stage8 = await stageNotificationCenter(client, bffDb, breakLink);
    journey.stages.push(stage8);

    const stage9 = await stageBusinessTimezone(
      client,
      bffDb,
      schedulingDb,
      stage1.tenantId,
      breakLink,
    );
    journey.stages.push(stage9);

    const stage10 = await stageRetention(
      client,
      aiDb,
      bffRuntime,
      stage6.conversationId,
      breakLink,
    );
    journey.stages.push(stage10);

    // O retrato do negócio inteiro de pé, lido das três bases, ANTES da
    // exclusão: depois da etapa 11 não sobra o que ler.
    journey.composed = await readComposition(bffDb, schedulingDb, aiDb);

    const stage11 = await stageAccountDeletion(
      client,
      bffDb,
      schedulingDb,
      aiDb,
      bffRuntime,
      stage1,
      breakLink,
    );
    journey.stages.push(stage11);
  } finally {
    await bffDb.end().catch(() => {});
    await schedulingDb.end().catch(() => {});
    await aiDb.end().catch(() => {});
    await bffApp.close();
    await aiApp.close();
    await schedulingApp.close();
  }

  process.stdout.write(
    `${JOURNEY_RESULT_MARKER}${JSON.stringify(journey)}\n`,
  );
}

/**
 * Etapa 1 — cadastro e sessão pelo caminho de produção.
 *
 * `POST /v1/auth/register` por HTTP real. A sessão que sai daqui é a única
 * usada em todo o resto do percurso; as duas recusas de CSRF exercitadas em
 * seguida provam que ela vale porque a barreira está de pé, não porque foi
 * contornada.
 */
async function stageAccountAndSession(client, bffDb, legalVersions) {
  const registered = await client.request("POST", "/v1/auth/register", {
    body: {
      email: JOURNEY.email,
      password: ACCOUNT_PASSWORD,
      confirmPassword: ACCOUNT_PASSWORD,
      termsAccepted: true,
      termsVersion: legalVersions.termsVersion,
      privacyPolicyVersion: legalVersions.privacyPolicyVersion,
    },
  });
  step(
    registered.status === 201,
    `stage 1: POST /v1/auth/register answered ${registered.status}, expected 201`,
  );
  const userId = registered.payload?.data?.user?.id ?? null;
  const tenantId = registered.payload?.data?.tenant?.id ?? null;
  step(
    Boolean(userId) && Boolean(tenantId),
    "stage 1: register did not return a user id and a tenant id",
  );

  // Origem fora da allowlist: recusada antes de qualquer efeito. O endereço
  // nunca é contactado — ele só viaja como valor do header `Origin`.
  const foreignOrigin = await client.request("PATCH", "/v1/onboarding", {
    body: { ai: { tone: "CASUAL" } },
    origin: "http://attacker.invalid",
  });
  // Cookie válido, token de CSRF ausente: também recusada.
  const missingCsrf = await client.request("PATCH", "/v1/onboarding", {
    body: { ai: { tone: "CASUAL" } },
    omitCsrf: true,
  });

  const session = await client.request("GET", "/v1/auth/session");

  // Sequencial de propósito: uma conexão `pg` executa uma consulta por vez.
  const users = await bffDb.query(
    `SELECT "id", "email", "passwordHash" <> '' AS "hasPasswordHash" FROM "User"`,
  );
  const tenants = await bffDb.query(`SELECT "id" FROM "Tenant"`);
  const members = await bffDb.query(
    `SELECT "tenantId", "userId", "role" FROM "TenantMember"`,
  );
  const profiles = await bffDb.query(
    `SELECT "tenantId", "timezone", "onboardingCompletedAt" IS NULL AS "notCompleted"
       FROM "BusinessProfile"`,
  );
  const legal = await bffDb.query(
    `SELECT "userId", "termsVersion", "privacyPolicyVersion" FROM "LegalAcceptance"`,
  );
  const sessions = await bffDb.query(
    `SELECT "userId", "csrfTokenHash" <> '' AS "hasCsrfHash", "revokedAt" IS NULL AS "active"
       FROM "UserSession"`,
  );

  return {
    stage: 1,
    name: "cadastro e sessão pelo caminho de produção",
    userId,
    tenantId,
    counts: {
      users: users.rows.length,
      tenants: tenants.rows.length,
      memberships: members.rows.length,
      legalAcceptances: legal.rows.length,
      liveSessions: sessions.rows.filter((row) => row.active).length,
      refusedMutations: 2,
    },
    http: {
      registerStatus: registered.status,
      sessionStatus: session.status,
      sessionUserId: session.payload?.data?.user?.id ?? null,
      foreignOriginStatus: foreignOrigin.status,
      foreignOriginCode: foreignOrigin.payload?.error?.code ?? null,
      missingCsrfStatus: missingCsrf.status,
      missingCsrfCode: missingCsrf.payload?.error?.code ?? null,
      sessionCookieReceived: client.hasSessionCookie(),
      csrfCookieReceived: client.hasCsrfCookie(),
      csrfHeaderReceived: client.hasCsrfToken(),
      csrfChannelsAgree: client.csrfChannelsAgree(),
    },
    database: {
      service: "bff",
      users: users.rows,
      tenants: tenants.rows.length,
      members: members.rows,
      profiles: profiles.rows,
      legalAcceptances: legal.rows,
      sessions: sessions.rows,
    },
  };
}

/**
 * Etapa 2 — onboarding nos quatro blocos, com a recusa por mínimo faltando
 * exercitada **antes** de completar.
 *
 * Um bloco por `PATCH /v1/onboarding` (negócio, agenda escolhida, operação da
 * agenda, estilo da IA) e, depois de cada um dos três primeiros, uma tentativa
 * real de `POST /v1/onboarding/complete`. As três precisam ser recusadas com
 * `409` e uma lista de pendências que encolhe — e nenhuma delas pode deixar
 * marca no banco.
 */
async function stageOnboarding(client, bffDb, schedulingDb, tenantId, breakLink) {
  const blocks = [];
  const refusals = [];

  const business = await client.request("PATCH", "/v1/onboarding", {
    body: {
      business: {
        name: JOURNEY.businessName,
        category: JOURNEY.businessCategory,
        timezone: JOURNEY.timezone,
        modalities: [...JOURNEY.modalities],
        address: JOURNEY.address,
      },
    },
  });
  step(
    business.status === 200,
    `stage 2: the business block answered ${business.status}, expected 200`,
  );
  blocks.push({ block: "business", status: business.status });
  refusals.push(await attemptComplete(client));

  const calendar = await client.request("PATCH", "/v1/onboarding", {
    body: { calendar: { source: "ATENDLY" } },
  });
  step(
    calendar.status === 200,
    `stage 2: the calendar block answered ${calendar.status}, expected 200`,
  );
  blocks.push({ block: "calendar", status: calendar.status });
  refusals.push(await attemptComplete(client));

  const operation = await client.request("PATCH", "/v1/onboarding", {
    body: {
      service: { ...JOURNEY.onboardingService },
      availability: {
        rules: JOURNEY.availabilityDays.map((dayOfWeek) => ({
          dayOfWeek,
          startTime: JOURNEY.availabilityStartTime,
          endTime: JOURNEY.availabilityEndTime,
          active: true,
        })),
      },
    },
  });
  step(
    operation.status === 200,
    `stage 2: the calendar operation block answered ${operation.status}, expected 200`,
  );
  blocks.push({ block: "operation", status: operation.status });
  refusals.push(await attemptComplete(client));

  // Estado do banco DEPOIS das três recusas e ANTES de completar: nenhuma
  // recusa pode ter gravado a conclusão.
  const duringRefusals = await bffDb.query(
    `SELECT "onboardingCompletedAt" IS NULL AS "notCompleted"
       FROM "BusinessProfile" WHERE "tenantId" = $1`,
    [tenantId],
  );

  if (breakLink !== "onboarding-ai-block") {
    const ai = await client.request("PATCH", "/v1/onboarding", {
      body: { ai: { tone: JOURNEY.tone } },
    });
    step(
      ai.status === 200,
      `stage 2: the AI style block answered ${ai.status}, expected 200`,
    );
    blocks.push({ block: "ai", status: ai.status });
  }

  const completed = await client.request("POST", "/v1/onboarding/complete");
  const pending = issuesOf(completed.payload);
  step(
    completed.status === 200,
    `stage 2: POST /v1/onboarding/complete answered ${completed.status}, expected 200` +
      (pending ? ` (issues: ${pending.join(", ")})` : ""),
  );

  // `modalities` é um array de enum próprio: sem o cast para `text[]` o driver
  // devolve o literal cru do PostgreSQL (`{ON_SITE}`) em vez de uma lista.
  const profiles = await bffDb.query(
    `SELECT "businessName", "category", "timezone", "modalities"::text[] AS "modalities",
            "address", "onboardingCompletedAt" IS NOT NULL AS "completed"
       FROM "BusinessProfile" WHERE "tenantId" = $1`,
    [tenantId],
  );
  const calendarSettings = await schedulingDb.query(
    `SELECT "source"::text AS "source", "timezone"
       FROM "CalendarSettings" WHERE "tenantId" = $1`,
    [tenantId],
  );
  const rules = await schedulingDb.query(
    `SELECT "dayOfWeek", "active" FROM "AvailabilityRule"
      WHERE "tenantId" = $1 ORDER BY "dayOfWeek"`,
    [tenantId],
  );
  const services = await schedulingDb.query(
    `SELECT "name", "active", "needsReview" FROM "Service"
      WHERE "tenantId" = $1 ORDER BY "name"`,
    [tenantId],
  );

  return {
    stage: 2,
    name: "onboarding nos quatro blocos, com recusa por mínimo faltando",
    counts: {
      blocks: blocks.length,
      refusedCompletions: refusals.length,
      availabilityRules: rules.rows.length,
      services: services.rows.length,
    },
    http: {
      blocks,
      refusals,
      completeStatus: completed.status,
      completed: completed.payload?.data?.completed ?? null,
    },
    database: {
      service: "bff + scheduling",
      notCompletedDuringRefusals: duringRefusals.rows[0]?.notCompleted ?? null,
      profile: profiles.rows[0] ?? null,
      calendarSettings: calendarSettings.rows[0] ?? null,
      availabilityRules: rules.rows,
      services: services.rows,
    },
  };
}

async function attemptComplete(client) {
  const response = await client.request("POST", "/v1/onboarding/complete");
  return { status: response.status, issues: issuesOf(response.payload) };
}

/**
 * Etapa 3 — catálogo com serviço operacional.
 *
 * `POST /v1/services` cria o serviço que o agendamento da etapa 5 usa.
 * Operacional aqui tem definição fechada (Goal007): `active` e sem pendência
 * de revisão, o que só acontece com duração conhecida.
 */
async function stageCatalog(client, schedulingDb, breakLink) {
  const created = await client.request("POST", "/v1/services", {
    body: {
      ...JOURNEY.catalogService,
      active: breakLink !== "catalog-active-service",
    },
  });
  step(
    created.status === 201,
    `stage 3: POST /v1/services answered ${created.status}, expected 201`,
  );
  const catalogServiceId = created.payload?.data?.id ?? null;
  step(
    Boolean(catalogServiceId),
    "stage 3: POST /v1/services did not return a service id",
  );

  const listed = await client.request("GET", "/v1/services");
  step(
    listed.status === 200,
    `stage 3: GET /v1/services answered ${listed.status}, expected 200`,
  );
  const items = listed.payload?.data?.items ?? [];

  const rows = await schedulingDb.query(
    `SELECT "id", "name", "active", "needsReview", "durationMinutes",
            "priceType"::text AS "priceType", "price"::text AS "price",
            "colorToken"::text AS "colorToken"
       FROM "Service" WHERE "id" = $1`,
    [catalogServiceId],
  );

  return {
    stage: 3,
    name: "catálogo com serviço operacional",
    catalogServiceId,
    counts: {
      listed: items.length,
      operational: items.filter((item) => item.active && !item.needsReview)
        .length,
      persisted: rows.rows.length,
    },
    http: {
      createStatus: created.status,
      listStatus: listed.status,
      listedCount: items.length,
      listedOperational: items.filter((item) => item.active && !item.needsReview)
        .length,
    },
    database: { service: "scheduling", row: rows.rows[0] ?? null },
  };
}

/**
 * Etapa 4 — cliente cadastrado como pessoa, com responsável e proveniência.
 *
 * Duas pessoas pelo caminho público: a responsável (nome e telefone) e a
 * atendida (só nome — o produto aceita cliente que é só um nome, e o telefone
 * é contato, não identidade). A relação nasce `PROPOSED` e só vira `CONFIRMED`
 * por confirmação explícita, e a proveniência é derivada da sessão, nunca do
 * corpo da requisição.
 */
async function stageCustomer(client, schedulingDb, userId, breakLink) {
  const guardian = await client.request("POST", "/v1/customers", {
    body: { ...JOURNEY.guardian },
  });
  step(
    guardian.status === 201,
    `stage 4: creating the guardian answered ${guardian.status}, expected 201`,
  );
  const guardianId = guardian.payload?.data?.id ?? null;

  const person = await client.request("POST", "/v1/customers", {
    body: { ...JOURNEY.person },
  });
  step(
    person.status === 201,
    `stage 4: creating the person answered ${person.status}, expected 201`,
  );
  const personId = person.payload?.data?.id ?? null;
  step(
    Boolean(guardianId) && Boolean(personId),
    "stage 4: customer creation did not return both ids",
  );

  const proposed = await client.request(
    "PUT",
    `/v1/customers/${personId}/primary-guardian`,
    {
      // `proposedBy` é a decisão de quem chamou; o ator (`proposedByActor`)
      // nunca vem do corpo — o BFF o deriva da sessão autenticada.
      body: { guardianCustomerId: guardianId, proposedBy: "PROFESSIONAL" },
    },
  );
  step(
    proposed.status === 200,
    `stage 4: proposing the guardian answered ${proposed.status}, expected 200`,
  );

  const afterProposal = await schedulingDb.query(
    `SELECT "status"::text AS "status" FROM "CustomerRelation" WHERE "customerId" = $1`,
    [personId],
  );

  let confirmed = null;
  if (breakLink !== "customer-guardian-confirmation") {
    confirmed = await client.request(
      "POST",
      `/v1/customers/${personId}/primary-guardian/confirm`,
      { body: { confirmedBy: "PROFESSIONAL" } },
    );
    step(
      confirmed.status === 200,
      `stage 4: confirming the guardian answered ${confirmed.status}, expected 200`,
    );
  }

  const read = await client.request("GET", `/v1/customers/${personId}`);
  step(
    read.status === 200,
    `stage 4: GET /v1/customers/:id answered ${read.status}, expected 200`,
  );

  const customers = await schedulingDb.query(
    `SELECT "id", "name", "phone" FROM "Customer"
      WHERE "id" = ANY($1::text[]) ORDER BY "name"`,
    [[guardianId, personId]],
  );
  const relations = await schedulingDb.query(
    `SELECT "customerId", "relatedCustomerId", "type"::text AS "type",
            "status"::text AS "status", "proposedBy"::text AS "proposedBy",
            "proposedByActor", "confirmedBy"::text AS "confirmedBy", "confirmedByActor"
       FROM "CustomerRelation" WHERE "customerId" = $1`,
    [personId],
  );

  return {
    stage: 4,
    name: "cliente pessoa, com responsável e proveniência",
    guardianId,
    personId,
    expectedActor: userId,
    counts: {
      people: customers.rows.length,
      relations: relations.rows.length,
    },
    http: {
      guardianStatus: guardian.status,
      personStatus: person.status,
      proposeStatus: proposed.status,
      proposedRelationStatus: proposed.payload?.data?.status ?? null,
      confirmStatus: confirmed?.status ?? null,
      readStatus: read.status,
      readPrimaryGuardianId:
        read.payload?.data?.primaryGuardian?.guardian?.id ?? null,
      readPrimaryGuardianStatus:
        read.payload?.data?.primaryGuardian?.status ?? null,
    },
    database: {
      service: "scheduling",
      statusRightAfterProposal: afterProposal.rows[0]?.status ?? null,
      customers: customers.rows,
      relation: relations.rows[0] ?? null,
    },
  };
}

/**
 * Etapa 5 — agendamento confirmado, com a ocupação refletida na leitura da
 * agenda.
 *
 * O horário não é escolhido por este arquivo: ele sai de
 * `GET /v1/availability`, que é a mesma oferta que a interface mostra. Depois
 * da confirmação, a mesma leitura é refeita — e o horário tomado precisa ter
 * sumido dela. Essa é a ocupação; a resposta `201` sozinha não prova nada.
 */
async function stageAppointment(
  client,
  schedulingDb,
  userId,
  serviceId,
  customerId,
) {
  const today = localIsoDate(new Date(), JOURNEY.timezone);
  const date = firstBookableDate(today, JOURNEY.appointmentLeadDays, [
    ...JOURNEY.availabilityDays,
  ]);
  const availabilityRoute =
    `/v1/availability?serviceIds=${encodeURIComponent(serviceId)}` +
    `&startDate=${date}&days=1&maxSlots=100`;

  const before = await client.request("GET", availabilityRoute);
  step(
    before.status === 200,
    `stage 5: GET /v1/availability answered ${before.status}, expected 200`,
  );
  const offered = before.payload?.data ?? [];
  step(
    Array.isArray(offered) && offered.length > 0,
    `stage 5: the agenda offered no slot on ${date}; the journey has nothing to book`,
  );
  const slot = offered[0];

  const created = await client.request("POST", "/v1/appointments", {
    body: {
      serviceIds: [serviceId],
      date: slot.date,
      startTime: slot.startTime,
      customerId,
      comments: "Agendado pelo percurso do Goal030.",
    },
    idempotencyKey: `goal030-journey-appointment-${slot.date}-${slot.startTime}`,
  });
  step(
    created.status === 201,
    `stage 5: POST /v1/appointments answered ${created.status}, expected 201`,
  );
  const appointmentId = created.payload?.data?.id ?? null;
  step(
    Boolean(appointmentId),
    "stage 5: POST /v1/appointments did not return an appointment id",
  );

  const listed = await client.request(
    "GET",
    `/v1/appointments?startDate=${slot.date}&endDate=${slot.date}`,
  );
  step(
    listed.status === 200,
    `stage 5: GET /v1/appointments answered ${listed.status}, expected 200`,
  );

  const after = await client.request("GET", availabilityRoute);
  step(
    after.status === 200,
    `stage 5: the second GET /v1/availability answered ${after.status}, expected 200`,
  );
  const remaining = after.payload?.data ?? [];

  const appointments = await schedulingDb.query(
    `SELECT "id", "customerId", "status", "source"::text AS "source", "createdBy",
            "startAt"::text AS "startAt", "endAt"::text AS "endAt"
       FROM "Appointment" WHERE "id" = $1`,
    [appointmentId],
  );
  const items = await schedulingDb.query(
    `SELECT "serviceId", "serviceNameSnapshot", "durationMinutesSnapshot",
            "priceTypeSnapshot"::text AS "priceTypeSnapshot",
            "priceSnapshot"::text AS "priceSnapshot"
       FROM "AppointmentItem" WHERE "appointmentId" = $1`,
    [appointmentId],
  );

  const listedItems = listed.payload?.data ?? [];
  return {
    stage: 5,
    name: "agendamento confirmado, com ocupação refletida na agenda",
    appointmentId,
    personId: customerId,
    serviceId,
    expectedActor: userId,
    bookedSlot: slot,
    counts: {
      offeredBefore: offered.length,
      offeredAfter: remaining.length,
      appointments: appointments.rows.length,
      items: items.rows.length,
    },
    http: {
      availabilityBeforeStatus: before.status,
      offeredBefore: offered.length,
      createStatus: created.status,
      createdStatus: created.payload?.data?.status ?? null,
      listStatus: listed.status,
      listedAppointmentIds: listedItems.map((item) => item.id),
      availabilityAfterStatus: after.status,
      offeredAfter: remaining.length,
      slotStillOffered: remaining.some(
        (candidate) =>
          candidate.date === slot.date && candidate.startTime === slot.startTime,
      ),
      // A ocupação não é "uma oferta a menos": um atendimento de sessenta
      // minutos numa grade de trinta apaga toda oferta que o atravesse. O que
      // precisa valer é que NENHUMA oferta remanescente cruze o horário
      // tomado. Horas são `HH:MM` com zero à esquerda, então comparar texto é
      // comparar instante.
      remainingOverlappingBooked: remaining.filter(
        (candidate) =>
          candidate.date === slot.date &&
          candidate.startTime < slot.endTime &&
          candidate.endTime > slot.startTime,
      ).length,
    },
    database: {
      service: "scheduling",
      appointment: appointments.rows[0] ?? null,
      items: items.rows,
    },
  };
}

/**
 * Corpo do webhook do Evolution Go, no formato que o adaptador de produção
 * mapeia. É entrada externa — mensagem chegando —, e por isso o ensaio a
 * fabrica; tudo o que acontece depois dela é código do produto.
 */
function inboundWebhookPayload() {
  const { contact } = JOURNEY;
  return {
    event: "Message",
    instanceId: contact.instanceId,
    data: {
      Info: {
        ID: contact.messageId,
        Chat: `${contact.phone}@s.whatsapp.net`,
        Sender: `${contact.phone}@s.whatsapp.net`,
        PushName: contact.name,
        Type: "text",
      },
      Message: { conversation: contact.text },
    },
  };
}

/**
 * Etapa 6 — mensagem do contato pelo transporte durável, na conversa, com
 * categoria/privacidade e controle humano.
 *
 * O caminho é o de produção de ponta a ponta, menos a fronteira: o webhook é
 * recebido por HTTP real pela IA real, que **persiste antes de responder**
 * `202` (é isso que "durável" quer dizer aqui, e é o que a leitura de
 * `ProcessedEvent` prova); o lote é reivindicado pela inbox real, com lease
 * real; a mensagem é mapeada pelo adaptador real e gravada na conversa pelo
 * `AssistantService` real; e o evento é fechado pela mesma loja que o
 * reivindicou.
 *
 * Depois disso o percurso volta ao contrato público: a conversa aparece em
 * `GET /v1/conversations`, recebe categoria por `PUT .../category` — que é a
 * decisão de privacidade do produto e a que governa a purga da etapa 10 — e
 * passa ao controle humano por `POST .../takeover`.
 *
 * Limite declarado: a resposta automática (grafo, modelo e envio) não é
 * exercitada, e esta etapa não afirma nada sobre ela.
 */
async function stageConversation(client, aiDb, ai, tenant, breakLink) {
  // Vínculo do canal: cliente interno real do BFF contra a rota interna real
  // da IA. A instância remota não existe — a fronteira do WhatsApp é dublê
  // declarado, e a credencial é sintética.
  await ai.channelClient.provisionEvolutionChannel(
    {
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      requestId: "goal030-journey-channel",
    },
    {
      externalInstanceId: JOURNEY.contact.instanceId,
      displayName: JOURNEY.businessName,
      instanceCredential: INSTANCE_CREDENTIAL,
    },
  );

  const webhook = await fetch(
    new URL(
      `/webhooks/evolution?token=${encodeURIComponent(WEBHOOK_TOKEN)}`,
      ai.address,
    ),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(inboundWebhookPayload()),
    },
  );
  step(
    webhook.status === 202,
    `stage 6: POST /webhooks/evolution answered ${webhook.status}, expected 202`,
  );

  // Gravado ANTES do ACK: a linha já tem de estar aqui.
  const stored = await aiDb.query(
    `SELECT "id", "status"::text AS "status", "eventType",
            "conversationKey" IS NOT NULL AS "hasConversationKey"
       FROM "ProcessedEvent"`,
  );

  // Reivindicação pela inbox real. A janela de conversa adia o evento de
  // propósito — fragmento (8 s) e primeiro contato ambíguo (até 2 min) —,
  // então o claim é feito com o relógio cinco minutos à frente em vez de o
  // ensaio dormir esperando. O relógio é entrada externa; a loja, o lease, o
  // agrupamento e o fechamento são os de produção.
  const claim = await ai.inbox.claimNext({
    owner: "goal030-journey",
    leaseMs: 120_000,
    groupWindowMs: 60_000,
    batchLimit: 10,
    now: new Date(Date.now() + 5 * 60 * 1_000),
  });
  step(
    claim !== null && claim.events.length > 0,
    "stage 6: the durable inbox handed no batch over; the contact message was never claimable",
  );

  const delivered = [];
  for (const event of claim.events) {
    const mapped = ai.mapEvolutionInbound(event.rawPayload);
    step(
      mapped !== null,
      "stage 6: a stored inbound event no longer maps to a message",
    );
    const context = await ai.channelConnections.resolveEvolutionInboundContext({
      message: mapped,
      requestId: "goal030-journey-dispatch",
    });
    // A ordem é a do caminho de produção, e ela importa: conversa, depois
    // sessão, depois mensagem. A sessão é o que governa categoria, privacidade
    // e — na etapa 10 — prazo de retenção; gravar a mensagem antes de abrir a
    // sessão deixaria conteúdo sem janela que o governe.
    const resolvedConversationId = await ai.runtime.resolveConversationId(
      context.message,
    );
    await ai.sessions.resolveContext({
      tenantId: context.message.tenantId,
      channelId: context.message.channelId,
      conversationId: resolvedConversationId,
      externalContactId: context.message.customerPhone,
      customerName: context.message.customerName,
    });
    // Persistência na conversa pelo dono do dado. O provedor de modelo dublê
    // não é chamado neste caminho — e se fosse, lançaria.
    delivered.push(
      await ai.assistant.recordInboundText({
        phone: context.message.customerPhone,
        text: context.message.text,
        channelMessage: context.message,
        customerName: context.message.customerName,
      }),
    );
  }
  const completed = await ai.inbox.complete({
    ids: claim.events.map((event) => event.id),
    leaseToken: claim.leaseToken,
    status: "DONE",
    result: { kind: "message", size: claim.events.length },
  });

  const conversationId = delivered[0]?.conversationId ?? null;
  step(
    Boolean(conversationId),
    "stage 6: the inbound message was not recorded into any conversation",
  );

  const listed = await client.request("GET", "/v1/conversations");
  step(
    listed.status === 200,
    `stage 6: GET /v1/conversations answered ${listed.status}, expected 200`,
  );
  const conversations = listed.payload?.data ?? [];

  const messages = await client.request(
    "GET",
    `/v1/conversations/${conversationId}/messages`,
  );
  step(
    messages.status === 200,
    `stage 6: GET /v1/conversations/:id/messages answered ${messages.status}, expected 200`,
  );

  let categorised = null;
  if (breakLink !== "conversation-category") {
    categorised = await client.request(
      "PUT",
      `/v1/conversations/${conversationId}/category`,
      { body: { category: "COMMERCIAL" } },
    );
    step(
      categorised.status === 200,
      `stage 6: PUT /v1/conversations/:id/category answered ${categorised.status}, expected 200`,
    );
  }

  const takenOver = await client.request(
    "POST",
    `/v1/conversations/${conversationId}/takeover`,
  );
  step(
    takenOver.status === 200,
    `stage 6: POST /v1/conversations/:id/takeover answered ${takenOver.status}, expected 200`,
  );

  const conversationRows = await aiDb.query(
    `SELECT "id", "status"::text AS "status", "humanHandoff",
            "externalContactId", "customerName"
       FROM "Conversation" WHERE "id" = $1`,
    [conversationId],
  );
  const messageRows = await aiDb.query(
    `SELECT "direction"::text AS "direction", "source"::text AS "source",
            "body", "externalMessageId"
       FROM "Message" WHERE "conversationId" = $1`,
    [conversationId],
  );
  const sessionRows = await aiDb.query(
    `SELECT "category"::text AS "category", "categorySource"::text AS "categorySource",
            "humanHandling", "humanHandlingSource"::text AS "humanHandlingSource"
       FROM "ConversationSession" WHERE "conversationId" = $1`,
    [conversationId],
  );
  const eventRows = await aiDb.query(
    `SELECT "status"::text AS "status", "completedAt" IS NOT NULL AS "completed"
       FROM "ProcessedEvent"`,
  );

  const listedConversation =
    conversations.find((entry) => entry.id === conversationId) ?? null;
  const inboundBodies = (messages.payload?.data ?? [])
    .filter((message) => message.direction === "INBOUND")
    .map((message) => message.body);

  return {
    stage: 6,
    name: "mensagem do contato pelo transporte durável, com categoria e controle humano",
    conversationId,
    counts: {
      inboundEventsStored: stored.rows.length,
      eventsClaimed: claim.events.length,
      eventsCompleted: completed,
      conversationsListed: conversations.length,
      messagesPersisted: messageRows.rows.length,
    },
    http: {
      webhookStatus: webhook.status,
      listStatus: listed.status,
      listedConversations: conversations.length,
      listedCategory: listedConversation?.category ?? null,
      listedStatus: listedConversation?.status ?? null,
      listedHandling: listedConversation?.handling ?? null,
      messagesStatus: messages.status,
      inboundBodies,
      categoryStatus: categorised?.status ?? null,
      takeoverStatus: takenOver.status,
    },
    database: {
      service: "ai",
      storedBeforeAck: stored.rows,
      event: eventRows.rows[0] ?? null,
      conversation: conversationRows.rows[0] ?? null,
      messages: messageRows.rows,
      session: sessionRows.rows[0] ?? null,
    },
  };
}

/**
 * Etapa 7 — lembrete programado conforme a regra vigente do negócio.
 *
 * A regra é declarada pelo contrato público (`PATCH /v1/settings/reminders`) e
 * quem a aplica é o dono da agenda, dentro da transação que cria o
 * atendimento. Por isso a prova não é "a rota respondeu 200": é a linha de
 * `AppointmentNotificationIntent` no banco do Scheduling, com a antecedência
 * medida contra o próprio `Appointment.startAt`. Um lembrete programado para
 * a hora errada é um lembrete errado, e só o banco diz a hora.
 */
async function stageReminder(
  client,
  schedulingDb,
  serviceId,
  customerId,
  breakLink,
) {
  const before = await client.request("GET", "/v1/settings/reminders");
  step(
    before.status === 200,
    `stage 7: GET /v1/settings/reminders answered ${before.status}, expected 200`,
  );

  // A quebra declarada é a regra vazia, que é escolha legítima do produto
  // (desligar lembrete) — e é exatamente por ser legítima que ela serve de
  // controle: o percurso segue, e a etapa cai por falta do efeito.
  const rules =
    breakLink === "reminder-rule"
      ? []
      : [{ slot: "FIRST", leadMinutes: JOURNEY.reminderLeadMinutes }];
  const declared = await client.request("PATCH", "/v1/settings/reminders", {
    body: { confirmationEnabled: true, pricePolicy: "WHEN_FIXED", rules },
  });
  step(
    declared.status === 200,
    `stage 7: PATCH /v1/settings/reminders answered ${declared.status}, expected 200`,
  );

  // O segundo atendimento do percurso, já sob a regra recém-declarada. Ele
  // nasce do mesmo cliente e do mesmo serviço: o que muda é a regra vigente.
  const today = localIsoDate(new Date(), JOURNEY.timezone);
  const date = firstBookableDate(
    today,
    JOURNEY.reminderAppointmentLeadDays,
    [...JOURNEY.availabilityDays],
  );
  const availabilityRoute =
    `/v1/availability?serviceIds=${encodeURIComponent(serviceId)}` +
    `&startDate=${date}&days=1&maxSlots=100`;
  const offered = await client.request("GET", availabilityRoute);
  step(
    offered.status === 200,
    `stage 7: GET /v1/availability answered ${offered.status}, expected 200`,
  );
  const slots = offered.payload?.data ?? [];
  step(
    slots.length > 0,
    `stage 7: the agenda offered no slot on ${date}; there is nothing to remind about`,
  );
  const slot = slots[0];

  const created = await client.request("POST", "/v1/appointments", {
    body: {
      serviceIds: [serviceId],
      date: slot.date,
      startTime: slot.startTime,
      customerId,
      comments: "Agendado pelo percurso do Goal030, sob a regra de lembrete.",
    },
    idempotencyKey: `goal030-journey-reminder-${slot.date}-${slot.startTime}`,
  });
  step(
    created.status === 201,
    `stage 7: POST /v1/appointments answered ${created.status}, expected 201`,
  );
  const appointmentId = created.payload?.data?.id ?? null;
  step(
    Boolean(appointmentId),
    "stage 7: POST /v1/appointments did not return an appointment id",
  );

  const settings = await schedulingDb.query(
    `SELECT "confirmationEnabled", "pricePolicy"::text AS "pricePolicy" FROM "ReminderSettings"`,
  );
  const persistedRules = await schedulingDb.query(
    `SELECT "slot"::text AS "slot", "leadMinutes" FROM "ReminderRule" ORDER BY "slot"`,
  );
  // A antecedência sai do próprio banco, comparando a intenção com o começo do
  // atendimento: nada é recalculado aqui a partir do que a rota respondeu.
  const intents = await schedulingDb.query(
    `SELECT i."kind"::text AS "kind", i."slot"::text AS "slot", i."state"::text AS "state",
            (EXTRACT(EPOCH FROM (a."startAt" - i."dueAt")) / 60)::int AS "leadMinutes",
            i."facts" IS NULL AS "withoutFacts"
       FROM "AppointmentNotificationIntent" i
       JOIN "Appointment" a ON a."id" = i."appointmentId"
      WHERE i."appointmentId" = $1
      ORDER BY i."dueAt"`,
    [appointmentId],
  );

  return {
    stage: 7,
    name: "lembrete programado pela regra vigente do negócio",
    appointmentId,
    declaredLeadMinutes: rules[0]?.leadMinutes ?? null,
    counts: {
      declaredRules: rules.length,
      persistedRules: persistedRules.rows.length,
      scheduledIntents: intents.rows.length,
    },
    http: {
      readStatus: before.status,
      declareStatus: declared.status,
      availabilityStatus: offered.status,
      createStatus: created.status,
      offered: slots.length,
    },
    database: {
      service: "scheduling",
      settings: settings.rows[0] ?? null,
      rules: persistedRules.rows,
      intents: intents.rows,
    },
  };
}

/**
 * Etapa 8 — notificação persistida na central, com nível e leitura.
 *
 * A condição materializada é `WHATSAPP_DISCONNECTED`, e ela é **verdadeira**
 * neste percurso: o negócio realmente não tem canal conectado, porque a
 * fronteira do WhatsApp é dublê declarado e nenhum vínculo foi criado no BFF.
 * A central não recebe nada pronto — quem a materializa é o motor de
 * reconciliação dentro de `GET /v1/status`, e o nível (`CRITICAL`) vem da
 * tabela de espécies, nunca de quem escreve.
 *
 * Leitura é mutação de verdade: `POST /v1/notifications/read` precisa deixar
 * `readAt` gravado, e é isso que a leitura direta confere.
 */
async function stageNotificationCenter(client, bffDb, breakLink) {
  const status = await client.request("GET", "/v1/status");
  step(
    status.status === 200,
    `stage 8: GET /v1/status answered ${status.status}, expected 200`,
  );

  const listed = await client.request("GET", "/v1/notifications");
  step(
    listed.status === 200,
    `stage 8: GET /v1/notifications answered ${listed.status}, expected 200`,
  );
  const items = listed.payload?.data?.items ?? [];
  const condition =
    items.find((item) => item.kind === "WHATSAPP_DISCONNECTED") ?? null;
  step(
    condition !== null,
    "stage 8: the channel condition was not materialised into the notification centre",
  );

  const summaryBefore = await client.request("GET", "/v1/notifications/summary");
  step(
    summaryBefore.status === 200,
    `stage 8: GET /v1/notifications/summary answered ${summaryBefore.status}, expected 200`,
  );

  let read = null;
  if (breakLink !== "notification-read") {
    read = await client.request("POST", "/v1/notifications/read", {
      body: { id: condition.id },
    });
    step(
      read.status === 200,
      `stage 8: POST /v1/notifications/read answered ${read.status}, expected 200`,
    );
  }

  const summaryAfter = await client.request("GET", "/v1/notifications/summary");
  step(
    summaryAfter.status === 200,
    `stage 8: the second GET /v1/notifications/summary answered ${summaryAfter.status}, expected 200`,
  );

  const rows = await bffDb.query(
    `SELECT "kind"::text AS "kind", "level"::text AS "level", "shape"::text AS "shape",
            "readAt" IS NOT NULL AS "read", "resolvedAt" IS NULL AS "open",
            "dedupeKey"
       FROM "TenantNotification" ORDER BY "kind"`,
  );

  return {
    stage: 8,
    name: "notificação persistida na central, com nível e leitura",
    notificationId: condition.id,
    counts: {
      listed: items.length,
      unreadBefore: summaryBefore.payload?.data?.unreadCount ?? null,
      unreadAfter: summaryAfter.payload?.data?.unreadCount ?? null,
      updatedByRead: read?.payload?.data?.updated ?? null,
      persisted: rows.rows.length,
    },
    http: {
      statusStatus: status.status,
      listStatus: listed.status,
      listedKind: condition.kind,
      listedLevel: condition.level,
      listedShape: condition.shape,
      readStatus: read?.status ?? null,
      criticalBefore: summaryBefore.payload?.data?.byLevel?.CRITICAL ?? null,
      criticalAfter: summaryAfter.payload?.data?.byLevel?.CRITICAL ?? null,
      openConditionsAfter:
        summaryAfter.payload?.data?.openConditionsCount ?? null,
    },
    database: {
      service: "bff",
      notifications: rows.rows,
    },
  };
}

/**
 * Etapa 9 — alteração do fuso do negócio, que atravessa serviço.
 *
 * O dono do fuso é o BFF (`BusinessProfile.timezone`, D-010/D-045) e o
 * Scheduling guarda a réplica que a agenda usa. O percurso muda o fuso pelo
 * contrato público e confere as **duas** cópias no banco de cada dono, além
 * das duas rotas de leitura — que é o mecanismo do Goal029 sendo reusado, não
 * reimplementado: a reconciliação exercitada aqui é a mesma função de
 * produção que aquele ensaio prova em isolamento.
 */
async function stageBusinessTimezone(
  client,
  bffDb,
  schedulingDb,
  tenantId,
  breakLink,
) {
  const before = await client.request("GET", "/v1/settings");
  step(
    before.status === 200,
    `stage 9: GET /v1/settings answered ${before.status}, expected 200`,
  );

  // Quebrar o elo é regravar o mesmo fuso: a requisição continua válida e o
  // percurso segue — o que falta é a travessia, e é ela que a etapa prova.
  const timezone =
    breakLink === "business-timezone" ? JOURNEY.timezone : JOURNEY.newTimezone;
  // `modalities` e `address` ficam de fora de propósito: ausentes, preservam o
  // que o onboarding gravou, e a etapa muda uma coisa só.
  const patched = await client.request("PATCH", "/v1/settings/business", {
    body: {
      name: JOURNEY.businessName,
      category: JOURNEY.businessCategory,
      timezone,
    },
  });
  step(
    patched.status === 200,
    `stage 9: PATCH /v1/settings/business answered ${patched.status}, expected 200`,
  );

  const after = await client.request("GET", "/v1/settings");
  step(
    after.status === 200,
    `stage 9: the second GET /v1/settings answered ${after.status}, expected 200`,
  );
  const calendar = await client.request("GET", "/v1/calendar");
  step(
    calendar.status === 200,
    `stage 9: GET /v1/calendar answered ${calendar.status}, expected 200`,
  );

  const profile = await bffDb.query(
    `SELECT "timezone" FROM "BusinessProfile" WHERE "tenantId" = $1`,
    [tenantId],
  );
  const replica = await schedulingDb.query(
    `SELECT "timezone", "source"::text AS "source" FROM "CalendarSettings" WHERE "tenantId" = $1`,
    [tenantId],
  );

  return {
    stage: 9,
    name: "alteração do fuso do negócio atravessando serviço",
    expectedTimezone: timezone,
    previousTimezone: JOURNEY.timezone,
    counts: {
      ownerRows: profile.rows.length,
      replicaRows: replica.rows.length,
    },
    http: {
      patchStatus: patched.status,
      settingsBusinessTimezone: after.payload?.data?.business?.timezone ?? null,
      settingsCalendarTimezone: after.payload?.data?.calendar?.timezone ?? null,
      calendarTimezone: calendar.payload?.data?.timezone ?? null,
    },
    database: {
      service: "bff + scheduling",
      owner: profile.rows[0]?.timezone ?? null,
      replica: replica.rows[0]?.timezone ?? null,
      replicaSource: replica.rows[0]?.source ?? null,
    },
  };
}

/**
 * Etapa 10 — retenção declarada e purga de conteúdo aplicada.
 *
 * O prazo é decisão do negócio, declarada pelo contrato público; o que é
 * conteúdo é decisão do dono do dado, e quem apaga é a varredura do BFF
 * chamando a rota interna da IA. O laço de fundo fica desligado: quem decide
 * o instante é esta etapa, porque o relógio é a única entrada semeada aqui.
 *
 * O par prazo/relógio é escolhido para que a purga seja **consequência da
 * regra**, e não do relógio: com o prazo padrão e o mesmo instante, nada
 * venceria. É isso que o elo `retention-declaration` demonstra ao ser
 * quebrado.
 *
 * O que sobrevive à purga também é prova: a conversa continua lá, marcada até
 * onde expirou. Purga que apaga a conversa junto não é retenção de conteúdo.
 */
async function stageRetention(client, aiDb, bff, conversationId, breakLink) {
  const before = await client.request("GET", "/v1/settings/retention");
  step(
    before.status === 200,
    `stage 10: GET /v1/settings/retention answered ${before.status}, expected 200`,
  );

  let declared = null;
  if (breakLink !== "retention-declaration") {
    declared = await client.request("PATCH", "/v1/settings/retention", {
      body: {
        commercialRetentionDays: JOURNEY.retentionDays,
        personalRetentionDays: JOURNEY.retentionDays,
        // Reduzir prazo é decisão consciente e o contrato exige dizê-lo.
        confirmReduction: true,
      },
    });
    step(
      declared.status === 200,
      `stage 10: PATCH /v1/settings/retention answered ${declared.status}, expected 200`,
    );
  }

  const messagesBefore = await aiDb.query(
    `SELECT count(*)::int AS "total" FROM "Message" WHERE "conversationId" = $1`,
    [conversationId],
  );

  const sweepAt = new Date(
    Date.now() + JOURNEY.retentionSweepAheadDays * 86_400_000,
  );
  const summary = await bff.runRetentionSweep(
    bff.getPrisma(),
    bff.defaultRetentionPorts(bff.getPrisma()),
    {
      owner: "goal030-journey",
      leaseTtlSeconds: 60,
      tenantBatchLimit: 5,
      maxRowsPerStore: 500,
      minTenantIntervalSeconds: 0,
      // O relógio, e só ele, é semeado: `now` é o parâmetro que o próprio
      // código de produção expõe, e envelhecer linha no banco seria fabricar
      // o efeito em vez de exercitá-lo.
      now: sweepAt,
    },
  );

  const messagesAfter = await aiDb.query(
    `SELECT count(*)::int AS "total" FROM "Message" WHERE "conversationId" = $1`,
    [conversationId],
  );
  const conversation = await aiDb.query(
    `SELECT "id", "status"::text AS "status",
            "contentExpiredThrough" IS NOT NULL AS "contentExpired"
       FROM "Conversation" WHERE "id" = $1`,
    [conversationId],
  );
  const sessions = await aiDb.query(
    `SELECT count(*)::int AS "total" FROM "ConversationSession" WHERE "conversationId" = $1`,
    [conversationId],
  );
  const retention = await client.request("GET", "/v1/settings/retention");

  return {
    stage: 10,
    name: "retenção declarada e purga de conteúdo aplicada",
    counts: {
      messagesBefore: messagesBefore.rows[0]?.total ?? null,
      messagesAfter: messagesAfter.rows[0]?.total ?? null,
      sessionsSurviving: sessions.rows[0]?.total ?? null,
      sweptRows: summary.rows,
      tenantsClaimed: summary.tenantsClaimed,
    },
    http: {
      readStatus: before.status,
      declareStatus: declared?.status ?? null,
      declaredCommercialDays:
        declared?.payload?.data?.commercialRetentionDays ?? null,
      currentCommercialDays:
        retention.payload?.data?.commercialRetentionDays ?? null,
      currentPersonalDays: retention.payload?.data?.personalRetentionDays ?? null,
    },
    database: {
      service: "ai",
      conversation: conversation.rows[0] ?? null,
      sweep: {
        tenantsClaimed: summary.tenantsClaimed,
        rows: summary.rows,
        failed: summary.failed,
      },
    },
  };
}

/**
 * Etapa 11 — exclusão de conta e o ciclo recuperável até o fim.
 *
 * O ciclo inteiro, na ordem do produto: pedir (com reautenticação real),
 * conferir o prazo de arrependimento gravado, **voltar atrás** — é o que
 * "recuperável" quer dizer, e o elo quebrável é justamente esse —, pedir de
 * novo e, com o vencimento alcançado, purgar.
 *
 * O vencimento é antecipado por `UPDATE` na própria linha, e essa é a segunda
 * e última semeadura de relógio do ensaio: o prazo é constante de produto
 * (sete dias) e não existe parâmetro que o encurte. O que é exercitado depois
 * disso é a purga real, nas três lojas, na ordem que o produto declara.
 */
async function stageAccountDeletion(
  client,
  bffDb,
  schedulingDb,
  aiDb,
  bff,
  tenant,
  breakLink,
) {
  const started = await client.request("POST", "/v1/account/deletion", {
    body: { password: ACCOUNT_PASSWORD },
  });
  step(
    started.status === 200,
    `stage 11: POST /v1/account/deletion answered ${started.status}, expected 200`,
  );

  const scheduled = await bffDb.query(
    `SELECT "status"::text AS "status",
            (EXTRACT(EPOCH FROM ("dueAt" - "requestedAt")) / 86400)::int AS "graceDays",
            "purgedAt" IS NULL AS "notPurged"
       FROM "AccountDeletion" WHERE "tenantId" = $1`,
    [tenant.tenantId],
  );
  const statusDuring = await client.request("GET", "/v1/status");

  let cancelled = null;
  let cancelledRow = null;
  if (breakLink !== "account-deletion-cancel") {
    cancelled = await client.request("DELETE", "/v1/account/deletion");
    step(
      cancelled.status === 200,
      `stage 11: DELETE /v1/account/deletion answered ${cancelled.status}, expected 200`,
    );
    cancelledRow = await bffDb.query(
      `SELECT "status"::text AS "status", "cancelledAt" IS NOT NULL AS "cancelled"
         FROM "AccountDeletion" WHERE "tenantId" = $1`,
      [tenant.tenantId],
    );
  }

  // Pedir de novo depois de ter voltado atrás: é o que prova que o
  // arrependimento devolveu a conta ao estado normal, e não a deixou num
  // limbo em que o dono não pode nem excluir nem usar.
  const restarted = await client.request("POST", "/v1/account/deletion", {
    body: { password: ACCOUNT_PASSWORD },
  });
  step(
    restarted.status === 200,
    `stage 11: the second POST /v1/account/deletion answered ${restarted.status}, expected 200 — the recoverable cycle did not return the account to a state where deletion can be asked again`,
  );

  // Relógio (entrada externa), pela última vez: o prazo de sete dias é
  // constante de produto e nenhuma variável o encurta.
  await bffDb.query(
    `UPDATE "AccountDeletion" SET "dueAt" = now() - interval '1 minute' WHERE "tenantId" = $1`,
    [tenant.tenantId],
  );

  const summary = await bff.runAccountPurge(
    bff.getPrisma(),
    bff.defaultAccountPurgePorts(bff.getPrisma()),
    {
      owner: "goal030-journey",
      leaseTtlSeconds: 60,
      accountBatchLimit: 5,
      maxRowsPerStore: 2_000,
    },
  );

  const deletion = await bffDb.query(
    `SELECT "status"::text AS "status", "purgedAt" IS NOT NULL AS "purged"
       FROM "AccountDeletion" WHERE "tenantId" = $1`,
    [tenant.tenantId],
  );
  const users = await bffDb.query(
    `SELECT count(*)::int AS "total" FROM "User" WHERE "id" = $1`,
    [tenant.userId],
  );
  const tenants = await bffDb.query(
    `SELECT count(*)::int AS "total" FROM "Tenant" WHERE "id" = $1`,
    [tenant.tenantId],
  );
  const appointments = await schedulingDb.query(
    `SELECT count(*)::int AS "total" FROM "Appointment" WHERE "tenantId" = $1`,
    [tenant.tenantId],
  );
  const conversations = await aiDb.query(
    `SELECT count(*)::int AS "total" FROM "Conversation" WHERE "tenantId" = $1`,
    [tenant.tenantId],
  );

  return {
    stage: 11,
    name: "exclusão de conta, com o ciclo recuperável até o fim",
    counts: {
      accountsClaimed: summary.accountsClaimed,
      accountsPurged: summary.accountsPurged,
      storesFailed: summary.failed,
      usersLeft: users.rows[0]?.total ?? null,
      tenantsLeft: tenants.rows[0]?.total ?? null,
      appointmentsLeft: appointments.rows[0]?.total ?? null,
      conversationsLeft: conversations.rows[0]?.total ?? null,
    },
    http: {
      startStatus: started.status,
      startedState: started.payload?.data?.status ?? null,
      statusDuringDeletion:
        statusDuring.payload?.data?.accountDeletion?.status ?? null,
      cancelStatus: cancelled?.status ?? null,
      cancelledState: cancelled?.payload?.data?.status ?? null,
      restartStatus: restarted.status,
      restartedState: restarted.payload?.data?.status ?? null,
    },
    database: {
      service: "bff + scheduling + ai",
      graceDays: scheduled.rows[0]?.graceDays ?? null,
      scheduledStatus: scheduled.rows[0]?.status ?? null,
      cancelledStatus: cancelledRow?.rows[0]?.status ?? null,
      finalStatus: deletion.rows[0]?.status ?? null,
      purged: deletion.rows[0]?.purged ?? null,
    },
  };
}

// --- Asserções do processo pai ---------------------------------------------

function assertStage1(stage) {
  const { http, database } = stage;
  assert(
    http.registerStatus === 201,
    `stage 1: register must answer 201, got ${http.registerStatus}`,
  );
  assert(
    http.sessionCookieReceived,
    "stage 1: the production path must issue a session cookie",
  );
  assert(
    http.csrfCookieReceived,
    "stage 1: the production path must issue the readable CSRF cookie",
  );
  assert(
    http.csrfHeaderReceived,
    "stage 1: the production path must issue the CSRF token header",
  );
  assert(
    http.csrfChannelsAgree,
    "stage 1: both documented CSRF channels must carry the same value",
  );
  assert(
    http.foreignOriginStatus === 403 &&
      http.foreignOriginCode === "CSRF_ORIGIN_REJECTED",
    `stage 1: a mutation from a foreign origin must be refused with 403 CSRF_ORIGIN_REJECTED, got ${http.foreignOriginStatus} ${http.foreignOriginCode}`,
  );
  assert(
    http.missingCsrfStatus === 403 &&
      http.missingCsrfCode === "CSRF_TOKEN_REJECTED",
    `stage 1: a cookie mutation without the CSRF token must be refused with 403 CSRF_TOKEN_REJECTED, got ${http.missingCsrfStatus} ${http.missingCsrfCode}`,
  );
  assert(
    http.sessionStatus === 200,
    `stage 1: GET /v1/auth/session must answer 200, got ${http.sessionStatus}`,
  );
  assert(
    http.sessionUserId === stage.userId,
    "stage 1: the session must resolve to the user the journey registered",
  );

  assert(
    database.users.length === 1,
    `stage 1: the BFF database must hold exactly one user, found ${database.users.length}`,
  );
  assert(
    database.users[0]?.email === JOURNEY.email,
    "stage 1: the persisted user is not the one the journey registered",
  );
  assert(
    database.users[0]?.hasPasswordHash === true,
    "stage 1: the persisted user must carry a password hash",
  );
  assert(
    database.tenants === 1,
    `stage 1: registering must create exactly one tenant, found ${database.tenants}`,
  );
  assert(
    database.members.length === 1 && database.members[0]?.role === "OWNER",
    "stage 1: the registered user must own the tenant, read from TenantMember",
  );
  assert(
    database.profiles.length === 1,
    "stage 1: registering must create the business profile row",
  );
  assert(
    database.profiles[0]?.notCompleted === true,
    "stage 1: a brand new business must not be marked as onboarded",
  );
  assert(
    database.legalAcceptances.length === 1,
    "stage 1: registering must persist the legal acceptance of the accepted versions",
  );
  assert(
    database.sessions.length === 1 &&
      database.sessions[0]?.active === true &&
      database.sessions[0]?.hasCsrfHash === true,
    "stage 1: the production path must persist one live UserSession carrying the CSRF hash — a forged header would leave none",
  );
}

function assertStage2(stage) {
  const { http, database } = stage;
  assert(
    http.blocks.length === 4,
    `stage 2: the journey must walk the four onboarding blocks, walked ${http.blocks.length}`,
  );
  assert(
    http.blocks.every((block) => block.status === 200),
    "stage 2: every onboarding block must be accepted",
  );

  assert(
    http.refusals.length === 3,
    `stage 2: three completion attempts must precede the accepted one, made ${http.refusals.length}`,
  );
  assert(
    http.refusals.every((refusal) => refusal.status === 409),
    `stage 2: every premature POST /v1/onboarding/complete must be refused with 409, got ${http.refusals.map((refusal) => refusal.status).join(", ")}`,
  );
  // As três listas, na ordem, são o mínimo que ainda falta depois de cada
  // bloco. Encolher é o que prova que a recusa é a definição única de
  // configuração essencial, e não uma checagem qualquer.
  const expectedIssues = [
    ["AI_TONE_NOT_SELECTED", "CALENDAR_NOT_SELECTED"],
    ["ACTIVE_SERVICE_REQUIRED", "AI_TONE_NOT_SELECTED", "AVAILABILITY_REQUIRED"],
    ["AI_TONE_NOT_SELECTED"],
  ];
  for (const [index, expected] of expectedIssues.entries()) {
    const found = http.refusals[index]?.issues;
    assert(
      Array.isArray(found) && found.join(",") === expected.join(","),
      `stage 2: refusal ${index + 1} must name exactly ${expected.join(", ")}, got ${found?.join(", ") ?? "no issue list"}`,
    );
  }
  assert(
    database.notCompletedDuringRefusals === true,
    "stage 2: a refused completion must leave no trace — onboardingCompletedAt was already written",
  );

  assert(
    http.completeStatus === 200,
    `stage 2: the final POST /v1/onboarding/complete must answer 200, got ${http.completeStatus}`,
  );
  assert(
    http.completed === true,
    "stage 2: the completed onboarding must report itself completed",
  );

  assert(
    database.profile?.completed === true,
    "stage 2: onboardingCompletedAt must be written, read from the BFF database",
  );
  assert(
    database.profile?.businessName === JOURNEY.businessName,
    "stage 2: the business name must be persisted by the business block",
  );
  assert(
    database.profile?.category === JOURNEY.businessCategory,
    "stage 2: the business category must be persisted",
  );
  assert(
    database.profile?.timezone === JOURNEY.timezone,
    "stage 2: the business timezone must be persisted",
  );
  assert(
    JSON.stringify(database.profile?.modalities) ===
      JSON.stringify([...JOURNEY.modalities]),
    "stage 2: the chosen modality must be persisted",
  );
  assert(
    database.calendarSettings?.source === "ATENDLY",
    "stage 2: the calendar block must persist the ATENDLY source in the Scheduling database",
  );
  assert(
    database.calendarSettings?.timezone === JOURNEY.timezone,
    "stage 2: the calendar replica must carry the single business timezone (D-045)",
  );
  assert(
    database.availabilityRules.length === JOURNEY.availabilityDays.length &&
      database.availabilityRules.every((rule) => rule.active),
    `stage 2: the operation block must persist ${JOURNEY.availabilityDays.length} active availability rules, found ${database.availabilityRules.length}`,
  );
  assert(
    database.services.some(
      (service) =>
        service.name === JOURNEY.onboardingService.name && service.active,
    ),
    "stage 2: the operation block must persist the minimum active service",
  );
}

function assertStage3(stage) {
  const { http, database } = stage;
  assert(
    http.createStatus === 201,
    `stage 3: POST /v1/services must answer 201, got ${http.createStatus}`,
  );
  assert(
    http.listStatus === 200,
    `stage 3: GET /v1/services must answer 200, got ${http.listStatus}`,
  );
  assert(
    http.listedOperational >= 1,
    "stage 3: the catalogue read must show at least one operational service (active and not pending review)",
  );
  const row = database.row;
  assert(
    row !== null,
    "stage 3: the created service was not found in the Scheduling database",
  );
  assert(
    row?.name === JOURNEY.catalogService.name,
    "stage 3: the persisted service is not the one the journey created",
  );
  assert(
    row?.active === true,
    "stage 3: the catalogue service must be persisted as active",
  );
  assert(
    row?.needsReview === false,
    "stage 3: a service with a known duration must not be pending review",
  );
  assert(
    row?.durationMinutes === JOURNEY.catalogService.durationMinutes,
    `stage 3: the persisted duration must be ${JOURNEY.catalogService.durationMinutes}, found ${row?.durationMinutes}`,
  );
  assert(
    row?.priceType === JOURNEY.catalogService.priceType,
    "stage 3: the persisted price semantics must be the one sent",
  );
  assert(
    Number(row?.price) === JOURNEY.catalogService.price,
    `stage 3: the persisted price must be ${JOURNEY.catalogService.price}, found ${row?.price}`,
  );
}

function assertStage4(stage) {
  const { http, database } = stage;
  assert(
    http.guardianStatus === 201 && http.personStatus === 201,
    "stage 4: both people must be created through the public route",
  );
  assert(
    http.proposeStatus === 200,
    `stage 4: proposing the guardian must answer 200, got ${http.proposeStatus}`,
  );
  assert(
    database.statusRightAfterProposal === "PROPOSED",
    `stage 4: a guardian relation must be born PROPOSED, the database showed ${database.statusRightAfterProposal}`,
  );
  assert(
    http.confirmStatus === 200,
    `stage 4: confirming the guardian must answer 200, got ${http.confirmStatus}`,
  );
  assert(
    http.readStatus === 200,
    `stage 4: GET /v1/customers/:id must answer 200, got ${http.readStatus}`,
  );
  assert(
    http.readPrimaryGuardianId === stage.guardianId,
    "stage 4: the customer read must expose the confirmed guardian",
  );
  assert(
    http.readPrimaryGuardianStatus === "CONFIRMED",
    `stage 4: the customer read must report the relation as CONFIRMED, got ${http.readPrimaryGuardianStatus}`,
  );

  assert(
    database.customers.length === 2,
    `stage 4: the Scheduling database must hold the two people, found ${database.customers.length}`,
  );
  const person = database.customers.find(
    (customer) => customer.id === stage.personId,
  );
  assert(
    person?.name === JOURNEY.person.name,
    "stage 4: the person's name must be persisted",
  );
  assert(
    person?.phone === null,
    "stage 4: the person was created without a phone and must stay without one — phone is contact, not identity",
  );

  const relation = database.relation;
  assert(
    relation !== null,
    "stage 4: the guardian relation was not found in the Scheduling database",
  );
  assert(
    relation?.type === "PRIMARY_GUARDIAN",
    "stage 4: the relation must be a primary guardian relation",
  );
  assert(
    relation?.status === "CONFIRMED",
    `stage 4: the relation must be CONFIRMED after the explicit confirmation, found ${relation?.status}`,
  );
  assert(
    relation?.relatedCustomerId === stage.guardianId,
    "stage 4: the relation must point at the guardian the journey created",
  );
  assert(
    relation?.proposedBy === "PROFESSIONAL",
    "stage 4: the provenance of the proposal must be PROFESSIONAL",
  );
  assert(
    relation?.proposedByActor === stage.expectedActor,
    "stage 4: proposedByActor must be derived from the authenticated session, not from the request body",
  );
  assert(
    relation?.confirmedByActor === stage.expectedActor,
    "stage 4: confirmedByActor must be derived from the authenticated session, not from the request body",
  );
}

function assertStage5(stage) {
  const { http, database } = stage;
  assert(
    http.availabilityBeforeStatus === 200,
    "stage 5: the agenda read before booking must answer 200",
  );
  assert(
    http.offeredBefore > 0,
    "stage 5: the agenda must offer the slot the journey books",
  );
  assert(
    http.createStatus === 201,
    `stage 5: POST /v1/appointments must answer 201, got ${http.createStatus}`,
  );
  assert(
    http.createdStatus === "CONFIRMED",
    `stage 5: the appointment must be confirmed, got ${http.createdStatus}`,
  );
  assert(http.listStatus === 200, "stage 5: GET /v1/appointments must answer 200");
  assert(
    http.listedAppointmentIds.includes(stage.appointmentId),
    "stage 5: the confirmed appointment must show up in the agenda read for its own day",
  );
  assert(
    http.slotStillOffered === false,
    "stage 5: the booked slot must stop being offered — a 201 that leaves the slot free is not occupation",
  );
  assert(
    http.remainingOverlappingBooked === 0,
    `stage 5: no remaining offer may cross the booked interval, ${http.remainingOverlappingBooked} still do`,
  );
  assert(
    http.offeredAfter < http.offeredBefore,
    `stage 5: booking must shrink the agenda's offer, went from ${http.offeredBefore} to ${http.offeredAfter}`,
  );

  const appointment = database.appointment;
  assert(
    appointment !== null,
    "stage 5: the appointment was not found in the Scheduling database",
  );
  assert(
    appointment?.status === "CONFIRMED",
    `stage 5: the persisted status must be CONFIRMED, found ${appointment?.status}`,
  );
  assert(
    appointment?.source === "USER",
    "stage 5: an appointment booked from the panel must be persisted with source USER",
  );
  assert(
    appointment?.createdBy === stage.expectedActor,
    "stage 5: createdBy must be the authenticated user of the journey",
  );
  assert(
    appointment?.customerId === stage.personId,
    "stage 5: the appointment must belong to the person created in stage 4",
  );
  assert(
    database.items.length === 1,
    `stage 5: the appointment must carry one catalogue item, found ${database.items.length}`,
  );
  assert(
    database.items[0]?.serviceNameSnapshot === JOURNEY.catalogService.name,
    "stage 5: the item must snapshot the catalogue service created in stage 3",
  );
  assert(
    database.items[0]?.durationMinutesSnapshot ===
      JOURNEY.catalogService.durationMinutes,
    "stage 5: the item must snapshot the service duration",
  );
}

function assertStage6(stage) {
  const { http, database, counts } = stage;
  assert(
    http.webhookStatus === 202,
    `stage 6: the durable webhook must answer 202, got ${http.webhookStatus}`,
  );
  assert(
    database.storedBeforeAck.length === 1,
    `stage 6: the inbound event must be persisted before the ACK, found ${database.storedBeforeAck.length} rows`,
  );
  assert(
    database.storedBeforeAck[0]?.hasConversationKey === true,
    "stage 6: the persisted event must carry the conversation key the transport groups by",
  );
  assert(
    counts.eventsClaimed === 1 && counts.eventsCompleted === 1,
    `stage 6: the durable inbox must hand over and close exactly one event, claimed ${counts.eventsClaimed} and closed ${counts.eventsCompleted}`,
  );
  assert(
    database.event?.status === "DONE" && database.event?.completed === true,
    `stage 6: the event must end DONE and closed, found ${database.event?.status}`,
  );
  assert(
    database.messages.length === 1,
    `stage 6: exactly one message must be persisted into the conversation, found ${database.messages.length}`,
  );
  assert(
    database.messages[0]?.direction === "INBOUND" &&
      database.messages[0]?.source === "CUSTOMER",
    "stage 6: the persisted message must be the contact's own inbound message",
  );
  assert(
    database.messages[0]?.body === JOURNEY.contact.text,
    "stage 6: the persisted message must carry the text the contact sent",
  );
  assert(
    database.conversation?.externalContactId === JOURNEY.contact.phone,
    "stage 6: the conversation must belong to the contact that wrote",
  );
  assert(
    http.listStatus === 200 && http.listedConversations === 1,
    `stage 6: the panel must list exactly one conversation, listed ${http.listedConversations}`,
  );
  assert(
    http.inboundBodies.includes(JOURNEY.contact.text),
    "stage 6: the contact's message must show up in the conversation read of the public API",
  );
  assert(
    http.categoryStatus === 200,
    `stage 6: setting the conversation category must answer 200, got ${http.categoryStatus}`,
  );
  assert(
    database.session?.category === "COMMERCIAL" &&
      database.session?.categorySource === "MANUAL",
    `stage 6: the session must carry the category the professional chose, found ${database.session?.category}/${database.session?.categorySource}`,
  );
  assert(
    http.takeoverStatus === 200,
    `stage 6: taking the conversation over must answer 200, got ${http.takeoverStatus}`,
  );
  assert(
    database.conversation?.status === "HUMAN_HANDOFF" &&
      database.conversation?.humanHandoff === true,
    `stage 6: human control must be persisted on the conversation, found status ${database.conversation?.status}`,
  );
  assert(
    database.session?.humanHandling === true &&
      database.session?.humanHandlingSource === "ATENDLY",
    "stage 6: the session must record that a human took over from the panel",
  );
}

function assertStage7(stage) {
  const { http, database, counts } = stage;
  assert(
    http.declareStatus === 200,
    `stage 7: declaring the reminder rule must answer 200, got ${http.declareStatus}`,
  );
  assert(
    database.settings?.confirmationEnabled === true,
    "stage 7: the declared confirmation setting must be persisted by the agenda owner",
  );
  assert(
    counts.persistedRules === 1 &&
      database.rules[0]?.slot === "FIRST" &&
      database.rules[0]?.leadMinutes === JOURNEY.reminderLeadMinutes,
    `stage 7: exactly one reminder rule of ${JOURNEY.reminderLeadMinutes} minutes must be persisted, found ${JSON.stringify(database.rules)}`,
  );
  assert(
    http.createStatus === 201,
    `stage 7: the appointment under the declared rule must be created, got ${http.createStatus}`,
  );
  assert(
    counts.scheduledIntents === 1,
    `stage 7: the appointment must schedule exactly one reminder, found ${counts.scheduledIntents}`,
  );
  const intent = database.intents[0];
  assert(
    intent?.kind === "REMINDER" && intent?.slot === "FIRST",
    `stage 7: the scheduled intent must be the first reminder, found ${intent?.kind}/${intent?.slot}`,
  );
  assert(
    intent?.state === "PENDING",
    `stage 7: a freshly scheduled reminder must be PENDING, found ${intent?.state}`,
  );
  assert(
    intent?.withoutFacts === true,
    "stage 7: a pending reminder must carry no composed facts yet — they are built by the owner at claim time",
  );
  // A antecedência sai do banco, medida contra o próprio começo do
  // atendimento: lembrete na hora errada é lembrete errado.
  assert(
    intent?.leadMinutes === JOURNEY.reminderLeadMinutes,
    `stage 7: the reminder must be due ${JOURNEY.reminderLeadMinutes} minutes before the appointment, the database shows ${intent?.leadMinutes}`,
  );
}

function assertStage8(stage) {
  const { http, database, counts } = stage;
  assert(
    http.statusStatus === 200,
    `stage 8: GET /v1/status must answer 200, got ${http.statusStatus}`,
  );
  assert(
    http.listStatus === 200 && counts.listed >= 1,
    `stage 8: the notification centre must list the materialised condition, listed ${counts.listed}`,
  );
  assert(
    http.listedKind === "WHATSAPP_DISCONNECTED",
    `stage 8: the materialised species must be WHATSAPP_DISCONNECTED, got ${http.listedKind}`,
  );
  // O nível não é escolha de quem materializa: ele vem da tabela de espécies.
  assert(
    http.listedLevel === "CRITICAL" && http.listedShape === "CONDITION",
    `stage 8: the species table fixes this notification as CRITICAL/CONDITION, got ${http.listedLevel}/${http.listedShape}`,
  );
  assert(
    counts.unreadBefore >= 1,
    `stage 8: the materialised notification must start unread, the summary counted ${counts.unreadBefore}`,
  );
  assert(
    http.readStatus === 200 && counts.updatedByRead === 1,
    `stage 8: marking the notification as read must update exactly one row, got status ${http.readStatus} and ${counts.updatedByRead} updated`,
  );
  assert(
    counts.unreadAfter === counts.unreadBefore - 1,
    `stage 8: reading must shrink the unread count, went from ${counts.unreadBefore} to ${counts.unreadAfter}`,
  );
  const row = database.notifications.find(
    (entry) => entry.kind === "WHATSAPP_DISCONNECTED",
  );
  assert(
    row?.level === "CRITICAL" && row?.shape === "CONDITION",
    "stage 8: the persisted notification must carry the level of its species",
  );
  assert(
    row?.read === true,
    "stage 8: readAt must be written — a 200 that leaves the row unread is not a read notification",
  );
  assert(
    row?.open === true,
    "stage 8: the condition is still happening and must stay open; only EVENT species leave the present",
  );
}

function assertStage9(stage) {
  const { http, database } = stage;
  assert(
    http.patchStatus === 200,
    `stage 9: changing the business timezone must answer 200, got ${http.patchStatus}`,
  );
  assert(
    stage.expectedTimezone !== stage.previousTimezone,
    `stage 9: the journey must actually change the timezone; it stayed at ${stage.previousTimezone}`,
  );
  assert(
    database.owner === stage.expectedTimezone,
    `stage 9: the owner of the timezone (BusinessProfile) must hold ${stage.expectedTimezone}, found ${database.owner}`,
  );
  // A réplica é o valor de que a agenda depende: as duas cópias divergindo é
  // exatamente o defeito que o Goal029 fechou.
  assert(
    database.replica === stage.expectedTimezone,
    `stage 9: the replica in the Scheduling database must follow the owner to ${stage.expectedTimezone}, found ${database.replica}`,
  );
  assert(
    database.replicaSource === "ATENDLY",
    `stage 9: the calendar source must stay ATENDLY (D-043), found ${database.replicaSource}`,
  );
  assert(
    http.settingsBusinessTimezone === stage.expectedTimezone &&
      http.settingsCalendarTimezone === stage.expectedTimezone,
    `stage 9: GET /v1/settings must report a single timezone, reported ${http.settingsBusinessTimezone} and ${http.settingsCalendarTimezone}`,
  );
  assert(
    http.calendarTimezone === stage.expectedTimezone,
    `stage 9: GET /v1/calendar must report ${stage.expectedTimezone}, reported ${http.calendarTimezone}`,
  );
}

function assertStage10(stage) {
  const { http, database, counts } = stage;
  assert(
    http.declareStatus === 200,
    `stage 10: declaring the retention window must answer 200, got ${http.declareStatus}`,
  );
  assert(
    http.currentCommercialDays === JOURNEY.retentionDays &&
      http.currentPersonalDays === JOURNEY.retentionDays,
    `stage 10: the declared window must be the one in force, read back ${http.currentCommercialDays}/${http.currentPersonalDays}`,
  );
  assert(
    counts.messagesBefore === 1,
    `stage 10: the purge must start from the message stage 6 persisted, found ${counts.messagesBefore}`,
  );
  assert(
    counts.tenantsClaimed === 1,
    `stage 10: the sweep must claim the business, claimed ${counts.tenantsClaimed}`,
  );
  assert(
    counts.messagesAfter === 0,
    `stage 10: the expired conversation content must be gone, ${counts.messagesAfter} message(s) survived`,
  );
  // O que sobrevive é tão importante quanto o que sai: retenção de conteúdo
  // não apaga cadastro, conversa nem sessão.
  assert(
    database.conversation !== null,
    "stage 10: the conversation itself must survive the content purge",
  );
  assert(
    database.conversation?.contentExpired === true,
    "stage 10: the conversation must record how far its content expired",
  );
  assert(
    counts.sessionsSurviving >= 1,
    "stage 10: the conversation session must survive the content purge",
  );
  assert(
    database.sweep.failed === 0,
    `stage 10: no retention source may fail, ${database.sweep.failed} did`,
  );
}

function assertStage11(stage) {
  const { http, database, counts } = stage;
  assert(
    http.startStatus === 200 && http.startedState === "SCHEDULED",
    `stage 11: asking for deletion must answer 200 SCHEDULED, got ${http.startStatus} ${http.startedState}`,
  );
  assert(
    database.scheduledStatus === "SCHEDULED",
    `stage 11: the deletion must be persisted as SCHEDULED, found ${database.scheduledStatus}`,
  );
  // Sete dias é constante de produto (Goal025), não configuração.
  assert(
    database.graceDays === 7,
    `stage 11: the recoverable window must be 7 days, the database shows ${database.graceDays}`,
  );
  assert(
    http.statusDuringDeletion === "SCHEDULED",
    `stage 11: GET /v1/status must show the account as SCHEDULED for deletion, showed ${http.statusDuringDeletion}`,
  );
  assert(
    http.cancelStatus === 200 && http.cancelledState === "CANCELLED",
    `stage 11: cancelling must answer 200 CANCELLED, got ${http.cancelStatus} ${http.cancelledState}`,
  );
  assert(
    database.cancelledStatus === "CANCELLED",
    `stage 11: the cancellation must be persisted — the cycle is recoverable or it is not a cycle`,
  );
  assert(
    http.restartStatus === 200,
    `stage 11: asking again after cancelling must be accepted, got ${http.restartStatus}`,
  );
  assert(
    counts.accountsClaimed === 1 && counts.accountsPurged === 1,
    `stage 11: the due account must be claimed and purged exactly once, claimed ${counts.accountsClaimed} and purged ${counts.accountsPurged}`,
  );
  assert(
    counts.storesFailed === 0,
    `stage 11: no store may fail during the purge, ${counts.storesFailed} did`,
  );
  assert(
    database.finalStatus === "PURGED" && database.purged === true,
    `stage 11: the deletion must end PURGED, found ${database.finalStatus}`,
  );
  assert(
    counts.usersLeft === 0 && counts.tenantsLeft === 0,
    `stage 11: no account row may survive the purge, found ${counts.usersLeft} user(s) and ${counts.tenantsLeft} business(es)`,
  );
  assert(
    counts.appointmentsLeft === 0 && counts.conversationsLeft === 0,
    `stage 11: the other two stores must be empty for this business, found ${counts.appointmentsLeft} appointment(s) and ${counts.conversationsLeft} conversation(s)`,
  );
}

/**
 * O retrato da composição, lido das três bases dentro do subprocesso depois
 * da etapa 10 e antes da exclusão: o percurso inteiro de pé.
 *
 * Isto é o que separa "cada etapa respondeu" de "o negócio existe": as etapas
 * anteriores não podem ter se desfeito pelo caminho, e o que a etapa 10 apagou
 * tem de estar apagado — nada além disso.
 */
function assertComposition(state, journey) {
  const [stage1, , stage3, stage4, stage5, stage6] = journey.stages;

  assert(
    state.users.length === 1,
    "composed state: exactly one account must stand at the end of the journey",
  );
  assert(
    state.profiles.length === 1,
    "composed state: exactly one business profile must stand at the end of the journey",
  );
  assert(
    state.profiles[0]?.onboardingCompletedAt !== null,
    "composed state: the completed onboarding must still be completed after both services died",
  );
  assert(
    state.members[0]?.userId === stage1.userId,
    "composed state: the surviving tenant membership must be the journey's own",
  );
  assert(
    state.calendarSettings.length === 1,
    "composed state: the business must own exactly one calendar settings row",
  );
  assert(
    state.availabilityRules.length === JOURNEY.availabilityDays.length,
    "composed state: the availability rules must survive",
  );
  assert(
    state.services.length === 2,
    `composed state: the catalogue must hold the two services the journey created, found ${state.services.length}`,
  );
  assert(
    state.services.some(
      (service) =>
        service.id === stage3.catalogServiceId &&
        service.active &&
        !service.needsReview,
    ),
    "composed state: the operational catalogue service must survive",
  );
  assert(
    state.customers.length === 2,
    "composed state: the two people must survive",
  );
  assert(
    state.relations.length === 1 && state.relations[0]?.status === "CONFIRMED",
    "composed state: the confirmed guardian relation must survive",
  );
  assert(
    state.relations[0]?.proposedByActor === stage4.expectedActor,
    "composed state: the provenance of the relation must survive unchanged",
  );
  // Dois atendimentos: o da etapa 5 e o da etapa 7, que nasceu sob a regra de
  // lembrete recém-declarada.
  assert(
    state.appointments.length === 2,
    `composed state: the two appointments of the journey must stand, found ${state.appointments.length}`,
  );
  assert(
    state.appointments.some(
      (appointment) =>
        appointment.id === stage5.appointmentId &&
        appointment.status === "CONFIRMED",
    ),
    "composed state: the appointment confirmed in stage 5 must stand",
  );
  assert(
    state.appointmentItems.length === 2,
    `composed state: each appointment must carry its catalogue item, found ${state.appointmentItems.length}`,
  );
  assert(
    state.appointmentItems.every(
      (item) => item.serviceId === stage3.catalogServiceId,
    ),
    "composed state: both appointments must still point at the catalogue service of stage 3",
  );

  assert(
    state.reminderRules.length === 1 &&
      state.reminderRules[0]?.leadMinutes === JOURNEY.reminderLeadMinutes,
    "composed state: the reminder rule declared in stage 7 must stand",
  );
  // Um lembrete por atendimento futuro: declarar a regra vale para a agenda
  // do negócio, não só para o agendamento que veio depois dela.
  const reminders = state.notificationIntents.filter(
    (intent) => intent.kind === "REMINDER",
  );
  assert(
    reminders.length === state.appointments.length,
    `composed state: each standing appointment must carry its reminder, found ${reminders.length} for ${state.appointments.length} appointment(s)`,
  );
  assert(
    reminders.every(
      (intent) => intent.leadMinutes === JOURNEY.reminderLeadMinutes,
    ),
    "composed state: every standing reminder must use the declared lead time",
  );
  assert(
    state.notifications.some(
      (notification) =>
        notification.kind === "WHATSAPP_DISCONNECTED" &&
        notification.level === "CRITICAL" &&
        notification.read === true,
    ),
    "composed state: the read notification of stage 8 must stand, still read",
  );
  assert(
    state.retention?.commercialRetentionDays === JOURNEY.retentionDays,
    `composed state: the retention window declared in stage 10 must stand, found ${state.retention?.commercialRetentionDays}`,
  );

  assert(
    state.conversations.length === 1 &&
      state.conversations[0]?.id === stage6.conversationId,
    "composed state: the conversation of stage 6 must stand",
  );
  assert(
    state.conversations[0]?.status === "HUMAN_HANDOFF" &&
      state.conversations[0]?.humanHandoff === true,
    "composed state: human control must still be in force over the conversation",
  );
  assert(
    state.conversations[0]?.contentExpired === true,
    "composed state: the conversation must still record how far its content expired",
  );
  assert(
    state.conversationSessions.length === 1 &&
      state.conversationSessions[0]?.category === "COMMERCIAL",
    "composed state: the categorised session must stand",
  );
  // O conteúdo saiu na etapa 10 e não volta: conversa de pé, mensagens
  // nenhuma. As duas coisas ao mesmo tempo é o que a retenção promete.
  assert(
    state.messages.length === 0,
    `composed state: no purged message may come back, found ${state.messages.length}`,
  );
  assert(
    state.inboundEvents.length === 1 &&
      state.inboundEvents[0]?.status === "DONE",
    "composed state: the durable inbound event must stand closed",
  );
}

/**
 * O vazio depois da exclusão, lido pelo processo pai em conexões novas, com os
 * três serviços já mortos.
 *
 * Exclusão de conta é a única etapa cuja prova é a **ausência**: a resposta
 * `200` do pedido diz que ele foi aceito, nunca que o dado saiu do disco.
 */
function assertPurgedState(state) {
  for (const [service, counts] of [
    ["bff", state.bff],
    ["scheduling", state.scheduling],
    ["ai", state.ai],
  ]) {
    const left = unexpectedRows(
      counts,
      service === "ai" ? AI_BASELINE_ROWS : {},
    ).filter(
      // `AccountDeletion` é a única linha do negócio que sobrevive de
      // propósito, e ela é conferida logo abaixo: é o recibo da exclusão.
      ([table]) => table !== "AccountDeletion",
    );
    assert(
      left.length === 0,
      `purged state: the ${service} database must hold nothing of the deleted business, found ${left
        .map(([table, total]) => `${table}=${total}`)
        .join(", ")}`,
    );
  }
  // A linha da exclusão sobrevive de propósito, e é o registro de que a conta
  // existiu e foi apagada.
  assert(
    state.deletions.length === 1 &&
      state.deletions[0]?.status === "PURGED" &&
      state.deletions[0]?.purged === true,
    "purged state: the deletion record must survive as PURGED — it is the receipt of the erasure",
  );
}

export async function rehearse(plan) {
  await recreateDatabase(plan.maintenance, plan.bff.database);
  await recreateDatabase(plan.maintenance, plan.scheduling.database);
  await recreateDatabase(plan.maintenance, plan.ai.database);

  const bffMigration = runPrisma("bff", plan.bff.url);
  if (
    !assert(
      bffMigration.status === 0,
      `prisma migrate deploy failed for the BFF rehearsal database, exit ${bffMigration.status}\n${bffMigration.output}`,
    )
  ) {
    return;
  }

  const schedulingMigration = runPrisma("scheduling-service", plan.scheduling.url);
  if (
    !assert(
      schedulingMigration.status === 0,
      `prisma migrate deploy failed for the Scheduling rehearsal database, exit ${schedulingMigration.status}\n${schedulingMigration.output}`,
    )
  ) {
    return;
  }

  const aiMigration = runPrisma("ai-orchestrator", plan.ai.url);
  if (
    !assert(
      aiMigration.status === 0,
      `prisma migrate deploy failed for the AI rehearsal database, exit ${aiMigration.status}\n${aiMigration.output}`,
    )
  ) {
    return;
  }

  // Nada é semeado: o percurso precisa encontrar os três bancos vazios, ou a
  // composição que ele afirma provar teria sido montada por fora.
  const emptyBff = await countRows(plan.bff.url, BFF_JOURNEY_TABLES);
  const emptyScheduling = await countRows(
    plan.scheduling.url,
    SCHEDULING_JOURNEY_TABLES,
  );
  const emptyAi = await countRows(plan.ai.url, AI_JOURNEY_TABLES);
  const seeded = [
    ...unexpectedRows(emptyBff),
    ...unexpectedRows(emptyScheduling),
    ...unexpectedRows(emptyAi, AI_BASELINE_ROWS),
  ];
  if (
    !assert(
      seeded.length === 0,
      `the journey must start from empty databases; found rows already present in ${seeded
        .map(([table, total]) => `${table}=${total}`)
        .join(", ")}`,
    )
  ) {
    return;
  }
  console.log(
    "goal030:mvp-journey-rehearsal the three databases start empty across " +
      `${BFF_JOURNEY_TABLES.length + SCHEDULING_JOURNEY_TABLES.length + AI_JOURNEY_TABLES.length} journey tables — nothing is seeded`,
  );

  const outcome = runJourney(plan);
  if (
    !assert(
      outcome.status === 0,
      `the journey (the real BFF, the real Scheduling service and the real AI orchestrator over HTTP, against the three rehearsal databases) failed, exit ${outcome.status}\n${outcome.output}`,
    )
  ) {
    return;
  }

  const journey = parseJourneyResult(outcome.output);
  if (
    !assert(
      journey !== null,
      `the journey did not report a parseable result\n${outcome.output}`,
    )
  ) {
    return;
  }
  if (
    !assert(
      journey.stages.length === 11,
      `the journey must walk eleven stages, walked ${journey.stages.length}`,
    )
  ) {
    return;
  }
  console.log(
    "goal030:mvp-journey-rehearsal journey stages: " +
      journey.stages.map((stage) => `${stage.stage}. ${stage.name}`).join(" | "),
  );

  // Contagens por etapa, na ordem do percurso: é o que um humano lê para
  // saber o tamanho do que aconteceu, sem abrir o banco.
  for (const stage of journey.stages) {
    console.log(
      `goal030:mvp-journey-rehearsal stage ${stage.stage} counts: ` +
        Object.entries(stage.counts ?? {})
          .map(([name, total]) => `${name}=${total}`)
          .join(", "),
    );
  }

  assertStage1(journey.stages[0]);
  assertStage2(journey.stages[1]);
  assertStage3(journey.stages[2]);
  assertStage4(journey.stages[3]);
  assertStage5(journey.stages[4]);
  assertStage6(journey.stages[5]);
  assertStage7(journey.stages[6]);
  assertStage8(journey.stages[7]);
  assertStage9(journey.stages[8]);
  assertStage10(journey.stages[9]);
  assertStage11(journey.stages[10]);

  if (
    !assert(
      journey.composed !== undefined && journey.composed !== null,
      "the journey did not report the composed state read from the three databases before the deletion",
    )
  ) {
    return;
  }
  console.log(
    "goal030:mvp-journey-rehearsal direct read of the three databases before the deletion: " +
      `${journey.composed.users.length} account, ${journey.composed.profiles.length} business profile, ` +
      `${journey.composed.availabilityRules.length} availability rule(s), ${journey.composed.services.length} service(s), ` +
      `${journey.composed.customers.length} customer(s), ${journey.composed.relations.length} guardian relation(s), ` +
      `${journey.composed.appointments.length} appointment(s), ${journey.composed.reminderRules.length} reminder rule(s), ` +
      `${journey.composed.notifications.length} notification(s), ${journey.composed.conversations.length} conversation(s), ` +
      `${journey.composed.messages.length} message(s)`,
  );
  assertComposition(journey.composed, journey);

  const finalState = await readFinalState(plan);
  const remaining = [
    ...Object.values(finalState.bff),
    ...Object.values(finalState.scheduling),
    ...Object.values(finalState.ai),
  ].reduce((total, count) => total + count, 0);
  console.log(
    "goal030:mvp-journey-rehearsal direct read of the three databases after the deletion, in new connections and " +
      `with the three services already dead: ${remaining} row(s) left across ` +
      `${BFF_JOURNEY_TABLES.length + SCHEDULING_JOURNEY_TABLES.length + AI_JOURNEY_TABLES.length} journey tables`,
  );
  assertPurgedState(finalState);
}

export async function main() {
  let plan;
  try {
    assertRequiredBinaries();
    plan = resolveRehearsalPlan();
    // Antes de criar banco nenhum: sem pgvector o histórico da IA para no
    // meio, e o ensaio recusa em vez de fingir que o serviço subiu.
    await assertVectorExtensionAvailable(plan.maintenance);
  } catch (error) {
    if (error instanceof JourneyRehearsalError) refuse(error.message);
    throw error;
  }

  console.log(
    `goal030:mvp-journey-rehearsal target: BFF ${plan.bff.label}, Scheduling ${plan.scheduling.label}, AI ${plan.ai.label}`,
  );
  const breakLink = process.env.GOAL030_BREAK_LINK?.trim();
  if (breakLink) {
    console.log(
      `goal030:mvp-journey-rehearsal NEGATIVE CONTROL: breaking the link "${breakLink}" — ` +
        `${BREAKABLE_LINKS[breakLink] ?? "unknown link"}`,
    );
  }

  try {
    await rehearse(plan);
  } catch (error) {
    if (error instanceof JourneyRehearsalError) refuse(error.message);
    console.error(
      `goal030:mvp-journey-rehearsal FAILED — ${redactConnectionStrings(error.stack ?? error.message)}`,
    );
    process.exitCode = 1;
  }

  if (process.exitCode) {
    console.error(
      breakLink
        ? `goal030:mvp-journey-rehearsal FAILED — as the negative control demanded: the link "${breakLink}" was broken (${BREAKABLE_LINKS[breakLink]}) and the journey stopped composing. See the assertions above.`
        : "goal030:mvp-journey-rehearsal FAILED — see the assertions above.",
    );
  } else if (breakLink) {
    // Verde com elo quebrado é pior notícia do que vermelho: significa que o
    // ensaio não estava provando o que diz provar.
    console.error(
      `goal030:mvp-journey-rehearsal FAILED — the link "${breakLink}" was broken and the journey still passed. The rehearsal is not proving what it claims to prove.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      "\ngoal030:mvp-journey-rehearsal PASSED — against three disposable PostgreSQL databases that started empty, a " +
        "single business walked the whole MVP journey, stages 1 to 11, through the real public API of the real BFF, " +
        "over real HTTP, with the session issued by the production path (cookie plus CSRF token, both refusals " +
        "exercised) and a real Scheduling service and a real AI orchestrator behind it: account and session, the " +
        "four onboarding blocks with three refused completions before the accepted one, an operational catalogue " +
        "service, a person with a confirmed guardian carrying session-derived provenance, a confirmed appointment " +
        "whose slot stopped being offered, a contact message received durably and persisted into the conversation " +
        "with category and human control, a reminder scheduled at the declared lead time, a critical notification " +
        "materialised and read in the centre, the business timezone crossing services in a single value, the " +
        "declared retention purging conversation content while the conversation survived, and the account deletion " +
        "cycle walked to the end — asked, cancelled, asked again and purged, leaving the three databases empty. " +
        "Every stage was proved by reading the database of the service that owns the data with plain pg, not by " +
        "the HTTP response. What this rehearsal does NOT prove is declared in its header: the automatic answer of " +
        "the AI (graph, model and transport) was never exercised, and no external boundary was ever called.",
    );
  }
}

if (process.argv[2] === "--journey") {
  await runJourneyChild();
} else if (isMain(import.meta.url)) {
  await main();
}
