#!/usr/bin/env node

// Ensaio da migração de regras de oferta, buffers, exceções geridas, séries
// de bloqueio/compromisso e série de atendimento do Goal009.
//
// Reconstrói o schema do Scheduling como ele era ao fim do Goal008
// (CalendarSettings sem regra de oferta, TimeBlock sem tipo/título/série,
// AppointmentHold sem buffer proposto, Appointment sem snapshot de buffer
// nem série), semeia o estoque legado que importa (regras, exceção, bloco,
// atendimento com item, hold real), aplica a migration única deste Goal —
// aditiva, sem passo de corte — e reconcilia as contagens.
//
// O que o ensaio prova:
//   1. nenhuma linha existente muda de horário, ocupação, acordo ou estado;
//   2. as colunas novas nascem com o default que o motor já praticava
//      (sem antecedência mínima, noventa dias de horizonte, passo de trinta
//      minutos, bloco vira `BLOCK`, buffer zero);
//   3. as constraints novas (granularidade válida, mínima < máxima, série de
//      bloqueio finita por data OU contagem, intervalo de série de
//      atendimento válido, buffers não negativos) aceitam todo o conteúdo
//      existente e recusam os casos inválidos;
//   4. a migration é retomável: reaplicada sobre o estado já migrado, não
//      muda nenhuma linha nem lança erro.
//
// Deixa o banco no estado pós-migration para a suíte de integração do
// Scheduling rodar sobre o resultado do ensaio. Nenhuma credencial aparece
// na saída: só contagens e rótulos.

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
  "20260909190000_goal009_offer_rules_and_series",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal009:migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal009`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema do Scheduling ao fim do Goal008, reduzido ao que a migration deste
// Goal toca ou de que depende via FK.
const LEGACY_SCHEMA = `
CREATE TYPE "CalendarSource" AS ENUM ('ATENDLY', 'MINHA_AGENDA');
CREATE TYPE "AppointmentSource" AS ENUM ('AI', 'USER', 'INTEGRATION');
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'STARTING_AT', 'ON_REQUEST', 'NOT_INFORMED');
CREATE TYPE "AppointmentHoldSource" AS ENUM ('AI', 'USER');
CREATE TYPE "CalendarEffectEntityType" AS ENUM ('APPOINTMENT', 'APPOINTMENT_HOLD', 'TIME_BLOCK');

CREATE TABLE "CalendarSettings" (
  "tenantId" TEXT PRIMARY KEY,
  "source" "CalendarSource" NOT NULL,
  "timezone" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AvailabilityRule" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TIME(0) NOT NULL,
  "endTime" TIME(0) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "AvailabilityException" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "startTime" TIME(0),
  "endTime" TIME(0),
  "available" BOOLEAN NOT NULL,
  "reason" TEXT
);

CREATE TABLE "Customer" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT,
  "phone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Customer_tenantId_id_key" UNIQUE ("tenantId", "id")
);

CREATE TABLE "Service" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "durationMinutes" INTEGER,
  "priceType" "PriceType" NOT NULL,
  "price" DECIMAL(12,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Service_tenantId_id_key" UNIQUE ("tenantId", "id")
);

CREATE TABLE "Appointment" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "source" "AppointmentSource" NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "statusRaw" TEXT,
  "title" TEXT,
  "createdBy" TEXT NOT NULL,
  "comments" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Appointment_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "Appointment_customer_fkey" FOREIGN KEY ("tenantId", "customerId")
    REFERENCES "Customer"("tenantId", "id") ON DELETE RESTRICT
);

CREATE TABLE "AppointmentItem" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "serviceNameSnapshot" TEXT NOT NULL,
  "durationMinutesSnapshot" INTEGER,
  "priceTypeSnapshot" "PriceType" NOT NULL,
  "priceSnapshot" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentItem_appointment_fkey" FOREIGN KEY ("tenantId", "appointmentId")
    REFERENCES "Appointment"("tenantId", "id") ON DELETE RESTRICT,
  CONSTRAINT "AppointmentItem_service_fkey" FOREIGN KEY ("tenantId", "serviceId")
    REFERENCES "Service"("tenantId", "id") ON DELETE RESTRICT
);

