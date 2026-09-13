/**
 * Vocabulario da memoria do cliente (Goal012).
 *
 * `CustomerMemory` e a memoria **da pessoa**, por `(tenantId, customerId)` do
 * Scheduling, com origem, permissao e validade. Nao se confunde com
 * `ConversationMemory`, que vive em `Conversation.state`, dura o tempo da
 * sessao (~24 h) e nunca vira memoria da pessoa por si so.
 */

/** Tipos de memoria que o produto reconhece hoje. */
export const CUSTOMER_MEMORY_KINDS = [
  "PREFERRED_PERIOD",
  "PREFERRED_DAY",
  "RECURRING_SERVICE",
  "OBSERVATION",
] as const;

export type CustomerMemoryKind = (typeof CUSTOMER_MEMORY_KINDS)[number];

export const CUSTOMER_MEMORY_ORIGINS = [
  "CUSTOMER_STATED",
  "AI_INFERRED",
  "PROFESSIONAL",
] as const;

export type CustomerMemoryOrigin = (typeof CUSTOMER_MEMORY_ORIGINS)[number];

const KIND_LABELS: Record<CustomerMemoryKind, string> = {
  PREFERRED_PERIOD: "periodo preferido",
  PREFERRED_DAY: "dia preferido",
  RECURRING_SERVICE: "servico recorrente",
  OBSERVATION: "observacao",
};

const ORIGIN_LABELS: Record<CustomerMemoryOrigin, string> = {
  CUSTOMER_STATED: "informado pela cliente",
  AI_INFERRED: "inferido pela IA",
  PROFESSIONAL: "cadastrado pela profissional",
};

export function customerMemoryKindLabel(kind: string): string {
  return isCustomerMemoryKind(kind) ? KIND_LABELS[kind] : kind;
}

export function customerMemoryOriginLabel(
  origin: CustomerMemoryOrigin,
): string {
  return ORIGIN_LABELS[origin];
}

export function isCustomerMemoryKind(
  value: string,
): value is CustomerMemoryKind {
  return (CUSTOMER_MEMORY_KINDS as readonly string[]).includes(value);
}

/** Linha de memoria como o resto da IA a enxerga. */
export interface CustomerMemoryRecord {
  id: string;
  tenantId: string;
  customerId: string;
  kind: string;
  value: string;
  origin: CustomerMemoryOrigin;
  aiAllowed: boolean;
  confidence: number | null;
  sourceConversationId: string | null;
  sourceMessageIds: string[];
  observedAt: Date;
  lastReinforcedAt: Date | null;
  supersededById: string | null;
  removedAt: Date | null;
  removedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Projecao que chega ao prompt.
 *
 * So existe para memoria **permitida**: o filtro de permissao acontece na
 * consulta, nao aqui, para que nenhuma chamada consiga pedir "tudo" e depois
 * esquecer de filtrar.
 */
export interface CustomerMemoryPromptItem {
  kind: string;
  value: string;
  origin: CustomerMemoryOrigin;
  /** Idade em dias inteiros desde o ultimo reforco (ou desde a observacao). */
  ageDays: number;
  /** Mais velho que `CUSTOMER_MEMORY_STALE_DAYS`: entra, mas com menor peso. */
  stale: boolean;
}

/** Instante que define a idade: reforco recente rejuvenesce a memoria. */
export function customerMemoryRelevantAt(memory: {
  observedAt: Date;
  lastReinforcedAt: Date | null;
}): Date {
  const reinforced = memory.lastReinforcedAt;
  if (!reinforced) return memory.observedAt;
  return reinforced > memory.observedAt ? reinforced : memory.observedAt;
}

export function customerMemoryAgeDays(
  memory: { observedAt: Date; lastReinforcedAt: Date | null },
  now: Date,
): number {
  const elapsed = now.getTime() - customerMemoryRelevantAt(memory).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

export function toCustomerMemoryPromptItem(
  memory: Pick<
    CustomerMemoryRecord,
    "kind" | "value" | "origin" | "observedAt" | "lastReinforcedAt"
  >,
  now: Date,
  staleDays: number,
): CustomerMemoryPromptItem {
  const ageDays = customerMemoryAgeDays(memory, now);
  return {
    kind: memory.kind,
    value: memory.value,
    origin: memory.origin,
    ageDays,
    stale: ageDays > staleDays,
  };
}

/**
 * Normalizacao usada para decidir reforco x contradicao: o mesmo valor dito de
 * outro jeito (caixa, acento, espaco) e reforco, nao uma memoria nova.
 */
export function normalizeMemoryValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}
