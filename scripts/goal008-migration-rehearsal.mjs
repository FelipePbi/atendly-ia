#!/usr/bin/env node

// Ensaio da migração de transações, holds e histórico da agenda do Goal008.
//
// Reconstrói o schema do Scheduling como ele era antes deste Goal (pós
// Goal007: `Appointment.status` livre em `SCHEDULED`/`CANCELLED`, sem hold,
// sem evento, sem colunas de conclusão/falta/presença/valor final/título,
// sem referência de efeito na idempotência), semeia o estoque legado que
// importa (atendimentos `SCHEDULED` e `CANCELLED` de dois tenants,
// idempotências `COMPLETED` e `PENDING`, um bloqueio), aplica as duas
// migrations reais do Goal008 **em passos separados** — cada uma dentro da
// sua própria transação explícita, do mesmo jeito que `prisma migrate
// deploy` aplica cada arquivo — e reconcilia as contagens.
//
// O que o ensaio prova:
//   1. o passo de expansão não perde, funde nem reclassifica linha nenhuma:
//      todo atendimento, item e idempotência existentes preservam horário,
//      cliente, status e resposta exatamente como estavam;
//   2. a guarda do passo de normalização aborta a transação inteira diante
//      de um status fora de `SCHEDULED`/`CANCELLED` — nenhuma linha muda,
//      nenhuma constraint nova é adicionada — provada em transação
//      revertida, não em banco separado;
//   3. depois da guarda passar, a normalização mapeia `SCHEDULED` ->
//      `CONFIRMED` preservando o bruto em `statusRaw` (inclusive para
//      `CANCELLED`, que não muda de valor em `status`);
//   4. as constraints novas (valor final não negativo, hold com `expiresAt`
//      posterior ao início da **vida do hold**, intervalo reservado não
//      vazio, título obrigatório sem item) aceitam todo o conteúdo
//      existente — inclusive um hold real, com o horário no futuro e TTL de
//      cinco minutos — e recusam os casos negativos, e a leitura
//      cronológica do histórico é desempatada por sequência quando dois
//      eventos compartilham `occurredAt`;
//   5. idempotências `COMPLETED` existentes continuam decodificáveis
//      (resposta e status preservados; referência de efeito nula);
//   6. os dois passos são retomáveis: reaplicados sobre o estado já
//      migrado, não mudam nenhuma linha nem lançam erro.
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

const EXPAND_SQL = migrationFile("20260909180000_goal008_agenda_expand");
const STATUS_SQL = migrationFile("20260909181000_goal008_appointment_status");
const FIXUP_SQL = migrationFile("20260909182000_goal008_agenda_fixups");

