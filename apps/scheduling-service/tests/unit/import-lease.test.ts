/**
 * Lease da execução da importação pelo relógio do banco (Goal010, WU-05).
 *
 * O que estas suítes provam é a **coordenação**, não a persistência: o dublê
 * `createDatabaseDouble()` mantém um relógio próprio, movível por
 * `advanceDatabaseClock`, que só o `SELECT now()` enxerga. Um lease que
 * expirasse pelo relógio do processo continuaria vivo aqui — e é por isso que
 * a expiração é provada por fixture que envelhece o relógio **do banco**, sem
 * um `sleep` sequer. Duas conexões reais disputando a mesma linha são prova de
 * integração, contra PostgreSQL; aqui se prova que a decisão está no `WHERE`
 * de um único UPDATE e que o código respeita o resultado dele.
 */
import { describe, expect, it } from "vitest";

import { CalendarMigrationService } from "../../src/modules/migrations/calendar-migration-service.js";
import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import {
  acquireImportLease,
  IMPORT_SESSION_LEASE_HELD,
  renewImportLease,
  resumeImportSessions,
} from "../../src/modules/migrations/import-lease.js";
import {
  ImportPreviewService,
  type ImportPreviewSourceReader,
} from "../../src/modules/migrations/import-preview-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";
const ttlSeconds = 60;
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-10",
};

type Database = ReturnType<typeof createDatabaseDouble>;

function category(
  name: string,
  records: Array<{ externalId: string; raw: unknown }> = [],
) {
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

function sourceService(overrides: Partial<{ id: number; name: string }> = {}) {
  return {
    id: overrides.id ?? 900,
    name: overrides.name ?? "Corte",
    duration: 60,
    price: 80,
    colorId: null,
    deleted: false,
  };
}

function sourceCustomer() {
  return {
    id: 500,
    name: "Ana Souza",
    phone1: "5511999990000",
    phone2: null,
  };
}

function sourceAppointment() {
  const customer = sourceCustomer();
  const service = sourceService();
  return {
    id: 100,
    userId: 7,
    date: "2026-10-01",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    customerId: customer.id,
    customer,
    serviceId: service.id,
    service,
    price: 80,
    comments: null,
    deleted: false,
  };
}

/** Duas categorias de serviço, um cliente e um agendamento: quatro itens. */
function buildSnapshot() {
  return {
    generatedAt: "2026-09-10T12:00:00.000Z",
    services: category("SERVICE", [
      { externalId: "900", raw: sourceService({ id: 900, name: "Corte" }) },
      { externalId: "901", raw: sourceService({ id: 901, name: "Luzes" }) },
    ]),
    customers: category("CUSTOMER", [
      { externalId: "500", raw: sourceCustomer() },
    ]),
    availability: category("AVAILABILITY"),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category("FUTURE_APPOINTMENT", [
      { externalId: "100", raw: sourceAppointment() },
    ]),
    pastAppointments: category("PAST_APPOINTMENT"),
    cancelledAppointments: category("CANCELLED_APPOINTMENT"),
    noShowAppointments: category("NO_SHOW_APPOINTMENT"),
  } as never;
}

/** Leitor da origem que conta quantas vezes foi consultado. */
class CountingReader implements ImportPreviewSourceReader {
  reads = 0;
  constructor(private readonly onRead: () => void | Promise<void> = () => {}) {}
  async getImportSnapshot() {
    this.reads += 1;
    await this.onRead();
    return buildSnapshot();
  }
}

function setup() {
  const database = createDatabaseDouble();
  database.tables.calendarSettings.rows.push({
    id: tenantId,
    tenantId,
    source: "MINHA_AGENDA",
    timezone: timeZone,
  } as never);
  return {
    database,
    preview: new ImportPreviewService(database.client as never),
    execution: new ImportExecutionService(database.client as never),
  };
}

async function analyzed(
  database: Database,
  preview: ImportPreviewService,
  owner = tenantId,
) {
  const session = await database.client.importSession.create({
    data: {
      tenantId: owner,
      sourceAccountId: "account-1",
      createdBy: "user-1",
    },
  });
  await preview.analyze(
    { tenantId: owner, sessionId: session.id },
    new CountingReader(),
    snapshotInput,
  );
  return session.id;
}

function sessionRow(database: Database, sessionId: string) {
  const row = database.tables.importSession.rows.find(
    (candidate) => candidate.id === sessionId,
  );
  if (!row) throw new Error(`session ${sessionId} not seeded`);
  return row;
}

describe("Lease da importação: dois starts simultâneos", () => {
  it("produz uma única execução, sem segunda sessão nem trabalho duplicado", async () => {
    const { database, preview, execution } = setup();
    const sessionId = await analyzed(database, preview);
    const context = { tenantId, sessionId, userId: "user-1" };
    const first = new CountingReader();
    const second = new CountingReader();

    // Os dois starts saem juntos, sem `await` entre eles: é a disputa pela
    // mesma linha, e não uma sequência disfarçada de concorrência.
    const outcomes = await Promise.allSettled([
      execution.execute(context, first, snapshotInput, {
        previewVersion: 1,
        leaseOwner: "instance-a",
        leaseTtlSeconds: ttlSeconds,
      }),
      execution.execute(context, second, snapshotInput, {
        previewVersion: 1,
        leaseOwner: "instance-b",
        leaseTtlSeconds: ttlSeconds,
      }),
    ]);

    const fulfilled = outcomes.filter(
      (outcome) => outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: IMPORT_SESSION_LEASE_HELD,
      statusCode: 409,
    });

    // Uma só execução: cada registro da origem virou um registro da Atendly,
    // e a origem foi lida uma vez só — quem perdeu o lease desistiu antes.
    expect(database.tables.service.rows).toHaveLength(2);
    expect(database.tables.customer.rows).toHaveLength(1);
    expect(database.tables.appointment.rows).toHaveLength(1);
    expect(first.reads + second.reads).toBe(1);
    // Nenhuma segunda sessão nasceu da disputa.
    expect(database.tables.importSession.rows).toHaveLength(1);
    const session = sessionRow(database, sessionId);
    expect(session.importedCount).toBe(4);
    expect(session.leaseOwner).toBeNull();
  });
});

