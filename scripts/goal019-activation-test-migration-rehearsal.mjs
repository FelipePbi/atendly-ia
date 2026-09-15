#!/usr/bin/env node

// Ensaio da migration do Goal019 (WU-03) na IA: `ActivationTestRun` e
// `ActivationTestMilestone`, a execucao do teste real da ativacao.
//
// Banco descartavel proprio, derivado de BFF_TEST_DATABASE_URL. Nenhum banco
// de app e tocado.
//
// O que o ensaio prova:
//   1. a migration e estritamente aditiva: o estoque legado (vinculo, conversa
//      e mensagens de um tenant que ja existia) continua byte a byte igual, e
//      nenhuma coluna existente muda;
//   2. **nao ha backfill**: depois da migration, o tenant que ja existia
//      continua com ZERO execucoes de teste. Tenant sem execucao e "nunca
//      testou", nao "falhou", e nenhuma linha e fabricada para preencher tela;
//   3. o indice unico parcial garante no maximo UMA execucao viva por tenant:
//      a segunda insercao com `finishedAt` nulo e recusada pelo banco, e so
//      depois de a primeira terminar uma nova execucao e aceita;
//   4. marco sem fonte e impossivel: `factKind`/`factId` sao NOT NULL, entao
//      nem um caminho novo de codigo consegue afirmar progresso sem o fato que
//      o sustenta;
//   5. estado terminal e nao terminal sao valores distintos do mesmo enum, e
//      pausar (nao terminal) nao libera o tenant;
//   6. a migration e retomavel: reaplicada sobre o estado ja migrado, nao muda
//      nenhuma linha nem lanca erro.
//
// Expande tambem o banco de durabilidade da IA (`${database}_goal004`, o que
// `goal004-migration-rehearsal.mjs` deixa pronto e os Goals seguintes ja
// expandiram) com a mesma migration, antes da suite de persistencia.
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
  "20260914120000_goal019_activation_test_run",
  "migration.sql",
);

// Limpeza dos dados de teste (WU-004): migration aditiva sobre a mesma tabela.
// Ela entra aqui porque o banco de durabilidade da IA precisa das duas para
// que a suite de integracao da limpeza tenha onde rodar.
const CLEANUP_MIGRATION_SQL = path.join(
  repositoryRoot,
  "apps",
  "ai-orchestrator",
  "prisma",
  "migrations",
  "20260914130000_goal019_activation_test_cleanup",
  "migration.sql",
);

// Instancia de WhatsApp contra a qual o teste rodou: migration aditiva sobre a
// mesma tabela. Ela entra no ensaio pelo mesmo motivo que a limpeza — sem ela,
// a suite de integracao da execucao roda contra um schema mais velho do que o
// codigo, e o que falha e o driver, nao o produto.
const CHANNEL_INSTANCE_MIGRATION_SQL = path.join(
  repositoryRoot,
  "apps",
  "ai-orchestrator",
  "prisma",
  "migrations",
  "20260914140000_goal019_activation_test_channel_instance",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal019:activation-test-migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal019`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema da IA como esta antes deste Goal, reduzido ao que representa um
// tenant que ja usa o produto: vinculo, conversa e mensagens. A migration do
// Goal019 nao toca nenhuma destas tabelas — e exatamente isso que o ensaio
// verifica.
const LEGACY_SCHEMA = `
CREATE TYPE "ChannelProvider" AS ENUM ('EVOLUTION_GO');
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MessageSource" AS ENUM ('CUSTOMER', 'AI', 'OWNER');
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'HUMAN_HANDOFF', 'CLOSED');

CREATE TABLE "ChannelConnection" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "ChannelProvider" NOT NULL,
  "externalInstanceId" TEXT NOT NULL,
  "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelConnection_tenantId_id_key" UNIQUE ("tenantId", "id")
);

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "externalContactId" TEXT NOT NULL,
  "customerName" TEXT,
  "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_tenantId_channelId_id_key" UNIQUE ("tenantId", "channelId", "id"),
  CONSTRAINT "Conversation_channel_fkey" FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE
);

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "externalMessageId" TEXT,
  "direction" "MessageDirection" NOT NULL,
  "source" "MessageSource",
  "role" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_conversation_fkey" FOREIGN KEY ("tenantId", "channelId", "conversationId") REFERENCES "Conversation"("tenantId", "channelId", "id") ON DELETE CASCADE
);
`;

// Tenant que ja existia antes do Goal019: tem canal, conversa e historico.
// Depois da migration ele precisa continuar SEM execucao de teste.
const FIXTURE = `
INSERT INTO "ChannelConnection" ("id", "tenantId", "userId", "provider", "externalInstanceId")
VALUES ('channel-legacy', 'tenant-legacy', 'user-legacy', 'EVOLUTION_GO', 'instance-legacy');

