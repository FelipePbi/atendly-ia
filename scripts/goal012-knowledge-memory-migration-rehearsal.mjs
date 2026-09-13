#!/usr/bin/env node

// Ensaio da migration do Goal012 (WU-01) na IA: conhecimento por servico
// (`KnowledgeDocument.serviceId`), memoria do cliente (`CustomerMemory`) e
// proposito do AiRun (`AiRun.kind`).
//
// Banco descartavel proprio, derivado de BFF_TEST_DATABASE_URL. Nenhum banco
// de app e tocado.
//
// O que o ensaio prova:
//   1. a migration e aditiva: nenhuma linha legada de AiRun ou
//      KnowledgeDocument muda de valor em qualquer coluna pre-existente;
//      documento legado nasce sem `serviceId` (geral) e turno legado nasce
//      `kind = 'TURN'`, os dois so por default, sem UPDATE explicito;
//      `CustomerMemory` e tabela nova, sem estoque legado para preservar;
//   2. leitura do legado depois do corte: um documento sem `serviceId`
//      continua legivel pelo conjunto de colunas que o binario anterior
//      conhecia, e um turno sem `kind` explicito continua defaultando para
//      `TURN` — a mesma escrita que o binario anterior faz hoje;
//   3. a migration e retomavel: reaplicada sobre o estado ja migrado, nao
//      muda nenhuma linha nem lanca erro;
//   4. o ensaio nunca depende da extensao `vector`: a migration nao toca
//      `KnowledgeChunk`, entao o schema legado deste ensaio cria
//      `KnowledgeDocument` sem `KnowledgeChunk` — pulo nomeado, registrado
//      no console.
//
// Expande tambem o banco de durabilidade da IA (`${database}_goal004`, o que
// `goal004-migration-rehearsal.mjs` deixa pronto) com a mesma migration,
// criando primeiro o `KnowledgeDocument` minimo que esse banco ainda nao tem
// (ele nasce sem nenhuma tabela de conhecimento) — de novo sem
// `KnowledgeChunk`, mesmo pulo nomeado.
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

const MIGRATION_SQL = path.join(
  repositoryRoot,
  "apps",
  "ai-orchestrator",
  "prisma",
  "migrations",
  "20260913130000_goal012_knowledge_service_customer_memory_ai_run_kind",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal012:knowledge-memory-migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal012`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema da IA como estava antes deste Goal, reduzido as tabelas que a
// migration toca e as suas dependencias de FK. `KnowledgeChunk` fica de fora
// de proposito: exige a extensao `vector`, que este ensaio nunca instala, e a
// migration do Goal012 nao a altera — pulo nomeado.
const LEGACY_SCHEMA = `
CREATE TYPE "ChannelProvider" AS ENUM ('EVOLUTION_GO');
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'HUMAN_HANDOFF', 'CLOSED');
CREATE TYPE "AiRunStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');
CREATE TYPE "KnowledgeDocumentType" AS ENUM ('FAQ', 'GUIDANCE', 'CARE', 'PROCEDURE', 'BUSINESS_INFO', 'TEXT_POLICY');
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "ChannelConnection" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "ChannelProvider" NOT NULL,
  "externalInstanceId" TEXT NOT NULL,
  "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "credentialVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelConnection_tenantId_id_key" UNIQUE ("tenantId", "id")
);

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "externalContactId" TEXT NOT NULL,
  "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_tenantId_channelId_id_key" UNIQUE ("tenantId", "channelId", "id"),
  CONSTRAINT "Conversation_channel_fkey" FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE
);

CREATE TABLE "AiRun" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "inputMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "AiRunStatus" NOT NULL DEFAULT 'STARTED',
  "outputText" TEXT,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AiRun_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "AiRun_channel_fkey" FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE,
  CONSTRAINT "AiRun_conversation_fkey" FOREIGN KEY ("tenantId", "channelId", "conversationId") REFERENCES "Conversation"("tenantId", "channelId", "id") ON DELETE CASCADE
);

CREATE TABLE "KnowledgeDocument" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "type" "KnowledgeDocumentType" NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeDocument_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "KnowledgeDocument_tenantId_type_source_version_key" UNIQUE ("tenantId", "type", "source", "version")
);
`;

// Um canal/conversa de apoio, dois turnos legados (um sucedido, um falho) e
// dois documentos legados (um FAQ, uma politica de texto) — nenhum dos dois
// jamais teve nocao de servico.
const FIXTURE = `
INSERT INTO "ChannelConnection" ("id", "tenantId", "userId", "provider", "externalInstanceId") VALUES
  ('channel-legacy', 'tenant-legacy', 'user-legacy', 'EVOLUTION_GO', 'instance-legacy');

INSERT INTO "Conversation" ("id", "tenantId", "channelId", "externalContactId") VALUES
  ('conversation-legacy', 'tenant-legacy', 'channel-legacy', '5511999999999');

