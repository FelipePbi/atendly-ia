/**
 * Leitura da grade de bloqueios (Goal016): `listTimeBlocks` e
 * `GET /internal/time-blocks`.
 *
 * O contrato novo do Goal016 e o unico da agenda que nasceu so de leitura, e
 * e por isso que ele precisa de prova propria: as garantias dele nao vem de
 * `runCalendarWrite` nem de `lockCalendarDays`, e sim de tres decisoes que
 * so este modulo toma.
 *
 * - **Escopo por tenant.** A consulta nao tem chave unica composta que a
 *   proteja; se o `tenantId` sumir do `where`, ela devolve a agenda de
 *   outro negocio e nada mais falha.
 * - **Predicado de sobreposicao** (`startAt < rangeEnd && endAt > rangeStart`),
 *   e nao "comeca dentro da janela": bloqueio que comecou antes da janela e
 *   ainda ocupa tempo dentro dela e ocupacao real, e a grade que o omitisse
 *   ofereceria horario ocupado como livre. O toque exato nas bordas
 *   (`endAt == rangeStart`, `startAt == rangeEnd`) nao e sobreposicao.
 * - **Janela local com `endDate` inclusivo.** A rota recebe datas do negocio,
 *   nao instantes: `endDate` cobre o dia inteiro (+24h no fuso do tenant),
 *   entao pedir 14 a 14 de setembro devolve o dia 14 inteiro.
 *
 * A rota acrescenta o que so ela decide: `requireCalendar` (ler a grade de
 * um tenant sem `CalendarSettings` e `404`, nunca lista vazia) e a janela
 * obrigatoria — sem ela a rota seria uma varredura sem limite do tenant.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { listTimeBlocks } from "../../src/modules/calendar/time-blocks.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

type Database = ReturnType<typeof createDatabaseDouble>;

const tenantId = "tenant-a";
const otherTenantId = "tenant-b";
// UTC-3 sem horario de verao: 00:00 local do dia 14 e 03:00Z do dia 14.
const timeZone = "America/Sao_Paulo";
const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

function headers(extra: Partial<{ tenantId: string }> = {}) {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": extra.tenantId ?? tenantId,
    "x-user-id": "professional-1",
    "x-request-id": "req-1",
  };
}

async function buildTestApp(client: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify();
  await registerManagementRoutes(app, client);
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
  return app;
}

function seedCalendar(database: Database, scope: string) {
  database.client.calendarSettings.rows.push({
    id: `settings-${scope}`,
    tenantId: scope,
    source: "ATENDLY",
    timezone: timeZone,
  } as never);
}

let sequence = 0;

function seedBlock(
  database: Database,
  input: {
    endAt: string;
    kind?: "BLOCK" | "PERSONAL";
    startAt: string;
    tenantId?: string;
    title?: string | null;
  },
) {
  sequence += 1;
  const id = `block-${sequence}`;
  database.client.timeBlock.rows.push({
    id,
    tenantId: input.tenantId ?? tenantId,
    startAt: new Date(input.startAt),
    endAt: new Date(input.endAt),
    reason: null,
    kind: input.kind ?? "BLOCK",
    title: input.title ?? null,
    seriesId: null,
    occurrenceDate: null,
  } as never);
  return id;
}

let database: Database;

beforeEach(() => {
  sequence = 0;
  database = createDatabaseDouble();
});

describe("listTimeBlocks", () => {
  it("devolve so os blocos do tenant pedido", async () => {
    const mine = seedBlock(database, {
      endAt: "2026-09-14T16:00:00.000Z",
      startAt: "2026-09-14T15:00:00.000Z",
    });
    seedBlock(database, {
      endAt: "2026-09-14T16:00:00.000Z",
      startAt: "2026-09-14T15:00:00.000Z",
      tenantId: otherTenantId,
    });

    const blocks = await listTimeBlocks(database.client as never, {
      endDate: "2026-09-14",
      startDate: "2026-09-14",
      tenantId,
      timeZone,
    });

    expect(blocks.map((block) => block.id)).toEqual([mine]);
  });

  it("inclui o bloco que comecou antes da janela e ainda a ocupa", async () => {
    const straddling = seedBlock(database, {
      // 13/09 23:00 local ate 14/09 01:00 local.
      endAt: "2026-09-14T04:00:00.000Z",
      startAt: "2026-09-14T02:00:00.000Z",
    });

    const blocks = await listTimeBlocks(database.client as never, {
      endDate: "2026-09-14",
      startDate: "2026-09-14",
      tenantId,
      timeZone,
    });

    expect(blocks.map((block) => block.id)).toEqual([straddling]);
  });

  it("nao inclui o bloco que apenas encosta na borda da janela", async () => {
    // Termina exatamente em 14/09 00:00 local (03:00Z): nao sobrepoe.
    seedBlock(database, {
      endAt: "2026-09-14T03:00:00.000Z",
      startAt: "2026-09-14T02:00:00.000Z",
    });
    // Comeca exatamente em 15/09 00:00 local (03:00Z), o fim da janela.
    seedBlock(database, {
      endAt: "2026-09-15T04:00:00.000Z",
      startAt: "2026-09-15T03:00:00.000Z",
    });

    const blocks = await listTimeBlocks(database.client as never, {
      endDate: "2026-09-14",
      startDate: "2026-09-14",
      tenantId,
      timeZone,
    });

    expect(blocks).toEqual([]);
  });

  it("cobre o dia inteiro do endDate: a janela e inclusiva nas duas pontas", async () => {
    const firstMorning = seedBlock(database, {
      // 14/09 08:00-09:00 local.
      endAt: "2026-09-14T12:00:00.000Z",
      startAt: "2026-09-14T11:00:00.000Z",
    });
    const lastEvening = seedBlock(database, {
      // 16/09 22:00-23:00 local: ultimo dia da janela, quase na virada.
      endAt: "2026-09-17T02:00:00.000Z",
      startAt: "2026-09-17T01:00:00.000Z",
    });
    // 17/09 00:30 local: primeiro dia fora.
    seedBlock(database, {
      endAt: "2026-09-17T04:00:00.000Z",
      startAt: "2026-09-17T03:30:00.000Z",
    });

    const blocks = await listTimeBlocks(database.client as never, {
      endDate: "2026-09-16",
      startDate: "2026-09-14",
      tenantId,
      timeZone,
    });

    expect(blocks.map((block) => block.id)).toEqual([firstMorning, lastEvening]);
  });

  it("devolve em ordem cronologica, como a grade desenha", async () => {
    const later = seedBlock(database, {
      endAt: "2026-09-14T19:00:00.000Z",
      startAt: "2026-09-14T18:00:00.000Z",
    });
    const earlier = seedBlock(database, {
      endAt: "2026-09-14T13:00:00.000Z",
      startAt: "2026-09-14T12:00:00.000Z",
    });

    const blocks = await listTimeBlocks(database.client as never, {
      endDate: "2026-09-14",
      startDate: "2026-09-14",
      tenantId,
      timeZone,
    });

    expect(blocks.map((block) => block.id)).toEqual([earlier, later]);
  });
});

describe("GET /internal/time-blocks", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("devolve a janela pedida do tenant do chamador, com kind e title", async () => {
    seedCalendar(database, tenantId);
    seedBlock(database, {
      endAt: "2026-09-14T16:00:00.000Z",
      kind: "PERSONAL",
      startAt: "2026-09-14T15:00:00.000Z",
      title: "Dentista",
    });
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "GET",
      url: "/internal/time-blocks?startDate=2026-09-14&endDate=2026-09-14",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      {
        endAt: "2026-09-14T16:00:00.000Z",
        id: "block-1",
        kind: "PERSONAL",
        reason: null,
        seriesId: null,
        startAt: "2026-09-14T15:00:00.000Z",
        title: "Dentista",
      },
    ]);
  });

  it("nao vaza bloco de outro tenant", async () => {
    seedCalendar(database, tenantId);
    seedBlock(database, {
      endAt: "2026-09-14T16:00:00.000Z",
      startAt: "2026-09-14T15:00:00.000Z",
      tenantId: otherTenantId,
    });
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "GET",
      url: "/internal/time-blocks?startDate=2026-09-14&endDate=2026-09-14",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
  });

  // Retirada da fonte externa (Goal027): o guard desta rota deixou de olhar a
  // fonte, mas nao deixou de exigir calendario configurado. Sem esta prova, a
  // simplificacao poderia ter trocado o `404` por um `200` com lista vazia.
  it("recusa a leitura quando o tenant nao tem calendario configurado", async () => {
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "GET",
      url: "/internal/time-blocks?startDate=2026-09-14&endDate=2026-09-14",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("CALENDAR_SETTINGS_NOT_FOUND");
  });

  it("recusa a leitura sem janela: a rota nunca varre o tenant inteiro", async () => {
    seedCalendar(database, tenantId);
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "GET",
      url: "/internal/time-blocks",
    });

    expect(response.statusCode).toBe(400);
  });

  it("exige autenticacao interna", async () => {
    seedCalendar(database, tenantId);
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: { "x-tenant-id": tenantId, "x-user-id": "professional-1" },
      method: "GET",
      url: "/internal/time-blocks?startDate=2026-09-14&endDate=2026-09-14",
    });

    expect(response.statusCode).toBe(401);
  });
});
