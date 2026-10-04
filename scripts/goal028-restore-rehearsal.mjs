#!/usr/bin/env node

// Ensaio de dump/restore do Goal028 (WU-02): dado real semeado em cadeia nos
// bancos que o ensaio de release (WU-01) acabou de migrar do zero, `pg_dump`
// em formato custom, `pg_restore` em banco NOVO e comparacao do banco de
// origem com o banco restaurado.
//
// O que nenhum ensaio anterior deste repositorio prova: que uma copia de
// seguranca deste produto volta. Os ensaios por Goal provam migration; o
// ensaio de release (WU-01) prova que o historico sobe do zero. Nenhum deles
// toca em `pg_dump`. Um plano de restore que nunca foi executado nao e um
// plano: e uma suposicao. Este ensaio executa o restore de verdade e confere,
// entre origem e destino:
//   (a) CONTAGEM POR TABELA — toda tabela base do schema `public` tem o mesmo
//       numero de linhas nos dois bancos, tabela a tabela. A lista de tabelas
//       sai do proprio banco, nunca de uma lista escrita a mao aqui;
//   (b) HISTORICO DE MIGRATIONS — `_prisma_migrations` chega identico linha a
//       linha (nome, checksum, `finished_at`, `rolled_back_at`, passos). Um
//       banco restaurado sem historico aceitaria `migrate deploy` de novo e
//       reaplicaria tudo por cima do dado restaurado;
//   (c) INDICES — nome e definicao de todo indice de `public`. Restore que
//       perde indice volta funcional e lento, e so a producao descobre;
//   (d) CONSTRAINTS NOMEADAS — tabela, nome, tipo e definicao de toda
//       constraint de `public`, incluindo as CHECK que o Prisma nao expressa
//       e as constraint triggers. E aqui que mora a prova negativa abaixo;
//   (e) ENUMS — todo tipo enum de `public` com seus rotulos, na ordem. Enum
//       que volta com um valor a menos quebra INSERT muito depois do restore.
//
// E prova a trava do Goal027 por TENTATIVA REAL contra o banco RESTAURADO,
// nao por leitura do dump: `CalendarSettings_source_avenly_check` (o nome que
// a cadeia completa deixa desde o Goal109) precisa
// existir no destino e precisa recusar `UPDATE ... SET "source" =
// 'MINHA_AGENDA'` com `check_violation` (SQLSTATE 23514), sobre uma linha
// semeada que existe de fato — um UPDATE que nao alcanca linha nenhuma nao
// prova constraint alguma.
//
// EXCLUSAO DECLARADA — Evolution Go. Os tres servicos ensaiados aqui sao BFF,
// IA e Scheduling, os mesmos do ensaio de release. O Evolution Go fica de
// fora de proposito: ele cria as proprias tabelas em codigo Go, no start do
// binario, e nao versiona historico de migrations nenhum. Nao ha
// `_prisma_migrations` para comparar nem arvore de migrations de onde ler a
// contagem esperada, entao um "ensaio de restore" dele compararia o banco com
// ele mesmo. Quando o transporte passar a versionar schema, entra aqui.
//
// Bancos de destino proprios (`<origem>_restore`), derivados do alvo ja
// validado e recriados do zero a cada execucao. Nenhuma credencial aparece na
// saida: a saida de `pg_dump`/`pg_restore` passa por `redactConnectionStrings`
// antes de qualquer impressao, e os rotulos carregam so host, porta e nome do
// banco. O relatorio e de contagem: linhas semeadas, linhas restauradas,
// constraints conferidas.
//
// Codigos de saida: 0 sucesso, 1 falha de assercao, 2 recusa (`pg_dump` ou
// `pg_restore` ausente do PATH, variavel de ambiente ausente, destino nao
// descartavel ou banco de origem inexistente). Nao existe caminho de skip:
// pular em silencio quando a ferramenta falta e exatamente o defeito que este
// Goal corrige.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isMain } from "./lib/gate.mjs";
import {
  ReleaseRehearsalError,
  migrationsFingerprint,
  readRequiredExtensions,
  redactConnectionStrings,
  resolveRehearsalPlan,
  serviceMigrations,
} from "./goal028-release-rehearsal.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const DISPOSABLE_NAME = /(?:^|[_-])test(?:[_-]|$)/iu;

