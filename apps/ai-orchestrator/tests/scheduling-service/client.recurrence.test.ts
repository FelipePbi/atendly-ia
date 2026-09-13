/**
 * Recorrência ofertável (Goal011, resíduo dos reviews 007/009, fechado no
 * Goal012).
 *
 * `/internal/services` carrega `recurrenceIntervalDays`; `SchedulingClient`
 * não pode descartar o campo ao decodificar a resposta, senão `list_services`
 * nunca teria como oferecer a série recorrente. O campo é obrigatório e
 * nulável: o Scheduling sempre o declara (nulo quando o serviço não tem
 * intervalo cadastrado). Resposta que omite o campo é resposta inválida,
 * nunca um intervalo inventado por omissão.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../src/config/env.js";
import { InfrastructureError } from "../../src/lib/errors.js";
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

  it("carries an explicit null recurrenceIntervalDays through as null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [serviceResponse({ recurrenceIntervalDays: null })] }),
        { status: 200 },
      ),
    );
    const client = new SchedulingClient();

    const services = await client.listActiveServices(context);

    expect(services).toMatchObject([{ id: "service-1", recurrenceIntervalDays: null }]);
  });

  it("rejects a response that omits recurrenceIntervalDays as an invalid response, never inventing a cadence", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [serviceResponse()] }), {
        status: 200,
      }),
    );
    const client = new SchedulingClient();

    let caught: unknown;
    try {
      await client.listActiveServices(context);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InfrastructureError);
    expect((caught as InstanceType<typeof InfrastructureError>).code).toBe(
      "SCHEDULING_INVALID_RESPONSE",
    );
  });
});
