#!/usr/bin/env node

// Ensaio das quatro migrations do Goal023 (retencao configuravel e purga de
// conteudo multistore) nos tres bancos que elas tocam: BFF (WU-01
// `RetentionSettings`, WU-05 `RetentionSweepState`), IA (WU-02
// `Conversation.contentExpiredThrough`) e Scheduling (WU-03 indice de
// `AppointmentNotificationIntent`).
//
// Tres bancos descartaveis proprios, derivados de BFF_TEST_DATABASE_URL,
// cada um reconstruindo so o pedaco de esquema legado de que a migration
// depende. Nenhum banco de app real e tocado.
//
// O que este ensaio prova, e que nenhum dos ensaios de migration anteriores
// prova para ESTAS quatro migrations: RETOMADA. Toda migration deste Goal
// foi escrita com `IF NOT EXISTS`/guarda `duplicate_object` justamente para
// corrigir a divergencia que o review022 registrou (a migration do Goal022
// falha ao reaplicar — ver `goal022-notification-center-migration-
// rehearsal.mjs`, que documenta essa lacuna e explicitamente nao a fecha).
// Aqui, cada migration e aplicada duas vezes sobre o mesmo banco: a segunda
// aplicacao precisa passar sem erro e sem mudar uma linha sequer — e assim
// que uma aplicacao interrompida no meio termina na retomada, em vez de
// travar com "already exists".
//
// Tambem prova, en passant, o que toda migration aditiva deste repositorio
// precisa provar: nenhuma linha preexistente muda e as tabelas novas nascem
// vazias (sem backfill fabricado).
//
// Nenhuma credencial aparece na saida: so contagens e rotulos. Sondas
// (`probe-%`) nunca entram nas contagens de fixture.

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

function migrationFile(app, name) {
  return path.join(
    repositoryRoot,
    "apps",
    app,
    "prisma",
    "migrations",
    name,
    "migration.sql",
  );
}

const BFF_MIGRATIONS = [
  migrationFile("bff", "20260915150000_goal023_retention"),
  migrationFile("bff", "20260915180000_goal023_retention_sweep"),
];

const AI_MIGRATIONS = [
  migrationFile(
    "ai-orchestrator",
    "20260915160000_goal023_conversation_content_expiry",
  ),
];

const SCHEDULING_MIGRATIONS = [
  migrationFile(
    "scheduling-service",
    "20260915170000_goal023_notification_content_retention_index",
  ),
];

function refuse(message) {
  console.error(`goal023:retention-migration-rehearsal REFUSED — ${message}`);
  process.exit(2);
}

