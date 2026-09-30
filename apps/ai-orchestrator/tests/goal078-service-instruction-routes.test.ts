import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../src/modules/internal/routes.js"),
  import("../src/lib/internal-credentials.js"),
]);

/** Dublê: só registra o que a rota chamou, sem persistência real. */
function fakeKnowledgeDocuments(
  instructionsByTenantAndService: Record<string, string> = {},
) {
  const calls: Array<{ method: string; args: unknown }> = [];
  const key = (tenantId: string, serviceId: string) => `${tenantId}::${serviceId}`;
  return {
    calls,
    instructionsByTenantAndService,
    service: {
      async getServiceInstruction(tenantId: string, serviceId: string) {
        calls.push({ method: "getServiceInstruction", args: { tenantId, serviceId } });
        return instructionsByTenantAndService[key(tenantId, serviceId)] ?? "";
      },
      async saveServiceInstruction(args: {
        tenantId: string;
        serviceId: string;
        content: string;
      }) {
        calls.push({ method: "saveServiceInstruction", args });
        if (args.content) {
          instructionsByTenantAndService[key(args.tenantId, args.serviceId)] =
            args.content;
        } else {
          delete instructionsByTenantAndService[key(args.tenantId, args.serviceId)];
        }
        return null;
      },
    },
  };
}

function headers(tenantId: string, use: "command" | "provisioning" = "command") {
  return {
    authorization: `Bearer ${expectedToken(use)}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

describe("rotas internas da instrução privada por serviço (Goal078)", () => {
  let app: FastifyInstance;
  let knowledgeDocuments: ReturnType<typeof fakeKnowledgeDocuments>;

  beforeEach(async () => {
    knowledgeDocuments = fakeKnowledgeDocuments();
    app = Fastify();
    await registerInternalRoutes(app, {} as never, {
      inbox: { countDeadLetters: async () => 0 },
      knowledgeDocuments: knowledgeDocuments.service as never,
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  it("exige credencial interna vigente (§6.5)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/knowledge/service-instructions/service-1",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("lê a instrução vazia quando o tenant nunca salvou nada para o serviço", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/knowledge/service-instructions/service-1",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ content: "" });
    expect(knowledgeDocuments.calls[0]).toMatchObject({
      method: "getServiceInstruction",
      args: { tenantId: "tenant-a", serviceId: "service-1" },
    });
  });

  it("lê a instrução gravada, escopada pelo tenant do contexto confiável", async () => {
    knowledgeDocuments = fakeKnowledgeDocuments({
      "tenant-a::service-1": "Não faço coloração em cabelo com henna.",
    });
    await app.close();
    app = Fastify();
    await registerInternalRoutes(app, {} as never, {
      inbox: { countDeadLetters: async () => 0 },
      knowledgeDocuments: knowledgeDocuments.service as never,
    });

    const response = await app.inject({
      method: "GET",
      url: "/internal/knowledge/service-instructions/service-1",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      content: "Não faço coloração em cabelo com henna.",
    });
  });

  it("grava a instrução com o tenant do contexto confiável, nunca do corpo", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/knowledge/service-instructions/service-1",
      headers: headers("tenant-a"),
      payload: { content: "Peça para falar comigo antes de marcar." },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      content: "Peça para falar comigo antes de marcar.",
    });
    expect(knowledgeDocuments.calls[0]).toMatchObject({
      method: "saveServiceInstruction",
      args: {
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Peça para falar comigo antes de marcar.",
      },
    });
  });

  it("gravar texto vazio remove: PUT com content vazio é aceito e devolve vazio", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/knowledge/service-instructions/service-1",
      headers: headers("tenant-a"),
      payload: { content: "" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ content: "" });
  });

  it("recusa corpo fora do schema estrito: campo a mais", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/knowledge/service-instructions/service-1",
      headers: headers("tenant-a"),
      payload: { content: "Texto válido.", extra: "não deveria existir" },
    });

    expect(response.statusCode).toBe(400);
    expect(knowledgeDocuments.calls).toHaveLength(0);
  });

  it("recusa corpo fora do schema estrito: content de tipo errado", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/knowledge/service-instructions/service-1",
      headers: headers("tenant-a"),
      payload: { content: 123 },
    });

    expect(response.statusCode).toBe(400);
    expect(knowledgeDocuments.calls).toHaveLength(0);
  });

  it("recusa a credencial de provisionamento nesta rota", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/knowledge/service-instructions/service-1",
      headers: headers("tenant-a", "provisioning"),
    });
    expect(response.statusCode).toBe(403);
  });
});
