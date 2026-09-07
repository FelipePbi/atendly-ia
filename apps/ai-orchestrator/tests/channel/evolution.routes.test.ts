import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `config/env.js` lê process.env uma única vez, quando o módulo é avaliado.
// Por isso o token é definido antes do import dinâmico abaixo — e esse import
// acontece na avaliação deste arquivo, uma única vez, fora do tempo de execução
// dos casos. Antes, cada caso repetia stubEnv + vi.resetModules() + import
// dinâmico e pagava de novo o carregamento da cadeia de LangGraph/Prisma/
// embeddings/tools dentro do próprio teste, estourando o testTimeout padrão.
vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "secret");

const { registerEvolutionWebhookRoutes } = await import(
  "../../src/modules/channel/routes/evolutionWebhook.routes.js"
);

describe("Evolution webhook route", () => {
  let app: FastifyInstance;

  // App próprio por caso, com a rota, o guard de token e o mapper reais.
  beforeEach(async () => {
    app = Fastify();
    await registerEvolutionWebhookRoutes(app, {} as never);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("rejects invalid webhook tokens", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=wrong",
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects malformed payloads even with a valid webhook token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      ok: false,
      error: "Payload did not map to inbound message",
    });
  });

  it("does not expose the removed legacy frontend webhook bridge", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/evolution-go?token=secret&source=evolution",
      payload: { instance: "salao-principal" },
    });

    expect(response.statusCode).toBe(404);
  });
});
