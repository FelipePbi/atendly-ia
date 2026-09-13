import { createHash, randomUUID } from "node:crypto";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError, InfrastructureError, toErrorMessage } from "../../lib/errors.js";
import type { KnowledgeChunkIndexer } from "./knowledge-chunk-indexer.js";
import type {
  KnowledgeChunkInput,
  KnowledgeDocumentStatus,
  KnowledgeDocumentType,
} from "./knowledge-vector-store.js";

/** Source fixa e reservada do campo livre "Outras informações importantes". */
export const OTHER_INFO_SOURCE = "business-info/other-important-information";
const OTHER_INFO_TITLE = "Outras informações importantes";

export interface KnowledgeDocumentRecord {
  id: string;
  tenantId: string;
  type: KnowledgeDocumentType;
  serviceId: string | null;
  title: string;
  source: string;
  version: string;
  checksum: string;
  status: KnowledgeDocumentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKnowledgeDocumentInput {
  tenantId: string;
  type: KnowledgeDocumentType;
  serviceId?: string | null;
  title: string;
  /** Identidade estável do documento. Gerada quando omitida. */
  source?: string;
  chunks: KnowledgeChunkInput[];
}

export interface EditKnowledgeDocumentInput {
  tenantId: string;
  id: string;
  title?: string;
  serviceId?: string | null;
  chunks: KnowledgeChunkInput[];
}

export interface ListKnowledgeDocumentsInput {
  tenantId: string;
  type?: KnowledgeDocumentType;
  serviceId?: string | null;
  status?: KnowledgeDocumentStatus;
}

export interface SaveOtherInfoInput {
  tenantId: string;
  content: string;
}

/**
 * Falha ao chamar o provider de embedding durante criação/edição. Nada foi
 * escrito no banco quando este erro é lançado: a chamada acontece antes de
 * qualquer transação.
 */
export class KnowledgeIndexUnavailableError extends InfrastructureError {
  constructor(cause: unknown) {
    super("Knowledge index is unavailable.", {
      code: "KNOWLEDGE_INDEX_UNAVAILABLE",
      details: { cause: toErrorMessage(cause) },
    });
  }
}

/**
 * Ciclo de vida do documento de conhecimento: criar, listar, obter, editar e
 * desativar. Cada edição cria uma versão nova e inativa a anterior na mesma
 * transação; nenhuma linha é apagada (retenção é do Goal022). O embedding é
 * calculado antes da transação — se o provider falhar, nada muda no banco.
 *
 * A persistência dos chunks com embedding é delegada a `KnowledgeChunkIndexer`
 * de propósito: este serviço nunca lê nem escreve a coluna vetorial
 * diretamente, então o ciclo de vida do documento pode ser provado com um
 * dublê, sem exigir a extensão `pgvector`.
 */
export class KnowledgeDocumentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly chunkIndexer: KnowledgeChunkIndexer,
  ) {}

  async list(
    input: ListKnowledgeDocumentsInput,
  ): Promise<KnowledgeDocumentRecord[]> {
    const documents = await this.prisma.knowledgeDocument.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.type ? { type: input.type } : {}),
        ...(input.serviceId !== undefined ? { serviceId: input.serviceId } : {}),
        status: input.status ?? "ACTIVE",
      },
      orderBy: { updatedAt: "desc" },
    });
    return documents.map(toRecord);
  }

  async get(tenantId: string, id: string): Promise<KnowledgeDocumentRecord> {
    return toRecord(await this.requireDocument(tenantId, id));
  }

  async create(
    input: CreateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocumentRecord> {
    if (input.type === "BUSINESS_INFO") {
      throw businessInfoReservedError();
    }
    const tenantId = requireText(input.tenantId, "tenantId");
    const title = requireText(input.title, "title");
    const chunks = normalizeChunks(input.chunks);
    const source = input.source?.trim() || generateSource(input.type);
    const serviceId = input.serviceId?.trim() || null;

    const collision = await this.prisma.knowledgeDocument.findFirst({
      where: { tenantId, type: input.type, source, status: "ACTIVE" },
    });
    if (collision) {
      throw new AppError(
        "An active knowledge document already exists for this source.",
        { statusCode: 409, code: "KNOWLEDGE_DOCUMENT_SOURCE_CONFLICT" },
      );
    }

    const version = String(
      (await this.prisma.knowledgeDocument.count({
        where: { tenantId, type: input.type, source },
      })) + 1,
    );

    const created = await this.createVersion({
      tenantId,
      type: input.type,
      serviceId,
      title,
      source,
      version,
      chunks,
    });
    return toRecord(created);
  }

  async edit(
    input: EditKnowledgeDocumentInput,
  ): Promise<KnowledgeDocumentRecord> {
    const tenantId = requireText(input.tenantId, "tenantId");
    const current = await this.requireDocument(tenantId, input.id);
    if (current.status !== "ACTIVE") {
      throw new AppError(
        "Only the active version of a knowledge document can be edited.",
        { statusCode: 409, code: "KNOWLEDGE_DOCUMENT_NOT_ACTIVE" },
      );
    }
    if (current.type === "BUSINESS_INFO") {
      throw businessInfoReservedError();
    }

    const title = input.title !== undefined ? requireText(input.title, "title") : current.title;
    const serviceId =
      input.serviceId !== undefined ? input.serviceId?.trim() || null : current.serviceId;
    const chunks = normalizeChunks(input.chunks);

    return toRecord(
      await this.replaceVersion({
        current,
        title,
        serviceId,
        chunks,
      }),
    );
  }

  async deactivate(
    tenantId: string,
    id: string,
  ): Promise<KnowledgeDocumentRecord> {
    const current = await this.requireDocument(tenantId, id);
    if (current.status === "INACTIVE") return toRecord(current);
    const updated = await this.prisma.knowledgeDocument.update({
      where: { tenantId_id: { tenantId, id } },
      data: { status: "INACTIVE" },
    });
    return toRecord(updated);
  }

  async saveOtherInfo(
    input: SaveOtherInfoInput,
  ): Promise<KnowledgeDocumentRecord> {
    const tenantId = requireText(input.tenantId, "tenantId");
    const chunks = normalizeChunks([{ content: input.content }]);
    const current = await this.prisma.knowledgeDocument.findFirst({
      where: {
        tenantId,
        type: "BUSINESS_INFO",
        source: OTHER_INFO_SOURCE,
        status: "ACTIVE",
      },
    });

    if (!current) {
      const version = String(
        (await this.prisma.knowledgeDocument.count({
          where: { tenantId, type: "BUSINESS_INFO", source: OTHER_INFO_SOURCE },
        })) + 1,
      );
      return toRecord(
        await this.createVersion({
          tenantId,
          type: "BUSINESS_INFO",
          serviceId: null,
          title: OTHER_INFO_TITLE,
          source: OTHER_INFO_SOURCE,
          version,
          chunks,
        }),
      );
    }

    return toRecord(
      await this.replaceVersion({
        current,
        title: current.title,
        serviceId: current.serviceId,
        chunks,
      }),
    );
  }

  private async requireDocument(tenantId: string, id: string) {
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { tenantId, id },
    });
    if (!document) {
      throw new AppError("Knowledge document not found.", {
        statusCode: 404,
        code: "KNOWLEDGE_DOCUMENT_NOT_FOUND",
      });
    }
    return document;
  }

  /** Cria a primeira versão de um `source` novo: sem versão anterior a inativar. */
  private async createVersion(input: {
    tenantId: string;
    type: KnowledgeDocumentType;
    serviceId: string | null;
    title: string;
    source: string;
    version: string;
    chunks: Array<{ content: string; metadata: Record<string, unknown> }>;
  }) {
    const checksum = computeChecksum({
      type: input.type,
      title: input.title,
      serviceId: input.serviceId,
      source: input.source,
      chunks: input.chunks,
    });
    const embeddings = await this.embedOrThrow(input.chunks);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.knowledgeDocument.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          type: input.type,
          serviceId: input.serviceId,
          title: input.title,
          source: input.source,
          version: input.version,
          checksum,
          status: "ACTIVE",
        },
      });
      await this.chunkIndexer.writeChunks(tx, {
        tenantId: input.tenantId,
        documentId: created.id,
        chunks: withEmbeddings(input.chunks, embeddings),
      });
      return created;
    });
  }

  /**
   * Substitui a versão vigente: se o conteúdo não mudou (mesmo checksum), não
   * gera versão nova e não chama o provider de embedding. Caso contrário,
   * calcula o embedding antes de abrir a transação e, dentro dela, inativa a
   * versão vigente e insere a nova com os chunks.
   */
  private async replaceVersion(input: {
    current: {
      id: string;
      tenantId: string;
      type: KnowledgeDocumentType;
      source: string;
      checksum: string;
    };
    title: string;
    serviceId: string | null;
    chunks: Array<{ content: string; metadata: Record<string, unknown> }>;
  }) {
    const { current } = input;
    const checksum = computeChecksum({
      type: current.type,
      title: input.title,
      serviceId: input.serviceId,
      source: current.source,
      chunks: input.chunks,
    });
    if (checksum === current.checksum) {
      return this.requireDocument(current.tenantId, current.id);
    }

    const embeddings = await this.embedOrThrow(input.chunks);
    const version = String(
      await this.prisma.knowledgeDocument.count({
        where: { tenantId: current.tenantId, type: current.type, source: current.source },
      }).then((count) => count + 1),
    );

    return this.prisma.$transaction(async (tx) => {
      const deactivated = await tx.knowledgeDocument.updateMany({
        where: { tenantId: current.tenantId, id: current.id, status: "ACTIVE" },
        data: { status: "INACTIVE" },
      });
      if (deactivated.count === 0) {
        throw new AppError(
          "Only the active version of a knowledge document can be edited.",
          { statusCode: 409, code: "KNOWLEDGE_DOCUMENT_NOT_ACTIVE" },
        );
      }
      const created = await tx.knowledgeDocument.create({
        data: {
          id: randomUUID(),
          tenantId: current.tenantId,
          type: current.type,
          serviceId: input.serviceId,
          title: input.title,
          source: current.source,
          version,
          checksum,
          status: "ACTIVE",
        },
      });
      await this.chunkIndexer.writeChunks(tx, {
        tenantId: current.tenantId,
        documentId: created.id,
        chunks: withEmbeddings(input.chunks, embeddings),
      });
      return created;
    });
  }

  private async embedOrThrow(
    chunks: Array<{ content: string }>,
  ): Promise<number[][]> {
    try {
      return await this.chunkIndexer.embedChunks(chunks.map((chunk) => chunk.content));
    } catch (error) {
      throw new KnowledgeIndexUnavailableError(error);
    }
  }
}

