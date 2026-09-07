#!/usr/bin/env node

// Ensaio da migration de vínculo tenant/instância do Goal003 (gate M0).
//
// Reconstrói o schema como ele era antes deste Goal, semeia um estoque legado
// com os casos que importam — vínculo inequívoco, usuário com duas associações,
// dois usuários do mesmo negócio, instância órfã e instância em texto puro —,
// aplica o arquivo de migration real e reconcilia as contagens.
//
// O que o ensaio prova:
//   1. a expansão não perde linha e não inventa dono;
//   2. o backfill só resolve proveniência inequívoca;
//   3. o backfill é retomável: repetido, não duplica nem reatribui;
//   4. a unicidade por negócio entra depois do backfill e recusa o segundo
//      número do mesmo negócio.
//
// Nenhuma credencial aparece na saída: só contagens e rótulos de caso. Roda
// num banco próprio derivado de BFF_TEST_DATABASE_URL, nunca no banco do app.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

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
  "bff",
  "prisma",
  "migrations",
  "20260907120000_goal003_session_and_tenant_instance_link",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal003:migration-rehearsal REFUSED — ${message}`);
  process.exit(2);
}

function rehearsalUrl() {
  const raw = process.env.BFF_TEST_DATABASE_URL?.trim();
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

  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${database}_rehearsal`;
  return { rehearsal, maintenance: new URL(raw), name: `${database}_rehearsal`, host, port: url.port || "5432" };
}

// Schema anterior ao Goal003, reduzido às tabelas que a migration toca.
const LEGACY_SCHEMA = `
DROP TABLE IF EXISTS "UserSession";
DROP TABLE IF EXISTS "WhatsAppInstance";
DROP TABLE IF EXISTS "TenantMember";
DROP TABLE IF EXISTS "Tenant";
DROP TABLE IF EXISTS "User";

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL
);

CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL
);

CREATE TABLE "TenantMember" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'OWNER',
  CONSTRAINT "TenantMember_tenantId_userId_key" UNIQUE ("tenantId", "userId")
);

CREATE TABLE "WhatsAppInstance" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "evolutionInstanceId" TEXT,
  "evolutionInstanceName" TEXT NOT NULL UNIQUE,
  "evolutionInstanceToken" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED'
);
`;

/**
 * Estoque legado sintético.
 *
 * - `clear`: usuário com exatamente uma associação e negócio sem disputa.
 * - `shared-*`: dois usuários do mesmo negócio, cada um com uma instância.
 * - `multi`: usuário associado a dois negócios.
 * - `orphan`: instância cujo usuário não tem associação alguma.
 * - `plaintext`: vínculo inequívoco com credencial ainda em texto puro.
 */
const FIXTURE = `
INSERT INTO "User" ("id", "email", "passwordHash") VALUES
  ('user-clear',     'clear@example.invalid',     'synthetic-hash'),
  ('user-shared-1',  'shared1@example.invalid',   'synthetic-hash'),
  ('user-shared-2',  'shared2@example.invalid',   'synthetic-hash'),
  ('user-multi',     'multi@example.invalid',     'synthetic-hash'),
  ('user-orphan',    'orphan@example.invalid',    'synthetic-hash'),
  ('user-plaintext', 'plaintext@example.invalid', 'synthetic-hash');

INSERT INTO "Tenant" ("id", "name") VALUES
  ('tenant-clear',     'Negocio Claro'),
  ('tenant-shared',    'Negocio Compartilhado'),
  ('tenant-multi-a',   'Negocio Multi A'),
  ('tenant-multi-b',   'Negocio Multi B'),
  ('tenant-plaintext', 'Negocio Texto Puro');

INSERT INTO "TenantMember" ("id", "tenantId", "userId") VALUES
  ('member-clear',     'tenant-clear',     'user-clear'),
  ('member-shared-1',  'tenant-shared',    'user-shared-1'),
  ('member-shared-2',  'tenant-shared',    'user-shared-2'),
  ('member-multi-a',   'tenant-multi-a',   'user-multi'),
  ('member-multi-b',   'tenant-multi-b',   'user-multi'),
  ('member-plaintext', 'tenant-plaintext', 'user-plaintext');

INSERT INTO "WhatsAppInstance"
  ("id", "userId", "evolutionInstanceId", "evolutionInstanceName", "evolutionInstanceToken") VALUES
  ('instance-clear',     'user-clear',     'ext-clear',     'clear_instance',     'synthetic-token-clear'),
  ('instance-shared-1',  'user-shared-1',  'ext-shared-1',  'shared_instance_1',  'synthetic-token-shared-1'),
  ('instance-shared-2',  'user-shared-2',  'ext-shared-2',  'shared_instance_2',  'synthetic-token-shared-2'),
  ('instance-multi',     'user-multi',     'ext-multi',     'multi_instance',     'synthetic-token-multi'),
  ('instance-orphan',    'user-orphan',    'ext-orphan',    'orphan_instance',    'synthetic-token-orphan'),
  ('instance-plaintext', 'user-plaintext', 'ext-plaintext', 'plaintext_instance', 'synthetic-token-plaintext');
`;