const CONSTRAINT_NAME = "CalendarSettings_source_avenly_check";
const CHECK_VIOLATION = "23514";

export class RestoreRehearsalError extends Error {
  constructor(message) {
    super(message);
    this.name = "RestoreRehearsalError";
  }
}

/** Nome do banco de destino do restore, derivado do banco de origem. */
export function restoreDatabaseName(sourceDatabase) {
  return `${sourceDatabase}_restore`;
}

/**
 * Valida o alvo e monta o plano do ensaio, sem tocar em banco nem subprocesso.
 *
 * A origem e exatamente o banco que o ensaio de release deixou migrado, e a
 * allowlist de destino descartavel e a MESMA daquele ensaio: um unico lugar
 * decide o que este Goal pode derrubar e recriar.
 */
export function resolveRestorePlan(environment = process.env) {
  let releasePlan;
  try {
    releasePlan = resolveRehearsalPlan(environment);
  } catch (error) {
    if (error instanceof ReleaseRehearsalError) {
      throw new RestoreRehearsalError(error.message);
    }
    throw error;
  }

  const services = releasePlan.services.map((service) => {
    const database = restoreDatabaseName(service.database);
    // O nome derivado passa pela mesma allowlist: se o sufixo apagasse a marca
    // de descarte, o DROP seguinte seria cego.
    if (!DISPOSABLE_NAME.test(database)) {
      throw new RestoreRehearsalError(
        `Derived restore database "${database}" is not recognised as disposable.`,
      );
    }
    const target = new URL(service.url);
    target.pathname = `/${encodeURIComponent(database)}`;
    return {
      name: service.name,
      app: service.app,
      source: {
        database: service.database,
        url: service.url,
        label: service.label,
      },
      restore: {
        database,
        url: target.href,
        // Seguro para log: sem usuario, senha ou query string.
        label: `${releasePlan.host}:${releasePlan.port}/${database}`,
      },
    };
  });

  return {
    maintenance: releasePlan.maintenance,
    host: releasePlan.host,
    port: releasePlan.port,
    services,
  };
}

/**
 * Semente MINIMA e representativa por servico: a cadeia curta que um restore
 * precisa devolver inteira, nao o dominio todo. Cada passo declara a tabela
 * que toca, para que o relatorio conte linha por tabela sem lista paralela.
 *
 * As instrucoes de limpeza vem primeiro, em ordem inversa de dependencia: o
 * ensaio e repetivel sobre um banco que ja recebeu a semente antes, sem
 * depender de o ensaio de release ter acabado de recriar o banco.
 *
 * Todo identificador comeca por `goal028-`, todo dado e sintetico e nenhum
 * valor aqui e credencial: `passwordHash` e `csrfTokenHash` sao literais
 * marcados como sinteticos, jamais um hash real.
 */
