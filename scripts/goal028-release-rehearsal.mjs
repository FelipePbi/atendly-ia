#!/usr/bin/env node

// Ensaio de release do Goal028 (WU-01): o historico COMPLETO de migrations
// dos tres servicos aplicado DO ZERO em banco vazio e descartavel.
//
// O que nenhum ensaio anterior deste repositorio prova: os dezoito ensaios por
// Goal exercitam UMA migration cada um, sobre um recorte de schema legado
// reconstruido a mao. Nenhum deles prova que a pasta `prisma/migrations`
// inteira, na ordem em que esta versionada, sai de um banco vazio e chega a um
// banco que corresponde ao `schema.prisma` vigente. Isso e exatamente o que um
// `prisma migrate deploy` faz na primeira subida de producao, e e o que este
// ensaio prova, para BFF, IA e Scheduling.
//
// Por servico, o ensaio prova quatro coisas:
//   (a) HISTORICO COMPLETO — a contagem de linhas de `_prisma_migrations`
//       bate com o numero de diretorios de migration LIDO DA ARVORE, e os
//       nomes coincidem um a um. O numero nunca e escrito a mao aqui: se
//       alguem acrescentar uma migration e ela nao aplicar, a contagem
//       diverge sozinha;
//   (b) APLICACAO LIMPA — nenhuma linha tem `rolled_back_at`, toda linha
//       contada tem `finished_at IS NOT NULL` e ao menos um passo aplicado.
//       Uma migration que falhou no meio fica registrada e nao passaria aqui;
//   (c) IDEMPOTENCIA — a segunda execucao de `prisma migrate deploy` no mesmo
//       banco sai com codigo 0 e nao aplica migration nenhuma: o retrato de
//       `_prisma_migrations` (nome, checksum, `finished_at`, passos) e
//       identico ao da primeira;
//   (d) AUSENCIA DE DRIFT — `prisma migrate diff` entre o banco migrado e o
//       `schema.prisma` do servico sai vazio. Drift aqui significa que o
//       schema declarado e o historico de migrations discordam; a correcao e
//       sempre uma migration nova e aditiva, nunca a edicao de uma migration
//       ja versionada, que mudaria o checksum de um banco ja implantado.
//
// Banco proprio por servico, derivado de BFF_TEST_DATABASE_URL e recriado do
// zero a cada execucao. Os bancos dos ensaios anteriores NAO sao reaproveitados
// de proposito: eles ja estao povoados, e a prova aqui e de banco limpo.
//
// Nenhuma credencial aparece na saida. A saida dos subprocessos do Prisma
// passa por `redactConnectionStrings` antes de qualquer impressao, e os rotulos
// carregam so host, porta e nome do banco.
//
// Codigos de saida: 0 sucesso, 1 falha de assercao, 2 recusa (destino nao
// descartavel, variavel ausente ou binario ausente). Nao existe caminho de
// skip: toda saida diferente de 0 e falha ou recusa explicita.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isMain } from "./lib/gate.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DISPOSABLE_NAME = /(?:^|[_-])test(?:[_-]|$)/iu;

// Os tres servicos que versionam migrations. `app` e o diretorio sob `apps/`
// e `suffix` compoe o nome do banco descartavel. `prisma.config.ts` do BFF le
// DIRECT_DATABASE_URL||DATABASE_URL, os outros dois leem DATABASE_URL; nenhum
// dos `schema.prisma` traz `url` no bloco `datasource db`, entao a URL vem
// SEMPRE do ambiente do subprocesso montado aqui e de nenhum outro lugar.
export const SERVICES = Object.freeze([
  Object.freeze({ name: "bff", app: "bff", suffix: "goal028_bff" }),
  Object.freeze({ name: "ai", app: "ai-orchestrator", suffix: "goal028_ai" }),
  Object.freeze({
    name: "scheduling",
    app: "scheduling-service",
    suffix: "goal028_scheduling",
  }),
]);

export class ReleaseRehearsalError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseRehearsalError";
  }
}

/**
 * Remove usuario e senha de qualquer URL de conexao presente num texto.
 * A saida do Prisma e de erros de driver passa por aqui antes de ser impressa:
 * o ensaio reporta destino, nunca credencial.
 */
export function redactConnectionStrings(text) {
  return String(text ?? "").replace(
    /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]*@/gu,
    "$1***@",
  );
}

/** Nome do banco descartavel de um servico, derivado do alvo ja validado. */
export function serviceDatabaseName(baseDatabase, suffix) {
  return `${baseDatabase}_${suffix}`;
}

