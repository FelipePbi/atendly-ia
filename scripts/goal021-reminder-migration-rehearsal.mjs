#!/usr/bin/env node

// Ensaio da migration do Goal021 (WU-001) no Scheduling: configuracao de
// lembrete por negocio (`ReminderSettings`, `ReminderRule`), versao monotonica
// do compromisso (`Appointment.notifiableVersion`) e intencao de envio duravel
// ao cliente (`AppointmentNotificationIntent`).
//
// Banco descartavel proprio, derivado de BFF_TEST_DATABASE_URL. Nenhum banco
// de app e tocado.
//
// Reconstroi o schema do Scheduling como ele esta ao fim do Goal020, reduzido
// ao que esta migration toca ou de que depende por FK (`Customer`,
// `Appointment`, `AppointmentEvent`), semeia estoque legado — dois negocios,
// com atendimento futuro, passado e cancelado — aplica a migration real e
// reconcilia.
//
// O que o ensaio prova, em banco de verdade e nao em dublê:
//   1. a migration e estritamente ADITIVA: nenhuma coluna preexistente de
//      `Appointment` muda de tipo, de nulabilidade ou de default, e nenhuma
//      linha de `Customer`, `Appointment` ou `AppointmentEvent` muda de valor;
//   2. NAO HA BACKFILL DE COMPORTAMENTO: as tres tabelas novas nascem vazias e
//      nenhum compromisso existente ganha lembrete retroativo. Todo
//      atendimento legado nasce em `notifiableVersion = 1` — "nunca mudou";
//   3. o TERCEIRO LEMBRETE e impossivel por qualquer caminho: a posicao so
//      admite `FIRST`/`SECOND` (CHECK) e a chave primaria composta impede a
//      segunda linha da mesma posicao. Tentar gravar `CHANGE_NOTICE` como
//      regra configurada e recusado pelo banco;
//   4. antecedencia zero, negativa ou acima do teto declarado e recusada pelo
//      BANCO, nao so pela rota;
//   5. "desligou os lembretes" (linha de configuracao com ZERO regras) continua
//      distinguivel de "nunca configurou" (sem linha nenhuma);
//   6. o DEDUPE e real: a segunda intencao com mesmo compromisso, especie,
//      posicao e versao e recusada por INSERCAO, nao por leitura — inclusive
//      para o aviso de alteracao, que e o caso em que uma posicao NULA teria
//      deixado o indice decorativo;
//   7. estado e motivo sao vocabulario FECHADO: valor fora do enum e recusado,
//      motivo e obrigatorio em `FAILED`/`DISMISSED`/`CANCELLED` e proibido em
//      `PENDING`/`CLAIMED`/`SENT`;
//   8. a cascata deliberada da intencao nao quebra o caminho de remocao
//      definitiva do atendimento (Goal019) e nao afrouxa o `RESTRICT` do
//      historico operacional;
//   9. a migration e RETOMAVEL: reaplicada sobre o estado ja migrado, nao muda
//      nenhuma linha nem lanca erro.
//
// Deixa o banco no estado pos-migration. Nenhuma credencial aparece na saida:
// so contagens e rotulos, e toda fixture e sintetica. Sondas (`probe-%`) nunca
// entram nas contagens de fixture.

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
  "scheduling-service",
  "prisma",
  "migrations",
  "20260915120000_goal021_reminder_schedule",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal021:reminder-migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal021`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema do Scheduling como esta ao fim do Goal020, reduzido as tabelas que a
// migration deste Goal toca (`Appointment`) ou de que depende por FK
// (`Customer`), mais o historico operacional (`AppointmentEvent`), que entra
// porque o ensaio precisa provar que o `RESTRICT` dele continua valendo depois
// da cascata nova.
//
// `AppointmentItem`, `Service`, `AppointmentHold` e o resto do dominio ficam
// de fora de proposito: esta migration nao os toca nem depende deles, e
// reconstruir o schema inteiro so acrescentaria ruido ao que se quer provar.
const LEGACY_SCHEMA = `
CREATE TYPE "AppointmentSource" AS ENUM ('AI', 'USER', 'INTEGRATION');
CREATE TYPE "AppointmentCompletionOrigin" AS ENUM ('MANUAL', 'AUTO');
CREATE TYPE "AppointmentEventType" AS ENUM (
  'CREATED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'PRESENCE_CONFIRMED'
);
CREATE TYPE "AppointmentEventSource" AS ENUM ('AI', 'USER', 'SYSTEM');