function businessInfoReservedError(): AppError {
  return new AppError(
    "BUSINESS_INFO documents are managed through the other-info endpoint.",
    { statusCode: 409, code: "KNOWLEDGE_BUSINESS_INFO_RESERVED" },
  );
}

function generateSource(type: KnowledgeDocumentType): string {
  return `${type.toLowerCase()}/${randomUUID()}`;
}

function normalizeChunks(
  chunks: KnowledgeChunkInput[],
): Array<{ content: string; metadata: Record<string, unknown> }> {
  if (chunks.length === 0) {
    throw new AppError("Knowledge document requires at least one chunk.", {
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  }
  return chunks.map((chunk) => ({
    content: requireText(chunk.content, "chunk.content"),
    metadata: chunk.metadata ?? {},
  }));
}

function withEmbeddings(
  chunks: Array<{ content: string; metadata: Record<string, unknown> }>,
  embeddings: number[][],
): Array<{ content: string; metadata: Record<string, unknown>; embedding: number[] }> {
  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index] ?? [],
  }));
}

function computeChecksum(input: {
  type: KnowledgeDocumentType;
  title: string;
  serviceId: string | null;
  source: string;
  chunks: Array<{ content: string; metadata: Record<string, unknown> }>;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        type: input.type,
        title: input.title,
        serviceId: input.serviceId,
        source: input.source,
        chunks: input.chunks,
      }),
    )
    .digest("hex");
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AppError(`${field} is required.`, {
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  }
  return normalized;
}

function toRecord(document: {
  id: string;
  tenantId: string;
  type: KnowledgeDocumentType;
  serviceId: string | null;
  title: string;
  source: string;
  version: string;
  checksum: string;
  status: KnowledgeDocumentStatus;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeDocumentRecord {
  return { ...document };
}