CREATE TABLE "TimeBlock" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AppointmentHold" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "proposedServiceIds" JSONB NOT NULL,
  "proposedDurationMinutes" INTEGER NOT NULL,
  "customerId" TEXT,
  "contactRef" TEXT,
  "source" "AppointmentHoldSource" NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentHold_tenantId_id_key" UNIQUE ("tenantId", "id")
);
`;

/**
 * Estoque legado sintético: dois tenants. tenant-a tem regra semanal,
 * exceção, bloqueio, atendimento confirmado com item e um hold real
 * (horário no futuro, TTL de cinco minutos). tenant-b só prova isolamento.
 */
const FIXTURE = `
INSERT INTO "CalendarSettings" ("tenantId", "source", "timezone") VALUES
  ('tenant-a', 'ATENDLY', 'America/Sao_Paulo'),
  ('tenant-b', 'ATENDLY', 'America/Sao_Paulo');

INSERT INTO "AvailabilityRule" ("id", "tenantId", "dayOfWeek", "startTime", "endTime", "active") VALUES
  ('rule-a-1', 'tenant-a', 1, TIME '08:00', TIME '18:00', true);

INSERT INTO "AvailabilityException" ("id", "tenantId", "date", "available", "reason") VALUES
  ('exc-a-1', 'tenant-a', DATE '2026-09-14', false, 'Feriado local');

INSERT INTO "Customer" ("id", "tenantId", "name", "phone") VALUES
  ('cus-a-maria', 'tenant-a', 'Maria', '5511900000001');

INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active") VALUES
  ('svc-a-corte', 'tenant-a', 'Corte', 30, 'FIXED', 50.00, true);

INSERT INTO "Appointment" ("id", "tenantId", "customerId", "source", "startAt", "endAt", "status", "statusRaw", "createdBy") VALUES
  ('apt-a-1', 'tenant-a', 'cus-a-maria', 'USER', TIMESTAMP '2026-09-10 13:00:00', TIMESTAMP '2026-09-10 13:30:00', 'CONFIRMED', 'CONFIRMED', 'user-a');

INSERT INTO "AppointmentItem" ("id", "tenantId", "appointmentId", "serviceId", "serviceNameSnapshot", "durationMinutesSnapshot", "priceTypeSnapshot", "priceSnapshot") VALUES
  ('item-a-1', 'tenant-a', 'apt-a-1', 'svc-a-corte', 'Corte', 30, 'FIXED', 50.00);

INSERT INTO "TimeBlock" ("id", "tenantId", "startAt", "endAt", "reason") VALUES
  ('block-a-1', 'tenant-a', TIMESTAMP '2026-09-12 08:00:00', TIMESTAMP '2026-09-12 09:00:00', 'Manutenção');

INSERT INTO "AppointmentHold" ("id", "tenantId", "startAt", "endAt", "proposedServiceIds", "proposedDurationMinutes", "source", "expiresAt", "createdAt", "updatedAt") VALUES
  ('hold-a-1', 'tenant-a', now()::timestamp + interval '1 day', now()::timestamp + interval '1 day 30 minutes',
   '["svc-a-corte"]'::jsonb, 30, 'AI', now() + interval '5 minutes', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC');
`;

/**
 * Inventario M0 — antes da migration. So conta o que o esquema do fim do
 * Goal008 tem: consultar aqui uma coluna que a migration ainda vai criar
 * quebraria o ensaio antes de ele provar coisa alguma.
 */
async function legacyInventory(client) {
  // Uma consulta de cada vez: uma unica conexao `pg` nao executa queries em
  // paralelo, e Promise.all sobre ela so gera aviso de depreciacao.
  const settings = await client.query(
    `SELECT COUNT(*)::int AS total FROM "CalendarSettings"`,
  );
  const appointments = await client.query(
    `SELECT COUNT(*)::int AS total FROM "Appointment" WHERE "id" NOT LIKE 'probe-%'`,
  );
  const blocks = await client.query(
    `SELECT COUNT(*)::int AS total FROM "TimeBlock" WHERE "id" NOT LIKE 'probe-%'`,
  );
  const holds = await client.query(
    `SELECT COUNT(*)::int AS total FROM "AppointmentHold" WHERE "id" NOT LIKE 'probe-%'`,
  );
  const items = await client.query(
    `SELECT COUNT(*)::int AS total FROM "AppointmentItem" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return {
    settings: settings.rows[0],
    appointments: appointments.rows[0],
    blocks: blocks.rows[0],
    holds: holds.rows[0],
    items: items.rows[0].total,
  };
}