export const SEEDS = Object.freeze({
  bff: Object.freeze({
    cleanup: [
      `DELETE FROM "TenantNotification" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "TenantMember" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "UserSession" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "Tenant" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "User" WHERE "id" LIKE 'goal028-%'`,
    ],
    inserts: [
      {
        table: "User",
        sql: `INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
              VALUES ('goal028-user', 'goal028@example.test', 'synthetic-not-a-real-hash', now(), now())`,
      },
      {
        table: "UserSession",
        sql: `INSERT INTO "UserSession" ("id", "userId", "csrfTokenHash", "createdAt", "expiresAt")
              VALUES ('goal028-session', 'goal028-user', 'synthetic-not-a-real-csrf-hash', now(), now() + interval '1 day')`,
      },
      {
        table: "Tenant",
        sql: `INSERT INTO "Tenant" ("id", "name", "createdAt", "updatedAt")
              VALUES ('goal028-tenant', 'Negocio do ensaio de restore', now(), now())`,
      },
      {
        table: "TenantMember",
        sql: `INSERT INTO "TenantMember" ("id", "tenantId", "userId", "role", "createdAt")
              VALUES ('goal028-member', 'goal028-tenant', 'goal028-user', 'OWNER', now())`,
      },
      {
        table: "TenantNotification",
        sql: `INSERT INTO "TenantNotification" ("id", "tenantId", "kind", "level", "shape", "dedupeKey", "occurredAt", "createdAt", "updatedAt")
              VALUES ('goal028-notification', 'goal028-tenant', 'AI_APPOINTMENT_CREATED', 'INFO', 'EVENT', 'goal028-dedupe', now(), now(), now())`,
      },
    ],
  }),
  ai: Object.freeze({
    cleanup: [
      `DELETE FROM "ProcessedEvent" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "Message" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "Conversation" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "ChannelConnection" WHERE "id" LIKE 'goal028-%'`,
    ],
    inserts: [
      {
        table: "ChannelConnection",
        sql: `INSERT INTO "ChannelConnection" ("id", "tenantId", "userId", "provider", "externalInstanceId", "createdAt", "updatedAt")
              VALUES ('goal028-channel', 'goal028-tenant', 'goal028-user', 'EVOLUTION_GO', 'goal028-instance', now(), now())`,
      },
      {
        table: "Conversation",
        sql: `INSERT INTO "Conversation" ("id", "tenantId", "channelId", "externalContactId", "createdAt", "updatedAt")
              VALUES ('goal028-conversation', 'goal028-tenant', 'goal028-channel', 'goal028-external-contact', now(), now())`,
      },
      {
        table: "Message",
        sql: `INSERT INTO "Message" ("id", "tenantId", "channelId", "conversationId", "direction", "role", "body", "createdAt")
              VALUES ('goal028-message', 'goal028-tenant', 'goal028-channel', 'goal028-conversation', 'INBOUND', 'user', 'mensagem sintetica do ensaio de restore', now())`,
      },
      {
        table: "ProcessedEvent",
        sql: `INSERT INTO "ProcessedEvent" ("id", "tenantId", "channelId", "provider", "eventKey", "messageId", "receivedAt")
              VALUES ('goal028-event', 'goal028-tenant', 'goal028-channel', 'EVOLUTION_GO', 'goal028-event-key', 'goal028-message', now())`,
      },
    ],
  }),
  scheduling: Object.freeze({
    cleanup: [
      `DELETE FROM "AppointmentItem" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "Appointment" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "Service" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "Customer" WHERE "id" LIKE 'goal028-%'`,
      `DELETE FROM "CalendarSettings" WHERE "tenantId" LIKE 'goal028-%'`,
    ],
    inserts: [
      {
        table: "CalendarSettings",
        sql: `INSERT INTO "CalendarSettings" ("tenantId", "source", "timezone", "createdAt", "updatedAt")
              VALUES ('goal028-tenant', 'AVENLY', 'America/Sao_Paulo', now(), now())`,
      },
      {
        table: "Customer",
        sql: `INSERT INTO "Customer" ("id", "tenantId", "name", "phone", "normalizedPhone", "createdAt", "updatedAt")
              VALUES ('goal028-customer', 'goal028-tenant', 'Cliente do ensaio', '+55 51 90000-0000', '5551900000000', now(), now())`,
      },
      {
        // `priceType = FIXED` exige `price` nao nulo pela constraint
        // `Service_price_check`, e `durationMinutes` nao nulo exige
        // `needsReview = false` por `Service_review_check`.
        table: "Service",
        sql: `INSERT INTO "Service" ("id", "tenantId", "name", "durationMinutes", "priceType", "price", "createdAt", "updatedAt")
              VALUES ('goal028-service', 'goal028-tenant', 'Servico do ensaio', 30, 'FIXED', 120.00, now(), now())`,
      },
      {
        table: "Appointment",
        sql: `INSERT INTO "Appointment" ("id", "tenantId", "customerId", "source", "startAt", "endAt", "status", "createdBy", "createdAt", "updatedAt")
              VALUES ('goal028-appointment', 'goal028-tenant', 'goal028-customer', 'USER', now(), now() + interval '30 minutes', 'CONFIRMED', 'goal028-user', now(), now())`,
      },
      {
        // O item entra na MESMA transacao do atendimento: a constraint trigger
        // `Appointment_title_required_without_items` e DEFERRABLE INITIALLY
        // DEFERRED e so e avaliada no commit.
        table: "AppointmentItem",
        sql: `INSERT INTO "AppointmentItem" ("id", "tenantId", "appointmentId", "serviceId", "serviceNameSnapshot", "durationMinutesSnapshot", "priceTypeSnapshot", "priceSnapshot", "createdAt")
              VALUES ('goal028-appointment-item', 'goal028-tenant', 'goal028-appointment', 'goal028-service', 'Servico do ensaio', 30, 'FIXED', 120.00, now())`,
      },
    ],
  }),
});

