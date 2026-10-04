import { describe, expect, it } from "vitest";

import { AvenlyCustomerService } from "../../src/modules/customers/avenly-customer-service.js";
import { CalendarRemovalService } from "../../src/modules/calendar/removal.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";

function build() {
  const database = createDatabaseDouble();
  return {
    database,
    customers: new AvenlyCustomerService(database.client as never, tenantId),
    removal: new CalendarRemovalService(database.client as never, tenantId),
  };
}

async function personWithAppointment(harness: ReturnType<typeof build>) {
  const person = await harness.customers.create({
    name: "Avenly (teste)",
    phone: "5511911112222",
  });
  const created = await harness.database.client.appointment.create({
    data: {
      tenantId,
      customerId: person.id,
      source: "AI",
      startAt: new Date("2026-09-16T12:00:00.000Z"),
      endAt: new Date("2026-09-16T13:00:00.000Z"),
      status: "CONFIRMED",
      statusRaw: "CONFIRMED",
      createdBy: "ai",
    },
  });
  return { person, appointment: created };
}

/**
 * O atendimento como a IA o cria: com item do acordo e com historico.
 *
 * Nenhum atendimento real nasce pelado. `createAppointment` grava o
 * `AppointmentItem` do servico e o `AppointmentEvent` `CREATED` na mesma
 * transacao, e os dois apontam para o atendimento com `onDelete: Restrict`.
 * Remover contra uma fixture sem filho nao prova nada — era assim que a
 * remocao passava no dublê e quebrava em producao.
 */
async function realisticAppointment(harness: ReturnType<typeof build>) {
  const created = await personWithAppointment(harness);
  await harness.database.client.appointmentItem.create({
    data: {
      tenantId,
      appointmentId: created.appointment.id,
      serviceId: "service-1",
      serviceNameSnapshot: "Corte",
      durationMinutesSnapshot: 60,
      priceTypeSnapshot: "FIXED",
      priceSnapshot: 120,
    },
  });
  await harness.database.client.appointmentEvent.create({
    data: {
      tenantId,
      appointmentId: created.appointment.id,
      type: "CREATED",
      source: "AI",
      actor: "ai",
    },
  });
  return created;
}

/**
 * Remoção definitiva por ID (Goal019).
 *
 * O fluxo do teste de ativação no vault termina com o agendamento de teste e a
 * pessoa de teste **removidos**. Cancelar não é remover — um atendimento
 * cancelado continua na agenda —, e é isso que estes testes travam: eles falham
 * se a remoção voltar a ser só cancelamento, e falham se ela passar a alcançar
 * linha que o chamador não nomeou.
 */
describe("remoção definitiva do atendimento", () => {
  /**
   * Blocker 3 da rodada 2 do Goal019.
   *
   * `appointment.delete` direto viola `AppointmentItem_appointment_fkey` e
   * `AppointmentEvent_appointment_fkey` (`ON DELETE RESTRICT`): o agendamento
   * de teste **nunca** era removido em producao, e a limpeza relatava sucesso.
   * Este teste falha se a remoção voltar a apagar só a linha do atendimento.
   */
  it("apaga o atendimento que tem item e histórico, sem esbarrar na FK", async () => {
    const harness = build();
    const { appointment } = await realisticAppointment(harness);

    expect(await harness.removal.deleteAppointment(appointment.id)).toBe(true);

    expect(
      await harness.database.client.appointment.count({ where: { tenantId } }),
    ).toBe(0);
    // O que pendia exclusivamente dele saiu junto, na mesma operação.
    expect(
      await harness.database.client.appointmentItem.count({
        where: { tenantId, appointmentId: appointment.id },
      }),
    ).toBe(0);
    expect(
      await harness.database.client.appointmentEvent.count({
        where: { tenantId, appointmentId: appointment.id },
      }),
    ).toBe(0);
  });

  it("não toca item nem histórico de outro atendimento", async () => {
    const harness = build();
    const mine = await realisticAppointment(harness);
    const other = await realisticAppointment(harness);

    await harness.removal.deleteAppointment(mine.appointment.id);

    expect(
      await harness.database.client.appointmentItem.count({
        where: { tenantId, appointmentId: other.appointment.id },
      }),
    ).toBe(1);
    expect(
      await harness.database.client.appointmentEvent.count({
        where: { tenantId, appointmentId: other.appointment.id },
      }),
    ).toBe(1);
  });

  it("apaga o atendimento nomeado e deixa os outros de pé", async () => {
    const harness = build();
    const mine = await personWithAppointment(harness);
    const other = await personWithAppointment(harness);

    expect(await harness.removal.deleteAppointment(mine.appointment.id)).toBe(
      true,
    );

    const remaining = await harness.database.client.appointment.findMany({
      where: { tenantId },
    });
    expect(remaining.map((row: { id: string }) => row.id)).toEqual([
      other.appointment.id,
    ]);
  });

  it("remover de novo é no-op, não erro", async () => {
    const harness = build();
    const { appointment } = await personWithAppointment(harness);

    expect(await harness.removal.deleteAppointment(appointment.id)).toBe(true);
    expect(await harness.removal.deleteAppointment(appointment.id)).toBe(false);
  });

  it("atendimento de outro negócio não é alcançável", async () => {
    const harness = build();
    const { appointment } = await personWithAppointment(harness);
    const otherTenant = new CalendarRemovalService(
      harness.database.client as never,
      "tenant-b",
    );

    expect(await otherTenant.deleteAppointment(appointment.id)).toBe(false);
    expect(
      await harness.database.client.appointment.count({ where: { tenantId } }),
    ).toBe(1);
  });
});

describe("remoção definitiva da pessoa", () => {
  it("apaga a pessoa nomeada quando ela não tem mais atendimento", async () => {
    const harness = build();
    const { person, appointment } = await realisticAppointment(harness);
    await harness.removal.deleteAppointment(appointment.id);

    expect(await harness.removal.deleteCustomer(person.id)).toBe(true);
    expect(
      await harness.database.client.customer.count({ where: { tenantId } }),
    ).toBe(0);
  });

  it("recusa enquanto sobrar atendimento: apagar arrastaria histórico de agenda", async () => {
    const harness = build();
    const { person } = await personWithAppointment(harness);

    await expect(harness.removal.deleteCustomer(person.id)).rejects.toThrow(
      AppError,
    );
    await expect(harness.removal.deleteCustomer(person.id)).rejects.toMatchObject(
      { code: "CUSTOMER_HAS_APPOINTMENTS" },
    );
    expect(
      await harness.database.client.customer.count({ where: { tenantId } }),
    ).toBe(1);
  });

  it("remover de novo é no-op, não erro", async () => {
    const harness = build();
    const { person, appointment } = await personWithAppointment(harness);
    await harness.removal.deleteAppointment(appointment.id);

    expect(await harness.removal.deleteCustomer(person.id)).toBe(true);
    expect(await harness.removal.deleteCustomer(person.id)).toBe(false);
  });

  it("pessoa de outro negócio não é alcançável", async () => {
    const harness = build();
    const { person, appointment } = await personWithAppointment(harness);
    await harness.removal.deleteAppointment(appointment.id);
    const otherTenant = new CalendarRemovalService(
      harness.database.client as never,
      "tenant-b",
    );

    expect(await otherTenant.deleteCustomer(person.id)).toBe(false);
    expect(
      await harness.database.client.customer.count({ where: { tenantId } }),
    ).toBe(1);
  });
});
