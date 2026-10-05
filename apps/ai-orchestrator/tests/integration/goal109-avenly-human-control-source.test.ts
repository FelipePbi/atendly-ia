import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { SessionService } from "../../src/modules/session/SessionService.js";

const { Client } = pg;

/**
 * Goal109, prova 2: `HumanControlSource` passa de `ATENDLY` a `AVENLY` sem
 * reescrever linha, contra PostgreSQL real.
 *
 * Um banco descartável próprio, no mesmo servidor de `AI_TEST_DATABASE_URL`,
 * recebe as migrations ANTERIORES à do Goal109, aplicadas na ordem dos
 * diretórios. Sessões com `WHATSAPP`, `ATENDLY` e `BACKFILL` e tomadas de
 * controle com `ATENDLY` e `WHATSAPP` são gravadas antes da migration nova.
 * Depois dela, o que dizia `ATENDLY` lê `AVENLY`, `WHATSAPP` e `BACKFILL` não
 * mudam, `updatedAt` não se move e o rótulo antigo some de `pg_enum`.
 *
 * O banco é próprio, e não o de durabilidade, porque a prova precisa partir
 * do estado anterior à migration. Sem `AI_TEST_DATABASE_URL` a suíte é
 * pulada, como as demais de integração.
 */
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const migrationsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prisma/migrations",
);
const GOAL109_MIGRATION = "20261003120000_goal109_avenly_human_control_source";
const GOAL115_MIGRATION = "20261004120000_goal115_session_category_override";

const TENANT = "tenant-goal109-human-control";
const CHANNEL = "channel-goal109-human-control";
const SOURCES = ["WHATSAPP", "ATENDLY", "BACKFILL"] as const;

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

async function dropDatabase(maintenanceUrl: string, name: string, recreate: boolean) {
  const maintenance = new Client({ connectionString: maintenanceUrl });
  await maintenance.connect();
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    if (recreate) await maintenance.query(`CREATE DATABASE "${name}"`);
  } finally {
    await maintenance.end();
  }
}

type SessionRow = {
  conversationId: string;
  humanHandlingSource: string;
  humanHandlingSince: string;
  updatedAt: string;
};

async function sessionRows(client: pg.Client): Promise<SessionRow[]> {
  const result = await client.query<SessionRow>(
    `SELECT "conversationId", "humanHandlingSource"::text AS "humanHandlingSource",
            "humanHandlingSince"::text AS "humanHandlingSince", "updatedAt"::text AS "updatedAt"
       FROM "ConversationSession"
      WHERE "tenantId" = $1
      ORDER BY "conversationId"`,
    [TENANT],
  );
  return result.rows;
}

async function takeoverSources(client: pg.Client): Promise<string[]> {
  const result = await client.query<{ source: string }>(
    `SELECT "source"::text AS "source" FROM "HumanTakeover"
      WHERE "tenantId" = $1 ORDER BY "id"`,
    [TENANT],
  );
  return result.rows.map((row) => row.source);
}

async function enumLabels(client: pg.Client): Promise<string[]> {
  const result = await client.query<{ label: string }>(`
    SELECT e.enumlabel AS label
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'HumanControlSource'
     ORDER BY e.enumsortorder`);
  return result.rows.map((row) => row.label);
}