export function rehearsalTarget(environment = process.env, kind) {
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

  const name = `${database}_goal023_${kind}`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema legado do BFF: so `Tenant`, de que as duas migrations dependem por
// FK. O resto do dominio do BFF fica de fora de proposito.
const BFF_LEGACY_SCHEMA = `
CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

// Tres negocios: dois sobrevivem, um e removido para observar a cascata.
const BFF_FIXTURE = `
INSERT INTO "Tenant" ("id", "name") VALUES
  ('tenant-um', 'Negocio Um'),
  ('tenant-dois', 'Negocio Dois'),
  ('tenant-a-remover', 'Negocio A Remover');
`;

// Schema legado da IA: so o suficiente de `Conversation` para a coluna
// aditiva. Sem FK para ChannelConnection/Contact — este ensaio nao depende
// deles porque a migration tambem nao depende.
const AI_LEGACY_SCHEMA = `
CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "externalContactId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const AI_FIXTURE = `
INSERT INTO "Conversation" ("id", "tenantId", "channelId", "externalContactId") VALUES
  ('conv-um', 'tenant-um', 'channel-um', 'contact-externo-um'),
  ('conv-dois', 'tenant-dois', 'channel-dois', 'contact-externo-dois');
`;

// Schema legado do Scheduling: so o pedaco de `AppointmentNotificationIntent`
// de que o indice novo precisa (tenantId, state, settledAt), mais as colunas
// NOT NULL sem default que uma linha exige para existir. Sem FK para
// `Appointment` — a migration deste Goal nao a toca.
const SCHEDULING_LEGACY_SCHEMA = `
DO $$ BEGIN
    CREATE TYPE "AppointmentNotificationSlot" AS ENUM ('FIRST', 'SECOND', 'CHANGE_NOTICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AppointmentNotificationKind" AS ENUM ('REMINDER', 'CHANGE_NOTICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AppointmentNotificationState" AS ENUM (
        'PENDING', 'CLAIMED', 'SENT', 'FAILED', 'DISMISSED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE "AppointmentNotificationIntent" (
    "id"                 TEXT NOT NULL PRIMARY KEY,
    "tenantId"           TEXT NOT NULL,
    "appointmentId"      TEXT NOT NULL,
    "kind"               "AppointmentNotificationKind" NOT NULL,
    "slot"               "AppointmentNotificationSlot" NOT NULL,
    "appointmentVersion" INTEGER NOT NULL,
    "state"              "AppointmentNotificationState" NOT NULL DEFAULT 'PENDING',
    "dueAt"              TIMESTAMPTZ(3) NOT NULL,
    "settledAt"          TIMESTAMPTZ(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const SCHEDULING_FIXTURE = `
INSERT INTO "AppointmentNotificationIntent"
  ("id", "tenantId", "appointmentId", "kind", "slot", "appointmentVersion", "state", "dueAt", "settledAt") VALUES
  ('intent-pendente', 'tenant-um', 'appt-um', 'REMINDER', 'FIRST', 1, 'PENDING', now() + interval '1 day', NULL),
  ('intent-liquidada', 'tenant-um', 'appt-dois', 'REMINDER', 'FIRST', 1, 'SENT', now() - interval '1 day', now() - interval '1 day');
`;

function assert(condition, message) {
  if (!condition) {
    console.error(`goal023:retention-migration-rehearsal FAILED — ${message}`);
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

async function tableExists(client, table) {
  const result = await client.query(`SELECT to_regclass('"${table}"') AS present`);
  return result.rows[0].present !== null;
}

async function indexExists(client, index) {
  const result = await client.query(`SELECT to_regclass('"${index}"') AS present`);
  return result.rows[0].present !== null;
}

async function tenantColumnShape(client) {
  const result = await client.query(`
    SELECT "column_name", "data_type", "is_nullable", COALESCE("column_default", '-') AS "column_default"
    FROM information_schema.columns
    WHERE "table_name" = 'Tenant'
    ORDER BY "column_name"
  `);
  return result.rows.map(
    (row) =>
      `${row.column_name}/${row.data_type}/${row.is_nullable}/${row.column_default}`,
  );
}

async function tenantRows(client) {
  const result = await client.query(`
    SELECT "id", "name", "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
    FROM "Tenant" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return result.rows.map((row) => Object.values(row).join("/"));
}

async function rehearseBff(target) {
  console.log(`goal023:retention-migration-rehearsal (bff) target: ${target.label}`);
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(BFF_LEGACY_SCHEMA);
    await client.query(BFF_FIXTURE);

    assert((await countOf(client, "Tenant")) === 3, "the BFF fixture must contain three legacy tenants");
    const shapeBefore = await tenantColumnShape(client);
    const tenantsBefore = await tenantRows(client);

    // ---- Aplicacao limpa das duas migrations, na ordem real de producao.
    for (const migration of BFF_MIGRATIONS) {
      const applied = await applyMigrationFile(client, migration);
      assert(applied === true, `the BFF migration must apply cleanly on a fresh database: ${applied} (${migration})`);
    }

    assert(
      JSON.stringify(await tenantColumnShape(client)) === JSON.stringify(shapeBefore),
      "no pre-existing Tenant column may change type, nullability or default",
    );
    assert(
      JSON.stringify(await tenantRows(client)) === JSON.stringify(tenantsBefore),
      "the BFF migrations must not change a single pre-existing Tenant row",
    );

    for (const table of ["RetentionSettings", "RetentionSweepState"]) {
      assert(await tableExists(client, table), `the migration must create the ${table} table`);
      assert(
        (await countOf(client, table)) === 0,
        `${table} must start empty — no existing tenant gains a retroactive row`,
      );
    }

    // ---- Cascata: negocio removido leva as duas linhas de retencao com ele,
    //      dentro de uma transacao desfeita no fim.
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "RetentionSettings" ("tenantId", "updatedAt") VALUES ('tenant-a-remover', now())`,
    );
    await client.query(
      `INSERT INTO "RetentionSweepState" ("tenantId", "updatedAt") VALUES ('tenant-a-remover', now())`,
    );
    await client.query(`DELETE FROM "Tenant" WHERE "id" = 'tenant-a-remover'`);
    assert(
      (await countOf(client, "RetentionSettings", `WHERE "tenantId" = 'tenant-a-remover'`)) === 0,
      "removing a tenant must cascade its RetentionSettings row away",
    );
    assert(
      (await countOf(client, "RetentionSweepState", `WHERE "tenantId" = 'tenant-a-remover'`)) === 0,
      "removing a tenant must cascade its RetentionSweepState row away",
    );
    await client.query("ROLLBACK");

    // ---- RETOMADA: reaplicar as duas migrations sobre o banco ja migrado nao
    //      pode falhar nem mudar uma linha.
    const beforeRetry = await tenantRows(client);
    const beforeRetryCounts = {
      RetentionSettings: await countOf(client, "RetentionSettings"),
      RetentionSweepState: await countOf(client, "RetentionSweepState"),
    };
    for (const migration of BFF_MIGRATIONS) {
      const retried = await applyMigrationFile(client, migration);
      assert(retried === true, `the BFF migration must be resumable — reapplying it must not fail: ${retried} (${migration})`);
    }
    assert(
      JSON.stringify(await tenantRows(client)) === JSON.stringify(beforeRetry),
      "reapplying the BFF migrations must not change a single Tenant row",
    );
    for (const [table, before] of Object.entries(beforeRetryCounts)) {
      assert(
        (await countOf(client, table)) === before,
        `reapplying the BFF migrations must not change the row count of ${table}`,
      );
    }
  } finally {
    await client.end();
  }
}

async function conversationColumnShape(client) {
  const result = await client.query(`
    SELECT "column_name", "data_type", "is_nullable"
    FROM information_schema.columns
    WHERE "table_name" = 'Conversation' AND "column_name" != 'contentExpiredThrough'
    ORDER BY "column_name"
  `);
  return result.rows.map((row) => `${row.column_name}/${row.data_type}/${row.is_nullable}`);
}

async function conversationRows(client) {
  const result = await client.query(`
    SELECT "id", "tenantId", "channelId", "externalContactId", "status",
      "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
    FROM "Conversation" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return result.rows.map((row) => Object.values(row).join("/"));
}

async function rehearseAi(target) {
  console.log(`goal023:retention-migration-rehearsal (ai-orchestrator) target: ${target.label}`);
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(AI_LEGACY_SCHEMA);
    await client.query(AI_FIXTURE);

    assert((await countOf(client, "Conversation")) === 2, "the AI fixture must contain two legacy conversations");
    const shapeBefore = await conversationColumnShape(client);
    const rowsBefore = await conversationRows(client);

    // ---- Aplicacao limpa.
    const applied = await applyMigrationFile(client, AI_MIGRATIONS[0]);
    assert(applied === true, `the AI migration must apply cleanly on a fresh database: ${applied}`);

    const columnPresent = await client.query(`
      SELECT "is_nullable" FROM information_schema.columns
      WHERE "table_name" = 'Conversation' AND "column_name" = 'contentExpiredThrough'
    `);
    assert(columnPresent.rows.length === 1, "the migration must add the contentExpiredThrough column to Conversation");
    assert(columnPresent.rows[0].is_nullable === "YES", "contentExpiredThrough must be nullable — absence means nothing expired yet");

    assert(
      JSON.stringify(await conversationColumnShape(client)) === JSON.stringify(shapeBefore),
      "no other pre-existing Conversation column may change",
    );
    assert(
      JSON.stringify(await conversationRows(client)) === JSON.stringify(rowsBefore),
      "the migration must not change a single pre-existing Conversation row",
    );

    const backfilled = await countOf(client, "Conversation", `WHERE "contentExpiredThrough" IS NOT NULL`);
    assert(backfilled === 0, "no existing conversation may gain a fabricated contentExpiredThrough value — every row must start null");

    // ---- RETOMADA.
    const beforeRetry = await conversationRows(client);
    const retried = await applyMigrationFile(client, AI_MIGRATIONS[0]);
    assert(retried === true, `the AI migration must be resumable — reapplying it must not fail: ${retried}`);
    assert(
      JSON.stringify(await conversationRows(client)) === JSON.stringify(beforeRetry),
      "reapplying the AI migration must not change a single Conversation row",
    );
    assert(
      (await countOf(client, "Conversation", `WHERE "contentExpiredThrough" IS NOT NULL`)) === 0,
      "reapplying the AI migration must not fabricate a contentExpiredThrough value",
    );
  } finally {
    await client.end();
  }
}

// `AiToolCall` nunca fez parte do fixture hand-rolled de `_goal004`: o
// esquema legado do ensaio do Goal004 recria so o recorte de que a
// durabilidade precisa (`AiRun` incluso, `AiToolCall` nao) e nenhum Goal
// anterior precisou da tabela ali. Este Goal e o primeiro a rodar um teste
// (`test:ai-orchestrator-content-purge`, adicionado por este mesmo passo do
// gate) que cria `AiToolCall` contra esse banco — sem a tabela, o teste
// falha antes de exercitar qualquer regra de purga. Nao e uma migration: e o
// mesmo fixture que `AiRun`/`Handoff` ja usam em
// `goal004-migration-rehearsal.mjs`, replicado aqui porque so este Goal
// precisa dela em `_goal004`.
const AI_TOOL_CALL_FIXTURE = `
DO $$ BEGIN
    CREATE TYPE "ToolCallStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AiToolCall" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "aiRunId" TEXT NOT NULL,
  "externalCallId" TEXT,
  "name" TEXT NOT NULL,
  "arguments" JSONB NOT NULL,
  "result" JSONB,
  "status" "ToolCallStatus" NOT NULL DEFAULT 'STARTED',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

DO $$ BEGIN
    ALTER TABLE "AiToolCall"
        ADD CONSTRAINT "AiToolCall_tenantId_aiRunId_fkey"
        FOREIGN KEY ("tenantId", "aiRunId") REFERENCES "AiRun"("tenantId", "id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "AiToolCall_tenantId_aiRunId_createdAt_idx"
    ON "AiToolCall"("tenantId", "aiRunId", "createdAt");
`;

// Expande o banco de durabilidade da IA (`AI_TEST_DATABASE_URL`, o `_goal004`
// deixado pelo ensaio do Goal004 e expandido desde por todo Goal seguinte que
// toca o schema da IA) com a migration deste Goal. Sem isto,
// `test:ai-orchestrator-transport-durability` roda contra um schema mais
// velho do que o codigo: `resolveChannelConversation` seleciona
// `contentExpiredThrough` no upsert e o banco nao tem a coluna.
async function prepareAiDurabilityTarget(target) {
  const database = decodeURIComponent(
    target.maintenance.pathname.replace(/^\//u, ""),
  );
  const durability = new URL(target.maintenance.href);
  durability.pathname = `/${database}_goal004`;

  const client = new Client({ connectionString: durability.href });
  try {
    await client.connect();
  } catch {
    console.log(
      "durability target not provisioned yet — skipping the Goal023 AI schema expansion",
    );
    return;
  }
  try {
    const conversationTable = await client.query(
      `SELECT to_regclass('"Conversation"') AS present`,
    );
    if (!conversationTable.rows[0].present) {
      console.log(
        "durability target has no Conversation table yet — skipping the Goal023 AI schema expansion",
      );
      return;
    }

    const applied = await applyMigrationFile(client, AI_MIGRATIONS[0]);
    if (applied !== true) {
      console.error(
        `goal023:retention-migration-rehearsal FAILED — durability target expansion failed applying ${AI_MIGRATIONS[0]}: ${applied}`,
      );
      process.exitCode = 1;
      return;
    }

    const toolCallFixtureApplied = await applyMigrationSql(
      client,
      AI_TOOL_CALL_FIXTURE,
    );
    if (toolCallFixtureApplied !== true) {
      console.error(
        `goal023:retention-migration-rehearsal FAILED — durability target expansion failed creating AiToolCall: ${toolCallFixtureApplied}`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      `durability target expanded with the Goal023 contentExpiredThrough migration and the AiToolCall fixture: ${database}_goal004`,
    );
  } finally {
    await client.end();
  }
}

async function intentRows(client) {
  const result = await client.query(`
    SELECT "id", "tenantId", "state"::text, "settledAt"::text
    FROM "AppointmentNotificationIntent" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return result.rows.map((row) => Object.values(row).join("/"));
}

async function rehearseScheduling(target) {
  console.log(`goal023:retention-migration-rehearsal (scheduling-service) target: ${target.label}`);
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(SCHEDULING_LEGACY_SCHEMA);
    await client.query(SCHEDULING_FIXTURE);

    assert(
      (await countOf(client, "AppointmentNotificationIntent")) === 2,
      "the Scheduling fixture must contain two legacy notification intents",
    );
    const rowsBefore = await intentRows(client);

    const indexName = "AppointmentNotificationIntent_tenantId_state_settledAt_idx";
    assert(!(await indexExists(client, indexName)), "the index must not exist before the migration — otherwise the rehearsal proves nothing");

    // ---- Aplicacao limpa.
    const applied = await applyMigrationFile(client, SCHEDULING_MIGRATIONS[0]);
    assert(applied === true, `the Scheduling migration must apply cleanly on a fresh database: ${applied}`);
    assert(await indexExists(client, indexName), "the migration must create the tenantId/state/settledAt index");
    assert(
      JSON.stringify(await intentRows(client)) === JSON.stringify(rowsBefore),
      "an index-only migration must not change a single AppointmentNotificationIntent row",
    );

    // ---- RETOMADA: reaplicar um CREATE INDEX IF NOT EXISTS nao pode falhar.
    const retried = await applyMigrationFile(client, SCHEDULING_MIGRATIONS[0]);
    assert(retried === true, `the Scheduling migration must be resumable — reapplying it must not fail: ${retried}`);
    assert(await indexExists(client, indexName), "the index must still exist after reapplying the migration");
    assert(
      JSON.stringify(await intentRows(client)) === JSON.stringify(rowsBefore),
      "reapplying the Scheduling migration must not change a single row",
    );
  } finally {
    await client.end();
  }
}

export async function main() {
  const bffTarget = rehearsalTarget(process.env, "bff");
  const aiTarget = rehearsalTarget(process.env, "ai");
  const schedulingTarget = rehearsalTarget(process.env, "scheduling");

  await rehearseBff(bffTarget);
  await rehearseAi(aiTarget);
  await rehearseScheduling(schedulingTarget);
  await prepareAiDurabilityTarget(aiTarget);

  if (process.exitCode) {
    console.error("goal023:retention-migration-rehearsal FAILED — see the assertions above.");
  } else {
    console.log(
      "goal023:retention-migration-rehearsal PASSED — the four Goal023 migrations (BFF RetentionSettings/" +
        "RetentionSweepState, AI Conversation.contentExpiredThrough, Scheduling's tenantId/state/settledAt index) apply " +
        "cleanly on a fresh database, are additive and backfill-free, cascade correctly where a tenant FK exists, and — " +
        "the property none of the individual WU rehearsals for this Goal proves on its own — are RESUMABLE: reapplying " +
        "every one of them over an already-migrated database does not fail and does not change a single row.",
    );
  }
}

if (isMain(import.meta.url)) await main();