function refuse(message) {
  console.error(
    `goal028:restore-rehearsal REFUSED — ${redactConnectionStrings(message)}`,
  );
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) {
    console.error(
      `goal028:restore-rehearsal FAILED — ${redactConnectionStrings(message)}`,
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

function defaultProbe(tool) {
  return spawnSync(tool, ["--version"], { encoding: "utf8" });
}

/**
 * Exige `pg_dump` e `pg_restore` no PATH ANTES de qualquer conexao. Ausencia e
 * recusa com exit 2, nunca skip: um ensaio de restore que se pula a si mesmo
 * quando a ferramenta falta nao prova nada, e e essa a falha que este Goal
 * corrige.
 *
 * `probe` recebe o nome da ferramenta e devolve o resultado de execucao, para
 * que o caminho de recusa seja exercitavel sem desinstalar o PostgreSQL.
 */
export function assertDumpTools(probe = defaultProbe) {
  const versions = {};
  for (const tool of ["pg_dump", "pg_restore"]) {
    const outcome = probe(tool);
    if (outcome.error || outcome.status !== 0) {
      throw new RestoreRehearsalError(
        `${tool} is not available on PATH. This rehearsal executes a real dump and a real restore and refuses to run without it: ` +
          "skipping in silence would report a backup plan that was never exercised. " +
          "Install the PostgreSQL client tools (the same ones a production restore runbook uses) and run it again.",
      );
    }
    versions[tool] = String(outcome.stdout ?? "").trim();
  }
  return versions;
}

/**
 * Executa `pg_dump`/`pg_restore` sem shell: a URL de conexao nunca chega a um
 * interpretador de linha de comando, e a saida e redigida antes de voltar.
 */
function runTool(tool, args) {
  const outcome = spawnSync(tool, args, { encoding: "utf8" });
  if (outcome.error) {
    return { status: null, output: `failed to start: ${outcome.error.message}` };
  }
  return {
    status: outcome.status,
    output: redactConnectionStrings(
      `${outcome.stdout ?? ""}${outcome.stderr ?? ""}`,
    ).trim(),
  };
}

function loadClient() {
  const bffRequire = createRequire(
    path.join(repositoryRoot, "apps", "bff", "package.json"),
  );
  try {
    return bffRequire("pg").Client;
  } catch {
    throw new RestoreRehearsalError(
      "The PostgreSQL driver (pg) is not installed for apps/bff. Run `npm ci --prefix apps/bff` before this rehearsal.",
    );
  }
}

async function withClient(Client, url, run) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function databaseExists(Client, maintenanceUrl, database) {
  return withClient(Client, maintenanceUrl, async (client) => {
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database],
    );
    return result.rowCount === 1;
  });
}