INSERT INTO "Conversation" ("id", "tenantId", "channelId", "externalContactId", "customerName")
VALUES ('conversation-legacy', 'tenant-legacy', 'channel-legacy', '5511999999999', 'Cliente Legado');

INSERT INTO "Message" ("id", "tenantId", "channelId", "conversationId", "externalMessageId", "direction", "source", "role", "body")
VALUES
  ('message-legacy-in',  'tenant-legacy', 'channel-legacy', 'conversation-legacy', '3EB0IN',  'INBOUND',  'CUSTOMER', 'user',      'Oi, quanto custa?'),
  ('message-legacy-out', 'tenant-legacy', 'channel-legacy', 'conversation-legacy', '3EB0OUT', 'OUTBOUND', 'AI',       'assistant', 'Custa R$ 100,00.');
`;

function assert(condition, message) {
  if (!condition) {
    console.error(`goal019:activation-test-migration-rehearsal FAILED — ${message}`);
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

async function legacyFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "channelId", "conversationId", "direction"::text AS direction,
           "source"::text AS source, "role", "body", "externalMessageId", "createdAt"::text AS "createdAt"
    FROM "Message" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) =>
      `${row.id}/${row.tenantId}/${row.channelId}/${row.conversationId}/${row.direction}/${row.source}/${row.role}/${row.body}/${row.externalMessageId}/${row.createdAt}`,
  );
}

async function runCount(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "ActivationTestRun" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return result.rows[0].total;
}

// Insercao crua, sem passar pela aplicacao: o que se prova aqui e o banco, nao
// o TypeScript. `updatedAt` nao tem default no Prisma, entao vai explicito.
function insertRunSql(id, tenantId) {
  return `
    INSERT INTO "ActivationTestRun"
      ("id", "tenantId", "maxAttempts", "channelId", "tenantPhone", "platformNumber", "updatedAt")
    VALUES
      ('${id}', '${tenantId}', 3, 'channel-legacy', '5511988887777', '5511911112222', CURRENT_TIMESTAMP)
  `;
}

async function expectRejected(client, sql, message) {
  await client.query("SAVEPOINT probe");
  try {
    await client.query(sql);
    await client.query("ROLLBACK TO SAVEPOINT probe");
    assert(false, message);
    return null;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT probe");
    return error;
  }
}

async function rehearse(target) {
  console.log(`goal019:activation-test-migration-rehearsal target: ${target.label}`);
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(LEGACY_SCHEMA);
    await client.query(FIXTURE);

    const messagesBefore = await client.query(
      `SELECT COUNT(*)::int AS total FROM "Message"`,
    );
    assert(
      messagesBefore.rows[0].total === 2,
      `the fixture must contain two Message rows, found ${messagesBefore.rows[0].total}`,
    );
    const fingerprintBefore = await legacyFingerprint(client);

    // Aditividade — aplica a migration real, a mesma que roda em producao.
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    assert(applied === true, `the migration must apply cleanly: ${applied}`);

    assert(
      JSON.stringify(await legacyFingerprint(client)) ===
        JSON.stringify(fingerprintBefore),
      "the migration must not touch a single pre-existing Message column",
    );

    for (const table of ["ActivationTestRun", "ActivationTestMilestone"]) {
      const present = await client.query(
        `SELECT to_regclass('"${table}"') AS present`,
      );
      assert(
        present.rows[0].present !== null,
        `the migration must create the ${table} table`,
      );
    }

    // Sem backfill: o tenant que ja existia continua sem execucao nenhuma.
    // "Nunca testou" e um estado legitimo e e o unico honesto aqui.
    assert(
      (await runCount(client)) === 0,
      "the migration must not fabricate an activation test run for a pre-existing tenant",
    );
    const milestonesAfter = await client.query(
      `SELECT COUNT(*)::int AS total FROM "ActivationTestMilestone"`,
    );
    assert(
      milestonesAfter.rows[0].total === 0,
      "ActivationTestMilestone must start empty — there is no legacy stock to preserve",
    );

    // Uma execucao viva por tenant, garantido pelo indice unico parcial.
    await client.query("BEGIN");
    await client.query(insertRunSql("probe-run-live", "tenant-legacy"));
    const secondLive = await expectRejected(
      client,
      insertRunSql("probe-run-second", "tenant-legacy"),
      "a second live run for the same tenant must be rejected by the partial unique index",
    );
    assert(
      secondLive?.code === "23505",
      `the second live run must fail with a unique violation, got ${secondLive?.code}`,
    );

    // Outro tenant nao e afetado: a exclusividade e por tenant.
    await client.query(insertRunSql("probe-run-other-tenant", "tenant-other"));

    // Pausada continua viva: `finishedAt` nulo, tenant ainda ocupado.
    await client.query(
      `UPDATE "ActivationTestRun" SET "state" = 'PAUSED_BY_HUMAN', "pausedAt" = CURRENT_TIMESTAMP, "pausedByMessageId" = 'message-legacy-in' WHERE "id" = 'probe-run-live'`,
    );
    const pausedBlocks = await expectRejected(
      client,
      insertRunSql("probe-run-third", "tenant-legacy"),
      "a paused run is still live and must keep blocking a new run for the tenant",
    );
    assert(
      pausedBlocks?.code === "23505",
      `a paused run must keep the tenant occupied, got ${pausedBlocks?.code}`,
    );

    // Terminar libera o tenant — e so terminar.
    await client.query(
      `UPDATE "ActivationTestRun" SET "state" = 'SUCCEEDED', "finishedAt" = CURRENT_TIMESTAMP WHERE "id" = 'probe-run-live'`,
    );
    await client.query(insertRunSql("probe-run-after-terminal", "tenant-legacy"));

    // Marco sem fonte e impossivel no banco, nao so no codigo.
    const milestoneWithoutFact = await expectRejected(
      client,
      `INSERT INTO "ActivationTestMilestone" ("id", "tenantId", "runId", "milestone", "factKind", "factId")
       VALUES ('probe-milestone-no-fact', 'tenant-legacy', 'probe-run-after-terminal', 'MESSAGE_SENT', NULL, NULL)`,
      "a milestone without the fact that supports it must be rejected",
    );
    assert(
      milestoneWithoutFact?.code === "23502",
      `a milestone without factKind/factId must fail with a not-null violation, got ${milestoneWithoutFact?.code}`,
    );

    await client.query(
      `INSERT INTO "ActivationTestMilestone" ("id", "tenantId", "runId", "milestone", "factKind", "factId")
       VALUES ('probe-milestone-1', 'tenant-legacy', 'probe-run-after-terminal', 'MESSAGE_SENT', 'MESSAGE', 'message-legacy-in')`,
    );
    const duplicateMilestone = await expectRejected(
      client,
      `INSERT INTO "ActivationTestMilestone" ("id", "tenantId", "runId", "milestone", "factKind", "factId")
       VALUES ('probe-milestone-2', 'tenant-legacy', 'probe-run-after-terminal', 'MESSAGE_SENT', 'MESSAGE', 'message-legacy-out')`,
      "the same milestone must not be recorded twice for the same run",
    );
    assert(
      duplicateMilestone?.code === "23505",
      `a duplicated milestone must fail with a unique violation, got ${duplicateMilestone?.code}`,
    );

    await client.query("ROLLBACK");

    assert(
      (await runCount(client)) === 0,
      "probing the new tables must leave no run behind",
    );

    // Retomada: reaplicar a migration nao muda nada nem lanca erro.
    const fingerprintBeforeRetry = await legacyFingerprint(client);
    const retried = await applyMigrationFile(client, MIGRATION_SQL);
    assert(retried === true, `the migration must be resumable: ${retried}`);
    assert(
      JSON.stringify(await legacyFingerprint(client)) ===
        JSON.stringify(fingerprintBeforeRetry),
      "reapplying the migration must not change a single Message row",
    );
    assert(
      (await runCount(client)) === 0,
      "reapplying the migration must not fabricate an activation test run either",
    );
  } finally {
    await client.end();
  }
}

/**
 * Expande o banco de durabilidade da IA (`AI_TEST_DATABASE_URL`, o `_goal004`
 * deixado pelo ensaio do Goal004 e expandido desde) com a migration deste
 * Goal. As tabelas novas nao dependem de nenhuma outra, entao a migration se
 * aplica direto.
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
      "durability target not provisioned yet — skipping the Goal019 schema expansion",
    );
    return;
  }
  try {
    const messageTable = await client.query(
      `SELECT to_regclass('"Message"') AS present`,
    );
    if (!messageTable.rows[0].present) {
      console.log(
        "durability target has no Message table yet — skipping the Goal019 schema expansion",
      );
      return;
    }

    for (const migration of [
      MIGRATION_SQL,
      CLEANUP_MIGRATION_SQL,
      CHANNEL_INSTANCE_MIGRATION_SQL,
    ]) {
      const applied = await applyMigrationFile(client, migration);
      if (applied !== true) {
        console.error(
          `goal019:activation-test-migration-rehearsal FAILED — durability target expansion failed applying ${migration}: ${applied}`,
        );
        process.exitCode = 1;
        return;
      }
    }
    console.log(
      `durability target expanded with the Goal019 activation test migration: ${database}_goal004`,
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
    console.error(
      "goal019:activation-test-migration-rehearsal FAILED — see the assertions above.",
    );
  } else {
    console.log(
      "goal019:activation-test-migration-rehearsal PASSED — ActivationTestRun and ActivationTestMilestone are additive " +
        "and backfill-free (a pre-existing tenant stays without any run), at most one live run per tenant is enforced by " +
        "the partial unique index (a paused run still counts as live), a milestone cannot exist without the fact that " +
        "supports it, and the migration is resumable without changing state.",
    );
  }
}

if (isMain(import.meta.url)) await main();
