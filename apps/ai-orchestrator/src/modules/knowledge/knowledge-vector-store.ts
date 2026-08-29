export const KNOWLEDGE_DOCUMENT_TYPES = [
  "FAQ",
  "GUIDANCE",
  "CARE",
  "PROCEDURE",
  "BUSINESS_INFO",
  "TEXT_POLICY",
] as const;

export type KnowledgeDocumentType = (typeof KNOWLEDGE_DOCUMENT_TYPES)[number];
export type KnowledgeDocumentStatus = "ACTIVE" | "INACTIVE";

export interface KnowledgeChunkInput {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeIndexDocumentInput {
  tenantId: string;
  type: KnowledgeDocumentType;
  title: string;
  source: string;
  version: string;
  status?: KnowledgeDocumentStatus;
  chunks: KnowledgeChunkInput[];
}

export interface KnowledgeIndexResult {
  documentId: string;
  checksum: string;
  chunkCount: number;
}

export interface KnowledgeSearchInput {
  tenantId: string;
  query: string;
  limit: number;
}

export interface KnowledgeSearchResult {
  documentId: string;
  chunkId: string;
  type: KnowledgeDocumentType;
  title: string;
  source: string;
  version: string;
  content: string;
  metadata: unknown;
  score: number;
}

export interface KnowledgeVectorStore {
  indexDocument(
    input: KnowledgeIndexDocumentInput,
  ): Promise<KnowledgeIndexResult>;
  search(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult[]>;
}

export function isOperationalKnowledgeQuery(query: string): boolean {
  const normalized = normalizeText(query);
  return (
    /(preco|valor|quanto custa|servico ativo|servicos ativos)/u.test(
      normalized,
    ) ||
    /(agenda|agendamento|appointment|horario|disponib|slot|marcar|remarcar|reagendar|cancelar)/u.test(
      normalized,
    ) ||
    /(status do whatsapp|whatsapp conectado|status da integracao|integracao conectada)/u.test(
      normalized,
    )
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