describe("Lease da importação: duas instâncias concorrentes", () => {
  it("não duplicam trabalho nem reiniciam um job vivo cujo lease está válido", async () => {
    const { database, preview, execution } = setup();
    const sessionId = await analyzed(database, preview);

    // A instância A está no meio do lote: lease vivo e sessão em EXECUTING.
    const startedAt = new Date("2026-09-10T10:00:00.000Z");
    const claim = await acquireImportLease(database.client as never, {
      tenantId,
      sessionId,
      owner: "instance-a",
      ttlSeconds,
      onClaim: { status: "EXECUTING", startedAt },
    });
    expect(claim.acquired).toBe(true);

    const reader = new CountingReader();
    await expect(
      execution.execute(
        { tenantId, sessionId, userId: "user-1" },
        reader,
        snapshotInput,
        {
          previewVersion: 1,
          leaseOwner: "instance-b",
          leaseTtlSeconds: ttlSeconds,
        },
      ),
    ).rejects.toMatchObject({
      code: IMPORT_SESSION_LEASE_HELD,
      details: { heldBy: "instance-a" },
    });

    // Nada foi importado e a origem nem chegou a ser lida: a recusa acontece
    // antes de gastar a origem.
    expect(reader.reads).toBe(0);
    expect(database.tables.service.rows).toHaveLength(0);
    expect(database.tables.appointment.rows).toHaveLength(0);
    // O job vivo não foi reiniciado: dono, estado e início são os de A.
    const session = sessionRow(database, sessionId);
    expect(session.leaseOwner).toBe("instance-a");
    expect(session.status).toBe("EXECUTING");
    expect(session.startedAt).toEqual(startedAt);
  });
});

