import { createHash, randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { Prisma as PrismaNamespace } from "../../generated/prisma/client.js";
import type { EmbeddingProvider } from "./embedding-provider.js";
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "./embedding-provider.js";
import type {
  KnowledgeIndexDocumentInput,
  KnowledgeIndexResult,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
  KnowledgeVectorStore,
} from "./knowledge-vector-store.js";

const MAX_SEARCH_LIMIT = 8;

interface RawKnowledgeSearchRow {
  documentId: string;
  chunkId: string;
  type: KnowledgeSearchResult["type"];
  title: string;
  source: string;
  version: string;
  content: string;
  metadata: unknown;
  score: number;
}

export class PGVectorKnowledgeStore implements KnowledgeVectorStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly embeddings: EmbeddingProvider,
    private readonly minScore = 0.65,
  ) {}

  async indexDocument(
    input: KnowledgeIndexDocumentInput,
  ): Promise<KnowledgeIndexResult> {
    const normalized = normalizeDocumentInput(input);
    const vectors = await this.embeddings.embedDocuments(
      normalized.chunks.map((chunk) => chunk.content),
    );
    if (vectors.length !== normalized.chunks.length) {
      throw new Error("Embedding provider returned an unexpected chunk count.");
    }
    vectors.forEach(assertValidEmbedding);

    const checksum = createHash("sha256")
      .update(
        JSON.stringify({
          type: normalized.type,
          title: normalized.title,
          source: normalized.source,
          version: normalized.version,
          chunks: normalized.chunks,
        }),
      )
      .digest("hex");

    const document = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.knowledgeDocument.upsert({
        where: {
          tenantId_type_source_version: {
            tenantId: normalized.tenantId,
            type: normalized.type,
            source: normalized.source,
            version: normalized.version,
          },
        },
        update: {
          title: normalized.title,
          checksum,
          status: normalized.status,
        },
        create: {
          tenantId: normalized.tenantId,
          type: normalized.type,
          title: normalized.title,
          source: normalized.source,
          version: normalized.version,
          checksum,
          status: normalized.status,
        },
      });

      await transaction.knowledgeChunk.deleteMany({
        where: {
          tenantId: normalized.tenantId,
          documentId: saved.id,
        },
      });

      for (const [index, chunk] of normalized.chunks.entries()) {
        await insertChunk(transaction, {
          id: randomUUID(),
          tenantId: normalized.tenantId,
          documentId: saved.id,
          content: chunk.content,
          metadata: chunk.metadata,
          embedding: requireVector(vectors[index]),
        });
      }

      return saved;
    });

    return {
      documentId: document.id,
      checksum,
      chunkCount: normalized.chunks.length,
    };
  }

  async search(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult[]> {
    const tenantId = requireText(input.tenantId, "tenantId");
    const query = requireText(input.query, "query");
    if (!Number.isInteger(input.limit)) {
      throw new Error("limit must be an integer.");
    }
    const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, input.limit));
    const embedding = await this.embeddings.embedQuery(query);
    assertValidEmbedding(embedding);
    const vector = toVectorLiteral(embedding);

    const rows = await this.prisma.$queryRaw<RawKnowledgeSearchRow[]>(
      PrismaNamespace.sql`
        WITH ranked AS (
          SELECT
            document."id" AS "documentId",
            chunk."id" AS "chunkId",
            document."type"::text AS "type",
            document."title" AS "title",
            document."source" AS "source",
            document."version" AS "version",
            chunk."content" AS "content",
            chunk."metadata" AS "metadata",
            1 - (chunk."embedding" <=> ${vector}::vector) AS "score"
          FROM "KnowledgeChunk" AS chunk
          INNER JOIN "KnowledgeDocument" AS document
            ON document."tenantId" = chunk."tenantId"
            AND document."id" = chunk."documentId"
          WHERE chunk."tenantId" = ${tenantId}
            AND document."tenantId" = ${tenantId}
            AND document."status" = 'ACTIVE'::"KnowledgeDocumentStatus"
        )
        SELECT *
        FROM ranked
        WHERE "score" >= ${this.minScore}
        ORDER BY "score" DESC
        LIMIT ${limit}
      `,
    );

    return rows.map((row) => ({ ...row, score: Number(row.score) }));
  }
}

async function insertChunk(
  transaction: Prisma.TransactionClient,
  input: {
    id: string;
    tenantId: string;
    documentId: string;
    content: string;
    metadata: Record<string, unknown>;
    embedding: number[];
  },
): Promise<void> {
  const vector = toVectorLiteral(input.embedding);
  const metadata = JSON.stringify(input.metadata);
  await transaction.$executeRaw(
    PrismaNamespace.sql`
      INSERT INTO "KnowledgeChunk" (
        "id", "tenantId", "documentId", "content", "metadata",
        "embedding", "createdAt", "updatedAt"
      ) VALUES (
        ${input.id}, ${input.tenantId}, ${input.documentId}, ${input.content},
        ${metadata}::jsonb, ${vector}::vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `,
  );
}

function normalizeDocumentInput(input: KnowledgeIndexDocumentInput) {
  if (input.chunks.length === 0) {
    throw new Error("Knowledge document requires at least one chunk.");
  }
  return {
    tenantId: requireText(input.tenantId, "tenantId"),
    type: input.type,
    title: requireText(input.title, "title"),
    source: requireText(input.source, "source"),
    version: requireText(input.version, "version"),
    status: input.status ?? ("ACTIVE" as const),
    chunks: input.chunks.map((chunk) => ({
      content: requireText(chunk.content, "chunk.content"),
      metadata: chunk.metadata ?? {},
    })),
  };
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function requireVector(value: number[] | undefined): number[] {
  if (!value) throw new Error("Embedding vector is missing.");
  return value;
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