async function recreateDatabase(Client, maintenanceUrl, database) {
  await withClient(Client, maintenanceUrl, async (client) => {
    // Identificador citado: o nome ja passou pela allowlist de descarte.
    const quoted = `"${database.replace(/"/gu, '""')}"`;
    await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoted}`);
    // Mesmo motivo do ensaio de release: producao roda em UTC e o cluster
    // descartavel herda o fuso da maquina.
    await client.query(`ALTER DATABASE ${quoted} SET TimeZone = 'UTC'`);
  });
}

/**
 * Semeia a cadeia minima do servico numa unica transacao e devolve quantas
 * linhas entraram por tabela. Transacao unica porque a constraint trigger do
 * atendimento sem item so e avaliada no commit.
 */
export async function seedService(client, seed) {
  const seeded = {};
  await client.query("BEGIN");
  try {
    for (const sql of seed.cleanup) await client.query(sql);
    for (const step of seed.inserts) {
      const result = await client.query(step.sql);
      seeded[step.table] = (seeded[step.table] ?? 0) + result.rowCount;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return seeded;
}

/**
 * Forma comparavel da definicao de uma constraint.
 *
 * `pg_dump` grava a definicao DEPARSADA pelo servidor e o restore a REANALISA.
 * O ida e volta e fiel ao significado, mas nao ao texto: a mesma
 * `CalendarSettings_offer_rules_check` sai da origem como
 * `((("granularityMinutes" >= 5) AND ("granularityMinutes" <= 120)) AND ...)`
 * e volta como `(("granularityMinutes" >= 5) AND ("granularityMinutes" <= 120)
 * AND ...)`, porque o parser achata um AND aninhado num AND n-ario. Comparar
 * o texto cru reprovaria um restore correto.
 *
 * O que sobra da normalizacao e a sequencia de tokens: coluna, operador,
 * literal e conectivo. Perder uma constraint, trocar de coluna, de operador ou
 * de valor continua sendo divergencia; so o reagrupamento de um AND com o
 * proprio AND deixa de ser — que e exatamente o que a reanalise faz.
 */
export function normalizeConstraintDefinition(definition) {
  return String(definition ?? "")
    .replace(/[()]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Retrato comparavel de um banco: contagem por tabela, historico de
 * migrations, indices, constraints nomeadas e enums do schema `public`. A
 * lista de tabelas sai do proprio banco — nenhuma lista escrita a mao aqui.
 */
export async function inventory(Client, url) {
  return withClient(Client, url, async (client) => {
    const tables = (
      await client.query(`
        SELECT "table_name"
        FROM information_schema.tables
        WHERE "table_schema" = 'public' AND "table_type" = 'BASE TABLE'
        ORDER BY "table_name"
      `)
    ).rows.map((row) => row.table_name);

    const counts = {};
    for (const table of tables) {
      const quoted = `"public"."${table.replace(/"/gu, '""')}"`;
      const result = await client.query(
        `SELECT COUNT(*)::int AS total FROM ${quoted}`,
      );
      counts[table] = result.rows[0].total;
    }

    const migrations = (
      await client.query(`
        SELECT "migration_name", "checksum",
               "finished_at"::text AS "finished_at",
               "rolled_back_at"::text AS "rolled_back_at",
               "applied_steps_count"
        FROM "_prisma_migrations"
        ORDER BY "migration_name"
      `)
    ).rows;

    const indexes = (
      await client.query(`
        SELECT "indexname", "indexdef"
        FROM pg_indexes
        WHERE "schemaname" = 'public'
        ORDER BY "indexname"
      `)
    ).rows.map((row) => `${row.indexname} :: ${row.indexdef}`);

    const constraints = (
      await client.query(`
        SELECT c."conrelid"::regclass::text AS "relation",
               c."conname" AS "name",
               c."contype" AS "type",
               pg_get_constraintdef(c."oid") AS "definition"
        FROM pg_constraint c
        JOIN pg_namespace n ON n."oid" = c."connamespace"
        WHERE n."nspname" = 'public'
        ORDER BY 1, 2, 3, 4
      `)
    ).rows.map(
      (row) =>
        `${row.relation} :: ${row.name} :: ${row.type} :: ${normalizeConstraintDefinition(row.definition)}`,
    );

    const enums = (
      await client.query(`
        SELECT t."typname" AS "type", e."enumlabel" AS "label"
        FROM pg_type t
        JOIN pg_enum e ON e."enumtypid" = t."oid"
        JOIN pg_namespace n ON n."oid" = t."typnamespace"
        WHERE n."nspname" = 'public'
        ORDER BY t."typname", e."enumsortorder"
      `)
    ).rows.map((row) => `${row.type} :: ${row.label}`);

    return { tables, counts, migrations, indexes, constraints, enums };
  });
}

