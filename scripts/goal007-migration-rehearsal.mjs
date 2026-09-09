#!/usr/bin/env node

// Ensaio da migração de catálogo e acordo comercial do Goal007.
//
// Reconstrói o schema do Scheduling como ele era antes deste Goal — duração
// obrigatória, `priceType` só `FIXED`/`ON_REQUEST`, sem estado de revisão nem
// atributos do MVP —, semeia o estoque legado que importa (serviços dos dois
// tipos, incluindo preço zero explícito, agendamento com snapshots e um
// serviço marcado como importado via `ExternalEntityMap`), aplica as duas
// migrations reais do Goal007 **em passos separados** e reconcilia as
// contagens.
//
// O que o ensaio prova:
//   1. o passo de expansão não perde, funde nem reclassifica linha nenhuma:
//      todo serviço e todo snapshot existentes preservam tipo, preço e
//      duração exatamente como estavam;
//   2. depois da expansão, a constraint antiga de preço **ainda vale**: um
//      serviço com um dos dois tipos novos continua recusado até o passo de
//      constraints — a expansão não abre a porta sozinha;
//   3. a constraint nova de revisão (`Service_review_check`) já vale a partir
//      da expansão: duração ausente sem `needsReview` é recusada, e duração
//      ausente com `needsReview`/`reviewOrigin` corretos é aceita;
//   4. depois do passo de constraints, os quatro tipos de preço existem, com
//      a validação correta por tipo (preço exigido em FIXED/STARTING_AT,
//      proibido em ON_REQUEST/NOT_INFORMED), e um serviço sem duração entra
//      em revisão sem duração/preço fabricados;
//   5. preço zero explícito, gravado antes da migração, continua zero depois
//      dela — nunca vira ausência nem vice-versa.
//
// Deixa o banco no estado pós-migration para a suíte de integração do
// Scheduling rodar sobre o resultado do ensaio. Nenhuma credencial aparece na
// saída: só contagens e rótulos.

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

const EXPAND_SQL = migrationFile("20260908170000_goal007_catalog_expand");
const CONSTRAINTS_SQL = migrationFile(
  "20260908171000_goal007_catalog_constraints",
);

