import { beforeEach, describe, expect, it } from "vitest";

import type { KnowledgeChunkIndexer } from "../../src/modules/knowledge/knowledge-chunk-indexer.js";
import {
  KnowledgeDocumentService,
  OTHER_INFO_SOURCE,
} from "../../src/modules/knowledge/knowledge-document-service.js";

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

/**
 * Banco em dobro só com a tabela `KnowledgeDocument` (sem coluna vetorial):
 * é o que o ciclo de vida do documento realmente toca. `KnowledgeChunk` fica
 * inteiramente do lado do dublê de `KnowledgeChunkIndexer`.
 */
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

function fakePrisma(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  const chunkRows: ChunkRow[] = [];

  function matches<T>(where: Record<string, unknown>) {
    return (row: T) =>
      Object.entries(where).every(([key, value]) => {
        if (value === undefined) return true;
        return (row as unknown as Record<string, unknown>)[key] === value;
      });
  }

  const prisma = {
    knowledgeDocument: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows
          .filter(matches<Row>(where))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .map((row) => ({ ...row })),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = rows.find(matches<Row>(where));
        return found ? { ...found } : null;
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter(matches<Row>(where)).length,
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
          .filter(matches<ChunkRow>(where))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
        return found ? { ...found } : null;
      },
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
            const matched = rows.filter(matches<Row>(where));
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

function fakeChunkIndexer(options: { embedFails?: boolean } = {}) {
  const embedCalls: string[][] = [];
  const writeCalls: Array<{ tenantId: string; documentId: string }> = [];
  const indexer: KnowledgeChunkIndexer = {
    async embedChunks(contents) {
      embedCalls.push(contents);
      if (options.embedFails) {
        throw new Error("embedding provider is down");
      }
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
  return { indexer, embedCalls, writeCalls };
}

describe("KnowledgeDocumentService", () => {
  let store: ReturnType<typeof fakePrisma>;
  let chunks: ReturnType<typeof fakeChunkIndexer>;
  let service: KnowledgeDocumentService;

  beforeEach(() => {
    store = fakePrisma();
    chunks = fakeChunkIndexer();
    service = new KnowledgeDocumentService(store.prisma, chunks.indexer);
  });

  it("cria a primeira versão ativa com o embedding calculado", async () => {
    const created = await service.create({
      tenantId: "tenant-a",
      type: "FAQ",
      title: "Horário de funcionamento",
      chunks: [{ content: "Abrimos das 9h às 18h." }],
    });

    expect(created.version).toBe("1");
    expect(created.status).toBe("ACTIVE");
    expect(chunks.embedCalls).toHaveLength(1);
    expect(chunks.writeCalls).toEqual([
      { tenantId: "tenant-a", documentId: created.id },
    ]);
  });

  it("recusa criar BUSINESS_INFO pela rota genérica", async () => {
    await expect(
      service.create({
        tenantId: "tenant-a",
        type: "BUSINESS_INFO",
        title: "Outras informações importantes",
        chunks: [{ content: "Aceitamos pets." }],
      }),
    ).rejects.toMatchObject({ code: "KNOWLEDGE_BUSINESS_INFO_RESERVED" });
    expect(store.rows).toHaveLength(0);
  });

  it("recusa fonte que já tem versão ativa no mesmo tenant e tipo", async () => {
    await service.create({
      tenantId: "tenant-a",
      type: "FAQ",
      title: "Preços",
      source: "faq/precos",
      chunks: [{ content: "R$100." }],
    });

    await expect(
      service.create({
        tenantId: "tenant-a",
        type: "FAQ",
        title: "Preços de novo",
        source: "faq/precos",
        chunks: [{ content: "R$120." }],
      }),
    ).rejects.toMatchObject({ code: "KNOWLEDGE_DOCUMENT_SOURCE_CONFLICT" });
  });

  it("edição cria versão nova e inativa a anterior na mesma transação", async () => {
    const v1 = await service.create({
      tenantId: "tenant-a",
      type: "GUIDANCE",
      title: "Cuidados pós-procedimento",
      chunks: [{ content: "Evite sol por 48h." }],
    });

    const v2 = await service.edit({
      tenantId: "tenant-a",
      id: v1.id,
      chunks: [{ content: "Evite sol por 72h." }],
    });

    expect(v2.id).not.toBe(v1.id);
    expect(v2.version).toBe("2");
    expect(v2.status).toBe("ACTIVE");

    const previous = store.rows.find((row) => row.id === v1.id);
    expect(previous?.status).toBe("INACTIVE");
    const current = store.rows.find((row) => row.id === v2.id);
    expect(current?.status).toBe("ACTIVE");
  });

  it("checksum igual não gera versão nova nem chama o embedding", async () => {
    const v1 = await service.create({
      tenantId: "tenant-a",
      type: "CARE",
      title: "Cuidados",
      chunks: [{ content: "Mesmo texto." }],
    });
    chunks.embedCalls.length = 0;

    const result = await service.edit({
      tenantId: "tenant-a",
      id: v1.id,
      chunks: [{ content: "Mesmo texto." }],
    });

    expect(result.id).toBe(v1.id);
    expect(result.version).toBe("1");
    expect(chunks.embedCalls).toHaveLength(0);
    expect(store.rows).toHaveLength(1);
  });

  it("falha de embedding na edição não muda o banco", async () => {
    const v1 = await service.create({
      tenantId: "tenant-a",
      type: "PROCEDURE",
      title: "Procedimento",
      chunks: [{ content: "Passo 1." }],
    });

    const failingChunks = fakeChunkIndexer({ embedFails: true });
    const failingService = new KnowledgeDocumentService(
      store.prisma,
      failingChunks.indexer,
    );

    await expect(
      failingService.edit({
        tenantId: "tenant-a",
        id: v1.id,
        chunks: [{ content: "Passo 1 revisado." }],
      }),
    ).rejects.toMatchObject({ code: "KNOWLEDGE_INDEX_UNAVAILABLE" });

    expect(store.rows).toHaveLength(1);
    const unchanged = store.rows.find((row) => row.id === v1.id);
    expect(unchanged?.status).toBe("ACTIVE");
    expect(unchanged?.checksum).toBe(v1.checksum);
  });

  it("falha de embedding na criação não escreve nenhuma linha", async () => {
    const failingChunks = fakeChunkIndexer({ embedFails: true });
    const failingService = new KnowledgeDocumentService(
      store.prisma,
      failingChunks.indexer,
    );

    await expect(
      failingService.create({
        tenantId: "tenant-a",
        type: "FAQ",
        title: "Nunca grava",
        chunks: [{ content: "Conteúdo." }],
      }),
    ).rejects.toMatchObject({ code: "KNOWLEDGE_INDEX_UNAVAILABLE" });

    expect(store.rows).toHaveLength(0);
  });

  it("recusa editar uma versão que não é mais a ativa", async () => {
    const v1 = await service.create({
      tenantId: "tenant-a",
      type: "FAQ",
      title: "FAQ",
      chunks: [{ content: "v1" }],
    });
    await service.edit({ tenantId: "tenant-a", id: v1.id, chunks: [{ content: "v2" }] });

    await expect(
      service.edit({ tenantId: "tenant-a", id: v1.id, chunks: [{ content: "v3" }] }),
    ).rejects.toMatchObject({ code: "KNOWLEDGE_DOCUMENT_NOT_ACTIVE" });
  });

  it("desativa sem apagar e é idempotente", async () => {
    const v1 = await service.create({
      tenantId: "tenant-a",
      type: "TEXT_POLICY",
      title: "Política",
      chunks: [{ content: "Texto." }],
    });

    const deactivated = await service.deactivate("tenant-a", v1.id);
    expect(deactivated.status).toBe("INACTIVE");

    const again = await service.deactivate("tenant-a", v1.id);
    expect(again.status).toBe("INACTIVE");
    expect(store.rows).toHaveLength(1);
  });

  it("lista documentos ativos por serviço, sem alcançar outro serviço", async () => {
    await service.create({
      tenantId: "tenant-a",
      type: "FAQ",
      title: "FAQ geral",
      chunks: [{ content: "geral" }],
    });
    await service.create({
      tenantId: "tenant-a",
      type: "FAQ",
      serviceId: "service-1",
      title: "FAQ do serviço 1",
      chunks: [{ content: "s1" }],
    });
    await service.create({
      tenantId: "tenant-a",
      type: "FAQ",
      serviceId: "service-2",
      title: "FAQ do serviço 2",
      chunks: [{ content: "s2" }],
    });

    const service1Docs = await service.list({
      tenantId: "tenant-a",
      type: "FAQ",
      serviceId: "service-1",
    });

    expect(service1Docs).toHaveLength(1);
    expect(service1Docs[0]?.title).toBe("FAQ do serviço 1");
  });

  it("isola documentos por tenant: mesma source em tenants diferentes não colide", async () => {
    const a = await service.create({
      tenantId: "tenant-a",
      type: "FAQ",
      source: "faq/horario",
      title: "Horário A",
      chunks: [{ content: "A" }],
    });
    const b = await service.create({
      tenantId: "tenant-b",
      type: "FAQ",
      source: "faq/horario",
      title: "Horário B",
      chunks: [{ content: "B" }],
    });

    expect(a.version).toBe("1");
    expect(b.version).toBe("1");
    const tenantAList = await service.list({ tenantId: "tenant-a" });
    expect(tenantAList.map((doc) => doc.id)).toEqual([a.id]);
  });

  describe("campo livre (BUSINESS_INFO)", () => {
    it("cria a primeira versão do campo livre e depois versiona sem duplicar o documento", async () => {
      const first = await service.saveOtherInfo({
        tenantId: "tenant-a",
        content: "Aceitamos pets de pequeno porte.",
      });
      expect(first.type).toBe("BUSINESS_INFO");
      expect(first.source).toBe(OTHER_INFO_SOURCE);
      expect(first.version).toBe("1");

      const second = await service.saveOtherInfo({
        tenantId: "tenant-a",
        content: "Aceitamos pets de pequeno e médio porte.",
      });
      expect(second.version).toBe("2");
      expect(store.rows.filter((row) => row.type === "BUSINESS_INFO")).toHaveLength(2);
      expect(store.rows.find((row) => row.id === first.id)?.status).toBe("INACTIVE");
    });

    it("conteúdo igual no campo livre não gera versão nova", async () => {
      const first = await service.saveOtherInfo({
        tenantId: "tenant-a",
        content: "Mesmo texto.",
      });
      const second = await service.saveOtherInfo({
        tenantId: "tenant-a",
        content: "Mesmo texto.",
      });
      expect(second.id).toBe(first.id);
      expect(store.rows).toHaveLength(1);
    });

    it("existe no máximo um campo livre ativo por negócio", async () => {
      await service.saveOtherInfo({ tenantId: "tenant-a", content: "Um." });
      await service.saveOtherInfo({ tenantId: "tenant-a", content: "Dois." });
      const active = store.rows.filter(
        (row) => row.type === "BUSINESS_INFO" && row.status === "ACTIVE",
      );
      expect(active).toHaveLength(1);
    });

    it("getOtherInfo devolve exatamente o texto gravado pelo save mais recente", async () => {
      await service.saveOtherInfo({
        tenantId: "tenant-a",
        content: "Aceitamos pets de pequeno porte.",
      });
      await service.saveOtherInfo({
        tenantId: "tenant-a",
        content: "Aceitamos pets de pequeno e médio porte.",
      });

      const content = await service.getOtherInfo("tenant-a");
      expect(content).toBe("Aceitamos pets de pequeno e médio porte.");
    });

    it("getOtherInfo isola por tenant: outro tenant não recebe o documento", async () => {
      await service.saveOtherInfo({
        tenantId: "tenant-a",
        content: "Só do tenant A.",
      });

      const otherTenant = await service.getOtherInfo("tenant-b");
      expect(otherTenant).toBe("");
    });

    it("getOtherInfo sem documento devolve vazio, não erro", async () => {
      await expect(service.getOtherInfo("tenant-sem-nada")).resolves.toBe("");
    });
  });
});
