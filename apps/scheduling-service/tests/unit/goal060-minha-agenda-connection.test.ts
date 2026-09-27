/**
 * Conexão com só e-mail e senha (Goal060 §1 a §4).
 *
 * A origem é sempre um dublê de `fetch`: nenhum teste chama a Minha Agenda
 * real. O que está em prova: o corpo novo (`{ email, password }`, `.strict()`),
 * o endereço e o cliente OAuth do sistema, a descoberta do profissional e as
 * quatro classes de erro da tabela do §4 — nenhuma com status 401/403, e
 * nenhuma falha gravando linha.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../src/config/env.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import { encryptIntegrationCredentials } from "../../src/modules/integrations/credentials.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";
import {
  TEST_INTERNAL_SERVICE_TOKEN,
  TEST_MINHA_AGENDA_API_BASE_URL,
  TEST_MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL,
} from "./support/test-env.js";

type Database = ReturnType<typeof createDatabaseDouble>;

const tenantId = "tenant-a";
const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

// Ficticio, nunca o valor real de conta nenhuma (Goal060 §1/§8).
const validPayload = {
  email: "dono@example.com",
  password: "super-secret-password",
};

function headers(extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": tenantId,
    "x-user-id": "professional-1",
    "x-request-id": "req-1",
    "content-type": "application/json",
    ...extra,
  };
}

function seedAtendlyCalendar(db: Database) {
  db.client.calendarSettings.rows.push({
    id: "settings-1",
    tenantId,
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
  } as never);
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

function professionalsResponse(ids: number[]): Response {
  return jsonResponse(ids.map((id) => ({ id })));
}

async function buildTestApp(client: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify();
  await registerManagementRoutes(app, client);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        requestId: request.id,
      });
    }
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: (error as Error).message },
      requestId: request.id,
    });
  });
  return app;
}

describe("Goal060: conexão Minha Agenda com e-mail e senha", () => {
  let db: Database;
  let app: FastifyInstance;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = createDatabaseDouble();
    app = await buildTestApp(db.client as unknown as PrismaClient);
    seedAtendlyCalendar(db);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  function connect(payload: unknown = validPayload) {
    return app.inject({
      method: "POST",
      url: "/internal/calendar/integration/connect",
      headers: headers(),
      payload,
    });
  }

  describe("§7.1: corpo novo, endereço e cliente OAuth do sistema", () => {
    it("login vai para <BASE_URL>/oauth/token?isWeb=true com o Basic do sistema, a descoberta vai para /employees/professionals?includeDeleted=false, e a linha gravada tem só o employeeId, sem baseUrl, paymentMethod nem basicAuth", async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(professionalsResponse([42]));

      const response = await connect();

      expect(response.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(tokenUrl).toBe(
        `${TEST_MINHA_AGENDA_API_BASE_URL}/oauth/token?isWeb=true`,
      );
      const tokenHeaders = tokenInit.headers as Record<string, string>;
      expect(tokenHeaders.authorization).toBe(
        `Basic ${TEST_MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL}`,
      );

      const [professionalsUrl] = fetchMock.mock.calls[1] as [
        string,
        RequestInit,
      ];
      expect(professionalsUrl).toBe(
        `${TEST_MINHA_AGENDA_API_BASE_URL}/employees/professionals?includeDeleted=false`,
      );

      const stored = db.client.integrationConnection.rows[0];
      expect(stored.config).toEqual({ employeeId: 42 });
      const storedRaw = JSON.stringify(stored);
      expect(storedRaw).not.toContain("baseUrl");
      expect(storedRaw).not.toContain("paymentMethod");
      expect(JSON.stringify(stored.config)).not.toContain("basicAuth");
    });

    it.each([
      ["basicAuth a mais", { ...validPayload, basicAuth: "Basic abc" }],
      [
        "envelope antigo credentials/configuration",
        {
          credentials: { basicAuth: "a", username: "u", password: "p" },
          configuration: {
            baseUrl: "https://portal.example.com",
            employeeId: 1,
            paymentMethod: "cash",
          },
        },
      ],
      ["enableWrites a mais", { ...validPayload, enableWrites: true }],
      ["baseUrl a mais", { ...validPayload, baseUrl: "https://x.example.com" }],
    ])(
      "corpo com campo antigo (%s) é recusado com VALIDATION_ERROR, sem fetch e sem escrita",
      async (_label, payload) => {
        const response = await connect(payload);
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("VALIDATION_ERROR");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(db.client.integrationConnection.rows).toHaveLength(0);
      },
    );

    it("sem MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL, sai MINHA_AGENDA_NOT_CONFIGURED 503, sem fetch e sem escrita, e o resto do serviço segue de pé", async () => {
      const original = env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL;
      env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL = "";
      try {
        const response = await connect();
        expect(response.statusCode).toBe(503);
        expect(response.json().error.code).toBe("MINHA_AGENDA_NOT_CONFIGURED");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(db.client.integrationConnection.rows).toHaveLength(0);

        const overview = await app.inject({
          method: "GET",
          url: "/internal/calendar",
          headers: headers(),
        });
        expect(overview.statusCode).toBe(200);
      } finally {
        env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL = original;
      }
    });
  });

  describe("§7.2: classes de erro, nunca 401/403, nenhuma falha grava", () => {
    it.each([400, 401])(
      "token %i vira MINHA_AGENDA_AUTH_FAILED 422",
      async (status) => {
        fetchMock.mockResolvedValueOnce(
          jsonResponse({ error: "invalid" }, status),
        );
        const response = await connect();
        expect(response.statusCode).toBe(422);
        expect(response.json().error.code).toBe("MINHA_AGENDA_AUTH_FAILED");
        expect(db.client.integrationConnection.rows).toHaveLength(0);
      },
    );

    it.each([403, 429, 500])(
      "token %i vira a classe origem indisponível (MINHA_AGENDA_HTTP_ERROR, 502)",
      async (status) => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: "down" }, status));
        const response = await connect();
        expect(response.statusCode).toBe(502);
        expect(response.json().error.code).toBe("MINHA_AGENDA_HTTP_ERROR");
        expect(db.client.integrationConnection.rows).toHaveLength(0);
      },
    );

    it("falha de rede no login vira MINHA_AGENDA_UNREACHABLE 502", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
      const response = await connect();
      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe("MINHA_AGENDA_UNREACHABLE");
      expect(db.client.integrationConnection.rows).toHaveLength(0);
    });

    it("timeout no login vira MINHA_AGENDA_TIMEOUT 504", async () => {
      fetchMock.mockRejectedValueOnce(
        new DOMException("timed out", "TimeoutError"),
      );
      const response = await connect();
      expect(response.statusCode).toBe(504);
      expect(response.json().error.code).toBe("MINHA_AGENDA_TIMEOUT");
      expect(db.client.integrationConnection.rows).toHaveLength(0);
    });

    it("chamada autenticada 401 depois da nova tentativa vira MINHA_AGENDA_HTTP_ERROR 502", async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse()) // login inicial
        .mockResolvedValueOnce(jsonResponse({}, 401)) // descoberta: 401
        .mockResolvedValueOnce(tokenResponse()) // nova tentativa de login
        .mockResolvedValueOnce(jsonResponse({}, 401)); // descoberta de novo: 401

      const response = await connect();

      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe("MINHA_AGENDA_HTTP_ERROR");
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(db.client.integrationConnection.rows).toHaveLength(0);
    });

    it("nenhuma classe de erro sai com status 401 ou 403", async () => {
      for (const status of [400, 401, 403, 429, 500]) {
        fetchMock.mockReset();
        fetchMock.mockResolvedValueOnce(jsonResponse({}, status));
        const response = await connect();
        expect(response.statusCode).not.toBe(401);
        expect(response.statusCode).not.toBe(403);
      }
    });
  });

  describe("§7.3: descoberta do profissional", () => {
    it("zero profissionais vira MINHA_AGENDA_PROFESSIONAL_NOT_FOUND 422, sem gravar", async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(professionalsResponse([]));
      const response = await connect();
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe(
        "MINHA_AGENDA_PROFESSIONAL_NOT_FOUND",
      );
      expect(db.client.integrationConnection.rows).toHaveLength(0);
    });

    it("dois profissionais vira MINHA_AGENDA_MULTIPLE_PROFESSIONALS 422, sem gravar", async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(professionalsResponse([1, 2]));
      const response = await connect();
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe(
        "MINHA_AGENDA_MULTIPLE_PROFESSIONALS",
      );
      expect(db.client.integrationConnection.rows).toHaveLength(0);
    });

    it("resposta fora da forma documentada vira MINHA_AGENDA_INVALID_RESPONSE, sem gravar", async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse([{ nome: "sem id" }]));
      const response = await connect();
      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe("MINHA_AGENDA_INVALID_RESPONSE");
      expect(db.client.integrationConnection.rows).toHaveLength(0);
    });
  });

  describe("§7.4: linha antiga continua legível com a configuração do sistema", () => {
    it("IntegrationConnection gravada com baseUrl do portal e basicAuth na credencial é lida com o endereço e o Basic do sistema", async () => {
      db.client.integrationConnection.rows.push({
        id: "connection-old",
        tenantId,
        provider: "MINHA_AGENDA",
        status: "CONNECTED",
        credentialsEncrypted: encryptIntegrationCredentials(tenantId, {
          basicAuth: "Basic portal-old-value",
          username: "dono@example.com",
          password: "old-password",
        }),
        lastSuccessfulSyncAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        config: {
          baseUrl: "https://minha-agenda.example.com",
          employeeId: 42,
          paymentMethod: "cash",
          modelVersion: 2,
          timeoutMs: 10_000,
          refreshSkewSeconds: 300,
          enableWrites: false,
          bufferBetweenServicesMinutes: 0,
        },
      } as never);

      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse([]));

      const { "content-type": _contentType, ...reconnectHeaders } = headers();
      const response = await app.inject({
        method: "POST",
        url: "/internal/calendar/integration/reconnect",
        headers: reconnectHeaders,
      });

      expect(response.statusCode).toBe(200);
      const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(tokenUrl.startsWith(TEST_MINHA_AGENDA_API_BASE_URL)).toBe(true);
      expect(tokenUrl).not.toContain("minha-agenda.example.com");
      const tokenHeaders = tokenInit.headers as Record<string, string>;
      expect(tokenHeaders.authorization).toBe(
        `Basic ${TEST_MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL}`,
      );
      expect(tokenHeaders.authorization).not.toContain("portal-old-value");
    });
  });
});