describe("Lease da importação: expiração pelo relógio do banco", () => {
  it("é reivindicável depois de vencer, com o relógio do banco envelhecido por fixture", async () => {
    const { database, preview } = setup();
    const sessionId = await analyzed(database, preview);
    const client = database.client as never;

    const held = await acquireImportLease(client, {
      tenantId,
      sessionId,
      owner: "instance-a",
      ttlSeconds,
      onClaim: { status: "EXECUTING" },
    });
    expect(held.acquired).toBe(true);
    const denied = await acquireImportLease(client, {
      tenantId,
      sessionId,
      owner: "instance-b",
      ttlSeconds,
    });
    expect(denied).toMatchObject({ acquired: false, heldBy: "instance-a" });

    // Só o relógio **do banco** envelhece; o do processo não anda um
    // milissegundo, e nenhum `sleep` é usado.
    const processClockBefore = Date.now();
    database.advanceDatabaseClock((ttlSeconds + 1) * 1_000);
    expect(Date.now() - processClockBefore).toBeLessThan(1_000);

    const stolen = await acquireImportLease(client, {
      tenantId,
      sessionId,
      owner: "instance-b",
      ttlSeconds,
    });
    expect(stolen.acquired).toBe(true);
    expect(sessionRow(database, sessionId).leaseOwner).toBe("instance-b");
    // O novo lease nasce do instante do banco, não do processo: ele está
    // adiantado exatamente o quanto o relógio do banco foi envelhecido.
    expect(
      stolen.acquired ? stolen.lease.acquiredAt.getTime() : 0,
    ).toBeGreaterThan(
      (held.acquired ? held.lease.acquiredAt.getTime() : 0) +
        ttlSeconds * 1_000,
    );
    expect(database.journal.databaseNowReads).toBeGreaterThan(0);

    // O dono anterior não renova o que já não é dele.
    expect(
      held.acquired
        ? await renewImportLease(client, held.lease, ttlSeconds)
        : "no lease",
    ).toBeNull();
  });

  it("um lease livre é reivindicado, e o mesmo dono reivindica o próprio de volta", async () => {
    const { database, preview } = setup();
    const sessionId = await analyzed(database, preview);
    const client = database.client as never;

    const first = await acquireImportLease(client, {
      tenantId,
      sessionId,
      owner: "instance-a",
      ttlSeconds,
      onClaim: { status: "EXECUTING" },
    });
    expect(first.acquired).toBe(true);
    // Reentrante: a mesma instância retoma a própria passada sem esperar o
    // TTL vencer — um reinício de processo com a mesma identidade não fica
    // travado atrás do próprio lease.
    const again = await acquireImportLease(client, {
      tenantId,
      sessionId,
      owner: "instance-a",
      ttlSeconds,
    });
    expect(again.acquired).toBe(true);
  });
});

describe("Retomada por tenant e sob lease", () => {
  it("o serviço legado não expõe mais recuperação global no boot", () => {
    const { database } = setup();
    const legacy = new CalendarMigrationService(database.client as never);
    // Guarda de regressão: `resumeIncomplete` varria `MigrationJob` de todos
    // os negócios, sem lease, e reagendava cada job em memória. Subir uma
    // instância deixou de ser um evento que mexe em job de negócio.
    expect(
      (legacy as unknown as Record<string, unknown>).resumeIncomplete,
    ).toBeUndefined();
  });

  it("retoma só as sessões do tenant pedido, e só as que estão realmente paradas", async () => {
    const { database, preview } = setup();
    const client = database.client as never;
    const otherTenant = "tenant-b";
    database.tables.calendarSettings.rows.push({
      id: otherTenant,
      tenantId: otherTenant,
      source: "MINHA_AGENDA",
      timezone: timeZone,
    } as never);

    const stalled = await analyzed(database, preview);
    const alive = await analyzed(database, preview);
    const ready = await analyzed(database, preview);
    const foreign = await analyzed(database, preview, otherTenant);

    // Parada: lease de uma instância que caiu, já vencido.
    await acquireImportLease(client, {
      tenantId,
      sessionId: stalled,
      owner: "dead-instance",
      ttlSeconds,
      onClaim: { status: "EXECUTING" },
    });
    // Do outro negócio, no mesmo estado: a retomada de um tenant nunca a toca.
    await acquireImportLease(client, {
      tenantId: otherTenant,
      sessionId: foreign,
      owner: "dead-instance",
      ttlSeconds,
      onClaim: { status: "EXECUTING" },
    });
    database.advanceDatabaseClock((ttlSeconds + 1) * 1_000);
    // Viva: lease renovado **depois** do envelhecimento, então ainda vale.
    await acquireImportLease(client, {
      tenantId,
      sessionId: alive,
      owner: "instance-live",
      ttlSeconds,
      onClaim: { status: "EXECUTING" },
    });
    // `ready` fica como está: preview pronto não é retomada, é início.
    await client.importSession.update({
      where: { tenantId_id: { tenantId, id: ready } },
      data: { status: "READY" },
    });

    const resumed = await resumeImportSessions(client, {
      tenantId,
      owner: "recovery-instance",
      ttlSeconds,
    });

    expect(resumed.map((entry) => entry.sessionId)).toEqual([stalled]);
    expect(sessionRow(database, stalled).leaseOwner).toBe("recovery-instance");
    // O job vivo não é reiniciado, e o pronto não é arrastado para retomada.
    expect(sessionRow(database, alive).leaseOwner).toBe("instance-live");
    expect(sessionRow(database, ready).leaseOwner).toBeNull();
    // O outro negócio segue intocado, com o lease vencido de quem caiu: uma
    // retomada global o teria reivindicado junto.
    expect(sessionRow(database, foreign).leaseOwner).toBe("dead-instance");
  });
});

