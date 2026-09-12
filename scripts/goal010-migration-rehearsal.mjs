#!/usr/bin/env node

// Ensaio da migration do Goal010 (sessao de importacao unica) contra o
// estoque legado do protocolo de migracao bidirecional anterior.
//
// Reconstrói o schema do Scheduling como ele era ao fim do Goal009 para as
// tabelas que esta migration toca ou de que depende via FK
// (`IntegrationConnection`, `ExternalEntityMap`, `MigrationJob`,
// `MigrationConflict`), semeia MigrationJob legado em cinco estados
// diferentes — incluindo COMPLETED com e sem prova de importacao,
// FAILED, PARTIAL e um estado nao terminal — com MigrationConflict e
// ExternalEntityMap preenchidos, aplica a migration única deste Goal —
// aditiva, sem passo de corte — e reconcilia as contagens.
//
// O que o ensaio prova:
//   1. nenhuma linha existente de MigrationJob, MigrationConflict ou
//      ExternalEntityMap muda de valor, e nenhuma e criada ou apagada;
//   2. a classificacao do job legado (U-02) e conservadora: COMPLETED com
//      prova de importacao vira TECHNICAL_COMPLETED, COMPLETED sem prova
//      fica NEEDS_REVIEW, FAILED e PARTIAL viram TECHNICAL_FAILED e
//      TECHNICAL_INCOMPLETE, e o estado nao terminal fica NEEDS_REVIEW — e
//      nada disso cria uma `ImportSession`, muito menos uma com
//      `completedAt`: a conclusao real do negocio, tentada depois sobre o
//      mesmo tenant, continua disponivel e so ela consome o indice unico
//      parcial de conclusao;
//   3. os defaults novos (`legacyClass = UNCLASSIFIED`) e as constraints
//      novas aceitam todo o conteudo legado existente;
//   4. a migration e retomavel: reaplicada sobre o estado ja migrado, nao
//      muda nenhuma linha nem lanca erro; a classificacao, reaplicada sobre
//      jobs ja classificados, tambem nao muda nada.
//
// A classificacao aqui reproduz em SQL a mesma decisao pura de
// `classifyLegacyJob` (apps/scheduling-service/src/modules/migrations/
// legacy-job-reconciliation.ts, coberta em unidade por
// legacy-job-reconciliation.test.ts do Goal010/U-02): o ensaio nao importa
// TypeScript, entao a logica e reafirmada aqui para provar o comportamento
// de BANCO (constraints, indice de conclusao, preservacao), nao o algoritmo
// em si.
//
// Gates M0-M3 (inventario, expand, leitura/classificacao, reconciliacao) sao
// exercitados neste banco descartavel. M4 (corte contra a origem real) NAO
// e exercitado aqui: a origem e sempre dublê ou fixture, nunca existe
// credencial autorizada do Minha Agenda no ambiente, e nenhum tenant real e
// importado.
//
// Deixa o banco no estado pós-migration para a suíte de integração do
// Scheduling rodar sobre o resultado do ensaio. Nenhuma credencial aparece
// na saída: só contagens e rótulos, e os bytes de credencial da fixture são
// sintéticos.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  "20260910100000_goal010_import_session",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal010:migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal010`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema do Scheduling ao fim do Goal009, reduzido as tabelas que esta
// migration toca ou de que depende via FK.
const LEGACY_SCHEMA = `
CREATE TYPE "CalendarSource" AS ENUM ('ATENDLY', 'MINHA_AGENDA');
CREATE TYPE "IntegrationProvider" AS ENUM ('MINHA_AGENDA');
CREATE TYPE "ExternalEntityType" AS ENUM ('SERVICE', 'CUSTOMER', 'APPOINTMENT', 'AVAILABILITY');

CREATE TABLE "IntegrationConnection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" TEXT NOT NULL,
  "credentialsEncrypted" BYTEA NOT NULL,
  "config" JSONB NOT NULL,
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntegrationConnection_tenantId_status_idx" ON "IntegrationConnection"("tenantId", "status");
CREATE UNIQUE INDEX "IntegrationConnection_tenantId_provider_key" ON "IntegrationConnection"("tenantId", "provider");

CREATE TABLE "ExternalEntityMap" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "entityType" "ExternalEntityType" NOT NULL,
  "internalId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalEntityMap_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExternalEntityMap_tenantId_provider_entityType_internalId_idx" ON "ExternalEntityMap"("tenantId", "provider", "entityType", "internalId");
CREATE UNIQUE INDEX "ExternalEntityMap_tenantId_provider_entityType_externalId_key" ON "ExternalEntityMap"("tenantId", "provider", "entityType", "externalId");

CREATE TABLE "MigrationJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "source" "CalendarSource" NOT NULL,
  "target" "CalendarSource" NOT NULL,
  "status" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "currentStep" TEXT,
  "summary" JSONB,
  "warnings" JSONB NOT NULL DEFAULT '[]',
  "limitations" JSONB NOT NULL DEFAULT '[]',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MigrationJob_sources_check" CHECK ("source" <> "target")
);
CREATE INDEX "MigrationJob_tenantId_status_createdAt_idx" ON "MigrationJob"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "MigrationJob_tenantId_id_key" ON "MigrationJob"("tenantId", "id");

CREATE TABLE "MigrationConflict" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "migrationJobId" TEXT NOT NULL,
  "entityType" "ExternalEntityType" NOT NULL,
  "status" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationConflict_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MigrationConflict_tenantId_migrationJobId_fkey" FOREIGN KEY ("tenantId", "migrationJobId")
    REFERENCES "MigrationJob"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MigrationConflict_tenantId_migrationJobId_status_idx" ON "MigrationConflict"("tenantId", "migrationJobId", "status");
`;

