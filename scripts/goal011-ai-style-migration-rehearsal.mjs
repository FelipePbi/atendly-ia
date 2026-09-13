#!/usr/bin/env node

// Ensaio das migrations do Goal011 (estilo de conversa com tres valores) nos
// dois bancos que declaram o enum "AiTone": IA (WU-01, tres passos) e BFF
// (WU-07, dois passos).
//
// Dois bancos descartaveis proprios, derivados de BFF_TEST_DATABASE_URL —
// um para reconstruir o schema da IA como estava antes deste Goal
// (`AiTenantConfig.tone`, default 'LIGHT_CLOSE'), outro para o schema do BFF
// (`AiSettings.tone`, sem default, nulo permitido). Nenhum dos dois toca o
// banco real de nenhum app.
//
// O que o ensaio prova, nos dois bancos:
//   1. o passo que so acrescenta vocabulario ao enum e aditivo: nenhuma linha
//      preexistente muda, e os dois valores antigos continuam validos no
//      tipo do banco depois dele;
//   2. o backfill e determinístico e completo, linha a linha:
//      PROFESSIONAL_OBJECTIVE -> PROFESSIONAL, LIGHT_CLOSE -> BALANCED, e
//      nenhuma linha fica presa no valor antigo — a suíte falha de verdade
//      se sobrar uma;
//   3. o novo default (IA: 'BALANCED' no banco; BFF: continua sem default,
//      nulo significa "negocio ainda nao escolheu") vale para linha nova sem
//      "tone" explícito;
//   4. o valor antigo continua um membro legitimo do tipo depois do
//      backfill: uma linha escrita depois, com o valor antigo, continua
//      legivel — a janela de compatibilidade declarada no cabeçalho das
//      migrations;
//   5. os passos sao retomaveis: reaplicados sobre o estado ja migrado, nao
//      mudam nenhuma linha nem lancam erro.
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

// Mapa de backfill unico e determinístico, o mesmo declarado nos cabeçalhos
// das quatro migrations (IA e BFF): CASUAL e estilo novo, nenhuma linha
// legada nasce nele.
export const BACKFILL_MAP = Object.freeze({
  PROFESSIONAL_OBJECTIVE: "PROFESSIONAL",
  LIGHT_CLOSE: "BALANCED",
});

function migrationFile(app, name) {
  return path.join(repositoryRoot, "apps", app, "prisma", "migrations", name, "migration.sql");
}

const AI_MIGRATIONS = [
  migrationFile("ai-orchestrator", "20260913120000_goal011_ai_style_add_values"),
  migrationFile("ai-orchestrator", "20260913120100_goal011_ai_style_backfill"),
  migrationFile("ai-orchestrator", "20260913120200_goal011_ai_style_default"),
];

const BFF_MIGRATIONS = [
  migrationFile("bff", "20260913140000_goal011_bff_ai_style_add_values"),
  migrationFile("bff", "20260913140100_goal011_bff_ai_style_backfill"),
];

function refuse(message) {
  console.error(`goal011:ai-style-migration-rehearsal REFUSED — ${message}`);
  process.exit(2);
}

export function rehearsalTarget(environment = process.env, kind) {
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

  const name = `${database}_goal011_${kind}`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema da IA como estava antes deste Goal: dois valores de "tone", default
// 'LIGHT_CLOSE'. `AiTenantConfig` nao tem FK para Tenant.
const AI_LEGACY_SCHEMA = `
CREATE TYPE "AiTone" AS ENUM ('PROFESSIONAL_OBJECTIVE', 'LIGHT_CLOSE');

CREATE TABLE "AiTenantConfig" (
  "tenantId" TEXT NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "tone" "AiTone" NOT NULL DEFAULT 'LIGHT_CLOSE',
  "promptVersion" TEXT NOT NULL DEFAULT 'scheduling_v1.0.0',
  "settings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

// Quatro tenants legados: dois em cada valor antigo, para provar o backfill
// linha a linha, nao so "algum" tenant de cada lado.
const AI_FIXTURE = `
INSERT INTO "AiTenantConfig" ("tenantId", "enabled", "tone", "settings") VALUES
  ('tenant-professional-1', true, 'PROFESSIONAL_OBJECTIVE', '{"a": 1}'::jsonb),
  ('tenant-professional-2', false, 'PROFESSIONAL_OBJECTIVE', NULL),
  ('tenant-balanced-1', true, 'LIGHT_CLOSE', '{"b": 2}'::jsonb),
  ('tenant-balanced-2', false, 'LIGHT_CLOSE', NULL);
`;

// Schema do BFF como estava antes deste Goal: "tone" nulavel, sem default no
// banco — nulo significa "negocio ainda nao escolheu". FK para Tenant, entao
// a fixture precisa de um Tenant minimo por linha.
const BFF_LEGACY_SCHEMA = `
CREATE TYPE "AiTone" AS ENUM ('PROFESSIONAL_OBJECTIVE', 'LIGHT_CLOSE');

CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL
);

