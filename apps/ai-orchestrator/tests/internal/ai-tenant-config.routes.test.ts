import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
]);

interface StoredConfig {
  tenantId: string;
  enabled: boolean;
  tone: string;
  promptVersion: string;
  settings: unknown;
}

/**
 * Banco em dobro so com a configuracao da IA: o que importa aqui e o valor de
 * estilo que a projecao interna grava e devolve.
 */
function fakePrisma(store: { config: StoredConfig | null }) {
  return {
    aiTenantConfig: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { tenantId: string };
        create: StoredConfig;
        update: Partial<StoredConfig>;
      }) => {
        store.config =
          store.config && store.config.tenantId === where.tenantId
            ? { ...store.config, ...update }
            : { ...create };
        return store.config;
      },
      findUnique: async ({ where }: { where: { tenantId: string } }) => {
        if (!store.config || store.config.tenantId !== where.tenantId) {
          return null;
        }
        return store.config;
      },
    },
  } as never;
}

function headers(tenantId: string, token = expectedToken("provisioning")) {
  return {
    authorization: `Bearer ${token}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

function body(tone?: unknown) {
  return {
    enabled: true,
    ...(tone === undefined ? {} : { tone }),
    businessContext: { businessName: "Studio", timezone: "America/Sao_Paulo" },
  };
}

describe("projecao interna do estilo de conversa", () => {
  let app: FastifyInstance;
  let store: { config: StoredConfig | null };

  beforeEach(async () => {
    store = { config: null };
    app = Fastify();
    await registerInternalRoutes(app, fakePrisma(store), {
      inbox: { countDeadLetters: async () => 0 },
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  it.each(["PROFESSIONAL", "BALANCED", "CASUAL"])(
    "aceita o estilo %s e devolve o mesmo valor",
    async (tone) => {
      const response = await app.inject({
        method: "PUT",
        url: "/internal/ai-tenant-config",
        headers: headers("tenant-a"),
        payload: body(tone),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().config.tone).toBe(tone);
      expect(store.config?.tone).toBe(tone);
    },
  );

  it.each([
    ["PROFESSIONAL_OBJECTIVE", "PROFESSIONAL"],
    ["LIGHT_CLOSE", "BALANCED"],
  ])("aceita o legado %s e normaliza para %s", async (legacy, expected) => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/ai-tenant-config",
      headers: headers("tenant-a"),
      payload: body(legacy),
    });

    expect(response.statusCode).toBe(200);
    // A saida usa so o vocabulario novo, inclusive para quem escreveu o antigo.
    expect(response.json().config.tone).toBe(expected);
    expect(store.config?.tone).toBe(expected);
  });

  it("fica no equilibrado quando o corpo nao traz estilo", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/ai-tenant-config",
      headers: headers("tenant-a"),
      payload: body(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.tone).toBe("BALANCED");
  });

  it("recusa estilo desconhecido com erro proprio e sem gravar nada", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/ai-tenant-config",
      headers: headers("tenant-a"),
      payload: body("FRIENDLY"),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: "AI_CONVERSATION_STYLE_UNKNOWN",
      accepted: ["PROFESSIONAL", "BALANCED", "CASUAL"],
      legacyAliases: ["PROFESSIONAL_OBJECTIVE", "LIGHT_CLOSE"],
    });
    expect(store.config).toBeNull();
  });
});

describe("leitura interna da configuracao efetiva do tenant", () => {
  let app: FastifyInstance;
  let store: { config: StoredConfig | null };

  beforeEach(async () => {
    store = {
      config: {
        tenantId: "tenant-a",
        enabled: true,
        tone: "CASUAL",
        promptVersion: "scheduling_v1.0.0",
        settings: null,
      },
    };
    app = Fastify();
    await registerInternalRoutes(app, fakePrisma(store), {
      inbox: { countDeadLetters: async () => 0 },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("devolve o efetivo do tenant do contexto", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/ai-tenant-config",
      headers: headers("tenant-a", expectedToken("command")),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      enabled: true,
      tone: "CASUAL",
      promptVersion: "scheduling_v1.0.0",
    });
  });

  it("devolve null quando o tenant nunca foi projetado", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/ai-tenant-config",
      headers: headers("tenant-nunca-projetado", expectedToken("command")),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toBeNull();
  });

  it("nunca le a configuracao de outro tenant", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/ai-tenant-config",
      headers: headers("tenant-b", expectedToken("command")),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toBeNull();
  });

  it("recusa chamada sem credencial", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/ai-tenant-config",
      headers: {
        "x-tenant-id": "tenant-a",
        "x-user-id": "user-tenant-a",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("recusa credencial de provisionamento: leitura e uso comando", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/ai-tenant-config",
      headers: headers("tenant-a", expectedToken("provisioning")),
    });

    expect(response.statusCode).toBe(403);
  });
});
