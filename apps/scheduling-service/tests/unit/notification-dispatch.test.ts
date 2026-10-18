import { describe, expect, it } from "vitest";

import { AvenlyAppointmentLifecycleService } from "../../src/modules/appointments/appointment-lifecycle-service.js";
import {
  claimDueNotificationIntents,
  NOTIFICATION_INTENT_LEASE_LOST,
  NOTIFICATION_SETTLEMENT_INVALID,
  notificationCorrelationId,
  renewNotificationIntentLease,
  settleNotificationIntent,
} from "../../src/modules/reminders/notification-dispatch-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

/**
 * Reivindicação, revalidação e liquidação das intenções de envio (Goal021,
 * WU-005).
 *
 * Aqui se prova a **regra**: o que a revalidação decide contra o estado do
 * momento, o que o lease vencido faz com a tentativa, que liquidar duas vezes
 * é inócuo, que os dois tetos limitam o lote e que os fatos saem prontos do
 * dono. Concorrência real de duas varreduras, `now()` do servidor e o dedupe
 * por índice único são da suíte de integração, contra PostgreSQL — o dublê
 * não os prova e não é usado para afirmar que provou.
 */

const timeZone = "America/Sao_Paulo";
const owner = "scheduling:test:a";

type Database = ReturnType<typeof createDatabaseDouble>;

interface TenantOptions {
  timezone?: string;
  pricePolicy?: "NEVER" | "WHEN_FIXED";
  confirmationEnabled?: boolean;
  messageExample?: string | null;
  /** Ausente é "nunca configurou": vale o default do produto (um, 24h). */
  rules?: Array<{ slot: "FIRST" | "SECOND"; leadMinutes: number }>;
}

function seedTenant(
  database: Database,
  tenantId: string,
  options: TenantOptions = {},
): void {
  database.tables.calendarSettings.rows.push({
    id: tenantId,
    tenantId,
    source: "AVENLY",
    timezone: options.timezone ?? timeZone,
  });
  if (
    options.rules === undefined &&
    options.pricePolicy === undefined &&
    options.confirmationEnabled === undefined &&
    options.messageExample === undefined
  ) {
    return;
  }
  database.tables.reminderSettings.rows.push({
    id: tenantId,
    tenantId,
    confirmationEnabled: options.confirmationEnabled ?? false,
    pricePolicy: options.pricePolicy ?? "NEVER",
    messageExample: options.messageExample ?? null,
  });
  for (const rule of options.rules ?? [{ slot: "FIRST", leadMinutes: 1440 }]) {
    database.tables.reminderRule.rows.push({
      id: `${tenantId}-${rule.slot}`,
      tenantId,
      slot: rule.slot,
      leadMinutes: rule.leadMinutes,
    });
  }
}

interface AppointmentOptions {
  id: string;
  tenantId: string;
  startAt: Date;
  status?: string;
  notifiableVersion?: number;
  customerName?: string | null;
  customerPhone?: string | null;
  items?: Array<{
    name: string;
    priceType: "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";
    price: number | null;
  }>;
}

function seedAppointment(
  database: Database,
  options: AppointmentOptions,
): string {
  const customerId = `${options.id}-customer`;
  database.tables.customer.rows.push({
    id: customerId,
    tenantId: options.tenantId,
    name: options.customerName === undefined ? "Ana" : options.customerName,
    phone:
      options.customerPhone === undefined
        ? "+5511999990000"
        : options.customerPhone,
    normalizedPhone: null,
  });
  database.tables.appointment.rows.push({
    id: options.id,
    tenantId: options.tenantId,
    customerId,
    source: "USER",
    status: options.status ?? "CONFIRMED",
    startAt: options.startAt,
    endAt: new Date(options.startAt.getTime() + 3_600_000),
    createdBy: "user-1",
    comments: null,
    notifiableVersion: options.notifiableVersion ?? 1,
    // Colunas de ciclo de vida explícitas: no banco elas são `NULL`, e o
    // dublê filtra a linha crua — uma fixture que as omitisse não casaria com
    // `presenceConfirmedAt IS NULL`.
    completedAt: null,
    completedBy: null,
    completionOrigin: null,
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    finalValue: null,
    finalValueSetAt: null,
    finalValueSetBy: null,
  });
  const items = options.items ?? [
    { name: "Corte", priceType: "FIXED" as const, price: 50 },
  ];
  items.forEach((item, index) => {
    database.tables.appointmentItem.rows.push({
      id: `${options.id}-item-${index}`,
      tenantId: options.tenantId,
      appointmentId: options.id,
      serviceId: `service-${index}`,
      serviceNameSnapshot: item.name,
      durationMinutesSnapshot: 60,
      priceTypeSnapshot: item.priceType,
      priceSnapshot: item.price,
    });
  });
  return customerId;
}

