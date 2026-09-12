import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { AtendlyCalendarProvider } from "../../src/modules/integrations/atendly/provider.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import {
  acquireImportLease,
  renewImportLease,
  resumeImportSessions,
} from "../../src/modules/migrations/import-lease.js";
import { ImportPreviewService } from "../../src/modules/migrations/import-preview-service.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal010 WU-12 contra PostgreSQL real: o que só o banco prova da importação
 * única.
 *
 * O comportamento de preview, motor, lease e conclusão já tem cobertura de
 * unidade sobre o dublê (`tests/unit/import-*.test.ts`). Esta suíte não
 * repete nada disso. Ela cobre exatamente o que um dublê em memória **não**
 * pode provar:
 *
 * - isolamento por negócio apoiado nas chaves compostas por `tenantId`, com
 *   linhas de dois tenants vivas ao mesmo tempo no mesmo banco;
 * - concorrência real entre **duas conexões** — dois starts simultâneos, duas
 *   instâncias disputando o lease, conclusão única recusada pelo índice
 *   parcial;
 * - o relógio do **banco** decidindo a expiração do lease, com fixture de
 *   vencimento em SQL e sem `sleep` (relógio de processo nunca decide nada
 *   aqui);
 * - retomada de um lote interrompido a partir dos checkpoints que os commits
 *   de item deixaram gravados;
 * - a política única de escrita do Goal008 serializando a importação contra
 *   uma confirmação concorrente no mesmo horário.
 *
 * É o mesmo recorte que os Goals 008 e 009 usaram. O caso cru de SQL da
 * conclusão única fica em `goal010-import-completion.test.ts` (WU-06); aqui a
 * conclusão é disputada depois de uma importação de verdade.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal010-wu12-tenant-a";
const tenantB = "goal010-wu12-tenant-b";
const timeZone = "America/Sao_Paulo";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-10",
};
/** `2026-10-01 09:00` em `America/Sao_Paulo`: o horário disputado. */
const contestedStartAt = new Date("2026-10-01T12:00:00.000Z");

let prisma: PrismaClient;
let other: PrismaClient;
/**
 * Terceira conexão, usada só para segurar o lock de dia da agenda e assim
 * enfileirar duas escritas concorrentes em ordem conhecida. Ela nunca
 * escreve em tabela nenhuma.
 */
let blocker: PrismaClient;

// ---------------------------------------------------------------------------
// Origem: a mesma forma que o leitor do Minha Agenda entrega ao preview.
// ---------------------------------------------------------------------------

interface SourceRecord {
  externalId: string;
  raw: unknown;
}

function category(name: string, records: SourceRecord[] = []) {
  return {
    category: name,
    coverage: {
      sourceSupported: true,
      sourceReportedCount: null,
      readCount: records.length,
      limitationCode: null,
      limitationDetail: null,
    },
    records,
  };
}

type CategoryKey =
  | "services"
  | "customers"
  | "availability"
  | "timeBlocks"
  | "futureAppointments"
  | "pastAppointments"
  | "cancelledAppointments"
  | "noShowAppointments";

function buildSnapshot(
  overrides: Partial<Record<CategoryKey, ReturnType<typeof category>>> = {},
) {
  return {
    generatedAt: "2026-09-10T12:00:00.000Z",
    services: overrides.services ?? category("SERVICE"),
    customers: overrides.customers ?? category("CUSTOMER"),
    availability: overrides.availability ?? category("AVAILABILITY"),
    timeBlocks: overrides.timeBlocks ?? category("TIME_BLOCK"),
    futureAppointments:
      overrides.futureAppointments ?? category("FUTURE_APPOINTMENT"),
    pastAppointments:
      overrides.pastAppointments ?? category("PAST_APPOINTMENT"),
    cancelledAppointments:
      overrides.cancelledAppointments ?? category("CANCELLED_APPOINTMENT"),
    noShowAppointments:
      overrides.noShowAppointments ?? category("NO_SHOW_APPOINTMENT"),
  } as never;
}

/** Leitor de origem determinístico: a suíte prova banco, não HTTP. */
class FixtureReader {
  constructor(private readonly snapshot: ReturnType<typeof buildSnapshot>) {}
  async getImportSnapshot() {
    return this.snapshot as never;
  }
}

function sourceService(
  overrides: Partial<{
    id: number;
    name: string;
    duration: number;
    price: unknown;
  }> = {},
) {
  return {
    id: overrides.id ?? 900,
    name: overrides.name ?? "Corte",
    duration: overrides.duration ?? 60,
    price: overrides.price === undefined ? 80 : overrides.price,
    colorId: null,
    deleted: false,
  };
}

function sourceCustomer(
  overrides: Partial<{ id: number; name: string; phone1: string | null }> = {},
) {
  return {
    id: overrides.id ?? 500,
    name: overrides.name ?? "Ana Souza",
    phone1: overrides.phone1 === undefined ? "5511999990000" : overrides.phone1,
    phone2: null,
  };
}

function sourceAppointment(
  overrides: Partial<{
    id: number;
    date: string;
    startTime: string;
    endTime: string;
    customerId: number;
    serviceId: number;
  }> = {},
) {
  const customerId = overrides.customerId ?? 500;
  const serviceId = overrides.serviceId ?? 900;
  return {
    id: overrides.id ?? 100,
    userId: 7,
    date: overrides.date ?? "2026-10-01",
    startTime: overrides.startTime ?? "09:00",
    endTime: overrides.endTime ?? "10:00",
    duration: 60,
    customerId,
    customer: sourceCustomer({ id: customerId }),
    serviceId,
    service: sourceService({ id: serviceId }),
    price: 80,
    comments: null,
    deleted: false,
  };
}

