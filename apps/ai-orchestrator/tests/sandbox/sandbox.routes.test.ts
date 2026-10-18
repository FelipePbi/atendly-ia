import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
]);

/**
 * D-199: leitura e escrita do modo sandbox pela rota interna. Escrever exige
 * a credencial de provisionamento (mesma autoridade de
 * `PUT /internal/ai-tenant-config`); ler, a de comando.
 */

function fakePrisma(row: Record<string, unknown> | null) {
  let stored = row;
  const prisma = {
    aiTenantConfig: {
      findUnique: async () => stored,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        stored = { ...(stored ?? {}), ...data };
        return stored;
      },
    },
  } as never;
  return { prisma, read: () => stored };
}

const headers = (use: "command" | "provisioning") => ({
  authorization: `Bearer ${expectedToken(use)}`,
  "x-service-audience": "ai-orchestrator",
  "x-tenant-id": "tenant-a",
  "x-user-id": "user-a",
});

let app: FastifyInstance;

async function build(prisma: never) {
  app = Fastify();
  await registerInternalRoutes(app, prisma, {
    inbox: { countDeadLetters: async () => 0 },
  });
  return app;
}

afterEach(async () => {
  await app?.close();
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("D-199: rotas internas do modo sandbox", () => {
  it("GET devolve o estado gravado", async () => {
    const { prisma } = fakePrisma({
      sandboxEnabled: true,
      sandboxExceptionPhones: ["5511912345678"],
      sandboxUpdatedAt: new Date("2026-10-18T12:00:00.000Z"),
    });
    await build(prisma);

    const response = await app.inject({
      method: "GET",
      url: "/internal/ai-sandbox",
      headers: headers("command"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: unknown }>().data).toEqual({
      enabled: true,
      exceptionPhones: ["5511912345678"],
      updatedAt: "2026-10-18T12:00:00.000Z",
    });
  });

  it("PUT normaliza a lista e grava", async () => {
    const { prisma, read } = fakePrisma({
      tenantId: "tenant-a",
      sandboxEnabled: false,
      sandboxExceptionPhones: [],
      sandboxUpdatedAt: null,
    });
    await build(prisma);

    const response = await app.inject({
      method: "PUT",
      url: "/internal/ai-sandbox",
      headers: headers("provisioning"),
      payload: { enabled: true, exceptionPhones: ["(11) 91234-5678"] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: unknown }>().data).toMatchObject({
      enabled: true,
      exceptionPhones: ["5511912345678"],
    });
    expect(read()).toMatchObject({
      sandboxEnabled: true,
      sandboxExceptionPhones: ["5511912345678"],
    });
  });

  it("PUT com numero invalido e 400 com codigo proprio", async () => {
    const { prisma } = fakePrisma({ tenantId: "tenant-a" });
    await build(prisma);

    const response = await app.inject({
      method: "PUT",
      url: "/internal/ai-sandbox",
      headers: headers("provisioning"),
      payload: { exceptionPhones: ["(99) 1234"] },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain("AI_SANDBOX_INVALID_PHONE");
  });

  it("PUT sem configuracao projetada e 409", async () => {
    const { prisma } = fakePrisma(null);
    await build(prisma);

    const response = await app.inject({
      method: "PUT",
      url: "/internal/ai-sandbox",
      headers: headers("provisioning"),
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.stringify(response.json())).toContain(
      "AI_TENANT_CONFIG_NOT_PROJECTED",
    );
  });

  it("PUT com a credencial de comando e recusado antes de qualquer efeito", async () => {
    const { prisma, read } = fakePrisma({ tenantId: "tenant-a", sandboxEnabled: false });
    await build(prisma);

    const response = await app.inject({
      method: "PUT",
      url: "/internal/ai-sandbox",
      headers: headers("command"),
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(403);
    expect(read()).toMatchObject({ sandboxEnabled: false });
  });

  it("GET /internal/ai-tenant-config inclui sandboxEnabled para o aviso da casca", async () => {
    const { prisma } = fakePrisma({
      enabled: true,
      tone: "BALANCED",
      promptVersion: "v1",
      sandboxEnabled: true,
    });
    await build(prisma);

    const response = await app.inject({
      method: "GET",
      url: "/internal/ai-tenant-config",
      headers: headers("command"),
    });

    expect(response.json<{ data: unknown }>().data).toEqual({
      enabled: true,
      tone: "BALANCED",
      promptVersion: "v1",
      sandboxEnabled: true,
    });
  });
});
