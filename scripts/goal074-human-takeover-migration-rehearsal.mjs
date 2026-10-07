#!/usr/bin/env node

// Ensaio da migration do Goal074 (WU-01) na IA: `HumanTakeover`, registro
// durável de cada passagem real de IA para humano.
//
// Banco descartavel proprio, derivado de BFF_TEST_DATABASE_URL, reconstruindo
// so o recorte de `ConversationSession` de que a migration depende. Nenhum
// banco de app real e tocado.
//
// O que o ensaio prova:
//   1. a migration e estritamente aditiva: a sessao legada que ja existia
//      continua byte a byte igual, e nenhuma coluna existente muda;
//   2. **nao ha backfill**: depois da migration, a sessao legada continua com
//      ZERO tomadas registradas — "nunca foi tomada por humano" e um estado
//      legitimo, nao "aconteceu mas nao foi contado";
//   3. `HumanTakeover.sessionId` exige uma `ConversationSession` real: a FK
//      recusa insercao para sessao inexistente, e apagar a sessao apaga a
//      tomada em cascata — o registro nunca sobrevive a sessao que descreve;
//   4. a mesma migration expande o banco de durabilidade da IA
//      (`AI_TEST_DATABASE_URL`, o `_goal004` deixado pelo ensaio do Goal004 e
//      expandido desde), sem o qual `SessionService.assumeHumanControl`
//      falha com "the table HumanTakeover does not exist" na suite de
//      persistencia — a falha que este ensaio existe para fechar.
//   5. ultimo ensaio antes da suite de persistencia, ele tambem leva o mesmo
//      banco ao rotulo `AVENLY` de `HumanControlSource` (Goal109). Sem isto
//      a suite grava `AVENLY` num enum que so conhece `ATENDLY` e falha com
//      "invalid input value for enum". O ensaio proprio daquele rename e a
//      prova 2 do Goal109, na propria suite de integracao da IA.
//
//   6. e o leva a coluna `ConversationSession.categoryOverride` (Goal115): a
//      decisao de categoria "so esta conversa". Sem isto a suite de
//      persistencia falha com "The column ConversationSession.categoryOverride
//      does not exist in the current database".
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
  "20260929120000_goal074_human_takeover",
  "migration.sql",
);

const GOAL109_MIGRATION_SQL = path.join(
  repositoryRoot,
  "apps",
  "ai-orchestrator",
  "prisma",
  "migrations",
  "20261003120000_goal109_avenly_human_control_source",
  "migration.sql",
);

const GOAL115_MIGRATION_SQL = path.join(
  repositoryRoot,
  "apps",
  "ai-orchestrator",
  "prisma",
  "migrations",
  "20261004120000_goal115_session_category_override",
  "migration.sql",
);

const GOAL146_MIGRATION_SQL = path.join(
  repositoryRoot,
  "apps",
  "ai-orchestrator",
  "prisma",
  "migrations",
  "20261007120000_goal146_contact_last_scheduled_customer",
  "migration.sql",
);

function refuse(message) {
  console.error(`goal074:human-takeover-migration-rehearsal REFUSED — ${message}`);
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

  const name = `${database}_goal074`;
  const rehearsal = new URL(raw);
  rehearsal.pathname = `/${name}`;
  return {
    rehearsal,
    maintenance: new URL(raw),
    name,
    label: `${host}:${url.port || "5432"}/${name}`,
  };
}

// Schema da IA reduzido ao que `HumanTakeover` referencia: uma sessao de
// conversa. `ConversationSession_tenantId_id_key` e a chave que a FK do
// Goal074 usa.
const LEGACY_SCHEMA = `
CREATE TYPE "HumanControlSource" AS ENUM ('WHATSAPP', 'ATENDLY', 'BACKFILL');

CREATE TABLE "ConversationSession" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "humanHandling" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationSession_tenantId_id_key" UNIQUE ("tenantId", "id")
);
`;

// Sessao legada, ja em atendimento humano antes deste Goal existir — exemplo
// exato do dado que a migration NAO pode reescrever nem contar retroativamente.
const FIXTURE = `
INSERT INTO "ConversationSession" ("id", "tenantId", "conversationId", "humanHandling")
VALUES ('session-legacy', 'tenant-legacy', 'conversation-legacy', true);
`;

