import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { timeBlockSchema } from "@avenly-ia/public-api-contract";

/**
 * Pedido de 2026-10-12: a folha de ações do bloqueio na Agenda mostra quando
 * ele foi criado e o padrão da série. O Scheduling passou a devolver
 * `createdAt` e `series` em cada bloco, e o guard de contrato do Goal036
 * respondia 500 ("key is not declared by the public API contract") enquanto
 * o contrato público não os declarava. Aqui: os dois campos estão declarados,
 * a resposta antiga (sem eles) continua válida e um campo a mais dentro de
 * `series` continua sendo recusado.
 */

vi.stubEnv(
  "INTERNAL_SERVICE_TOKEN",
  "root-internal-secret-with-32-chars-min-bloq",
);

const { responseContractViolation } = await import(
  "../src/lib/response-contract.js"
);

const request = (method: string, url: string) =>
  ({ method, routeOptions: { url } }) as unknown as FastifyRequest;

const block = {
  id: "block-1",
  startAt: "2026-10-14T13:00:00.000Z",
  endAt: "2026-10-14T14:15:00.000Z",
  reason: "Almoço",
  kind: "BLOCK",
  title: null,
  seriesId: "series-1",
  createdAt: "2026-10-11T21:59:00.000Z",
  series: { daysOfWeek: [2], occurrenceCount: null, seriesEndDate: "2026-12-31" },
};

const body = (data: unknown) => JSON.stringify({ data, requestId: "req-bloq" });

describe("bloco com createdAt e series no contrato público (2026-10-12)", () => {
  it("GET /v1/time-blocks com os campos novos passa no guard", () => {
    expect(
      responseContractViolation(request("GET", "/v1/time-blocks"), 200, body([block])),
    ).toBeNull();
    expect(() => timeBlockSchema.parse(block)).not.toThrow();
  });

  it("mover a ocorrência devolve o mesmo formato e passa no guard", () => {
    expect(
      responseContractViolation(
        request("PATCH", "/v1/time-blocks/:id/occurrence"),
        200,
        body(block),
      ),
    ).toBeNull();
  });

  it("a resposta sem os campos novos continua válida", () => {
    const { createdAt: _createdAt, series: _series, ...old } = block;
    void _createdAt;
    void _series;
    expect(
      responseContractViolation(request("GET", "/v1/time-blocks"), 200, body([old])),
    ).toBeNull();
    expect(
      responseContractViolation(
        request("POST", "/v1/time-blocks"),
        201,
        body({ ...old, seriesId: null, createdAt: block.createdAt, series: null }),
      ),
    ).toBeNull();
  });

  it("campo a mais dentro de series continua sendo recusado", () => {
    const leaked = { ...block, series: { ...block.series, createdBy: "user-1" } };
    expect(
      responseContractViolation(request("GET", "/v1/time-blocks"), 200, body([leaked])),
    ).not.toBeNull();
  });
});
