import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { CustomerMemoryOrigin } from "../../src/modules/memory/customer-memory.js";

/**
 * Banco em dobro com as quatro tabelas que a memória do cliente realmente
 * toca: `CustomerMemory`, `Contact`, `Conversation` e `ConversationSession`.
 *
 * Existe para provar a **regra** (porta de entrada da inferência, reforço,
 * substituição, permissão) sem exigir PostgreSQL; a persistência de verdade —
 * substituição, remoção, permissão e isolamento por tenant — é provada contra
 * banco real em `tests/integration/customer-memory.test.ts`.
 */
export interface MemoryRow {
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

export interface ContactRow {
  id: string;
  tenantId: string;
  ignored: boolean;
  customerId: string | null;
  categoryOverride: "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL" | null;
}

export interface ConversationRow {
  id: string;
  tenantId: string;
  contactId: string | null;
}

export interface SessionRow {
  id: string;
  tenantId: string;
  conversationId: string;
  category: "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL";
  humanHandling: boolean;
  endedAt: Date | null;
  startedAt: Date;
}

export interface FakeMemoryWorld {
  memories: MemoryRow[];
  contacts: ContactRow[];
  conversations: ConversationRow[];
  sessions: SessionRow[];
}

export function memoryRow(overrides: Partial<MemoryRow> = {}): MemoryRow {
  const now = new Date("2026-09-13T12:00:00.000Z");
  return {
    id: `memory-${Math.random().toString(36).slice(2, 10)}`,
    tenantId: "tenant-a",
    customerId: "customer-1",
    kind: "PREFERRED_PERIOD",
    value: "tarde",
    origin: "AI_INFERRED",
    aiAllowed: true,
    confidence: 0.6,
    sourceConversationId: null,
    sourceMessageIds: [],
    observedAt: now,
    lastReinforcedAt: null,
    supersededById: null,
    removedAt: null,
    removedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function matches<T>(where: Record<string, unknown>) {
  return (row: T) =>
    Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      return (row as Record<string, unknown>)[key] === value;
    });
}

export function fakeMemoryPrisma(world: Partial<FakeMemoryWorld> = {}) {
  const state: FakeMemoryWorld = {
    memories: world.memories ?? [],
    contacts: world.contacts ?? [],
    conversations: world.conversations ?? [],
    sessions: world.sessions ?? [],
  };
  let sequence = 0;

  const customerMemory = {
    findMany: async ({
      where,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: unknown;
      take?: number;
    }) => {
      const found = state.memories
        .filter(matches<MemoryRow>(where))
        .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
        .map((row) => ({ ...row }));
      return take ? found.slice(0, take) : found;
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const found = state.memories
        .filter(matches<MemoryRow>(where))
        .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];
      return found ? { ...found } : null;
    },
    create: async ({ data }: { data: Partial<MemoryRow> }) => {
      sequence += 1;
      const row = memoryRow({
        ...data,
        id: `memory-created-${sequence}`,
        lastReinforcedAt: null,
        supersededById: null,
        removedAt: null,
        removedBy: null,
      });
      state.memories.push(row);
      return { ...row };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<MemoryRow>;
    }) => {
      const row = state.memories.find((item) => item.id === where.id);
      if (!row) throw new Error("Customer memory row not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  };

  const prisma = {
    customerMemory,
    contact: {
      findUnique: async ({
        where,
      }: {
        where: { tenantId_id: { tenantId: string; id: string } };
      }) => {
        const found = state.contacts.find(
          (row) =>
            row.tenantId === where.tenantId_id.tenantId &&
            row.id === where.tenantId_id.id,
        );
        return found ? { ...found } : null;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = state.contacts.find(matches<ContactRow>(where));
        return found ? { ...found } : null;
      },
    },
    conversation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = state.conversations.find(matches<ConversationRow>(where));
        return found ? { ...found } : null;
      },
    },
    conversationSession: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = state.sessions
          .filter(matches<SessionRow>(where))
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
        return found ? { ...found } : null;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({ customerMemory }),
  };

  return { state, prisma: prisma as unknown as PrismaClient };
}
