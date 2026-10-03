/**
 * Goal103: o Scheduling passa a trazer o ciclo de vida na listagem, e o
 * cliente da IA não pode decodificá-lo. `finalValue` e `noShowNote` são dado
 * do negócio que a IA não tem por que ler nem repetir ao cliente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import { SchedulingClient } from "../src/modules/scheduling-service/client.js";
import type { SchedulingRequestContext } from "../src/modules/scheduling-service/types.js";
import { normalizeBusinessContext } from "../src/modules/tenant-config/business-context.js";

const context: SchedulingRequestContext = {
  tenantId: "tenant-1",
  userId: "user-1",
  requestId: "request-1",
};

const businessContext = normalizeBusinessContext({
  version: 1,
  businessName: "Studio",
  timezone: "America/Sao_Paulo",
});

function appointmentWithLifecycle() {
  return {
    id: "appointment-1",
    title: null,
    date: "2026-10-10",
    startTime: "09:00",
    endTime: "09:30",
    durationMinutes: 30,
    customerId: "customer-1",
    customer: { id: "customer-1", name: "Ana", phone: "5511999990000" },
    services: [
      {
        serviceId: "service-1",
        name: "Corte",
        durationMinutes: 30,
        priceType: "FIXED",
        price: 80,
      },
    ],
    totalPrice: 80,
    totalPriceType: "FIXED",
    comments: null,
    status: "NO_SHOW",
    completedAt: "2026-10-10T12:30:00.000Z",
    completionOrigin: "MANUAL",
    noShowAt: "2026-10-10T13:00:00.000Z",
    noShowNote: "Avisou tarde",
    presenceConfirmedAt: "2026-10-09T18:00:00.000Z",
    finalValue: 149.9,
  };
}

describe("Goal103: ciclo de vida não chega à IA", () => {
  const originalCommandToken = env.SCHEDULING_SERVICE_COMMAND_TOKEN;
  const originalFetch = global.fetch;

  beforeEach(() => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = "test-command-token";
    global.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: [appointmentWithLifecycle()] }), {
          status: 200,
        }),
    );
  });

  afterEach(() => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = originalCommandToken;
    global.fetch = originalFetch;
  });

  it("o agendamento decodificado por cliente não tem finalValue nem noShowNote", async () => {
    const appointments = await new SchedulingClient().findFutureAppointmentsForCustomer(
      "customer-1",
      businessContext,
      context,
    );

    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toMatchObject({ id: "appointment-1", price: 80 });
    expect(appointments[0]).not.toHaveProperty("finalValue");
    expect(appointments[0]).not.toHaveProperty("noShowNote");
  });

  it("o agendamento decodificado por telefone não tem finalValue nem noShowNote", async () => {
    const appointments = await new SchedulingClient().findFutureAppointmentsForPhone(
      "5511999990000",
      businessContext,
      context,
    );

    expect(appointments).toHaveLength(1);
    expect(appointments[0]).not.toHaveProperty("finalValue");
    expect(appointments[0]).not.toHaveProperty("noShowNote");
  });
});