interface IntentOptions {
  id: string;
  tenantId: string;
  appointmentId: string;
  kind?: "REMINDER" | "CHANGE_NOTICE";
  slot?: "FIRST" | "SECOND" | "CHANGE_NOTICE";
  appointmentVersion?: number;
  dueAt?: Date;
  state?: string;
  attemptCount?: number;
  leaseOwner?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: Date | null;
}

/**
 * Linha de intenção como o banco a guarda — com estado, tentativa e lease
 * explícitos. O dublê filtra a linha **crua**, então uma fixture que omitisse
 * `state` não casaria com `state = 'PENDING'`, exatamente como uma coluna
 * `NOT NULL` não fica vazia no PostgreSQL.
 */
function seedIntent(database: Database, options: IntentOptions): string {
  const kind = options.kind ?? "REMINDER";
  database.tables.appointmentNotificationIntent.rows.push({
    id: options.id,
    tenantId: options.tenantId,
    appointmentId: options.appointmentId,
    kind,
    slot: options.slot ?? (kind === "REMINDER" ? "FIRST" : "CHANGE_NOTICE"),
    appointmentVersion: options.appointmentVersion ?? 1,
    state: options.state ?? "PENDING",
    reason: null,
    dueAt: options.dueAt ?? new Date(Date.now() - 60_000),
    facts: null,
    attemptCount: options.attemptCount ?? 0,
    lastAttemptAt: null,
    leaseOwner: options.leaseOwner ?? null,
    leaseToken: options.leaseToken ?? null,
    leaseAcquiredAt: null,
    leaseExpiresAt: options.leaseExpiresAt ?? null,
    leaseHeartbeatAt: null,
    outboundCorrelationId: null,
    sentAt: null,
    settledAt: null,
    detail: null,
  });
  return options.id;
}

function intentRow(database: Database, id: string) {
  const row = database.tables.appointmentNotificationIntent.rows.find(
    (candidate) => candidate.id === id,
  );
  if (!row) throw new Error(`intent ${id} not found`);
  return row;
}

const inAnHour = () => new Date(Date.now() + 3_600_000);

