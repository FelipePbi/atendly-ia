#!/usr/bin/env node

// Ensaio da migration do Goal022 (WU-03) no BFF: a central de notificacoes
// duravel (`TenantNotification`), a preferencia humana
// (`NotificationPreference`) e o cursor de reconciliacao
// (`NotificationSyncState`).
//
// Banco descartavel proprio, derivado de BFF_TEST_DATABASE_URL. Nenhum banco
// de app e tocado.
//
// Reconstroi o schema do BFF como ele esta ao fim do Goal021, reduzido ao
// que esta migration toca ou de que depende por FK (`Tenant`), semeia
// estoque legado — dois negocios — aplica a migration real e reconcilia.
//
// O que o ensaio prova, em banco de verdade e nao em dublê:
//   1. a migration e estritamente ADITIVA: nenhuma linha preexistente de
//      `Tenant` muda de valor e nenhuma coluna dele muda de tipo,
//      nulabilidade ou default;
//   2. NAO HA BACKFILL: as tres tabelas novas nascem vazias — nenhum negocio
//      existente ganha notificacao, preferencia ou cursor retroativo;
//   3. a IDEMPOTENCIA E DO BANCO: a segunda linha com o mesmo
//      (tenantId, dedupeKey) e recusada por INSERCAO — a mesma chave que
//      `createMany({ skipDuplicates: true })` usa em produção —, nao por
//      leitura previa;
//   4. a preferencia e o cursor sao NO MAXIMO UM por negocio, garantido pela
//      chave unica em `tenantId`; e a AUSENCIA da linha de preferencia
//      continua distinguivel de "existe e esta desligada";
//   5. o vocabulario de kind/level/shape e FECHADO: valor fora do enum e
//      recusado pelo banco;
//   6. a CASCATA de negocio removido leva as tres tabelas novas com ele —
//      nenhuma linha orfa sobrevive a um `Tenant` apagado.
//
// Este ensaio NAO prova retomada (reaplicar a migration sobre o estado ja
// migrado): a migration nao guarda `CREATE TYPE`/`CREATE TABLE` contra
// reexecucao (sem `IF NOT EXISTS` nem bloco `duplicate_object`, ao contrario
// do padrao adotado por toda outra migration deste repositorio, por exemplo
// `20260915120000_goal021_reminder_schedule`), e reaplica-la falha com
// "type already exists". Corrigir isso pertence a WU-03 (autora da
// migration), fora do escopo desta unidade.
//
// Deixa o banco no estado pos-migration. Nenhuma credencial aparece na
// saida: so contagens e rotulos, e toda fixture e sintetica. Sondas
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
  "bff",
  "prisma",
  "migrations",
  "20260915140000_goal022_notification_center",
  "migration.sql",
);

function refuse(message) {
  console.error(
    `goal022:notification-center-migration-rehearsal REFUSED — ${message}`,
  );
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

  const name = `${database}_goal022`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema do BFF como esta ao fim do Goal021, reduzido a tabela de que esta
// migration depende por FK (`Tenant`). O resto do dominio do BFF fica de
// fora de proposito: esta migration nao o toca nem depende dele.
const LEGACY_SCHEMA = `
CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

// Estoque legado: dois negocios, para que o isolamento por tenant e a
// cascata sejam observaveis. Nenhum dos dois pode ganhar notificacao,
// preferencia ou cursor por efeito da migration.
const FIXTURE = `
INSERT INTO "Tenant" ("id", "name") VALUES
  ('tenant-um', 'Negocio Um'),
  ('tenant-dois', 'Negocio Dois'),
  ('tenant-a-remover', 'Negocio A Remover');
`;

function assert(condition, message) {
  if (!condition) {
    console.error(
      `goal022:notification-center-migration-rehearsal FAILED — ${message}`,
    );
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

// Forma das colunas de `Tenant`: e isto que nao pode mudar.
async function tenantColumnShape(client) {
  const result = await client.query(`
    SELECT "column_name", "data_type", "is_nullable", COALESCE("column_default", '-') AS "column_default"
    FROM information_schema.columns
    WHERE "table_name" = 'Tenant'
    ORDER BY "column_name"
  `);
  return result.rows.map(
    (row) =>
      `${row.column_name}/${row.data_type}/${row.is_nullable}/${row.column_default}`,
  );
}

async function tenantRows(client) {
  const result = await client.query(`
    SELECT "id", "name", "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
    FROM "Tenant" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return result.rows.map((row) => Object.values(row).join("/"));
}

