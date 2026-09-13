import { randomUUID } from "node:crypto";

import type { Prisma } from "../../generated/prisma/client.js";
import { Prisma as PrismaNamespace } from "../../generated/prisma/client.js";
import type { EmbeddingProvider } from "./embedding-provider.js";
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "./embedding-provider.js";

export interface KnowledgeChunkWriteInput {
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}

/**
 * Fronteira entre o ciclo de vida do documento (tabela `KnowledgeDocument`,
 * sem coluna vetorial) e a persistência dos chunks com embedding (tabela
 * `KnowledgeChunk`, coluna `vector`, exige a extensão `pgvector`). Isolar essa
 * fronteira permite provar o ciclo de vida do documento contra um PostgreSQL
 * sem a extensão instalada, trocando esta implementação por um dublê.
 */
export interface KnowledgeChunkIndexer {
  /** Calcula o embedding de cada conteúdo, na ordem recebida. Lança se o
   * provider falhar — quem chama decide o que isso significa para o banco. */
  embedChunks(contents: string[]): Promise<number[][]>;
  /** Grava os chunks do documento no mesmo client de transação do chamador. */
  writeChunks(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      documentId: string;
      chunks: KnowledgeChunkWriteInput[];
    },
  ): Promise<void>;
}

export class PgVectorKnowledgeChunkIndexer implements KnowledgeChunkIndexer {
  constructor(private readonly embeddings: EmbeddingProvider) {}

  async embedChunks(contents: string[]): Promise<number[][]> {
    const vectors = await this.embeddings.embedDocuments(contents);
    if (vectors.length !== contents.length) {
      throw new Error("Embedding provider returned an unexpected chunk count.");
    }
    vectors.forEach(assertValidEmbedding);
    return vectors;
  }

  async writeChunks(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      documentId: string;
      chunks: KnowledgeChunkWriteInput[];
    },
  ): Promise<void> {
    for (const chunk of input.chunks) {
      const vector = toVectorLiteral(chunk.embedding);
      const metadata = JSON.stringify(chunk.metadata);
      await tx.$executeRaw(
        PrismaNamespace.sql`
          INSERT INTO "KnowledgeChunk" (
            "id", "tenantId", "documentId", "content", "metadata",
            "embedding", "createdAt", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${input.tenantId}, ${input.documentId}, ${chunk.content},
            ${metadata}::jsonb, ${vector}::vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `,
      );
    }
  }
}

function assertValidEmbedding(embedding: number[]): void {
  if (embedding.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must have ${KNOWLEDGE_EMBEDDING_DIMENSIONS} dimensions.`,
    );
  }
  if (!embedding.every(Number.isFinite)) {
    throw new Error("Embedding contains a non-finite value.");
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