/**
 * Valida o alvo e monta o plano do ensaio, sem tocar em banco nem subprocesso.
 * Lanca ReleaseRehearsalError quando a variavel esta ausente, a URL e invalida
 * ou o destino nao e reconhecidamente descartavel.
 */
export function resolveRehearsalPlan(environment = process.env) {
  const raw = environment.BFF_TEST_DATABASE_URL?.trim();
  if (!raw) {
    throw new ReleaseRehearsalError(
      "BFF_TEST_DATABASE_URL is not set. This rehearsal refuses to run: it will not fall back to any app .env or to an inherited DATABASE_URL.",
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ReleaseRehearsalError(
      "BFF_TEST_DATABASE_URL is not a valid URL.",
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new ReleaseRehearsalError(
      `BFF_TEST_DATABASE_URL must use postgres:// or postgresql://, got ${url.protocol}//`,
    );
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new ReleaseRehearsalError(
      `Host "${host}" is not loopback. This rehearsal drops and recreates whole databases and only accepts a locally provisioned PostgreSQL (127.0.0.1, localhost or ::1).`,
    );
  }

  const baseDatabase = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!baseDatabase) {
    throw new ReleaseRehearsalError(
      "BFF_TEST_DATABASE_URL must name a database.",
    );
  }
  if (!DISPOSABLE_NAME.test(baseDatabase)) {
    throw new ReleaseRehearsalError(
      `Database "${baseDatabase}" is not recognised as disposable. This rehearsal issues DROP DATABASE and must never touch a shared or product database; the name must contain "test".`,
    );
  }

  const port = url.port || "5432";
  const services = SERVICES.map((service) => {
    const database = serviceDatabaseName(baseDatabase, service.suffix);
    // O nome derivado tambem passa pela mesma allowlist: se algum dia o sufixo
    // apagasse a marca de descarte, o DROP seguinte seria cego.
    if (!DISPOSABLE_NAME.test(database)) {
      throw new ReleaseRehearsalError(
        `Derived database "${database}" is not recognised as disposable.`,
      );
    }
    const target = new URL(raw);
    target.pathname = `/${encodeURIComponent(database)}`;
    return {
      ...service,
      database,
      url: target.href,
      // Seguro para log: sem usuario, senha ou query string.
      label: `${host}:${port}/${database}`,
    };
  });

  const maintenance = new URL(raw);
  maintenance.pathname = "/postgres";

  return {
    maintenance: maintenance.href,
    host,
    port,
    baseDatabase,
    services,
  };
}

/**
 * Le da arvore os nomes de migration de um servico. Fonte unica da contagem
 * esperada: o numero NAO e escrito a mao em lugar nenhum deste ensaio.
 * Um diretorio sem `migration.sql` nao conta — nao e uma migration.
 */
export function readMigrationDirectories(migrationsPath) {
  if (!existsSync(migrationsPath)) {
    throw new ReleaseRehearsalError(
      `Migrations directory not found: ${migrationsPath}`,
    );
  }
  return readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) =>
      existsSync(path.join(migrationsPath, name, "migration.sql")),
    )
    .sort();
}

/**
 * Le da arvore quais extensoes de servidor o historico de um servico exige.
 *
 * Nao e detalhe de infraestrutura: `CREATE EXTENSION` so funciona se a
 * biblioteca ja estiver instalada NO SERVIDOR, e nenhuma migration consegue
 * instala-la. O historico da IA exige `vector` (pgvector) desde
 * `20260829180000_rag_pgvector`, entao um PostgreSQL sem pgvector nao consegue
 * receber o servico de IA do zero — nem em producao. A lista sai da arvore,
 * como a contagem: acrescentar uma extensao numa migration nova passa a ser
 * exigida aqui sozinha.
 */
export function readRequiredExtensions(migrationsPath, directories) {
  const required = new Set();
  for (const name of directories) {
    const sql = readFileSync(
      path.join(migrationsPath, name, "migration.sql"),
      "utf8",
    );
    const pattern =
      /CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/giu;
    for (const match of sql.matchAll(pattern)) required.add(match[1]);
  }
  return [...required].sort();
}

/**
 * Confronta o que a arvore declara com o que `_prisma_migrations` registrou.
 * Devolve a lista de divergencias; vazia significa historico completo e limpo.
 */
