/**
 * OPENAI_BASE_URL redireciona a fronteira do OpenAI para modelo e embeddings
 * (Goal032/WU-01). `config/env.js` congela process.env na avaliação do
 * módulo, então cada base exige recarregar a cadeia — mesmo padrão de
 * `tests/security/channel-credentials.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const REDIRECTED_BASE_URL = "https://gateway.internal.example.com/openai/v1";

async function loadModelProvider(baseUrl?: string) {
  vi.resetModules();
  if (baseUrl !== undefined) vi.stubEnv("OPENAI_BASE_URL", baseUrl);
  vi.stubEnv("OPENAI_API_KEY", "test-api-key");
  vi.stubEnv("OPENAI_MODEL", "gpt-test");
  return import("../../src/modules/model/model-provider.js");
}

async function loadEmbeddingProvider(baseUrl?: string) {
  vi.resetModules();
  if (baseUrl !== undefined) vi.stubEnv("OPENAI_BASE_URL", baseUrl);
  vi.stubEnv("OPENAI_API_KEY", "test-api-key");
  vi.stubEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-test");
  return import("../../src/modules/knowledge/embedding-provider.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("OPENAI_BASE_URL na fronteira do modelo e embeddings", () => {
  it("modelo usa o default https://api.openai.com/v1 sem a variável", async () => {
    const { createChatOpenAI } = await loadModelProvider();
    expect(createChatOpenAI().clientConfig.baseURL).toBe(DEFAULT_BASE_URL);
  });

  it("modelo usa OPENAI_BASE_URL quando redirecionada", async () => {
    const { createChatOpenAI } = await loadModelProvider(REDIRECTED_BASE_URL);
    expect(createChatOpenAI().clientConfig.baseURL).toBe(REDIRECTED_BASE_URL);
  });

  it("embeddings usa o default https://api.openai.com/v1 sem a variável", async () => {
    const { OpenAIEmbeddingProvider } = await loadEmbeddingProvider();
    const provider = new OpenAIEmbeddingProvider();
    expect(embeddingsBaseUrl(provider)).toBe(DEFAULT_BASE_URL);
  });

  it("embeddings usa OPENAI_BASE_URL quando redirecionada", async () => {
    const { OpenAIEmbeddingProvider } = await loadEmbeddingProvider(
      REDIRECTED_BASE_URL,
    );
    const provider = new OpenAIEmbeddingProvider();
    expect(embeddingsBaseUrl(provider)).toBe(REDIRECTED_BASE_URL);
  });
});

/**
 * `embeddings` é privado de propósito (nenhuma costura de injeção nova); o
 * cast só existe para inspecionar a base efetiva do cliente já construído.
 */
function embeddingsBaseUrl(provider: unknown): string {
  const embeddings = (
    provider as { embeddings: { clientConfig: { baseURL: string } } }
  ).embeddings;
  return embeddings.clientConfig.baseURL;
}
