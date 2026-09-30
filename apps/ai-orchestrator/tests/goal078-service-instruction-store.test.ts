import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeChunkIndexer } from "../src/modules/knowledge/knowledge-chunk-indexer.js";
import {
  KnowledgeDocumentService,
  SERVICE_INSTRUCTION_MAX_LENGTH,
  SERVICE_INSTRUCTION_SOURCE_PREFIX,
} from "../src/modules/knowledge/knowledge-document-service.js";
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "../src/modules/knowledge/embedding-provider.js";
import { PGVectorKnowledgeStore } from "../src/modules/knowledge/pgvector-knowledge-store.js";

interface Row {
  id: string;
  tenantId: string;
  type: string;
  serviceId: string | null;
  title: string;
  source: string;
  version: string;
  checksum: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

interface ChunkRow {
  id: string;
  tenantId: string;
  documentId: string;
  content: string;
  createdAt: Date;
}

interface FakeTx {
  knowledgeDocument: {
    create: (args: { data: Row }) => Promise<Row>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Partial<Row>;
    }) => Promise<{ count: number }>;
  };
  knowledgeChunk: {
    create: (args: { data: Omit<ChunkRow, "createdAt"> }) => Promise<ChunkRow>;
  };
}

/** Casa `where` contra a linha: igualdade simples, mais `{ in: [...] }`. */
function matchesWhere<T>(where: Record<string, unknown>) {
  return (row: T) =>
    Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      const cell = (row as unknown as Record<string, unknown>)[key];
      if (value !== null && typeof value === "object" && "in" in value) {
        return (value as { in: unknown[] }).in.includes(cell);
      }
      return cell === value;
    });
}

function fakePrisma(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  const chunkRows: ChunkRow[] = [];

  const prisma = {
    knowledgeDocument: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows
          .filter(matchesWhere<Row>(where))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .map((row) => ({ ...row })),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = rows.find(matchesWhere<Row>(where));
        return found ? { ...found } : null;
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter(matchesWhere<Row>(where)).length,
      update: async ({
        where,
        data,
      }: {
        where: { tenantId_id: { tenantId: string; id: string } };
        data: Partial<Row>;
      }) => {
        const row = rows.find(
          (r) =>
            r.tenantId === where.tenantId_id.tenantId &&
            r.id === where.tenantId_id.id,
        );
        if (!row) throw new Error("Row not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },
    knowledgeChunk: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = chunkRows
          .filter(matchesWhere<ChunkRow>(where))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
        return found ? { ...found } : null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        chunkRows
          .filter(matchesWhere<ChunkRow>(where))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((row) => ({ ...row })),
    },
    $transaction: async <T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> => {
      const tx: FakeTx = {
        knowledgeDocument: {
          create: async ({ data }: { data: Row }) => {
            const row: Row = { ...data, createdAt: new Date(), updatedAt: new Date() };
            rows.push(row);
            return { ...row };
          },
          updateMany: async ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Partial<Row>;
          }) => {
            const matched = rows.filter(matchesWhere<Row>(where));
            matched.forEach((row) =>
              Object.assign(row, data, { updatedAt: new Date() }),
            );
            return { count: matched.length };
          },
        },
        knowledgeChunk: {
          create: async ({ data }: { data: Omit<ChunkRow, "createdAt"> }) => {
            const row: ChunkRow = { ...data, createdAt: new Date() };
            chunkRows.push(row);
            return { ...row };
          },
        },
      };
      return fn(tx);
    },
  };

  return { rows, chunkRows, prisma: prisma as never };
}

function fakeChunkIndexer() {
  const writeCalls: Array<{ tenantId: string; documentId: string }> = [];
  const indexer: KnowledgeChunkIndexer = {
    async embedChunks(contents) {
      return contents.map(() => [0.1, 0.2, 0.3]);
    },
    async writeChunks(tx, input) {
      writeCalls.push({ tenantId: input.tenantId, documentId: input.documentId });
      const typedTx = tx as unknown as FakeTx;
      for (const chunk of input.chunks) {
        await typedTx.knowledgeChunk.create({
          data: {
            id: `${input.documentId}-${chunk.content.length}-${Math.random()}`,
            tenantId: input.tenantId,
            documentId: input.documentId,
            content: chunk.content,
          },
        });
      }
    },
  };
  return { indexer, writeCalls };
}