/**
 * Estoque legado sintético: dois tenants, cinco estados de MigrationJob no
 * tenant-a (COMPLETED com prova, COMPLETED sem prova, FAILED, PARTIAL e um
 * estado não terminal), um MigrationConflict preso ao job COMPLETED sem
 * prova, e um ExternalEntityMap por tenant. tenant-b só prova isolamento e
 * não participa das asserções de classificação.
 */
const FIXTURE = `
INSERT INTO "IntegrationConnection" ("id", "tenantId", "provider", "status", "credentialsEncrypted", "config") VALUES
  ('conn-a', 'tenant-a', 'MINHA_AGENDA', 'DISCONNECTED', decode('00112233', 'hex'), '{}'::jsonb),
  ('conn-b', 'tenant-b', 'MINHA_AGENDA', 'DISCONNECTED', decode('44556677', 'hex'), '{}'::jsonb);

INSERT INTO "MigrationJob" ("id", "tenantId", "requestedBy", "source", "target", "status", "summary", "startedAt", "finishedAt") VALUES
  ('job-a-completed-proof', 'tenant-a', 'user-a', 'MINHA_AGENDA', 'ATENDLY', 'COMPLETED', '{"imported": {"services": 3}}'::jsonb, TIMESTAMP '2026-08-01 10:00:00', TIMESTAMP '2026-08-01 10:05:00'),
  ('job-a-completed-noproof', 'tenant-a', 'user-a', 'MINHA_AGENDA', 'ATENDLY', 'COMPLETED', '{"diagnosis": {}}'::jsonb, TIMESTAMP '2026-08-02 10:00:00', TIMESTAMP '2026-08-02 10:05:00'),
  ('job-a-failed', 'tenant-a', 'user-a', 'MINHA_AGENDA', 'ATENDLY', 'FAILED', NULL, TIMESTAMP '2026-08-03 10:00:00', TIMESTAMP '2026-08-03 10:02:00'),
  ('job-a-partial', 'tenant-a', 'user-a', 'MINHA_AGENDA', 'ATENDLY', 'PARTIAL', NULL, TIMESTAMP '2026-08-04 10:00:00', TIMESTAMP '2026-08-04 10:02:00'),
  ('job-a-running', 'tenant-a', 'user-a', 'MINHA_AGENDA', 'ATENDLY', 'RUNNING', NULL, TIMESTAMP '2026-08-05 10:00:00', NULL),
  ('job-b-completed-proof', 'tenant-b', 'user-b', 'MINHA_AGENDA', 'ATENDLY', 'COMPLETED', '{"imported": {"customers": 1}}'::jsonb, TIMESTAMP '2026-08-01 11:00:00', TIMESTAMP '2026-08-01 11:05:00');

INSERT INTO "MigrationConflict" ("id", "tenantId", "migrationJobId", "entityType", "status", "details") VALUES
  ('conflict-a-1', 'tenant-a', 'job-a-completed-noproof', 'SERVICE', 'OPEN', '{"reason": "duplicate_name"}'::jsonb);

INSERT INTO "ExternalEntityMap" ("id", "tenantId", "provider", "entityType", "internalId", "externalId") VALUES
  ('map-a-1', 'tenant-a', 'MINHA_AGENDA', 'SERVICE', 'svc-a-1', 'ext-svc-1'),
  ('map-b-1', 'tenant-b', 'MINHA_AGENDA', 'SERVICE', 'svc-b-1', 'ext-svc-2');
`;