describe("reivindicação das intenções de envio", () => {
  it("cancela a intenção cuja versão divergiu, em vez de enviá-la", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
      // O compromisso foi remarcado: a política única de escrita já subiu a
      // versão, e a intenção da versão 1 fala de um horário que não existe.
      notifiableVersion: 2,
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
      appointmentVersion: 1,
    });

    const result = await claimDueNotificationIntents(
      database.client as never,
      { owner },
    );

    expect(result.claimed).toHaveLength(0);
    expect(result.settled).toEqual([
      {
        id: "intent-1",
        tenantId: "tenant-a",
        appointmentId: "appointment-1",
        state: "CANCELLED",
        reason: "APPOINTMENT_VERSION_SUPERSEDED",
      },
    ]);
    const row = intentRow(database, "intent-1");
    expect(row.state).toBe("CANCELLED");
    expect(row.settledAt).toBeInstanceOf(Date);
    // Estado terminal não guarda lease: o banco amarra os dois.
    expect(row.leaseOwner).toBeNull();
    expect(row.leaseToken).toBeNull();
  });

  it("cancela o lembrete de compromisso cancelado e o de compromisso já começado", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "cancelled",
      tenantId: "tenant-a",
      startAt: inAnHour(),
      status: "CANCELLED",
    });
    seedAppointment(database, {
      id: "started",
      tenantId: "tenant-a",
      startAt: new Date(Date.now() - 600_000),
    });
    seedIntent(database, {
      id: "intent-cancelled",
      tenantId: "tenant-a",
      appointmentId: "cancelled",
    });
    seedIntent(database, {
      id: "intent-started",
      tenantId: "tenant-a",
      appointmentId: "started",
    });

    const result = await claimDueNotificationIntents(
      database.client as never,
      { owner },
    );

    expect(result.claimed).toHaveLength(0);
    expect(
      result.settled.map((intent) => [intent.id, intent.reason]),
    ).toEqual([
      ["intent-cancelled", "APPOINTMENT_CANCELLED"],
      ["intent-started", "APPOINTMENT_ALREADY_STARTED"],
    ]);
  });

  it("entrega o aviso de alteração de um compromisso cancelado, que é do que ele fala", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
      status: "CANCELLED",
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
      kind: "CHANGE_NOTICE",
    });

    const result = await claimDueNotificationIntents(
      database.client as never,
      { owner },
    );

    expect(result.settled).toHaveLength(0);
    expect(result.claimed).toHaveLength(1);
    expect(result.claimed[0].facts.appointmentStatus).toBe("CANCELLED");
  });

  it("dispensa com motivo o cliente sem telefone, sem erro", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
      customerPhone: null,
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
    });

    const result = await claimDueNotificationIntents(
      database.client as never,
      { owner },
    );

    expect(result.claimed).toHaveLength(0);
    expect(result.settled[0]).toMatchObject({
      state: "DISMISSED",
      reason: "CUSTOMER_WITHOUT_PHONE",
    });
    expect(intentRow(database, "intent-1").state).toBe("DISMISSED");
  });

  it("dispensa a posição de lembrete que a configuração do negócio deixou de prever", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a", {
      rules: [{ slot: "FIRST", leadMinutes: 1440 }],
    });
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
      slot: "SECOND",
    });

    const result = await claimDueNotificationIntents(
      database.client as never,
      { owner },
    );

    expect(result.settled[0]).toMatchObject({
      state: "DISMISSED",
      reason: "REMINDER_CONFIGURATION_CHANGED",
    });
  });

  it("não reivindica duas vezes a mesma intenção", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
    });

    const first = await claimDueNotificationIntents(database.client as never, {
      owner: "scheduling:sweep-a",
    });
    const second = await claimDueNotificationIntents(database.client as never, {
      owner: "scheduling:sweep-b",
    });

    expect(first.claimed.map((intent) => intent.id)).toEqual(["intent-1"]);
    // A segunda varredura não encontra mais a condição `state = 'PENDING'`.
    expect(second.claimed).toHaveLength(0);
    expect(second.settled).toHaveLength(0);
    const row = intentRow(database, "intent-1");
    expect(row.state).toBe("CLAIMED");
    expect(row.leaseOwner).toBe("scheduling:sweep-a");
    expect(row.leaseToken).toBe(first.claimed[0].leaseToken);
  });

  it("respeita o teto por varredura e o teto por negócio", async () => {
    const database = createDatabaseDouble();
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      seedTenant(database, tenantId);
      for (let index = 0; index < 3; index += 1) {
        seedAppointment(database, {
          id: `${tenantId}-appointment-${index}`,
          tenantId,
          startAt: inAnHour(),
        });
        seedIntent(database, {
          id: `${tenantId}-intent-${index}`,
          tenantId,
          appointmentId: `${tenantId}-appointment-${index}`,
          dueAt: new Date(Date.now() - 600_000 + index * 1_000),
        });
      }
    }

    const fair = await claimDueNotificationIntents(database.client as never, {
      owner,
      limit: 10,
      perTenantLimit: 2,
    });
    expect(fair.claimed).toHaveLength(4);
    expect(
      fair.claimed.filter((intent) => intent.tenantId === "tenant-a"),
    ).toHaveLength(2);
    expect(
      fair.claimed.filter((intent) => intent.tenantId === "tenant-b"),
    ).toHaveLength(2);

    // O que sobrou de cada negócio espera a próxima varredura, e o teto de
    // lote limita também ela.
    const next = await claimDueNotificationIntents(database.client as never, {
      owner,
      limit: 1,
      perTenantLimit: 2,
    });
    expect(next.claimed).toHaveLength(1);
  });

  it("deixa como está a intenção de negócio sem agenda configurada", async () => {
    const database = createDatabaseDouble();
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
    });

    const result = await claimDueNotificationIntents(
      database.client as never,
      { owner },
    );

    expect(result.skipped).toBe(1);
    expect(result.claimed).toHaveLength(0);
    expect(intentRow(database, "intent-1").state).toBe("PENDING");
  });
});