/**
 * Confronta origem e destino. Devolve a lista de divergencias; vazia significa
 * que o restore devolveu o banco. Funcao pura: e ela, e nao a conexao, que
 * decide o veredito.
 */
export function compareInventories(source, restored) {
  const problems = [];

  const tables = [...new Set([...source.tables, ...restored.tables])].sort();
  for (const table of tables) {
    const before = source.counts[table];
    const after = restored.counts[table];
    if (before === undefined) {
      problems.push(`table "${table}" exists only in the restored database`);
      continue;
    }
    if (after === undefined) {
      problems.push(`table "${table}" is missing from the restored database`);
      continue;
    }
    if (before !== after) {
      problems.push(
        `table "${table}" holds ${before} row(s) at the source and ${after} after the restore`,
      );
    }
  }

  const sourceHistory = migrationsFingerprint(source.migrations);
  const restoredHistory = migrationsFingerprint(restored.migrations);
  if (JSON.stringify(sourceHistory) !== JSON.stringify(restoredHistory)) {
    problems.push(
      `_prisma_migrations did not survive the restore intact: ${sourceHistory.length} row(s) at the source, ${restoredHistory.length} after the restore`,
    );
  }

  for (const [kind, key] of [
    ["index(es)", "indexes"],
    ["named constraint(s)", "constraints"],
    ["enum value(s)", "enums"],
  ]) {
    const before = new Set(source[key]);
    const after = new Set(restored[key]);
    const lost = [...before].filter((item) => !after.has(item));
    const extra = [...after].filter((item) => !before.has(item));
    if (lost.length > 0) {
      problems.push(`${kind} lost in the restore: ${lost.join(" | ")}`);
    }
    if (extra.length > 0) {
      problems.push(
        `${kind} present only in the restored database: ${extra.join(" | ")}`,
      );
    }
  }

  return problems;
}

/**
 * Executa um comando que DEVE ser recusado pelo banco e devolve o SQLSTATE,
 * junto do numero de linhas que ele teria alcancado se tivesse passado. A
 * transacao e sempre desfeita: o ensaio nao deixa residuo do que tentou.
 */
export async function refusedSqlState(client, sql) {
  await client.query("BEGIN");
  try {
    const result = await client.query(sql);
    await client.query("ROLLBACK");
    return { state: null, rowCount: result.rowCount };
  } catch (error) {
    await client.query("ROLLBACK");
    return { state: error.code ?? null, rowCount: null };
  }
}

async function constraintExists(client, name) {
  const result = await client.query(
    "SELECT 1 FROM pg_constraint WHERE conname = $1",
    [name],
  );
  return result.rowCount === 1;
}

/**
 * Prova negativa da trava do Goal027 contra o banco RESTAURADO.
 *
 * A linha semeada precisa estar la: um `UPDATE` que nao alcanca linha nenhuma
 * passa sem erro em qualquer banco e nao provaria constraint nenhuma.
 */