function refuse(message) {
  console.error(`goal008:migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal008`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema do Scheduling anterior ao Goal008 (estado pós-Goal007), reduzido ao
// que as migrations tocam ou de que dependem via FK: `Appointment.status` é
// texto livre gravado pelo código (`SCHEDULED`/`CANCELLED`), sem hold, sem
// evento, sem colunas novas; `CalendarMutationIdempotency` sem referência de
// efeito.
const LEGACY_SCHEMA = `
CREATE TYPE "AppointmentSource" AS ENUM ('AI', 'USER', 'INTEGRATION');
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'STARTING_AT', 'ON_REQUEST', 'NOT_INFORMED');

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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

CREATE TABLE "CalendarMutationIdempotency" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "response" JSONB,
  "lastErrorCode" TEXT,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarMutationIdempotency_tenantId_key_key" UNIQUE ("tenantId", "key")
);
`;

/**
 * Estoque legado sintético. Dois tenants; tenant-a tem um atendimento
 * confirmado (`SCHEDULED`) com item, um cancelado (`CANCELLED`) sem
 * comentário, um bloqueio, e duas idempotências (`COMPLETED` com resposta
 * decodificável e `PENDING`). tenant-b só prova isolamento.
 */
const FIXTURE = `
INSERT INTO "Customer" ("id", "tenantId", "name", "phone") VALUES
  ('cus-a-maria', 'tenant-a', 'Maria', '5511900000001'),
  ('cus-b-joao',  'tenant-b', 'João',  '5511900000002');

INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "active") VALUES
  ('svc-a-corte', 'tenant-a', 'Corte', 30, 'FIXED', 50.00, true),
  ('svc-b-corte', 'tenant-b', 'Corte', 30, 'FIXED', 50.00, true);

INSERT INTO "Appointment" ("id", "tenantId", "customerId", "source", "startAt", "endAt", "status", "createdBy", "comments") VALUES
  ('apt-a-scheduled', 'tenant-a', 'cus-a-maria', 'AI',   TIMESTAMP '2026-09-10 13:00:00', TIMESTAMP '2026-09-10 13:30:00', 'SCHEDULED', 'user-a', NULL),
  ('apt-a-cancelled', 'tenant-a', 'cus-a-maria', 'USER', TIMESTAMP '2026-09-11 09:00:00', TIMESTAMP '2026-09-11 09:30:00', 'CANCELLED', 'user-a', 'cliente desmarcou'),
  ('apt-b-scheduled', 'tenant-b', 'cus-b-joao',  'AI',   TIMESTAMP '2026-09-10 15:00:00', TIMESTAMP '2026-09-10 15:30:00', 'SCHEDULED', 'user-b', NULL);

INSERT INTO "AppointmentItem" ("id", "tenantId", "appointmentId", "serviceId", "serviceNameSnapshot", "durationMinutesSnapshot", "priceTypeSnapshot", "priceSnapshot") VALUES
  ('item-a-scheduled', 'tenant-a', 'apt-a-scheduled', 'svc-a-corte', 'Corte', 30, 'FIXED', 50.00),
  ('item-a-cancelled', 'tenant-a', 'apt-a-cancelled', 'svc-a-corte', 'Corte', 30, 'FIXED', 50.00),
  ('item-b-scheduled', 'tenant-b', 'apt-b-scheduled', 'svc-b-corte', 'Corte', 30, 'FIXED', 50.00);

INSERT INTO "TimeBlock" ("id", "tenantId", "startAt", "endAt", "reason") VALUES
  ('block-a-1', 'tenant-a', TIMESTAMP '2026-09-12 08:00:00', TIMESTAMP '2026-09-12 09:00:00', 'Manutenção');

INSERT INTO "CalendarMutationIdempotency" ("id", "tenantId", "key", "operation", "requestHash", "status", "response", "lockedAt") VALUES
  ('idem-a-completed', 'tenant-a', 'idem-key-completed', 'schedule', 'hash-completed', 'COMPLETED',
    '{"appointmentId": "apt-a-scheduled", "totalPriceType": "FIXED"}'::jsonb, TIMESTAMP '2026-09-09 10:00:00'),
  ('idem-a-pending',   'tenant-a', 'idem-key-pending',   'cancel',   'hash-pending',   'PENDING',
    NULL, TIMESTAMP '2026-09-09 10:00:00');
`;

async function inventory(client) {
  const appointments = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "status" = 'SCHEDULED')::int AS scheduled,
           COUNT(*) FILTER (WHERE "status" = 'CANCELLED')::int AS cancelled,
           COUNT(*) FILTER (WHERE "status" = 'CONFIRMED')::int AS confirmed
    FROM "Appointment"
    WHERE "id" NOT LIKE 'probe-%'
  `);
  const items = await client.query(`
    SELECT COUNT(*)::int AS total FROM "AppointmentItem" WHERE "id" NOT LIKE 'probe-%'
  `);
  const idempotencies = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "status" = 'COMPLETED')::int AS completed,
           COUNT(*) FILTER (WHERE "status" = 'PENDING')::int AS pending
    FROM "CalendarMutationIdempotency"
    WHERE "id" NOT LIKE 'probe-%'
  `);
  const timeBlocks = await client.query(`
    SELECT COUNT(*)::int AS total FROM "TimeBlock"
  `);
  return {
    appointments: appointments.rows[0],
    items: items.rows[0].total,
    idempotencies: idempotencies.rows[0],
    timeBlocks: timeBlocks.rows[0].total,
  };
}

async function appointmentFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "customerId", "startAt"::text, "endAt"::text,
           COALESCE("comments", '<null>') AS comments
    FROM "Appointment" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) =>
      `${row.tenantId}/${row.id}/${row.customerId}/${row.startAt}/${row.endAt}/${row.comments}`,
  );
}