CREATE TABLE "AiSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL UNIQUE REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "tone" "AiTone",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

// Tres tenants: um em cada valor antigo e um que nunca escolheu (tone nulo).
// O nulo nao e alias de nada e deve seguir intocado pelo backfill.
const BFF_FIXTURE = `
INSERT INTO "Tenant" ("id", "name") VALUES
  ('tenant-a', 'Negocio A'),
  ('tenant-b', 'Negocio B'),
  ('tenant-c', 'Negocio C'),
  ('tenant-probe', 'Negocio Sonda');

INSERT INTO "AiSettings" ("id", "tenantId", "enabled", "tone") VALUES
  ('settings-a', 'tenant-a', true, 'PROFESSIONAL_OBJECTIVE'),
  ('settings-b', 'tenant-b', true, 'LIGHT_CLOSE'),
  ('settings-c', 'tenant-c', false, NULL);
`;

function assert(condition, message) {
  if (!condition) {
    console.error(`goal011:ai-style-migration-rehearsal FAILED — ${message}`);
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

/**
 * Aplica as mesmas tres migrations no banco que a suite de persistencia da IA
 * usa (`AI_TEST_DATABASE_URL`, o `_goal004` deixado pelo ensaio do Goal004 e
 * expandido por Goal005/Goal006). Sem este passo o tipo "AiTone" desse banco
 * fica so com os dois valores legados e `tone: 'BALANCED'` (default do
 * Prisma Client apos este Goal) e rejeitado pelo Postgres em qualquer
 * insercao/leitura feita pela suite de durabilidade.
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
      "durability target not provisioned yet — skipping the Goal011 schema expansion",
    );
    return;
  }
  try {
    const configTable = await client.query(
      `SELECT to_regclass('"AiTenantConfig"') AS present`,
    );
    if (!configTable.rows[0].present) {
      console.log(
        "durability target has no AiTenantConfig table yet — skipping the Goal011 schema expansion",
      );
      return;
    }
    for (const migration of AI_MIGRATIONS) {
      const applied = await applyMigrationFile(client, migration);
      if (applied !== true) {
        console.error(
          `goal011:ai-style-migration-rehearsal FAILED — durability target expansion failed applying ${migration}: ${applied}`,
        );
        process.exitCode = 1;
        return;
      }
    }
    console.log(
      `durability target expanded with the Goal011 AI style migrations: ${database}_goal004`,
    );
  } finally {
    await client.end();
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

// Contagens e fingerprint sem sonda: `probe-%` nunca entra na fixture nem nas
// contagens reconciliadas.
async function aiFingerprint(client) {
  const rows = await client.query(`
    SELECT "tenantId", "enabled", "tone"::text, "promptVersion", "settings"::text, "createdAt"::text, "updatedAt"::text
    FROM "AiTenantConfig" WHERE "tenantId" NOT LIKE 'probe-%' ORDER BY "tenantId"
  `);
  return rows.rows.map(
    (row) =>
      `${row.tenantId}/${row.enabled}/${row.tone}/${row.promptVersion}/${row.settings}/${row.createdAt}/${row.updatedAt}`,
  );
}

async function aiCount(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "AiTenantConfig" WHERE "tenantId" NOT LIKE 'probe-%'`,
  );
  return result.rows[0].total;
}

async function aiTones(client) {
  const result = await client.query(
    `SELECT "tenantId", "tone"::text FROM "AiTenantConfig" WHERE "tenantId" NOT LIKE 'probe-%' ORDER BY "tenantId"`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.tenantId, row.tone]));
}

async function rehearseAi(target) {
  console.log(`goal011:ai-style-migration-rehearsal (ai-orchestrator) target: ${target.label}`);
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(AI_LEGACY_SCHEMA);
    await client.query(AI_FIXTURE);

    const before = await aiCount(client);
    assert(before === 4, `the AI fixture must contain four AiTenantConfig rows, found ${before}`);
    const tonesBefore = await aiTones(client);
    assert(
      tonesBefore["tenant-professional-1"] === "PROFESSIONAL_OBJECTIVE" &&
        tonesBefore["tenant-balanced-1"] === "LIGHT_CLOSE",
      "the fixture must start entirely on legacy values",
    );

    // Passo 1 — so vocabulario. Aditivo: nenhuma linha muda.
    const step1 = await applyMigrationFile(client, AI_MIGRATIONS[0]);
    assert(step1 === true, `AI step 1 (add values) must apply cleanly: ${step1}`);
    assert(
      JSON.stringify(await aiTones(client)) === JSON.stringify(tonesBefore),
      "AI step 1 must not touch a single row's tone",
    );
    const oldValueStillAcceptedAfterStep1 = !(await rejects(
      client,
      `INSERT INTO "AiTenantConfig" ("tenantId", "tone") VALUES ('probe-ai-step1-legacy', 'PROFESSIONAL_OBJECTIVE')`,
    ));
    assert(oldValueStillAcceptedAfterStep1, "the legacy enum values must remain valid after step 1 — the type is only extended, never narrowed");
    await client.query(`DELETE FROM "AiTenantConfig" WHERE "tenantId" = 'probe-ai-step1-legacy'`);

    // Passo 2 — backfill. Precisa mover TODA linha, sem sobra no valor antigo.
    const beforeBackfillFingerprint = await aiFingerprint(client);
    const step2 = await applyMigrationFile(client, AI_MIGRATIONS[1]);
    assert(step2 === true, `AI step 2 (backfill) must apply cleanly: ${step2}`);

    const afterBackfill = await aiCount(client);
    assert(afterBackfill === before, "the backfill must not create or delete a single AiTenantConfig row");

    const tonesAfterBackfill = await aiTones(client);
    for (const [tenantId, legacyTone] of Object.entries(tonesBefore)) {
      assert(
        tonesAfterBackfill[tenantId] === BACKFILL_MAP[legacyTone],
        `AI backfill must map ${tenantId} from ${legacyTone} to ${BACKFILL_MAP[legacyTone]}, found ${tonesAfterBackfill[tenantId]}`,
      );
    }
    const staleAiRows = await client.query(
      `SELECT COUNT(*)::int AS total FROM "AiTenantConfig" WHERE "tenantId" NOT LIKE 'probe-%' AND "tone" IN ('PROFESSIONAL_OBJECTIVE', 'LIGHT_CLOSE')`,
    );
    assert(staleAiRows.rows[0].total === 0, "no AiTenantConfig row may remain on a legacy tone after the backfill");

    // Nenhuma outra coluna foi tocada — so "tone" mudou.
    const otherColumns = (fingerprint) => fingerprint.map((row) => row.split("/").filter((_, index) => index !== 2).join("/"));
    assert(
      JSON.stringify(otherColumns(await aiFingerprint(client))) === JSON.stringify(otherColumns(beforeBackfillFingerprint)),
      "the backfill must not touch enabled, promptVersion, settings, createdAt or updatedAt",
    );

    // Passo 3 — default novo. So afeta linha nova, sem "tone" explicito.
    const step3 = await applyMigrationFile(client, AI_MIGRATIONS[2]);
    assert(step3 === true, `AI step 3 (default) must apply cleanly: ${step3}`);
    await client.query(`INSERT INTO "AiTenantConfig" ("tenantId") VALUES ('probe-ai-new-tenant')`);
    const newTenantTone = await client.query(
      `SELECT "tone"::text FROM "AiTenantConfig" WHERE "tenantId" = 'probe-ai-new-tenant'`,
    );
    assert(newTenantTone.rows[0].tone === "BALANCED", "a new AiTenantConfig row without an explicit tone must default to BALANCED");
    await client.query(`DELETE FROM "AiTenantConfig" WHERE "tenantId" = 'probe-ai-new-tenant'`);
    assert(
      (await aiCount(client)) === before,
      "probing the new default must leave the fixture count exactly as it was",
    );

    // Leitura do legado: um binario anterior ainda escrevendo o valor antigo
    // continua produzindo uma linha legivel — a janela de compatibilidade.
    await client.query(`INSERT INTO "AiTenantConfig" ("tenantId", "tone") VALUES ('probe-ai-legacy-writer', 'PROFESSIONAL_OBJECTIVE')`);
    const legacyRead = await client.query(
      `SELECT "tone"::text FROM "AiTenantConfig" WHERE "tenantId" = 'probe-ai-legacy-writer'`,
    );
    assert(legacyRead.rows[0].tone === "PROFESSIONAL_OBJECTIVE", "a row written with a legacy tone must still be readable after all three steps");
    await client.query(`DELETE FROM "AiTenantConfig" WHERE "tenantId" = 'probe-ai-legacy-writer'`);

    // Retomada: reaplicar os tres passos nao muda nada nem lanca erro.
    const beforeRetry = await aiFingerprint(client);
    for (const migration of AI_MIGRATIONS) {
      const retried = await applyMigrationFile(client, migration);
      assert(retried === true, `AI migration must be resumable: ${retried} (${migration})`);
    }
    assert(
      JSON.stringify(await aiFingerprint(client)) === JSON.stringify(beforeRetry),
      "reapplying all three AI migrations must not change a single row",
    );
    assert((await aiCount(client)) === before, "reapplying the AI migrations must leave the row count unchanged");
  } finally {
    await client.end();
  }
}

async function bffFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "enabled", "tone"::text, "createdAt"::text, "updatedAt"::text
    FROM "AiSettings" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) => `${row.id}/${row.tenantId}/${row.enabled}/${row.tone}/${row.createdAt}/${row.updatedAt}`,
  );
}

async function bffCount(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "AiSettings" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return result.rows[0].total;
}

async function bffTones(client) {
  const result = await client.query(
    `SELECT "id", "tone"::text FROM "AiSettings" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.id, row.tone]));
}

async function rehearseBff(target) {
  console.log(`goal011:ai-style-migration-rehearsal (bff) target: ${target.label}`);
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(BFF_LEGACY_SCHEMA);
    await client.query(BFF_FIXTURE);

    const before = await bffCount(client);
    assert(before === 3, `the BFF fixture must contain three AiSettings rows, found ${before}`);
    const tonesBefore = await bffTones(client);
    assert(
      tonesBefore["settings-a"] === "PROFESSIONAL_OBJECTIVE" &&
        tonesBefore["settings-b"] === "LIGHT_CLOSE" &&
        tonesBefore["settings-c"] === null,
      "the BFF fixture must start with both legacy values and one business that never chose a style",
    );

    // Passo 1 — so vocabulario.
    const step1 = await applyMigrationFile(client, BFF_MIGRATIONS[0]);
    assert(step1 === true, `BFF step 1 (add values) must apply cleanly: ${step1}`);
    assert(
      JSON.stringify(await bffTones(client)) === JSON.stringify(tonesBefore),
      "BFF step 1 must not touch a single row's tone",
    );
    const oldValueStillAcceptedAfterStep1 = !(await rejects(
      client,
      `INSERT INTO "AiSettings" ("id", "tenantId", "tone") VALUES ('probe-bff-step1-legacy', 'tenant-probe', 'LIGHT_CLOSE')`,
    ));
    assert(oldValueStillAcceptedAfterStep1, "the legacy enum values must remain valid in the BFF after step 1");
    await client.query(`DELETE FROM "AiSettings" WHERE "id" = 'probe-bff-step1-legacy'`);

    // Passo 2 — backfill. Nulo (nunca escolheu) fica intocado.
    const beforeBackfillFingerprint = await bffFingerprint(client);
    const step2 = await applyMigrationFile(client, BFF_MIGRATIONS[1]);
    assert(step2 === true, `BFF step 2 (backfill) must apply cleanly: ${step2}`);

    assert((await bffCount(client)) === before, "the BFF backfill must not create or delete a single AiSettings row");

    const tonesAfterBackfill = await bffTones(client);
    assert(tonesAfterBackfill["settings-a"] === "PROFESSIONAL", "settings-a must move from PROFESSIONAL_OBJECTIVE to PROFESSIONAL");
    assert(tonesAfterBackfill["settings-b"] === "BALANCED", "settings-b must move from LIGHT_CLOSE to BALANCED");
    assert(tonesAfterBackfill["settings-c"] === null, "settings-c must stay null — null is never an alias for a chosen style");

    const staleBffRows = await client.query(
      `SELECT COUNT(*)::int AS total FROM "AiSettings" WHERE "id" NOT LIKE 'probe-%' AND "tone" IN ('PROFESSIONAL_OBJECTIVE', 'LIGHT_CLOSE')`,
    );
    assert(staleBffRows.rows[0].total === 0, "no AiSettings row may remain on a legacy tone after the backfill");

    const otherColumns = (fingerprint) => fingerprint.map((row) => row.split("/").filter((_, index) => index !== 3).join("/"));
    assert(
      JSON.stringify(otherColumns(await bffFingerprint(client))) === JSON.stringify(otherColumns(beforeBackfillFingerprint)),
      "the BFF backfill must not touch id, tenantId, enabled, createdAt or updatedAt",
    );

    // Sem passo de default no BFF: linha nova sem "tone" continua nula.
    await client.query(`INSERT INTO "AiSettings" ("id", "tenantId") VALUES ('probe-bff-new-settings', 'tenant-probe')`);
    const newSettingsTone = await client.query(
      `SELECT "tone"::text FROM "AiSettings" WHERE "id" = 'probe-bff-new-settings'`,
    );
    assert(newSettingsTone.rows[0].tone === null, "a new AiSettings row without an explicit tone must stay null — the BFF never gained a database default");
    await client.query(`DELETE FROM "AiSettings" WHERE "id" = 'probe-bff-new-settings'`);
    assert((await bffCount(client)) === before, "probing the absence of a default must leave the fixture count exactly as it was");

    // Leitura do legado: escrita posterior com o valor antigo continua legivel.
    await client.query(`INSERT INTO "AiSettings" ("id", "tenantId", "tone") VALUES ('probe-bff-legacy-writer', 'tenant-probe', 'PROFESSIONAL_OBJECTIVE')`);
    const legacyRead = await client.query(
      `SELECT "tone"::text FROM "AiSettings" WHERE "id" = 'probe-bff-legacy-writer'`,
    );
    assert(legacyRead.rows[0].tone === "PROFESSIONAL_OBJECTIVE", "a row written with a legacy tone must still be readable after both BFF steps");
    await client.query(`DELETE FROM "AiSettings" WHERE "id" = 'probe-bff-legacy-writer'`);

    // Retomada: reaplicar os dois passos nao muda nada nem lanca erro.
    const beforeRetry = await bffFingerprint(client);
    for (const migration of BFF_MIGRATIONS) {
      const retried = await applyMigrationFile(client, migration);
      assert(retried === true, `BFF migration must be resumable: ${retried} (${migration})`);
    }
    assert(
      JSON.stringify(await bffFingerprint(client)) === JSON.stringify(beforeRetry),
      "reapplying both BFF migrations must not change a single row",
    );
    assert((await bffCount(client)) === before, "reapplying the BFF migrations must leave the row count unchanged");
  } finally {
    await client.end();
  }
}

export async function main() {
  const aiTarget = rehearsalTarget(process.env, "ai");
  const bffTarget = rehearsalTarget(process.env, "bff");

  await rehearseAi(aiTarget);
  await rehearseBff(bffTarget);
  await prepareAiDurabilityTarget(aiTarget);

  if (process.exitCode) {
    console.error("goal011:ai-style-migration-rehearsal FAILED — see the assertions above.");
  } else {
    console.log(
      "goal011:ai-style-migration-rehearsal PASSED — the IA and BFF style migrations are additive, the backfill moved every " +
        "legacy row deterministically with nothing left behind, the new/absent default behaves as declared, legacy values " +
        "stay readable, and both are resumable without changing state.",
    );
  }
}

if (isMain(import.meta.url)) await main();
