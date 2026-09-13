import { describe, expect, it, vi } from "vitest";

import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "../../src/modules/knowledge/embedding-provider.js";
import { PGVectorKnowledgeStore } from "../../src/modules/knowledge/pgvector-knowledge-store.js";

interface CapturedSql {
  sql: string;
  values: unknown[];
}

function fakeEmbeddings() {
  return {
    embedDocuments: vi.fn(),
    embedQuery: vi
      .fn()
      .mockResolvedValue(new Array(KNOWLEDGE_EMBEDDING_DIMENSIONS).fill(0.1)),
  };
}

function buildStore(rows: unknown[] = []) {
  const queryRaw = vi.fn().mockResolvedValue(rows);
  const prisma = { $queryRaw: queryRaw };
  const store = new PGVectorKnowledgeStore(
    prisma as never,
    fakeEmbeddings(),
  );
  return { store, queryRaw };
}

function capturedSql(queryRaw: ReturnType<typeof vi.fn>): CapturedSql {
  return queryRaw.mock.calls[0][0] as CapturedSql;
}

describe("PGVectorKnowledgeStore.search: restricao por tenant, status e servico em foco", () => {
  it("restringe a documentos ACTIVE do tenant informado", async () => {
    const { store, queryRaw } = buildStore();

    await store.search({ tenantId: "tenant-1", query: "duvida", limit: 3 });

    const sql = capturedSql(queryRaw);
    expect(sql.sql).toContain('document."tenantId" = ?');
    expect(sql.sql).toContain('chunk."tenantId" = ?');
    expect(sql.sql).toContain(
      'document."status" = \'ACTIVE\'::"KnowledgeDocumentStatus"',
    );
    expect(sql.values).toContain("tenant-1");
  });

  it("sem servico em foco, filtra so documentos gerais (sem servico atrelado)", async () => {
    const { store, queryRaw } = buildStore();

    await store.search({ tenantId: "tenant-1", query: "duvida", limit: 3 });

    const sql = capturedSql(queryRaw);
    expect(sql.sql).toContain('"serviceId" IS NULL');
    expect(sql.sql).toContain("ANY(");
    const focusParam = sql.values.find((value) => Array.isArray(value));
    expect(focusParam).toEqual([]);
  });

  it("com servico em foco, o filtro inclui o servico e o parametro chega a query", async () => {
    const { store, queryRaw } = buildStore();

    await store.search({
      tenantId: "tenant-1",
      query: "duvida sobre cuidado",
      limit: 3,
      focusServiceIds: ["service-1", "service-2"],
    });

    const sql = capturedSql(queryRaw);
    const focusParam = sql.values.find((value) => Array.isArray(value));
    expect(focusParam).toEqual(["service-1", "service-2"]);
  });

  it("a query pede o servico em foco antes do score na ordenacao", async () => {
    const { store, queryRaw } = buildStore();

    await store.search({
      tenantId: "tenant-1",
      query: "duvida",
      limit: 3,
      focusServiceIds: ["service-1"],
    });

    const sql = capturedSql(queryRaw);
    const orderByIndex = sql.sql.indexOf("ORDER BY");
    const serviceIndex = sql.sql.indexOf('"serviceId" IS NOT NULL');
    const scoreOrderIndex = sql.sql.lastIndexOf('"score" DESC');
    expect(orderByIndex).toBeGreaterThan(-1);
    expect(serviceIndex).toBeGreaterThan(orderByIndex);
    expect(scoreOrderIndex).toBeGreaterThan(serviceIndex);
  });

  it("preserva o serviceId de cada linha retornada e converte o score para numero", async () => {
    const { store } = buildStore([
      {
        documentId: "doc-1",
        chunkId: "chunk-1",
        type: "FAQ",
        serviceId: "service-1",
        title: "Titulo",
        source: "faq/1",
        version: "1",
        content: "Conteudo",
        metadata: {},
        score: "0.91",
      },
    ]);

    const results = await store.search({
      tenantId: "tenant-1",
      query: "duvida",
      limit: 3,
      focusServiceIds: ["service-1"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        serviceId: "service-1",
        score: 0.91,
      }),
    ]);
  });
});