function assert(condition, message) {
  if (!condition) {
    console.error(`goal074:human-takeover-migration-rehearsal FAILED — ${message}`);
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

async function sessionFingerprint(client) {
  const rows = await client.query(`
    SELECT "id", "tenantId", "conversationId", "humanHandling", "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
    FROM "ConversationSession" WHERE "id" NOT LIKE 'probe-%' ORDER BY "id"
  `);
  return rows.rows.map(
    (row) =>
      `${row.id}/${row.tenantId}/${row.conversationId}/${row.humanHandling}/${row.createdAt}/${row.updatedAt}`,
  );
}

async function takeoverCount(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM "HumanTakeover" WHERE "id" NOT LIKE 'probe-%'`,
  );
  return result.rows[0].total;
}

async function rehearse(target) {
  console.log(`goal074:human-takeover-migration-rehearsal target: ${target.label}`);
  await recreateDatabase(target);

  const client = new Client({ connectionString: target.rehearsal.href });
  await client.connect();
  try {
    await client.query(LEGACY_SCHEMA);
    await client.query(FIXTURE);

    const fingerprintBefore = await sessionFingerprint(client);
    assert(
      fingerprintBefore.length === 1,
      `the fixture must contain one ConversationSession row, found ${fingerprintBefore.length}`,
    );

    // Aditividade — aplica a migration real, a mesma que roda em producao.
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    assert(applied === true, `the migration must apply cleanly: ${applied}`);

    assert(
      JSON.stringify(await sessionFingerprint(client)) ===
        JSON.stringify(fingerprintBefore),
      "the migration must not touch a single pre-existing ConversationSession column",
    );

    const tableExists = await client.query(
      `SELECT to_regclass('"HumanTakeover"') AS present`,
    );
    assert(
      tableExists.rows[0].present !== null,
      "the migration must create the HumanTakeover table",
    );

    // Sem backfill: a sessao legada, ja em atendimento humano, continua sem
    // nenhuma tomada registrada.
    assert(
      (await takeoverCount(client)) === 0,
      "the migration must not fabricate a HumanTakeover row for a pre-existing session",
    );

    // FK: sessao inexistente e recusada.
    await client.query("BEGIN");
    let missingSessionRejected = false;
    try {
      await client.query(`
        INSERT INTO "HumanTakeover" ("id", "tenantId", "sessionId", "conversationId", "source")
        VALUES ('probe-takeover-orphan', 'tenant-legacy', 'session-missing', 'conversation-legacy', 'WHATSAPP')
      `);
    } catch (error) {
      missingSessionRejected = error.code === "23503";
    } finally {
      await client.query("ROLLBACK");
    }
    assert(
      missingSessionRejected,
      "a HumanTakeover for a session that does not exist must be rejected by the foreign key",
    );

    // Cascata: apagar a sessao apaga a tomada junto — o registro nunca
    // sobrevive a sessao que descreve.
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO "ConversationSession" ("id", "tenantId", "conversationId")
      VALUES ('probe-session-cascade', 'tenant-legacy', 'conversation-legacy')
    `);
    await client.query(`
      INSERT INTO "HumanTakeover" ("id", "tenantId", "sessionId", "conversationId", "source")
      VALUES ('probe-takeover-cascade', 'tenant-legacy', 'probe-session-cascade', 'conversation-legacy', 'ATENDLY')
    `);
    await client.query(`DELETE FROM "ConversationSession" WHERE "id" = 'probe-session-cascade'`);
    const afterCascade = await client.query(
      `SELECT COUNT(*)::int AS total FROM "HumanTakeover" WHERE "id" = 'probe-takeover-cascade'`,
    );
    assert(
      afterCascade.rows[0].total === 0,
      "deleting a ConversationSession must cascade-delete its HumanTakeover rows",
    );
    await client.query("ROLLBACK");

    assert(
      (await takeoverCount(client)) === 0,
      "probing the new table must leave no HumanTakeover row behind",
    );
  } finally {
    await client.end();
  }
}

/**
 * Expande o banco de durabilidade da IA (`AI_TEST_DATABASE_URL`, o `_goal004`
 * deixado pelo ensaio do Goal004 e expandido desde) com a migration deste
 * Goal. Sem este passo `SessionService.assumeHumanControl` falha na suite de
 * persistencia com "the table HumanTakeover does not exist" — a falha
 * diagnosticada nesta rodada de `validate:integration`.
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
      "durability target not provisioned yet — skipping the Goal074 schema expansion",
    );
    return;
  }
  try {
    const sessionTable = await client.query(
      `SELECT to_regclass('"ConversationSession"') AS present`,
    );
    if (!sessionTable.rows[0].present) {
      console.log(
        "durability target has no ConversationSession table yet — skipping the Goal074 schema expansion",
      );
      return;
    }
    const alreadyExpanded = await client.query(
      `SELECT to_regclass('"HumanTakeover"') AS present`,
    );
    if (alreadyExpanded.rows[0].present) {
      console.log("durability target already expanded — nothing to apply");
      return;
    }
    const applied = await applyMigrationFile(client, MIGRATION_SQL);
    if (applied !== true) {
      console.error(
        `goal074:human-takeover-migration-rehearsal FAILED — durability target expansion failed applying ${MIGRATION_SQL}: ${applied}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `durability target expanded with the Goal074 HumanTakeover migration: ${database}_goal004`,
    );
  } finally {
    await client.end();
  }
}

/**
 * Leva o banco de durabilidade da IA ao rotulo `AVENLY` (Goal109). A migration
 * daquele Goal so renomeia enquanto `ATENDLY` existe, entao reaplicar sobre
 * banco ja alinhado nao muda nada.
 */
