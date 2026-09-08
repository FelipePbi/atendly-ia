#!/usr/bin/env node

// Ensaio da migration de contato, sessão e controle humano do Goal005 (M0/M1).
//
// Reconstrói o schema da IA como ele era antes deste Goal — já com o transporte
// durável do Goal004 —, semeia o estoque legado que importa (conversas em
// handoff, pausa indefinida, `state` com classificação técnica, mensagens
// antigas), aplica o arquivo de migration real e reconcilia as contagens.
//
// O que o ensaio prova:
//   1. a expansão não perde nem duplica linha;
//   2. cada conversa ganha exatamente um Contato, preservando o ID externo, e
//      nasce não ignorada e sem override manual;
//   3. `humanHandoff` vigente vira atendimento humano da sessão corrente, e a
//      pausa indefinida (`NULL` ou ano 9999) vira pausa explícita do contato,
//      sem retomada automática inventada;
//   4. a classificação técnica do JSON vira **sugestão** com proveniência e a
//      categoria vigente fica automática — nunca override manual;
//   5. dado ambíguo (pausa já vencida no relógio) fica em pendência segura, com
//      nota, em vez de a IA voltar sozinha;
//   6. o backfill é retomável: repetido, não muda contagem nem estado.
//
// Nenhuma credencial aparece na saída: só contagens e rótulos de caso. Roda num
// banco próprio derivado de BFF_TEST_DATABASE_URL, nunca no banco do app.

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
  "ai-orchestrator",
  "prisma",
  "migrations",
  "20260908120000_goal005_contact_session_human_control",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal005:migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal005`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema da IA anterior ao Goal005, reduzido às tabelas que a migration toca.
const LEGACY_SCHEMA = `
CREATE TYPE "ChannelProvider" AS ENUM ('EVOLUTION_GO');
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MessageSource" AS ENUM ('CUSTOMER', 'AI', 'OWNER');
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'HUMAN_HANDOFF', 'CLOSED');
CREATE TYPE "MessageDeliveryState" AS ENUM ('PENDING', 'SENT', 'FAILED', 'UNKNOWN');
CREATE TYPE "HandoffStatus" AS ENUM ('OPEN', 'RESOLVED');

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
  "currentIntent" TEXT,
  "state" JSONB,
  "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "humanHandoff" BOOLEAN NOT NULL DEFAULT false,
  "handoffPausedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_tenantId_channelId_externalContactId_key" UNIQUE ("tenantId", "channelId", "externalContactId"),
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
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "correlationId" TEXT,
  "deliveryState" "MessageDeliveryState",
  "deliveryDetail" TEXT,
  "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  "deliveryUpdatedAt" TIMESTAMP(3),
  CONSTRAINT "Message_conversation_fkey" FOREIGN KEY ("tenantId", "channelId", "conversationId") REFERENCES "Conversation"("tenantId", "channelId", "id") ON DELETE CASCADE
);

CREATE TABLE "Handoff" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "conversationId" TEXT,
  "externalContactId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "summary" TEXT,
  "status" "HandoffStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "Handoff_channel_fkey" FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE
);
`;

/**
 * Estoque legado sintético, um caso por linha de conversa:
 *
 * - `commercial`: conversa comum, com classificação técnica de cliente;
 * - `personal`: classificação pessoal no JSON do agente;
 * - `paused-null`: handoff com `handoffPausedUntil` nulo (indefinido);
 * - `paused-9999`: handoff com o sentinela `BOT_OFF_PAUSE_UNTIL`;
 * - `expired-pause`: handoff cujo relógio já venceu — dado ambíguo;
 * - `no-messages`: conversa sem mensagem nenhuma.
 *
 * Dois tenants de propósito: a migration não pode misturar contatos.
 */
const FIXTURE = `
INSERT INTO "ChannelConnection" ("id", "tenantId", "userId", "provider", "externalInstanceId") VALUES
  ('channel-a', 'tenant-a', 'user-a', 'EVOLUTION_GO', 'instance-a'),
  ('channel-b', 'tenant-b', 'user-b', 'EVOLUTION_GO', 'instance-b');