CREATE TABLE "Customer" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT,
  "phone" TEXT,
  "normalizedPhone" TEXT,
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
  "statusRaw" TEXT,
  "title" TEXT,
  "createdBy" TEXT NOT NULL,
  "comments" TEXT,
  "completedAt" TIMESTAMP(3),
  "completedBy" TEXT,
  "completionOrigin" "AppointmentCompletionOrigin",
  "noShowAt" TIMESTAMP(3),
  "noShowNote" TEXT,
  "presenceConfirmedAt" TIMESTAMP(3),
  "finalValue" DECIMAL(12,2),
  "finalValueSetAt" TIMESTAMP(3),
  "finalValueSetBy" TEXT,
  "bufferBeforeMinutesSnapshot" INTEGER NOT NULL DEFAULT 0,
  "bufferAfterMinutesSnapshot" INTEGER NOT NULL DEFAULT 0,
  "seriesId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Appointment_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "Appointment_status_check"
    CHECK ("status" IN ('CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  CONSTRAINT "Appointment_customer_fkey"
    FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id")
    ON DELETE RESTRICT
);

CREATE TABLE "AppointmentEvent" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "type" "AppointmentEventType" NOT NULL,
  "source" "AppointmentEventSource" NOT NULL,
  "actor" TEXT,
  "reason" TEXT,
  "before" JSONB,
  "after" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sequence" BIGSERIAL NOT NULL,
  CONSTRAINT "AppointmentEvent_appointment_fkey"
    FOREIGN KEY ("tenantId", "appointmentId") REFERENCES "Appointment"("tenantId", "id")
    ON DELETE RESTRICT
);
`;

// Estoque legado: dois negocios, para que o isolamento por tenant seja
// observavel, com atendimento futuro confirmado, passado concluido e
// cancelado. Nenhum deles pode ganhar lembrete por efeito da migration.
const FIXTURE = `
INSERT INTO "Customer" ("id", "tenantId", "name", "phone", "normalizedPhone") VALUES
  ('customer-com-telefone', 'tenant-um',   'Ana',  '(51) 99999-0001', '5551999990001'),
  ('customer-sem-telefone', 'tenant-um',   'Bia',  NULL,              NULL),
  ('customer-outro-tenant', 'tenant-dois', 'Cida', '(51) 99999-0002', '5551999990002');

INSERT INTO "Appointment"
  ("id", "tenantId", "customerId", "source", "startAt", "endAt", "status", "statusRaw", "createdBy", "comments")
VALUES
  ('appointment-futuro',    'tenant-um',   'customer-com-telefone', 'USER', CURRENT_TIMESTAMP + interval '2 days', CURRENT_TIMESTAMP + interval '2 days 1 hour', 'CONFIRMED', 'SCHEDULED', 'user-um',   'observacao interna'),
  ('appointment-passado',   'tenant-um',   'customer-sem-telefone', 'AI',   CURRENT_TIMESTAMP - interval '9 days', CURRENT_TIMESTAMP - interval '9 days' + interval '1 hour', 'COMPLETED', 'SCHEDULED', 'user-um',   NULL),
  ('appointment-cancelado', 'tenant-um',   'customer-com-telefone', 'USER', CURRENT_TIMESTAMP + interval '5 days', CURRENT_TIMESTAMP + interval '5 days 1 hour', 'CANCELLED', 'CANCELLED', 'user-um',   NULL),
  ('appointment-tenant-dois','tenant-dois','customer-outro-tenant', 'USER', CURRENT_TIMESTAMP + interval '3 days', CURRENT_TIMESTAMP + interval '3 days 1 hour', 'CONFIRMED', 'SCHEDULED', 'user-dois', NULL);

INSERT INTO "AppointmentEvent" ("id", "tenantId", "appointmentId", "type", "source", "actor")
VALUES
  ('event-criado', 'tenant-um', 'appointment-futuro', 'CREATED', 'USER', 'user-um');