// Mesma decisao pura de `classifyLegacyJob` (ver cabecalho): reafirmada em
// JS puro para gerar os UPDATEs do ensaio, sem importar TypeScript.
function classifyLegacyJob(status, summary) {
  if (status === "COMPLETED") {
    return hasImportProof(summary)
      ? { legacyClass: "TECHNICAL_COMPLETED", reviewReason: null }
      : {
          legacyClass: "NEEDS_REVIEW",
          reviewReason: "COMPLETED_WITHOUT_IMPORT_PROOF",
        };
  }
  if (status === "FAILED") {
    return { legacyClass: "TECHNICAL_FAILED", reviewReason: null };
  }
  if (status === "PARTIAL") {
    return { legacyClass: "TECHNICAL_INCOMPLETE", reviewReason: null };
  }
  return {
    legacyClass: "NEEDS_REVIEW",
    reviewReason: "STALE_NON_TERMINAL_STATUS",
  };
}

function hasImportProof(summary) {
  if (!summary || typeof summary !== "object") return false;
  return Boolean(summary.imported && typeof summary.imported === "object");
}

/** Inventario M0 — antes da migration. Sondas (`probe-%`) nunca contam. */
async function legacyInventory(client) {
  const jobs = await client.query(
    `SELECT COUNT(*)::int AS total FROM "MigrationJob" WHERE "id" NOT LIKE 'probe-%'`,
  );
  const conflicts = await client.query(
    `SELECT COUNT(*)::int AS total FROM "MigrationConflict" WHERE "id" NOT LIKE 'probe-%'`,
  );
  const maps = await client.query(
    `SELECT COUNT(*)::int AS total FROM "ExternalEntityMap" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return { jobs: jobs.rows[0].total, conflicts: conflicts.rows[0].total, maps: maps.rows[0].total };
}

/** Fingerprint linha a linha do que a migration nao pode tocar. */
async function jobFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "requestedBy", "source", "target", "status",
           "summary"::text, "startedAt"::text, "finishedAt"::text
    FROM "MigrationJob" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) =>
      `${row.tenantId}/${row.id}/${row.requestedBy}/${row.source}/${row.target}/${row.status}/${row.summary}/${row.startedAt}/${row.finishedAt}`,
  );
}

async function conflictFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "migrationJobId", "entityType", "status", "details"::text
    FROM "MigrationConflict" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) =>
      `${row.tenantId}/${row.id}/${row.migrationJobId}/${row.entityType}/${row.status}/${row.details}`,
  );
}

async function mapFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "provider", "entityType", "internalId", "externalId"
    FROM "ExternalEntityMap" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) =>
      `${row.tenantId}/${row.id}/${row.provider}/${row.entityType}/${row.internalId}/${row.externalId}`,
  );
}

/** Inventario pos-migration: mesmas contagens, mais o default de classe. */
async function inventory(client) {
  const base = await legacyInventory(client);
  const legacyClasses = await client.query(`
    SELECT "legacyClass", COUNT(*)::int AS total
    FROM "MigrationJob" WHERE "id" NOT LIKE 'probe-%'
    GROUP BY "legacyClass"
  `);
  return { ...base, legacyClasses: Object.fromEntries(legacyClasses.rows.map((r) => [r.legacyClass, r.total])) };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`goal010:migration-rehearsal FAILED — ${message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function applyMigrationFile(client, filePath) {
  await client.query("BEGIN");
  try {
    await client.query(readFileSync(filePath, "utf8"));
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    return error;
  }
}

async function rejects(client, sql) {
  try {
    await client.query(sql);
    return false;
  } catch {
    return true;
  }
}

async function classifyPending(client, classifiedBy) {
  const pending = await client.query(
    `SELECT "id", "tenantId", "status", "summary" FROM "MigrationJob" WHERE "legacyClass" = 'UNCLASSIFIED' AND "id" NOT LIKE 'probe-%'`,
  );
  for (const job of pending.rows) {
    const { legacyClass, reviewReason } = classifyLegacyJob(job.status, job.summary);
    await client.query(
      `UPDATE "MigrationJob" SET "legacyClass" = $1, "legacyClassifiedAt" = now(), "legacyClassifiedBy" = $2, "legacyReviewReason" = $3
       WHERE "tenantId" = $4 AND "id" = $5`,
      [legacyClass, classifiedBy, reviewReason, job.tenantId, job.id],
    );
  }
  return pending.rows.length;
}

async function main() {
  const target = rehearsalTarget();
  console.log(`goal010:migration-rehearsal target: ${target.label}`);

  const maintenance = new Client({ connectionString: target.maintenance.href });
  await maintenance.connect();
  await maintenance.query(`DROP DATABASE IF EXISTS "${target.name}"`);
  await maintenance.query(`CREATE DATABASE "${target.name}"`);
  await maintenance.end();

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(LEGACY_SCHEMA);
    await client.query(FIXTURE);

    // M0 — inventario legado, sem tocar nada ainda.
    const before = await legacyInventory(client);
    const jobsBefore = await jobFingerprint(client);
    const conflictsBefore = await conflictFingerprint(client);
    const mapsBefore = await mapFingerprint(client);
    console.log(
      `M0 inventory — jobs: ${before.jobs}; conflicts: ${before.conflicts}; entity maps: ${before.maps}`,
    );
    assert(before.jobs === 6, "the fixture must contain six MigrationJob rows across both tenants");
    assert(before.conflicts === 1, "the fixture must contain one MigrationConflict");
    assert(before.maps === 2, "the fixture must contain two ExternalEntityMap rows");

    // M1 — expand: migration unica e aditiva.
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    assert(applied === true, `migration must apply cleanly: ${applied}`);

    const after = await inventory(client);
    assert(
      after.jobs === before.jobs && after.conflicts === before.conflicts && after.maps === before.maps,
      "the migration must not add, remove or duplicate a single pre-existing MigrationJob, MigrationConflict or ExternalEntityMap row",
    );
    assert(
      JSON.stringify(await jobFingerprint(client)) === JSON.stringify(jobsBefore),
      "the migration must preserve every legacy MigrationJob's status, source/target and summary untouched",
    );
    assert(
      JSON.stringify(await conflictFingerprint(client)) === JSON.stringify(conflictsBefore),
      "the migration must preserve every legacy MigrationConflict untouched",
    );
    assert(
      JSON.stringify(await mapFingerprint(client)) === JSON.stringify(mapsBefore),
      "the migration must preserve every legacy ExternalEntityMap untouched",
    );
    assert(
      after.legacyClasses.UNCLASSIFIED === after.jobs,
      "every pre-existing MigrationJob row must default to legacyClass = UNCLASSIFIED, never presumed classified by the migration itself",
    );

    // Constraints novas aceitam o conteudo legado existente.
    const existingJobStillValid = !(await rejects(
      client,
      `UPDATE "MigrationJob" SET "status" = "status" WHERE "id" = 'job-a-completed-proof'`,
    ));
    assert(existingJobStillValid, "existing MigrationJob rows must satisfy the new schema without modification");

    // M2/M3 — leitura e reconciliacao: classifica os jobs legados (U-02).
    const classifiedCount = await classifyPending(client, "goal010-rehearsal");
    assert(classifiedCount === before.jobs, "classification must reach every legacy MigrationJob row");

    const classifications = await client.query(
      `SELECT "id", "legacyClass", "legacyReviewReason" FROM "MigrationJob" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"`,
    );
    const byId = Object.fromEntries(
      classifications.rows.map((row) => [row.id, { legacyClass: row.legacyClass, reviewReason: row.legacyReviewReason }]),
    );
    assert(
      byId["job-a-completed-proof"].legacyClass === "TECHNICAL_COMPLETED" && byId["job-a-completed-proof"].reviewReason === null,
      "a COMPLETED job with import proof in its summary must classify as TECHNICAL_COMPLETED",
    );
    assert(
      byId["job-a-completed-noproof"].legacyClass === "NEEDS_REVIEW" &&
        byId["job-a-completed-noproof"].reviewReason === "COMPLETED_WITHOUT_IMPORT_PROOF",
      "a COMPLETED job without import proof must be isolated for review, never presumed successful",
    );
    assert(byId["job-a-failed"].legacyClass === "TECHNICAL_FAILED", "a FAILED job must classify as TECHNICAL_FAILED");
    assert(byId["job-a-partial"].legacyClass === "TECHNICAL_INCOMPLETE", "a PARTIAL job must classify as TECHNICAL_INCOMPLETE");
    assert(
      byId["job-a-running"].legacyClass === "NEEDS_REVIEW" && byId["job-a-running"].reviewReason === "STALE_NON_TERMINAL_STATUS",
      "a job stuck in a non-terminal status must be isolated for review, never presumed complete or failed",
    );

    // A classificacao NUNCA cria conclusao de importacao: as duas tabelas
    // nao se comunicam, entao o job COMPLETED legado nao pode ter feito
    // nascer uma ImportSession, muito menos uma concluida.
    const sessionsAfterClassification = await client.query(
      `SELECT COUNT(*)::int AS total FROM "ImportSession" WHERE "tenantId" = 'tenant-a'`,
    );
    assert(
      sessionsAfterClassification.rows[0].total === 0,
      "classifying legacy MigrationJob rows must not create any ImportSession — the two tables are structurally disconnected",
    );

    // O direito de importacao do tenant continua disponivel: a conclusao
    // REAL, feita depois, e a unica que consome o indice unico parcial.
    const realCompletionAccepted = !(await rejects(
      client,
      `INSERT INTO "ImportSession" ("id", "tenantId", "sourceAccountId", "status", "completedAt", "completedBy", "createdBy")
       VALUES ('session-a-real-completion', 'tenant-a', 'account-a', 'COMPLETED', now(), 'rehearsal-user', 'rehearsal-user')`,
    ));
    assert(
      realCompletionAccepted,
      "the tenant's real import completion must still be accepted after its legacy jobs are classified — classification never consumes the business's right to import",
    );
    const secondCompletionRejected = await rejects(
      client,
      `INSERT INTO "ImportSession" ("id", "tenantId", "sourceAccountId", "status", "completedAt", "completedBy", "createdBy")
       VALUES ('session-a-second-completion', 'tenant-a', 'account-a', 'COMPLETED', now(), 'rehearsal-user', 'rehearsal-user')`,
    );
    assert(
      secondCompletionRejected,
      "a second completed ImportSession for the same tenant must be rejected by the partial unique index — the right is consumed exactly once",
    );

    // Classificacao e idempotente: reaplicar nao muda nada.
    const reclassifiedCount = await classifyPending(client, "goal010-rehearsal-retry");
    assert(reclassifiedCount === 0, "reclassifying must find no UNCLASSIFIED rows left and change nothing");
    const classificationsAfterRetry = await client.query(
      `SELECT "id", "legacyClass", "legacyClassifiedBy" FROM "MigrationJob" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"`,
    );
    assert(
      classificationsAfterRetry.rows.every((row) => row.legacyClassifiedBy === "goal010-rehearsal"),
      "reclassifying must not overwrite the author or class of an already classified job",
    );

    // Retomada da migration: reaplicar nao muda nada nem lanca erro. O
    // instantaneo de comparacao e tirado agora, depois da classificacao —
    // reaplicar a migration nao deve mexer no que a classificacao gravou.
    const beforeMigrationRetry = await inventory(client);
    const retried = await applyMigrationFile(client, MIGRATION_SQL);
    assert(retried === true, `migration must be resumable: ${retried}`);
    const afterRetry = await inventory(client);
    assert(
      JSON.stringify(afterRetry) === JSON.stringify(beforeMigrationRetry),
      "reapplying the migration must not change a single count nor any legacyClass already assigned",
    );

    if (process.exitCode) {
      console.error("goal010:migration-rehearsal FAILED — see the assertions above.");
    } else {
      console.log(
        "goal010:migration-rehearsal PASSED — every legacy MigrationJob, MigrationConflict and ExternalEntityMap row preserved, " +
          "legacy jobs classified conservatively without ever creating or consuming an import conclusion, and both the migration " +
          "and the classification proved resumable without changing state.",
      );
    }
  } finally {
    await client.end();
  }
}

await main();
