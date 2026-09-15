import { describe, expect, it } from "vitest";

import { listAiCreatedAppointmentEvents } from "../../src/modules/appointments/appointment-event-service.js";
import { listFailedNotificationIntents } from "../../src/modules/reminders/notification-read-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

/**
 * Leituras por tenant da central de notificações (Goal022, WU-01): falhas de
 * entrega em `FAILED` e o feed de compromissos criados pela IA.
 *
 * Aqui se prova o recorte — nunca `facts`/`leaseToken`, filtro de estado e
 * tipo/origem, escopo por tenant — e a estabilidade do cursor sob paginação.
 * Persistência real e o índice aditivo são da migration e da suíte de
 * integração.
 */

const tenantA = "tenant-a";
const tenantB = "tenant-b";

type Database = ReturnType<typeof createDatabaseDouble>;

function pushIntent(
  database: Database,
  overrides: Partial<{
    id: string;
    tenantId: string;
    appointmentId: string;
    state: string;
    dueAt: Date;
  }>,
) {
  database.tables.appointmentNotificationIntent.rows.push({
    id: overrides.id ?? "intent-1",
    tenantId: overrides.tenantId ?? tenantA,
    appointmentId: overrides.appointmentId ?? "appointment-1",
    kind: "REMINDER",
    slot: "FIRST",
    appointmentVersion: 1,
    state: overrides.state ?? "FAILED",
    reason: "ATTEMPTS_EXHAUSTED",
    detail: null,
    dueAt: overrides.dueAt ?? new Date("2026-09-15T10:00:00.000Z"),
    facts: { customerPhone: "+5511999990000" },
    attemptCount: 3,
    lastAttemptAt: null,
    leaseOwner: null,
    leaseToken: "should-never-leave-the-dono",
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    leaseHeartbeatAt: null,
    outboundCorrelationId: null,
    sentAt: null,
    settledAt: new Date("2026-09-15T10:05:00.000Z"),
  });
}

describe("listFailedNotificationIntents (Goal022, WU-01)", () => {
  it("só devolve intenções em FAILED, nunca outro estado", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, { id: "failed-1", state: "FAILED" });
    pushIntent(database, { id: "pending-1", state: "PENDING" });
    pushIntent(database, { id: "sent-1", state: "SENT" });

    const result = await listFailedNotificationIntents(
      database.client as never,
      tenantA,
    );

    expect(result.items.map((item) => item.id)).toEqual(["failed-1"]);
  });

  it("nunca devolve facts nem leaseToken", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, { id: "failed-1" });

    const result = await listFailedNotificationIntents(
      database.client as never,
      tenantA,
    );

    expect(result.items[0]).not.toHaveProperty("facts");
    expect(result.items[0]).not.toHaveProperty("leaseToken");
  });

  it("é escopada por tenant e não vaza a intenção de outro negócio", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, { id: "own", tenantId: tenantA });
    pushIntent(database, { id: "other", tenantId: tenantB });

    const result = await listFailedNotificationIntents(
      database.client as never,
      tenantA,
    );

    expect(result.items.map((item) => item.id)).toEqual(["own"]);
  });

  it("pagina por cursor estável em vez de offset, sem pular nem repetir", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, {
      id: "first",
      dueAt: new Date("2026-09-15T09:00:00.000Z"),
    });
    pushIntent(database, {
      id: "second",
      dueAt: new Date("2026-09-15T10:00:00.000Z"),
    });
    pushIntent(database, {
      id: "third",
      dueAt: new Date("2026-09-15T11:00:00.000Z"),
    });

    const page1 = await listFailedNotificationIntents(
      database.client as never,
      tenantA,
      { limit: 2 },
    );
    expect(page1.items.map((item) => item.id)).toEqual(["first", "second"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listFailedNotificationIntents(
      database.client as never,
      tenantA,
      { limit: 2, cursor: page1.nextCursor },
    );
    expect(page2.items.map((item) => item.id)).toEqual(["third"]);
    expect(page2.nextCursor).toBeNull();
  });

  it("recusa um cursor malformado em vez de ler do início em silêncio", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, { id: "failed-1" });

    await expect(
      listFailedNotificationIntents(database.client as never, tenantA, {
        cursor: "not-a-real-cursor",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
});

let eventSequence = 0n;

function pushEvent(
  database: Database,
  overrides: Partial<{
    id: string;
    tenantId: string;
    appointmentId: string;
    type: string;
    source: string;
  }>,
) {
  // `sequence` gravado aqui — nunca deixado para o preenchimento de
  // `@default` do dublê, que recalcularia a cada leitura em vez de uma vez
  // na escrita, e desestabilizaria justamente o cursor que este teste prova.
  eventSequence += 1n;
  database.tables.appointmentEvent.rows.push({
    id: overrides.id ?? `event-${database.tables.appointmentEvent.rows.length + 1}`,
    tenantId: overrides.tenantId ?? tenantA,
    appointmentId: overrides.appointmentId ?? "appointment-1",
    type: overrides.type ?? "CREATED",
    source: overrides.source ?? "AI",
    actor: null,
    reason: null,
    before: null,
    after: { date: "2026-09-20", startTime: "10:00", endTime: "11:00" },
    occurredAt: new Date(),
    sequence: eventSequence,
  });
}

describe("listAiCreatedAppointmentEvents (Goal022, WU-01)", () => {
  it("só devolve type=CREATED e source=AI, nunca outro tipo ou origem", async () => {
    const database = createDatabaseDouble();
    pushEvent(database, { id: "created-ai", type: "CREATED", source: "AI" });
    pushEvent(database, {
      id: "created-user",
      type: "CREATED",
      source: "USER",
    });
    pushEvent(database, {
      id: "rescheduled-ai",
      type: "RESCHEDULED",
      source: "AI",
    });

    const result = await listAiCreatedAppointmentEvents(
      database.client as never,
      tenantA,
    );

    expect(result.items.map((item) => item.id)).toEqual(["created-ai"]);
  });

  it("é escopada por tenant e não vaza o evento de outro negócio", async () => {
    const database = createDatabaseDouble();
    pushEvent(database, { id: "own", tenantId: tenantA });
    pushEvent(database, { id: "other", tenantId: tenantB });

    const result = await listAiCreatedAppointmentEvents(
      database.client as never,
      tenantA,
    );

    expect(result.items.map((item) => item.id)).toEqual(["own"]);
  });

  it("avança por sequence, não por occurredAt", async () => {
    const database = createDatabaseDouble();
    pushEvent(database, { id: "first" });
    pushEvent(database, { id: "second" });
    pushEvent(database, { id: "third" });

    const page1 = await listAiCreatedAppointmentEvents(
      database.client as never,
      tenantA,
      { limit: 2 },
    );
    expect(page1.items.map((item) => item.id)).toEqual(["first", "second"]);
    expect(page1.nextCursor).toBe(page1.items[1]?.sequence);

    const page2 = await listAiCreatedAppointmentEvents(
      database.client as never,
      tenantA,
      { afterSequence: page1.nextCursor },
    );
    expect(page2.items.map((item) => item.id)).toEqual(["third"]);
    expect(page2.nextCursor).toBeNull();
  });

  it("recusa um cursor de sequence que não é um inteiro não negativo", async () => {
    const database = createDatabaseDouble();
    pushEvent(database, { id: "first" });

    await expect(
      listAiCreatedAppointmentEvents(database.client as never, tenantA, {
        afterSequence: "not-a-sequence",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
});