async function proveCalendarLockSurvived(Client, service) {
  return withClient(Client, service.restore.url, async (client) => {
    if (
      !assert(
        await constraintExists(client, CONSTRAINT_NAME),
        `${CONSTRAINT_NAME} does not exist in the restored database — the Goal027 lock did not survive pg_restore`,
      )
    ) {
      return;
    }

    const seededRows = (
      await client.query(
        `SELECT COUNT(*)::int AS total FROM "CalendarSettings" WHERE "tenantId" = 'goal028-tenant'`,
      )
    ).rows[0].total;
    if (
      !assert(
        seededRows === 1,
        `the restored database must carry the seeded CalendarSettings row, found ${seededRows}: an UPDATE that reaches no row proves nothing`,
      )
    ) {
      return;
    }

    const refused = await refusedSqlState(
      client,
      `UPDATE "CalendarSettings" SET "source" = 'MINHA_AGENDA' WHERE "tenantId" = 'goal028-tenant'`,
    );
    if (
      assert(
        refused.state === CHECK_VIOLATION,
        `the restored database must REFUSE source = MINHA_AGENDA with ${CHECK_VIOLATION} (check_violation), got ${refused.state ?? `an accepted UPDATE over ${refused.rowCount} row(s)`}`,
      )
    ) {
      console.log(
        `goal028:restore-rehearsal ${service.name}: ${CONSTRAINT_NAME} survived the restore and refused MINHA_AGENDA with SQLSTATE ${CHECK_VIOLATION}`,
      );
    }
  });
}

export async function rehearseService(Client, plan, service, dumpDirectory) {
  console.log(
    `\ngoal028:restore-rehearsal ${service.name}: ${service.source.label} -> ${service.restore.label}`,
  );

  if (
    !(await databaseExists(Client, plan.maintenance, service.source.database))
  ) {
    throw new RestoreRehearsalError(
      `The source database "${service.source.database}" does not exist. This rehearsal dumps the databases the Goal028 release rehearsal leaves migrated: ` +
        "run `node scripts/goal028-release-rehearsal.mjs` first, or run validate:integration, which runs both in order.",
    );
  }

  // ---- Semente em cadeia: dado real, sintetico, no banco de origem.
  const seeded = await withClient(Client, service.source.url, (client) =>
    seedService(client, SEEDS[service.name]),
  );
  const seededRows = Object.values(seeded).reduce((total, n) => total + n, 0);
  console.log(
    `goal028:restore-rehearsal ${service.name}: seeded ${seededRows} row(s) — ` +
      Object.entries(seeded)
        .map(([table, rows]) => `${table} ${rows}`)
        .join(", "),
  );
  if (
    !assert(seededRows > 0, `${service.name}: the seed inserted no row at all`)
  ) {
    return;
  }

  const source = await inventory(Client, service.source.url);

  // ---- Destino novo. A extensao que o historico exige e criada antes: e o
  //      que um runbook de restore faz, e e o unico passo do restore que uma
  //      migration nunca conseguiria executar por conta propria.
  await recreateDatabase(Client, plan.maintenance, service.restore.database);
  const { migrationsPath, directories } = serviceMigrations({
    app: service.app,
  });
  const extensions = readRequiredExtensions(migrationsPath, directories);
  if (extensions.length > 0) {
    await withClient(Client, service.restore.url, async (client) => {
      for (const extension of extensions) {
        await client.query(
          `CREATE EXTENSION IF NOT EXISTS "${extension.replace(/"/gu, '""')}"`,
        );
      }
    });
    console.log(
      `goal028:restore-rehearsal ${service.name}: prepared the restore target with extension(s) ${extensions.join(", ")}`,
    );
  }

  // ---- Dump em formato custom: o formato que o restore seletivo usa, nao um
  //      SQL plano que so pode voltar inteiro.
  const dumpFile = path.join(dumpDirectory, `${service.name}.dump`);
  const dump = runTool("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    `--file=${dumpFile}`,
    service.source.url,
  ]);
  if (
    !assert(
      dump.status === 0,
      `${service.name}: pg_dump must produce a custom-format dump of the migrated database, exit ${dump.status}\n${dump.output}`,
    )
  ) {
    return;
  }

  // `--exit-on-error` porque restore que ignora erro e reporta sucesso e a
  // mesma mentira que o skip silencioso.
  const restore = runTool("pg_restore", [
    "--exit-on-error",
    "--no-owner",
    "--no-privileges",
    `--dbname=${service.restore.url}`,
    dumpFile,
  ]);
  if (
    !assert(
      restore.status === 0,
      `${service.name}: pg_restore must restore the dump into an empty database without a single ignored error, exit ${restore.status}\n${restore.output}`,
    )
  ) {
    return;
  }

  const restored = await inventory(Client, service.restore.url);
  const restoredRows = Object.values(restored.counts).reduce(
    (total, n) => total + n,
    0,
  );
  console.log(
    `goal028:restore-rehearsal ${service.name}: restored ${restoredRows} row(s) across ${restored.tables.length} table(s), ` +
      `${restored.migrations.length} migration(s) in _prisma_migrations, ${restored.indexes.length} index(es), ` +
      `${restored.constraints.length} named constraint(s) checked, ${restored.enums.length} enum value(s)`,
  );

  const problems = compareInventories(source, restored);
  if (
    !assert(
      problems.length === 0,
      `${service.name}: the restored database does not match the source — ${problems.join("; ")}`,
    )
  ) {
    return;
  }

  if (service.name === "scheduling") {
    await proveCalendarLockSurvived(Client, service);
  }
}

