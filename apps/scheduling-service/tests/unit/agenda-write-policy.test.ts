import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import {
  createTimeBlock,
  removeTimeBlock,
} from "../../src/modules/calendar/time-blocks.js";
import {
  isSerializationFailure,
  runCalendarWrite,
} from "../../src/modules/calendar/write-policy.js";
import { MinhaAgendaCalendarProvider } from "../../src/modules/integrations/minha-agenda/provider.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";
const context = { tenantId, userId: "user-1", requestId: "request-1" };
const serviceId = "service-corte";
const customerId = "customer-ana";

/** Data futura: a disponibilidade nunca oferece horário já passado. */
function futureDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function setup() {
  const database = createDatabaseDouble();
  const { tables } = database;
  tables.calendarSettings.rows.push({
    id: tenantId,
    tenantId,
    source: "ATENDLY",
    timezone: timeZone,
  });
  // Regra para todo dia da semana: a política de escrita é o que está sob
  // teste, não qual dia da semana caiu na data escolhida.
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    tables.availabilityRule.rows.push({
      id: `rule-${dayOfWeek}`,
      tenantId,
      dayOfWeek,
      startTime: databaseTime("08:00"),
      endTime: databaseTime("18:00"),
      active: true,
    });
  }
  tables.service.rows.push({
    id: serviceId,
    tenantId,
    name: "Corte",
    durationMinutes: 60,
    priceType: "FIXED",
    price: 50,
    active: true,
    needsReview: false,
    colorToken: null,
  });
  tables.customer.rows.push({
    id: customerId,
    tenantId,
    name: "Ana",
    phone: "+5511999990000",
    normalizedPhone: "5511999990000",
  });
  return {
    database,
    calendar: new CalendarService(database.client as never),
  };
}

interface CreateOverrides {
  date?: string;
  startTime?: string;
  idempotencyKey?: string;
  source?: "AI" | "USER";
  serviceIds?: string[];
  title?: string;
  durationMinutes?: number;
  overlapOverride?: boolean;
  overlapOverrideReason?: string;
}

function createInput(overrides: CreateOverrides = {}) {
  return {
    serviceIds: [serviceId],
    date: futureDate(7),
    startTime: "09:00",
    customerId,
    stepMinutes: 30,
    idempotencyKey: "key-create",
    ...overrides,
  };
}

const serializationAbort = Object.assign(
  new Error("write conflict"),
  { code: "P2034" },
);

describe("agenda: política única de escrita", () => {
  it("confirma dentro de uma transação, travando o dia afetado", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);

    const appointment = await calendar.createAppointment(
      context,
      createInput({ date }),
    );

    expect(appointment.status).toBe("CONFIRMED");
    expect(database.journal.locks).toEqual([`${tenantId}:${date}`]);
    const created = database.journal
      .writesFor("appointment")
      .find((write) => write.operation === "create");
    expect(created?.transaction).not.toBeNull();
  });

  it("cancela sob a mesma transação e o mesmo lock que confirmar", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);
    const appointment = await calendar.createAppointment(
      context,
      createInput({ date }),
    );
    const locksBefore = database.journal.locks.length;

    const cancelled = await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      comments: "cliente desmarcou",
      idempotencyKey: "key-cancel",
    });

    expect(cancelled.status).toBe("CANCELLED");
    expect(database.journal.locks.slice(locksBefore)).toEqual([
      `${tenantId}:${date}`,
    ]);
    const update = database.journal
      .writesFor("appointment")
      .filter((write) => write.operation === "update")
      .at(-1);
    expect(update?.transaction).not.toBeNull();
  });

  it("remarca travando o dia original e o novo em ordem estável", async () => {
    const { calendar, database } = setup();
    const original = futureDate(9);
    const target = futureDate(5);
    const appointment = await calendar.createAppointment(
      context,
      createInput({ date: original }),
    );
    const locksBefore = database.journal.locks.length;

    const moved = await calendar.rescheduleAppointment(context, {
      appointmentId: appointment.id,
      date: target,
      startTime: "10:00",
      stepMinutes: 30,
      idempotencyKey: "key-reschedule",
    });

    expect(moved.date).toBe(target);
    // Ordenados, não na ordem em que foram citados: é a ordem estável que
    // evita que duas remarcações cruzadas se travem.
    expect(database.journal.locks.slice(locksBefore)).toEqual([
      `${tenantId}:${target}`,
      `${tenantId}:${original}`,
    ]);
  });

  it("cria e remove bloqueio sob a mesma política", async () => {
    const { database } = setup();
    const date = futureDate(7);
    const startAt = new Date(`${date}T13:00:00.000Z`);
    const endAt = new Date(`${date}T14:00:00.000Z`);

    const block = await createTimeBlock(database.client as never, {
      tenantId,
      timeZone,
      startAt,
      endAt,
      reason: "almoço",
    });
    const created = database.journal
      .writesFor("timeBlock")
      .find((write) => write.operation === "create");
    expect(created?.transaction).not.toBeNull();
    expect(database.journal.locks).toEqual([`${tenantId}:${date}`]);

    const locksBefore = database.journal.locks.length;
    await removeTimeBlock(database.client as never, {
      tenantId,
      timeZone,
      id: block.id,
    });
    expect(database.tables.timeBlock.rows).toHaveLength(0);
    expect(database.journal.locks.slice(locksBefore)).toEqual([
      `${tenantId}:${date}`,
    ]);
  });

  it("checa o conflito do bloqueio dentro da transação e não grava nada", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);
    await calendar.createAppointment(
      context,
      createInput({ date, startTime: "09:00" }),
    );
    const locksBefore = database.journal.locks.length;

    await expect(
      createTimeBlock(database.client as never, {
        tenantId,
        timeZone,
        startAt: new Date(`${date}T12:30:00.000Z`),
        endAt: new Date(`${date}T13:30:00.000Z`),
        reason: null,
      }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_APPOINTMENT_CONFLICT" });

    // O dia foi travado antes da checagem: ela aconteceu dentro da transação.
    expect(database.journal.locks.slice(locksBefore)).toEqual([
      `${tenantId}:${date}`,
    ]);
    expect(database.tables.timeBlock.rows).toHaveLength(0);
  });

  it("recusa remover bloqueio inexistente", async () => {
    const { database } = setup();
    await expect(
      removeTimeBlock(database.client as never, {
        tenantId,
        timeZone,
        id: "block-desconhecido",
      }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_NOT_FOUND" });
  });
});