describe("fatos compostos pelo dono", () => {
  it("leva data e hora já formatadas no fuso do negócio, com o instante junto", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a", {
      confirmationEnabled: true,
      rules: [{ slot: "FIRST", leadMinutes: 1440 }],
    });
    // 12:00 UTC é 09:00 em São Paulo: quem formata é o dono, e o instante
    // segue junto para quem precisar recalcular.
    const startAt = new Date("2026-12-10T12:00:00.000Z");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt,
      customerName: "Ana",
      customerPhone: " +5511999990000 ",
      items: [
        { name: "Corte", priceType: "FIXED", price: 50 },
        { name: "Escova", priceType: "FIXED", price: 30 },
      ],
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
    });

    const result = await claimDueNotificationIntents(
      database.client as never,
      { owner },
    );

    const facts = result.claimed[0].facts;
    expect(facts.date).toBe("2026-12-10");
    expect(facts.time).toBe("09:00");
    expect(facts.timezone).toBe(timeZone);
    expect(facts.startAt).toBe(startAt.toISOString());
    expect(facts.customerName).toBe("Ana");
    expect(facts.customerPhone).toBe("+5511999990000");
    expect(facts.services).toEqual(["Corte", "Escova"]);
    expect(facts.confirmationRequested).toBe(true);
    // Nunca texto de lembrete e nunca endereço: a composição por estilo é da
    // entrega, e o endereço não é repetido automaticamente.
    expect(Object.keys(facts)).not.toContain("address");
    expect(Object.keys(facts)).not.toContain("message");
    expect(result.claimed[0].correlationId).toBe(
      notificationCorrelationId({
        appointmentId: "appointment-1",
        kind: "REMINDER",
        slot: "FIRST",
        appointmentVersion: 1,
      }),
    );
    expect(intentRow(database, "intent-1").facts).toMatchObject({
      date: "2026-12-10",
      time: "09:00",
    });
  });

  it("leva a mensagem de exemplo da profissional só no lembrete (D-197)", async () => {
    const example = "Oii, {nome}! 💛\n\nTe espero {data}, às {hora}, para {servico}.";
    async function exampleFor(kind: "REMINDER" | "CHANGE_NOTICE") {
      const database = createDatabaseDouble();
      seedTenant(database, "tenant-a", { messageExample: example });
      seedAppointment(database, {
        id: "appointment-1",
        tenantId: "tenant-a",
        startAt: new Date("2026-12-10T12:00:00.000Z"),
        customerName: "Ana",
        customerPhone: "+5511999990000",
      });
      seedIntent(database, {
        id: "intent-1",
        tenantId: "tenant-a",
        appointmentId: "appointment-1",
        kind,
      });
      const result = await claimDueNotificationIntents(
        database.client as never,
        { owner },
      );
      return result.claimed[0]?.facts.messageExample;
    }

    expect(await exampleFor("REMINDER")).toBe(example);
    // O aviso de alteração não é lembrete: segue a voz do estilo, sem exemplo.
    expect(await exampleFor("CHANGE_NOTICE")).toBeNull();
  });

  it("só leva preço quando a política é mostrar e o acordo inteiro tem preço fixo", async () => {
    async function priceFor(
      pricePolicy: "NEVER" | "WHEN_FIXED",
      priceType: "FIXED" | "STARTING_AT",
    ): Promise<number | null> {
      const database = createDatabaseDouble();
      seedTenant(database, "tenant-a", {
        pricePolicy,
        rules: [{ slot: "FIRST", leadMinutes: 1440 }],
      });
      seedAppointment(database, {
        id: "appointment-1",
        tenantId: "tenant-a",
        startAt: inAnHour(),
        items: [{ name: "Corte", priceType, price: 50 }],
      });
      seedIntent(database, {
        id: "intent-1",
        tenantId: "tenant-a",
        appointmentId: "appointment-1",
      });
      const result = await claimDueNotificationIntents(
        database.client as never,
        { owner },
      );
      return result.claimed[0].facts.price;
    }

    expect(await priceFor("WHEN_FIXED", "FIXED")).toBe(50);
    expect(await priceFor("WHEN_FIXED", "STARTING_AT")).toBeNull();
    expect(await priceFor("NEVER", "FIXED")).toBeNull();
  });
});