export function compareAppliedMigrations(directories, rows) {
  const problems = [];
  const applied = rows.map((row) => row.migration_name).sort();

  if (rows.length !== directories.length) {
    problems.push(
      `applied ${rows.length} migration(s) but the tree declares ${directories.length}`,
    );
  }

  const missing = directories.filter((name) => !applied.includes(name));
  if (missing.length > 0) {
    problems.push(`never applied: ${missing.join(", ")}`);
  }
  const unknown = applied.filter((name) => !directories.includes(name));
  if (unknown.length > 0) {
    problems.push(`applied but absent from the tree: ${unknown.join(", ")}`);
  }

  const rolledBack = rows
    .filter((row) => row.rolled_back_at !== null)
    .map((row) => row.migration_name);
  if (rolledBack.length > 0) {
    problems.push(`rolled back: ${rolledBack.join(", ")}`);
  }

  const unfinished = rows
    .filter((row) => row.finished_at === null)
    .map((row) => row.migration_name);
  if (unfinished.length > 0) {
    problems.push(`finished_at IS NULL: ${unfinished.join(", ")}`);
  }

  const stepless = rows
    .filter((row) => Number(row.applied_steps_count) < 1)
    .map((row) => row.migration_name);
  if (stepless.length > 0) {
    problems.push(`applied_steps_count < 1: ${stepless.join(", ")}`);
  }

  return problems;
}

/** Retrato comparavel de `_prisma_migrations`, para a prova de idempotencia. */
export function migrationsFingerprint(rows) {
  return rows
    .map((row) =>
      [
        row.migration_name,
        row.checksum,
        row.finished_at,
        row.rolled_back_at,
        row.applied_steps_count,
      ].join("/"),
    )
    .sort();
}

