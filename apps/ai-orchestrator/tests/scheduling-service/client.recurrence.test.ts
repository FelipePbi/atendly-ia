/**
 * Recorrência ofertável (Goal011, resíduo dos reviews 007/009).
 *
 * `/internal/services` carrega `recurrenceIntervalDays`; `SchedulingClient`
 * não pode descartar o campo ao decodificar a resposta, senão `list_services`
 * nunca teria como oferecer a série recorrente. Ausência do campo (resposta
 * anterior a este Goal) vira `null`, nunca um intervalo inventado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../src/config/env.js";
import { SchedulingClient } from "../../src/modules/scheduling-service/client.js";
import type { SchedulingRequestContext } from "../../src/modules/scheduling-service/types.js";

const context: SchedulingRequestContext = {
  tenantId: "tenant-1",
  userId: "user-1",
  requestId: "request-1",
};

function serviceResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "service-1",
    name: "Manutencao mensal",
    durationMinutes: 40,
    priceType: "FIXED",
    price: 120,
    active: true,
    colorId: null,
    ...overrides,
  };
}

describe("SchedulingClient recurrence interval", () => {
  const originalCommandToken = env.SCHEDULING_SERVICE_COMMAND_TOKEN;
  const originalFetch = global.fetch;

  beforeEach(() => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = "test-command-token";
  });

  afterEach(() => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = originalCommandToken;
    global.fetch = originalFetch;
  });

  it("carries recurrenceIntervalDays through from the raw HTTP response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [serviceResponse({ recurrenceIntervalDays: 30 })],
        }),
        { status: 200 },
      ),
    );
    const client = new SchedulingClient();

    const services = await client.listActiveServices(context);

    expect(services).toMatchObject([{ id: "service-1", recurrenceIntervalDays: 30 }]);
  });

  it("normalizes an absent recurrenceIntervalDays to null, never inventing a cadence", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [serviceResponse()] }), {
        status: 200,
      }),
    );
    const client = new SchedulingClient();

    const services = await client.listActiveServices(context);

    expect(services).toMatchObject([{ id: "service-1", recurrenceIntervalDays: null }]);
  });
});