describe("KnowledgeDocumentService — instrução privada por serviço (Goal078)", () => {
  let store: ReturnType<typeof fakePrisma>;
  let service: KnowledgeDocumentService;

  beforeEach(() => {
    store = fakePrisma();
    service = new KnowledgeDocumentService(store.prisma, fakeChunkIndexer().indexer);
  });

  describe("gravar, ler, substituir e remover (§6.1)", () => {
    it("grava a primeira versão e getServiceInstruction devolve o texto", async () => {
      const saved = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Não faço coloração em cabelo com henna.",
      });
      expect(saved?.type).toBe("GUIDANCE");
      expect(saved?.serviceId).toBe("service-1");
      expect(saved?.source).toBe(`${SERVICE_INSTRUCTION_SOURCE_PREFIX}service-1`);
      expect(saved?.version).toBe("1");

      const content = await service.getServiceInstruction("tenant-a", "service-1");
      expect(content).toBe("Não faço coloração em cabelo com henna.");
    });

    it("texto igual não gera versão nova", async () => {
      const first = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Mesmo texto.",
      });
      const second = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Mesmo texto.",
      });
      expect(second?.id).toBe(first?.id);
      expect(second?.version).toBe("1");
      expect(store.rows).toHaveLength(1);
    });

    it("texto novo inativa a versão anterior e cria a nova", async () => {
      const v1 = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Versão 1.",
      });
      const v2 = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Versão 2.",
      });
      expect(v2?.id).not.toBe(v1?.id);
      expect(v2?.version).toBe("2");
      expect(store.rows.find((row) => row.id === v1?.id)?.status).toBe("INACTIVE");
      expect(store.rows.find((row) => row.id === v2?.id)?.status).toBe("ACTIVE");

      const content = await service.getServiceInstruction("tenant-a", "service-1");
      expect(content).toBe("Versão 2.");
    });

    it("texto vazio remove: inativa a versão ativa e não cria outra", async () => {
      await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Vai ser removido.",
      });

      const removed = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "   ",
      });

      expect(removed).toBeNull();
      expect(store.rows).toHaveLength(1);
      expect(store.rows[0]?.status).toBe("INACTIVE");
      const content = await service.getServiceInstruction("tenant-a", "service-1");
      expect(content).toBe("");
    });

    it("remover quando nunca houve instrução não cria linha nenhuma", async () => {
      const removed = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "",
      });
      expect(removed).toBeNull();
      expect(store.rows).toHaveLength(0);
    });

    it("ler sem instrução ativa devolve vazio, não erro", async () => {
      await expect(
        service.getServiceInstruction("tenant-a", "service-nunca-teve"),
      ).resolves.toBe("");
    });

    it("mais de 2000 caracteres recusa com 400, sem gravar nada", async () => {
      const tooLong = "a".repeat(SERVICE_INSTRUCTION_MAX_LENGTH + 1);
      await expect(
        service.saveServiceInstruction({
          tenantId: "tenant-a",
          serviceId: "service-1",
          content: tooLong,
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
      expect(store.rows).toHaveLength(0);
    });

    it("exatamente 2000 caracteres é aceito", async () => {
      const exact = "a".repeat(SERVICE_INSTRUCTION_MAX_LENGTH);
      await expect(
        service.saveServiceInstruction({
          tenantId: "tenant-a",
          serviceId: "service-1",
          content: exact,
        }),
      ).resolves.toMatchObject({ version: "1" });
    });
  });

  describe("isolamento por tenant (§6.2)", () => {
    it("tenant B com o mesmo serviceId não lê a instrução do tenant A, na leitura unitária", async () => {
      await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Só do tenant A.",
      });

      const otherTenant = await service.getServiceInstruction("tenant-b", "service-1");
      expect(otherTenant).toBe("");
    });

    it("tenant B com o mesmo serviceId não lê a instrução do tenant A, na leitura em lote", async () => {
      await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Só do tenant A.",
      });

      const batch = await service.getServiceInstructions("tenant-b", ["service-1"]);
      expect(batch.size).toBe(0);
    });
  });

  describe("leitura em lote (§1)", () => {
    it("devolve só as instruções ativas pedidas, na ordem da lista, ignorando as ausentes", async () => {
      await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Texto do serviço 1.",
      });
      await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-3",
        content: "Texto do serviço 3.",
      });

      const batch = await service.getServiceInstructions("tenant-a", [
        "service-2",
        "service-3",
        "service-1",
      ]);

      expect([...batch.keys()]).toEqual(["service-3", "service-1"]);
      expect(batch.get("service-3")).toBe("Texto do serviço 3.");
      expect(batch.get("service-1")).toBe("Texto do serviço 1.");
    });

    it("lista vazia não consulta o banco", async () => {
      const prisma = store.prisma as unknown as {
        knowledgeDocument: { findMany: (...args: unknown[]) => unknown };
      };
      const findManySpy = vi.spyOn(prisma.knowledgeDocument, "findMany");

      const batch = await service.getServiceInstructions("", []);

      expect(batch.size).toBe(0);
      expect(findManySpy).not.toHaveBeenCalled();
    });

    it("não devolve versão inativada", async () => {
      await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Primeira.",
      });
      await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "",
      });

      const batch = await service.getServiceInstructions("tenant-a", ["service-1"]);
      expect(batch.size).toBe(0);
    });
  });

  describe("reserva nas rotas genéricas (§6.3)", () => {
    it("create com source service-instruction/x recusa com 409 KNOWLEDGE_SOURCE_RESERVED", async () => {
      await expect(
        service.create({
          tenantId: "tenant-a",
          type: "GUIDANCE",
          title: "Tentativa direta",
          source: `${SERVICE_INSTRUCTION_SOURCE_PREFIX}service-1`,
          chunks: [{ content: "Texto." }],
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "KNOWLEDGE_SOURCE_RESERVED" });
      expect(store.rows).toHaveLength(0);
    });

    it("get do documento reservado recusa com 409", async () => {
      const saved = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Reservado.",
      });
      await expect(
        service.get("tenant-a", saved!.id),
      ).rejects.toMatchObject({ statusCode: 409, code: "KNOWLEDGE_SOURCE_RESERVED" });
    });

    it("edit do documento reservado recusa com 409", async () => {
      const saved = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Reservado.",
      });
      await expect(
        service.edit({
          tenantId: "tenant-a",
          id: saved!.id,
          chunks: [{ content: "Tentando editar direto." }],
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "KNOWLEDGE_SOURCE_RESERVED" });
    });

    it("deactivate do documento reservado recusa com 409", async () => {
      const saved = await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Reservado.",
      });
      await expect(
        service.deactivate("tenant-a", saved!.id),
      ).rejects.toMatchObject({ statusCode: 409, code: "KNOWLEDGE_SOURCE_RESERVED" });
    });

    it("list não devolve o documento reservado, sem filtro de serviceId", async () => {
      await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Reservado.",
      });
      await service.create({
        tenantId: "tenant-a",
        type: "FAQ",
        title: "FAQ comum",
        chunks: [{ content: "conteúdo" }],
      });

      const all = await service.list({ tenantId: "tenant-a" });
      expect(all.map((doc) => doc.type)).toEqual(["FAQ"]);
    });

    it("list não devolve o documento reservado, com filtro de serviceId igual", async () => {
      await service.saveServiceInstruction({
        tenantId: "tenant-a",
        serviceId: "service-1",
        content: "Reservado.",
      });

      const filtered = await service.list({
        tenantId: "tenant-a",
        serviceId: "service-1",
      });
      expect(filtered).toHaveLength(0);
    });
  });
});

describe("PGVectorKnowledgeStore.search — exclusão da instrução privada por serviço (§6.4)", () => {
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
    const store = new PGVectorKnowledgeStore(prisma as never, fakeEmbeddings());
    return { store, queryRaw };
  }

  function capturedSql(queryRaw: ReturnType<typeof vi.fn>): CapturedSql {
    return queryRaw.mock.calls[0][0] as CapturedSql;
  }

  it("o SQL exclui a source reservada antes do LIMIT", async () => {
    const { store, queryRaw } = buildStore();

    await store.search({ tenantId: "tenant-1", query: "duvida", limit: 3 });

    const sql = capturedSql(queryRaw);
    const limitIndex = sql.sql.lastIndexOf("LIMIT");
    const exclusionIndex = sql.sql.indexOf('"source" NOT LIKE');
    expect(exclusionIndex).toBeGreaterThan(-1);
    expect(exclusionIndex).toBeLessThan(limitIndex);
    expect(sql.values).toContain(`${SERVICE_INSTRUCTION_SOURCE_PREFIX}%`);
  });
});
