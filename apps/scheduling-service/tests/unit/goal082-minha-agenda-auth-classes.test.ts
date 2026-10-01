/**
 * Quem é a falha do login da Minha Agenda (Goal082 §1, §2 e §6).
 *
 * A origem é sempre um dublê de `fetch`: nenhum teste chama a Minha Agenda
 * real. Em cada resposta de erro o corpo carrega um sentinela em
 * `error_description`, que não pode aparecer em resposta, `details` nem log.
 */
import "./support/test-env.js";

import type { FastifyInstance } from "fastify";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../src/config/env.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { importWorkFailure } from "../../src/modules/migrations/index.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";
import {
  TEST_INTERNAL_SERVICE_TOKEN,
  TEST_MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL,
} from "./support/test-env.js";

// `buildApp` pega o client de `getPrisma()`; o dublê entra por aqui.
let currentClient: PrismaClient | undefined;
vi.mock("../../src/infrastructure/database/prisma.js", () => ({
  getPrisma: () => {
    if (!currentClient) throw new Error("dublê de banco não configurado");
    return currentClient;
  },
  checkDatabaseConnection: async () => undefined,
  disconnectPrisma: async () => undefined,
}));

import { buildApp, importWorkOriginCode } from "../../src/app/build-app.js";

type Database = ReturnType<typeof createDatabaseDouble>;

const tenantId = "tenant-a";
const SENTINEL = "SENTINELA-ORIGEM-082";
const OAUTH_VARIABLE = "MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL";
const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

const validPayload = {
  email: "dono-082@example.com",
  password: "super-secret-password-082",
};

const TOKEN_VALUE = "tok-082-secret";

function sourceErrorBody(error?: string): string {
  return JSON.stringify({
    ...(error === undefined ? {} : { error }),
    error_description: SENTINEL,
  });
}

function textResponse(body: string | null, status: number): Response {
  return new Response(body, { status });
}

function captureLog() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(...chunk.toString().split("\n").filter(Boolean));
      callback();
    },
  });
  return {
    stream,
    lines,
    records: () => lines.map((line) => JSON.parse(line) as LogRecord),
  };
}

interface LogRecord {
  level: number;
  msg?: string;
  errorCode?: string;
  originStatus?: number;
  originCode?: string;
  reqId?: string;
  [key: string]: unknown;
}

const WARN = 40;
const ERROR = 50;

