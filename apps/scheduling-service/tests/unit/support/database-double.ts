/**
 * Dublê em memória do recorte do Prisma que `AtendlyCustomerService` usa.
 *
 * Existe para que as regras de identidade — telefone não exclusivo, criação
 * explícita, autorização de notas e tags — sejam verificadas sem banco, e
 * portanto no gate `validate:core`. Persistência de verdade é verificada na
 * suíte de integração, contra PostgreSQL.
 *
 * O dublê **não** reimplementa regra de negócio: ele só guarda linhas e aplica
 * as chaves compostas que o serviço usa. Uma regra que só existir aqui seria
 * um teste que se prova sozinho.
 */

interface Row extends Record<string, unknown> {
  id: string;
  tenantId: string;
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (value !== null && typeof value === "object" && "in" in value) {
      return (value.in as unknown[]).includes(row[key]);
    }
    return row[key] === value;
  });
}

function sortBy(rows: Row[], orderBy: unknown): Row[] {
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((left, right) => {
    for (const clause of clauses) {
      if (!clause || typeof clause !== "object") continue;
      for (const [field, direction] of Object.entries(
        clause as Record<string, "asc" | "desc">,
      )) {
        const a = left[field];
        const b = right[field];
        if (a === b) continue;
        // `null` por último, como o PostgreSQL com NULLS LAST em ASC.
        if (a === null || a === undefined) return 1;
        if (b === null || b === undefined) return -1;
        const comparison = a < b ? -1 : 1;
        return direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}

class Table {
  readonly rows: Row[] = [];

  constructor(
    private readonly prefix: string,
    private readonly compositeKeys: Record<string, string[]>,
  ) {}

  private whereFromUnique(where: Record<string, unknown>): Record<string, unknown> {
    for (const [name, fields] of Object.entries(this.compositeKeys)) {
      const value = where[name];
      if (value && typeof value === "object") {
        return Object.fromEntries(
          fields.map((field) => [
            field,
            (value as Record<string, unknown>)[field],
          ]),
        );
      }
    }
    return where;
  }

  async findMany(args: { where?: Record<string, unknown>; orderBy?: unknown } = {}) {
    const found = this.rows.filter((row) => matches(row, args.where ?? {}));
    return args.orderBy ? sortBy(found, args.orderBy) : found;
  }

  async findFirst(args: { where?: Record<string, unknown> } = {}) {
    return this.rows.find((row) => matches(row, args.where ?? {})) ?? null;
  }

  async findUnique(args: { where: Record<string, unknown> }) {
    return (
      this.rows.find((row) => matches(row, this.whereFromUnique(args.where))) ??
      null
    );
  }

  async findUniqueOrThrow(args: { where: Record<string, unknown> }) {
    const row = await this.findUnique(args);
    if (!row) throw new Error(`${this.prefix} not found`);
    return row;
  }

  async create(args: { data: Record<string, unknown> }) {
    const now = new Date();
    const row: Row = {
      id: nextId(this.prefix),
      createdAt: now,
      updatedAt: now,
      ...args.data,
    } as Row;
    this.rows.push(row);
    return row;
  }

  async update(args: { data: Record<string, unknown>; where: Record<string, unknown> }) {
    const row = await this.findUnique(args);
    if (!row) throw new Error(`${this.prefix} not found`);
    Object.assign(row, args.data, { updatedAt: new Date() });
    return row;
  }

  async updateMany(args: {
    data: Record<string, unknown>;
    where: Record<string, unknown>;
  }) {
    const found = this.rows.filter((row) => matches(row, args.where));
    for (const row of found) {
      Object.assign(row, args.data, { updatedAt: new Date() });
    }
    return { count: found.length };
  }

  async deleteMany(args: { where: Record<string, unknown> }) {
    const kept = this.rows.filter((row) => !matches(row, args.where));
    const count = this.rows.length - kept.length;
    this.rows.length = 0;
    this.rows.push(...kept);
    return { count };
  }

  async upsert(args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }) {
    const existing = await this.findUnique({ where: args.where });
    if (!existing) return this.create({ data: args.create });
    return this.update({ where: args.where, data: args.update });
  }
}

export function createDatabaseDouble() {
  const customer = new Table("customer", {
    tenantId_id: ["tenantId", "id"],
  });
  const customerRelation = new Table("relation", {
    tenantId_id: ["tenantId", "id"],
    tenantId_customerId_type: ["tenantId", "customerId", "type"],
  });
  const customerNote = new Table("note", {
    tenantId_id: ["tenantId", "id"],
  });
  const customerTag = new Table("tag", {
    tenantId_id: ["tenantId", "id"],
    tenantId_customerId_label: ["tenantId", "customerId", "label"],
  });

  // `include: { relatedCustomer: true }` é resolvido aqui porque o serviço o
  // usa para devolver o responsável junto com a relação.
  const withGuardian = async <T extends Row | null>(row: T) => {
    if (!row) return row;
    const related = await customer.findUnique({
      where: {
        tenantId_id: {
          tenantId: row.tenantId,
          id: row.relatedCustomerId as string,
        },
      },
    });
    return { ...row, relatedCustomer: related } as T;
  };

  const client = {
    customer,
    customerNote,
    customerTag,
    customerRelation: {
      ...customerRelation,
      findUnique: async (args: Parameters<Table["findUnique"]>[0]) =>
        withGuardian(await customerRelation.findUnique(args)),
      upsert: async (args: Parameters<Table["upsert"]>[0]) =>
        withGuardian(await customerRelation.upsert(args)),
      update: async (args: Parameters<Table["update"]>[0]) =>
        withGuardian(await customerRelation.update(args)),
      deleteMany: (args: Parameters<Table["deleteMany"]>[0]) =>
        customerRelation.deleteMany(args),
    },
  };

  return { client, tables: { customer, customerRelation, customerNote, customerTag } };
}
