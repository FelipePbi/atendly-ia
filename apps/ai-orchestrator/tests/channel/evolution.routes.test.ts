import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("Evolution webhook route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("rejects invalid webhook tokens", async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "secret");
    vi.resetModules();

    const { registerEvolutionWebhookRoutes } =
      await import("../../src/modules/channel/routes/evolutionWebhook.routes.js");
    const app = Fastify();
    await registerEvolutionWebhookRoutes(app, {} as never);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=wrong",
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects malformed payloads even with a valid webhook token", async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "secret");
    vi.resetModules();

    const { registerEvolutionWebhookRoutes } =
      await import("../../src/modules/channel/routes/evolutionWebhook.routes.js");
    const app = Fastify();
    await registerEvolutionWebhookRoutes(app, {} as never);

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
    await app.close();
  });

  it("does not expose the removed legacy frontend webhook bridge", async () => {
    vi.resetModules();

    const { registerEvolutionWebhookRoutes } =
      await import("../../src/modules/channel/routes/evolutionWebhook.routes.js");
    const app = Fastify();
    await registerEvolutionWebhookRoutes(app, {} as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/evolution-go?token=secret&source=evolution",
      payload: { instance: "salao-principal" },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });
});