`;

function assert(condition, message) {
  if (!condition) {
    console.error(`goal021:reminder-migration-rehearsal FAILED — ${message}`);
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

// Forma das colunas preexistentes de `Appointment`, sem a coluna nova: e isto
// que nao pode mudar. Tipo, nulabilidade e default entram na comparacao.
async function appointmentColumnShape(client) {
  const result = await client.query(`
    SELECT "column_name", "data_type", "is_nullable", COALESCE("column_default", '-') AS "column_default",
           COALESCE("numeric_precision"::text, '-') AS "numeric_precision",
           COALESCE("datetime_precision"::text, '-') AS "datetime_precision"
    FROM information_schema.columns
    WHERE "table_name" = 'Appointment' AND "column_name" <> 'notifiableVersion'
    ORDER BY "column_name"
  `);
  return result.rows.map(
    (row) =>
      `${row.column_name}/${row.data_type}/${row.is_nullable}/${row.column_default}/${row.numeric_precision}/${row.datetime_precision}`,
  );
}

async function appointmentRows(client) {
  const result = await client.query(`
    SELECT "id", "tenantId", "customerId", "source"::text AS source, "status", "statusRaw",
           "startAt"::text AS "startAt", "endAt"::text AS "endAt", "createdBy",
           COALESCE("comments", '-') AS comments,
           "bufferBeforeMinutesSnapshot", "bufferAfterMinutesSnapshot",
           "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
    FROM "Appointment" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return result.rows.map((row) => Object.values(row).join("/"));
}