describe("lease vencido", () => {
  it("devolve a intenção para pendente com a tentativa contada", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
      state: "CLAIMED",
      attemptCount: 0,
      leaseOwner: "scheduling:morto",
      leaseToken: "token-morto",
      leaseExpiresAt: new Date(Date.now() - 1_000),
    });

    const result = await claimDueNotificationIntents(database.client as never, {
      owner,
      maxAttempts: 3,
    });

    expect(result.released).toBe(1);
    expect(result.exhausted).toBe(0);
    // Devolvida para pendente e, por isso mesmo, reivindicável de novo — com
    // a tentativa anterior já contada e sob um lease novo.
    expect(result.claimed).toHaveLength(1);
    expect(result.claimed[0].attemptCount).toBe(1);
    const row = intentRow(database, "intent-1");
    expect(row.leaseOwner).toBe(owner);
    expect(row.leaseToken).not.toBe("token-morto");
  });

  it("vira falha com motivo quando as tentativas se esgotam, sem desaparecer", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
      state: "CLAIMED",
      attemptCount: 2,
      leaseOwner: "scheduling:morto",
      leaseToken: "token-morto",
      leaseExpiresAt: new Date(Date.now() - 1_000),
    });

    const result = await claimDueNotificationIntents(database.client as never, {
      owner,
      maxAttempts: 3,
    });

    expect(result.exhausted).toBe(1);
    expect(result.released).toBe(0);
    expect(result.claimed).toHaveLength(0);
    const row = intentRow(database, "intent-1");
    expect(row.state).toBe("FAILED");
    expect(row.reason).toBe("ATTEMPTS_EXHAUSTED");
    expect(row.attemptCount).toBe(3);
    expect(row.settledAt).toBeInstanceOf(Date);
    expect(row.leaseOwner).toBeNull();
  });

  it("não renova lease vencido nem lease de outro dono", async () => {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
    });
    const claim = await claimDueNotificationIntents(database.client as never, {
      owner,
      leaseTtlSeconds: 60,
    });
    const claimed = claim.claimed[0];

    const renewed = await renewNotificationIntentLease(
      database.client as never,
      {
        tenantId: "tenant-a",
        intentId: claimed.id,
        leaseToken: claimed.leaseToken,
      },
    );
    expect(renewed).toBeInstanceOf(Date);

    const alheio = await renewNotificationIntentLease(
      database.client as never,
      {
        tenantId: "tenant-a",
        intentId: claimed.id,
        leaseToken: "token-de-outro",
      },
    );
    expect(alheio).toBeNull();

    database.advanceDatabaseClock(10 * 60_000);
    const vencido = await renewNotificationIntentLease(
      database.client as never,
      {
        tenantId: "tenant-a",
        intentId: claimed.id,
        leaseToken: claimed.leaseToken,
      },
    );
    expect(vencido).toBeNull();
  });
});