INSERT INTO "Conversation" ("id", "tenantId", "channelId", "externalContactId", "customerName", "state", "status", "humanHandoff", "handoffPausedUntil", "updatedAt") VALUES
  ('conv-commercial', 'tenant-a', 'channel-a', '5511900000001', 'Maria',
     '{"aiConversation":{"classification":"potential_customer","stage":"QUALIFYING_CONTACT"}}', 'ACTIVE', false, NULL, TIMESTAMP '2026-09-01 10:00:00'),
  ('conv-personal', 'tenant-a', 'channel-a', '5511900000002', 'Tia Ana',
     '{"aiConversation":{"classification":"personal_contact","stage":"AI_PAUSED"}}', 'ACTIVE', false, NULL, TIMESTAMP '2026-09-01 11:00:00'),
  ('conv-paused-null', 'tenant-a', 'channel-a', '5511900000003', NULL,
     '{}', 'HUMAN_HANDOFF', true, NULL, TIMESTAMP '2026-09-02 09:00:00'),
  ('conv-paused-9999', 'tenant-a', 'channel-a', '5511900000004', NULL,
     '{"aiConversation":{"classification":"supplier_or_partner"}}', 'HUMAN_HANDOFF', true, TIMESTAMP '9999-12-31 23:59:59', TIMESTAMP '2026-09-02 10:00:00'),
  ('conv-expired-pause', 'tenant-a', 'channel-a', '5511900000005', NULL,
     '{}', 'HUMAN_HANDOFF', true, TIMESTAMP '2026-09-01 08:00:00', TIMESTAMP '2026-09-02 11:00:00'),
  ('conv-no-messages', 'tenant-b', 'channel-b', '5511900000001', NULL,
     NULL, 'ACTIVE', false, NULL, TIMESTAMP '2026-09-03 12:00:00');

INSERT INTO "Message" ("id", "tenantId", "channelId", "conversationId", "direction", "source", "role", "body", "createdAt") VALUES
  ('msg-1', 'tenant-a', 'channel-a', 'conv-commercial', 'INBOUND',  'CUSTOMER',  'user',      'Oi',              TIMESTAMP '2026-09-01 09:00:00'),
  ('msg-2', 'tenant-a', 'channel-a', 'conv-commercial', 'OUTBOUND', 'AI',        'assistant', 'Oi, tudo bem?',   TIMESTAMP '2026-09-01 09:01:00'),
  ('msg-3', 'tenant-a', 'channel-a', 'conv-commercial', 'INBOUND',  'CUSTOMER',  'user',      'Quero agendar',   TIMESTAMP '2026-09-01 09:30:00'),
  ('msg-4', 'tenant-a', 'channel-a', 'conv-personal',   'INBOUND',  'CUSTOMER',  'user',      'Oi filha',        TIMESTAMP '2026-09-01 11:00:00'),
  ('msg-5', 'tenant-a', 'channel-a', 'conv-paused-null','INBOUND',  'CUSTOMER',  'user',      'Alo',             TIMESTAMP '2026-09-02 08:00:00'),
  ('msg-6', 'tenant-a', 'channel-a', 'conv-paused-9999','OUTBOUND', 'OWNER',     'assistant', 'Depois respondo', TIMESTAMP '2026-09-02 09:30:00');

INSERT INTO "Handoff" ("id", "tenantId", "channelId", "conversationId", "externalContactId", "reason", "status") VALUES
  ('handoff-1', 'tenant-a', 'channel-a', 'conv-paused-null', '5511900000003', 'OWNER_TAKEOVER', 'OPEN');
`;

/**
 * Backfill isolado da migration, para provar retomada. É exatamente o mesmo
 * conjunto de instruções, todas condicionadas ao estado ausente.
 */
const BACKFILL = `
INSERT INTO "Contact" ("id", "tenantId", "channelId", "externalContactId", "displayName", "createdAt", "updatedAt")
SELECT 'contact_' || md5("c"."tenantId" || ':' || "c"."channelId" || ':' || "c"."externalContactId"),
       "c"."tenantId", "c"."channelId", "c"."externalContactId", "c"."customerName", "c"."createdAt", "c"."updatedAt"
FROM "Conversation" AS "c"
ON CONFLICT ("tenantId", "channelId", "externalContactId") DO NOTHING;

UPDATE "Conversation" AS "c" SET "contactId" = "k"."id"
FROM "Contact" AS "k"
WHERE "k"."tenantId" = "c"."tenantId" AND "k"."channelId" = "c"."channelId"
  AND "k"."externalContactId" = "c"."externalContactId" AND "c"."contactId" IS NULL;

UPDATE "Contact" AS "k"
SET "aiPaused" = true, "aiPausedAt" = "c"."updatedAt", "aiPausedReason" = 'legacy_indefinite_pause'
FROM "Conversation" AS "c"
WHERE "c"."contactId" = "k"."id" AND "c"."humanHandoff" = true
  AND ("c"."handoffPausedUntil" IS NULL OR "c"."handoffPausedUntil" > TIMESTAMP '9000-01-01 00:00:00')
  AND "k"."aiPaused" = false;
