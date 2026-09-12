import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MinhaAgendaClient } from "../../src/modules/integrations/minha-agenda/client.js";
import type { MinhaAgendaConnectionConfig } from "../../src/modules/integrations/minha-agenda/config.js";
import { AppError } from "../../src/shared/errors/app-error.js";

function config(
  overrides: Partial<MinhaAgendaConnectionConfig> = {},
): MinhaAgendaConnectionConfig {
  return {
    tenantId: "tenant-a",
    baseUrl: "https://minha-agenda.example.invalid",
    basicAuth: "Basic abc",
    username: "user",
    password: "secret",
    employeeId: 1,
    paymentMethod: "dinheiro",
    modelVersion: 2,
    timeoutMs: 1_000,
    refreshSkewSeconds: 300,
    enableWrites: false,
    bufferBetweenServicesMinutes: 0,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function tokenResponse(): Response {
  return jsonResponse({
    access_token: "tok-123",
    token_type: "bearer",
    expires_in: 3_600,
  });
}

describe("MinhaAgendaClient: resposta validada por schema", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mapeia uma resposta valida de /services depois de valida-la por schema", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse([
        {
          id: 1,
          name: "Corte",
          duration: 30,
          price: 50,
          colorId: null,
          deleted: false,
        },
      ]),
    );

    const client = new MinhaAgendaClient(config());
    const services = await client.listServices();

    expect(services).toEqual([
      {
        id: 1,
        name: "Corte",
        duration: 30,
        price: 50,
        colorId: null,
        deleted: false,
      },
    ]);
  });

  it("preserva campos desconhecidos da origem no registro validado (raw para rastreio)", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse([
        {
          id: 1,
          name: "Corte",
          duration: 30,
          price: 50,
          colorId: null,
          deleted: false,
          legacyFlag: "x",
        },
      ]),
    );

    const client = new MinhaAgendaClient(config());
    const [service] = await client.listServices();
    expect((service as { legacyFlag?: string }).legacyFlag).toBe("x");
  });

  it("RED: resposta fora do contrato falha identificada pela chamada e por uma causa sanitizada, sem virar undefined silencioso", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      // preco enviado como string: fora do contrato documentado (numero).
      jsonResponse([
        {
          id: 1,
          name: "Corte",
          duration: 30,
          price: "50.00",
          colorId: null,
          deleted: false,
        },
      ]),
    );

    const client = new MinhaAgendaClient(config());
    let caught: unknown;
    try {
      await client.listServices();
    } catch (error) {
      caught = error;
    }

    // GREEN: falha explicita, identificada pela chamada ("services") e por
    // uma causa sanitizada (caminho + codigo do issue) — nunca um array de
    // servicos com price undefined.
    expect(caught).toBeInstanceOf(AppError);
    const appError = caught as AppError;
    expect(appError.code).toBe("MINHA_AGENDA_INVALID_RESPONSE");
    expect(appError.statusCode).toBe(502);
    const details = appError.details as {
      context: string;
      issues: Array<{ path: string; code: string }>;
    };
    expect(details.context).toBe("services");
    expect(details.issues.some((issue) => issue.path === "0.price")).toBe(true);
  });

  it("RED: campo obrigatorio ausente falha identificada, sem fabricar duracao/preco", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: "Corte" }]));

    const client = new MinhaAgendaClient(config());
    await expect(client.listServices()).rejects.toMatchObject({
      code: "MINHA_AGENDA_INVALID_RESPONSE",
      details: { context: "services" },
    });
  });

  it("nunca vaza o payload cru da origem na causa sanitizada do erro", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse([
        {
          id: 1,
          name: "Segredo do cliente Fulano",
          duration: 30,
          price: "cinquenta",
          colorId: null,
          deleted: false,
        },
      ]),
    );

    const client = new MinhaAgendaClient(config());
    let caught: unknown;
    try {
      await client.listServices();
    } catch (error) {
      caught = error;
    }
    const appError = caught as AppError;
    expect(JSON.stringify(appError.details)).not.toContain(
      "Segredo do cliente Fulano",
    );
    expect(JSON.stringify(appError.details)).not.toContain("cinquenta");
  });

  it("valida a resposta de autenticacao antes de usar o token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ token_type: "bearer", expires_in: 3_600 }),
    ); // sem access_token: fora do contrato.

    const client = new MinhaAgendaClient(config());
    await expect(client.listServices()).rejects.toMatchObject({
      code: "MINHA_AGENDA_INVALID_RESPONSE",
      details: { context: "auth.token" },
    });
  });
});
