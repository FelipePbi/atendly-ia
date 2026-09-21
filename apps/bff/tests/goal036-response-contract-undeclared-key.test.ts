import type { FastifyInstance, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  RESPONSE_CONTRACT_CHECK_ENABLED,
  registerResponseContractCheck,
  responseContractViolation,
  undeclaredContractKeyPaths,
} from "../src/lib/response-contract.js";

/**
 * Goal036/WU-01 — campo a mais reprova.
 *
 * O Goal035 deixou a verificação de resposta cega para um lado da divergência:
 * `safeParse` remove a chave não declarada em silêncio, então o BFF podia
 * devolver um campo que o frontend nunca enxerga sem que nada acendesse. Aqui
 * o `data` emitido é comparado com o `data` devolvido pelo parse, e o que o
 * parse removeu vira achado — na raiz, dentro de objeto aninhado e dentro de
 * elemento de array.
 */

function requestFor(method: string, pathPattern: string): FastifyRequest {
  return {
    method,
    routeOptions: { url: pathPattern },
  } as unknown as FastifyRequest;
}

function envelope(data: unknown): string {
  return JSON.stringify({ data, requestId: "req-goal036" });
}

/** Corpo válido de `GET /v1/customers` (`customerListSchema`). */
function customerList(extraOnItem?: Record<string, unknown>) {
  return {
    items: [{ id: "cus-1", name: "Ana", phone: null, ...extraOnItem }],
    source: "ATENDLY",
    managedExternally: false,
  };
}

describe("responseContractViolation: chave não declarada reprova", () => {
  it("reprova chave a mais na raiz do data, citando método, rota e fieldPath", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers"),
      200,
      envelope({ ...customerList(), totalCount: 1 }),
    );

    expect(violation).not.toBeNull();
    expect(violation?.name).toBe("ResponseContractViolationError");
    expect(violation?.method).toBe("GET");
    expect(violation?.pathPattern).toBe("/v1/customers");
    expect(violation?.fieldPaths).toEqual(["data.totalCount"]);
    expect(violation?.message).toContain("GET /v1/customers");
    expect(violation?.message).toContain("data.totalCount:");
  });

  it("reprova chave a mais dentro de objeto aninhado, com o caminho completo", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/notifications/summary"),
      200,
      envelope({
        byLevel: { INFO: 1, ATTENTION: 0, CRITICAL: 0, DEBUG: 7 },
        unreadCount: 1,
        openConditionsCount: 0,
      }),
    );

    expect(violation?.fieldPaths).toEqual(["data.byLevel.DEBUG"]);
  });

  it("reprova chave a mais dentro de elemento de array, com o índice no caminho", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers"),
      200,
      envelope(customerList({ internalScore: 0.9 })),
    );

    expect(violation?.fieldPaths).toEqual(["data.items[0].internalScore"]);
  });

  it("reprova pelo lado da união que efetivamente parseou", () => {
    const union = z.union([
      z.object({ kind: z.literal("a"), a: z.string() }),
      z.object({ kind: z.literal("b"), b: z.string() }),
    ]);
    const emitted = { kind: "b", b: "x", leaked: true };

    expect(undeclaredContractKeyPaths(emitted, union.parse(emitted))).toEqual([
      "data.leaked",
    ]);
  });

  it("preserva o teto de issues e o formato da mensagem", () => {
    const extras = Object.fromEntries(
      Array.from({ length: 7 }, (_unused, index) => [`extra${index}`, index]),
    );
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers"),
      200,
      envelope({ ...customerList(), ...extras }),
    );

    expect(violation?.fieldPaths).toHaveLength(7);
    expect(violation?.message).toContain("(+2 more)");
    expect(violation?.message.split("; ")).toHaveLength(5);
    expect(violation?.message).toContain("data.extra0:");
    expect(violation?.message).toContain("data.extra4:");
    expect(violation?.message).not.toContain("data.extra5:");
  });

  it("segue reprovando campo faltando, pelo erro do Zod, sem mudar de canal", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers"),
      200,
      envelope({ items: [], source: "ATENDLY" }),
    );

    expect(violation?.name).toBe("ResponseContractViolationError");
    expect(violation?.fieldPaths).toEqual(["data.managedExternally"]);
  });
});