function refuse(message) {
  console.error(`goal007:migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal007`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema do Scheduling anterior ao Goal007, reduzido ao que as migrations
// tocam. Duração obrigatória; `priceType` só admite os dois valores antigos;
// as duas constraints SQL são as do `20260828175825_init`.
const LEGACY_SCHEMA = `
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'ON_REQUEST');
CREATE TYPE "AppointmentSource" AS ENUM ('AI', 'USER', 'INTEGRATION');
CREATE TYPE "IntegrationProvider" AS ENUM ('MINHA_AGENDA');
CREATE TYPE "ExternalEntityType" AS ENUM ('SERVICE', 'CUSTOMER', 'APPOINTMENT', 'AVAILABILITY');

CREATE TABLE "Service" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "priceType" "PriceType" NOT NULL,
  "price" DECIMAL(12,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Service_tenantId_id_key" UNIQUE ("tenantId", "id")
);
ALTER TABLE "Service" ADD CONSTRAINT "Service_durationMinutes_check"
CHECK ("durationMinutes" > 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_price_check"
CHECK (
    ("priceType" = 'FIXED' AND "price" IS NOT NULL AND "price" >= 0)
    OR ("priceType" = 'ON_REQUEST' AND "price" IS NULL)
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

CREATE TABLE "AppointmentItem" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "serviceNameSnapshot" TEXT NOT NULL,
  "durationMinutesSnapshot" INTEGER NOT NULL,
  "priceTypeSnapshot" "PriceType" NOT NULL,
  "priceSnapshot" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentItem_appointment_fkey" FOREIGN KEY ("tenantId", "appointmentId")
    REFERENCES "Appointment"("tenantId", "id") ON DELETE RESTRICT,
  CONSTRAINT "AppointmentItem_service_fkey" FOREIGN KEY ("tenantId", "serviceId")
    REFERENCES "Service"("tenantId", "id") ON DELETE RESTRICT
);
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_durationMinutesSnapshot_check"
CHECK ("durationMinutesSnapshot" > 0);
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_priceSnapshot_check"
CHECK (
    ("priceTypeSnapshot" = 'FIXED' AND "priceSnapshot" IS NOT NULL AND "priceSnapshot" >= 0)
    OR ("priceTypeSnapshot" = 'ON_REQUEST' AND "priceSnapshot" IS NULL)
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
 * Estoque legado sintético. Dois tenants; tenant-a tem os dois tipos de
 * preço, um preço zero explícito, um agendamento com snapshots e um serviço
 * marcado como importado. tenant-b só prova isolamento.
 */
const FIXTURE = `
INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active") VALUES
  ('svc-a-corte',    'tenant-a', 'Corte',            30, 'FIXED',      50.00, true),
  ('svc-a-consulta', 'tenant-a', 'Consulta',         45, 'ON_REQUEST', NULL,  true),
  ('svc-a-gratis',   'tenant-a', 'Avaliação',        15, 'FIXED',      0.00,  true),
  ('svc-a-importado','tenant-a', 'Serviço externo',  60, 'FIXED',      80.00, true),
  ('svc-b-corte',    'tenant-b', 'Corte',            30, 'FIXED',      50.00, true);

INSERT INTO "Customer" ("id", "tenantId", "name", "phone") VALUES
  ('cus-a-maria', 'tenant-a', 'Maria', '5511900000001');

INSERT INTO "Appointment" ("id", "tenantId", "customerId", "source", "startAt", "endAt", "status", "createdBy") VALUES
  ('apt-a-1', 'tenant-a', 'cus-a-maria', 'AI', TIMESTAMP '2026-09-10 13:00:00', TIMESTAMP '2026-09-10 13:30:00', 'SCHEDULED', 'user-a');

INSERT INTO "AppointmentItem" ("id", "tenantId", "appointmentId", "serviceId", "serviceNameSnapshot", "durationMinutesSnapshot", "priceTypeSnapshot", "priceSnapshot") VALUES
  ('item-a-1', 'tenant-a', 'apt-a-1', 'svc-a-corte', 'Corte', 30, 'FIXED', 50.00);

INSERT INTO "ExternalEntityMap" ("id", "tenantId", "provider", "entityType", "internalId", "externalId") VALUES
  ('map-a-1', 'tenant-a', 'MINHA_AGENDA', 'SERVICE', 'svc-a-importado', 'ext-importado');
`;

async function inventory(client) {
  const services = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "priceType" = 'FIXED')::int AS fixed,
           COUNT(*) FILTER (WHERE "priceType" = 'ON_REQUEST')::int AS on_request,
           COUNT(*) FILTER (WHERE "price" = 0)::int AS zero_price
    FROM "Service"
    WHERE "id" NOT LIKE 'probe-%'
  `);
  const items = await client.query(`
    SELECT COUNT(*)::int AS total FROM "AppointmentItem"
  `);
  const maps = await client.query(`
    SELECT COUNT(*)::int AS total FROM "ExternalEntityMap" WHERE "entityType" = 'SERVICE'
  `);
  return { services: services.rows[0], items: items.rows[0].total, serviceMaps: maps.rows[0].total };
}