async function customerRows(client) {
  const result = await client.query(`
    SELECT "id", "tenantId", COALESCE("name", '-') AS name, COALESCE("phone", '-') AS phone,
           COALESCE("normalizedPhone", '-') AS "normalizedPhone", "createdAt"::text AS "createdAt"
    FROM "Customer" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return result.rows.map((row) => Object.values(row).join("/"));
}

async function countOf(client, table) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "${table}"`,
  );
  return result.rows[0].total;
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

async function expectAccepted(client, sql, message) {
  await client.query("SAVEPOINT probe");
  try {
    await client.query(sql);
    await client.query("RELEASE SAVEPOINT probe");
    return true;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT probe");
    assert(false, `${message}: ${error.message}`);
    return false;
  }
}

// Insercao crua, sem passar pela aplicacao: o que se prova aqui e o BANCO, nao
// o TypeScript. `updatedAt` tem default na migration, entao nao vai explicito.
function insertIntentSql(id, options) {
  const {
    tenantId = "tenant-um",
    appointmentId = "appointment-futuro",
    kind = "REMINDER",
    slot = "'FIRST'",
    version = 1,
    state = "PENDING",
    reason = "NULL",
    extra = "",
  } = options ?? {};
  return `
    INSERT INTO "AppointmentNotificationIntent"
      ("id", "tenantId", "appointmentId", "kind", "slot", "appointmentVersion", "state", "reason", "dueAt"${extra ? `, ${extra.columns}` : ""})
    VALUES
      ('${id}', '${tenantId}', '${appointmentId}', '${kind}', ${slot}, ${version}, '${state}', ${reason}, now()${extra ? `, ${extra.values}` : ""})
  `;
}

async function rehearse(target) {
  console.log(`goal021:reminder-migration-rehearsal target: ${target.label}`);
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(LEGACY_SCHEMA);
    await client.query(FIXTURE);

    assert(
      (await countOf(client, "Appointment")) === 4,
      "the fixture must contain four legacy appointments",
    );
    const shapeBefore = await appointmentColumnShape(client);
    const appointmentsBefore = await appointmentRows(client);
    const customersBefore = await customerRows(client);
    const eventsBefore = await countOf(client, "AppointmentEvent");

    // ---- Aditividade: aplica a migration real, a mesma que roda em producao.
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    assert(applied === true, `the migration must apply cleanly: ${applied}`);

    assert(
      JSON.stringify(await appointmentColumnShape(client)) ===
        JSON.stringify(shapeBefore),
      "no pre-existing Appointment column may change type, nullability or default",
    );
    assert(
      JSON.stringify(await appointmentRows(client)) ===
        JSON.stringify(appointmentsBefore),
      "the migration must not change a single pre-existing Appointment row",
    );
    assert(
      JSON.stringify(await customerRows(client)) ===
        JSON.stringify(customersBefore),
      "the migration must not touch Customer at all",
    );
    assert(
      (await countOf(client, "AppointmentEvent")) === eventsBefore,
      "the migration must not add or remove operational history",
    );

    for (const table of [
      "ReminderSettings",
      "ReminderRule",
      "AppointmentNotificationIntent",
    ]) {
      const present = await client.query(
        `SELECT to_regclass('"${table}"') AS present`,
      );
      assert(
        present.rows[0].present !== null,
        `the migration must create the ${table} table`,
      );
    }

    // ---- Sem backfill de comportamento.
    for (const table of [
      "ReminderSettings",
      "ReminderRule",
      "AppointmentNotificationIntent",
    ]) {
      assert(
        (await countOf(client, table)) === 0,
        `${table} must start empty — no existing appointment gains a retroactive reminder`,
      );
    }
    const versions = await client.query(
      `SELECT DISTINCT "notifiableVersion" AS version FROM "Appointment" ORDER BY 1`,
    );
    assert(
      versions.rows.length === 1 && versions.rows[0].version === 1,
      `every pre-existing appointment must start at version 1, found ${JSON.stringify(versions.rows)}`,
    );

    // ---- Sondas: tudo daqui para baixo roda dentro de uma transacao que e
    //      desfeita no fim, para o banco ficar exatamente no estado
    //      pos-migration.
    await client.query("BEGIN");

    // 1. Ate dois lembretes, garantido pelo esquema.
    await client.query(
      `INSERT INTO "ReminderSettings" ("tenantId") VALUES ('tenant-um')`,
    );
    await expectAccepted(
      client,
      `INSERT INTO "ReminderRule" ("tenantId", "slot", "leadMinutes") VALUES ('tenant-um', 'FIRST', 1440)`,
      "the first reminder must be accepted",
    );
    await expectAccepted(
      client,
      `INSERT INTO "ReminderRule" ("tenantId", "slot", "leadMinutes") VALUES ('tenant-um', 'SECOND', 120)`,
      "the second reminder must be accepted",
    );
    const thirdSlot = await expectRejected(
      client,
      `INSERT INTO "ReminderRule" ("tenantId", "slot", "leadMinutes") VALUES ('tenant-um', 'CHANGE_NOTICE', 60)`,
      "a third reminder position must be impossible — CHANGE_NOTICE is not a configurable reminder",
    );
    assert(
      thirdSlot?.code === "23514",
      `the third position must fail on ReminderRule_slot_check, got ${thirdSlot?.code}`,
    );
    const duplicateSlot = await expectRejected(
      client,
      `INSERT INTO "ReminderRule" ("tenantId", "slot", "leadMinutes") VALUES ('tenant-um', 'FIRST', 60)`,
      "a second rule for the same position must be rejected by the composite primary key",
    );
    assert(
      duplicateSlot?.code === "23505",
      `a duplicated position must fail with a unique violation, got ${duplicateSlot?.code}`,
    );

    // 2. Antecedencia positiva e com teto, recusada pelo banco.
    await client.query(
      `INSERT INTO "ReminderSettings" ("tenantId") VALUES ('tenant-dois')`,
    );
    for (const [leadMinutes, label] of [
      ["0", "zero"],
      ["-60", "negative"],
      ["43201", "above the declared ceiling of thirty days"],
    ]) {
      const rejected = await expectRejected(
        client,
        `INSERT INTO "ReminderRule" ("tenantId", "slot", "leadMinutes") VALUES ('tenant-dois', 'FIRST', ${leadMinutes})`,
        `a ${label} lead must be rejected by the database, not only by the route`,
      );
      assert(
        rejected?.code === "23514",
        `a ${label} lead must fail on ReminderRule_leadMinutes_check, got ${rejected?.code}`,
      );
    }
    await expectAccepted(
      client,
      `INSERT INTO "ReminderRule" ("tenantId", "slot", "leadMinutes") VALUES ('tenant-dois', 'FIRST', 43200)`,
      "the declared ceiling itself must be accepted",
    );

    // 3. "Desligou" e "nunca configurou" sao estados distintos e observaveis.
    await client.query(
      `INSERT INTO "ReminderSettings" ("tenantId") VALUES ('tenant-desligado')`,
    );
    const configured = await client.query(`
      SELECT s."tenantId", COUNT(r."slot")::int AS rules
      FROM "ReminderSettings" s LEFT JOIN "ReminderRule" r ON r."tenantId" = s."tenantId"
      GROUP BY s."tenantId" ORDER BY s."tenantId"
    `);
    const byTenant = Object.fromEntries(
      configured.rows.map((row) => [row.tenantId, row.rules]),
    );
    // Os tres estados sao distinguiveis por uma unica leitura: configurou
    // (linha com regras), desligou (linha com zero regras) e nunca configurou
    // (nenhuma linha). O default do produto so vale para o terceiro.
    assert(
      byTenant["tenant-um"] === 2,
      `a business with two reminders must read as two rules, got ${byTenant["tenant-um"]}`,
    );
    assert(
      byTenant["tenant-desligado"] === 0,
      "a business that turned reminders off must keep its settings row with zero rules",
    );
    const neverConfigured = await client.query(
      `SELECT COUNT(*)::int AS total FROM "ReminderSettings" WHERE "tenantId" = 'tenant-nunca-configurou'`,
    );
    assert(
      neverConfigured.rows[0].total === 0 &&
        byTenant["tenant-nunca-configurou"] === undefined,
      "a business that never configured must have no settings row at all — that is what makes the 24h default an absence, not a stored choice",
    );

    // Apagar a configuracao leva as regras junto — desconfigurar volta a ser
    // "nunca configurou", nao "meia configuracao orfa".
    await client.query(
      `DELETE FROM "ReminderSettings" WHERE "tenantId" = 'tenant-dois'`,
    );
    const orphanRules = await client.query(
      `SELECT COUNT(*)::int AS total FROM "ReminderRule" WHERE "tenantId" = 'tenant-dois'`,
    );
    assert(
      orphanRules.rows[0].total === 0,
      "deleting the settings row must take its rules with it — no orphan rule survives",
    );

    // 4. Dedupe por compromisso, especie, posicao e versao, provado por
    //    INSERCAO duplicada.
    await expectAccepted(
      client,
      insertIntentSql("probe-intent-v1-first"),
      "the first reminder intent must be accepted",
    );
    const duplicateIntent = await expectRejected(
      client,
      insertIntentSql("probe-intent-v1-first-again"),
      "a duplicated intent for the same appointment/kind/slot/version must be rejected",
    );
    assert(
      duplicateIntent?.code === "23505",
      `the duplicated intent must fail with a unique violation, got ${duplicateIntent?.code}`,
    );
    await expectAccepted(
      client,
      insertIntentSql("probe-intent-v1-second", { slot: "'SECOND'" }),
      "the second reminder position of the same version must be accepted",
    );
    await expectAccepted(
      client,
      insertIntentSql("probe-intent-v2-first", { version: 2 }),
      "the same position on a new appointment version must be accepted",
    );

    // 5. O aviso de alteracao tem posicao PROPRIA E NAO NULA — e e isso que
    //    faz o indice deduplicar de verdade para ele.
    const nullSlot = await expectRejected(
      client,
      insertIntentSql("probe-intent-null-slot", {
        kind: "CHANGE_NOTICE",
        slot: "NULL",
      }),
      "an intent with a NULL position must be impossible — NULL does not deduplicate in PostgreSQL",
    );
    assert(
      nullSlot?.code === "23502",
      `a NULL position must fail with a not-null violation, got ${nullSlot?.code}`,
    );
    await expectAccepted(
      client,
      insertIntentSql("probe-notice-v1", {
        kind: "CHANGE_NOTICE",
        slot: "'CHANGE_NOTICE'",
      }),
      "the change notice must be accepted on its own position",
    );
    const duplicateNotice = await expectRejected(
      client,
      insertIntentSql("probe-notice-v1-again", {
        kind: "CHANGE_NOTICE",
        slot: "'CHANGE_NOTICE'",
      }),
      "a duplicated change notice for the same version must be rejected — this is the case a NULL position would have let through",
    );
    assert(
      duplicateNotice?.code === "23505",
      `the duplicated change notice must fail with a unique violation, got ${duplicateNotice?.code}`,
    );

    // Especie e posicao andam amarradas.
    for (const [kind, slot] of [
      ["REMINDER", "'CHANGE_NOTICE'"],
      ["CHANGE_NOTICE", "'FIRST'"],
    ]) {
      const mismatched = await expectRejected(
        client,
        insertIntentSql(`probe-intent-mismatch-${kind}`, { kind, slot }),
        `${kind} must not be allowed on position ${slot}`,
      );
      assert(
        mismatched?.code === "23514",
        `a kind/slot mismatch must fail on the check constraint, got ${mismatched?.code}`,
      );
    }

    // 6. Estado e motivo sao vocabulario fechado, nao texto livre.
    const unknownState = await expectRejected(
      client,
      insertIntentSql("probe-intent-unknown-state", {
        version: 9,
        state: "ENVIADO_TALVEZ",
      }),
      "an unknown state must be rejected by the database",
    );
    assert(
      unknownState?.code === "22P02",
      `an unknown state must fail as an invalid enum input, got ${unknownState?.code}`,
    );
    const freeTextReason = await expectRejected(
      client,
      insertIntentSql("probe-intent-free-reason", {
        version: 9,
        state: "DISMISSED",
        reason: "'o cliente nao quis'",
        extra: { columns: '"settledAt"', values: "now()" },
      }),
      "a free-text reason must be rejected — the vocabulary is closed",
    );
    assert(
      freeTextReason?.code === "22P02",
      `a free-text reason must fail as an invalid enum input, got ${freeTextReason?.code}`,
    );

    // 7. Motivo obrigatorio em tudo que nao saiu; proibido no que saiu e no
    //    que ainda nao foi decidido.
    const dismissedWithoutReason = await expectRejected(
      client,
      insertIntentSql("probe-intent-dismissed-no-reason", {
        version: 10,
        state: "DISMISSED",
        extra: { columns: '"settledAt"', values: "now()" },
      }),
      "a dismissed intent without a reason must be rejected",
    );
    assert(
      dismissedWithoutReason?.code === "23514",
      `a dismissal without reason must fail on the reason check, got ${dismissedWithoutReason?.code}`,
    );
    const pendingWithReason = await expectRejected(
      client,
      insertIntentSql("probe-intent-pending-with-reason", {
        version: 11,
        reason: "'CUSTOMER_WITHOUT_PHONE'",
      }),
      "a pending intent must not carry a reason — nothing was decided yet",
    );
    assert(
      pendingWithReason?.code === "23514",
      `a pending intent with reason must fail on the reason check, got ${pendingWithReason?.code}`,
    );
    await expectAccepted(
      client,
      insertIntentSql("probe-intent-dismissed", {
        version: 12,
        state: "DISMISSED",
        reason: "'LEAD_ALREADY_PASSED'",
        extra: { columns: '"settledAt"', values: "now()" },
      }),
      "a reminder whose lead had already passed must be representable as dismissed with a reason",
    );

    // 8. Ciclo de vida coerente: reivindicado exige lease, enviado exige
    //    instante de envio, terminal exige liquidacao.
    const claimedWithoutLease = await expectRejected(
      client,
      insertIntentSql("probe-intent-claimed-no-lease", {
        version: 13,
        state: "CLAIMED",
      }),
      "a claimed intent without a lease must be rejected",
    );
    assert(
      claimedWithoutLease?.code === "23514",
      `a claim without lease must fail on the lifecycle check, got ${claimedWithoutLease?.code}`,
    );
    const sentWithoutInstant = await expectRejected(
      client,
      insertIntentSql("probe-intent-sent-no-instant", {
        version: 14,
        state: "SENT",
        extra: { columns: '"settledAt"', values: "now()" },
      }),
      "a sent intent without a send instant must be rejected",
    );
    assert(
      sentWithoutInstant?.code === "23514",
      `a send without instant must fail on the lifecycle check, got ${sentWithoutInstant?.code}`,
    );
    await expectAccepted(
      client,
      insertIntentSql("probe-intent-claimed", {
        version: 15,
        state: "CLAIMED",
        extra: {
          columns:
            '"leaseOwner", "leaseToken", "leaseAcquiredAt", "leaseExpiresAt"',
          values: `'worker-um', 'token-um', now(), now() + interval '2 minutes'`,
        },
      }),
      "a properly leased claim must be accepted",
    );

    // 9. Isolamento por tenant: a mesma identidade em outro negocio nao
    //    colide.
    await expectAccepted(
      client,
      insertIntentSql("probe-intent-outro-tenant", {
        tenantId: "tenant-dois",
        appointmentId: "appointment-tenant-dois",
      }),
      "the same reminder identity in another tenant must not collide",
    );

    // 10. A cascata da intencao nao quebra a remocao definitiva do
    //     atendimento (Goal019) e nao afrouxa o RESTRICT do historico.
    const restrictedByHistory = await expectRejected(
      client,
      `DELETE FROM "Appointment" WHERE "tenantId" = 'tenant-um' AND "id" = 'appointment-futuro'`,
      "operational history must keep blocking a bare appointment delete — RESTRICT is untouched",
    );
    // `23001` (restrict_violation) e o codigo que o PostgreSQL reserva para
    // `ON DELETE RESTRICT`; `NO ACTION` recusaria com `23503`. Exigir o codigo
    // exato, e nao apenas "recusou", e o que prova que a cascata nova nao
    // rebaixou o historico operacional de RESTRICT para NO ACTION.
    assert(
      restrictedByHistory?.code === "23001" &&
        restrictedByHistory?.constraint === "AppointmentEvent_appointment_fkey",
      `the bare delete must fail on the AppointmentEvent foreign key (restrict_violation), got ${restrictedByHistory?.code} on ${restrictedByHistory?.constraint}`,
    );
    await expectAccepted(
      client,
      `DELETE FROM "AppointmentEvent" WHERE "tenantId" = 'tenant-um' AND "appointmentId" = 'appointment-futuro';
       DELETE FROM "Appointment" WHERE "tenantId" = 'tenant-um' AND "id" = 'appointment-futuro'`,
      "the Goal019 removal path (history first, then the appointment) must keep working with intents attached",
    );
    const survivingIntents = await client.query(
      `SELECT COUNT(*)::int AS total FROM "AppointmentNotificationIntent" WHERE "appointmentId" = 'appointment-futuro'`,
    );
    assert(
      survivingIntents.rows[0].total === 0,
      "the intents of a removed appointment must go with it — they are operational work, not history",
    );

    await client.query("ROLLBACK");

    for (const table of [
      "ReminderSettings",
      "ReminderRule",
      "AppointmentNotificationIntent",
    ]) {
      assert(
        (await countOf(client, table)) === 0,
        `probing must leave no ${table} row behind`,
      );
    }
    assert(
      (await countOf(client, "Appointment")) === 4,
      "probing must leave the four legacy appointments untouched",
    );

    // ---- Retomada: reaplicar a migration nao muda nada nem lanca erro.
    const shapeBeforeRetry = await appointmentColumnShape(client);
    const rowsBeforeRetry = await appointmentRows(client);
    const retried = await applyMigrationFile(client, MIGRATION_SQL);
    assert(retried === true, `the migration must be resumable: ${retried}`);
    assert(
      JSON.stringify(await appointmentColumnShape(client)) ===
        JSON.stringify(shapeBeforeRetry),
      "reapplying the migration must not change the shape of Appointment",
    );
    assert(
      JSON.stringify(await appointmentRows(client)) ===
        JSON.stringify(rowsBeforeRetry),
      "reapplying the migration must not change a single Appointment row",
    );
    for (const table of [
      "ReminderSettings",
      "ReminderRule",
      "AppointmentNotificationIntent",
    ]) {
      assert(
        (await countOf(client, table)) === 0,
        `reapplying the migration must not fabricate a ${table} row either`,
      );
    }
  } finally {
    await client.end();
  }
}

export async function main() {
  const target = rehearsalTarget(process.env);

  await rehearse(target);

  if (process.exitCode) {
    console.error(
      "goal021:reminder-migration-rehearsal FAILED — see the assertions above.",
    );
  } else {
    console.log(
      "goal021:reminder-migration-rehearsal PASSED — the reminder configuration, the appointment version and the " +
        "notification intent are additive and backfill-free (no pre-existing appointment gains a reminder, and every " +
        "one starts at version 1), a third reminder is impossible by any path, an invalid lead is refused by the " +
        "database, turning reminders off stays distinguishable from never configuring, the unique index deduplicates " +
        "by appointment/kind/slot/version — including the change notice, which has its own NOT NULL position —, state " +
        "and reason are a closed vocabulary with a reason required in everything that did not go out, the appointment " +
        "removal path of Goal019 keeps working, and the migration is resumable without changing state.",
    );
  }
}

if (isMain(import.meta.url)) await main();
