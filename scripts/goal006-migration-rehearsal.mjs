#!/usr/bin/env node

// Ensaio da migração de identidade de cliente do Goal006 (M0/M1).
//
// Reconstrói o schema do Scheduling como ele era antes deste Goal — telefone
// obrigatório e único por tenant —, semeia o estoque legado que importa
// (clientes com e sem nome, telefone repetido entre tenants, agendamentos por
// cliente, apontamentos de `ExternalEntityMap`), aplica os dois arquivos de
// migration reais **em passos separados** e reconcilia as contagens.
//
// O que o ensaio prova:
//   1. o passo de expansão não perde, funde nem duplica linha, e preserva ID,
//      nome e telefone de cada cliente;
//   2. depois da expansão a unicidade antiga **ainda vale**: o corte é um
//      passo próprio, não um efeito colateral;
//   3. depois do corte, duas pessoas com o mesmo número no mesmo tenant
//      coexistem, e cliente sem telefone é aceito;
//   4. `ExternalEntityMap` continua apontando para os mesmos IDs;
//   5. os dois passos são retomáveis: repetidos, não mudam contagem nem estado.
//
// Deixa o banco no estado pós-migration para a suíte de integração do
// Scheduling rodar sobre o resultado do ensaio, e não sobre um schema montado
// à parte. Nenhuma credencial aparece na saída: só contagens e rótulos.

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
    "scheduling-service",
    "prisma",
    "migrations",
    name,
    "migration.sql",
  );

const EXPAND_SQL = migrationFile("20260908160000_goal006_customer_identity_expand");
const CUT_SQL = migrationFile("20260908161000_goal006_customer_phone_not_unique");

function refuse(message) {
  console.error(`goal006:migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal006`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema do Scheduling anterior ao Goal006, reduzido ao que as migrations
// tocam. Telefone obrigatório e `(tenantId, normalizedPhone)` único.
const LEGACY_SCHEMA = `
CREATE TYPE "AppointmentSource" AS ENUM ('AI', 'USER', 'INTEGRATION');
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'ON_REQUEST');
CREATE TYPE "IntegrationProvider" AS ENUM ('MINHA_AGENDA');
CREATE TYPE "ExternalEntityType" AS ENUM ('SERVICE', 'CUSTOMER', 'APPOINTMENT', 'AVAILABILITY');

CREATE TABLE "Customer" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT,
  "phone" TEXT NOT NULL,
  "normalizedPhone" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Customer_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "Customer_tenantId_normalizedPhone_key" UNIQUE ("tenantId", "normalizedPhone")
);
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");

CREATE TABLE "Appointment" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "source" "AppointmentSource" NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "comments" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Appointment_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "Appointment_customer_fkey" FOREIGN KEY ("tenantId", "customerId")
    REFERENCES "Customer"("tenantId", "id") ON DELETE RESTRICT
);

CREATE TABLE "ExternalEntityMap" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "entityType" "ExternalEntityType" NOT NULL,
  "internalId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalEntityMap_unique" UNIQUE ("tenantId", "provider", "entityType", "externalId")
);
`;

/**
 * Estoque legado sintético. Dois tenants de propósito: o mesmo número em A e em
 * B sempre foram pessoas distintas, e a migração não pode misturá-las.
 */
const FIXTURE = `
INSERT INTO "Customer" ("id", "tenantId", "name", "phone", "normalizedPhone") VALUES
  ('cus-a-maria',   'tenant-a', 'Maria',  '+55 11 90000-0001', '5511900000001'),
  ('cus-a-noname',  'tenant-a', NULL,     '+55 11 90000-0002', '5511900000002'),
  ('cus-a-ana',     'tenant-a', 'Ana',    '+55 11 90000-0003', '5511900000003'),
  ('cus-b-maria',   'tenant-b', 'Maria',  '+55 11 90000-0001', '5511900000001');

INSERT INTO "Appointment" ("id", "tenantId", "customerId", "source", "startAt", "endAt", "status", "createdBy") VALUES
  ('apt-1', 'tenant-a', 'cus-a-maria',  'AI',   TIMESTAMP '2026-09-10 13:00:00', TIMESTAMP '2026-09-10 14:00:00', 'SCHEDULED', 'user-a'),
  ('apt-2', 'tenant-a', 'cus-a-maria',  'USER', TIMESTAMP '2026-09-12 13:00:00', TIMESTAMP '2026-09-12 14:00:00', 'SCHEDULED', 'user-a'),
  ('apt-3', 'tenant-a', 'cus-a-noname', 'AI',   TIMESTAMP '2026-09-11 09:00:00', TIMESTAMP '2026-09-11 10:00:00', 'SCHEDULED', 'user-a'),
  ('apt-4', 'tenant-b', 'cus-b-maria',  'AI',   TIMESTAMP '2026-09-11 15:00:00', TIMESTAMP '2026-09-11 16:00:00', 'SCHEDULED', 'user-b');

INSERT INTO "ExternalEntityMap" ("id", "tenantId", "provider", "entityType", "internalId", "externalId") VALUES
  ('map-1', 'tenant-a', 'MINHA_AGENDA', 'CUSTOMER', 'cus-a-maria', 'ext-maria'),
  ('map-2', 'tenant-a', 'MINHA_AGENDA', 'CUSTOMER', 'cus-a-ana',   'ext-ana');
`;

async function inventory(client) {
  const customers = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "name" IS NULL)::int AS without_name,
           COUNT(*) FILTER (WHERE "normalizedPhone" IS NULL)::int AS without_phone,
           COUNT(DISTINCT "normalizedPhone")::int AS distinct_phones,
           COUNT(DISTINCT ("tenantId", "normalizedPhone"))::int AS distinct_tenant_phones
    FROM "Customer"
  `);
  const appointments = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(DISTINCT "customerId")::int AS distinct_customers
    FROM "Appointment"
  `);
  const maps = await client.query(`
    SELECT COUNT(*)::int AS total FROM "ExternalEntityMap" WHERE "entityType" = 'CUSTOMER'
  `);
  return {
    customers: customers.rows[0],
    appointments: appointments.rows[0],
    customerMaps: maps.rows[0].total,
  };
}

