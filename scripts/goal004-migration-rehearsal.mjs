#!/usr/bin/env node

// Ensaio da migration de transporte durável do Goal004 (gate M0/M1).
//
// Reconstrói o schema da IA como ele era antes deste Goal, semeia o estoque
// legado que importa — `ProcessedEvent` que só prova recebimento e `Message`
// OUTBOUND sem estado de entrega —, aplica o arquivo de migration real e
// reconcilia as contagens.
//
// O que o ensaio prova:
//   1. a expansão não perde linha e não inventa entrega;
//   2. `ProcessedEvent` legado vira concluído-legado e não volta para a fila;
//   3. OUTBOUND legado vira `UNKNOWN`, nunca `SENT` presumido, e INBOUND fica
//      sem estado;
//   4. o backfill é retomável: repetido, não muda contagem nem estado.
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
  "20260907160000_goal004_durable_transport",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal004:migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal004`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema da IA anterior ao Goal004, reduzido às tabelas que a migration toca.
const LEGACY_SCHEMA = `
DROP TABLE IF EXISTS "ProcessedEvent";
DROP TABLE IF EXISTS "Message";
DROP TABLE IF EXISTS "Conversation";
DROP TABLE IF EXISTS "ChannelConnection";
DROP TYPE IF EXISTS "InboundEventStatus";
DROP TYPE IF EXISTS "MessageDeliveryState";
DROP TYPE IF EXISTS "ConversationStatus";
DROP TYPE IF EXISTS "MessageSource";
DROP TYPE IF EXISTS "MessageDirection";
DROP TYPE IF EXISTS "ChannelConnectionStatus";
DROP TYPE IF EXISTS "ChannelProvider";

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
  "displayName" TEXT,
  "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "credentialCipher" TEXT,
  "credentialKeyId" TEXT,
  "credentialVersion" INTEGER NOT NULL DEFAULT 0,
  "credentialRotatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelConnection_provider_externalInstanceId_key" UNIQUE ("provider", "externalInstanceId"),
  CONSTRAINT "ChannelConnection_tenantId_provider_key" UNIQUE ("tenantId", "provider"),
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
  CONSTRAINT "Message_tenantId_channelId_externalMessageId_key" UNIQUE ("tenantId", "channelId", "externalMessageId"),
  CONSTRAINT "Message_channel_fkey" FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE,
  CONSTRAINT "Message_conversation_fkey" FOREIGN KEY ("tenantId", "channelId", "conversationId") REFERENCES "Conversation"("tenantId", "channelId", "id") ON DELETE CASCADE
);
CREATE INDEX "Message_tenantId_conversationId_createdAt_idx" ON "Message"("tenantId", "conversationId", "createdAt");

CREATE TABLE "ProcessedEvent" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "provider" "ChannelProvider" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "rawPayload" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessedEvent_tenantId_provider_eventKey_key" UNIQUE ("tenantId", "provider", "eventKey"),
  CONSTRAINT "ProcessedEvent_channel_fkey" FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE
);
CREATE INDEX "ProcessedEvent_tenantId_channelId_receivedAt_idx" ON "ProcessedEvent"("tenantId", "channelId", "receivedAt");
`;

/**
 * Estoque legado sintético.
 *
 * - `answered`: saída antiga cujo transporte devolveu um ID externo.
 * - `silent`: saída antiga sem qualquer evidência de entrega.
 * - `inbound`: mensagem recebida, que nunca teve estado de entrega.
 * - ProcessedEvent: três eventos que provam recebimento e nada mais.
 */
const FIXTURE = `
INSERT INTO "ChannelConnection"
  ("id", "tenantId", "userId", "provider", "externalInstanceId", "credentialVersion") VALUES
  ('channel-legacy', 'tenant-legacy', 'user-legacy', 'EVOLUTION_GO', 'instance-legacy', 0);

INSERT INTO "Conversation" ("id", "tenantId", "channelId", "externalContactId") VALUES
  ('conversation-legacy', 'tenant-legacy', 'channel-legacy', '5511999999999');

INSERT INTO "Message"
  ("id", "tenantId", "channelId", "conversationId", "externalMessageId", "direction", "source", "role", "body", "rawPayload") VALUES
  ('message-answered', 'tenant-legacy', 'channel-legacy', 'conversation-legacy', '3EB0LEGACYSENT', 'OUTBOUND', 'AI', 'assistant', 'Resposta antiga', '{"event":"SendMessage"}'),
  ('message-silent',   'tenant-legacy', 'channel-legacy', 'conversation-legacy', NULL,             'OUTBOUND', 'OWNER', 'assistant', 'Mensagem da profissional', NULL),
  ('message-inbound',  'tenant-legacy', 'channel-legacy', 'conversation-legacy', '3EB0LEGACYRECV', 'INBOUND',  'CUSTOMER', 'user', 'Oi', '{"event":"Message"}');

INSERT INTO "ProcessedEvent"
  ("id", "tenantId", "channelId", "provider", "eventKey", "messageId", "rawPayload") VALUES
  ('event-1', 'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:3EB0A', '3EB0A', '{"event":"Message"}'),
  ('event-2', 'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:3EB0B', '3EB0B', '{"event":"Message"}'),
  ('event-3', 'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:3EB0C', '3EB0C', '{"event":"Message"}');
`;

// Mesmas instruções de backfill da migration, isoladas para provar retomada.
const BACKFILL = `
UPDATE "ProcessedEvent"
SET "status" = 'LEGACY', "completedAt" = "receivedAt"
WHERE "completedAt" IS NULL;

