// Primeiro import de propósito: fixa as variáveis da autenticação interna
// antes de `config/env.ts` ser avaliado (ver o próprio arquivo).
import "../unit/support/test-env.js";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";

const { Client } = pg;

/**
 * Goal109, provas 1 e 3: a fonte da agenda passa a `AVENLY` sem quebrar dado.
 *
 * Prova 1 (migration, contra PostgreSQL real). Um banco descartável próprio,
 * no mesmo servidor de `SCHEDULING_TEST_DATABASE_URL`, recebe as migrations
 * ANTERIORES à do Goal109, aplicadas na ordem dos diretórios, e linhas com
 * `ATENDLY`. Só então a migration nova roda. As mesmas linhas passam a ler
 * `AVENLY` sem que `updatedAt` se mova, o rótulo antigo some de `pg_enum`, a
 * constraint muda de nome e continua recusando `MINHA_AGENDA`, e o histórico
 * de `MigrationJob` continua dizendo de onde para onde a importação foi.
 *
 * Prova 3 (rota HTTP, contra o banco de integração já migrado). A rota que
 * grava a fonte aceita `ATENDLY` e `AVENLY`, grava e devolve `AVENLY` nos dois
 * casos e recusa qualquer outro valor como antes.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const migrationsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prisma/migrations",
);
const GOAL109_MIGRATION = "20261003120000_goal109_avenly_calendar_source";
const OLD_CONSTRAINT = "CalendarSettings_source_atendly_check";
const NEW_CONSTRAINT = "CalendarSettings_source_avenly_check";
const CHECK_VIOLATION = "23514";

function migrationSql(directory: string): string {
  return readFileSync(path.join(migrationsRoot, directory, "migration.sql"), "utf8");
}

/** Diretórios de migration anteriores ao do Goal109, na ordem do Prisma. */
function previousMigrations(): string[] {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .filter((name) => name < GOAL109_MIGRATION);
}

/** Banco próprio da prova, derivado do alvo descartável já validado. */
function rehearsalUrls(base: string) {
  const url = new URL(base);
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!/(?:^|[_-])test(?:[_-]|$)/iu.test(database)) {
    throw new Error(`"${database}" is not recognised as a disposable database`);
  }
  const name = `${database}_goal109`;
  const target = new URL(base);
  target.pathname = `/${name}`;
  const maintenance = new URL(base);
  maintenance.pathname = "/postgres";
  return { name, target: target.toString(), maintenance: maintenance.toString() };
}

async function sqlStateOf(client: pg.Client, sql: string): Promise<string | null> {
  try {
    await client.query(sql);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "UNKNOWN";
  }
}