async function serviceFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "priceType", COALESCE("price"::text, '<null>') AS price,
           COALESCE("durationMinutes"::text, '<null>') AS duration
    FROM "Service" ORDER BY "id"
  `);
  return rows.rows.map(
    (row) => `${row.tenantId}/${row.id}/${row.priceType}/${row.price}/${row.duration}`,
  );
}

function assert(condition, message) {
  if (!condition) {
    console.error(`goal007:migration-rehearsal FAILED — ${message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

// Sem transação explícita ao redor: cada `query()` é autocommit própria, e um
// `ALTER TYPE ... ADD VALUE` só fica visível a outras transações depois do
// commit da sua própria — por isso a migration de expansão e a de
// constraints precisam ser duas chamadas `query()` separadas (duas
// transações implícitas distintas), nunca uma só transação envolvendo as
// duas. Ver o cabeçalho das migrations.
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
  console.log(`goal007:migration-rehearsal target: ${target.label}`);

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
    const fingerprintBefore = await serviceFingerprint(client);
    console.log(
      `M0 inventory — services: ${before.services.total} ` +
        `(FIXED ${before.services.fixed}, ON_REQUEST ${before.services.on_request}, ` +
        `zero price ${before.services.zero_price}); items: ${before.items}; ` +
        `service maps: ${before.serviceMaps}`,
    );
    assert(before.services.zero_price === 1, "the fixture must contain an explicit zero price");

    // Passo 1 — expansão.
    await client.query(readFileSync(EXPAND_SQL, "utf8"));
    const afterExpand = await inventory(client);
    assert(
      afterExpand.services.total === before.services.total &&
        afterExpand.items === before.items &&
        afterExpand.serviceMaps === before.serviceMaps,
      `expand changed row counts: services ${before.services.total}->${afterExpand.services.total}, ` +
        `items ${before.items}->${afterExpand.items}`,
    );
    assert(
      JSON.stringify(await serviceFingerprint(client)) === JSON.stringify(fingerprintBefore),
      "expand must preserve every service id, type, price and duration — no reclassification",
    );
    assert(
      afterExpand.services.zero_price === 1,
      "an explicit zero price must survive the expansion unchanged",
    );

    // A constraint antiga de preço ainda vale: os tipos novos existem no
    // enum, mas a expansão não os libera sozinha.
    const starterStillRejected = await rejects(
      client,
      `INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active")
       VALUES ('probe-starter', 'tenant-a', 'Sonda', 30, 'STARTING_AT', 40.00, true)`,
    );
    assert(
      starterStillRejected,
      "after expand, the old price constraint must still reject the new price types — the constraints step is separate on purpose",
    );

    // A constraint nova de revisão já vale a partir da expansão.
    const reviewWithoutFlagRejected = await rejects(
      client,
      `INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active", "needsReview")
       VALUES ('probe-review-bad', 'tenant-a', 'Sem duração', NULL, 'ON_REQUEST', NULL, true, false)`,
    );
    assert(
      reviewWithoutFlagRejected,
      "a service without duration must be rejected unless needsReview is set (lockstep constraint)",
    );
    const reviewWithFlagAccepted = !(await rejects(
      client,
      `INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active", "needsReview", "reviewOrigin")
       VALUES ('probe-review-ok', 'tenant-a', 'Sem duração', NULL, 'ON_REQUEST', NULL, true, true, 'MANUAL')`,
    ));
    assert(
      reviewWithFlagAccepted,
      "a service without duration must be accepted once needsReview/reviewOrigin are set",
    );

    // Passo 2 — constraints que referenciam os tipos novos.
    await client.query(readFileSync(CONSTRAINTS_SQL, "utf8"));
    const afterConstraints = await inventory(client);
    assert(
      afterConstraints.services.total === before.services.total &&
        afterConstraints.items === before.items,
      "the constraints step must not touch a single pre-existing row",
    );
    assert(
      JSON.stringify(
        (await serviceFingerprint(client)).filter((row) => !row.includes("probe-")),
      ) === JSON.stringify(fingerprintBefore),
      "the constraints step must preserve every pre-existing service unchanged",
    );
    assert(
      afterConstraints.services.zero_price === 1,
      "the explicit zero price must still be zero after the constraints step",
    );

    // Depois do corte: os quatro tipos, validados corretamente por tipo.
    const startingAtAccepted = !(await rejects(
      client,
      `INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active")
       VALUES ('probe-starting-at', 'tenant-a', 'Coloração', 90, 'STARTING_AT', 120.00, true)`,
    ));
    const notInformedAccepted = !(await rejects(
      client,
      `INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active")
       VALUES ('probe-not-informed', 'tenant-a', 'Importado sem preço', 30, 'NOT_INFORMED', NULL, true)`,
    ));
    const startingAtWithoutPriceRejected = await rejects(
      client,
      `INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active")
       VALUES ('probe-starting-at-bad', 'tenant-a', 'Sem preço', 30, 'STARTING_AT', NULL, true)`,
    );
    const notInformedWithPriceRejected = await rejects(
      client,
      `INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active")
       VALUES ('probe-not-informed-bad', 'tenant-a', 'Com preço', 30, 'NOT_INFORMED', 10.00, true)`,
    );
    console.log(
      `after constraints — STARTING_AT accepted: ${startingAtAccepted}, ` +
        `NOT_INFORMED accepted: ${notInformedAccepted}, ` +
        `STARTING_AT without price rejected: ${startingAtWithoutPriceRejected}, ` +
        `NOT_INFORMED with price rejected: ${notInformedWithPriceRejected}`,
    );
    assert(startingAtAccepted, "STARTING_AT with a price must be accepted after the constraints step");
    assert(notInformedAccepted, "NOT_INFORMED without a price must be accepted after the constraints step");
    assert(startingAtWithoutPriceRejected, "STARTING_AT without a price must still be rejected");
    assert(notInformedWithPriceRejected, "NOT_INFORMED with a price must still be rejected");

    // Sondas de aceitação deixam linha para trás; sondas de recusa não
    // chegam a inserir nada. Limpa as duas categorias antes de deixar o
    // banco no estado pós-migration para a suíte de integração.
    await client.query(`DELETE FROM "Service" WHERE "id" LIKE 'probe-%'`);

    if (process.exitCode) {
      console.error("goal007:migration-rehearsal FAILED — see the assertions above.");
    } else {
      console.log(
        "goal007:migration-rehearsal PASSED — expansion preserved every service and snapshot, " +
          "the old price constraint held until the constraints step, the review lockstep held from " +
          "expansion onward, and all four price types validate correctly after the cut.",
      );
    }
  } finally {
    await client.end();
  }
}

await main();