`;

async function inventory(client) {
  const conversations = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "humanHandoff")::int AS human_handoff,
      COUNT(*) FILTER (WHERE "humanHandoff" AND ("handoffPausedUntil" IS NULL OR "handoffPausedUntil" > TIMESTAMP '9000-01-01 00:00:00'))::int AS indefinite_pause,
      COUNT(*) FILTER (WHERE "state" -> 'aiConversation' ? 'classification')::int AS with_classification,
      COUNT(DISTINCT ("tenantId", "channelId", "externalContactId"))::int AS distinct_contacts
    FROM "Conversation"
  `);
  const messages = await client.query(`
    SELECT COUNT(*)::int AS total,
           MIN("createdAt") AS oldest,
           MAX("createdAt") AS newest
    FROM "Message"
  `);
  const handoffs = await client.query(`
    SELECT COUNT(*) FILTER (WHERE "status" = 'OPEN')::int AS open FROM "Handoff"
  `);
  return {
    conversations: conversations.rows[0],
    messages: messages.rows[0],
    handoffs: handoffs.rows[0],
  };
}

async function sessionState(client) {
  const rows = await client.query(`
    SELECT "s"."conversationId" AS conversation,
           "s"."category"::text AS category,
           "s"."categorySource"::text AS category_source,
           COALESCE("s"."suggestedCategory"::text, 'null') AS suggested,
           COALESCE("s"."suggestionProvenance", 'null') AS provenance,
           "s"."humanHandling" AS human_handling,
           "s"."backfillNote" AS note,
           to_char("s"."expiresAt", 'YYYY-MM-DD HH24:MI') AS expires_at,
           "k"."ignored" AS ignored,
           "k"."aiPaused" AS ai_paused,
           COALESCE("k"."categoryOverride"::text, 'null') AS override
    FROM "ConversationSession" AS "s"
    JOIN "Contact" AS "k" ON "k"."id" = "s"."contactId"
    ORDER BY "s"."conversationId"
  `);
  return rows.rows;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`goal005:migration-rehearsal FAILED — ${message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function main() {
  const target = rehearsalTarget();
  console.log(`goal005:migration-rehearsal target: ${target.label}`);

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

    // M0: inventário antes de qualquer alteração de schema. Só contagens.
    const before = await inventory(client);
    console.log(
      `M0 inventory — conversations: ${before.conversations.total} ` +
        `(humanHandoff ${before.conversations.human_handoff}, ` +
        `indefinite pause ${before.conversations.indefinite_pause}, ` +
        `state with classification ${before.conversations.with_classification}, ` +
        `distinct contacts ${before.conversations.distinct_contacts})`,
    );
    console.log(
      `M0 inventory — messages: ${before.messages.total}; last message dates from ` +
        `${before.messages.oldest?.toISOString?.() ?? "n/a"} to ` +
        `${before.messages.newest?.toISOString?.() ?? "n/a"}; open handoffs: ${before.handoffs.open}`,
    );

    await client.query(readFileSync(MIGRATION_SQL, "utf8"));

    const after = await inventory(client);
    assert(
      after.conversations.total === before.conversations.total &&
        after.messages.total === before.messages.total,
      `migration changed row counts: conversations ${before.conversations.total}->${after.conversations.total}, messages ${before.messages.total}->${after.messages.total}`,
    );

    const contacts = await client.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE "ignored")::int AS ignored,
             COUNT(*) FILTER (WHERE "categoryOverride" IS NOT NULL)::int AS overridden,
             COUNT(*) FILTER (WHERE "aiPaused")::int AS paused
      FROM "Contact"
    `);
    console.log(
      `after migration — contacts: ${contacts.rows[0].total} ` +
        `(ignored ${contacts.rows[0].ignored}, manual override ${contacts.rows[0].overridden}, ` +
        `explicit AI pause ${contacts.rows[0].paused})`,
    );
    assert(
      contacts.rows[0].total === before.conversations.distinct_contacts,
      "each distinct external contact must produce exactly one Contact row",
    );
    assert(
      contacts.rows[0].ignored === 0 && contacts.rows[0].overridden === 0,
      "the backfill must never invent an ignored contact or a manual override",
    );
    assert(
      contacts.rows[0].paused === before.conversations.indefinite_pause,
      "every indefinite legacy pause must become an explicit contact pause",
    );

    const orphan = await client.query(`
      SELECT COUNT(*)::int AS total FROM "Conversation" WHERE "contactId" IS NULL
    `);
    assert(
      orphan.rows[0].total === 0,
      "every conversation must be linked to its contact",
    );

    const preserved = await client.query(`
      SELECT COUNT(*)::int AS total
      FROM "Conversation" AS "c" JOIN "Contact" AS "k" ON "k"."id" = "c"."contactId"
      WHERE "k"."externalContactId" <> "c"."externalContactId"
    `);
    assert(
      preserved.rows[0].total === 0,
      "the external contact id must be preserved, never rewritten",
    );

    const sessions = await sessionState(client);
    for (const row of sessions) {
      console.log(
        `session ${row.conversation} — category ${row.category}/${row.category_source}, ` +
          `suggestion ${row.suggested} (${row.provenance}), human ${row.human_handling}, ` +
          `ignored ${row.ignored}, aiPaused ${row.ai_paused}, override ${row.override}, ` +
          `expires ${row.expires_at}, note ${row.note}`,
      );
    }
    assert(
      sessions.length === before.conversations.total,
      "every conversation must get exactly one historical session",
    );
    assert(
      sessions.every((row) => row.category_source === "AUTOMATIC"),
      "the legacy classification must land as automatic, never as a manual override",
    );

    const commercial = sessions.find((row) => row.conversation === "conv-commercial");
    assert(
      commercial?.category === "COMMERCIAL" &&
        commercial?.suggested === "COMMERCIAL" &&
        commercial?.provenance === "legacy_agent_state",
      "the technical classification must be recorded as a suggestion with provenance",
    );
    assert(
      commercial?.expires_at === "2026-09-02 09:30",
      "the historical session must expire 24h after the last contact message",
    );

    const personal = sessions.find((row) => row.conversation === "conv-personal");
    assert(personal?.category === "PERSONAL", "personal_contact must map to PERSONAL");

    const supplier = sessions.find((row) => row.conversation === "conv-paused-9999");
    assert(
      supplier?.category === "UNCLASSIFIED",
      "supplier_or_partner must land on UNCLASSIFIED, not on a guess",
    );
    assert(
      supplier?.human_handling === true && supplier?.ai_paused === true,
      "the BOT_OFF sentinel must become explicit human control plus an explicit pause",
    );

    const expired = sessions.find((row) => row.conversation === "conv-expired-pause");
    assert(
      expired?.human_handling === true &&
        expired?.ai_paused === false &&
        expired?.note === "legacy_expired_pause_pending_review",
      "an already-expired legacy pause is ambiguous: it must stay in safe pendency, with a note",
    );

    const noMessages = sessions.find((row) => row.conversation === "conv-no-messages");
    assert(
      noMessages?.category === "UNCLASSIFIED" && noMessages?.suggested === "null",
      "a conversation without messages must not receive an invented category",
    );

    // Isolamento: contatos de tenants diferentes com o mesmo número externo
    // não podem colidir.
    const shared = await client.query(`
      SELECT COUNT(*)::int AS total FROM "Contact" WHERE "externalContactId" = '5511900000001'
    `);
    assert(
      shared.rows[0].total === 2,
      "the same external number in two tenants must produce two independent contacts",
    );

    // Retomada: rodar o backfill de novo não pode mudar nada.
    const snapshot = JSON.stringify(await sessionState(client));
    await client.query(BACKFILL);
    const resumed = JSON.stringify(await sessionState(client));
    assert(
      snapshot === resumed,
      "the backfill is not resumable: re-running it changed the reconciled state",
    );
    const contactsAfter = await client.query(
      `SELECT COUNT(*)::int AS total FROM "Contact"`,
    );
    assert(
      contactsAfter.rows[0].total === contacts.rows[0].total,
      "re-running the backfill duplicated contacts",
    );
    console.log("backfill is resumable — re-running it changed nothing");

    if (process.exitCode) {
      console.error("goal005:migration-rehearsal FAILED");
      return;
    }

    await prepareDurabilityTarget(target);
    console.log("goal005:migration-rehearsal PASSED");
  } finally {
    await client.end();
  }
}

