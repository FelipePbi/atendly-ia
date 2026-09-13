/**
 * Fronteira entre erro de dominio e erro de infraestrutura do Scheduling
 * (Goal011, WU-04). `SchedulingClient` classifica pelo status HTTP e pelo
 * codigo da resposta, nunca pelo texto: autenticacao interna ausente,
 * contexto de chamada nao confiavel, timeout, indisponibilidade e 5xx
 * viram sempre `InfrastructureError`; 4xx com corpo decodificavel vira
 * sempre `DomainError`, com o codigo do Scheduling preservado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../src/config/env.js";
import { DomainError, InfrastructureError } from "../../src/lib/errors.js";
import { SchedulingClient } from "../../src/modules/scheduling-service/client.js";
import type { SchedulingRequestContext } from "../../src/modules/scheduling-service/types.js";

const context: SchedulingRequestContext = {
  tenantId: "tenant-1",
  userId: "user-1",
  requestId: "request-1",
};

describe("SchedulingClient error classification", () => {
  const originalCommandToken = env.SCHEDULING_SERVICE_COMMAND_TOKEN;
  const originalInternalToken = env.INTERNAL_SERVICE_TOKEN;
  const originalFetch = global.fetch;

  beforeEach(() => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = "test-command-token";
  });

  afterEach(() => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = originalCommandToken;
    env.INTERNAL_SERVICE_TOKEN = originalInternalToken;
    global.fetch = originalFetch;
  });

  it("classifies a missing trusted context as infrastructure, not domain", async () => {
    const client = new SchedulingClient();

    let caught: unknown;
    try {
      await client.listActiveServices(undefined);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InfrastructureError);
    expect((caught as InstanceType<typeof InfrastructureError>).code).toBe(
      "SCHEDULING_CONTEXT_REQUIRED",
    );
  });

  it("classifies missing internal authentication as infrastructure", async () => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = "";
    env.INTERNAL_SERVICE_TOKEN = "";
    const client = new SchedulingClient();

    let caught: unknown;
    try {
      await client.listActiveServices(context);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InfrastructureError);
    expect((caught as InstanceType<typeof InfrastructureError>).code).toBe(
      "SCHEDULING_AUTH_NOT_CONFIGURED",
    );
  });

  it("classifies a fetch timeout as infrastructure", async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      const timeout = new Error("The operation was aborted");
      timeout.name = "TimeoutError";
      return Promise.reject(timeout);
    }) as unknown as typeof fetch;
    const client = new SchedulingClient();

    let caught: unknown;
    try {
      await client.listActiveServices(context);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InfrastructureError);
    expect((caught as InstanceType<typeof InfrastructureError>).code).toBe(
      "SCHEDULING_TIMEOUT",
    );
  });

  it("classifies a 5xx upstream response as infrastructure, keyed by status not by text", async () => {
    // O texto do upstream ("db connection pool exhausted") continua no
    // objeto de erro para o log poder mostrar o detalhe real; quem impede
    // esse texto de chegar ao modelo e a camada de tool/assistant que checa
    // `instanceof InfrastructureError`, nao o cliente.
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "INTERNAL_ERROR", message: "db connection pool exhausted" },
        }),
        { status: 503 },
      ),
    ) as unknown as typeof fetch;
    const client = new SchedulingClient();

    let caught: unknown;
    try {
      await client.listActiveServices(context);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InfrastructureError);
    const infrastructureError = caught as InstanceType<typeof InfrastructureError>;
    expect(infrastructureError.code).toBe("SCHEDULING_UPSTREAM_UNAVAILABLE");
    expect(infrastructureError.statusCode).toBe(502);
  });

  it("classifies a malformed upstream response as infrastructure", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
      ) as unknown as typeof fetch;
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

  it("classifies a 4xx upstream response as domain, preserving the Scheduling code and message", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "SLOT_UNAVAILABLE", message: "Slot is unavailable for the service duration." },
        }),
        { status: 409 },
      ),
    ) as unknown as typeof fetch;
    const client = new SchedulingClient();

    let caught: unknown;
    try {
      await client.listActiveServices(context);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainError);
    const domainError = caught as InstanceType<typeof DomainError>;
    expect(domainError.code).toBe("SLOT_UNAVAILABLE");
    expect(domainError.message).toBe("Slot is unavailable for the service duration.");
  });
});