export async function rehearse(plan, dumpDirectory) {
  const Client = loadClient();
  for (const service of plan.services) {
    await rehearseService(Client, plan, service, dumpDirectory);
    // A primeira falha interrompe: os servicos seguintes ficam sem executar em
    // vez de somar ruido a um ensaio ja reprovado.
    if (process.exitCode) return;
  }
}

export async function main() {
  let plan;
  let versions;
  try {
    versions = assertDumpTools();
    plan = resolveRestorePlan();
  } catch (error) {
    if (error instanceof RestoreRehearsalError) refuse(error.message);
    throw error;
  }

  console.log(
    `goal028:restore-rehearsal target server: ${plan.host}:${plan.port} ` +
      `(${versions.pg_dump}, ${versions.pg_restore}; one disposable restore database per service; Evolution Go excluded, see the header)`,
  );

  const dumpDirectory = mkdtempSync(path.join(tmpdir(), "goal028-restore-"));
  try {
    await rehearse(plan, dumpDirectory);
  } catch (error) {
    if (error instanceof RestoreRehearsalError) refuse(error.message);
    console.error(
      `goal028:restore-rehearsal FAILED — ${redactConnectionStrings(error.stack ?? error.message)}`,
    );
    process.exitCode = 1;
  } finally {
    rmSync(dumpDirectory, { recursive: true, force: true });
  }

  if (process.exitCode) {
    console.error(
      "goal028:restore-rehearsal FAILED — see the assertions above.",
    );
  } else {
    console.log(
      "\ngoal028:restore-rehearsal PASSED — for the BFF, the AI orchestrator and the Scheduling service, a chain of seeded rows " +
        "survives pg_dump in custom format and pg_restore into a brand new database: every base table of schema public holds the " +
        "same number of rows on both sides, _prisma_migrations comes back row by row, and no index, named constraint or enum value " +
        "is lost or invented. In the restored Scheduling database, CalendarSettings_source_avenly_check still refuses " +
        "MINHA_AGENDA with SQLSTATE 23514 over a row that really exists.",
    );
  }
}

if (isMain(import.meta.url)) await main();