describe("Lease da importação: renovação e perda no meio do lote", () => {
  it("não corrompem o checkpoint nem reprocessam itens já importados", async () => {
    const { database, preview, execution } = setup();
    const sessionId = await analyzed(database, preview);
    const context = { tenantId, sessionId, userId: "user-1" };
    // Renovação a cada item e a cada categoria: o teste não depende do
    // intervalo de produção para exercitar renovação e perda.
    const leaseOptions = {
      // A versao aprovada acompanha toda passada: executar sem declarar a
      // versao nao e possivel, nem na retomada.
      previewVersion: 1,
      leaseOwner: "instance-a",
      leaseTtlSeconds: ttlSeconds,
      leaseRenewIntervalMs: 0,
    };

    // Passada 1: para no primeiro item, sob o lease de A, renovando a cada
    // item. É o checkpoint que a perda de lease não pode corromper.
    const first = await execution.execute(
      context,
      new CountingReader(),
      snapshotInput,
      { ...leaseOptions, maxItems: 1 },
    );
    expect(first).toMatchObject({ processed: 1, leaseLost: false });
    expect(database.tables.service.rows).toHaveLength(1);
    const afterFirst = sessionRow(database, sessionId);
    expect(afterFirst.leaseOwner).toBeNull();
    expect(afterFirst.importedCount).toBe(1);
    // A renovação foi ao banco: o batimento ficou registrado na linha.
    expect(afterFirst.leaseHeartbeatAt).toBeInstanceOf(Date);
    const cursorAfterFirst = database.tables.importSessionCategory.rows.find(
      (row) => row.category === "SERVICE",
    )?.cursor;
    expect(cursorAfterFirst).toEqual({ lastExternalId: "900" });

    // Passada 2: A reivindica de novo, mas perde o lease enquanto lê a
    // origem — o relógio do banco envelhece e B assume.
    const stealing = new CountingReader(async () => {
      database.advanceDatabaseClock((ttlSeconds + 1) * 1_000);
      const stolen = await acquireImportLease(database.client as never, {
        tenantId,
        sessionId,
        owner: "instance-b",
        ttlSeconds,
      });
      expect(stolen.acquired).toBe(true);
    });
    const second = await execution.execute(
      context,
      stealing,
      snapshotInput,
      leaseOptions,
    );

    expect(second.leaseLost).toBe(true);
    expect(second.processed).toBe(0);
    // Nada foi importado por quem perdeu o lease, e o checkpoint continua
    // exatamente onde a passada 1 o deixou.
    expect(database.tables.service.rows).toHaveLength(1);
    expect(
      database.tables.importSessionCategory.rows.find(
        (row) => row.category === "SERVICE",
      )?.cursor,
    ).toEqual(cursorAfterFirst);
    // E a sessão continua sendo de B: A não sobrescreveu dono, estado nem
    // contagens de quem assumiu o lote.
    const afterSecond = sessionRow(database, sessionId);
    expect(afterSecond.leaseOwner).toBe("instance-b");
    expect(afterSecond.status).toBe("EXECUTING");
    expect(afterSecond.importedCount).toBe(1);
    expect(afterSecond.finishedAt).toBeNull();

    // Passada 3: B, dono do lease, retoma do checkpoint. Os itens já
    // importados não são reprocessados — não há segundo serviço "Corte" nem
    // segunda linha no mapa de origem.
    const third = await execution.execute(
      context,
      new CountingReader(),
      snapshotInput,
      {
        previewVersion: 1,
        leaseOwner: "instance-b",
        leaseTtlSeconds: ttlSeconds,
      },
    );

    expect(third).toMatchObject({
      processed: 3,
      status: "READY",
      leaseLost: false,
    });
    expect(third.counts).toMatchObject({ imported: 4, failed: 0, pending: 0 });
    expect(database.tables.service.rows).toHaveLength(2);
    expect(database.tables.customer.rows).toHaveLength(1);
    expect(database.tables.appointment.rows).toHaveLength(1);
    expect(
      database.tables.externalEntityMap.rows.filter(
        (row) => row.entityType === "SERVICE",
      ),
    ).toHaveLength(2);
    expect(sessionRow(database, sessionId).leaseOwner).toBeNull();
  });
});