describe("liquidação", () => {
  async function claimOne() {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
    });
    seedIntent(database, {
      id: "intent-1",
      tenantId: "tenant-a",
      appointmentId: "appointment-1",
    });
    const result = await claimDueNotificationIntents(
      database.client as never,
      { owner },
    );
    return { database, claimed: result.claimed[0] };
  }

  it("é inócua quando repetida: não reverte o terminal nem soma tentativa", async () => {
    const { database, claimed } = await claimOne();

    const first = await settleNotificationIntent(database.client as never, {
      tenantId: "tenant-a",
      intentId: claimed.id,
      leaseToken: claimed.leaseToken,
      outcome: "SENT",
      correlationId: claimed.correlationId,
    });
    expect(first.applied).toBe(true);
    expect(first.intent.state).toBe("SENT");
    expect(first.intent.attemptCount).toBe(1);
    expect(first.intent.sentAt).not.toBeNull();

    const second = await settleNotificationIntent(database.client as never, {
      tenantId: "tenant-a",
      intentId: claimed.id,
      leaseToken: claimed.leaseToken,
      outcome: "FAILED",
      reason: "TRANSPORT_FAILED",
    });
    expect(second.applied).toBe(false);
    expect(second.intent.state).toBe("SENT");
    expect(second.intent.attemptCount).toBe(1);
    expect(second.intent.reason).toBeNull();
    const row = intentRow(database, claimed.id);
    expect(row.state).toBe("SENT");
    expect(row.attemptCount).toBe(1);
  });

  it("registra a falha auditável com motivo e devolve o lease", async () => {
    const { database, claimed } = await claimOne();

    const settled = await settleNotificationIntent(database.client as never, {
      tenantId: "tenant-a",
      intentId: claimed.id,
      leaseToken: claimed.leaseToken,
      outcome: "FAILED",
      reason: "CHANNEL_NOT_CONNECTED",
      detail: "whatsapp channel disconnected",
    });

    expect(settled.applied).toBe(true);
    expect(settled.intent).toMatchObject({
      state: "FAILED",
      reason: "CHANNEL_NOT_CONNECTED",
      detail: "whatsapp channel disconnected",
      attemptCount: 1,
      sentAt: null,
    });
    const row = intentRow(database, claimed.id);
    expect(row.leaseOwner).toBeNull();
    expect(row.settledAt).toBeInstanceOf(Date);
  });

  it("recusa quem não detém mais o lease", async () => {
    const { database, claimed } = await claimOne();

    await expect(
      settleNotificationIntent(database.client as never, {
        tenantId: "tenant-a",
        intentId: claimed.id,
        leaseToken: "token-de-outro",
        outcome: "SENT",
      }),
    ).rejects.toMatchObject({ code: NOTIFICATION_INTENT_LEASE_LOST });
    expect(intentRow(database, claimed.id).state).toBe("CLAIMED");
  });

  it("recusa desfecho e motivo incoerentes, como a constraint do banco", async () => {
    const { database, claimed } = await claimOne();

    await expect(
      settleNotificationIntent(database.client as never, {
        tenantId: "tenant-a",
        intentId: claimed.id,
        leaseToken: claimed.leaseToken,
        outcome: "DISMISSED",
      }),
    ).rejects.toMatchObject({ code: NOTIFICATION_SETTLEMENT_INVALID });

    await expect(
      settleNotificationIntent(database.client as never, {
        tenantId: "tenant-a",
        intentId: claimed.id,
        leaseToken: claimed.leaseToken,
        outcome: "SENT",
        reason: "TRANSPORT_FAILED",
      }),
    ).rejects.toMatchObject({ code: NOTIFICATION_SETTLEMENT_INVALID });
  });
});

describe("confirmação de presença", () => {
  function setupPresence() {
    const database = createDatabaseDouble();
    seedTenant(database, "tenant-a");
    seedAppointment(database, {
      id: "appointment-1",
      tenantId: "tenant-a",
      startAt: inAnHour(),
    });
    return {
      database,
      lifecycle: new AvenlyAppointmentLifecycleService(
        database.client as never,
        "tenant-a",
        "user-1",
      ),
    };
  }

  it("grava a origem derivada do chamador, não o 'USER' literal", async () => {
    const { database, lifecycle } = setupPresence();

    await lifecycle.confirmPresence("appointment-1", "AI");

    const events = database.tables.appointmentEvent.rows.filter(
      (row) => row.type === "PRESENCE_CONFIRMED",
    );
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("AI");
  });

  it("não altera status, conclusão nem cancelamento", async () => {
    const { database, lifecycle } = setupPresence();

    const snapshot = await lifecycle.confirmPresence("appointment-1", "AI");

    expect(snapshot.status).toBe("CONFIRMED");
    expect(snapshot.completedAt).toBeNull();
    expect(snapshot.noShowAt).toBeNull();
    expect(snapshot.presenceConfirmedAt).not.toBeNull();
    const appointment = database.tables.appointment.rows.find(
      (row) => row.id === "appointment-1",
    );
    expect(appointment?.status).toBe("CONFIRMED");
    expect(appointment?.completedAt ?? null).toBeNull();
    // Presença não é campo notificável: a versão não se move, então nenhuma
    // intenção é recomputada por ela (Goal021).
    expect(appointment?.notifiableVersion).toBe(1);
    expect(
      database.tables.appointmentNotificationIntent.rows,
    ).toHaveLength(0);
  });
});