async function customerFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", COALESCE("name", '<null>') AS name,
           COALESCE("phone", '<null>') AS phone
    FROM "Customer" ORDER BY "id"
  `);
  return rows.rows.map(
    (row) => `${row.tenantId}/${row.id}/${row.name}/${row.phone}`,
  );
}

async function phoneUniqueIndexes(client) {
  const rows = await client.query(`
    SELECT "indexname"::text AS name, "indexdef"::text AS definition
    FROM pg_indexes
    WHERE "tablename" = 'Customer' AND "indexdef" ILIKE '%normalizedPhone%'
    ORDER BY "indexname"
  `);
  return rows.rows;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`goal006:migration-rehearsal FAILED — ${message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function sharedPhoneIsAccepted(client) {
  try {
    await client.query(
      `INSERT INTO "Customer" ("id", "tenantId", "name", "phone", "normalizedPhone")
       VALUES ('cus-a-pedro', 'tenant-a', 'Pedro', '+55 11 90000-0001', '5511900000001')`,
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const target = rehearsalTarget();
  console.log(`goal006:migration-rehearsal target: ${target.label}`);

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
    const fingerprintBefore = await customerFingerprint(client);
    console.log(
      `M0 inventory — customers: ${before.customers.total} ` +
        `(without name ${before.customers.without_name}, without phone ${before.customers.without_phone}, ` +
        `distinct normalised phones ${before.customers.distinct_phones}, ` +
        `distinct tenant+phone ${before.customers.distinct_tenant_phones})`,
    );
    console.log(
      `M0 inventory — appointments: ${before.appointments.total} ` +
        `over ${before.appointments.distinct_customers} customer(s); ` +
        `customer entries in ExternalEntityMap: ${before.customerMaps}`,
    );
    assert(
      before.customers.distinct_phones < before.customers.distinct_tenant_phones,
      "the fixture must contain a normalised phone colliding across tenants",
    );

    // Passo 1 — expansão.
    await client.query(readFileSync(EXPAND_SQL, "utf8"));
    const afterExpand = await inventory(client);
    assert(
      afterExpand.customers.total === before.customers.total &&
        afterExpand.appointments.total === before.appointments.total &&
        afterExpand.customerMaps === before.customerMaps,
      `expand changed row counts: customers ${before.customers.total}->${afterExpand.customers.total}, ` +
        `appointments ${before.appointments.total}->${afterExpand.appointments.total}, ` +
        `maps ${before.customerMaps}->${afterExpand.customerMaps}`,
    );
    assert(
      JSON.stringify(await customerFingerprint(client)) ===
        JSON.stringify(fingerprintBefore),
      "expand must preserve every customer id, name and phone — no merge, rename or dedup",
    );
    const stillUnique = !(await sharedPhoneIsAccepted(client));
    assert(
      stillUnique,
      "after expand the old uniqueness must still hold: the cut is a separate step",
    );
    console.log(
      `after expand — customers ${afterExpand.customers.total}, ` +
        `old uniqueness still enforced: ${stillUnique}`,
    );

    // Expansão retomável: repetir não muda nada.
    await client.query(readFileSync(EXPAND_SQL, "utf8"));
    const expandTwice = await inventory(client);
    assert(
      expandTwice.customers.total === afterExpand.customers.total,
      "the expand step must be resumable without duplicating rows",
    );

    // Passo 2 — corte, só depois de os consumers estarem migrados.
    await client.query(readFileSync(CUT_SQL, "utf8"));
    const afterCut = await inventory(client);
    assert(
      afterCut.customers.total === before.customers.total &&
        afterCut.appointments.total === before.appointments.total &&
        afterCut.customerMaps === before.customerMaps,
      "the cut step must not touch a single row",
    );
    assert(
      JSON.stringify(await customerFingerprint(client)) ===
        JSON.stringify(fingerprintBefore),
      "the cut must preserve every customer id, name and phone",
    );

    const indexes = await phoneUniqueIndexes(client);
    console.log(
      `after cut — phone indexes: ${indexes
        .map((index) => `${index.name}${index.definition.includes("UNIQUE") ? " (unique)" : ""}`)
        .join(", ")}`,
    );
    assert(
      indexes.every((index) => !index.definition.includes("UNIQUE")),
      "no unique index over the normalised phone may survive the cut",
    );
    assert(
      indexes.length > 0,
      "candidate lookup by phone must keep an index after the cut",
    );

    // Depois do corte: número compartilhado e cliente sem telefone.
    const shared = await sharedPhoneIsAccepted(client);
    assert(shared, "two people must be able to share a phone in the same tenant");
    await client.query(
      `INSERT INTO "Customer" ("id", "tenantId", "name", "phone", "normalizedPhone")
       VALUES ('cus-a-child', 'tenant-a', 'Filho', NULL, NULL)`,
    );
    const final = await inventory(client);
    console.log(
      `after cut — customers ${final.customers.total} ` +
        `(without phone ${final.customers.without_phone}); shared phone accepted: ${shared}`,
    );
    assert(
      final.customers.without_phone === 1,
      "a customer without a phone must be accepted after the cut",
    );

    // Corte retomável.
    await client.query(readFileSync(CUT_SQL, "utf8"));
    const cutTwice = await inventory(client);
    assert(
      cutTwice.customers.total === final.customers.total,
      "the cut step must be resumable",
    );

    const preservedMaps = await client.query(`
      SELECT COUNT(*)::int AS total
      FROM "ExternalEntityMap" AS "m"
      JOIN "Customer" AS "c" ON "c"."id" = "m"."internalId" AND "c"."tenantId" = "m"."tenantId"
      WHERE "m"."entityType" = 'CUSTOMER'
    `);
    assert(
      preservedMaps.rows[0].total === before.customerMaps,
      "every customer map entry must still resolve to the same customer",
    );

    const crossTenant = await client.query(`
      SELECT COUNT(*)::int AS total
      FROM "Appointment" AS "a"
      JOIN "Customer" AS "c" ON "c"."id" = "a"."customerId"
      WHERE "c"."tenantId" <> "a"."tenantId"
    `);
    assert(
      crossTenant.rows[0].total === 0,
      "no appointment may end up pointing at another tenant's customer",
    );

    if (process.exitCode) {
      console.error("goal006:migration-rehearsal FAILED — see the assertions above.");
    } else {
      console.log(
        "goal006:migration-rehearsal PASSED — expand preserved every person, the cut removed only the index, and shared phones are accepted only after it.",
      );
    }
  } finally {
    await client.end();
  }
}

await main();