INSERT INTO "AiRun" ("id", "tenantId", "channelId", "conversationId", "provider", "model", "promptVersion", "status", "outputText") VALUES
  ('run-legacy-1', 'tenant-legacy', 'channel-legacy', 'conversation-legacy', 'openai', 'gpt-4o', 'scheduling_v1.0.0', 'SUCCEEDED', 'ok'),
  ('run-legacy-2', 'tenant-legacy', 'channel-legacy', 'conversation-legacy', 'openai', 'gpt-4o', 'scheduling_v1.0.0', 'FAILED', NULL);

INSERT INTO "KnowledgeDocument" ("id", "tenantId", "type", "title", "source", "version", "checksum") VALUES
  ('doc-legacy-1', 'tenant-legacy', 'FAQ', 'Perguntas frequentes', 'faq.md', 'v1', 'checksum-faq-v1'),
  ('doc-legacy-2', 'tenant-legacy', 'TEXT_POLICY', 'Politica de cancelamento', 'policy.md', 'v1', 'checksum-policy-v1');
`;

// Schema minimo de `KnowledgeDocument` para o banco de durabilidade (Goal004),
// que nasce sem nenhuma tabela de conhecimento. Sem `KnowledgeChunk` — pulo
// nomeado, mesma razao do schema legado acima. Guardas idempotentes porque o
// banco de durabilidade pode ja ter recebido este passo numa execucao anterior
// do gate.
const MINIMAL_KNOWLEDGE_DOCUMENT_SCHEMA = `
DO $$ BEGIN
    CREATE TYPE "KnowledgeDocumentType" AS ENUM ('FAQ', 'GUIDANCE', 'CARE', 'PROCEDURE', 'BUSINESS_INFO', 'TEXT_POLICY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "type" "KnowledgeDocumentType" NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeDocument_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "KnowledgeDocument_tenantId_type_source_version_key" UNIQUE ("tenantId", "type", "source", "version")
);
`;

function assert(condition, message) {
  if (!condition) {
    console.error(`goal012:knowledge-memory-migration-rehearsal FAILED — ${message}`);
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

// Contagens e fingerprints sem sonda: `probe-%` nunca entra na fixture nem nas
// contagens reconciliadas.
async function aiRunCount(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "AiRun" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return result.rows[0].total;
}

async function aiRunFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "status"::text, "outputText", "startedAt"::text, "completedAt"::text
    FROM "AiRun" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) => `${row.id}/${row.tenantId}/${row.status}/${row.outputText}/${row.startedAt}/${row.completedAt}`,
  );
}

async function aiRunKinds(client) {
  const result = await client.query(
    `SELECT "id", "kind"::text FROM "AiRun" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.id, row.kind]));
}

async function knowledgeDocumentCount(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "KnowledgeDocument" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return result.rows[0].total;
}

async function knowledgeDocumentFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "type"::text, "title", "source", "version", "checksum", "status"::text, "updatedAt"::text
    FROM "KnowledgeDocument" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) =>
      `${row.id}/${row.tenantId}/${row.type}/${row.title}/${row.source}/${row.version}/${row.checksum}/${row.status}/${row.updatedAt}`,
  );
}

