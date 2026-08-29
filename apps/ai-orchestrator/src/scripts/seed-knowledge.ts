import { readFile } from "node:fs/promises";

import { z } from "zod";

import { env, requireEnv } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { OpenAIEmbeddingProvider } from "../modules/knowledge/embedding-provider.js";
import {
  KNOWLEDGE_DOCUMENT_TYPES,
  type KnowledgeIndexDocumentInput,
} from "../modules/knowledge/knowledge-vector-store.js";
import { PGVectorKnowledgeStore } from "../modules/knowledge/pgvector-knowledge-store.js";

const seedSchema = z
  .object({
    type: z.enum(KNOWLEDGE_DOCUMENT_TYPES),
    title: z.string().trim().min(1),
    source: z.string().trim().min(1),
    version: z.string().trim().min(1),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
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
const store = new PGVectorKnowledgeStore(
  prisma,
  new OpenAIEmbeddingProvider(),
  env.KNOWLEDGE_SEARCH_MIN_SCORE,
);

try {
  const result = await store.indexDocument({
    tenantId,
    ...seed,
  } satisfies KnowledgeIndexDocumentInput);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await prisma.$disconnect();
}

function requireProcessEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
