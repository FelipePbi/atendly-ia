/**
 * Ferramenta de desenvolvimento, não interface operacional.
 *
 * Antes do Goal012 este script era o único caminho de escrita de
 * conhecimento; a partir daqui a interface operacional são as rotas
 * `/internal/knowledge/*`, servidas por `KnowledgeDocumentService`. Este
 * script chama o mesmo serviço para popular um tenant de desenvolvimento a
 * partir de um arquivo JSON, sem duplicar a lógica de versionamento.
 */
import { readFile } from "node:fs/promises";

import { z } from "zod";

import { requireEnv } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { OpenAIEmbeddingProvider } from "../modules/knowledge/embedding-provider.js";
import { PgVectorKnowledgeChunkIndexer } from "../modules/knowledge/knowledge-chunk-indexer.js";
import { KnowledgeDocumentService } from "../modules/knowledge/knowledge-document-service.js";
import { KNOWLEDGE_DOCUMENT_TYPES } from "../modules/knowledge/knowledge-vector-store.js";

const seedSchema = z
  .object({
    type: z.enum(KNOWLEDGE_DOCUMENT_TYPES),
    title: z.string().trim().min(1),
    source: z.string().trim().min(1),
    serviceId: z.string().trim().min(1).optional(),
    chunks: z
      .array(
        z
          .object({
            content: z.string().trim().min(1),
            metadata: z.record(z.string(), z.unknown()).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

requireEnv(["DATABASE_URL", "OPENAI_API_KEY", "OPENAI_EMBEDDING_MODEL"]);

const tenantId = requireProcessEnv("KNOWLEDGE_SEED_TENANT_ID");
const filePath = requireProcessEnv("KNOWLEDGE_SEED_FILE");
const raw = await readFile(filePath, "utf8");
const seed = seedSchema.parse(JSON.parse(raw));
const service = new KnowledgeDocumentService(
  prisma,
  new PgVectorKnowledgeChunkIndexer(new OpenAIEmbeddingProvider()),
);

try {
  const result =
    seed.type === "BUSINESS_INFO"
      ? await service.saveOtherInfo({
          tenantId,
          content: seed.chunks.map((chunk) => chunk.content).join("\n\n"),
        })
      : await service.create({ tenantId, ...seed });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await prisma.$disconnect();
}

function requireProcessEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