describe("Goal082: login da Minha Agenda diz de quem é a falha", () => {
  let db: Database;
  let app: FastifyInstance;
  let log: ReturnType<typeof captureLog>;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalCredential = env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL;
  const originalAutoComplete = env.CALENDAR_AUTO_COMPLETE_ENABLED;

  async function start(credential = originalCredential) {
    env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL = credential;
    log = captureLog();
    app = await buildApp({ logStream: log.stream });
  }

  beforeEach(() => {
    db = createDatabaseDouble();
    currentClient = db.client as unknown as PrismaClient;
    db.client.calendarSettings.rows.push({
      id: "settings-1",
      tenantId,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    } as never);
    env.CALENDAR_AUTO_COMPLETE_ENABLED = false;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await app?.close();
    env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL = originalCredential;
    env.CALENDAR_AUTO_COMPLETE_ENABLED = originalAutoComplete;
    currentClient = undefined;
    vi.unstubAllGlobals();
  });

  function connect() {
    return app.inject({
      method: "POST",
      url: "/internal/calendar/integration/connect",
      headers: {
        authorization: `Bearer ${bffToken}`,
        "x-tenant-id": tenantId,
        "x-user-id": "professional-1",
        "x-request-id": "req-082",
        "content-type": "application/json",
      },
      payload: validPayload,
    });
  }

  function expectNoSecrets(text: string) {
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain(validPayload.email);
    expect(text).not.toContain(validPayload.password);
    expect(text).not.toContain(TOKEN_VALUE);
    expect(text).not.toContain(TEST_MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL);
  }

  describe("prova 1: cada linha da tabela de classificação", () => {
    it.each([
      [
        "400 invalid_grant (pessoa)",
        400,
        sourceErrorBody("invalid_grant"),
        "MINHA_AGENDA_AUTH_FAILED",
        422,
      ],
      [
        "401 invalid_grant (pessoa)",
        401,
        sourceErrorBody("invalid_grant"),
        "MINHA_AGENDA_AUTH_FAILED",
        422,
      ],
      ["400 sem corpo (pessoa)", 400, null, "MINHA_AGENDA_AUTH_FAILED", 422],
      [
        "400 com corpo não JSON (pessoa)",
        400,
        `texto livre ${SENTINEL}`,
        "MINHA_AGENDA_AUTH_FAILED",
        422,
      ],
      [
        "401 invalid_client (operação)",
        401,
        sourceErrorBody("invalid_client"),
        "MINHA_AGENDA_CLIENT_REJECTED",
        503,
      ],
      [
        "401 unauthorized_client (operação)",
        401,
        sourceErrorBody("unauthorized_client"),
        "MINHA_AGENDA_CLIENT_REJECTED",
        503,
      ],
      [
        "401 unauthorized (operação)",
        401,
        sourceErrorBody("unauthorized"),
        "MINHA_AGENDA_CLIENT_REJECTED",
        503,
      ],
      [
        "401 Invalid_Client com outra caixa (operação)",
        401,
        sourceErrorBody("Invalid_Client"),
        "MINHA_AGENDA_CLIENT_REJECTED",
        503,
      ],
      [
        "401 sem corpo (operação)",
        401,
        null,
        "MINHA_AGENDA_CLIENT_REJECTED",
        503,
      ],
      [
        "401 com corpo não JSON (operação)",
        401,
        `texto livre ${SENTINEL}`,
        "MINHA_AGENDA_CLIENT_REJECTED",
        503,
      ],
      [
        "401 com error de outro tipo (operação)",
        401,
        JSON.stringify({ error: { nested: SENTINEL } }),
        "MINHA_AGENDA_CLIENT_REJECTED",
        503,
      ],
      [
        "401 com error desconhecido (operação)",
        401,
        sourceErrorBody("algo_novo"),
        "MINHA_AGENDA_CLIENT_REJECTED",
        503,
      ],
    ])("%s", async (_label, status, body, expectedCode, expectedStatus) => {
      await start();
      fetchMock.mockResolvedValueOnce(textResponse(body, status));

      const response = await connect();

      expect(response.statusCode).toBe(expectedStatus);
      const payload = response.json();
      expect(payload.error.code).toBe(expectedCode);
      expect(payload.error.details).toEqual({ originStatus: status });
      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).not.toBe(403);
      expect(db.client.integrationConnection.rows).toHaveLength(0);
      expectNoSecrets(response.body);
      expectNoSecrets(log.lines.join("\n"));
    });

    it.each([403, 429, 500])(
      "token %i continua MINHA_AGENDA_HTTP_ERROR 502 com corpo da origem não vazado",
      async (status) => {
        await start();
        fetchMock.mockResolvedValueOnce(
          textResponse(sourceErrorBody("invalid_client"), status),
        );
        const response = await connect();
        expect(response.statusCode).toBe(502);
        expect(response.json().error.code).toBe("MINHA_AGENDA_HTTP_ERROR");
        expectNoSecrets(response.body);
      },
    );
  });

  describe("prova 2: log capturado da instância de teste", () => {
    it("recusa do cliente registra um error com o código e originStatus 401, sem segredo em nenhum registro", async () => {
      await start();
      fetchMock.mockResolvedValueOnce(
        textResponse(sourceErrorBody("invalid_client"), 401),
      );

      const response = await connect();
      expect(response.statusCode).toBe(503);

      const refusals = log
        .records()
        .filter(
          (record) =>
            record.level === ERROR &&
            record.errorCode === "MINHA_AGENDA_CLIENT_REJECTED",
        );
      expect(refusals).toHaveLength(1);
      expect(refusals[0].originStatus).toBe(401);
      expect(refusals[0].reqId).toBe("req-082");
      expectNoSecrets(log.lines.join("\n"));
    });

    it("senha errada da pessoa não gera registro de error de recusa da operação", async () => {
      await start();
      fetchMock.mockResolvedValueOnce(
        textResponse(sourceErrorBody("invalid_grant"), 400),
      );

      const response = await connect();
      expect(response.statusCode).toBe(422);
      expect(
        log.records().filter((record) => record.level >= ERROR),
      ).toHaveLength(0);
    });

    it("sem a variável, buildApp avisa nomeando a variável e a conexão registra error MINHA_AGENDA_NOT_CONFIGURED", async () => {
      await start("");

      const warnings = log.records().filter((record) => record.level === WARN);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].msg).toContain(OAUTH_VARIABLE);

      const response = await connect();
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("MINHA_AGENDA_NOT_CONFIGURED");
      expect(fetchMock).not.toHaveBeenCalled();

      const refusals = log
        .records()
        .filter(
          (record) =>
            record.level === ERROR &&
            record.errorCode === "MINHA_AGENDA_NOT_CONFIGURED",
        );
      expect(refusals).toHaveLength(1);
      expect(refusals[0].reqId).toBe("req-082");
      expectNoSecrets(log.lines.join("\n"));
    });
  });

  describe("prova 3: variável preenchida", () => {
    it("buildApp não registra o aviso", async () => {
      await start();
      expect(
        log.records().filter((record) => record.level >= WARN),
      ).toHaveLength(0);
      expect(log.lines.join("\n")).not.toContain(OAUTH_VARIABLE);
    });
  });

  describe("prova 4: importação em segundo plano", () => {
    it("MINHA_AGENDA_CLIENT_REJECTED direto vira IMPORT_INTERNAL_ERROR", () => {
      const error = new AppError(
        "MINHA_AGENDA_CLIENT_REJECTED",
        "rejected",
        503,
        { originStatus: 401 },
      );
      expect(importWorkFailure(error).errorCode).toBe("IMPORT_INTERNAL_ERROR");
    });

    it("MINHA_AGENDA_CLIENT_REJECTED como causa de MINHA_AGENDA_IMPORT_CATEGORY_FAILED vira IMPORT_INTERNAL_ERROR", () => {
      const error = new AppError(
        "MINHA_AGENDA_IMPORT_CATEGORY_FAILED",
        "wrapped",
        502,
        { categories: ["SERVICES"], cause: "MINHA_AGENDA_CLIENT_REJECTED" },
      );
      expect(importWorkFailure(error).errorCode).toBe("IMPORT_INTERNAL_ERROR");
    });

    it("o log do trabalho leva o código da origem, direto ou como causa, e nada de texto do erro", () => {
      expect(
        importWorkOriginCode(
          new AppError("MINHA_AGENDA_CLIENT_REJECTED", "rejected", 503),
        ),
      ).toBe("MINHA_AGENDA_CLIENT_REJECTED");
      expect(
        importWorkOriginCode(
          new AppError("MINHA_AGENDA_IMPORT_CATEGORY_FAILED", "wrapped", 502, {
            categories: ["SERVICES"],
            cause: "MINHA_AGENDA_CLIENT_REJECTED",
          }),
        ),
      ).toBe("MINHA_AGENDA_CLIENT_REJECTED");
      expect(importWorkOriginCode(new Error("boom"))).toBeUndefined();
    });

    it("MINHA_AGENDA_AUTH_FAILED continua IMPORT_SOURCE_AUTH_REJECTED, direto e como causa", () => {
      const direct = new AppError("MINHA_AGENDA_AUTH_FAILED", "failed", 422);
      const wrapped = new AppError(
        "MINHA_AGENDA_IMPORT_CATEGORY_FAILED",
        "wrapped",
        502,
        { categories: ["SERVICES"], cause: "MINHA_AGENDA_AUTH_FAILED" },
      );
      expect(importWorkFailure(direct).errorCode).toBe(
        "IMPORT_SOURCE_AUTH_REJECTED",
      );
      expect(importWorkFailure(wrapped).errorCode).toBe(
        "IMPORT_SOURCE_AUTH_REJECTED",
      );
    });
  });
});
