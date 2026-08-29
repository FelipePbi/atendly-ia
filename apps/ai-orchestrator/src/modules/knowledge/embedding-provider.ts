import { OpenAIEmbeddings } from "@langchain/openai";

import { env, requireEnv } from "../../config/env.js";

export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingProvider {
  embedQuery(query: string): Promise<number[]>;
  embedDocuments(documents: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly embeddings = new OpenAIEmbeddings({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_EMBEDDING_MODEL,
    dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
  });

  async embedQuery(query: string): Promise<number[]> {
    requireEmbeddingEnv();
    return this.embeddings.embedQuery(query);
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    requireEmbeddingEnv();
    return this.embeddings.embedDocuments(documents);
  }
}

function requireEmbeddingEnv(): void {
  requireEnv(["OPENAI_API_KEY", "OPENAI_EMBEDDING_MODEL"]);
}