function assert(condition, message) {
  if (!condition) {
    console.error(`goal008:migration-rehearsal FAILED — ${message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

// Aplica um arquivo de migration dentro da SUA PROPRIA transacao explicita —
// exatamente como `prisma migrate deploy` aplica cada arquivo — e devolve
// `true`/`false` sem lancar, fazendo ROLLBACK explicito em caso de erro.
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

// Testa uma unica instrucao fora de transacao explicita (autocommit): erro
// nao deixa a sessao em estado abortado porque nao havia transacao aberta.
async function rejects(client, sql) {
  try {
    await client.query(sql);
    return false;
  } catch {
    return true;
  }
}

// Testa uma instrucao que so falha no COMMIT (constraint trigger deferrable
// INITIALLY DEFERRED): precisa de uma transacao explicita para o efeito do
// adiamento aparecer.
async function rejectedAtCommit(client, sql) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    return false;
  } catch {
    await client.query("ROLLBACK");
    return true;
  }
}

async function main() {
  const target = rehearsalTarget();
  console.log(`goal008:migration-rehearsal target: ${target.label}`);

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
    const fingerprintBefore = await appointmentFingerprint(client);
    console.log(
      `M0 inventory — appointments: ${before.appointments.total} ` +
        `(SCHEDULED ${before.appointments.scheduled}, CANCELLED ${before.appointments.cancelled}); ` +
        `items: ${before.items}; idempotencies: ${before.idempotencies.total} ` +
        `(COMPLETED ${before.idempotencies.completed}, PENDING ${before.idempotencies.pending}); ` +
        `time blocks: ${before.timeBlocks}`,
    );
    assert(before.appointments.scheduled === 2, "the fixture must contain two SCHEDULED appointments");
    assert(before.appointments.cancelled === 1, "the fixture must contain one CANCELLED appointment");

    // Passo 1 — expansão. Nenhuma linha existente é tocada.
    const expandResult = await applyMigrationFile(client, EXPAND_SQL);
    assert(expandResult === true, `expand step must apply cleanly: ${expandResult}`);

    const afterExpand = await inventory(client);
    assert(
      afterExpand.appointments.total === before.appointments.total &&
        afterExpand.appointments.scheduled === before.appointments.scheduled &&
        afterExpand.appointments.cancelled === before.appointments.cancelled &&
        afterExpand.items === before.items &&
        afterExpand.idempotencies.total === before.idempotencies.total &&
        afterExpand.timeBlocks === before.timeBlocks,
      `expand changed row counts: appointments ${before.appointments.total}->${afterExpand.appointments.total}, ` +
        `items ${before.items}->${afterExpand.items}, idempotencies ${before.idempotencies.total}->${afterExpand.idempotencies.total}`,
    );
    assert(
      JSON.stringify(await appointmentFingerprint(client)) === JSON.stringify(fingerprintBefore),
      "expand must preserve every appointment id, customer, schedule and comment — no reclassification",
    );
    const statusRawNullCount = await client.query(
      `SELECT COUNT(*)::int AS total FROM "Appointment" WHERE "statusRaw" IS NOT NULL`,
    );
    assert(
      statusRawNullCount.rows[0].total === 0,
      "expand must not populate statusRaw — that is the normalization step's job",
    );

    // Constraints introduzidas na expansão já valem a partir daqui.
    const negativeFinalValueRejected = await rejects(
      client,
      `UPDATE "Appointment" SET "finalValue" = -10.00 WHERE "id" = 'apt-a-scheduled'`,
    );
    assert(negativeFinalValueRejected, "a negative finalValue must be rejected");
    const zeroFinalValueAccepted = !(await rejects(
      client,
      `UPDATE "Appointment" SET "finalValue" = 0 WHERE "id" = 'apt-a-scheduled'`,
    ));
    assert(zeroFinalValueAccepted, "a zero finalValue must be accepted");
    await client.query(`UPDATE "Appointment" SET "finalValue" = NULL WHERE "id" = 'apt-a-scheduled'`);

    // As constraints de hold sao provadas depois do passo de correcao
    // (20260909182000), que e quem lhes da a semantica correta.

    // Título obrigatório sem item: constraint trigger deferrable, só falha
    // no COMMIT — depois que os AppointmentItem da mesma transação (se
    // houver) já foram gravados.
    const itemlessWithoutTitleRejected = await rejectedAtCommit(
      client,
      `INSERT INTO "Appointment" ("id", "tenantId", "customerId", "source", "startAt", "endAt", "status", "createdBy")
       VALUES ('probe-manual-bad', 'tenant-a', 'cus-a-maria', 'USER', TIMESTAMP '2026-09-14 10:00:00', TIMESTAMP '2026-09-14 10:30:00', 'SCHEDULED', 'user-a')`,
    );
    assert(itemlessWithoutTitleRejected, "an appointment without items and without a title must be rejected at commit");
    const itemlessWithTitleAccepted = !(await rejectedAtCommit(
      client,
      `INSERT INTO "Appointment" ("id", "tenantId", "customerId", "source", "startAt", "endAt", "status", "createdBy", "title")
       VALUES ('probe-manual-ok', 'tenant-a', 'cus-a-maria', 'USER', TIMESTAMP '2026-09-14 11:00:00', TIMESTAMP '2026-09-14 11:30:00', 'SCHEDULED', 'user-a', 'Ajuste combinado por telefone')`,
    ));
    assert(itemlessWithTitleAccepted, "a manual appointment with a title and no items must be accepted");
    await client.query(`DELETE FROM "Appointment" WHERE "id" LIKE 'probe-%'`);

    // Passo 2 — guarda contra valor desconhecido, provada em transação
    // revertida: insere um status fora do par legado, tenta a normalização
    // inteira (guarda + updates + constraint) e confirma que nada muda.
    // "title" evita que a trigger de titulo obrigatorio (deferrable) rejeite
    // esta linha por conta propria: o que este bloco testa e a guarda de
    // status, nao a constraint de titulo.
    await client.query(`
      INSERT INTO "Appointment" ("id", "tenantId", "customerId", "source", "startAt", "endAt", "status", "createdBy", "title")
      VALUES ('apt-a-unknown', 'tenant-a', 'cus-a-maria', 'AI', TIMESTAMP '2026-09-15 10:00:00', TIMESTAMP '2026-09-15 10:30:00', 'PENDING_APPROVAL', 'user-a', 'Legado sem mapeamento')
    `);
    const guardResult = await applyMigrationFile(client, STATUS_SQL);
    assert(
      guardResult !== true && /outside SCHEDULED\/CANCELLED/u.test(String(guardResult)),
      `the normalization step must be refused (and rolled back) while an unknown status exists, got: ${guardResult}`,
    );
    const statusColumnStillText = await rejects(
      client,
      `ALTER TABLE "Appointment" ADD CONSTRAINT "probe_status_check" CHECK ("status" IN ('CONFIRMED'))`,
    );
    assert(
      statusColumnStillText,
      "the status constraint must not exist yet — the guard must have rolled back the whole normalization transaction",
    );
    await client.query(`DELETE FROM "Appointment" WHERE "id" = 'apt-a-unknown'`);

    // Passo 2, de novo — sem o valor desconhecido, a normalização aplica.
    const statusResult = await applyMigrationFile(client, STATUS_SQL);
    assert(statusResult === true, `normalization step must apply cleanly once the guard passes: ${statusResult}`);

    const afterStatus = await inventory(client);
    assert(
      afterStatus.appointments.total === before.appointments.total &&
        afterStatus.items === before.items &&
        afterStatus.idempotencies.total === before.idempotencies.total,
      "the normalization step must not touch a single pre-existing appointment, item or idempotency row",
    );
    assert(
      afterStatus.appointments.confirmed === before.appointments.scheduled,
      `every legacy SCHEDULED appointment must become CONFIRMED: expected ${before.appointments.scheduled}, got ${afterStatus.appointments.confirmed}`,
    );
    assert(
      afterStatus.appointments.cancelled === before.appointments.cancelled,
      "CANCELLED appointments must stay CANCELLED",
    );
    assert(
      afterStatus.appointments.scheduled === 0,
      "no appointment may keep the raw SCHEDULED value in status after normalization",
    );

    const rawMapping = await client.query(`
      SELECT "id", "statusRaw", "status" FROM "Appointment" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
    `);
    for (const row of rawMapping.rows) {
      const expectedRaw = row.id === "apt-a-cancelled" ? "CANCELLED" : "SCHEDULED";
      assert(
        row.statusRaw === expectedRaw,
        `statusRaw for ${row.id} must preserve the pre-normalization value: expected ${expectedRaw}, got ${row.statusRaw}`,
      );
      const expectedStatus = expectedRaw === "SCHEDULED" ? "CONFIRMED" : "CANCELLED";
      assert(
        row.status === expectedStatus,
        `status for ${row.id} must be normalized to ${expectedStatus}, got ${row.status}`,
      );
    }

    // A constraint de status agora vale.
    const unknownStatusRejected = await rejects(
      client,
      `UPDATE "Appointment" SET "status" = 'PENDING_APPROVAL' WHERE "id" = 'apt-a-scheduled'`,
    );
    assert(unknownStatusRejected, "after the cut, an unknown status must be rejected by Appointment_status_check");
    const noShowAccepted = !(await rejects(
      client,
      `UPDATE "Appointment" SET "status" = 'NO_SHOW' WHERE "id" = 'apt-a-scheduled'`,
    ));
    assert(noShowAccepted, "NO_SHOW must be accepted after the cut");
    await client.query(`UPDATE "Appointment" SET "status" = 'CONFIRMED' WHERE "id" = 'apt-a-scheduled'`);

    // Passo 3 — correção das invariantes de hold e da ordem do histórico.
    const fixupResult = await applyMigrationFile(client, FIXUP_SQL);
    assert(fixupResult === true, `fixup step must apply cleanly: ${fixupResult}`);

    // O caso que motivou a correção: um hold REAL — horário reservado
    // amanhã, expirando em cinco minutos — precisa ser aceito. A constraint
    // anterior (`expiresAt > startAt`) recusava exatamente isto, ou seja,
    // praticamente todo hold que o produto cria.
    const realHoldAccepted = !(await rejects(
      client,
      `INSERT INTO "AppointmentHold"
         ("id", "tenantId", "startAt", "endAt", "proposedServiceIds", "proposedDurationMinutes", "source", "expiresAt", "createdAt", "updatedAt")
       VALUES ('probe-hold-real', 'tenant-a', now()::timestamp + interval '1 day', now()::timestamp + interval '1 day 30 minutes',
               '["svc-a-corte"]'::jsonb, 30, 'AI', now() + interval '5 minutes', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')`,
    ));
    assert(realHoldAccepted, "a real hold (slot tomorrow, five-minute TTL) must be accepted");

    // A invariante que a constraint deve mesmo guardar: o hold não pode
    // nascer já vencido — `expiresAt` é posterior ao início da vida do hold.
    const expiredOnCreationRejected = await rejects(
      client,
      `INSERT INTO "AppointmentHold"
         ("id", "tenantId", "startAt", "endAt", "proposedServiceIds", "proposedDurationMinutes", "source", "expiresAt", "createdAt", "updatedAt")
       VALUES ('probe-hold-dead', 'tenant-a', now()::timestamp + interval '1 day', now()::timestamp + interval '1 day 30 minutes',
               '["svc-a-corte"]'::jsonb, 30, 'AI', now() - interval '1 minute', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')`,
    );
    assert(expiredOnCreationRejected, "a hold whose expiresAt is not after its own createdAt must be rejected");

    // Intervalo reservado vazio ou invertido continua recusado.
    const emptyIntervalRejected = await rejects(
      client,
      `INSERT INTO "AppointmentHold"
         ("id", "tenantId", "startAt", "endAt", "proposedServiceIds", "proposedDurationMinutes", "source", "expiresAt", "createdAt", "updatedAt")
       VALUES ('probe-hold-empty', 'tenant-a', now()::timestamp + interval '1 day', now()::timestamp + interval '1 day',
               '["svc-a-corte"]'::jsonb, 30, 'AI', now() + interval '5 minutes', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')`,
    );
    assert(emptyIntervalRejected, "a hold whose endAt is not after startAt must be rejected");
    await client.query(`DELETE FROM "AppointmentHold" WHERE "id" LIKE 'probe-%'`);

    // Ordem cronológica não ambígua: dois eventos gravados na MESMA
    // transação compartilham `occurredAt` (CURRENT_TIMESTAMP é o instante de
    // início da transação) e só a sequência os desempata.
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO "AppointmentEvent" ("id", "tenantId", "appointmentId", "type", "source")
      VALUES ('probe-evt-1', 'tenant-a', 'apt-a-scheduled', 'CREATED', 'USER'),
             ('probe-evt-2', 'tenant-a', 'apt-a-scheduled', 'OVERLAP_OVERRIDE', 'USER')
    `);
    await client.query("COMMIT");
    const sameInstant = await client.query(`
      SELECT "id", "occurredAt", "sequence" FROM "AppointmentEvent"
      WHERE "id" LIKE 'probe-evt-%' ORDER BY "occurredAt", "sequence"
    `);
    assert(
      sameInstant.rows.length === 2 &&
        sameInstant.rows[0].occurredAt.getTime() === sameInstant.rows[1].occurredAt.getTime(),
      "two events written in the same transaction must share occurredAt — that is exactly why the tiebreaker exists",
    );
    assert(
      BigInt(sameInstant.rows[0].sequence) < BigInt(sameInstant.rows[1].sequence) &&
        sameInstant.rows[0].id === "probe-evt-1",
      "the sequence must order events written in the same transaction by their real write order",
    );
    await client.query(`DELETE FROM "AppointmentEvent" WHERE "id" LIKE 'probe-evt-%'`);

    // Idempotências COMPLETED existentes continuam decodificáveis: resposta
    // e status preservados, referência de efeito nula (Goal008 ainda não a
    // populou para registros pré-existentes).
    const completedRow = await client.query(
      `SELECT "status", "response", "effectEntityType", "effectEntityId" FROM "CalendarMutationIdempotency" WHERE "id" = 'idem-a-completed'`,
    );
    assert(completedRow.rows.length === 1, "the pre-existing COMPLETED idempotency row must survive the migration");
    assert(completedRow.rows[0].status === "COMPLETED", "the COMPLETED idempotency must keep its status");
    assert(
      completedRow.rows[0].response?.appointmentId === "apt-a-scheduled" &&
        completedRow.rows[0].response?.totalPriceType === "FIXED",
      "the COMPLETED idempotency response must still decode to the original payload",
    );
    assert(
      completedRow.rows[0].effectEntityType === null && completedRow.rows[0].effectEntityId === null,
      "a pre-existing idempotency row must not have a fabricated effect reference",
    );

    // Passo 1, retomado: reaplicar sobre o estado já expandido não muda
    // nada nem lança erro (CREATE ... IF NOT EXISTS / DO $$ ... duplicate_object).
    const expandRetry = await applyMigrationFile(client, EXPAND_SQL);
    assert(expandRetry === true, `expand step must be resumable: ${expandRetry}`);
    const afterExpandRetry = await inventory(client);
    assert(
      JSON.stringify(afterExpandRetry) === JSON.stringify(afterStatus),
      "reapplying the expand step must not change a single count",
    );

    // Passo 2, retomado: reaplicar sobre o estado já normalizado não muda
    // nada (as UPDATEs não encontram linha, a constraint já existe).
    const statusRetry = await applyMigrationFile(client, STATUS_SQL);
    assert(statusRetry === true, `normalization step must be resumable: ${statusRetry}`);
    const afterStatusRetry = await inventory(client);
    assert(
      JSON.stringify(afterStatusRetry) === JSON.stringify(afterStatus),
      "reapplying the normalization step must not change a single count",
    );
    // Passo 3, retomado: o DROP é `IF EXISTS`, os ADD ignoram
    // `duplicate_object` e a coluna de sequência é `IF NOT EXISTS`.
    const fixupRetry = await applyMigrationFile(client, FIXUP_SQL);
    assert(fixupRetry === true, `fixup step must be resumable: ${fixupRetry}`);
    const afterFixupRetry = await inventory(client);
    assert(
      JSON.stringify(afterFixupRetry) === JSON.stringify(afterStatus),
      "reapplying the fixup step must not change a single count",
    );

    const rawMappingRetry = await client.query(`
      SELECT "id", "statusRaw", "status" FROM "Appointment" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
    `);
    assert(
      JSON.stringify(rawMappingRetry.rows) === JSON.stringify(rawMapping.rows),
      "reapplying the normalization step must not touch statusRaw or status again",
    );

    if (process.exitCode) {
      console.error("goal008:migration-rehearsal FAILED — see the assertions above.");
    } else {
      console.log(
        "goal008:migration-rehearsal PASSED — expansion preserved every appointment, item and idempotency, " +
          "the guard rejected an unknown status in a rolled-back transaction, normalization mapped SCHEDULED->CONFIRMED " +
          "while preserving the raw value, the new constraints held, COMPLETED idempotencies stayed decodable, and " +
          "both steps proved resumable without changing state.",
      );
    }
  } finally {
    await client.end();
  }
}

await main();