describe("responseContractViolation: schema que aceita chave arbitrária não gera achado", () => {
  it("não acha nada em rota cuja entrada é z.unknown()", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/conversations/:id/messages/:messageId/media"),
      200,
      envelope({ anything: { nested: [1, 2, 3] } }),
    );

    expect(violation).toBeNull();
  });

  it("não acha nada dentro de campo z.unknown() aninhado", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/notifications"),
      200,
      envelope({
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            id: "ntf-1",
            kind: "AI_UNAVAILABLE",
            level: "CRITICAL",
            shape: "CONDITION",
            subjectId: null,
            occurredAt: "2026-09-20T10:00:00.000Z",
            readAt: null,
            resolvedAt: null,
            payload: { whatever: { deep: true } },
          },
        ],
      }),
    );

    expect(violation).toBeNull();
  });

  it("não acha nada em z.record, .passthrough() e .catchall()", () => {
    const record = z.object({ metadata: z.record(z.string(), z.unknown()) });
    const passthrough = z.object({ id: z.string() }).passthrough();
    const catchall = z.object({ id: z.string() }).catchall(z.unknown());

    const recordValue = { metadata: { anyKey: 1, other: { deep: "x" } } };
    const openValue = { id: "x", notDeclared: { deep: true } };

    expect(
      undeclaredContractKeyPaths(recordValue, record.parse(recordValue)),
    ).toEqual([]);
    expect(
      undeclaredContractKeyPaths(openValue, passthrough.parse(openValue)),
    ).toEqual([]);
    expect(
      undeclaredContractKeyPaths(openValue, catchall.parse(openValue)),
    ).toEqual([]);
  });

  it("não inventa achado quando o schema devolve outra forma", () => {
    // `Date`, array de outro tamanho e tipo trocado encerram o ramo: o que
    // mudou ali não é chave a mais.
    expect(
      undeclaredContractKeyPaths({ a: 1 }, new Date("2026-09-20T00:00:00Z")),
    ).toEqual([]);
    expect(undeclaredContractKeyPaths([{ a: 1 }], [])).toEqual([]);
    expect(undeclaredContractKeyPaths({ a: 1 }, "coerced")).toEqual([]);
  });
});

describe("registerResponseContractCheck: payload intocado e desligado em produção", () => {
  type OnSendHook = (
    request: FastifyRequest,
    reply: { statusCode: number },
    payload: string,
  ) => Promise<string>;

  function fakeApp() {
    const captured: { hook?: OnSendHook } = {};
    const instance = {
      addHook: (_name: string, handler: OnSendHook) => {
        captured.hook = handler;
      },
    } as unknown as FastifyInstance;
    return { captured, instance };
  }

  it("devolve o mesmo payload, pela mesma referência, quando o corpo está certo", async () => {
    const { captured, instance } = fakeApp();
    registerResponseContractCheck(instance);

    const payload = envelope(customerList());
    const returned = await captured.hook?.(
      requestFor("GET", "/v1/customers"),
      { statusCode: 200 },
      payload,
    );

    expect(returned).toBe(payload);
  });

  it("lança o erro nomeado quando há chave a mais, sem tocar no corpo", async () => {
    const { captured, instance } = fakeApp();
    registerResponseContractCheck(instance);

    const payload = envelope({ ...customerList(), totalCount: 1 });
    await expect(
      captured.hook?.(
        requestFor("GET", "/v1/customers"),
        { statusCode: 200 },
        payload,
      ),
    ).rejects.toThrow(/data\.totalCount/u);
    expect(payload).toBe(payload);
  });

  it("fica ligado em test e desligado em production", async () => {
    expect(RESPONSE_CONTRACT_CHECK_ENABLED).toBe(true);

    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    // `env.ts` cobra segredo forte em produção; sem isso o import falha antes
    // de chegar na flag que este teste verifica.
    vi.stubEnv("JWT_SECRET", "x".repeat(48));
    vi.stubEnv("WHATSAPP_CREDENTIAL_KEYS", "v1:" + "y".repeat(44));
    const production = await import("../src/lib/response-contract.js");
    const { captured, instance } = fakeApp();
    production.registerResponseContractCheck(instance);
    vi.unstubAllEnvs();
    vi.resetModules();

    expect(production.RESPONSE_CONTRACT_CHECK_ENABLED).toBe(false);
    expect(captured.hook).toBeUndefined();
  });
});