UPDATE "Message"
SET "deliveryState" = 'UNKNOWN',
    "deliveryDetail" = 'legacy_backfill_no_delivery_evidence',
    "deliveryUpdatedAt" = "createdAt"
WHERE "direction" = 'OUTBOUND' AND "deliveryState" IS NULL;
`;

// Tabelas fora do estoque legado, criadas depois de tudo o que o ensaio prova.
//
// O gate reaproveita este banco na suíte de persistência da IA, e o caminho
// durável completo — guard do grafo, configuração do tenant, handoff — toca
// tabelas que a migration do Goal004 não altera. Criá-las aqui mantém o gate
// com um alvo só e não depende de `prisma migrate deploy`, que exigiria
// pgvector no cluster descartável. Nenhuma linha é semeada: quem precisa de
// dado é a suíte.
const SUPPORT_SCHEMA = `
CREATE TYPE "AiTone" AS ENUM ('PROFESSIONAL_OBJECTIVE', 'LIGHT_CLOSE');
CREATE TYPE "AiRunStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');
CREATE TYPE "HandoffStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "AiTenantConfig" (
  "tenantId" TEXT PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "tone" "AiTone" NOT NULL DEFAULT 'LIGHT_CLOSE',
  "promptVersion" TEXT NOT NULL DEFAULT 'scheduling_v1.0.0',
  "settings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX "AiRun_tenantId_conversationId_startedAt_idx" ON "AiRun"("tenantId", "conversationId", "startedAt");

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
  CONSTRAINT "Handoff_channel_fkey" FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE,
  CONSTRAINT "Handoff_conversation_fkey" FOREIGN KEY ("tenantId", "channelId", "conversationId") REFERENCES "Conversation"("tenantId", "channelId", "id") ON DELETE NO ACTION
);
CREATE INDEX "Handoff_tenantId_status_createdAt_idx" ON "Handoff"("tenantId", "status", "createdAt");
CREATE INDEX "Handoff_tenantId_channelId_externalContactId_idx" ON "Handoff"("tenantId", "channelId", "externalContactId");
`;

async function inventory(client) {
  const events = await client.query(`
    SELECT COUNT(*)::int AS total FROM "ProcessedEvent"
  `);
  const messages = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND')::int AS outbound,
      COUNT(*) FILTER (WHERE "direction" = 'INBOUND')::int AS inbound
    FROM "Message"
  `);
  return { events: events.rows[0].total, messages: messages.rows[0] };
}

async function transportState(client) {
  const events = await client.query(`
    SELECT "status"::text AS status, COUNT(*)::int AS total
    FROM "ProcessedEvent" GROUP BY 1 ORDER BY 1
  `);
  const messages = await client.query(`
    SELECT
      "direction"::text AS direction,
      COALESCE("deliveryState"::text, 'null') AS delivery_state,
      COUNT(*)::int AS total
    FROM "Message" GROUP BY 1, 2 ORDER BY 1, 2
  `);
  return { events: events.rows, messages: messages.rows };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`goal004:migration-rehearsal FAILED — ${message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function main() {
  const target = rehearsalTarget();
  console.log(`goal004:migration-rehearsal target: ${target.label}`);

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

    // M0: inventário antes de qualquer alteração de schema.
    const before = await inventory(client);
    console.log(
      `M0 inventory — processed events: ${before.events}; messages: ${before.messages.total} (outbound ${before.messages.outbound}, inbound ${before.messages.inbound})`,
    );

    await client.query(readFileSync(MIGRATION_SQL, "utf8"));
    const after = await inventory(client);
    assert(
      after.events === before.events &&
        after.messages.total === before.messages.total,
      `migration changed row counts: events ${before.events}->${after.events}, messages ${before.messages.total}->${after.messages.total}`,
    );

    const state = await transportState(client);
    console.log(
      `after migration — inbox: ${state.events
        .map((row) => `${row.status}=${row.total}`)
        .join(", ")}`,
    );
    console.log(
      `after migration — outbox: ${state.messages
        .map((row) => `${row.direction}/${row.delivery_state}=${row.total}`)
        .join(", ")}`,
    );

    assert(
      state.events.length === 1 && state.events[0].status === "LEGACY",
      "legacy processed events must be marked as concluded-legacy, never left claimable",
    );
    const outboundStates = state.messages.filter(
      (row) => row.direction === "OUTBOUND",
    );
    assert(
      outboundStates.every((row) => row.delivery_state === "UNKNOWN"),
      "legacy OUTBOUND rows must land on UNKNOWN, never on an invented SENT",
    );
    assert(
      state.messages.some(
        (row) => row.direction === "INBOUND" && row.delivery_state === "null",
      ),
      "INBOUND rows must stay without delivery state",
    );

    const claimable = await client.query(`
      SELECT COUNT(*)::int AS total FROM "ProcessedEvent" WHERE "status" = 'RECEIVED'
    `);
    assert(
      claimable.rows[0].total === 0,
      "no legacy event may become claimable work after the migration",
    );

    // Retomada: rodar o backfill de novo não pode mudar nada.
    const snapshot = JSON.stringify(await transportState(client));
    await client.query(BACKFILL);
    const resumed = JSON.stringify(await transportState(client));
    assert(
      snapshot === resumed,
      "the backfill is not resumable: re-running it changed the reconciled state",
    );
    console.log("backfill is resumable — re-running it changed nothing");

    await client.query(SUPPORT_SCHEMA);
    console.log(
      "support tables created for the durability suite — no rows seeded",
    );

    if (process.exitCode) {
      console.error("goal004:migration-rehearsal FAILED");
      return;
    }
    console.log("goal004:migration-rehearsal PASSED");
  } finally {
    await client.end();
  }
}

await main();
