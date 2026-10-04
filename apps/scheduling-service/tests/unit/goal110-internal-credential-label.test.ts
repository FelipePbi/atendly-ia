/**
 * Goal110, prova 1 — o Scheduling confere as credenciais internas derivadas
 * com o rótulo novo (`avenly:internal:v1`) e com o antigo (`atendly:internal:v1`),
 * só para o mesmo chamador, a mesma audiência e o mesmo uso, pela rota HTTP.
 *
 * Um chamador ainda na versão anterior durante o deploy continua aceito. O que
 * já era recusado continua recusado: segredo bruto, audiência de outro serviço,
 * uso de outro tipo, chamador desconhecido e derivado quando há credencial
 * explícita.
 */
import "./support/test-env.js";

import { createHmac } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { env } from "../../src/config/env.js";
import { requireInternalAuth } from "../../src/shared/auth/internal-auth.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

const NEW_LABEL = "avenly:internal:v1";
const OLD_LABEL = "atendly:internal:v1";

function derive(
  label: string,
  caller: string,
  audience: string,
  use: string,
): string {
  return createHmac("sha256", TEST_INTERNAL_SERVICE_TOKEN)
    .update(`${label}:${caller}:${audience}:${use}`)
    .digest("base64url");
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.get("/internal/probe", { preHandler: requireInternalAuth }, (request) => ({
    caller: request.internalContext?.caller,
  }));
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    }
    return reply.code(500).send({ error: { message: (error as Error).message } });
  });
  return app;
}

async function probe(app: FastifyInstance, token: string) {
  return app.inject({
    method: "GET",
    url: "/internal/probe",
    headers: {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant-a",
      "x-user-id": "user-a",
      "x-request-id": "req-1",
    },
  });
}

describe("Scheduling accepts the derived credential with either label", () => {
  let app: FastifyInstance;
  const saved = {
    bff: env.BFF_COMMAND_TOKEN,
    ai: env.AI_ORCHESTRATOR_COMMAND_TOKEN,
  };

  beforeEach(async () => {
    env.BFF_COMMAND_TOKEN = "";
    env.AI_ORCHESTRATOR_COMMAND_TOKEN = "";
    app = await buildApp();
  });

  afterEach(async () => {
    env.BFF_COMMAND_TOKEN = saved.bff;
    env.AI_ORCHESTRATOR_COMMAND_TOKEN = saved.ai;
    await app.close();
  });

  it("derives with the new label by default", () => {
    expect(
      deriveInternalToken(
        TEST_INTERNAL_SERVICE_TOKEN,
        "bff",
        SERVICE_AUDIENCE,
        "command",
      ),
    ).toEqual(derive(NEW_LABEL, "bff", SERVICE_AUDIENCE, "command"));
  });

  it.each([
    ["bff", "bff"],
    ["ai-orchestrator", "ai-orchestrator"],
  ])("identifies %s by the new and the old label", async (caller, expected) => {
    for (const label of [NEW_LABEL, OLD_LABEL]) {
      const response = await probe(
        app,
        derive(label, caller, SERVICE_AUDIENCE, "command"),
      );
      expect(response.statusCode, label).toBe(200);
      expect(response.json()).toEqual({ caller: expected });
    }
  });

  it("refuses the old-label token derived for another audience", async () => {
    const response = await probe(
      app,
      derive(OLD_LABEL, "bff", "ai-orchestrator", "command"),
    );
    expect(response.statusCode).toBe(401);
  });

  it("refuses the old-label token derived for another use", async () => {
    const response = await probe(
      app,
      derive(OLD_LABEL, "bff", SERVICE_AUDIENCE, "provisioning"),
    );
    expect(response.statusCode).toBe(401);
  });

  it("refuses the old-label token derived for an unknown caller", async () => {
    const response = await probe(
      app,
      derive(OLD_LABEL, "intruder", SERVICE_AUDIENCE, "command"),
    );
    expect(response.statusCode).toBe(401);
  });

  it("refuses a token derived with an unrelated label", async () => {
    const response = await probe(
      app,
      derive("other:internal:v1", "bff", SERVICE_AUDIENCE, "command"),
    );
    expect(response.statusCode).toBe(401);
  });

  it("refuses the raw shared secret", async () => {
    const response = await probe(app, TEST_INTERNAL_SERVICE_TOKEN);
    expect(response.statusCode).toBe(401);
  });

  it("keeps an explicit BFF credential exclusive for the BFF", async () => {
    env.BFF_COMMAND_TOKEN = "explicit-bff-command-credential";

    const explicit = await probe(app, "explicit-bff-command-credential");
    expect(explicit.statusCode).toBe(200);
    expect(explicit.json()).toEqual({ caller: "bff" });

    for (const label of [NEW_LABEL, OLD_LABEL]) {
      const derived = await probe(
        app,
        derive(label, "bff", SERVICE_AUDIENCE, "command"),
      );
      expect(derived.statusCode, label).toBe(401);
    }

    // A credencial explícita do BFF não muda a derivação da IA.
    const ai = await probe(
      app,
      derive(OLD_LABEL, "ai-orchestrator", SERVICE_AUDIENCE, "command"),
    );
    expect(ai.statusCode).toBe(200);
    expect(ai.json()).toEqual({ caller: "ai-orchestrator" });
  });
});
