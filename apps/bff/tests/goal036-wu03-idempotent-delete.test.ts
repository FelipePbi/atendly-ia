import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import { responseContractViolation } from "../src/lib/response-contract.js";

/**
 * Goal036/WU-03 — A-20: o corpo idempotente real de
 * `DELETE /v1/customers/:id/primary-guardian`.
 *
 * O produtor (`scheduling.clearCustomerPrimaryGuardian`) devolve
 * `{ deleted: deleted.count > 0 }`, então repetir a remoção quando não havia
 * vínculo devolve `{ deleted: false }`, não `{ deleted: true }`. O contrato
 * antigo (`deletedSchema` = `z.object({ deleted: z.literal(true) })`) recusava
 * esse corpo; a rota entrou a usar `deletedIdempotentSchema` só para esta
 * entrada.
 */

function requestFor(method: string, pathPattern: string): FastifyRequest {
  return {
    method,
    routeOptions: { url: pathPattern },
  } as unknown as FastifyRequest;
}

function envelope(data: unknown): string {
  return JSON.stringify({ data, requestId: "req-goal036-wu03" });
}

describe("A-20: DELETE /v1/customers/:id/primary-guardian é idempotente", () => {
  it("aceita { deleted: false } quando não havia vínculo a remover", () => {
    const violation = responseContractViolation(
      requestFor("DELETE", "/v1/customers/:id/primary-guardian"),
      200,
      envelope({ deleted: false }),
    );

    expect(violation).toBeNull();
  });

  it("continua aceitando { deleted: true } quando removeu de fato", () => {
    const violation = responseContractViolation(
      requestFor("DELETE", "/v1/customers/:id/primary-guardian"),
      200,
      envelope({ deleted: true }),
    );

    expect(violation).toBeNull();
  });
});
