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

    const { registerEvolutionWebhookRoutes } = await import(
      "../../src/modules/channel/routes/evolutionWebhook.routes.js"
    );
    const app = Fastify();
    await registerEvolutionWebhookRoutes(app, {} as never);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=wrong",
      payload: {}
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("accepts valid webhook tokens and returns before processing invalid payloads", async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "secret");
    vi.resetModules();

    const { registerEvolutionWebhookRoutes } = await import(
      "../../src/modules/channel/routes/evolutionWebhook.routes.js"
    );
    const app = Fastify();
    await registerEvolutionWebhookRoutes(app, {} as never);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, received: true });
    await app.close();
  });

  it("forwards legacy frontend webhook path to the configured frontend", async () => {
    vi.stubEnv("FRONTEND_WEBHOOK_BASE_URL", "http://frontend.local");
    vi.resetModules();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { registerEvolutionWebhookRoutes } = await import(
      "../../src/modules/channel/routes/evolutionWebhook.routes.js"
    );
    const app = Fastify();
    await registerEvolutionWebhookRoutes(app, {} as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/evolution-go?token=secret&source=evolution",
      payload: { instance: "salao-principal" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://frontend.local/api/webhooks/evolution-go?token=secret&source=evolution",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ instance: "salao-principal" })
      })
    );

    await app.close();
  });
});
