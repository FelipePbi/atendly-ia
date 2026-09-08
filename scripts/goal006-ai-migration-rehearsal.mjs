#!/usr/bin/env node

// Ensaio das migrations da IA no Goal006 (M0/M1).
//
// Duas migrations aditivas sobre o schema pós-Goal005:
//   - `Contact.customerId`, a referência por ID para a pessoa do Scheduling;
//   - o índice único **parcial** que garante no máximo uma `ConversationSession`
//     aberta por conversa (resíduo do Goal005).
//
// O que o ensaio prova:
//   1. nenhuma linha é perdida, criada ou reescrita pelas duas migrations;
//   2. `customerId` nasce nulo em todo mundo: o backfill não afirma para quem
//      eram agendamentos antigos;
//   3. sessões abertas duplicadas do estoque legado são **fechadas** com motivo
//      explícito, nunca apagadas, e sobra exatamente uma aberta por conversa;
//   4. depois do índice, uma segunda abertura concorrente falha no banco;
//   5. as duas migrations são retomáveis.
//
// Banco próprio e descartável, derivado de BFF_TEST_DATABASE_URL. Nenhuma
// credencial aparece na saída: só contagens e rótulos.

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

const migrationFile = (name) =>
  path.join(
    repositoryRoot,
    "apps",
    "ai-orchestrator",
    "prisma",
    "migrations",
    name,
    "migration.sql",
  );

const LINK_SQL = migrationFile("20260908170000_goal006_contact_customer_link");
const INDEX_SQL = migrationFile("20260908171000_goal005_single_open_session");

