/**
 * Prisma em memoria, reduzido ao que o controle humano le e escreve.
 *
 * Existe para que `SessionService`, `HandoffService` e o grafo rodem juntos e
 * de verdade no gate de core, sem banco pessoal. Nao pretende reimplementar o
 * Prisma: cobre chave composta, `updateMany`, `upsert`, `increment`, `include`
 * de handoffs abertos e `$transaction`, que e o que essas classes usam.
 *
 * A prova contra PostgreSQL real fica em `tests/integration`.
 */

import type { PrismaClient } from "../../../src/generated/prisma/client.js";

type Row = Record<string, unknown>;

function isPlainObject(value: unknown): value is Row {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/** Chave composta do Prisma (`tenantId_id`) vira comparacao campo a campo. */
function flattenWhere(where: Row | undefined): Row {
  const flat: Row = {};
  for (const [key, value] of Object.entries(where ?? {})) {
    if (key.includes("_") && isPlainObject(value)) {
      Object.assign(flat, value);
      continue;
    }
    flat[key] = value;
  }
  return flat;
}

function matches(row: Row, where: Row | undefined): boolean {
  return Object.entries(flattenWhere(where)).every(([key, expected]) => {
    const actual = row[key];
    if (expected instanceof Date && actual instanceof Date) {
      return actual.getTime() === expected.getTime();
    }
    if (expected === null) return actual === null || actual === undefined;
    return actual === expected;
  });
}

function applyData(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (isPlainObject(value) && typeof value.increment === "number") {
      row[key] = ((row[key] as number) ?? 0) + value.increment;
      continue;
    }
    row[key] = value;
  }
}

function sortRows(rows: Row[], orderBy: unknown): Row[] {
  if (!isPlainObject(orderBy)) return rows;
  const [key, direction] = Object.entries(orderBy)[0] ?? [];
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    const leftValue = left instanceof Date ? left.getTime() : Number(left ?? 0);
    const rightValue =
      right instanceof Date ? right.getTime() : Number(right ?? 0);
    return direction === "desc" ? rightValue - leftValue : leftValue - rightValue;
  });
}

class FakeTable {
  readonly rows: Row[] = [];
  private sequence = 0;

  constructor(
    private readonly name: string,
    private readonly defaults: Row = {},
  ) {}

  private materialize(data: Row): Row {
    this.sequence += 1;
    const row: Row = {
      id: `${this.name}-${this.sequence}`,
      ...this.defaults,
      ...data,
    };
    return row;
  }

  find(where: Row | undefined, orderBy?: unknown): Row | null {
    const found = sortRows(
      this.rows.filter((row) => matches(row, where)),
      orderBy,
    );
    return found[0] ?? null;
  }

  async findUnique(args: { where: Row }): Promise<Row | null> {
    return this.find(args.where);
  }

  async findFirst(args: {
    where?: Row;
    orderBy?: unknown;
  }): Promise<Row | null> {
    return this.find(args.where, args.orderBy);
  }

  async findMany(args: { where?: Row; orderBy?: unknown } = {}): Promise<Row[]> {
    return sortRows(
      this.rows.filter((row) => matches(row, args.where)),
      args.orderBy,
    );
  }

  async create(args: { data: Row }): Promise<Row> {
    const row = this.materialize(args.data);
    this.rows.push(row);
    return row;
  }

  async update(args: { where: Row; data: Row }): Promise<Row> {
    const row = this.find(args.where);
    if (!row) throw new Error(`${this.name}: row not found for update.`);
    applyData(row, args.data);
    return row;
  }

  async updateMany(args: {
    where?: Row;
    data: Row;
  }): Promise<{ count: number }> {
    const affected = this.rows.filter((row) => matches(row, args.where));
    for (const row of affected) applyData(row, args.data);
    return { count: affected.length };
  }

  async upsert(args: {
    where: Row;
    update: Row;
    create: Row;
  }): Promise<Row> {
    const row = this.find(args.where);
    if (row) {
      applyData(row, args.update);
      return row;
    }
    return this.create({ data: { ...flattenWhere(args.where), ...args.create } });
  }
}

export interface FakePrismaStore {
  contact: FakeTable;
  conversation: FakeTable;
  conversationSession: FakeTable;
  handoff: FakeTable;
  message: FakeTable;
}

export function createFakePrisma(): {
  store: FakePrismaStore;
  prisma: PrismaClient;
} {
  const store: FakePrismaStore = {
    contact: new FakeTable("contact", {
      displayName: null,
      ignored: false,
      ignoredAt: null,
      ignoredBy: null,
      ignoredSource: null,
      aiPaused: false,
      aiPausedAt: null,
      aiPausedReason: null,
      categoryOverride: null,
      categoryOverrideAt: null,
      categoryOverrideBy: null,
    }),
    conversation: new FakeTable("conversation", {
      status: "ACTIVE",
      humanHandoff: false,
      handoffPausedUntil: null,
      contactId: null,
      customerName: null,
      state: {},
    }),
    conversationSession: new FakeTable("conversationSession", {
      endedAt: null,
      endedReason: null,
      lastContactMessageAt: null,
      inboundVersion: 0,
      category: "UNCLASSIFIED",
      categorySource: "AUTOMATIC",
      categoryUpdatedAt: null,
      categoryUpdatedBy: null,
      suggestedCategory: null,
      suggestionProvenance: null,
      suggestedAt: null,
      humanHandling: false,
      humanHandlingSince: null,
      humanHandlingSource: null,
      humanHandlingBy: null,
      contextResetAt: null,
    }),
    handoff: new FakeTable("handoff", {
      status: "OPEN",
      summary: null,
      resolvedAt: null,
      createdAt: new Date(),
    }),
    message: new FakeTable("message", {}),
  };

  // `getBotPauseContext` pede os handoffs abertos junto da conversa.
  const conversationWithInclude = {
    findUnique: async (args: { where: Row; include?: Row }) => {
      const row = store.conversation.find(args.where);
      if (!row) return null;
      if (!args.include) return row;
      return {
        ...row,
        handoffs: await store.handoff.findMany({
          where: { conversationId: row.id, status: "OPEN" },
          orderBy: { createdAt: "desc" },
        }),
      };
    },
    findFirst: (args: { where?: Row; orderBy?: unknown }) =>
      store.conversation.findFirst(args),
    findMany: (args: { where?: Row; orderBy?: unknown }) =>
      store.conversation.findMany(args),
    create: (args: { data: Row }) => store.conversation.create(args),
    update: (args: { where: Row; data: Row }) => store.conversation.update(args),
    updateMany: (args: { where?: Row; data: Row }) =>
      store.conversation.updateMany(args),
    upsert: (args: { where: Row; update: Row; create: Row }) =>
      store.conversation.upsert(args),
  };

  const prisma = {
    contact: store.contact,
    conversation: conversationWithInclude,
    conversationSession: store.conversationSession,
    handoff: store.handoff,
    message: store.message,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  return { store, prisma: prisma as unknown as PrismaClient };
}
