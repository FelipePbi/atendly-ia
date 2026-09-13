import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
]);

type KnowledgeDocumentType =
  | "FAQ"
  | "GUIDANCE"
  | "CARE"
  | "PROCEDURE"
  | "BUSINESS_INFO"
  | "TEXT_POLICY";

interface StoredDocument {
  id: string;
  tenantId: string;
  type: KnowledgeDocumentType;
  serviceId: string | null;
  title: string;
  source: string;
  version: string;
  checksum: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

function document(overrides: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id: "doc-1",
    tenantId: "tenant-a",
    type: "FAQ",
    serviceId: null,
    title: "Horário de funcionamento",
    source: "faq/horario",
    version: "1",
    checksum: "abc123",
    status: "ACTIVE",
    createdAt: new Date("2026-09-13T10:00:00.000Z"),
    updatedAt: new Date("2026-09-13T10:00:00.000Z"),
    ...overrides,
  };
}

/** Dublê do ciclo de vida: só registra o que a rota chamou, sem persistência real. */
function fakeKnowledgeDocuments(seed: StoredDocument[] = []) {
  const calls: Array<{ method: string; args: unknown }> = [];
  return {
    calls,
    service: {
      async list(args: unknown) {
        calls.push({ method: "list", args });
        return seed;
      },
      async get(tenantId: string, id: string) {
        calls.push({ method: "get", args: { tenantId, id } });
        const found = seed.find((doc) => doc.tenantId === tenantId && doc.id === id);
        if (!found) {
          const { AppError } = await import("../../src/lib/errors.js");
          throw new AppError("Knowledge document not found.", {
            statusCode: 404,
            code: "KNOWLEDGE_DOCUMENT_NOT_FOUND",
          });
        }
        return found;
      },
      async create(args: unknown) {
        calls.push({ method: "create", args });
        return document({ ...(args as Partial<StoredDocument>) });
      },
      async edit(args: unknown) {
        calls.push({ method: "edit", args });
        return document({ ...(args as Partial<StoredDocument>), version: "2" });
      },
      async deactivate(tenantId: string, id: string) {
        calls.push({ method: "deactivate", args: { tenantId, id } });
        return document({ tenantId, id, status: "INACTIVE" });
      },
      async saveOtherInfo(args: unknown) {
        calls.push({ method: "saveOtherInfo", args });
        return document({
          type: "BUSINESS_INFO",
          source: "business-info/other-important-information",
          ...(args as Partial<StoredDocument>),
        });
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

describe("rotas internas de conhecimento", () => {
  let app: FastifyInstance;
  let knowledgeDocuments: ReturnType<typeof fakeKnowledgeDocuments>;

  beforeEach(async () => {
    knowledgeDocuments = fakeKnowledgeDocuments([document()]);
    app = Fastify();
    await registerInternalRoutes(app, {} as never, {
      inbox: { countDeadLetters: async () => 0 },
      knowledgeDocuments: knowledgeDocuments.service,
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  it("exige credencial interna vigente", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/knowledge/documents",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("lista documentos escopados pelo tenant do chamador", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/knowledge/documents?type=FAQ&serviceId=service-1",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(knowledgeDocuments.calls[0]).toMatchObject({
      method: "list",
      args: { tenantId: "tenant-a", type: "FAQ", serviceId: "service-1" },
    });
  });

  it("cria documento a partir do corpo validado", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/knowledge/documents",
      headers: headers("tenant-a"),
      payload: {
        type: "FAQ",
        title: "Novo FAQ",
        chunks: [{ content: "Conteúdo do FAQ." }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(knowledgeDocuments.calls[0]).toMatchObject({
      method: "create",
      args: { tenantId: "tenant-a", type: "FAQ", title: "Novo FAQ" },
    });
  });

  it("recusa corpo de criação sem chunk", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/knowledge/documents",
      headers: headers("tenant-a"),
      payload: { type: "FAQ", title: "Sem chunk", chunks: [] },
    });
    expect(response.statusCode).toBe(400);
    expect(knowledgeDocuments.calls).toHaveLength(0);
  });

  it("obtém documento por id, escopado por tenant", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/knowledge/documents/doc-1",
      headers: headers("tenant-a"),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.id).toBe("doc-1");
  });

  it("404 quando o documento não pertence ao tenant do chamador", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/knowledge/documents/doc-1",
      headers: headers("tenant-b"),
    });
    expect(response.statusCode).toBe(404);
  });

  it("edita documento repassando id e corpo ao serviço", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/knowledge/documents/doc-1",
      headers: headers("tenant-a"),
      payload: { chunks: [{ content: "Novo conteúdo." }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.version).toBe("2");
    expect(knowledgeDocuments.calls[0]).toMatchObject({
      method: "edit",
      args: { tenantId: "tenant-a", id: "doc-1" },
    });
  });

  it("desativa documento por id", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/internal/knowledge/documents/doc-1",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("INACTIVE");
    expect(knowledgeDocuments.calls[0]).toMatchObject({
      method: "deactivate",
      args: { tenantId: "tenant-a", id: "doc-1" },
    });
  });

  it("salva o campo livre único do negócio", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/knowledge/other-info",
      headers: headers("tenant-a"),
      payload: { content: "Aceitamos pets de pequeno porte." },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.type).toBe("BUSINESS_INFO");
    expect(knowledgeDocuments.calls[0]).toMatchObject({
      method: "saveOtherInfo",
      args: { tenantId: "tenant-a", content: "Aceitamos pets de pequeno porte." },
    });
  });

  it("recusa a credencial de provisionamento nas rotas de conhecimento", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/knowledge/documents",
      headers: headers("tenant-a", "provisioning"),
    });
    expect(response.statusCode).toBe(403);
  });
});