async function knowledgeDocumentServiceIds(client) {
  const result = await client.query(
    `SELECT "id", "serviceId" FROM "KnowledgeDocument" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.id, row.serviceId]));
}

async function rehearse(target) {
  console.log(`goal012:knowledge-memory-migration-rehearsal target: ${target.label}`);
  console.log(
    "skipping the pgvector extension and KnowledgeChunk on purpose — the Goal012 migration does not touch chunks, " +
      "so proving KnowledgeDocument.serviceId, AiRun.kind and CustomerMemory does not require it",
  );
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(LEGACY_SCHEMA);
    await client.query(FIXTURE);

    const runsBefore = await aiRunCount(client);
    assert(runsBefore === 2, `the fixture must contain two AiRun rows, found ${runsBefore}`);
    const docsBefore = await knowledgeDocumentCount(client);
    assert(docsBefore === 2, `the fixture must contain two KnowledgeDocument rows, found ${docsBefore}`);

    const runFingerprintBefore = await aiRunFingerprint(client);
    const docFingerprintBefore = await knowledgeDocumentFingerprint(client);

    // Aditividade — aplica a migration real (WU-01), a mesma que roda em produção.
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    assert(applied === true, `the migration must apply cleanly: ${applied}`);

    assert((await aiRunCount(client)) === runsBefore, "the migration must not create or delete a single AiRun row");
    assert(
      (await knowledgeDocumentCount(client)) === docsBefore,
      "the migration must not create or delete a single KnowledgeDocument row",
    );

    assert(
      JSON.stringify(await aiRunFingerprint(client)) === JSON.stringify(runFingerprintBefore),
      "the migration must not touch any pre-existing AiRun column other than kind",
    );
    assert(
      JSON.stringify(await knowledgeDocumentFingerprint(client)) === JSON.stringify(docFingerprintBefore),
      "the migration must not touch any pre-existing KnowledgeDocument column other than serviceId",
    );

    const kindsAfter = await aiRunKinds(client);
    assert(
      kindsAfter["run-legacy-1"] === "TURN" && kindsAfter["run-legacy-2"] === "TURN",
      "every pre-existing AiRun row must default to kind TURN, with no explicit backfill",
    );

    const serviceIdsAfter = await knowledgeDocumentServiceIds(client);
    assert(
      serviceIdsAfter["doc-legacy-1"] === null && serviceIdsAfter["doc-legacy-2"] === null,
      "every pre-existing KnowledgeDocument row must stay general — serviceId null — after the migration",
    );

    const memoryTable = await client.query(`SELECT to_regclass('"CustomerMemory"') AS present`);
    assert(memoryTable.rows[0].present !== null, "the migration must create the CustomerMemory table");
    const memoryCount = await client.query(`SELECT COUNT(*)::int AS total FROM "CustomerMemory"`);
    assert(memoryCount.rows[0].total === 0, "CustomerMemory must start empty — it has no legacy stock to preserve");

    // Leitura do legado depois do corte: um binario anterior que so conhece as
    // colunas de antes do Goal012 continua escrevendo e lendo sem quebrar.
    await client.query(
      `INSERT INTO "KnowledgeDocument" ("id", "tenantId", "type", "title", "source", "version", "checksum") VALUES ('probe-doc-legacy-writer', 'tenant-legacy', 'FAQ', 'Documento novo sem servico', 'legacy-writer.md', 'v1', 'checksum-legacy-writer')`,
    );
    const legacyWriterServiceId = await client.query(
      `SELECT "serviceId" FROM "KnowledgeDocument" WHERE "id" = 'probe-doc-legacy-writer'`,
    );
    assert(
      legacyWriterServiceId.rows[0].serviceId === null,
      "a document written by a binary that does not know serviceId must stay general",
    );
    await client.query(`DELETE FROM "KnowledgeDocument" WHERE "id" = 'probe-doc-legacy-writer'`);

    await client.query(
      `INSERT INTO "AiRun" ("id", "tenantId", "channelId", "conversationId", "provider", "model", "promptVersion") VALUES ('probe-run-legacy-writer', 'tenant-legacy', 'channel-legacy', 'conversation-legacy', 'openai', 'gpt-4o', 'scheduling_v1.0.0')`,
    );
    const legacyWriterKind = await client.query(
      `SELECT "kind"::text FROM "AiRun" WHERE "id" = 'probe-run-legacy-writer'`,
    );
    assert(
      legacyWriterKind.rows[0].kind === "TURN",
      "an AiRun written by a binary that does not know kind must default to TURN",
    );
    await client.query(`DELETE FROM "AiRun" WHERE "id" = 'probe-run-legacy-writer'`);

    // Comportamento novo, depois do corte: documento ligado a um servico e
    // AiRun fora do turno normal.
    await client.query(
      `INSERT INTO "KnowledgeDocument" ("id", "tenantId", "type", "title", "source", "version", "checksum", "serviceId") VALUES ('probe-doc-with-service', 'tenant-legacy', 'PROCEDURE', 'Procedimento do servico X', 'service-x.md', 'v1', 'checksum-service-x', 'service-x')`,
    );
    const withService = await client.query(
      `SELECT "serviceId" FROM "KnowledgeDocument" WHERE "id" = 'probe-doc-with-service'`,
    );
    assert(withService.rows[0].serviceId === "service-x", "a document created after the cutover must accept an explicit serviceId");
    await client.query(`DELETE FROM "KnowledgeDocument" WHERE "id" = 'probe-doc-with-service'`);

    await client.query(
      `INSERT INTO "AiRun" ("id", "tenantId", "channelId", "conversationId", "provider", "model", "promptVersion", "kind") VALUES ('probe-run-suggestion', 'tenant-legacy', 'channel-legacy', 'conversation-legacy', 'openai', 'gpt-4o', 'scheduling_v1.0.0', 'SUGGESTION')`,
    );
    const suggestionRun = await client.query(
      `SELECT "kind"::text FROM "AiRun" WHERE "id" = 'probe-run-suggestion'`,
    );
    assert(suggestionRun.rows[0].kind === "SUGGESTION", "an AiRun created after the cutover must accept an explicit non-TURN kind");
    await client.query(`DELETE FROM "AiRun" WHERE "id" = 'probe-run-suggestion'`);

    await client.query(
      `INSERT INTO "CustomerMemory" ("id", "tenantId", "customerId", "kind", "value", "origin", "aiAllowed", "updatedAt") VALUES ('probe-memory-1', 'tenant-legacy', 'customer-legacy', 'allergy', 'alergia a latex', 'CUSTOMER_STATED', true, now())`,
    );
    const memoryRow = await client.query(`SELECT "value" FROM "CustomerMemory" WHERE "id" = 'probe-memory-1'`);
    assert(memoryRow.rows[0].value === "alergia a latex", "CustomerMemory must accept a basic write and read it back");
    await client.query(`DELETE FROM "CustomerMemory" WHERE "id" = 'probe-memory-1'`);

    assert((await aiRunCount(client)) === runsBefore, "probing new/legacy writes must leave the AiRun fixture count exactly as it was");
    assert(
      (await knowledgeDocumentCount(client)) === docsBefore,
      "probing new/legacy writes must leave the KnowledgeDocument fixture count exactly as it was",
    );

    // Retomada: reaplicar a migration nao muda nada nem lanca erro — a falha
    // real aqui seria a migration reescrever uma linha legada.
    const runFingerprintBeforeRetry = await aiRunFingerprint(client);
    const docFingerprintBeforeRetry = await knowledgeDocumentFingerprint(client);
    const retried = await applyMigrationFile(client, MIGRATION_SQL);
    assert(retried === true, `the migration must be resumable: ${retried}`);
    assert(
      JSON.stringify(await aiRunFingerprint(client)) === JSON.stringify(runFingerprintBeforeRetry),
      "reapplying the migration must not change a single AiRun row",
    );
    assert(
      JSON.stringify(await knowledgeDocumentFingerprint(client)) === JSON.stringify(docFingerprintBeforeRetry),
      "reapplying the migration must not change a single KnowledgeDocument row",
    );
    assert((await aiRunCount(client)) === runsBefore, "reapplying the migration must leave the AiRun row count unchanged");
    assert(
      (await knowledgeDocumentCount(client)) === docsBefore,
      "reapplying the migration must leave the KnowledgeDocument row count unchanged",
    );
  } finally {
    await client.end();
  }
}

/**
 * Expande o banco de durabilidade da IA (`AI_TEST_DATABASE_URL`, o
 * `_goal004` deixado pelo ensaio do Goal004 e expandido desde por
 * Goal005/006/011) com a migration deste Goal. Esse banco nasce sem qualquer
 * tabela de conhecimento — cria-se aqui apenas o `KnowledgeDocument` minimo de
 * que a migration precisa para se aplicar (ela altera essa tabela), sem
 * `KnowledgeChunk` (pulo nomeado, exige `vector`). Sem este passo a suite de
 * integração (`CustomerMemoryService` e qualquer AiRun com `kind` explicito)
 * rodaria contra um banco sem `CustomerMemory` nem `AiRun.kind`.
 */
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
      "durability target not provisioned yet — skipping the Goal012 schema expansion",
    );
    return;
  }
  try {
    const aiRunTable = await client.query(`SELECT to_regclass('"AiRun"') AS present`);
    if (!aiRunTable.rows[0].present) {
      console.log(
        "durability target has no AiRun table yet — skipping the Goal012 schema expansion",
      );
      return;
    }

    const knowledgeDocumentTable = await client.query(
      `SELECT to_regclass('"KnowledgeDocument"') AS present`,
    );
    if (!knowledgeDocumentTable.rows[0].present) {
      console.log(
        "durability target has no knowledge tables — creating a minimal KnowledgeDocument without KnowledgeChunk " +
          "(named skip: KnowledgeChunk requires the pgvector extension, which this disposable server never " +
          "installs, and the Goal012 migration does not touch it)",
      );
      await client.query(MINIMAL_KNOWLEDGE_DOCUMENT_SCHEMA);
    }

    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    if (applied !== true) {
      console.error(
        `goal012:knowledge-memory-migration-rehearsal FAILED — durability target expansion failed applying ${MIGRATION_SQL}: ${applied}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `durability target expanded with the Goal012 knowledge/memory migration: ${database}_goal004`,
    );
  } finally {
    await client.end();
  }
}

export async function main() {
  const target = rehearsalTarget(process.env);

  await rehearse(target);
  await prepareAiDurabilityTarget(target);

  if (process.exitCode) {
    console.error("goal012:knowledge-memory-migration-rehearsal FAILED — see the assertions above.");
  } else {
    console.log(
      "goal012:knowledge-memory-migration-rehearsal PASSED — KnowledgeDocument.serviceId, CustomerMemory and " +
        "AiRun.kind are additive, legacy rows stay untouched with the declared defaults, legacy and new write " +
        "shapes both stay readable, and the migration is resumable without changing state — no pgvector required.",
    );
  }
}

if (isMain(import.meta.url)) await main();
