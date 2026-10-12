import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// O rate limit global do BFF é 300 requisições por minuto, por IP.
const GLOBAL_LIMIT = 300;

async function appWithTrustProxyHops(hops: string): Promise<FastifyInstance> {
  vi.resetModules();
  vi.stubEnv("TRUST_PROXY_HOPS", hops);
  const { buildApp } = await import("../src/app.js");
  return buildApp();
}

// Simula o proxy reverso: o socket é sempre o do proxy, e o IP do usuário
// chega só em X-Forwarded-For.
function healthFrom(app: FastifyInstance, clientIp: string) {
  return app.inject({
    method: "GET",
    url: "/health",
    remoteAddress: "10.0.0.2",
    headers: { "x-forwarded-for": clientIp },
  });
}

async function exhaustLimitFrom(app: FastifyInstance, clientIp: string) {
  for (let index = 0; index < GLOBAL_LIMIT; index += 1) {
    expect((await healthFrom(app, clientIp)).statusCode).toBe(200);
  }
  expect((await healthFrom(app, clientIp)).statusCode).toBe(429);
}

describe("rate limit atrás de proxy reverso", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("com TRUST_PROXY_HOPS=1, um usuário que esgota o limite não bloqueia outro", async () => {
    app = await appWithTrustProxyHops("1");

    await exhaustLimitFrom(app, "203.0.113.10");

    expect((await healthFrom(app, "203.0.113.20")).statusCode).toBe(200);
  });

  it("sem proxy confiável, X-Forwarded-For forjado não escapa do limite", async () => {
    app = await appWithTrustProxyHops("0");

    await exhaustLimitFrom(app, "203.0.113.10");

    expect((await healthFrom(app, "203.0.113.20")).statusCode).toBe(429);
  });
});