describe("agenda: retry limitado de aborto serializável", () => {
  it("repete o aborto serializável até o limite configurado", async () => {
    let attempts = 0;
    const prisma = {
      $transaction: async (run: (transaction: unknown) => Promise<string>) => {
        attempts += 1;
        if (attempts < 3) throw serializationAbort;
        return run({});
      },
    };

    const result = await runCalendarWrite(
      prisma as never,
      async () => "confirmado",
      { maxAttempts: 3 },
    );

    expect(result).toBe("confirmado");
    expect(attempts).toBe(3);
  });

  it("devolve erro próprio quando o limite de tentativas é excedido", async () => {
    let attempts = 0;
    const prisma = {
      $transaction: async () => {
        attempts += 1;
        throw serializationAbort;
      },
    };

    await expect(
      runCalendarWrite(prisma as never, async () => "nunca", {
        maxAttempts: 2,
      }),
    ).rejects.toMatchObject({
      code: "CALENDAR_WRITE_RETRY_EXCEEDED",
      statusCode: 409,
    });
    expect(attempts).toBe(2);
  });

  it("não repete erro que não seja aborto serializável", async () => {
    let attempts = 0;
    const prisma = {
      $transaction: async () => {
        attempts += 1;
        throw Object.assign(new Error("slot"), { code: "P2002" });
      },
    };

    await expect(
      runCalendarWrite(prisma as never, async () => "nunca", {
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(attempts).toBe(1);
  });

  it("reconhece 40001 e 40P01 do driver, inclusive na causa", () => {
    expect(isSerializationFailure({ code: "40001" })).toBe(true);
    expect(isSerializationFailure({ code: "40P01" })).toBe(true);
    expect(
      isSerializationFailure(
        Object.assign(new Error("prisma"), { cause: { code: "40001" } }),
      ),
    ).toBe(true);
    expect(isSerializationFailure({ code: "P2002" })).toBe(false);
  });

  it("absorve o aborto e confirma uma única vez", async () => {
    const { calendar, database } = setup();
    database.failNextTransactions(1, serializationAbort);

    const appointment = await calendar.createAppointment(
      context,
      createInput(),
    );

    expect(appointment.id).toBeTruthy();
    expect(database.tables.appointment.rows).toHaveLength(1);
  });
});

describe("agenda: idempotência gravada junto com o efeito", () => {
  it("grava resultado e referência de efeito na mesma transação do atendimento", async () => {
    const { calendar, database } = setup();

    const appointment = await calendar.createAppointment(
      context,
      createInput(),
    );

    const record = database.tables.calendarMutationIdempotency.rows[0];
    expect(record.status).toBe("COMPLETED");
    expect(record.effectEntityType).toBe("APPOINTMENT");
    expect(record.effectEntityId).toBe(appointment.id);
    const effectWrite = database.journal
      .writesFor("appointment")
      .find((write) => write.operation === "create");
    const resultWrite = database.journal
      .writesFor("idempotency")
      .find((write) => write.operation === "update");
    expect(resultWrite?.transaction).toBe(effectWrite?.transaction);
  });

  it("devolve o mesmo resultado para a chave repetida, sem segundo efeito", async () => {
    const { calendar, database } = setup();
    const input = createInput();

    const first = await calendar.createAppointment(context, input);
    const second = await calendar.createAppointment(context, input);

    expect(second.id).toBe(first.id);
    expect(database.tables.appointment.rows).toHaveLength(1);
  });

  it("recusa a mesma chave com request diferente", async () => {
    const { calendar } = setup();
    await calendar.createAppointment(context, createInput());

    await expect(
      calendar.createAppointment(
        context,
        createInput({ startTime: "11:00" }),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("recupera PENDING vencido cujo efeito já existe, em vez de reexecutar", async () => {
    const { calendar, database } = setup();
    const input = createInput();
    const appointment = await calendar.createAppointment(context, input);
    // Estado que uma queda entre o efeito e o resultado deixaria: a chave
    // aponta para o atendimento, mas a resposta não foi guardada.
    const record = database.tables.calendarMutationIdempotency.rows[0];
    record.status = "PENDING";
    record.response = null;
    record.lockedAt = new Date(Date.now() - 10 * 60 * 1_000);

    const replay = await calendar.createAppointment(context, input);

    expect(replay.id).toBe(appointment.id);
    expect(database.tables.appointment.rows).toHaveLength(1);
    expect(record.status).toBe("COMPLETED");
  });

  it("deixa FAILED com código quando a mutação falha antes do commit", async () => {
    const { calendar, database } = setup();

    await expect(
      calendar.createAppointment(
        context,
        createInput({ startTime: "07:00" }),
      ),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    const record = database.tables.calendarMutationIdempotency.rows[0];
    expect(record.status).toBe("FAILED");
    expect(record.lastErrorCode).toBe("SLOT_UNAVAILABLE");
    expect(database.tables.appointment.rows).toHaveLength(0);
  });
});

describe("agenda: sobreposição e atendimento manual", () => {
  it("aceita sobreposição de origem USER com flag e motivo", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);
    await calendar.createAppointment(
      context,
      createInput({ date, startTime: "09:00" }),
    );

    const forced = await calendar.createAppointment(
      context,
      createInput({
        date,
        startTime: "09:00",
        source: "USER",
        overlapOverride: true,
        overlapOverrideReason: "encaixe combinado no balcão",
        idempotencyKey: "key-override",
      }),
    );

    expect(forced.startTime).toBe("09:00");
    expect(database.tables.appointment.rows).toHaveLength(2);
  });

  it("recusa sobreposição pedida pela IA", async () => {
    const { calendar, database } = setup();

    await expect(
      calendar.createAppointment(
        context,
        createInput({
          source: "AI",
          overlapOverride: true,
          overlapOverrideReason: "cliente insistiu",
        }),
      ),
    ).rejects.toMatchObject({ code: "OVERLAP_OVERRIDE_NOT_ALLOWED" });
    expect(database.tables.appointment.rows).toHaveLength(0);
  });

  it("recusa sobreposição sem motivo, mesmo vinda de USER", async () => {
    const { calendar } = setup();

    await expect(
      calendar.createAppointment(
        context,
        createInput({ source: "USER", overlapOverride: true }),
      ),
    ).rejects.toMatchObject({ code: "OVERLAP_OVERRIDE_REASON_REQUIRED" });
  });

  it("aceita sobreposição de origem USER também na remarcação", async () => {
    const { calendar } = setup();
    const date = futureDate(7);
    const occupied = await calendar.createAppointment(
      context,
      createInput({ date, startTime: "09:00" }),
    );
    const moving = await calendar.createAppointment(
      context,
      createInput({
        date,
        startTime: "11:00",
        idempotencyKey: "key-create-2",
      }),
    );

    const moved = await calendar.rescheduleAppointment(context, {
      appointmentId: moving.id,
      date,
      startTime: "09:00",
      stepMinutes: 30,
      source: "USER",
      overlapOverride: true,
      overlapOverrideReason: "cliente chegou junto",
      idempotencyKey: "key-reschedule-override",
    });

    expect(moved.startTime).toBe("09:00");
    expect(moved.id).toBe(moving.id);
    expect(occupied.startTime).toBe("09:00");
  });

  it("cria atendimento manual sem serviço para USER, com título e sem total", async () => {
    const { calendar, database } = setup();

    const manual = await calendar.createAppointment(
      context,
      createInput({
        source: "USER",
        serviceIds: [],
        title: "Orçamento presencial",
        durationMinutes: 45,
      }),
    );

    expect(manual.title).toBe("Orçamento presencial");
    expect(manual.services).toEqual([]);
    expect(manual.totalPriceType).toBe("NONE");
    expect(manual.totalPrice).toBeNull();
    expect(manual.durationMinutes).toBe(45);
    expect(database.tables.appointmentItem.rows).toHaveLength(0);
  });

  it("recusa atendimento sem serviço pedido pela IA", async () => {
    const { calendar } = setup();

    await expect(
      calendar.createAppointment(
        context,
        createInput({
          source: "AI",
          serviceIds: [],
          title: "Encaixe",
          durationMinutes: 30,
        }),
      ),
    ).rejects.toMatchObject({ code: "MANUAL_APPOINTMENT_NOT_ALLOWED" });
  });

  it("recusa atendimento manual sem título ou sem duração", async () => {
    const { calendar } = setup();

    await expect(
      calendar.createAppointment(
        context,
        createInput({ source: "USER", serviceIds: [], durationMinutes: 30 }),
      ),
    ).rejects.toMatchObject({ code: "MANUAL_APPOINTMENT_TITLE_REQUIRED" });

    await expect(
      calendar.createAppointment(
        context,
        createInput({
          source: "USER",
          serviceIds: [],
          title: "Encaixe",
          idempotencyKey: "key-manual-2",
        }),
      ),
    ).rejects.toMatchObject({ code: "MANUAL_APPOINTMENT_DURATION_REQUIRED" });
  });

  it("não impõe constraint SQL de não sobreposição em nenhuma migration", () => {
    const root = join(process.cwd(), "prisma", "migrations");
    const sql = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFileSync(join(root, entry.name, "migration.sql"), "utf8"),
      )
      .join("\n");

    // Uma constraint de exclusão por intervalo eliminaria justamente o
    // override humano, que é decisão de produto.
    expect(sql).not.toMatch(/EXCLUDE\s+USING/i);
    expect(sql).not.toMatch(/tstzrange|tsrange/i);
  });

  it("a fonte externa mantém a interface e recusa as operações novas", async () => {
    const provider = new MinhaAgendaCalendarProvider({
      tenantId,
      baseUrl: "https://example.invalid",
      basicAuth: "basic",
      username: "user",
      password: "secret",
      employeeId: 1,
      paymentMethod: "dinheiro",
      modelVersion: 2,
      timeoutMs: 1_000,
      refreshSkewSeconds: 300,
      enableWrites: true,
      bufferBetweenServicesMinutes: 0,
    });

    await expect(
      provider.createAppointment({
        serviceIds: [serviceId],
        date: futureDate(7),
        startTime: "09:00",
        customerName: "Ana",
        customerPhone: "+5511999990000",
        stepMinutes: 30,
        idempotencyKey: "key-external",
        source: "USER",
        overlapOverride: true,
        overlapOverrideReason: "encaixe",
      }),
    ).rejects.toMatchObject({
      code: "EXTERNAL_CALENDAR_OVERLAP_OVERRIDE_UNSUPPORTED",
    });

    await expect(
      provider.createAppointment({
        serviceIds: [],
        date: futureDate(7),
        startTime: "09:00",
        customerName: "Ana",
        customerPhone: "+5511999990000",
        stepMinutes: 30,
        idempotencyKey: "key-external-2",
        source: "USER",
        title: "Encaixe",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({
      code: "EXTERNAL_CALENDAR_MANUAL_APPOINTMENT_UNSUPPORTED",
    });
  });
});

describe("agenda: replay antigo da idempotência", () => {
  it("deriva totalPriceType de totalPrice quando o replay não traz o campo", async () => {
    const { calendar, database } = setup();
    const input = createInput();
    await calendar.createAppointment(context, input);
    const record = database.tables.calendarMutationIdempotency.rows[0];
    const stored = record.response as Record<string, unknown>;
    delete stored.totalPriceType;
    delete stored.title;
    stored.totalPrice = 120;

    const replay = await calendar.createAppointment(context, input);

    expect(replay.totalPriceType).toBe("FIXED");
    expect(replay.totalPrice).toBe(120);
    expect(replay.title).toBeNull();
  });

  it("decodifica replay antigo sem total como NONE", async () => {
    const { calendar, database } = setup();
    const input = createInput();
    await calendar.createAppointment(context, input);
    const record = database.tables.calendarMutationIdempotency.rows[0];
    const stored = record.response as Record<string, unknown>;
    delete stored.totalPriceType;
    stored.totalPrice = null;

    const replay = await calendar.createAppointment(context, input);

    expect(replay.totalPriceType).toBe("NONE");
    expect(replay.totalPrice).toBeNull();
  });
});