async function countOf(client, table, where = "") {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "${table}" ${where}`,
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

// Insercao crua, sem passar pela aplicacao: o que se prova aqui e o BANCO,
// nao o TypeScript.
function insertNotificationSql(id, options) {
  const {
    tenantId = "tenant-um",
    kind = "CUSTOMER_WAITING_HUMAN",
    level = "ATTENTION",
    shape = "EVENT",
    dedupeKey = id,
  } = options ?? {};
  return `
    INSERT INTO "TenantNotification"
      ("id", "tenantId", "kind", "level", "shape", "dedupeKey", "occurredAt", "updatedAt")
    VALUES
      ('${id}', '${tenantId}', '${kind}', '${level}', '${shape}', '${dedupeKey}', now(), now())
  `;
}

async function rehearse(target) {
  console.log(
    `goal022:notification-center-migration-rehearsal target: ${target.label}`,
  );
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(LEGACY_SCHEMA);
    await client.query(FIXTURE);

    assert(
      (await countOf(client, "Tenant")) === 3,
      "the fixture must contain three legacy tenants",
    );
    const shapeBefore = await tenantColumnShape(client);
    const tenantsBefore = await tenantRows(client);

    // ---- Aditividade: aplica a migration real, a mesma que roda em producao.
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    assert(applied === true, `the migration must apply cleanly: ${applied}`);

    assert(
      JSON.stringify(await tenantColumnShape(client)) ===
        JSON.stringify(shapeBefore),
      "no pre-existing Tenant column may change type, nullability or default",
    );
    assert(
      JSON.stringify(await tenantRows(client)) ===
        JSON.stringify(tenantsBefore),
      "the migration must not change a single pre-existing Tenant row",
    );

    for (const table of [
      "TenantNotification",
      "NotificationPreference",
      "NotificationSyncState",
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
      "TenantNotification",
      "NotificationPreference",
      "NotificationSyncState",
    ]) {
      assert(
        (await countOf(client, table)) === 0,
        `${table} must start empty — no existing tenant gains a retroactive row`,
      );
    }

    // ---- Sondas: tudo daqui para baixo roda dentro de uma transacao que e
    //      desfeita no fim, para o banco ficar exatamente no estado
    //      pos-migration.
    await client.query("BEGIN");

    // 1. Idempotencia por (tenantId, dedupeKey) — a mesma chave que
    //    `createMany({ skipDuplicates: true })` usa em producao.
    await expectAccepted(
      client,
      insertNotificationSql("probe-notif-1", { dedupeKey: "waiting:conv-1" }),
      "the first notification with a given dedupe key must be accepted",
    );
    const duplicate = await expectRejected(
      client,
      insertNotificationSql("probe-notif-1-again", {
        dedupeKey: "waiting:conv-1",
      }),
      "a second notification with the same (tenantId, dedupeKey) must be rejected by insertion",
    );
    assert(
      duplicate?.code === "23505",
      `the duplicated dedupe key must fail with a unique violation, got ${duplicate?.code}`,
    );
    // Mesma dedupeKey, outro tenant: nao colide — o isolamento e por tenant.
    await expectAccepted(
      client,
      insertNotificationSql("probe-notif-other-tenant", {
        tenantId: "tenant-dois",
        dedupeKey: "waiting:conv-1",
      }),
      "the same dedupe key in another tenant must not collide",
    );

    // 2. Vocabulario fechado: kind, level e shape fora do enum sao recusados
    //    pelo banco.
    const unknownKind = await expectRejected(
      client,
      insertNotificationSql("probe-notif-unknown-kind", {
        kind: "SOMETHING_MADE_UP",
        dedupeKey: "probe-unknown-kind",
      }),
      "an unknown notification kind must be rejected by the database",
    );
    assert(
      unknownKind?.code === "22P02",
      `an unknown kind must fail as an invalid enum input, got ${unknownKind?.code}`,
    );
    const unknownLevel = await expectRejected(
      client,
      insertNotificationSql("probe-notif-unknown-level", {
        level: "URGENT",
        dedupeKey: "probe-unknown-level",
      }),
      "an unknown notification level must be rejected by the database",
    );
    assert(
      unknownLevel?.code === "22P02",
      `an unknown level must fail as an invalid enum input, got ${unknownLevel?.code}`,
    );
    const unknownShape = await expectRejected(
      client,
      insertNotificationSql("probe-notif-unknown-shape", {
        shape: "ALERT",
        dedupeKey: "probe-unknown-shape",
      }),
      "an unknown notification shape must be rejected by the database",
    );
    assert(
      unknownShape?.code === "22P02",
      `an unknown shape must fail as an invalid enum input, got ${unknownShape?.code}`,
    );

    // 3. No maximo uma preferencia por negocio, e a ausencia da linha
    //    continua distinguivel de "existe e esta desligada".
    await client.query(
      `INSERT INTO "NotificationPreference" ("id", "tenantId", "updatedAt") VALUES ('probe-pref-um', 'tenant-um', now())`,
    );
    const secondPreference = await expectRejected(
      client,
      `INSERT INTO "NotificationPreference" ("id", "tenantId", "updatedAt") VALUES ('probe-pref-um-again', 'tenant-um', now())`,
      "a second preference row for the same tenant must be rejected by the unique index",
    );
    assert(
      secondPreference?.code === "23505",
      `a duplicated preference must fail with a unique violation, got ${secondPreference?.code}`,
    );
    const defaultPreference = await client.query(
      `SELECT "aiAppointmentCreated" FROM "NotificationPreference" WHERE "tenantId" = 'tenant-um'`,
    );
    assert(
      defaultPreference.rows[0].aiAppointmentCreated === false,
      "a preference row created without an explicit choice must default to disabled",
    );
    const neverConfiguredPreference = await client.query(
      `SELECT COUNT(*)::int AS total FROM "NotificationPreference" WHERE "tenantId" = 'tenant-dois'`,
    );
    assert(
      neverConfiguredPreference.rows[0].total === 0,
      "a tenant that never configured must have no preference row at all — that is what makes the default an absence, not a stored choice",
    );

    // 4. No maximo um cursor de reconciliacao por negocio.
    await client.query(
      `INSERT INTO "NotificationSyncState" ("id", "tenantId", "updatedAt") VALUES ('probe-sync-um', 'tenant-um', now())`,
    );
    const secondSyncState = await expectRejected(
      client,
      `INSERT INTO "NotificationSyncState" ("id", "tenantId", "updatedAt") VALUES ('probe-sync-um-again', 'tenant-um', now())`,
      "a second sync state row for the same tenant must be rejected by the unique index",
    );
    assert(
      secondSyncState?.code === "23505",
      `a duplicated sync state must fail with a unique violation, got ${secondSyncState?.code}`,
    );

    // 5. A cascata de negocio removido leva as tres tabelas novas com ele.
    await client.query(
      `INSERT INTO "TenantNotification" ("id", "tenantId", "kind", "level", "shape", "dedupeKey", "occurredAt", "updatedAt")
       VALUES ('probe-notif-to-remove', 'tenant-a-remover', 'CUSTOMER_WAITING_HUMAN', 'ATTENTION', 'EVENT', 'probe-to-remove', now(), now())`,
    );
    await client.query(
      `INSERT INTO "NotificationPreference" ("id", "tenantId", "updatedAt") VALUES ('probe-pref-to-remove', 'tenant-a-remover', now())`,
    );
    await client.query(
      `INSERT INTO "NotificationSyncState" ("id", "tenantId", "updatedAt") VALUES ('probe-sync-to-remove', 'tenant-a-remover', now())`,
    );
    await client.query(`DELETE FROM "Tenant" WHERE "id" = 'tenant-a-remover'`);
    assert(
      (await countOf(
        client,
        "TenantNotification",
        `WHERE "tenantId" = 'tenant-a-remover'`,
      )) === 0,
      "removing a tenant must cascade its notifications away — no orphan row survives",
    );
    assert(
      (await countOf(
        client,
        "NotificationPreference",
        `WHERE "tenantId" = 'tenant-a-remover'`,
      )) === 0,
      "removing a tenant must cascade its preference row away",
    );
    assert(
      (await countOf(
        client,
        "NotificationSyncState",
        `WHERE "tenantId" = 'tenant-a-remover'`,
      )) === 0,
      "removing a tenant must cascade its sync state row away",
    );

    await client.query("ROLLBACK");

    for (const table of [
      "TenantNotification",
      "NotificationPreference",
      "NotificationSyncState",
    ]) {
      assert(
        (await countOf(client, table)) === 0,
        `probing must leave no ${table} row behind`,
      );
    }
    assert(
      (await countOf(client, "Tenant")) === 3,
      "probing must leave the three legacy tenants untouched",
    );
  } finally {
    await client.end();
  }
}

export async function main() {
  const target = rehearsalTarget(process.env);

  await rehearse(target);

  if (process.exitCode) {
    console.error(
      "goal022:notification-center-migration-rehearsal FAILED — see the assertions above.",
    );
  } else {
    console.log(
      "goal022:notification-center-migration-rehearsal PASSED — the notification, preference and sync state tables are " +
        "additive and backfill-free (no pre-existing tenant gains a row), the (tenantId, dedupeKey) index deduplicates by " +
        "insertion — the same key production materialization relies on —, kind/level/shape are a closed vocabulary, " +
        "preference and sync state are at most one row per tenant with absence distinguishable from a stored default, and " +
        "removing a tenant cascades all three away. Resumability is not exercised — see the header note.",
    );
  }
}

if (isMain(import.meta.url)) await main();