/**
 * Aplica a mesma migration no banco que a suíte de persistência da IA usa.
 *
 * O gate mantém um alvo só para essa suíte — o banco deixado pelo ensaio do
 * Goal004 —, e ela agora exercita contato e sessão contra PostgreSQL real. O
 * arquivo aplicado é o mesmo, sem cópia paralela do schema; a checagem por
 * `to_regclass` deixa o passo idempotente.
 */
async function prepareDurabilityTarget(target) {
  const durability = new URL(target.maintenance.href);
  const database = decodeURIComponent(
    target.maintenance.pathname.replace(/^\//u, ""),
  );
  durability.pathname = `/${database}_goal004`;

  const client = new Client({ connectionString: durability.href });
  try {
    await client.connect();
  } catch {
    console.log(
      "durability target not provisioned yet — skipping the schema expansion",
    );
    return;
  }
  try {
    const existing = await client.query(
      `SELECT to_regclass('"ConversationSession"') AS present`,
    );
    if (existing.rows[0].present) {
      console.log("durability target already expanded — nothing to apply");
      return;
    }
    await client.query(readFileSync(MIGRATION_SQL, "utf8"));
    console.log(
      `durability target expanded with the Goal005 migration: ${database}_goal004`,
    );
  } finally {
    await client.end();
  }
}

await main();