/** Origem de um negócio pequeno: um serviço, um cliente, um agendamento. */
function fullSnapshot() {
  return buildSnapshot({
    services: category("SERVICE", [
      { externalId: "900", raw: sourceService() },
    ]),
    customers: category("CUSTOMER", [
      { externalId: "500", raw: sourceCustomer() },
    ]),
    futureAppointments: category("FUTURE_APPOINTMENT", [
      { externalId: "100", raw: sourceAppointment() },
    ]),
  });
}

// ---------------------------------------------------------------------------
// Fixture de banco.
// ---------------------------------------------------------------------------

async function seedTenant(tenantId: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "MINHA_AGENDA", timezone: timeZone },
    update: { source: "MINHA_AGENDA", timezone: timeZone },
  });
  // Jornada larga: a importação não revalida disponibilidade, mas a
  // confirmação concorrente do caso da política única revalida — ela precisa
  // de horário ofertável para que a disputa seja pelo horário, e não pela
  // ausência de jornada.
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await prisma.availabilityRule.create({
      data: {
        tenantId,
        dayOfWeek,
        startTime: new Date("1970-01-01T00:00:00.000Z"),
        endTime: new Date("1970-01-01T23:00:00.000Z"),
        active: true,
      },
    });
  }
}

function startSession(tenantId: string, client: PrismaClient = prisma) {
  return new ImportCompletionService(client).startSession({
    tenantId,
    userId: "user-1",
    sourceAccountId: "account-1",
    sourceAccountLabel: "Salao da Ana",
  });
}

/** Abre a sessão e roda o preview: é como o produto chega a "Importar tudo". */
async function analyzed(
  tenantId: string,
  snapshot: ReturnType<typeof buildSnapshot>,
) {
  const session = await startSession(tenantId);
  const reader = new FixtureReader(snapshot);
  const preview = await new ImportPreviewService(prisma).analyze(
    { tenantId, sessionId: session.sessionId },
    reader,
    snapshotInput,
  );
  return { sessionId: session.sessionId, reader, preview };
}

/** Contagem por status relida do banco — nunca acumulada pelo teste. */
async function tallyItems(tenantId: string, sessionId: string) {
  const rows = await prisma.importItem.findMany({
    where: { tenantId, sessionId },
  });
  return {
    pending: rows.filter((row) => row.status === "PENDING").length,
    imported: rows.filter((row) => row.status === "IMPORTED").length,
    skipped: rows.filter((row) => row.status === "SKIPPED").length,
    failed: rows.filter((row) => row.status === "FAILED").length,
    needsReview: rows.filter((row) => row.status === "NEEDS_REVIEW").length,
  };
}

function errorCodeOf(entry: PromiseSettledResult<unknown>): string | null {
  if (entry.status !== "rejected") return null;
  const reason = entry.reason as { code?: string };
  return reason?.code ?? String(entry.reason);
}

/**
 * Vence o lease pelo relógio do **banco**, sem `sleep`: os instantes são
 * `now() - intervalo` calculados pelo servidor. Um `Date` do processo aqui
 * seria justamente o relógio que o lease se recusa a usar.
 *
 * A aquisição recua junto com a expiração porque `ImportSession_lease_check`
 * exige `leaseExpiresAt > leaseAcquiredAt`: um lease vencido é um lease que
 * foi tomado no passado, não um lease incoerente.
 */
function expireLeaseInDatabase(tenantId: string, sessionId: string) {
  return prisma.$executeRaw`
    UPDATE "ImportSession"
       SET "leaseAcquiredAt" = now() - interval '2 minutes',
           "leaseExpiresAt" = now() - interval '1 minute',
           "leaseHeartbeatAt" = now() - interval '2 minutes'
     WHERE "tenantId" = ${tenantId}
       AND "id" = ${sessionId}
  `;
}

/** UPDATE cru de conclusão: nenhuma linha de aplicação no caminho. */
function rawComplete(
  client: PrismaClient,
  tenantId: string,
  sessionId: string,
) {
  return client.$executeRaw`
    UPDATE "ImportSession"
       SET "status" = 'COMPLETED',
           "completedAt" = now(),
           "completedBy" = 'raw-sql',
           "updatedAt" = now()
     WHERE "tenantId" = ${tenantId}
       AND "id" = ${sessionId}
  `;
}

/**
 * Enfileira duas escritas de agenda na ordem pedida, ambas em voo.
 *
 * O lock de dia da política única (`pg_advisory_xact_lock`) é tomado antes por
 * uma terceira sessão; as duas operações entram na fila do **mesmo** lock e o
 * PostgreSQL as acorda em ordem de chegada. Sem isso a corrida seria decidida
 * pelo escalonador do Node, e um teste de concorrência instável não prova
 * nada — a ordem precisa ser conhecida para que a asserção seja sobre a
 * política de escrita, não sobre sorte.
 */
