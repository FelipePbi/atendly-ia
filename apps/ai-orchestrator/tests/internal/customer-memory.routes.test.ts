import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
]);

const TENANT = "tenant-a";
const CUSTOMER = "customer-1";

interface StoredMemory {
  id: string;
  tenantId: string;
  customerId: string;
  kind: string;
  value: string;
  origin: "CUSTOMER_STATED" | "AI_INFERRED" | "PROFESSIONAL";
  aiAllowed: boolean;
  confidence: number | null;
  sourceConversationId: string | null;
  sourceMessageIds: string[];
  observedAt: Date;
  lastReinforcedAt: Date | null;
  supersededById: string | null;
  removedAt: Date | null;
  removedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function memory(overrides: Partial<StoredMemory> = {}): StoredMemory {
  const now = new Date("2026-09-13T12:00:00.000Z");
  return {
    id: "memory-1",
    tenantId: TENANT,
    customerId: CUSTOMER,
    kind: "PREFERRED_PERIOD",
    value: "tarde",
    origin: "AI_INFERRED",
    aiAllowed: true,
    confidence: 0.6,
    sourceConversationId: "conversation-1",
    sourceMessageIds: ["message-1"],
    observedAt: now,
    lastReinforcedAt: null,
    supersededById: null,
    removedAt: null,
    removedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Dublê do serviço de memória: só registra o que a rota pediu. */
function fakeCustomerMemory(seed: StoredMemory[] = []) {
  const calls: Array<{ method: string; args: unknown }> = [];
  return {
    calls,
    service: {
      async list(args: unknown) {
        calls.push({ method: "list", args });
        return seed;
      },
      async create(args: unknown) {
        calls.push({ method: "create", args });
        return memory(args as Partial<StoredMemory>);
      },
      async setPermission(args: unknown) {
        calls.push({ method: "setPermission", args });
        return memory({
          aiAllowed: (args as { aiAllowed: boolean }).aiAllowed,
        });
      },
      async remove(args: unknown) {
        calls.push({ method: "remove", args });
        return memory({
          removedAt: new Date("2026-09-13T13:00:00.000Z"),
          removedBy: (args as { removedBy?: string }).removedBy ?? null,
        });
      },
    },
  };
}

function fakeCustomerSummary() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    service: {
      async generate(args: unknown) {
        calls.push(args as Record<string, unknown>);
        return {
          customerId: (args as { customerId: string }).customerId,
          summary: "Resumo curto.",
          promptVersion: "prompt-summary-v1-abc1234567",
          aiRunId: "run-1",
          sources: { memory: 1, notes: 0, tags: 0, upcomingAppointments: 0 },
        };
      },
    },
  };
}

const prismaStub = {
  aiTenantConfig: { findUnique: async () => null },
} as never;

function headers(token = expectedToken("command")) {
  return {
    authorization: `Bearer ${token}`,
    "x-tenant-id": TENANT,
    "x-user-id": "user-1",
  };
}

describe("rotas internas de memória do cliente e resumo", () => {
  let app: FastifyInstance;
  let memories: ReturnType<typeof fakeCustomerMemory>;
  let summary: ReturnType<typeof fakeCustomerSummary>;

  beforeEach(async () => {
    app = Fastify();
    memories = fakeCustomerMemory([memory()]);
    summary = fakeCustomerSummary();
    await registerInternalRoutes(app, prismaStub, {
      customerMemory: memories.service,
      customerSummary: summary.service,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("lista a memória vigente da pessoa", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/internal/customers/${CUSTOMER}/memory`,
      headers: headers(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      expect.objectContaining({
        id: "memory-1",
        kind: "PREFERRED_PERIOD",
        origin: "AI_INFERRED",
        aiAllowed: true,
      }),
    ]);
    expect(memories.calls[0]).toEqual({
      method: "list",
      args: { tenantId: TENANT, customerId: CUSTOMER },
    });
  });

  it("cria com origem PROFESSIONAL e permissão negada por omissão", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/internal/customers/${CUSTOMER}/memory`,
      headers: headers(),
      payload: { kind: "OBSERVATION", value: "Prefere sala silenciosa" },
    });

    expect(response.statusCode).toBe(201);
    expect(memories.calls[0]?.args).toEqual({
      tenantId: TENANT,
      customerId: CUSTOMER,
      kind: "OBSERVATION",
      value: "Prefere sala silenciosa",
      origin: "PROFESSIONAL",
      aiAllowed: false,
    });
  });

  it("a rota não aceita a origem declarada pelo chamador", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/internal/customers/${CUSTOMER}/memory`,
      headers: headers(),
      payload: {
        kind: "OBSERVATION",
        value: "forjada",
        origin: "CUSTOMER_STATED",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(memories.calls).toHaveLength(0);
  });

  it("recusa tipo de memória fora do vocabulário", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/internal/customers/${CUSTOMER}/memory`,
      headers: headers(),
      payload: { kind: "DIAGNOSTICO", value: "qualquer" },
    });

    expect(response.statusCode).toBe(400);
    expect(memories.calls).toHaveLength(0);
  });

  it("altera a permissão de um item", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/internal/customers/${CUSTOMER}/memory/memory-1`,
      headers: headers(),
      payload: { aiAllowed: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.aiAllowed).toBe(false);
    expect(memories.calls[0]?.args).toEqual({
      tenantId: TENANT,
      customerId: CUSTOMER,
      memoryId: "memory-1",
      aiAllowed: false,
    });
  });

  it("remove o item registrando quem removeu", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/internal/customers/${CUSTOMER}/memory/memory-1`,
      headers: headers(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.removedAt).not.toBeNull();
    expect(memories.calls[0]?.args).toEqual({
      tenantId: TENANT,
      customerId: CUSTOMER,
      memoryId: "memory-1",
      removedBy: "user-1",
    });
  });

  it("gera o resumo e devolve a versão do prompt", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/internal/customers/${CUSTOMER}/summary`,
      headers: headers(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      customerId: CUSTOMER,
      summary: "Resumo curto.",
      promptVersion: "prompt-summary-v1-abc1234567",
    });
    expect(summary.calls[0]).toMatchObject({
      tenantId: TENANT,
      userId: "user-1",
      customerId: CUSTOMER,
    });
  });

  it("recusa credencial de provisionamento: memória e resumo são comando", async () => {
    for (const [method, url] of [
      ["GET", `/internal/customers/${CUSTOMER}/memory`],
      ["POST", `/internal/customers/${CUSTOMER}/summary`],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: headers(expectedToken("provisioning")),
      });

      expect(response.statusCode).toBe(403);
    }
    expect(memories.calls).toHaveLength(0);
    expect(summary.calls).toHaveLength(0);
  });

  it("recusa chamada sem credencial", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/internal/customers/${CUSTOMER}/memory`,
      headers: { "x-tenant-id": TENANT, "x-user-id": "user-1" },
    });

    expect(response.statusCode).toBe(401);
    expect(memories.calls).toHaveLength(0);
  });

  it("caminho vizinho sem escopo declarado continua fechado", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/internal/customers/${CUSTOMER}`,
      headers: headers(),
    });

    expect(response.statusCode).toBe(403);
  });
});
