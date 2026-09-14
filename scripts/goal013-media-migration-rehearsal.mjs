#!/usr/bin/env node

// Ensaio da migration do Goal013 (WU-02) na IA: kinds de midia
// (`Message.kind`), `MessageAttachment` e purga do base64 embutido do
// `ProcessedEvent` concluido.
//
// Banco descartavel proprio, derivado de BFF_TEST_DATABASE_URL. Nenhum banco
// de app e tocado.
//
// O que o ensaio prova:
//   1. a migration e aditiva: toda `Message` legada continua com o mesmo
//      corpo, e `kind` nasce `TEXT` so por default, sem UPDATE explicito;
//      `MessageAttachment` e tabela nova, sem estoque legado para preservar;
//   2. o backfill do `ProcessedEvent` remove SO `data.Message.base64` das
//      linhas concluidas (DONE/FAILED/IGNORED/LEGACY) e preserva qualquer
//      outro campo do payload, inclusive as chaves do proto de midia dentro
//      de `data.Message.<tipo>Message` (mediaKey, directPath, url,
//      fileSHA256) e o restante de `data.Info`; evento sem base64 nao muda
//      uma unica chave;
//   3. evento ainda pendente (RECEIVED/PROCESSING) nunca e tocado: o base64
//      continua ali enquanto o processamento em curso pode precisar dele;
//   4. leitura do legado depois do corte: uma `Message` gravada por um
//      binario que nao conhece `kind` continua defaultando para `TEXT`, e uma
//      `MessageAttachment` nova aceita leitura/escrita normal;
//   5. a migration e retomavel: reaplicada sobre o estado ja migrado, nao
//      muda nenhuma linha nem lanca erro;
//   6. contagens sao sempre reconciliadas excluindo sondas (`probe-%`).
//
// Expande tambem o banco de durabilidade da IA (`${database}_goal004`, o que
// `goal004-migration-rehearsal.mjs` deixa pronto e Goal005/006/011/012 ja
// expandiram) com a mesma migration: `Message` e `ProcessedEvent` ja existem
// la, entao a migration se aplica direto, sem schema minimo auxiliar.
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
  "20260913140000_goal013_media_kinds_attachments",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal013:media-migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal013`;
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
// migration toca e as suas dependencias de FK. `Message` nasce sem `kind` e
// sem o indice unico `(tenantId, id)` que a migration cria; `ProcessedEvent`
// ja carrega `status` (Goal004), que e o que o backfill filtra.
const LEGACY_SCHEMA = `
CREATE TYPE "ChannelProvider" AS ENUM ('EVOLUTION_GO');
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MessageSource" AS ENUM ('CUSTOMER', 'AI', 'OWNER');
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'HUMAN_HANDOFF', 'CLOSED');
CREATE TYPE "InboundEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'DONE', 'FAILED', 'IGNORED', 'LEGACY');

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
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_tenantId_channelId_externalMessageId_key" UNIQUE ("tenantId", "channelId", "externalMessageId"),
  CONSTRAINT "Message_channel_fkey" FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE,
  CONSTRAINT "Message_conversation_fkey" FOREIGN KEY ("tenantId", "channelId", "conversationId") REFERENCES "Conversation"("tenantId", "channelId", "id") ON DELETE CASCADE
);

CREATE TABLE "ProcessedEvent" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "provider" "ChannelProvider" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "rawPayload" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "InboundEventStatus" NOT NULL DEFAULT 'RECEIVED',
  CONSTRAINT "ProcessedEvent_tenantId_provider_eventKey_key" UNIQUE ("tenantId", "provider", "eventKey"),
  CONSTRAINT "ProcessedEvent_channel_fkey" FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE
);
`;

// Payload de midia sintetico, no formato que o Go/Evolution mescla em
// `data.Message`: `base64` fica solto ao lado do proto (Goal013/WU-02), e as
// chaves do proto de midia propriamente dito (mediaKey, directPath, url,
// fileSHA256) vivem dentro do sub-objeto por tipo (`imageMessage` aqui).
// Nenhuma delas pode se mover quando o backfill remove so `base64`.
function mediaPayload({ withBase64 }) {
  const message = {
    imageMessage: {
      mimetype: "image/jpeg",
      fileSHA256: "c3ludGhldGljLXNoYTI1Ng==",
      fileLength: 204800,
      caption: "Foto do consultorio",
      mediaKey: "c3ludGhldGljLW1lZGlhLWtleQ==",
      directPath: "/v/t62.7118-24/synthetic",
      url: "https://mmg.whatsapp.net/synthetic",
    },
  };
  if (withBase64) message.base64 = "c3ludGhldGljLWJhc2U2NC1ieXRlcw==";
  return {
    event: "Message",
    instanceId: "instance-legacy",
    data: {
      Info: {
        Chat: "5511999999999@s.whatsapp.net",
        Sender: "5511999999999@s.whatsapp.net",
        IsFromMe: false,
        ID: "3EB0MEDIA",
        Type: "media",
        MediaType: "image",
      },
      Message: message,
    },
  };
}

function textPayload() {
  return {
    event: "Message",
    instanceId: "instance-legacy",
    data: {
      Info: {
        Chat: "5511999999999@s.whatsapp.net",
        Sender: "5511999999999@s.whatsapp.net",
        IsFromMe: false,
        ID: "3EB0TEXT",
        Type: "text",
      },
      Message: { conversation: "Oi" },
    },
  };
}

// Duas mensagens de texto legadas (sem qualquer nocao de `kind`) e sete
// eventos: quatro concluidos com base64 (um por estado que o backfill
// alcanca), dois ainda pendentes com base64 (nao podem ser tocados) e um
// concluido sem base64 (caso no-op: nada para remover).
const FIXTURE = `
INSERT INTO "ChannelConnection" ("id", "tenantId", "userId", "provider", "externalInstanceId") VALUES
  ('channel-legacy', 'tenant-legacy', 'user-legacy', 'EVOLUTION_GO', 'instance-legacy');

