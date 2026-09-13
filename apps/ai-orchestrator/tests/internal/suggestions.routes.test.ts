import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [
  { registerInternalRoutes },
  { expectedToken },
  { AppError, toErrorMessage },
] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
  import("../../src/lib/errors.js"),
]);

const TENANT = "tenant-a";
const CONVERSATION = "conversation-1";

type GenerateSuggestionsResult =
  | {
      ok: true;
      suggestions: string[];
      aiRunId: string;
      promptVersion: string;
    }
  | {
      ok: false;
      reason:
        | "CONTACT_IGNORED"
        | "SESSION_PERSONAL"
        | "HUMAN_HANDLING_REQUIRED"
        | "AI_DISABLED"
        | "NO_TEXTUAL_MESSAGE";
    };

function fakeSuggestions(result: GenerateSuggestionsResult) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    service: {
      async generateSuggestions(args: unknown) {
        calls.push(args as Record<string, unknown>);
        return result;
      },
    },
  };
}

const prismaStub = {} as never;

function headers(token = expectedToken("command")) {
  return {
    authorization: `Bearer ${token}`,
    "x-tenant-id": TENANT,
    "x-user-id": "user-1",
  };
}

async function buildApp(result: GenerateSuggestionsResult) {
  const app = Fastify();
  const suggestions = fakeSuggestions(result);
  await registerInternalRoutes(app, prismaStub, {
    suggestions: suggestions.service,
  });
  // Mesmo envelope de erro de `buildApp()` (src/app.ts): sem isto, o handler
  // padrao do Fastify nao devolve o `code` da recusa no corpo da resposta.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        ok: false,
        error: error.message,
        code: error.code,
        requestId: request.id,
      });
    }
    return reply
      .code(500)
      .send({ ok: false, error: toErrorMessage(error), requestId: request.id });
  });
  await app.ready();
  return { app, suggestions };
}

describe("rota de sugestao ao atendimento humano (Goal012/WU-04)", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("devolve ate 3 sugestoes, o aiRunId e a versao do prompt quando elegivel", async () => {
    const built = await buildApp({
      ok: true,
      suggestions: ["Sugestao 1", "Sugestao 2"],
      aiRunId: "ai-run-1",
      promptVersion: "prompt-v2-balanced-abc1234567",
    });
    app = built.app;

    const response = await app.inject({
      method: "POST",
      url: `/internal/conversations/${CONVERSATION}/suggestions`,
      headers: headers(),
    });

    expect(response.statusCode).toBe(200);
    // Contrato exato que o BFF e o frontend decodificam: conversa, sugestoes,
    // auditoria e versao do prompt.
    expect(response.json().data).toEqual({
      conversationId: CONVERSATION,
      suggestions: ["Sugestao 1", "Sugestao 2"],
      aiRunId: "ai-run-1",
      promptVersion: "prompt-v2-balanced-abc1234567",
    });
    expect(built.suggestions.calls[0]).toMatchObject({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      userId: "user-1",
    });
  });

  it.each([
    ["CONTACT_IGNORED"],
    ["SESSION_PERSONAL"],
    ["HUMAN_HANDLING_REQUIRED"],
    ["AI_DISABLED"],
    ["NO_TEXTUAL_MESSAGE"],
  ] as const)(
    "recusa com 409 e o motivo %s quando a porta de entrada barra",
    async (reason) => {
      const built = await buildApp({ ok: false, reason });
      app = built.app;

      const response = await app.inject({
        method: "POST",
        url: `/internal/conversations/${CONVERSATION}/suggestions`,
        headers: headers(),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe(reason);
    },
  );

  it("recusa credencial de provisionamento: sugestao e comando", async () => {
    const built = await buildApp({
      ok: true,
      suggestions: [],
      aiRunId: "ai-run-1",
      promptVersion: "prompt-v2-balanced-abc1234567",
    });
    app = built.app;

    const response = await app.inject({
      method: "POST",
      url: `/internal/conversations/${CONVERSATION}/suggestions`,
      headers: headers(expectedToken("provisioning")),
    });

    expect(response.statusCode).toBe(403);
    expect(built.suggestions.calls).toHaveLength(0);
  });

  it("recusa chamada sem credencial", async () => {
    const built = await buildApp({
      ok: true,
      suggestions: [],
      aiRunId: "ai-run-1",
      promptVersion: "prompt-v2-balanced-abc1234567",
    });
    app = built.app;

    const response = await app.inject({
      method: "POST",
      url: `/internal/conversations/${CONVERSATION}/suggestions`,
      headers: { "x-tenant-id": TENANT, "x-user-id": "user-1" },
    });

    expect(response.statusCode).toBe(401);
    expect(built.suggestions.calls).toHaveLength(0);
  });
});
