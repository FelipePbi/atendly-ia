import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const { InternalHttpClient } = await import(
  "../src/clients/internal-http-client.js"
);

/**
 * Goal017/WU-01 — o proxy de mídia (`requestBinary`) precisa de um teto
 * próprio, maior que `EVOLUTION_DOWNLOAD_MEDIA_TIMEOUT_MS` (60s) da IA, sem
 * mudar o teto das rotas JSON (`request`), que continuam com
 * `INTERNAL_HTTP_TIMEOUT_MS`.
 */
describe("InternalHttpClient: teto do proxy de mídia é distinto do teto JSON", () => {
  const context = { tenantId: "tenant-1", userId: "user-1", requestId: "req-1" };
  let timeouts: number[];

  beforeEach(() => {
    timeouts = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      timeouts.push(ms);
      return new AbortController().signal;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("usa INTERNAL_HTTP_TIMEOUT_MS na rota JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { ok: true }, requestId: "r1" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const client = new InternalHttpClient(
      "http://localhost:3000",
      "ai-orchestrator",
    );
    await client.request({
      method: "GET",
      path: "/internal/x",
      context,
      schema: z.object({ data: z.unknown(), requestId: z.string() }),
    });

    expect(timeouts).toEqual([10_000]);
  });

  it("usa INTERNAL_HTTP_MEDIA_TIMEOUT_MS no proxy de mídia, maior que os 60s da IA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(Buffer.from("bytes"), {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          }),
      ),
    );

    const client = new InternalHttpClient(
      "http://localhost:3000",
      "ai-orchestrator",
    );
    await client.requestBinary({ path: "/internal/x/media", context });

    expect(timeouts).toEqual([90_000]);
    expect(timeouts[0]).toBeGreaterThan(60_000);
  });
});

/**
 * Goal017/FIX-001 — `201` (gravado e despachado) e `202` (tentativa gravada,
 * envio não confirmado) são dois sucessos distintos da rota interna de envio.
 * O envelope é igual nos dois; se o cliente do BFF descartar o status, o
 * segundo caso deixa de existir para quem consome a API pública.
 */
describe("InternalHttpClient: o status do serviço interno não é descartado", () => {
  const context = { tenantId: "tenant-1", userId: "user-1", requestId: "req-1" };
  const schema = z.object({ data: z.object({ id: z.string() }) });

  function stub(status: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { id: "msg-1" } }), {
            status,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    return new InternalHttpClient("http://localhost:3000", "ai-orchestrator");
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devolve 202 como 202 em requestWithStatus", async () => {
    const client = stub(202);

    const result = await client.requestWithStatus({
      method: "POST",
      path: "/internal/conversations/conv-1/messages",
      context,
      body: { text: "olá" },
      schema,
    });

    expect(result.status).toBe(202);
    expect(result.data.data.id).toBe("msg-1");
  });

  it("distingue 201 de 202 no mesmo envelope", async () => {
    const client = stub(201);

    const result = await client.requestWithStatus({
      method: "POST",
      path: "/internal/conversations/conv-1/messages",
      context,
      body: { text: "olá" },
      schema,
    });

    expect(result.status).toBe(201);
  });

  it("request continua devolvendo só o corpo, para quem não precisa do status", async () => {
    const client = stub(202);

    const data = await client.request({
      method: "POST",
      path: "/internal/conversations/conv-1/messages",
      context,
      body: { text: "olá" },
      schema,
    });

    expect(data).toEqual({ data: { id: "msg-1" } });
  });
});