function refuse(message) {
  console.error(`goal006:ai-migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal006_ai`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema da IA depois do Goal005, reduzido ao que estas migrations tocam.
const LEGACY_SCHEMA = `
CREATE TYPE "SessionCategory" AS ENUM ('COMMERCIAL', 'UNCLASSIFIED', 'PERSONAL');
CREATE TYPE "CategorySource" AS ENUM ('AUTOMATIC', 'MANUAL');
CREATE TYPE "HumanControlSource" AS ENUM ('WHATSAPP', 'ATENDLY', 'BACKFILL');

CREATE TABLE "Contact" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "externalContactId" TEXT NOT NULL,
  "displayName" TEXT,
  "ignored" BOOLEAN NOT NULL DEFAULT false,
  "aiPaused" BOOLEAN NOT NULL DEFAULT false,
  "categoryOverride" "SessionCategory",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Contact_tenantId_channelId_externalContactId_key" UNIQUE ("tenantId", "channelId", "externalContactId"),
  CONSTRAINT "Contact_tenantId_id_key" UNIQUE ("tenantId", "id")
);

CREATE TABLE "ConversationSession" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "endedReason" TEXT,
  "category" "SessionCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
  "categorySource" "CategorySource" NOT NULL DEFAULT 'AUTOMATIC',
  "humanHandling" BOOLEAN NOT NULL DEFAULT false,
  "inboundVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationSession_tenantId_id_key" UNIQUE ("tenantId", "id")
);
`;

/**
 * Estoque legado sintético:
 *
 * - `conv-single`: uma sessão aberta, o caso normal;
 * - `conv-duplicated`: **duas** sessões abertas, o defeito que o índice fecha;
 * - `conv-closed`: só sessões encerradas.
 */
const FIXTURE = `
INSERT INTO "Contact" ("id", "tenantId", "channelId", "externalContactId", "displayName") VALUES
  ('contact-a', 'tenant-a', 'channel-a', '5511900000001', 'Maria'),
  ('contact-b', 'tenant-b', 'channel-b', '5511900000001', 'Maria');

INSERT INTO "ConversationSession" ("id", "tenantId", "channelId", "conversationId", "contactId", "startedAt", "expiresAt", "endedAt", "endedReason") VALUES
  ('s-single',    'tenant-a', 'channel-a', 'conv-single',     'contact-a', TIMESTAMP '2026-09-01 10:00:00', TIMESTAMP '2026-09-02 10:00:00', NULL, NULL),
  ('s-dup-old',   'tenant-a', 'channel-a', 'conv-duplicated', 'contact-a', TIMESTAMP '2026-09-01 09:00:00', TIMESTAMP '2026-09-02 09:00:00', NULL, NULL),
  ('s-dup-new',   'tenant-a', 'channel-a', 'conv-duplicated', 'contact-a', TIMESTAMP '2026-09-01 11:00:00', TIMESTAMP '2026-09-02 11:00:00', NULL, NULL),
  ('s-closed',    'tenant-b', 'channel-b', 'conv-closed',     'contact-b', TIMESTAMP '2026-08-30 10:00:00', TIMESTAMP '2026-08-31 10:00:00', TIMESTAMP '2026-08-31 10:00:00', 'contact_inactivity');
`;

async function inventory(client) {
  const contacts = await client.query(
    `SELECT COUNT(*)::int AS total FROM "Contact"`,
  );
  const sessions = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "endedAt" IS NULL)::int AS open
    FROM "ConversationSession"
  `);
  return { contacts: contacts.rows[0].total, sessions: sessions.rows[0] };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`goal006:ai-migration-rehearsal FAILED — ${message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function secondOpenSessionIsRejected(client) {
  try {
    await client.query(
      `INSERT INTO "ConversationSession"
         ("id", "tenantId", "channelId", "conversationId", "contactId", "startedAt", "expiresAt")
       VALUES ('s-race', 'tenant-a', 'channel-a', 'conv-single', 'contact-a',
               TIMESTAMP '2026-09-01 12:00:00', TIMESTAMP '2026-09-02 12:00:00')`,
    );
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const target = rehearsalTarget();
  console.log(`goal006:ai-migration-rehearsal target: ${target.label}`);

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

    const before = await inventory(client);
    console.log(
      `M0 inventory — contacts: ${before.contacts}; sessions: ${before.sessions.total} ` +
        `(open ${before.sessions.open})`,
    );
    assert(
      before.sessions.open === 3,
      "the fixture must contain a conversation with more than one open session",
    );

    await client.query(readFileSync(LINK_SQL, "utf8"));
    const linked = await client.query(`
      SELECT COUNT(*)::int AS total,
             COUNT("customerId")::int AS with_customer
      FROM "Contact"
    `);
    assert(
      linked.rows[0].total === before.contacts,
      "the contact link migration must not change the contact count",
    );
    assert(
      linked.rows[0].with_customer === 0,
      "the migration must not invent a customer for any legacy contact",
    );

    await client.query(readFileSync(INDEX_SQL, "utf8"));
    const after = await inventory(client);
    console.log(
      `after migrations — contacts: ${after.contacts}; sessions: ${after.sessions.total} ` +
        `(open ${after.sessions.open})`,
    );
    assert(
      after.sessions.total === before.sessions.total &&
        after.contacts === before.contacts,
      "no row may be deleted by these migrations",
    );
    assert(
      after.sessions.open === 2,
      "exactly one open session must remain per conversation that had any",
    );

    const superseded = await client.query(`
      SELECT "id", "endedReason" FROM "ConversationSession"
      WHERE "endedReason" = 'superseded_duplicate_open_session'
    `);
    assert(
      superseded.rows.length === 1 && superseded.rows[0].id === "s-dup-old",
      "the oldest duplicate must be the one closed, with an explicit reason",
    );

    const rejected = await secondOpenSessionIsRejected(client);
    console.log(`second concurrent open session rejected: ${rejected}`);
    assert(
      rejected,
      "the partial unique index must reject a second open session for the same conversation",
    );

    // Retomada: reaplicar as duas migrations não muda contagem nem estado.
    await client.query(readFileSync(LINK_SQL, "utf8"));
    await client.query(readFileSync(INDEX_SQL, "utf8"));
    const again = await inventory(client);
    assert(
      again.sessions.total === after.sessions.total &&
        again.sessions.open === after.sessions.open &&
        again.contacts === after.contacts,
      "both migrations must be resumable without changing counts",
    );

    if (process.exitCode) {
      console.error(
        "goal006:ai-migration-rehearsal FAILED — see the assertions above.",
      );
    } else {
      console.log(
        "goal006:ai-migration-rehearsal PASSED — contact link added without backfill, duplicate open sessions closed with provenance, and the partial index enforced.",
      );
    }
  } finally {
    await client.end();
  }

  await prepareDurabilityTarget(target);
}

/**
 * Aplica as mesmas migrations no banco que a suíte de persistência da IA usa.
 *
 * O gate mantém um alvo só para essa suíte — o banco deixado pelo ensaio do
 * Goal004, já expandido pelo do Goal005. Os arquivos aplicados são os mesmos,
 * sem cópia paralela do schema; as checagens de existência deixam o passo
 * idempotente.
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
    const contactTable = await client.query(
      `SELECT to_regclass('"Contact"') AS present`,
    );
    if (!contactTable.rows[0].present) {
      console.log(
        "durability target has no Contact table yet — skipping the schema expansion",
      );
      return;
    }
    await client.query(readFileSync(LINK_SQL, "utf8"));
    await client.query(readFileSync(INDEX_SQL, "utf8"));
    console.log(
      `durability target expanded with the Goal006 migrations: ${database}_goal004`,
    );
  } finally {
    await client.end();
  }
}

await main();