INSERT INTO "Conversation" ("id", "tenantId", "channelId", "externalContactId") VALUES
  ('conversation-legacy', 'tenant-legacy', 'channel-legacy', '5511999999999');

INSERT INTO "Message" ("id", "tenantId", "channelId", "conversationId", "externalMessageId", "direction", "source", "role", "body") VALUES
  ('message-legacy-in',  'tenant-legacy', 'channel-legacy', 'conversation-legacy', '3EB0LEGACYIN',  'INBOUND',  'CUSTOMER', 'user',      'Oi'),
  ('message-legacy-out', 'tenant-legacy', 'channel-legacy', 'conversation-legacy', '3EB0LEGACYOUT', 'OUTBOUND', 'AI',       'assistant', 'Ola, como posso ajudar?');

INSERT INTO "ProcessedEvent" ("id", "tenantId", "channelId", "provider", "eventKey", "messageId", "status", "rawPayload") VALUES
  ('event-done-media',       'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:done-media',       '3EB0MEDIA-DONE',       'DONE',       $$${JSON.stringify(mediaPayload({ withBase64: true }))}$$::jsonb),
  ('event-failed-media',     'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:failed-media',     '3EB0MEDIA-FAILED',     'FAILED',     $$${JSON.stringify(mediaPayload({ withBase64: true }))}$$::jsonb),
  ('event-ignored-media',    'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:ignored-media',    '3EB0MEDIA-IGNORED',    'IGNORED',    $$${JSON.stringify(mediaPayload({ withBase64: true }))}$$::jsonb),
  ('event-legacy-media',     'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:legacy-media',     '3EB0MEDIA-LEGACY',     'LEGACY',     $$${JSON.stringify(mediaPayload({ withBase64: true }))}$$::jsonb),
  ('event-received-media',   'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:received-media',   '3EB0MEDIA-RECEIVED',   'RECEIVED',   $$${JSON.stringify(mediaPayload({ withBase64: true }))}$$::jsonb),
  ('event-processing-media', 'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:processing-media', '3EB0MEDIA-PROCESSING', 'PROCESSING', $$${JSON.stringify(mediaPayload({ withBase64: true }))}$$::jsonb),
  ('event-done-text',        'tenant-legacy', 'channel-legacy', 'EVOLUTION_GO', 'evolution-go:instance-legacy:done-text',        '3EB0TEXT-DONE',        'DONE',       $$${JSON.stringify(textPayload())}$$::jsonb);
`;

function assert(condition, message) {
  if (!condition) {
    console.error(`goal013:media-migration-rehearsal FAILED — ${message}`);
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
async function messageCount(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "Message" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return result.rows[0].total;
}

async function messageFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "direction"::text, "source"::text, "role", "body", "externalMessageId", "createdAt"::text
    FROM "Message" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) =>
      `${row.id}/${row.tenantId}/${row.direction}/${row.source}/${row.role}/${row.body}/${row.externalMessageId}/${row.createdAt}`,
  );
}

async function messageKinds(client) {
  const result = await client.query(
    `SELECT "id", "kind"::text FROM "Message" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.id, row.kind]));
}

async function processedEventCount(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "ProcessedEvent" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return result.rows[0].total;
}

