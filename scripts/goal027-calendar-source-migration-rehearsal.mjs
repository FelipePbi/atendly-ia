#!/usr/bin/env node

// Ensaio da migration do Goal027 (WU-01) no Scheduling: `CalendarSettings.
// source` passa a valer sempre `ATENDLY`, com uma CHECK constraint que recusa
// qualquer outro valor.
//
// Banco descartavel proprio, derivado de BFF_TEST_DATABASE_URL. Nenhum banco
// de app e tocado.
//
// Esta e a primeira migration deste repositorio que REESCREVE dado existente
// em vez de so acrescentar estrutura. Por isso o ensaio e mais estrito do que
// os dezessete anteriores num ponto especifico: ele nao se contenta em provar
// que a migration aplica — prova, coluna a coluna, EXATAMENTE o que mudou e o
// que nao mudou, e REPORTA a contagem de linhas reescritas em vez de deixar a
// reescrita acontecer em silencio.
//
// Reconstroi o recorte do schema do Scheduling que a migration toca
// (`CalendarSettings`, como esta ao fim do Goal023, com as regras de oferta do
// Goal009) ou de que o Goal depende para provar preservacao de historico
// (`MigrationJob`, com `source`/`target` legados e a classificacao do
// Goal010). O resto do dominio fica de fora de proposito.
//
// Os cinco casos semeados, e o que cada um prova:
//   (a) negocio ja `ATENDLY` — INTOCADO: nenhuma coluna muda, nem `updatedAt`;
//   (b) dois negocios `MINHA_AGENDA` — REESCRITOS para `ATENDLY`, e so
//       `source` e `updatedAt` mudam: `timezone`, `minLeadMinutes`,
//       `maxLeadDays`, `granularityMinutes` e `createdAt` ficam identicos;
//   (c) negocio SEM linha de `CalendarSettings` — continua sem: a migration
//       nao fabrica configuracao de agenda para quem nunca teve;
//   (d) `MigrationJob` com `source`/`target` legados — SOBREVIVE sem uma
//       unica alteracao, com `MINHA_AGENDA` ainda gravado, que e a razao de o
//       enum nao poder ser reduzido (D-026, Goal026);
//   (e) segunda execucao — SEM EFEITO: nao falha e nao muda uma linha sequer.
//
// E prova a trava por tentativa real contra o PostgreSQL, nao por leitura do
// SQL: um `UPDATE` de volta para `MINHA_AGENDA` e um `INSERT` novo com
// `MINHA_AGENDA` precisam ser recusados pelo banco com `check_violation`
// (SQLSTATE 23514) — e o mesmo `UPDATE` precisa ser ACEITO antes da migration,
// senao o ensaio nao estaria provando que a trava e nova.
//
// Prova, por fim, que nada foi apagado: o inventario de tabelas, colunas e
// valores de enum antes e depois da migration precisa ser identico.
//
// Nenhuma credencial aparece na saida: so contagens e rotulos, e toda fixture
// e sintetica. Sondas (`probe-%`) nunca entram nas contagens de fixture.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isMain } from "./lib/gate.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const require = createRequire(
  path.join(repositoryRoot, "apps", "bff", "package.json"),
);
const { Client } = require("pg");

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DISPOSABLE_NAME = /(?:^|[_-])test(?:[_-]|$)/iu;

const MIGRATION_SQL = path.join(
  repositoryRoot,
  "apps",
  "scheduling-service",
  "prisma",
  "migrations",
  "20260919120000_goal027_calendar_source_atendly",
  "migration.sql",
);

const CONSTRAINT_NAME = "CalendarSettings_source_atendly_check";
const CHECK_VIOLATION = "23514";

function refuse(message) {
  console.error(
    `goal027:calendar-source-migration-rehearsal REFUSED — ${message}`,
  );
  process.exit(2);
}