async function runQueued<A, B>(
  tenantId: string,
  date: string,
  first: () => Promise<A>,
  second: () => Promise<B>,
): Promise<[PromiseSettledResult<A>, PromiseSettledResult<B>]> {
  const key = `${tenantId}:${date}`;
  await blocker.$executeRaw`SELECT pg_advisory_lock(hashtext(${key}))`;
  try {
    const firstRun = first();
    await waitForLockWaiters(1);
    const secondRun = second();
    await waitForLockWaiters(2);
    return (await Promise.allSettled([
      (async () => {
        await blocker.$executeRaw`SELECT pg_advisory_unlock(hashtext(${key}))`;
        return firstRun;
      })(),
      secondRun,
    ])) as [PromiseSettledResult<A>, PromiseSettledResult<B>];
  } finally {
    await blocker.$executeRaw`SELECT pg_advisory_unlock_all()`;
  }
}

/**
 * Espera até que o número de transações bloqueadas em lock advisory chegue ao
 * esperado. O banco é descartável e exclusivo desta suíte, então toda espera
 * de lock advisory nele é da corrida em curso.
 */
async function waitForLockWaiters(expected: number): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const [row] = await blocker.$queryRaw<Array<{ waiting: bigint }>>`
      SELECT count(*) AS waiting
        FROM pg_locks
       WHERE locktype = 'advisory'
         AND NOT granted
    `;
    if (Number(row.waiting) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `Timed out waiting for ${expected} transaction(s) queued on the calendar day lock.`,
  );
}

