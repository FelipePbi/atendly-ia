import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }, { ContentPurgeService }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
    import("../../src/modules/retention/content-purge-service.js"),
  ]);

/**
 * Goal080 §6.5 — `POST /internal/retention/conversation-content` aceita o
 * terceiro cutoff, `unclassifiedCutoff`, opcional (U-01).
 *
 * Sem banco real: o que a purga apaga com ele fica em
 * `tests/retention/content-purge.test.ts`. Esta suite prova a fronteira da
 * rota — o valor invalido e recusado antes de qualquer purga, o valido chega
 * ao servico, e a ausencia chega ausente, sem ser derivada do comercial.
 */
const COMMERCIAL = "2026-06-17T12:00:00.000Z";
const PERSONAL = "2026-08-16T12:00:00.000Z";
const UNCLASSIFIED = "2026-06-17T12:00:00.000Z";

function fakePrisma() {
  return {
    processedEvent: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
  } as never;
}

async function buildApp() {
  const app = Fastify();
  await registerInternalRoutes(app, fakePrisma());
  return app;
}

function headers(tenantId = "tenant-a") {
  return {
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

const spyOnPurge = () =>
  vi.spyOn(ContentPurgeService.prototype, "purge").mockResolvedValue({
    messages: 0,
    messageAttachments: 0,
    aiRuns: 0,
    aiToolCalls: 0,
    conversationsMarked: 0,
    hasMore: false,
  });

describe("POST /internal/retention/conversation-content — unclassifiedCutoff (Goal080)", () => {
  let app: FastifyInstance;
  let purge: ReturnType<typeof spyOnPurge>;

  beforeEach(() => {
    purge = spyOnPurge();
  });

  afterEach(async () => {
    purge.mockRestore();
    await app?.close();
  });

  const send = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/internal/retention/conversation-content",
      headers: headers(),
      payload,
    });

  it("repassa o terceiro cutoff ao servico de purga", async () => {
    app = await buildApp();
    const response = await send({
      commercialCutoff: COMMERCIAL,
      personalCutoff: PERSONAL,
      unclassifiedCutoff: UNCLASSIFIED,
      maxRows: 100,
    });

    expect(response.statusCode).toBe(200);
    expect(purge).toHaveBeenCalledTimes(1);
    const [input] = purge.mock.calls[0];
    expect(input.tenantId).toBe("tenant-a");
    expect(input.unclassifiedCutoff?.toISOString()).toBe(UNCLASSIFIED);
    expect(input.commercialCutoff.toISOString()).toBe(COMMERCIAL);
    expect(input.personalCutoff.toISOString()).toBe(PERSONAL);
  });

  it("sem o terceiro cutoff, a purga recebe a ausencia — nunca o comercial", async () => {
    app = await buildApp();
    const response = await send({
      commercialCutoff: COMMERCIAL,
      personalCutoff: PERSONAL,
      maxRows: 100,
    });

    expect(response.statusCode).toBe(200);
    expect(purge).toHaveBeenCalledTimes(1);
    const [input] = purge.mock.calls[0];
    expect(input).not.toHaveProperty("unclassifiedCutoff");
  });

  it.each([
    ["texto livre", "ontem"],
    ["data sem hora", "2026-06-17"],
    ["instante sem fuso", "2026-06-17T12:00:00"],
    ["numero", 1_781_697_600_000],
    ["nulo", null],
  ])(
    "recusa unclassifiedCutoff invalido (%s) com 400, sem purga",
    async (_label, unclassifiedCutoff) => {
      app = await buildApp();
      const response = await send({
        commercialCutoff: COMMERCIAL,
        personalCutoff: PERSONAL,
        unclassifiedCutoff,
        maxRows: 100,
      });

      expect(response.statusCode).toBe(400);
      expect(purge).not.toHaveBeenCalled();
    },
  );

  it.each([["commercialCutoff"], ["personalCutoff"]])(
    "continua exigindo %s mesmo com o terceiro cutoff presente",
    async (missing) => {
      app = await buildApp();
      const payload: Record<string, unknown> = {
        commercialCutoff: COMMERCIAL,
        personalCutoff: PERSONAL,
        unclassifiedCutoff: UNCLASSIFIED,
        maxRows: 100,
      };
      delete payload[missing];

      const response = await send(payload);

      expect(response.statusCode).toBe(400);
      expect(purge).not.toHaveBeenCalled();
    },
  );
});