async function alignAiDurabilityTargetWithGoal109(target) {
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
      "durability target not provisioned yet — skipping the Goal109 enum rename",
    );
    return;
  }
  try {
    const enumType = await client.query(
      `SELECT to_regtype('"HumanControlSource"') AS present`,
    );
    if (!enumType.rows[0].present) {
      console.log(
        "durability target has no HumanControlSource type yet — skipping the Goal109 enum rename",
      );
      return;
    }
    const applied = await applyMigrationFile(client, GOAL109_MIGRATION_SQL);
    if (applied !== true) {
      console.error(
        `goal074:human-takeover-migration-rehearsal FAILED — durability target rename failed applying ${GOAL109_MIGRATION_SQL}: ${applied}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `durability target aligned with the Goal109 HumanControlSource rename: ${database}_goal004`,
    );
  } finally {
    await client.end();
  }
}

/**
 * Leva o banco de durabilidade da IA a coluna `categoryOverride` da sessao
 * (Goal115). A migration usa `ADD COLUMN IF NOT EXISTS`, entao reaplicar sobre
 * banco ja alinhado nao muda nada.
 */
async function alignAiDurabilityTargetWithGoal115(target) {
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
      "durability target not provisioned yet — skipping the Goal115 column",
    );
    return;
  }
  try {
    const sessionTable = await client.query(
      `SELECT to_regclass('"ConversationSession"') AS present`,
    );
    if (!sessionTable.rows[0].present) {
      console.log(
        "durability target has no ConversationSession table yet — skipping the Goal115 column",
      );
      return;
    }
    const applied = await applyMigrationFile(client, GOAL115_MIGRATION_SQL);
    if (applied !== true) {
      console.error(
        `goal074:human-takeover-migration-rehearsal FAILED — durability target column failed applying ${GOAL115_MIGRATION_SQL}: ${applied}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `durability target aligned with the Goal115 ConversationSession.categoryOverride column: ${database}_goal004`,
    );
  } finally {
    await client.end();
  }
}

/**
 * Leva o banco de durabilidade da IA as colunas `lastScheduledCustomerId` e
 * `lastScheduledAt` do contato (Goal146). A `SessionService` le e escreve o
 * contato sem `select`, entao a coluna precisa existir em todo banco que a
 * suite usa. O DDL usa `ADD COLUMN IF NOT EXISTS` e o backfill so toca linhas
 * ainda nulas, entao reaplicar sobre banco ja alinhado nao muda nada.
 */
async function alignAiDurabilityTargetWithGoal146(target) {
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
      "durability target not provisioned yet — skipping the Goal146 columns",
    );
    return;
  }
  try {
    const contactTable = await client.query(
      `SELECT to_regclass('"Contact"') AS present`,
    );
    if (!contactTable.rows[0].present) {
      console.log(
        "durability target has no Contact table yet — skipping the Goal146 columns",
      );
      return;
    }
    const applied = await applyMigrationFile(client, GOAL146_MIGRATION_SQL);
    if (applied !== true) {
      console.error(
        `goal074:human-takeover-migration-rehearsal FAILED — durability target columns failed applying ${GOAL146_MIGRATION_SQL}: ${applied}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `durability target aligned with the Goal146 Contact.lastScheduledCustomerId columns: ${database}_goal004`,
    );
  } finally {
    await client.end();
  }
}

export async function main() {
  const target = rehearsalTarget(process.env);

  await rehearse(target);
  await prepareAiDurabilityTarget(target);
  await alignAiDurabilityTargetWithGoal109(target);
  await alignAiDurabilityTargetWithGoal115(target);
  await alignAiDurabilityTargetWithGoal146(target);

  if (process.exitCode) {
    console.error(
      "goal074:human-takeover-migration-rehearsal FAILED — see the assertions above.",
    );
  } else {
    console.log(
      "goal074:human-takeover-migration-rehearsal PASSED — HumanTakeover is additive and backfill-free (a pre-existing " +
        "session stays with zero recorded takeovers), the foreign key rejects an orphan sessionId, deleting a session " +
        "cascade-deletes its takeovers, and the AI durability target is expanded for the persistence suite.",
    );
  }
}

if (isMain(import.meta.url)) await main();