// Mesma consulta do backfill da migration, isolada para provar retomada.
const BACKFILL = `
WITH candidate AS (
    SELECT wi."id" AS instance_id, m."tenantId" AS tenant_id
    FROM "WhatsAppInstance" wi
    JOIN "TenantMember" m ON m."userId" = wi."userId"
    WHERE wi."tenantId" IS NULL
      AND (SELECT COUNT(*) FROM "TenantMember" m2 WHERE m2."userId" = wi."userId") = 1
),
unambiguous AS (
    SELECT tenant_id, MIN(instance_id) AS instance_id
    FROM candidate
    GROUP BY tenant_id
    HAVING COUNT(*) = 1
)
UPDATE "WhatsAppInstance" wi
SET "tenantId" = u.tenant_id
FROM unambiguous u
WHERE wi."id" = u.instance_id;
`;

async function inventory(client) {
  const { rows } = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT("tenantId")::int AS linked,
      COUNT(*) FILTER (WHERE "tenantId" IS NULL)::int AS pending,
      COUNT(*) FILTER (WHERE "credentialVersion" = 0)::int AS plaintext_credentials
    FROM "WhatsAppInstance"
  `);
  return rows[0];
}

async function pendingCases(client) {
  const { rows } = await client.query(`
    SELECT wi."id" AS instance,
      CASE
        WHEN (SELECT COUNT(*) FROM "TenantMember" m WHERE m."userId" = wi."userId") = 0
          THEN 'orphan: user has no membership'
        WHEN (SELECT COUNT(*) FROM "TenantMember" m WHERE m."userId" = wi."userId") > 1
          THEN 'ambiguous: user belongs to more than one business'
        ELSE 'ambiguous: business is claimed by more than one instance'
      END AS reason
    FROM "WhatsAppInstance" wi
    WHERE wi."tenantId" IS NULL
    ORDER BY wi."id"
  `);
  return rows;
}

async function main() {
  const target = rehearsalUrl();

  const maintenance = new URL(target.maintenance);
  maintenance.pathname = "/postgres";
  const admin = new Client({ connectionString: maintenance.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${target.name}"`);
    await admin.query(`CREATE DATABASE "${target.name}"`);
  } finally {
    await admin.end();
  }
  console.log(
    `goal003:migration-rehearsal target: ${target.host}:${target.port}/${target.name}`,
  );

  const client = new Client({ connectionString: target.rehearsal.toString() });
  await client.connect();
  let failures = 0;
  const check = (label, condition, detail) => {
    console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!condition) failures += 1;
  };

  try {
    await client.query(LEGACY_SCHEMA);
    await client.query(FIXTURE);

    const { rows: legacyRows } = await client.query(
      `SELECT COUNT(*)::int AS total FROM "WhatsAppInstance"`,
    );
    const before = { total: legacyRows[0].total };
    console.log(`\nlegacy stock: ${JSON.stringify({ instances: before.total })}`);

    await client.query(readFileSync(MIGRATION_SQL, "utf8"));

    const after = await inventory(client);
    const pending = await pendingCases(client);
    console.log(`after expand: ${JSON.stringify(after)}`);
    for (const row of pending) {
      console.log(`  pending ${row.instance}: ${row.reason}`);
    }

    check(
      "expand preserves every row",
      after.total === before.total,
      `${before.total} -> ${after.total}`,
    );
    check(
      "only unambiguous links receive an owner",
      after.linked === 2,
      `linked=${after.linked} (clear, plaintext)`,
    );
    check(
      "ambiguous and orphan links stay pending, never reassigned",
      after.pending === 4 && pending.length === 4,
      `pending=${after.pending}`,
    );
    check(
      "legacy credentials keep version 0 until the controlled sealing",
      after.plaintext_credentials === after.total,
      `plaintext=${after.plaintext_credentials}`,
    );

    const ownersBefore = await client.query(
      `SELECT "id", "tenantId" FROM "WhatsAppInstance" ORDER BY "id"`,
    );
    await client.query(BACKFILL);
    const ownersAfter = await client.query(
      `SELECT "id", "tenantId" FROM "WhatsAppInstance" ORDER BY "id"`,
    );
    check(
      "backfill is resumable: repeating it changes nothing",
      JSON.stringify(ownersBefore.rows) === JSON.stringify(ownersAfter.rows),
      `${ownersAfter.rowCount} rows compared`,
    );

    // Cardinalidade: um número por negócio, aplicada depois do backfill.
    let duplicateRejected = false;
    try {
      await client.query(
        `UPDATE "WhatsAppInstance" SET "tenantId" = 'tenant-clear' WHERE "id" = 'instance-orphan'`,
      );
    } catch {
      duplicateRejected = true;
    }
    check(
      "a second number for the same business is refused by the unique index",
      duplicateRejected,
    );

    // Sessões revogáveis existem e são consultáveis.
    const sessions = await client.query(
      `SELECT COUNT(*)::int AS total FROM "UserSession"`,
    );
    check(
      "the revocable session table is created empty",
      sessions.rows[0].total === 0,
    );
  } finally {
    await client.end();
  }

  console.log(
    failures === 0
      ? "\ngoal003:migration-rehearsal PASSED"
      : `\ngoal003:migration-rehearsal FAILED — ${failures} check(s)`,
  );
  return failures === 0 ? 0 : 1;
}

process.exit(await main());