/** Inventario M1 — depois da migration: contagens **e** defaults aplicados. */
async function inventory(client) {
  const settings = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "minLeadMinutes" = 0 AND "maxLeadDays" = 90 AND "granularityMinutes" = 30)::int AS defaulted
    FROM "CalendarSettings"
  `);
  const appointments = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "bufferBeforeMinutesSnapshot" = 0 AND "bufferAfterMinutesSnapshot" = 0 AND "seriesId" IS NULL)::int AS defaulted
    FROM "Appointment" WHERE "id" NOT LIKE 'probe-%'
  `);
  const blocks = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "kind" = 'BLOCK' AND "title" IS NULL AND "seriesId" IS NULL)::int AS defaulted
    FROM "TimeBlock" WHERE "id" NOT LIKE 'probe-%'
  `);
  const holds = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "proposedBufferBeforeMinutes" = 0 AND "proposedBufferAfterMinutes" = 0)::int AS defaulted
    FROM "AppointmentHold" WHERE "id" NOT LIKE 'probe-%'
  `);
  const items = await client.query(
    `SELECT COUNT(*)::int AS total FROM "AppointmentItem" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return {
    settings: settings.rows[0],
    appointments: appointments.rows[0],
    blocks: blocks.rows[0],
    holds: holds.rows[0],
    items: items.rows[0].total,
  };
}

async function appointmentFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "customerId", "startAt"::text, "endAt"::text, "status"
    FROM "Appointment" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) =>
      `${row.tenantId}/${row.id}/${row.customerId}/${row.startAt}/${row.endAt}/${row.status}`,
  );
}

function assert(condition, message) {
  if (!condition) {
    console.error(`goal009:migration-rehearsal FAILED — ${message}`);
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

async function main() {
  const target = rehearsalTarget();
  console.log(`goal009:migration-rehearsal target: ${target.label}`);

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

    const before = await legacyInventory(client);
    const fingerprintBefore = await appointmentFingerprint(client);
    console.log(
      `M0 inventory — settings: ${before.settings.total}; appointments: ${before.appointments.total}; ` +
        `items: ${before.items}; blocks: ${before.blocks.total}; holds: ${before.holds.total}`,
    );
    assert(before.settings.total === 2, "the fixture must contain two CalendarSettings rows");
    assert(before.appointments.total === 1, "the fixture must contain one appointment");
    assert(before.holds.total === 1, "the fixture must contain one real hold");

    // Passo único — migration aditiva.
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    assert(applied === true, `migration must apply cleanly: ${applied}`);

    const after = await inventory(client);
    assert(
      after.settings.total === before.settings.total &&
        after.appointments.total === before.appointments.total &&
        after.items === before.items &&
        after.blocks.total === before.blocks.total &&
        after.holds.total === before.holds.total,
      "the migration must not add, remove or duplicate a single pre-existing row",
    );
    assert(
      JSON.stringify(await appointmentFingerprint(client)) === JSON.stringify(fingerprintBefore),
      "the migration must preserve every appointment's schedule, customer and status untouched",
    );

    // Defaults: exatamente o comportamento que o motor já praticava.
    assert(
      after.settings.defaulted === after.settings.total,
      "every existing CalendarSettings row must get the engine's previous behaviour as default offer rules",
    );
    assert(
      after.appointments.defaulted === after.appointments.total,
      "every existing appointment must get a zero buffer snapshot and no series — buffer had no operational effect before this Goal",
    );
    assert(
      after.blocks.defaulted === after.blocks.total,
      "every existing time block must become kind=BLOCK, with no title and no series",
    );
    assert(
      after.holds.defaulted === after.holds.total,
      "every existing hold must get a zero proposed buffer",
    );

    // Constraints novas: aceitam o conteudo existente...
    const existingSettingsStillValid = !(await rejects(
      client,
      `UPDATE "CalendarSettings" SET "timezone" = "timezone" WHERE "tenantId" = 'tenant-a'`,
    ));
    assert(existingSettingsStillValid, "existing CalendarSettings rows must satisfy the new offer-rules constraint");

    // ...e recusam os casos invalidos.
    const badGranularityRejected = await rejects(
      client,
      `UPDATE "CalendarSettings" SET "granularityMinutes" = 7 WHERE "tenantId" = 'tenant-a'`,
    );
    assert(badGranularityRejected, "granularity not a multiple of 5 must be rejected");
    const granularityOutOfRangeRejected = await rejects(
      client,
      `UPDATE "CalendarSettings" SET "granularityMinutes" = 125 WHERE "tenantId" = 'tenant-a'`,
    );
    assert(granularityOutOfRangeRejected, "granularity above 120 must be rejected");
    const minNotLessThanMaxRejected = await rejects(
      client,
      `UPDATE "CalendarSettings" SET "minLeadMinutes" = 200000, "maxLeadDays" = 1 WHERE "tenantId" = 'tenant-a'`,
    );
    assert(minNotLessThanMaxRejected, "minLeadMinutes must be rejected when it is not smaller than maxLeadDays in minutes");

    const negativeBufferSnapshotRejected = await rejects(
      client,
      `UPDATE "Appointment" SET "bufferBeforeMinutesSnapshot" = -1 WHERE "id" = 'apt-a-1'`,
    );
    assert(negativeBufferSnapshotRejected, "a negative buffer snapshot must be rejected");
    const negativeProposedBufferRejected = await rejects(
      client,
      `UPDATE "AppointmentHold" SET "proposedBufferBeforeMinutes" = -1 WHERE "id" = 'hold-a-1'`,
    );
    assert(negativeProposedBufferRejected, "a negative proposed buffer must be rejected");

    // Serie de bloqueio: nunca infinita, nunca com os dois terminos.
    const seriesWithoutTerminationRejected = await rejects(
      client,
      `INSERT INTO "BlockSeries" ("id", "tenantId", "daysOfWeek", "startTime", "endTime", "seriesStartDate", "createdBy")
       VALUES ('probe-series-none', 'tenant-a', ARRAY[1], TIME '12:00', TIME '13:00', DATE '2026-09-14', 'user-a')`,
    );
    assert(seriesWithoutTerminationRejected, "a block series without an end date or occurrence count must be rejected");
    const seriesWithBothTerminationsRejected = await rejects(
      client,
      `INSERT INTO "BlockSeries" ("id", "tenantId", "daysOfWeek", "startTime", "endTime", "seriesStartDate", "seriesEndDate", "occurrenceCount", "createdBy")
       VALUES ('probe-series-both', 'tenant-a', ARRAY[1], TIME '12:00', TIME '13:00', DATE '2026-09-14', DATE '2026-10-14', 5, 'user-a')`,
    );
    assert(seriesWithBothTerminationsRejected, "a block series with both an end date and an occurrence count must be rejected");
    const seriesByCountAccepted = !(await rejects(
      client,
      `INSERT INTO "BlockSeries" ("id", "tenantId", "daysOfWeek", "startTime", "endTime", "seriesStartDate", "occurrenceCount", "createdBy")
       VALUES ('probe-series-count', 'tenant-a', ARRAY[1], TIME '12:00', TIME '13:00', DATE '2026-09-14', 5, 'user-a')`,
    ));
    assert(seriesByCountAccepted, "a finite block series by occurrence count must be accepted");
    await client.query(`DELETE FROM "BlockSeries" WHERE "id" LIKE 'probe-%'`);

    // Serie de atendimento: intervalo e contagem sempre positivos.
    const seriesIntervalRejected = await rejects(
      client,
      `INSERT INTO "AppointmentSeries" ("id", "tenantId", "serviceIds", "intervalDays", "occurrenceCount", "createdBy")
       VALUES ('probe-appt-series-bad', 'tenant-a', '["svc-a-corte"]'::jsonb, 0, 3, 'user-a')`,
    );
    assert(seriesIntervalRejected, "an appointment series with a non-positive interval must be rejected");
    const seriesIntervalAccepted = !(await rejects(
      client,
      `INSERT INTO "AppointmentSeries" ("id", "tenantId", "serviceIds", "intervalDays", "occurrenceCount", "createdBy")
       VALUES ('probe-appt-series-ok', 'tenant-a', '["svc-a-corte"]'::jsonb, 7, 3, 'user-a')`,
    ));
    assert(seriesIntervalAccepted, "a valid appointment series must be accepted");
    await client.query(`DELETE FROM "AppointmentSeries" WHERE "id" LIKE 'probe-%'`);

    // Retomada: reaplicar nao muda nada nem lanca erro.
    const retried = await applyMigrationFile(client, MIGRATION_SQL);
    assert(retried === true, `migration must be resumable: ${retried}`);
    const afterRetry = await inventory(client);
    assert(
      JSON.stringify(afterRetry) === JSON.stringify(after),
      "reapplying the migration must not change a single count",
    );

    if (process.exitCode) {
      console.error("goal009:migration-rehearsal FAILED — see the assertions above.");
    } else {
      console.log(
        "goal009:migration-rehearsal PASSED — every existing row preserved with safe defaults, the new offer-rules/buffer/series " +
          "constraints held for both existing and probe data, and the migration proved resumable without changing state.",
      );
    }
  } finally {
    await client.end();
  }
}

await main();