type SettingsRow = {
  tenantId: string;
  source: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

async function settingsRows(client: pg.Client): Promise<SettingsRow[]> {
  const result = await client.query<SettingsRow>(`
    SELECT "tenantId", "source"::text AS "source", "timezone",
           "createdAt"::text AS "createdAt", "updatedAt"::text AS "updatedAt"
      FROM "CalendarSettings"
     ORDER BY "tenantId"`);
  return result.rows;
}

async function enumLabels(client: pg.Client): Promise<string[]> {
  const result = await client.query<{ label: string }>(`
    SELECT e.enumlabel AS label
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'CalendarSource'
     ORDER BY e.enumsortorder`);
  return result.rows.map((row) => row.label);
}

async function constraintNames(client: pg.Client): Promise<string[]> {
  const result = await client.query<{ name: string }>(`
    SELECT conname AS name
      FROM pg_constraint
     WHERE conrelid = '"CalendarSettings"'::regclass
       AND contype = 'c'
     ORDER BY conname`);
  return result.rows.map((row) => row.name);
}

describeWithDatabase("goal109 migration renames ATENDLY to AVENLY (prova 1)", () => {
  const urls = connectionString ? rehearsalUrls(connectionString) : null;
  let client: pg.Client;

  async function recreate() {
    const maintenance = new Client({ connectionString: urls!.maintenance });
    await maintenance.connect();
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${urls!.name}" WITH (FORCE)`);
      await maintenance.query(`CREATE DATABASE "${urls!.name}"`);
    } finally {
      await maintenance.end();
    }
  }

  beforeAll(async () => {
    await recreate();
    client = new Client({ connectionString: urls!.target });
    await client.connect();
    for (const directory of previousMigrations()) {
      await client.query(migrationSql(directory));
    }
    // Estado de hoje: duas agendas na fonte única, uma importação antiga de
    // `MINHA_AGENDA` para a Agenda e uma em sentido contrário.
    await client.query(`
      INSERT INTO "CalendarSettings" ("tenantId", "source", "timezone", "createdAt", "updatedAt") VALUES
        ('goal109-tenant-a', 'ATENDLY', 'America/Sao_Paulo', TIMESTAMP '2026-01-10 08:00:00', TIMESTAMP '2026-02-11 09:30:00'),
        ('goal109-tenant-b', 'ATENDLY', 'Europe/Lisbon',     TIMESTAMP '2026-03-01 10:00:00', TIMESTAMP '2026-04-02 11:45:00')`);
    await client.query(`
      INSERT INTO "MigrationJob" ("id", "tenantId", "source", "target", "status", "requestedBy", "createdAt", "updatedAt") VALUES
        ('goal109-job-in',  'goal109-tenant-a', 'MINHA_AGENDA', 'ATENDLY',      'COMPLETED', 'legacy', TIMESTAMP '2026-08-01 10:00:00', TIMESTAMP '2026-08-01 10:05:00'),
        ('goal109-job-out', 'goal109-tenant-b', 'ATENDLY',      'MINHA_AGENDA', 'FAILED',    'legacy', TIMESTAMP '2026-08-03 10:00:00', TIMESTAMP '2026-08-03 10:02:00')`);
  });

  afterAll(async () => {
    await client?.end();
    const maintenance = new Client({ connectionString: urls!.maintenance });
    await maintenance.connect();
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${urls!.name}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  });

  it("starts from the state the previous migrations leave", async () => {
    expect(previousMigrations()).not.toContain(GOAL109_MIGRATION);
    expect(previousMigrations()).toContain(
      "20260919120000_goal027_calendar_source_atendly",
    );
    expect(await enumLabels(client)).toEqual(["ATENDLY", "MINHA_AGENDA"]);
    expect(await constraintNames(client)).toContain(OLD_CONSTRAINT);
    expect(await constraintNames(client)).not.toContain(NEW_CONSTRAINT);
  });

  it("renames the value and the constraint without rewriting a row", async () => {
    const before = await settingsRows(client);
    const jobsBefore = await client.query(
      `SELECT * FROM "MigrationJob" ORDER BY "id"`,
    );
    expect(before.map((row) => row.source)).toEqual(["ATENDLY", "ATENDLY"]);

    await client.query(migrationSql(GOAL109_MIGRATION));

    const after = await settingsRows(client);
    // As mesmas linhas, contadas antes e depois: só o rótulo lido mudou.
    expect(after).toHaveLength(before.length);
    expect(after).toEqual(
      before.map((row) => ({ ...row, source: "AVENLY" })),
    );

    expect(await enumLabels(client)).toEqual(["AVENLY", "MINHA_AGENDA"]);
    const constraints = await constraintNames(client);
    expect(constraints).toContain(NEW_CONSTRAINT);
    expect(constraints).not.toContain(OLD_CONSTRAINT);

    // Histórico de importação intacto, coluna a coluna, salvo o rótulo.
    const jobsAfter = await client.query(
      `SELECT * FROM "MigrationJob" ORDER BY "id"`,
    );
    expect(jobsAfter.rows).toEqual(
      jobsBefore.rows.map((row) => ({
        ...row,
        source: row.source === "ATENDLY" ? "AVENLY" : row.source,
        target: row.target === "ATENDLY" ? "AVENLY" : row.target,
      })),
    );
    const inbound = jobsAfter.rows.find((row) => row.id === "goal109-job-in");
    expect(inbound).toMatchObject({ source: "MINHA_AGENDA", target: "AVENLY" });
  });

  it("keeps refusing MINHA_AGENDA in CalendarSettings through the renamed constraint", async () => {
    const definition = await client.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint WHERE conname = $1`,
      [NEW_CONSTRAINT],
    );
    expect(definition.rows[0]?.definition).toContain("'AVENLY'");

    expect(
      await sqlStateOf(
        client,
        `UPDATE "CalendarSettings" SET "source" = 'MINHA_AGENDA' WHERE "tenantId" = 'goal109-tenant-a'`,
      ),
    ).toBe(CHECK_VIOLATION);
    expect(
      await sqlStateOf(
        client,
        `INSERT INTO "CalendarSettings" ("tenantId", "source", "timezone", "updatedAt")
         VALUES ('goal109-tenant-c', 'MINHA_AGENDA', 'America/Sao_Paulo', now())`,
      ),
    ).toBe(CHECK_VIOLATION);
    // O nome antigo deixou de ser um valor do tipo.
    expect(
      await sqlStateOf(
        client,
        `UPDATE "CalendarSettings" SET "source" = 'ATENDLY' WHERE "tenantId" = 'goal109-tenant-a'`,
      ),
    ).toBe("22P02");
  });

  it("is a no-op when applied again", async () => {
    const before = await settingsRows(client);
    await client.query(migrationSql(GOAL109_MIGRATION));
    expect(await settingsRows(client)).toEqual(before);
    expect(await enumLabels(client)).toEqual(["AVENLY", "MINHA_AGENDA"]);
    expect(await constraintNames(client)).toContain(NEW_CONSTRAINT);
  });
});

describeWithDatabase("PATCH /internal/calendar writes AVENLY (prova 3)", () => {
  const tenants = ["goal109-route-legacy", "goal109-route-new", "goal109-route-refused"];
  const bffToken = deriveInternalToken(
    TEST_INTERNAL_SERVICE_TOKEN,
    "bff",
    SERVICE_AUDIENCE,
    "command",
  );
  let prisma: PrismaClient;
  let app: FastifyInstance;

  function headers(tenantId: string) {
    return {
      authorization: `Bearer ${bffToken}`,
      "content-type": "application/json",
      "idempotency-key": `goal109-${tenantId}`,
      "x-tenant-id": tenantId,
      "x-user-id": "owner-1",
      "x-request-id": "req-goal109",
    };
  }

  async function patchCalendar(tenantId: string, source: unknown) {
    return app.inject({
      method: "PATCH",
      url: "/internal/calendar",
      headers: headers(tenantId),
      payload: JSON.stringify({ source, timezone: "America/Sao_Paulo" }),
    });
  }

  async function storedSource(tenantId: string) {
    const rows = await prisma.$queryRaw<{ source: string }[]>`
      SELECT "source"::text AS "source" FROM "CalendarSettings" WHERE "tenantId" = ${tenantId}`;
    return rows.map((row) => row.source);
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await prisma.calendarSettings.deleteMany({ where: { tenantId: { in: tenants } } });
    app = Fastify();
    await registerManagementRoutes(app, prisma);
    app.setErrorHandler((error, request, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: { code: error.code, message: error.message },
          requestId: request.id,
        });
      }
      return reply.code(500).send({
        error: { code: "INTERNAL_ERROR", message: (error as Error).message },
        requestId: request.id,
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.calendarSettings.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma?.$disconnect();
  });

  it("accepts the legacy ATENDLY, stores AVENLY and answers AVENLY", async () => {
    const response = await patchCalendar("goal109-route-legacy", "ATENDLY");

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.source).toBe("AVENLY");
    expect(await storedSource("goal109-route-legacy")).toEqual(["AVENLY"]);

    // Um BFF antigo repetindo o valor legado sobre a agenda já gravada não
    // é tratado como troca de fonte.
    const again = await patchCalendar("goal109-route-legacy", "ATENDLY");
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().data.source).toBe("AVENLY");
    expect(await storedSource("goal109-route-legacy")).toEqual(["AVENLY"]);
  });

  it("accepts AVENLY, stores AVENLY and answers AVENLY", async () => {
    const response = await patchCalendar("goal109-route-new", "AVENLY");

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.source).toBe("AVENLY");
    expect(await storedSource("goal109-route-new")).toEqual(["AVENLY"]);

    const read = await app.inject({
      method: "GET",
      url: "/internal/calendar",
      headers: headers("goal109-route-new"),
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json().data.source).toBe("AVENLY");
  });

  it("refuses any other value as before, without writing", async () => {
    for (const source of ["MINHA_AGENDA", "avenly", "OTHER", null]) {
      const response = await patchCalendar("goal109-route-refused", source);
      expect(response.statusCode, `${String(source)}: ${response.body}`).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    }
    expect(await storedSource("goal109-route-refused")).toEqual([]);
  });
});