export function rehearsalTarget(environment = process.env) {
  const raw = environment.BFF_TEST_DATABASE_URL?.trim();
  if (!raw) refuse("BFF_TEST_DATABASE_URL is not set.");

  let url;
  try {
    url = new URL(raw);
  } catch {
    refuse("BFF_TEST_DATABASE_URL is not a valid URL.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!LOOPBACK_HOSTS.has(host)) refuse(`Host "${host}" is not loopback.`);

  const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!DISPOSABLE_NAME.test(database)) {
    refuse(`Database "${database}" is not recognised as disposable.`);
  }

  const name = `${database}_goal027`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Recorte do schema do Scheduling ao fim do Goal023: `CalendarSettings` com as
// regras de oferta do Goal009 (e a constraint daquele Goal, que precisa
// continuar valendo depois desta migration) e `MigrationJob` com a
// classificacao legada do Goal010. `MigrationConflict`, `ImportSession`,
// `Appointment` e o resto ficam de fora: a migration deste Goal nao os toca e
// o ensaio nao depende deles.
const LEGACY_SCHEMA = `
DO $$ BEGIN
    CREATE TYPE "CalendarSource" AS ENUM ('ATENDLY', 'MINHA_AGENDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "LegacyMigrationJobClass" AS ENUM (
        'UNCLASSIFIED', 'TECHNICAL_COMPLETED', 'TECHNICAL_INCOMPLETE',
        'TECHNICAL_FAILED', 'NEEDS_REVIEW'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE "CalendarSettings" (
    "tenantId"           TEXT NOT NULL,
    "source"             "CalendarSource" NOT NULL,
    "timezone"           TEXT NOT NULL,
    "minLeadMinutes"     INTEGER NOT NULL DEFAULT 0,
    "maxLeadDays"        INTEGER NOT NULL DEFAULT 90,
    "granularityMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSettings_pkey" PRIMARY KEY ("tenantId"),
    CONSTRAINT "CalendarSettings_offer_rules_check" CHECK (
        "granularityMinutes" BETWEEN 5 AND 120
        AND "granularityMinutes" % 5 = 0
        AND "minLeadMinutes" >= 0
        AND "maxLeadDays" > 0
        AND "minLeadMinutes" < "maxLeadDays" * 1440
    )
);

CREATE TABLE "MigrationJob" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "requestedBy"        TEXT NOT NULL,
    "source"             "CalendarSource" NOT NULL,
    "target"             "CalendarSource" NOT NULL,
    "status"             TEXT NOT NULL,
    "progress"           INTEGER NOT NULL DEFAULT 0,
    "currentStep"        TEXT,
    "summary"            JSONB,
    "warnings"           JSONB NOT NULL DEFAULT '[]',
    "limitations"        JSONB NOT NULL DEFAULT '[]',
    "errorCode"          TEXT,
    "errorMessage"       TEXT,
    "startedAt"          TIMESTAMP(3),
    "finishedAt"         TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacyClass"        "LegacyMigrationJobClass" NOT NULL DEFAULT 'UNCLASSIFIED',
    "legacyClassifiedAt" TIMESTAMP(3),
    "legacyClassifiedBy" TEXT,
    "legacyReviewReason" TEXT,

    CONSTRAINT "MigrationJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MigrationJob_sources_check" CHECK ("source" <> "target")
);
CREATE INDEX "MigrationJob_tenantId_status_createdAt_idx" ON "MigrationJob"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "MigrationJob_tenantId_id_key" ON "MigrationJob"("tenantId", "id");
`;

// Estoque legado sintetico. `updatedAt` e semeado explicitamente no passado, e
// distinto de `createdAt`, para que o avanco de `updatedAt` na linha reescrita
// seja observavel — e a ausencia dele na linha intocada, tambem.
const FIXTURE = `
INSERT INTO "CalendarSettings"
  ("tenantId", "source", "timezone", "minLeadMinutes", "maxLeadDays", "granularityMinutes", "createdAt", "updatedAt") VALUES
  ('tenant-atendly',           'ATENDLY',      'America/Sao_Paulo',  0, 90, 30, TIMESTAMP '2026-01-10 08:00:00', TIMESTAMP '2026-02-11 09:30:00'),
  ('tenant-minha-agenda-um',   'MINHA_AGENDA', 'America/Recife',    60, 45, 15, TIMESTAMP '2026-01-11 08:00:00', TIMESTAMP '2026-02-12 09:30:00'),
  ('tenant-minha-agenda-dois', 'MINHA_AGENDA', 'America/Manaus',    30, 30, 60, TIMESTAMP '2026-01-12 08:00:00', TIMESTAMP '2026-02-13 09:30:00');

INSERT INTO "MigrationJob"
  ("id", "tenantId", "requestedBy", "source", "target", "status", "summary", "startedAt", "finishedAt", "createdAt", "updatedAt", "legacyClass") VALUES
  ('job-legado-um',   'tenant-minha-agenda-um', 'user-um',   'MINHA_AGENDA', 'ATENDLY',      'COMPLETED', '{"imported": {"services": 3}}'::jsonb, TIMESTAMP '2026-08-01 10:00:00', TIMESTAMP '2026-08-01 10:05:00', TIMESTAMP '2026-08-01 09:59:00', TIMESTAMP '2026-08-01 10:05:00', 'TECHNICAL_COMPLETED'),
  ('job-legado-dois', 'tenant-sem-agenda',      'user-dois', 'MINHA_AGENDA', 'ATENDLY',      'FAILED',    NULL,                                   TIMESTAMP '2026-08-03 10:00:00', TIMESTAMP '2026-08-03 10:02:00', TIMESTAMP '2026-08-03 09:59:00', TIMESTAMP '2026-08-03 10:02:00', 'TECHNICAL_FAILED'),
  ('job-legado-tres', 'tenant-atendly',         'user-tres', 'ATENDLY',      'MINHA_AGENDA', 'PARTIAL',   NULL,                                   TIMESTAMP '2026-08-04 10:00:00', NULL,                            TIMESTAMP '2026-08-04 09:59:00', TIMESTAMP '2026-08-04 10:02:00', 'NEEDS_REVIEW');
`;

function assert(condition, message) {
  if (!condition) {
    console.error(
      `goal027:calendar-source-migration-rehearsal FAILED — ${message}`,
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function applyMigrationSql(client, sql) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    return error;
  }
}

async function applyMigrationFile(client, filePath) {
  return applyMigrationSql(client, readFileSync(filePath, "utf8"));
}

async function recreateDatabase(target) {
  const maintenance = new Client({ connectionString: target.maintenance.href });
  await maintenance.connect();
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS "${target.name}"`);
    await maintenance.query(`CREATE DATABASE "${target.name}"`);
  } finally {
    await maintenance.end();
  }
}

async function countOf(client, table, where = "") {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "${table}" ${where}`,
  );
  return result.rows[0].total;
}

/** Linha de `CalendarSettings` inteira, coluna a coluna, para comparacao. */
async function calendarSettingsRows(client) {
  const result = await client.query(`
    SELECT "tenantId", "source"::text AS "source", "timezone", "minLeadMinutes",
           "maxLeadDays", "granularityMinutes",
           "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
    FROM "CalendarSettings" WHERE "tenantId" NOT LIKE 'probe-%' ORDER BY "tenantId"
  `);
  return Object.fromEntries(result.rows.map((row) => [row.tenantId, { ...row }]));
}

/** Linha de `MigrationJob` inteira: o historico que nao pode ser tocado. */
async function migrationJobRows(client) {
  const result = await client.query(`
    SELECT "id", "tenantId", "requestedBy", "source"::text AS "source",
           "target"::text AS "target", "status", "progress",
           COALESCE("currentStep", '-') AS "currentStep",
           COALESCE("summary"::text, '-') AS "summary",
           "warnings"::text AS "warnings", "limitations"::text AS "limitations",
           COALESCE("errorCode", '-') AS "errorCode",
           COALESCE("errorMessage", '-') AS "errorMessage",
           COALESCE("startedAt"::text, '-') AS "startedAt",
           COALESCE("finishedAt"::text, '-') AS "finishedAt",
           "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt",
           "legacyClass"::text AS "legacyClass",
           COALESCE("legacyClassifiedAt"::text, '-') AS "legacyClassifiedAt",
           COALESCE("legacyClassifiedBy", '-') AS "legacyClassifiedBy",
           COALESCE("legacyReviewReason", '-') AS "legacyReviewReason"
    FROM "MigrationJob" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return result.rows.map((row) => Object.values(row).join("/"));
}

/** Inventario de tabela/coluna: nada pode desaparecer dele. */
async function columnInventory(client) {
  const result = await client.query(`
    SELECT "table_name", "column_name", "data_type", "is_nullable",
           COALESCE("column_default", '-') AS "column_default"
    FROM information_schema.columns
    WHERE "table_schema" = 'public'
    ORDER BY "table_name", "column_name"
  `);
  return result.rows.map((row) => Object.values(row).join("/"));
}

/** Inventario de enum: `MINHA_AGENDA` precisa continuar existindo. */
async function enumInventory(client) {
  const result = await client.query(`
    SELECT t."typname", e."enumlabel"
    FROM pg_type t JOIN pg_enum e ON e."enumtypid" = t."oid"
    ORDER BY t."typname", e."enumsortorder"
  `);
  return result.rows.map((row) => `${row.typname}.${row.enumlabel}`);
}

async function constraintExists(client, name) {
  const result = await client.query(
    `SELECT 1 FROM pg_constraint WHERE "conname" = $1`,
    [name],
  );
  return result.rowCount === 1;
}

/**
 * Executa um comando que DEVE ser recusado pelo banco e devolve o SQLSTATE.
 * A transacao e sempre desfeita: o ensaio nao deixa residuo do que tentou.
 */
async function refusedSqlState(client, sql) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("ROLLBACK");
    return null; // aceito — e isso que a assercao vai reprovar
  } catch (error) {
    await client.query("ROLLBACK");
    return error.code ?? "unknown";
  }
}

/** Executa um comando que DEVE ser aceito, sempre desfazendo em seguida. */
async function acceptedInRolledBackTransaction(client, sql) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("ROLLBACK");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    return error;
  }
}

export async function rehearse(target) {
  console.log(
    `goal027:calendar-source-migration-rehearsal target: ${target.label}`,
  );
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(LEGACY_SCHEMA);
    await client.query(FIXTURE);

    // ---- Estado legado: os cinco casos existem antes da migration.
    const before = await calendarSettingsRows(client);
    const jobsBefore = await migrationJobRows(client);
    const columnsBefore = await columnInventory(client);
    const enumsBefore = await enumInventory(client);

    assert(
      Object.keys(before).length === 3,
      "the fixture must contain three CalendarSettings rows (one ATENDLY, two MINHA_AGENDA)",
    );
    const legacyTenants = Object.values(before)
      .filter((row) => row.source === "MINHA_AGENDA")
      .map((row) => row.tenantId)
      .sort();
    assert(
      legacyTenants.length === 2,
      "the fixture must contain exactly two legacy MINHA_AGENDA rows — otherwise the rewrite count proves nothing",
    );
    assert(
      before["tenant-sem-agenda"] === undefined,
      "tenant-sem-agenda must start WITHOUT a CalendarSettings row — that is case (c)",
    );
    assert(
      (await countOf(
        client,
        "MigrationJob",
        `WHERE "source" = 'MINHA_AGENDA' OR "target" = 'MINHA_AGENDA'`,
      )) === 3,
      "the fixture must contain three MigrationJob rows carrying the legacy value — that is case (d)",
    );
    assert(
      !(await constraintExists(client, CONSTRAINT_NAME)),
      `${CONSTRAINT_NAME} must NOT exist before the migration — otherwise the rehearsal proves nothing about the lock`,
    );

    // A trava e NOVA: antes da migration, voltar uma linha para MINHA_AGENDA e
    // aceito pelo banco. Sem esta prova, o `23514` de depois poderia vir de
    // qualquer outra regra preexistente.
    const acceptedBefore = await acceptedInRolledBackTransaction(
      client,
      `UPDATE "CalendarSettings" SET "source" = 'MINHA_AGENDA' WHERE "tenantId" = 'tenant-atendly'`,
    );
    assert(
      acceptedBefore === true,
      `before the migration the database must still ACCEPT source = MINHA_AGENDA — got ${acceptedBefore}`,
    );

    // ---- Aplicacao limpa.
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    assert(
      applied === true,
      `the migration must apply cleanly on the legacy database: ${applied}`,
    );

    const after = await calendarSettingsRows(client);

    // ---- Contagem REPORTADA, nao silenciosa.
    const rewritten = Object.values(after).filter(
      (row) =>
        before[row.tenantId] !== undefined &&
        before[row.tenantId].source !== row.source,
    );
    console.log(
      `goal027:calendar-source-migration-rehearsal rewrote ${rewritten.length} of ` +
        `${Object.keys(before).length} CalendarSettings row(s) from MINHA_AGENDA to ATENDLY: ` +
        `${rewritten.map((row) => row.tenantId).sort().join(", ") || "(none)"}`,
    );
    assert(
      rewritten.length === legacyTenants.length,
      `the migration must rewrite exactly the ${legacyTenants.length} legacy rows, rewrote ${rewritten.length}`,
    );
    assert(
      (await countOf(client, "CalendarSettings", `WHERE "source" <> 'ATENDLY'`)) === 0,
      "no CalendarSettings row may survive with a source other than ATENDLY",
    );

    // ---- (a) negocio ja ATENDLY: INTOCADO, coluna a coluna, `updatedAt`
    //      inclusive.
    assert(
      JSON.stringify(after["tenant-atendly"]) ===
        JSON.stringify(before["tenant-atendly"]),
      "the already-ATENDLY row must be untouched — not even updatedAt may move",
    );

    // ---- (b) negocios MINHA_AGENDA: so `source` e `updatedAt` mudam.
    for (const tenantId of legacyTenants) {
      assert(
        after[tenantId].source === "ATENDLY",
        `${tenantId} must be rewritten to ATENDLY`,
      );
      for (const column of [
        "timezone",
        "minLeadMinutes",
        "maxLeadDays",
        "granularityMinutes",
        "createdAt",
      ]) {
        assert(
          after[tenantId][column] === before[tenantId][column],
          `the rewrite must not touch ${column} of ${tenantId}: ${before[tenantId][column]} -> ${after[tenantId][column]}`,
        );
      }
      assert(
        after[tenantId].updatedAt !== before[tenantId].updatedAt,
        `${tenantId} changed, so its updatedAt must move — a silent rewrite would leave it stale`,
      );
    }

    // ---- (c) negocio sem linha continua sem linha: nada e fabricado.
    assert(
      after["tenant-sem-agenda"] === undefined,
      "the migration must not fabricate a CalendarSettings row for a tenant that never had one",
    );
    assert(
      Object.keys(after).length === Object.keys(before).length,
      "the migration must not add or remove a single CalendarSettings row",
    );

    // ---- (d) historico de MigrationJob: nem uma linha alterada.
    assert(
      JSON.stringify(await migrationJobRows(client)) === JSON.stringify(jobsBefore),
      "the migration must not change a single MigrationJob row — source/target are preserved history (D-026)",
    );
    assert(
      (await countOf(
        client,
        "MigrationJob",
        `WHERE "source" = 'MINHA_AGENDA' OR "target" = 'MINHA_AGENDA'`,
      )) === 3,
      "every MigrationJob row must still carry its legacy MINHA_AGENDA value",
    );

    // ---- Nada apagado: tabela, coluna e valor de enum continuam todos la.
    assert(
      JSON.stringify(await columnInventory(client)) === JSON.stringify(columnsBefore),
      "no table or column may be dropped, retyped or renamed by this migration",
    );
    const enumsAfter = await enumInventory(client);
    assert(
      JSON.stringify(enumsAfter) === JSON.stringify(enumsBefore),
      "no enum value may be dropped by this migration",
    );
    assert(
      enumsAfter.includes("CalendarSource.ATENDLY") &&
        enumsAfter.includes("CalendarSource.MINHA_AGENDA"),
      "CalendarSource must keep BOTH values — MINHA_AGENDA survives for MigrationJob.source/target",
    );

    // ---- A trava, provada por tentativa REAL contra o banco.
    assert(
      await constraintExists(client, CONSTRAINT_NAME),
      `the migration must create the ${CONSTRAINT_NAME} constraint`,
    );
    const refusedUpdate = await refusedSqlState(
      client,
      `UPDATE "CalendarSettings" SET "source" = 'MINHA_AGENDA' WHERE "tenantId" = 'tenant-minha-agenda-um'`,
    );
    assert(
      refusedUpdate === CHECK_VIOLATION,
      `an UPDATE back to MINHA_AGENDA must be refused by the database with ${CHECK_VIOLATION}, got ${refusedUpdate}`,
    );
    const refusedInsert = await refusedSqlState(
      client,
      `INSERT INTO "CalendarSettings" ("tenantId", "source", "timezone", "updatedAt")
         VALUES ('probe-nova-fonte-externa', 'MINHA_AGENDA', 'America/Sao_Paulo', now())`,
    );
    assert(
      refusedInsert === CHECK_VIOLATION,
      `an INSERT of a new MINHA_AGENDA row must be refused by the database with ${CHECK_VIOLATION}, got ${refusedInsert}`,
    );
    // A trava nova nao pode ter engolido a do Goal009: granularidade invalida
    // continua recusada pelo mesmo `23514`.
    const refusedGranularity = await refusedSqlState(
      client,
      `UPDATE "CalendarSettings" SET "granularityMinutes" = 7 WHERE "tenantId" = 'tenant-atendly'`,
    );
    assert(
      refusedGranularity === CHECK_VIOLATION,
      `CalendarSettings_offer_rules_check must keep refusing an invalid granularity, got ${refusedGranularity}`,
    );
    // E a escrita legitima continua passando: a trava recusa o valor morto,
    // nao a tabela.
    const stillWritable = await acceptedInRolledBackTransaction(
      client,
      `UPDATE "CalendarSettings" SET "timezone" = 'America/Bahia' WHERE "tenantId" = 'tenant-atendly'`,
    );
    assert(
      stillWritable === true,
      `a legitimate CalendarSettings write must still be accepted after the lock: ${stillWritable}`,
    );

    // ---- (e) segunda execucao: nao falha e nao muda uma linha.
    const beforeRetry = await calendarSettingsRows(client);
    const jobsBeforeRetry = await migrationJobRows(client);
    const retried = await applyMigrationFile(client, MIGRATION_SQL);
    assert(
      retried === true,
      `the migration must be idempotent — reapplying it must not fail: ${retried}`,
    );
    assert(
      JSON.stringify(await calendarSettingsRows(client)) ===
        JSON.stringify(beforeRetry),
      "reapplying the migration must not change a single CalendarSettings row — not even updatedAt",
    );
    assert(
      JSON.stringify(await migrationJobRows(client)) ===
        JSON.stringify(jobsBeforeRetry),
      "reapplying the migration must not change a single MigrationJob row",
    );
    assert(
      await constraintExists(client, CONSTRAINT_NAME),
      `${CONSTRAINT_NAME} must still exist after reapplying the migration`,
    );
    assert(
      JSON.stringify(await enumInventory(client)) === JSON.stringify(enumsBefore),
      "reapplying the migration must not drop an enum value",
    );
  } finally {
    await client.end();
  }
}

export async function main() {
  const target = rehearsalTarget();
  await rehearse(target);

  if (process.exitCode) {
    console.error(
      "goal027:calendar-source-migration-rehearsal FAILED — see the assertions above.",
    );
  } else {
    console.log(
      "goal027:calendar-source-migration-rehearsal PASSED — the Goal027 migration rewrites every legacy " +
        "CalendarSettings row from MINHA_AGENDA to ATENDLY and reports how many, leaves the already-ATENDLY row " +
        "untouched down to updatedAt, fabricates no row for a tenant that never had one, does not change a single " +
        "MigrationJob row (source/target keep their legacy value, which is why the enum keeps both), drops no table, " +
        "column, enum value or row, locks the dead value out through CalendarSettings_source_atendly_check — proved " +
        "by a real UPDATE and a real INSERT refused with 23514, against a value the same database accepted before " +
        "the migration — without swallowing the Goal009 offer-rules check, and is idempotent: a second run changes " +
        "nothing and does not fail.",
    );
  }
}

if (isMain(import.meta.url)) await main();