describeWithDatabase("goal010 import against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    other = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    blocker = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await prisma?.$disconnect();
    await other?.$disconnect();
    await blocker?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await seedTenant(tenantA);
    await seedTenant(tenantB);
  });

  describe("isolation between two businesses in the same database", () => {
    it("keeps session, items, decisions, conflicts, source maps and history of one business invisible, immutable and uncompletable by the other", async () => {
      // A importa de verdade: itens resolvidos, mapa de origem gravado e um
      // conflito real (nome parecido com um serviço que A já tinha).
      await prisma.service.create({
        data: {
          tenantId: tenantA,
          name: "Corte social",
          durationMinutes: 60,
          priceType: "FIXED",
          price: 80,
          active: true,
        },
      });
      const snapshot = buildSnapshot({
        services: category("SERVICE", [
          { externalId: "900", raw: sourceService() },
          {
            externalId: "901",
            raw: sourceService({ id: 901, name: "Corte sociall" }),
          },
        ]),
        customers: category("CUSTOMER", [
          { externalId: "500", raw: sourceCustomer() },
        ]),
      });
      const a = await analyzed(tenantA, snapshot);
      await new ImportExecutionService(prisma).execute(
        { tenantId: tenantA, sessionId: a.sessionId, userId: "user-a" },
        a.reader,
        snapshotInput,
        { previewVersion: 1 },
      );
      const conflict = await prisma.importItem.findFirstOrThrow({
        where: { tenantId: tenantA, sessionId: a.sessionId, externalId: "901" },
      });
      expect(conflict.status).toBe("NEEDS_REVIEW");
      await prisma.importDecision.create({
        data: {
          tenantId: tenantA,
          sessionId: a.sessionId,
          scope: "ITEM",
          decision: "CREATE_NEW",
          category: "SERVICE",
          itemId: conflict.id,
          externalId: "901",
          decidedBy: "user-a",
        },
      });
      await new ImportCompletionService(prisma).complete(
        { tenantId: tenantA, sessionId: a.sessionId, userId: "user-a" },
        { acceptPending: true },
      );

      // B abre a própria sessão sobre a mesma origem.
      const b = await analyzed(
        tenantB,
        buildSnapshot({
          services: category("SERVICE", [
            { externalId: "900", raw: sourceService() },
          ]),
        }),
      );
      expect(b.sessionId).not.toBe(a.sessionId);

      // Nada de A aparece do lado de B.
      const sessionsOfB = await prisma.importSession.findMany({
        where: { tenantId: tenantB },
      });
      expect(sessionsOfB.map((row) => row.id)).toEqual([b.sessionId]);
      const itemsOfB = await prisma.importItem.findMany({
        where: { tenantId: tenantB },
      });
      expect(itemsOfB.every((row) => row.sessionId === b.sessionId)).toBe(true);
      expect(
        await prisma.importDecision.count({ where: { tenantId: tenantB } }),
      ).toBe(0);
      expect(
        await prisma.importItem.count({
          where: { tenantId: tenantB, status: "NEEDS_REVIEW" },
        }),
      ).toBe(0);
      expect(
        await prisma.externalEntityMap.count({ where: { tenantId: tenantB } }),
      ).toBe(0);
      const completion = new ImportCompletionService(prisma);
      expect(await completion.getHistory(tenantB)).toBeNull();
      expect((await completion.getHistory(tenantA))?.sessionId).toBe(
        a.sessionId,
      );
      // O direito de B continua livre: A ter concluído não gasta o direito de
      // outro negócio.
      expect(await completion.getImportRight(tenantB)).toMatchObject({
        available: true,
      });

      // E B não alcança o que é de A por caminho nenhum.
      const before = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: a.sessionId } },
      });
      const itemsBefore = await prisma.importItem.findMany({
        where: { tenantId: tenantA, sessionId: a.sessionId },
        orderBy: { externalId: "asc" },
      });

      await expect(
        new ImportPreviewService(prisma).analyze(
          { tenantId: tenantB, sessionId: a.sessionId },
          b.reader,
          snapshotInput,
        ),
      ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_FOUND" });
      await expect(
        new ImportExecutionService(prisma).execute(
          { tenantId: tenantB, sessionId: a.sessionId, userId: "user-b" },
          b.reader,
          snapshotInput,
          { previewVersion: 1 },
        ),
      ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_FOUND" });
      await expect(
        completion.complete({
          tenantId: tenantB,
          sessionId: a.sessionId,
          userId: "user-b",
        }),
      ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_FOUND" });
      // Nem por SQL com o tenant do outro: a chave é composta, e o UPDATE não
      // alcança linha nenhuma.
      expect(await rawComplete(prisma, tenantB, a.sessionId)).toBe(0);

      const after = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: a.sessionId } },
      });
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
      expect(after.status).toBe(before.status);
      expect(after.completedBy).toBe("user-a");
      const itemsAfter = await prisma.importItem.findMany({
        where: { tenantId: tenantA, sessionId: a.sessionId },
        orderBy: { externalId: "asc" },
      });
      expect(itemsAfter.map((row) => [row.externalId, row.status])).toEqual(
        itemsBefore.map((row) => [row.externalId, row.status]),
      );
    });
  });

  describe("real concurrency: two starts, two instances, one lease", () => {
    it("two simultaneous starts produce a single live session and a single execution", async () => {
      const [one, two] = await Promise.all([
        startSession(tenantA, prisma),
        startSession(tenantA, other),
      ]);
      expect(one.sessionId).toBe(two.sessionId);
      expect(
        await prisma.importSession.count({ where: { tenantId: tenantA } }),
      ).toBe(1);

      const reader = new FixtureReader(fullSnapshot());
      await new ImportPreviewService(prisma).analyze(
        { tenantId: tenantA, sessionId: one.sessionId },
        reader,
        snapshotInput,
      );

      // Duas instâncias, duas conexões, a mesma sessão: uma executa, a outra
      // desiste sem tocar na origem nem no destino.
      const context = {
        tenantId: tenantA,
        sessionId: one.sessionId,
        userId: "user-1",
      };
      const outcomes = await Promise.allSettled([
        new ImportExecutionService(prisma).execute(
          context,
          reader,
          snapshotInput,
          { previewVersion: 1, leaseOwner: "instance-1" },
        ),
        new ImportExecutionService(other).execute(
          context,
          reader,
          snapshotInput,
          { previewVersion: 1, leaseOwner: "instance-2" },
        ),
      ]);

      const rejected = outcomes.filter((entry) => entry.status === "rejected");
      expect(
        outcomes.filter((entry) => entry.status === "fulfilled"),
      ).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(errorCodeOf(rejected[0])).toBe("IMPORT_SESSION_LEASE_HELD");

      // Trabalho feito uma vez só, contado no banco.
      expect(await prisma.service.count({ where: { tenantId: tenantA } })).toBe(
        1,
      );
      expect(
        await prisma.customer.count({ where: { tenantId: tenantA } }),
      ).toBe(1);
      expect(
        await prisma.appointment.count({ where: { tenantId: tenantA } }),
      ).toBe(1);
      expect(
        await prisma.externalEntityMap.count({ where: { tenantId: tenantA } }),
      ).toBe(3);
      const items = await prisma.importItem.findMany({
        where: { tenantId: tenantA, sessionId: one.sessionId },
      });
      expect(items.every((row) => row.attemptCount <= 1)).toBe(true);
    });

    it("a live lease is not stolen and a live job is not restarted by a second instance", async () => {
      const { sessionId, reader } = await analyzed(tenantA, fullSnapshot());
      const held = await acquireImportLease(prisma, {
        tenantId: tenantA,
        sessionId,
        owner: "instance-1",
        onClaim: { status: "EXECUTING" },
      });
      expect(held.acquired).toBe(true);

      // Retomada por tenant: a sessão com lease vivo **não** está parada, e
      // por isso não é retomada por quem acabou de subir.
      const resumed = await resumeImportSessions(other, {
        tenantId: tenantA,
        owner: "instance-2",
      });
      expect(resumed).toEqual([]);

      await expect(
        new ImportExecutionService(other).execute(
          { tenantId: tenantA, sessionId, userId: "user-2" },
          reader,
          snapshotInput,
          { previewVersion: 1, leaseOwner: "instance-2" },
        ),
      ).rejects.toMatchObject({
        code: "IMPORT_SESSION_LEASE_HELD",
        details: { heldBy: "instance-1" },
      });

      const row = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: sessionId } },
      });
      expect(row.leaseOwner).toBe("instance-1");
      expect(row.status).toBe("EXECUTING");
      // A instância que perdeu não escreveu nada de destino.
      expect(await prisma.service.count({ where: { tenantId: tenantA } })).toBe(
        0,
      );
      expect(
        await prisma.customer.count({ where: { tenantId: tenantA } }),
      ).toBe(0);
    });
  });

  describe("resuming an interrupted batch", () => {
    it("restarting in the middle of the batch resumes from the checkpoint without duplicating", async () => {
      const snapshot = buildSnapshot({
        services: category("SERVICE", [
          { externalId: "900", raw: sourceService({ id: 900, name: "Corte" }) },
          { externalId: "901", raw: sourceService({ id: 901, name: "Barba" }) },
          {
            externalId: "902",
            raw: sourceService({ id: 902, name: "Hidratacao" }),
          },
        ]),
        customers: category("CUSTOMER", [
          {
            externalId: "500",
            raw: sourceCustomer({ id: 500, name: "Ana Souza" }),
          },
          {
            externalId: "501",
            raw: sourceCustomer({
              id: 501,
              name: "Bruno Lima",
              phone1: "5511988880000",
            }),
          },
        ]),
        futureAppointments: category("FUTURE_APPOINTMENT", [
          { externalId: "100", raw: sourceAppointment({ id: 100 }) },
          {
            externalId: "101",
            raw: sourceAppointment({
              id: 101,
              date: "2026-10-02",
              startTime: "14:00",
              endTime: "15:00",
              customerId: 501,
              serviceId: 901,
            }),
          },
        ]),
      });
      const { sessionId, reader } = await analyzed(tenantA, snapshot);
      const context = { tenantId: tenantA, sessionId, userId: "user-1" };

      // Primeira passada com teto: para no meio do lote, como uma queda.
      const first = await new ImportExecutionService(prisma).execute(
        context,
        reader,
        snapshotInput,
        { previewVersion: 1, maxItems: 2, leaseOwner: "instance-1" },
      );
      expect(first.processed).toBe(2);
      expect(first.status).toBe("PARTIAL");
      expect(await prisma.service.count({ where: { tenantId: tenantA } })).toBe(
        2,
      );
      const checkpoint = await prisma.importSessionCategory.findFirstOrThrow({
        where: { tenantId: tenantA, sessionId, category: "SERVICE" },
      });
      expect(checkpoint.cursor).toMatchObject({ lastExternalId: "901" });
      expect(checkpoint.importedCount).toBe(2);
      // A passada devolveu o lease no fechamento: a sessão não ficou presa.
      const paused = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: sessionId } },
      });
      expect(paused.leaseOwner).toBeNull();

      // Segunda passada, de outra instância: retoma só o que sobrou.
      const second = await new ImportExecutionService(other).execute(
        context,
        reader,
        snapshotInput,
        { previewVersion: 1, leaseOwner: "instance-2" },
      );
      expect(second.status).toBe("READY");

      // Nada foi feito duas vezes.
      expect(await prisma.service.count({ where: { tenantId: tenantA } })).toBe(
        3,
      );
      expect(
        await prisma.customer.count({ where: { tenantId: tenantA } }),
      ).toBe(2);
      expect(
        await prisma.appointment.count({ where: { tenantId: tenantA } }),
      ).toBe(2);
      expect(
        await prisma.externalEntityMap.count({ where: { tenantId: tenantA } }),
      ).toBe(7);
      const items = await prisma.importItem.findMany({
        where: { tenantId: tenantA, sessionId },
      });
      expect(items).toHaveLength(7);
      expect(items.every((row) => row.status === "IMPORTED")).toBe(true);
      expect(items.every((row) => row.attemptCount === 1)).toBe(true);
      // Retomada de checkpoint, não reprocessamento: nenhum item precisou ser
      // reconciliado como "já importado", porque a segunda passada não voltou
      // a olhar o que a primeira resolveu.
      expect(
        items.filter(
          (row) => row.reasonCode === "ALREADY_IMPORTED_FROM_SOURCE",
        ),
      ).toHaveLength(0);
      const session = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: sessionId } },
      });
      expect(session.importedCount).toBe(7);
      expect(session.pendingCount).toBe(0);
    });

    it("an expired lease is reclaimable by the database clock, with an expiry fixture and no sleep", async () => {
      const { sessionId } = await analyzed(tenantA, fullSnapshot());
      const first = await acquireImportLease(prisma, {
        tenantId: tenantA,
        sessionId,
        owner: "instance-1",
        ttlSeconds: 3600,
        onClaim: { status: "EXECUTING" },
      });
      expect(first.acquired).toBe(true);

      // Enquanto vive, ninguém toma.
      const denied = await acquireImportLease(other, {
        tenantId: tenantA,
        sessionId,
        owner: "instance-2",
      });
      expect(denied).toMatchObject({ acquired: false, heldBy: "instance-1" });

      // Fixture de expiração escrita pelo **banco**, sem esperar o TTL.
      await expireLeaseInDatabase(tenantA, sessionId);

      const reclaimed = await acquireImportLease(other, {
        tenantId: tenantA,
        sessionId,
        owner: "instance-2",
      });
      expect(reclaimed.acquired).toBe(true);
      const row = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: sessionId } },
      });
      expect(row.leaseOwner).toBe("instance-2");

      // O dono anterior não renova um lease que já não é dele: quem perdeu
      // para de escrever em vez de sobrescrever quem assumiu.
      expect(
        first.acquired ? await renewImportLease(prisma, first.lease) : "held",
      ).toBeNull();
    });
  });

  describe("single completion under two concurrent connections", () => {
    it("refuses the second completion at the database after a real import", async () => {
      const { sessionId, reader } = await analyzed(tenantA, fullSnapshot());
      const executed = await new ImportExecutionService(prisma).execute(
        { tenantId: tenantA, sessionId, userId: "user-1" },
        reader,
        snapshotInput,
        { previewVersion: 1 },
      );
      expect(executed.status).toBe("READY");

      // Uma sessão descartada continua existindo — é por ela que uma segunda
      // conclusão poderia ser tentada por fora do serviço.
      const discarded = await prisma.importSession.create({
        data: {
          tenantId: tenantA,
          sourceAccountId: "account-2",
          createdBy: "user-2",
          status: "SUPERSEDED",
        },
      });

      const outcomes = await Promise.allSettled([
        new ImportCompletionService(prisma).complete({
          tenantId: tenantA,
          sessionId,
          userId: "user-1",
        }),
        other.$transaction(
          (transaction) =>
            transaction.$executeRaw`
            UPDATE "ImportSession"
               SET "status" = 'COMPLETED',
                   "completedAt" = now(),
                   "completedBy" = 'connection-2',
                   "updatedAt" = now()
             WHERE "tenantId" = ${tenantA}
               AND "id" = ${discarded.id}
          `,
        ),
      ]);

      // Uma só conclusão sobrevive. Quem perdeu perdeu **no banco**: a
      // conexão que foi por SQL cru vê o `23505` do índice parcial, e a que
      // foi pelo serviço vê a mesma recusa já classificada como
      // `IMPORT_ALREADY_COMPLETED` — qual das duas chega primeiro é do
      // escalonador, mas a decisão é sempre do índice.
      expect(
        outcomes.filter((entry) => entry.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = outcomes.find((entry) => entry.status === "rejected");
      expect(String((rejected as PromiseRejectedResult).reason)).toMatch(
        /23505|one_completed_per_tenant|already completed its single import/u,
      );
      const completed = await prisma.importSession.findMany({
        where: { tenantId: tenantA, completedAt: { not: null } },
      });
      expect(completed).toHaveLength(1);

      // E a recusa é do banco, não de uma checagem de aplicação: a sessão que
      // sobrou não é concluível nem por SQL cru, de outra conexão.
      const survivor = await prisma.importSession.findFirstOrThrow({
        where: { tenantId: tenantA, completedAt: null },
      });
      await expect(rawComplete(other, tenantA, survivor.id)).rejects.toThrow(
        /23505|one_completed_per_tenant/u,
      );
      // Concluído o negócio, o direito não abre uma segunda importação.
      await expect(startSession(tenantA)).rejects.toMatchObject({
        code: "IMPORT_ALREADY_COMPLETED",
      });
    });
  });

  describe("importing onto a destination that is already in use", () => {
    it("imports without requiring an empty destination and resolves each conflict by the preview rules", async () => {
      // Destino já povoado: pessoa, serviço e um atendimento próprio da
      // Atendly, criados antes de qualquer importação.
      const existingService = await prisma.service.create({
        data: {
          tenantId: tenantA,
          name: "Corte",
          durationMinutes: 60,
          priceType: "FIXED",
          price: 90,
          active: true,
        },
      });
      const existingCustomer = await prisma.customer.create({
        data: { tenantId: tenantA, name: "Ana Souza", phone: "5511999990000" },
      });
      const existingAppointment = await new AtendlyCalendarProvider(
        prisma,
        tenantA,
        "user-0",
        timeZone,
      ).createAppointment({
        source: "USER",
        serviceIds: [existingService.id],
        date: "2026-11-05",
        startTime: "08:00",
        customerId: existingCustomer.id,
        stepMinutes: 30,
        idempotencyKey: "idem-pre-existing",
      } as never);

      const snapshot = buildSnapshot({
        services: category("SERVICE", [
          // Nome idêntico ao que já existe: correspondência exata, mesclável —
          // mas mesclar é decisão explícita, e sem decisão importa como novo.
          { externalId: "900", raw: sourceService({ id: 900, name: "Corte" }) },
          // Nome parecido: só sugere, e por isso espera revisão.
          {
            externalId: "901",
            raw: sourceService({ id: 901, name: "Cortee" }),
          },
        ]),
        customers: category("CUSTOMER", [
          // Telefone e nome idênticos: exata.
          {
            externalId: "500",
            raw: sourceCustomer({ id: 500, name: "Ana Souza" }),
          },
          // Sem telefone e com nome parecido: semelhante, espera revisão.
          {
            externalId: "501",
            raw: sourceCustomer({ id: 501, name: "Ana Sousa", phone1: null }),
          },
        ]),
        futureAppointments: category("FUTURE_APPOINTMENT", [
          {
            externalId: "100",
            raw: sourceAppointment({
              id: 100,
              date: "2026-11-06",
              startTime: "09:00",
              endTime: "10:00",
            }),
          },
        ]),
      });
      const { sessionId, reader, preview } = await analyzed(tenantA, snapshot);

      expect(
        preview.items.find((item) => item.externalId === "900"),
      ).toMatchObject({ matchClass: "EXACT", status: "PENDING" });
      expect(
        preview.items.find((item) => item.externalId === "901"),
      ).toMatchObject({ matchClass: "SIMILAR", status: "NEEDS_REVIEW" });
      expect(
        preview.items.find((item) => item.externalId === "501"),
      ).toMatchObject({ matchClass: "SIMILAR", status: "NEEDS_REVIEW" });

      const result = await new ImportExecutionService(prisma).execute(
        { tenantId: tenantA, sessionId, userId: "user-1" },
        reader,
        snapshotInput,
        { previewVersion: 1 },
      );

      // O que está em revisão não virou registro; o resto entrou.
      const items = await prisma.importItem.findMany({
        where: { tenantId: tenantA, sessionId },
      });
      const byExternalId = new Map(items.map((row) => [row.externalId, row]));
      expect(byExternalId.get("900")?.status).toBe("IMPORTED");
      expect(byExternalId.get("901")?.status).toBe("NEEDS_REVIEW");
      expect(byExternalId.get("500")?.status).toBe("IMPORTED");
      expect(byExternalId.get("501")?.status).toBe("NEEDS_REVIEW");
      expect(byExternalId.get("100")?.status).toBe("IMPORTED");

      expect(await prisma.service.count({ where: { tenantId: tenantA } })).toBe(
        2,
      );
      expect(
        await prisma.customer.count({ where: { tenantId: tenantA } }),
      ).toBe(2);
      expect(
        await prisma.appointment.count({ where: { tenantId: tenantA } }),
      ).toBe(2);

      // O que já era do negócio continua exatamente como estava.
      const serviceAfter = await prisma.service.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: existingService.id } },
      });
      expect(Number(serviceAfter.price)).toBe(90);
      const customerAfter = await prisma.customer.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: existingCustomer.id } },
      });
      expect(customerAfter.name).toBe("Ana Souza");
      const appointmentAfter = await prisma.appointment.findUniqueOrThrow({
        where: {
          tenantId_id: { tenantId: tenantA, id: existingAppointment.id },
        },
      });
      expect(appointmentAfter.source).toBe("USER");
      // Nenhum mapa de origem aponta para o que já existia: a importação não
      // adotou registro do negócio como se tivesse criado.
      const maps = await prisma.externalEntityMap.findMany({
        where: { tenantId: tenantA },
      });
      expect(maps).toHaveLength(3);
      expect(
        maps.some((map) =>
          [
            existingService.id,
            existingCustomer.id,
            existingAppointment.id,
          ].includes(map.internalId),
        ),
      ).toBe(false);

      // Sobrou revisão: a sessão fica parcial, com as contagens do banco.
      expect(result.status).toBe("PARTIAL");
      const session = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: sessionId } },
      });
      const tally = await tallyItems(tenantA, sessionId);
      expect({
        pending: session.pendingCount,
        imported: session.importedCount,
        skipped: session.skippedCount,
        failed: session.failedCount,
        needsReview: session.needsReviewCount,
      }).toEqual(tally);
      expect(tally).toMatchObject({ imported: 3, needsReview: 2 });
    });
  });

  describe("partial failure with counts read from the database", () => {
    it("marks only the invalid item, keeps going, and the counts match the database", async () => {
      const snapshot = buildSnapshot({
        services: category("SERVICE", [
          { externalId: "900", raw: sourceService({ id: 900, name: "Corte" }) },
          // Fora do contrato da origem: `price` não é número. O preview passa
          // (ele só olha nome e duração); o motor é quem recusa o registro.
          {
            externalId: "901",
            raw: {
              id: 901,
              name: "Barba",
              duration: 30,
              price: "sessenta",
              colorId: null,
              deleted: false,
            },
          },
          {
            externalId: "902",
            raw: sourceService({ id: 902, name: "Hidratacao" }),
          },
        ]),
        customers: category("CUSTOMER", [
          { externalId: "500", raw: sourceCustomer() },
        ]),
        futureAppointments: category("FUTURE_APPOINTMENT", [
          { externalId: "100", raw: sourceAppointment() },
        ]),
      });
      const { sessionId, reader } = await analyzed(tenantA, snapshot);

      const result = await new ImportExecutionService(prisma).execute(
        { tenantId: tenantA, sessionId, userId: "user-1" },
        reader,
        snapshotInput,
        { previewVersion: 1 },
      );

      const items = await prisma.importItem.findMany({
        where: { tenantId: tenantA, sessionId },
      });
      const failed = items.filter((row) => row.status === "FAILED");
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        externalId: "901",
        reasonCode: "IMPORT_SOURCE_RECORD_INVALID",
      });
      // Motivo sanitizado: nada do payload cru da origem foi para o banco.
      expect(failed[0].reasonDetail).not.toContain("sessenta");
      // Os demais seguiram, inclusive o agendamento que veio depois.
      expect(await prisma.service.count({ where: { tenantId: tenantA } })).toBe(
        2,
      );
      expect(
        await prisma.appointment.count({ where: { tenantId: tenantA } }),
      ).toBe(1);

      const tally = await tallyItems(tenantA, sessionId);
      expect(tally).toEqual({
        pending: 0,
        imported: 4,
        skipped: 0,
        failed: 1,
        needsReview: 0,
      });
      expect(result.counts).toEqual(tally);
      const session = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: sessionId } },
      });
      expect(session.status).toBe("PARTIAL");
      expect({
        imported: session.importedCount,
        failed: session.failedCount,
        pending: session.pendingCount,
      }).toEqual({ imported: 4, failed: 1, pending: 0 });
      const serviceCategory =
        await prisma.importSessionCategory.findFirstOrThrow({
          where: { tenantId: tenantA, sessionId, category: "SERVICE" },
        });
      expect({
        imported: serviceCategory.importedCount,
        failed: serviceCategory.failedCount,
      }).toEqual({ imported: 2, failed: 1 });
    });
  });

  describe("imported appointment against a concurrent confirmation", () => {
    /**
     * Deixa serviço e cliente já importados e a sessão com **um** item
     * pendente: o agendamento. Assim a passada seguinte disputa o dia com a
     * confirmação em vez de gastar o tempo do lock com as outras categorias.
     */
    async function readyForAppointmentRace() {
      const withoutAppointment = buildSnapshot({
        services: category("SERVICE", [
          { externalId: "900", raw: sourceService() },
        ]),
        customers: category("CUSTOMER", [
          { externalId: "500", raw: sourceCustomer() },
        ]),
      });
      const { sessionId } = await analyzed(tenantA, withoutAppointment);
      await new ImportExecutionService(prisma).execute(
        { tenantId: tenantA, sessionId, userId: "user-1" },
        new FixtureReader(withoutAppointment),
        snapshotInput,
        { previewVersion: 1 },
      );
      const reader = new FixtureReader(fullSnapshot());
      // Segunda análise: a origem agora mostra o agendamento. A versão
      // aprovada passa a ser esta, e é ela que a execução declara.
      const preview = await new ImportPreviewService(prisma).analyze(
        { tenantId: tenantA, sessionId },
        reader,
        snapshotInput,
      );
      const service = await prisma.service.findFirstOrThrow({
        where: { tenantId: tenantA },
      });
      const customer = await prisma.customer.findFirstOrThrow({
        where: { tenantId: tenantA },
      });
      return {
        sessionId,
        reader,
        previewVersion: preview.previewVersion,
        serviceId: service.id,
        customerId: customer.id,
      };
    }

    function importAppointment(
      sessionId: string,
      reader: FixtureReader,
      previewVersion: number,
    ) {
      return new ImportExecutionService(prisma).execute(
        { tenantId: tenantA, sessionId, userId: "user-1" },
        reader,
        snapshotInput,
        { previewVersion },
      );
    }

    function confirmAppointment(
      serviceId: string,
      customerId: string,
      idempotencyKey: string,
    ) {
      return new AtendlyCalendarProvider(
        other,
        tenantA,
        "user-2",
        timeZone,
      ).createAppointment({
        source: "USER",
        serviceIds: [serviceId],
        date: "2026-10-01",
        startTime: "09:00",
        customerId,
        stepMinutes: 30,
        idempotencyKey,
      } as never);
    }

    it("produces a single effect when the import reaches the day lock first", async () => {
      const ready = await readyForAppointmentRace();
      const [imported, confirmation] = await runQueued(
        tenantA,
        "2026-10-01",
        () =>
          importAppointment(
            ready.sessionId,
            ready.reader,
            ready.previewVersion,
          ),
        () =>
          confirmAppointment(
            ready.serviceId,
            ready.customerId,
            "idem-import-first",
          ),
      );

      const appointments = await prisma.appointment.findMany({
        where: { tenantId: tenantA, startAt: contestedStartAt },
      });
      expect(appointments).toHaveLength(1);
      expect(appointments[0].source).toBe("INTEGRATION");
      expect(imported.status).toBe("fulfilled");
      expect(confirmation.status).toBe("rejected");
      expect(errorCodeOf(confirmation)).toBe("SLOT_UNAVAILABLE");
    });

    it("produces a single effect when the confirmation reaches the day lock first", async () => {
      const ready = await readyForAppointmentRace();
      const [confirmation, imported] = await runQueued(
        tenantA,
        "2026-10-01",
        () =>
          confirmAppointment(
            ready.serviceId,
            ready.customerId,
            "idem-confirm-first",
          ),
        () =>
          importAppointment(
            ready.sessionId,
            ready.reader,
            ready.previewVersion,
          ),
      );

      const appointments = await prisma.appointment.findMany({
        where: { tenantId: tenantA, startAt: contestedStartAt },
      });
      expect(confirmation.status).toBe("fulfilled");
      // O horário já estava tomado quando a importação chegou: um só efeito
      // no horário disputado, e o item importado fica marcado em vez de
      // sobrepor o atendimento que o negócio acabou de confirmar.
      //
      // A asserção compara `origem:estado` — e não só a contagem — para que o
      // vermelho diga qual atendimento sobrou no horário, que é o dado de que
      // quem for corrigir precisa.
      expect(appointments.map((row) => `${row.source}:${row.status}`)).toEqual([
        "USER:CONFIRMED",
      ]);
      const item = await prisma.importItem.findFirstOrThrow({
        where: {
          tenantId: tenantA,
          sessionId: ready.sessionId,
          category: "FUTURE_APPOINTMENT",
          externalId: "100",
        },
      });
      expect(item.status).not.toBe("IMPORTED");
    });
  });

  describe("no residue between cases", () => {
    it("leaves nothing of either business behind after support/reset-tenant.ts", async () => {
      const { sessionId, reader } = await analyzed(tenantA, fullSnapshot());
      await new ImportExecutionService(prisma).execute(
        { tenantId: tenantA, sessionId, userId: "user-1" },
        reader,
        snapshotInput,
        { previewVersion: 1 },
      );
      await new ImportCompletionService(prisma).complete({
        tenantId: tenantA,
        sessionId,
        userId: "user-1",
      });
      await analyzed(tenantB, fullSnapshot());

      await resetTenant(prisma, tenantA);
      await resetTenant(prisma, tenantB);

      for (const tenantId of [tenantA, tenantB]) {
        expect({
          tenantId,
          sessions: await prisma.importSession.count({ where: { tenantId } }),
          items: await prisma.importItem.count({ where: { tenantId } }),
          categories: await prisma.importSessionCategory.count({
            where: { tenantId },
          }),
          decisions: await prisma.importDecision.count({ where: { tenantId } }),
          maps: await prisma.externalEntityMap.count({ where: { tenantId } }),
          services: await prisma.service.count({ where: { tenantId } }),
          customers: await prisma.customer.count({ where: { tenantId } }),
          appointments: await prisma.appointment.count({ where: { tenantId } }),
          events: await prisma.appointmentEvent.count({ where: { tenantId } }),
        }).toEqual({
          tenantId,
          sessions: 0,
          items: 0,
          categories: 0,
          decisions: 0,
          maps: 0,
          services: 0,
          customers: 0,
          appointments: 0,
          events: 0,
        });
      }
      // O direito de importar volta a estar livre porque a linha sumiu — é o
      // que permite o caso seguinte começar do zero.
      expect(
        await new ImportCompletionService(prisma).getImportRight(tenantA),
      ).toMatchObject({ available: true });
    });
  });
});