function refuse(message) {
  console.error(
    `goal028:release-rehearsal REFUSED — ${redactConnectionStrings(message)}`,
  );
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) {
    console.error(
      `goal028:release-rehearsal FAILED — ${redactConnectionStrings(message)}`,
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

/**
 * Exige, ANTES de qualquer conexao, que as dependencias de que o ensaio
 * depende existam: o driver `pg` e a CLI do Prisma de cada servico. Ausencia e
 * recusa com exit 2, nunca skip.
 */
export function assertRequiredBinaries(services = SERVICES) {
  const bffRequire = createRequire(
    path.join(repositoryRoot, "apps", "bff", "package.json"),
  );
  try {
    bffRequire.resolve("pg");
  } catch {
    throw new ReleaseRehearsalError(
      "The PostgreSQL driver (pg) is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal.",
    );
  }

  for (const service of services) {
    const appRequire = createRequire(
      path.join(repositoryRoot, "apps", service.app, "package.json"),
    );
    try {
      appRequire.resolve("prisma/package.json");
    } catch {
      throw new ReleaseRehearsalError(
        `The Prisma CLI is not installed for apps/${service.app}. Run \`npm ci --prefix apps/${service.app}\` before this rehearsal.`,
      );
    }
  }
}

function loadClient() {
  const bffRequire = createRequire(
    path.join(repositoryRoot, "apps", "bff", "package.json"),
  );
  return bffRequire("pg").Client;
}

/**
 * Executa a CLI do Prisma de um servico contra o banco descartavel dele.
 * A URL vive apenas no ambiente deste subprocesso: nenhum passo seguinte do
 * gate herda um DATABASE_URL diferente. A saida e capturada e redigida antes
 * de ser impressa.
 *
 * Comando entregue como string unica ao shell porque `npx` no Windows e um
 * script `.cmd` e o Node recusa executa-lo sem shell.
 */
function runPrisma(service, args) {
  const env = { ...process.env, DATABASE_URL: service.url, DIRECT_DATABASE_URL: service.url };
  // A IA declara `shadowDatabaseUrl` no `prisma.config.ts`; nenhum comando
  // usado aqui precisa de banco de sombra (`migrate diff` compara um banco
  // concreto com um datamodel), e manter a variavel FORA do ambiente e o que
  // garante que um comando que passasse a precisar dela falhasse alto em vez
  // de escolher um banco por conta.
  delete env.SHADOW_DATABASE_URL;

  const outcome = spawnSync(`npx prisma ${args.join(" ")}`, {
    cwd: path.join(repositoryRoot, "apps", service.app),
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

async function recreateDatabase(Client, maintenanceUrl, database) {
  const maintenance = new Client({ connectionString: maintenanceUrl });
  await maintenance.connect();
  try {
    // Identificador citado: o nome ja passou pela allowlist de descarte.
    const quoted = `"${database.replace(/"/gu, '""')}"`;
    // FORCE derruba conexao remanescente de uma execucao anterior; sem isso o
    // DROP falharia e o ensaio aplicaria migrations sobre banco ja povoado,
    // que e exatamente o que ele nao pode fazer.
    await maintenance.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${quoted}`);
    // Mesmo motivo de `provision-scheduling-test-database.mjs`: producao roda
    // em UTC e o cluster descartavel herda o fuso da maquina.
    await maintenance.query(`ALTER DATABASE ${quoted} SET TimeZone = 'UTC'`);
  } finally {
    await maintenance.end();
  }
}

/**
 * Recusa, ANTES de criar banco, quando o servidor nao oferece uma extensao que
 * o historico exige. Exit 2 com mensagem propria, nunca skip: um servidor sem
 * pgvector nao recebe o servico de IA, e o ensaio nao pode fingir que recebe.
 */
export async function assertExtensionsAvailable(Client, maintenanceUrl, required) {
  if (required.length === 0) return;
  const maintenance = new Client({ connectionString: maintenanceUrl });
  await maintenance.connect();
  let available;
  try {
    const result = await maintenance.query(
      "SELECT name FROM pg_available_extensions WHERE name = ANY($1::text[])",
      [required],
    );
    available = result.rows.map((row) => row.name);
  } finally {
    await maintenance.end();
  }

  const missing = required.filter((name) => !available.includes(name));
  if (missing.length > 0) {
    throw new ReleaseRehearsalError(
      `The target server does not offer the extension(s) ${missing.join(", ")}, which the versioned migrations require through CREATE EXTENSION. ` +
        "No migration can install a server extension: it has to be present in the PostgreSQL installation first — in this rehearsal and in production alike. " +
        "Install it (pgvector ships the `vector` extension) and run the rehearsal again.",
    );
  }
}

async function withClient(Client, service, run) {
  const client = new Client({ connectionString: service.url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function migrationRows(Client, service) {
  return withClient(Client, service, async (client) => {
    const result = await client.query(`
      SELECT "migration_name", "checksum",
             "finished_at"::text AS "finished_at",
             "rolled_back_at"::text AS "rolled_back_at",
             "applied_steps_count"
      FROM "_prisma_migrations"
      ORDER BY "migration_name"
    `);
    return result.rows;
  });
}

async function tableCount(Client, service) {
  return withClient(Client, service, async (client) => {
    const result = await client.query(`
      SELECT COUNT(*)::int AS total
      FROM information_schema.tables
      WHERE "table_schema" = 'public' AND "table_type" = 'BASE TABLE'
    `);
    return result.rows[0].total;
  });
}

/** Caminho e nomes de migration de um servico, lidos da arvore. */
export function serviceMigrations(service) {
  const migrationsPath = path.join(
    repositoryRoot,
    "apps",
    service.app,
    "prisma",
    "migrations",
  );
  return { migrationsPath, directories: readMigrationDirectories(migrationsPath) };
}

export async function rehearseService(Client, service, directories) {
  if (
    !assert(
      directories.length > 0,
      `${service.name}: no migration directory was read from the tree — the expected count comes from the tree, and an empty tree proves nothing`,
    )
  ) {
    return;
  }

  console.log(
    `\ngoal028:release-rehearsal ${service.name}: ${directories.length} migration(s) declared in apps/${service.app}/prisma/migrations, target ${service.label}`,
  );

  // O banco precisa comecar REALMENTE vazio: a prova e de historico completo.
  const empty = await tableCount(Client, service);
  if (
    !assert(
      empty === 0,
      `${service.name}: the rehearsal database must start empty, found ${empty} table(s) in schema public`,
    )
  ) {
    return;
  }

  // ---- (a)/(b) historico completo, do zero, em banco vazio.
  const first = runPrisma(service, ["migrate", "deploy"]);
  if (
    !assert(
      first.status === 0,
      `${service.name}: prisma migrate deploy must apply the whole history on an empty database, exit ${first.status}\n${first.output}`,
    )
  ) {
    return;
  }

  const rows = await migrationRows(Client, service);
  console.log(
    `goal028:release-rehearsal ${service.name}: applied ${rows.length} of ${directories.length} migration(s) read from the tree, ` +
      `${rows.filter((row) => row.finished_at !== null).length} finished, ` +
      `${rows.filter((row) => row.rolled_back_at !== null).length} rolled back`,
  );
  const problems = compareAppliedMigrations(directories, rows);
  if (
    !assert(
      problems.length === 0,
      `${service.name}: the applied history does not match the tree — ${problems.join("; ")}`,
    )
  ) {
    return;
  }

  const tables = await tableCount(Client, service);
  assert(
    tables > 1,
    `${service.name}: the migrated database must hold real tables beyond _prisma_migrations, found ${tables}`,
  );

  // ---- (c) idempotencia: a segunda execucao nao aplica nada e nao falha.
  const fingerprint = migrationsFingerprint(rows);
  const second = runPrisma(service, ["migrate", "deploy"]);
  assert(
    second.status === 0,
    `${service.name}: re-running prisma migrate deploy on the same database must not fail, exit ${second.status}\n${second.output}`,
  );
  const rowsAfter = await migrationRows(Client, service);
  assert(
    JSON.stringify(migrationsFingerprint(rowsAfter)) ===
      JSON.stringify(fingerprint),
    `${service.name}: re-running prisma migrate deploy must not apply a single migration — _prisma_migrations changed`,
  );
  assert(
    rowsAfter.length === directories.length,
    `${service.name}: re-running prisma migrate deploy must leave ${directories.length} row(s) in _prisma_migrations, found ${rowsAfter.length}`,
  );

  // ---- (d) ausencia de drift entre o banco migrado e o schema.prisma.
  //
  // `--exit-code` transforma o diff em veredito: 0 vazio, 2 nao vazio, 1 erro.
  // O destino e o datamodel, entao nenhum banco de sombra e necessario.
  const drift = runPrisma(service, [
    "migrate",
    "diff",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--exit-code",
  ]);
  if (drift.status === 1 || drift.status === null) {
    assert(
      false,
      `${service.name}: prisma migrate diff could not compare the migrated database with schema.prisma\n${drift.output}`,
    );
    return;
  }
  if (
    assert(
      drift.status === 0,
      `${service.name}: the migrated database DRIFTED from prisma/schema.prisma. Correct it with a NEW additive migration, never by editing a migration already versioned — editing one changes its checksum and breaks every database where it was already applied.\n${drift.output}`,
    )
  ) {
    console.log(
      `goal028:release-rehearsal ${service.name}: no drift between the migrated database and prisma/schema.prisma`,
    );
  }
}

export async function rehearse(plan) {
  const Client = loadClient();
  for (const service of plan.services) {
    const { migrationsPath, directories } = serviceMigrations(service);
    // A recusa por extensao ausente vem ANTES de criar banco: nada de deixar
    // um banco pela metade quando o servidor nunca poderia receber o servico.
    await assertExtensionsAvailable(
      Client,
      plan.maintenance,
      readRequiredExtensions(migrationsPath, directories),
    );
    await recreateDatabase(Client, plan.maintenance, service.database);
    await rehearseService(Client, service, directories);
    // A primeira falha interrompe: os servicos seguintes ficam sem executar em
    // vez de somar ruido a um ensaio ja reprovado.
    if (process.exitCode) return;
  }
}

export async function main() {
  let plan;
  try {
    assertRequiredBinaries();
    plan = resolveRehearsalPlan();
  } catch (error) {
    if (error instanceof ReleaseRehearsalError) refuse(error.message);
    throw error;
  }

  console.log(
    `goal028:release-rehearsal target server: ${plan.host}:${plan.port} (one disposable database per service)`,
  );

  try {
    await rehearse(plan);
  } catch (error) {
    if (error instanceof ReleaseRehearsalError) refuse(error.message);
    console.error(
      `goal028:release-rehearsal FAILED — ${redactConnectionStrings(error.stack ?? error.message)}`,
    );
    process.exitCode = 1;
  }

  if (process.exitCode) {
    console.error(
      "goal028:release-rehearsal FAILED — see the assertions above.",
    );
  } else {
    console.log(
      "\ngoal028:release-rehearsal PASSED — for the BFF, the AI orchestrator and the Scheduling service, the complete " +
        "versioned migration history applies from scratch on an empty disposable database; the number of rows in " +
        "_prisma_migrations matches the number of migration directories read from the tree, name by name; no row is " +
        "rolled back and every counted row is finished with at least one applied step; a second prisma migrate deploy " +
        "on the same database applies nothing and does not fail; and prisma migrate diff reports no drift between the " +
        "migrated database and the service schema.prisma.",
    );
  }
}

if (isMain(import.meta.url)) await main();