describe.skipIf(!databaseUrl)(
  "goal109 migration renames HumanControlSource ATENDLY to AVENLY (prova 2)",
  () => {
    const urls = databaseUrl ? rehearsalUrls(databaseUrl) : null;
    let client: pg.Client;

    beforeAll(async () => {
      await dropDatabase(urls!.maintenance, urls!.name, true);
      client = new Client({ connectionString: urls!.target });
      await client.connect();
      for (const directory of previousMigrations()) {
        await client.query(migrationSql(directory));
      }
      // Coluna aditiva e alheia ao enum: o `SessionService` do semeio a lê.
      await client.query(migrationSql(GOAL115_MIGRATION));

      // Canal, conversa, contato e sessão pelo caminho do produto; nenhuma
      // dessas tabelas usa o enum, então o client atual escreve nelas.
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: urls!.target }),
      });
      try {
        await prisma.channelConnection.create({
          data: {
            id: CHANNEL,
            tenantId: TENANT,
            userId: `user-${TENANT}`,
            provider: "EVOLUTION_GO",
            externalInstanceId: `instance-${TENANT}`,
          },
        });
        const sessions = new SessionService(prisma, { inactivitySeconds: 60 });
        for (const [index, source] of SOURCES.entries()) {
          const conversationId = `conversation-goal109-${source.toLowerCase()}`;
          await prisma.conversation.create({
            data: {
              id: conversationId,
              tenantId: TENANT,
              channelId: CHANNEL,
              externalContactId: `55119000000${index}`,
              state: {},
            },
          });
          await sessions.resolveContext({
            tenantId: TENANT,
            channelId: CHANNEL,
            conversationId,
            externalContactId: `55119000000${index}`,
          });
        }
      } finally {
        await prisma.$disconnect();
      }

      // O valor de hoje só pode ser gravado por SQL: o client gerado já
      // conhece apenas `AVENLY`.
      for (const source of SOURCES) {
        await client.query(
          `UPDATE "ConversationSession"
              SET "humanHandling" = true,
                  "humanHandlingSource" = $1::"HumanControlSource",
                  "humanHandlingSince" = TIMESTAMP '2026-09-01 12:00:00',
                  "updatedAt" = TIMESTAMP '2026-09-01 12:00:00'
            WHERE "tenantId" = $2 AND "conversationId" = $3`,
          [source, TENANT, `conversation-goal109-${source.toLowerCase()}`],
        );
      }
      await client.query(
        `INSERT INTO "HumanTakeover" ("id", "tenantId", "sessionId", "conversationId", "source")
         SELECT 'takeover-goal109-' || lower("humanHandlingSource"::text), "tenantId", "id", "conversationId", "humanHandlingSource"
           FROM "ConversationSession"
          WHERE "tenantId" = $1 AND "humanHandlingSource" IN ('ATENDLY', 'WHATSAPP')`,
        [TENANT],
      );
    });

    afterAll(async () => {
      await client?.end();
      if (urls) await dropDatabase(urls.maintenance, urls.name, false);
    });

    it("starts from the state the previous migrations leave", async () => {
      expect(previousMigrations()).not.toContain(GOAL109_MIGRATION);
      expect(await enumLabels(client)).toEqual(["WHATSAPP", "ATENDLY", "BACKFILL"]);
      expect((await sessionRows(client)).map((row) => row.humanHandlingSource)).toEqual([
        "ATENDLY",
        "BACKFILL",
        "WHATSAPP",
      ]);
    });

    it("reads AVENLY where ATENDLY was, and leaves WHATSAPP and BACKFILL alone", async () => {
      const before = await sessionRows(client);
      const takeoversBefore = await takeoverSources(client);
      expect(takeoversBefore).toEqual(["ATENDLY", "WHATSAPP"]);

      await client.query(migrationSql(GOAL109_MIGRATION));

      const after = await sessionRows(client);
      expect(after).toHaveLength(before.length);
      expect(after).toEqual(
        before.map((row) => ({
          ...row,
          humanHandlingSource:
            row.humanHandlingSource === "ATENDLY" ? "AVENLY" : row.humanHandlingSource,
        })),
      );
      expect(after.map((row) => row.humanHandlingSource)).toEqual([
        "AVENLY",
        "BACKFILL",
        "WHATSAPP",
      ]);
      expect(await takeoverSources(client)).toEqual(["AVENLY", "WHATSAPP"]);
      expect(await enumLabels(client)).toEqual(["WHATSAPP", "AVENLY", "BACKFILL"]);
    });

    it("lets the current client read the renamed value and is a no-op when applied again", async () => {
      await client.query(migrationSql(GOAL109_MIGRATION));
      expect(await enumLabels(client)).toEqual(["WHATSAPP", "AVENLY", "BACKFILL"]);

      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: urls!.target }),
      });
      try {
        const sessions = await prisma.conversationSession.findMany({
          where: { tenantId: TENANT },
          orderBy: { conversationId: "asc" },
          select: { humanHandlingSource: true },
        });
        expect(sessions.map((row) => row.humanHandlingSource)).toEqual([
          "AVENLY",
          "BACKFILL",
          "WHATSAPP",
        ]);
      } finally {
        await prisma.$disconnect();
      }
    });
  },
);