// Fingerprint que preserva tudo, exceto `data.Message.base64` — e por isso e
// comparado contra o payload original *sem* base64, nao contra o payload
// original inteiro: o teste real e "nada alem de base64 mudou".
async function processedEventRawPayloads(client) {
  const rows = await client.query(`
    SELECT "id", "status"::text, "rawPayload"
    FROM "ProcessedEvent" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return Object.fromEntries(
    rows.rows.map((row) => [row.id, { status: row.status, rawPayload: row.rawPayload }]),
  );
}

function withoutBase64(payload) {
  const message = { ...payload.data.Message };
  delete message.base64;
  return { ...payload, data: { ...payload.data, Message: message } };
}

async function rehearse(target) {
  console.log(`goal013:media-migration-rehearsal target: ${target.label}`);
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(LEGACY_SCHEMA);
    await client.query(FIXTURE);

    const messagesBefore = await messageCount(client);
    assert(messagesBefore === 2, `the fixture must contain two Message rows, found ${messagesBefore}`);
    const eventsBefore = await processedEventCount(client);
    assert(eventsBefore === 7, `the fixture must contain seven ProcessedEvent rows, found ${eventsBefore}`);

    const messageFingerprintBefore = await messageFingerprint(client);
    const payloadsBefore = await processedEventRawPayloads(client);

    // Aditividade — aplica a migration real (WU-02), a mesma que roda em produção.
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    assert(applied === true, `the migration must apply cleanly: ${applied}`);

    assert(
      (await messageCount(client)) === messagesBefore,
      "the migration must not create or delete a single Message row",
    );
    assert(
      (await processedEventCount(client)) === eventsBefore,
      "the migration must not create or delete a single ProcessedEvent row",
    );
    assert(
      JSON.stringify(await messageFingerprint(client)) === JSON.stringify(messageFingerprintBefore),
      "the migration must not touch any pre-existing Message column other than kind",
    );

    const kindsAfter = await messageKinds(client);
    assert(
      kindsAfter["message-legacy-in"] === "TEXT" && kindsAfter["message-legacy-out"] === "TEXT",
      "every pre-existing Message row must default to kind TEXT, with no explicit backfill",
    );

    const attachmentTable = await client.query(`SELECT to_regclass('"MessageAttachment"') AS present`);
    assert(attachmentTable.rows[0].present !== null, "the migration must create the MessageAttachment table");
    const attachmentCount = await client.query(`SELECT COUNT(*)::int AS total FROM "MessageAttachment"`);
    assert(attachmentCount.rows[0].total === 0, "MessageAttachment must start empty — it has no legacy stock to preserve");

    // Purga: so as linhas concluidas com base64 perdem exatamente essa chave;
    // o resto do payload — inclusive as chaves do proto de midia dentro de
    // `imageMessage` — permanece byte a byte igual.
    const payloadsAfter = await processedEventRawPayloads(client);
    const purgedIds = ["event-done-media", "event-failed-media", "event-ignored-media", "event-legacy-media"];
    for (const id of purgedIds) {
      assert(
        !("base64" in (payloadsAfter[id].rawPayload.data.Message ?? {})),
        `${id} must have data.Message.base64 removed after the backfill`,
      );
      assert(
        JSON.stringify(payloadsAfter[id].rawPayload) === JSON.stringify(withoutBase64(payloadsBefore[id].rawPayload)),
        `${id} must keep every field other than base64 unchanged, including the media proto keys (mediaKey, directPath, url, fileSHA256)`,
      );
    }

    // Eventos ainda pendentes nunca sao tocados: o base64 continua ali.
    const pendingIds = ["event-received-media", "event-processing-media"];
    for (const id of pendingIds) {
      assert(
        payloadsAfter[id].rawPayload.data.Message.base64 === payloadsBefore[id].rawPayload.data.Message.base64,
        `${id} is still pending and must keep its base64 untouched`,
      );
      assert(
        JSON.stringify(payloadsAfter[id].rawPayload) === JSON.stringify(payloadsBefore[id].rawPayload),
        `${id} is still pending and must not change at all`,
      );
    }

    // Concluido sem base64: nada para remover, payload inteiro identico.
    assert(
      JSON.stringify(payloadsAfter["event-done-text"].rawPayload) ===
        JSON.stringify(payloadsBefore["event-done-text"].rawPayload),
      "event-done-text has no base64 to remove and must stay byte-for-byte identical",
    );

    // Leitura do legado depois do corte: um binario anterior que so conhece
    // as colunas de antes do Goal013 continua escrevendo e lendo sem quebrar.
    await client.query(
      `INSERT INTO "Message" ("id", "tenantId", "channelId", "conversationId", "externalMessageId", "direction", "source", "role", "body") VALUES ('probe-message-legacy-writer', 'tenant-legacy', 'channel-legacy', 'conversation-legacy', '3EB0PROBE', 'INBOUND', 'CUSTOMER', 'user', 'Mensagem de sonda')`,
    );
    const legacyWriterKind = await client.query(
      `SELECT "kind"::text FROM "Message" WHERE "id" = 'probe-message-legacy-writer'`,
    );
    assert(
      legacyWriterKind.rows[0].kind === "TEXT",
      "a Message written by a binary that does not know kind must default to TEXT",
    );
    await client.query(`DELETE FROM "Message" WHERE "id" = 'probe-message-legacy-writer'`);

    // Comportamento novo, depois do corte: mensagem de midia com anexo.
    await client.query(
      `INSERT INTO "Message" ("id", "tenantId", "channelId", "conversationId", "externalMessageId", "direction", "source", "role", "body", "kind") VALUES ('probe-message-with-attachment', 'tenant-legacy', 'channel-legacy', 'conversation-legacy', '3EB0PROBEMEDIA', 'INBOUND', 'CUSTOMER', 'user', '', 'IMAGE')`,
    );
    await client.query(
      `INSERT INTO "MessageAttachment" ("id", "tenantId", "messageId", "kind", "mimetype", "sizeBytes", "updatedAt") VALUES ('probe-attachment-1', 'tenant-legacy', 'probe-message-with-attachment', 'IMAGE', 'image/jpeg', 204800, now())`,
    );
    const attachmentRow = await client.query(
      `SELECT "mimetype" FROM "MessageAttachment" WHERE "id" = 'probe-attachment-1'`,
    );
    assert(
      attachmentRow.rows[0].mimetype === "image/jpeg",
      "a Message created after the cutover must accept an attached MessageAttachment",
    );
    await client.query(`DELETE FROM "MessageAttachment" WHERE "id" = 'probe-attachment-1'`);
    await client.query(`DELETE FROM "Message" WHERE "id" = 'probe-message-with-attachment'`);

    assert((await messageCount(client)) === messagesBefore, "probing new/legacy writes must leave the Message fixture count exactly as it was");
    assert(
      (await processedEventCount(client)) === eventsBefore,
      "probing new/legacy writes must leave the ProcessedEvent fixture count exactly as it was",
    );

    // Retomada: reaplicar a migration nao muda nada nem lanca erro — a falha
    // real aqui seria o backfill reprocessar um evento ja purgado.
    const messageFingerprintBeforeRetry = await messageFingerprint(client);
    const payloadsBeforeRetry = await processedEventRawPayloads(client);
    const retried = await applyMigrationFile(client, MIGRATION_SQL);
    assert(retried === true, `the migration must be resumable: ${retried}`);
    assert(
      JSON.stringify(await messageFingerprint(client)) === JSON.stringify(messageFingerprintBeforeRetry),
      "reapplying the migration must not change a single Message row",
    );
    assert(
      JSON.stringify(await processedEventRawPayloads(client)) === JSON.stringify(payloadsBeforeRetry),
      "reapplying the migration must not change a single ProcessedEvent row, including already-purged payloads",
    );
    assert((await messageCount(client)) === messagesBefore, "reapplying the migration must leave the Message row count unchanged");
    assert(
      (await processedEventCount(client)) === eventsBefore,
      "reapplying the migration must leave the ProcessedEvent row count unchanged",
    );
  } finally {
    await client.end();
  }
}

/**
 * Expande o banco de durabilidade da IA (`AI_TEST_DATABASE_URL`, o
 * `_goal004` deixado pelo ensaio do Goal004 e expandido desde por
 * Goal005/006/011/012) com a migration deste Goal. `Message` e
 * `ProcessedEvent` ja existem la desde o Goal004, entao a migration se aplica
 * direto — sem schema minimo auxiliar, ao contrario do Goal012 com
 * `KnowledgeDocument`.
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
      "durability target not provisioned yet — skipping the Goal013 schema expansion",
    );
    return;
  }
  try {
    const messageTable = await client.query(`SELECT to_regclass('"Message"') AS present`);
    if (!messageTable.rows[0].present) {
      console.log(
        "durability target has no Message table yet — skipping the Goal013 schema expansion",
      );
      return;
    }

    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    if (applied !== true) {
      console.error(
        `goal013:media-migration-rehearsal FAILED — durability target expansion failed applying ${MIGRATION_SQL}: ${applied}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `durability target expanded with the Goal013 media migration: ${database}_goal004`,
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
    console.error("goal013:media-migration-rehearsal FAILED — see the assertions above.");
  } else {
    console.log(
      "goal013:media-migration-rehearsal PASSED — Message.kind and MessageAttachment are additive, the base64 " +
        "backfill purges only data.Message.base64 on concluded events while preserving every other field (including " +
        "media proto keys), pending events stay untouched, legacy and new write shapes both stay readable, and the " +
        "migration is resumable without changing state.",
    );
  }
}

if (isMain(import.meta.url)) await main();
