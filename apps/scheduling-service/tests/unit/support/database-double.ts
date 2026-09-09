/**
 * Dublê em memória do recorte do Prisma que o Scheduling usa em regra de
 * negócio: identidade de pessoas, catálogo e — desde o Goal008 — a política
 * única de escrita da agenda.
 *
 * Existe para que as regras — telefone não exclusivo, criação explícita,
 * autorização de notas e tags, transação/lock/idempotência das mutações —
 * sejam verificadas sem banco, e portanto no gate `validate:core`.
 * Persistência de verdade, concorrência real e relógio do banco são
 * verificados na suíte de integração, contra PostgreSQL.
 *
 * O dublê **não** reimplementa regra de negócio: ele só guarda linhas, aplica
 * as chaves compostas e os filtros que os serviços usam, e registra o que foi
 * escrito e travado. Uma regra que só existir aqui seria um teste que se
 * prova sozinho. Ele também **não** desfaz escrita: o rollback é do banco, e
 * o aborto injetado (`failNextTransactions`) acontece antes de o corpo rodar.
 */

interface Row extends Record<string, unknown> {
  id: string;
  tenantId: string;
}

interface WriteRecord {
  table: string;
  operation: string;
  /** Índice da transação em que a escrita ocorreu; `null` fora de transação. */
  transaction: number | null;
}

/** Instrumentação compartilhada: o que foi travado e o que foi escrito, onde. */
class Journal {
  readonly locks: string[] = [];
  readonly writes: WriteRecord[] = [];
  transaction: number | null = null;
  transactions = 0;
  /** Quantas vezes o instante corrente foi pedido ao banco, e nao ao processo. */
  databaseNowReads = 0;

  record(table: string, operation: string): void {
    this.writes.push({ table, operation, transaction: this.transaction });
  }

  writesFor(table: string): WriteRecord[] {
    return this.writes.filter((write) => write.table === table);
  }
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === "OR") {
      return (value as Array<Record<string, unknown>>).some((clause) =>
        matches(row, clause),
      );
    }
    if (key === "AND") {
      return (value as Array<Record<string, unknown>>).every((clause) =>
        matches(row, clause),
      );
    }
    if (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Date)
    ) {
      return Object.entries(value as Record<string, unknown>).every(
        ([operator, operand]) => {
          const field = row[key];
          switch (operator) {
            case "in":
              return (operand as unknown[]).includes(field);
            case "notIn":
              return !(operand as unknown[]).includes(field);
            case "not":
              return field !== operand;
            case "lt":
              return compare(field, operand) < 0;
            case "lte":
              return compare(field, operand) <= 0;
            case "gt":
              return compare(field, operand) > 0;
            case "gte":
              return compare(field, operand) >= 0;
            default:
              return field === operand;
          }
        },
      );
    }
    return row[key] === value;
  });
}

function compare(left: unknown, right: unknown): number {
  const a = left instanceof Date ? left.getTime() : left;
  const b = right instanceof Date ? right.getTime() : right;
  if (a === b) return 0;
  return (a as never) < (b as never) ? -1 : 1;
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
        if (a === null || a === undefined) {
          if (b === null || b === undefined) continue;
          // `null` por último, como o PostgreSQL com NULLS LAST em ASC.
          return 1;
        }
        if (b === null || b === undefined) return -1;
        const comparison = compare(a, b);
        if (comparison === 0) continue;
        return direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}

interface TableOptions {
  journal?: Journal;
  /** Chaves únicas cuja violação o dublê precisa recusar, como o banco. */
  unique?: string[][];
  /** Colunas com `@default` no schema, preenchidas quando ausentes. */
  defaults?: Record<string, () => unknown>;
}

class Table {
  readonly rows: Row[] = [];
  private readonly journal?: Journal;
  private readonly uniqueKeys: string[][];
  private readonly defaults: Record<string, () => unknown>;
  private readonly pendingFailures: unknown[] = [];

  constructor(
    private readonly prefix: string,
    private readonly compositeKeys: Record<string, string[]>,
    options: TableOptions = {},
  ) {
    this.journal = options.journal;
    this.uniqueKeys = options.unique ?? [];
    this.defaults = options.defaults ?? {};
  }

  /**
   * Faz a próxima escrita (`create`/`update`/`updateMany`) nesta tabela
   * falhar com o erro informado — uma vez. Existe para provar que um erro
   * levantado **entre** o efeito e o evento de uma mutação propaga em vez de
   * ser engolido; o dublê não desfaz o que já escreveu (não há rollback
   * aqui), então o teste verifica a propagação do erro, não a reversão do
   * efeito — reversão real é do banco, coberta na suíte de integração.
   */
  failNext(error: unknown): void {
    this.pendingFailures.push(error);
  }

  private throwIfFailing(): void {
    if (this.pendingFailures.length > 0) throw this.pendingFailures.shift();
  }

  private whereFromUnique(
    where: Record<string, unknown>,
  ): Record<string, unknown> {
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

  private assertUnique(data: Record<string, unknown>): void {
    for (const fields of this.uniqueKeys) {
      const where = Object.fromEntries(
        fields.map((field) => [field, data[field]]),
      );
      if (this.rows.some((row) => matches(row, where))) {
        throw Object.assign(
          new Error(`Unique constraint failed on ${this.prefix}`),
          { code: "P2002" },
        );
      }
    }
  }

  async findMany(
    args: { where?: Record<string, unknown>; orderBy?: unknown } = {},
  ) {
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
    this.throwIfFailing();
    this.assertUnique(args.data);
    const now = new Date();
    const defaults = Object.fromEntries(
      Object.entries(this.defaults).map(([field, value]) => [field, value()]),
    );
    const row: Row = {
      id: nextId(this.prefix),
      createdAt: now,
      updatedAt: now,
      ...defaults,
      ...args.data,
    } as Row;
    this.rows.push(row);
    this.journal?.record(this.prefix, "create");
    return row;
  }

  async update(args: {
    data: Record<string, unknown>;
    where: Record<string, unknown>;
  }) {
    this.throwIfFailing();
    const row = await this.findUnique(args);
    if (!row) throw new Error(`${this.prefix} not found`);
    Object.assign(row, args.data, { updatedAt: new Date() });
    this.journal?.record(this.prefix, "update");
    return row;
  }

  async updateMany(args: {
    data: Record<string, unknown>;
    where: Record<string, unknown>;
  }) {
    this.throwIfFailing();
    const found = this.rows.filter((row) => matches(row, args.where));
    for (const row of found) {
      Object.assign(row, args.data, { updatedAt: new Date() });
    }
    if (found.length > 0) this.journal?.record(this.prefix, "updateMany");
    return { count: found.length };
  }

  async deleteMany(args: { where: Record<string, unknown> }) {
    const kept = this.rows.filter((row) => !matches(row, args.where));
    const count = this.rows.length - kept.length;
    this.rows.length = 0;
    this.rows.push(...kept);
    if (count > 0) this.journal?.record(this.prefix, "deleteMany");
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
  const journal = new Journal();
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
  const service = new Table("service", {
    tenantId_id: ["tenantId", "id"],
  });
  const calendarSettings = new Table("settings", {});
  const availabilityRule = new Table("rule", {});
  const availabilityException = new Table("exception", {});
  const appointment = new Table(
    "appointment",
    { tenantId_id: ["tenantId", "id"] },
    {
      journal,
      // Colunas de ciclo de vida (Goal008) são `NULL` por padrão no schema
      // real; sem o default aqui, o dublê deixaria a chave ausente
      // (`undefined`), e um filtro `presenceConfirmedAt: null` — que o
      // Postgres resolve como `IS NULL` — nunca casaria com uma linha nova.
      defaults: {
        statusRaw: () => null,
        title: () => null,
        completedAt: () => null,
        completedBy: () => null,
        completionOrigin: () => null,
        noShowAt: () => null,
        noShowNote: () => null,
        presenceConfirmedAt: () => null,
        finalValue: () => null,
        finalValueSetAt: () => null,
        finalValueSetBy: () => null,
      },
    },
  );
  const appointmentItem = new Table(
    "appointmentItem",
    { tenantId_id: ["tenantId", "id"] },
    { journal },
  );
  const timeBlock = new Table("timeBlock", {}, { journal });
  const appointmentHold = new Table(
    "appointmentHold",
    { tenantId_id: ["tenantId", "id"] },
    {
      journal,
      defaults: { consumedAt: () => null, releasedAt: () => null },
    },
  );
  // `occurredAt` e `sequence` imitam o banco de propósito: o instante é o
  // mesmo para tudo o que uma mutação grava junto (em PostgreSQL,
  // CURRENT_TIMESTAMP é o início da transação) e só a sequência desempata.
  // Sem isso, o dublê ordenaria por um relógio mais fino que o real e
  // esconderia a ambiguidade que a sequência existe para resolver.
  let eventSequence = 0n;
  const appointmentEvent = new Table(
    "appointmentEvent",
    {},
    {
      journal,
      defaults: {
        occurredAt: () => new Date(),
        sequence: () => (eventSequence += 1n),
      },
    },
  );
  const calendarMutationIdempotency = new Table(
    "idempotency",
    { tenantId_key: ["tenantId", "key"] },
    {
      journal,
      unique: [["tenantId", "key"]],
      defaults: { lockedAt: () => new Date() },
    },
  );

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

  // `include: { customer: true, items: true }` do atendimento.
  const withAppointmentRelations = async <T extends Row | null>(row: T) => {
    if (!row) return row;
    const items = await appointmentItem.findMany({
      where: { tenantId: row.tenantId, appointmentId: row.id },
    });
    const person = await customer.findUnique({
      where: {
        tenantId_id: { tenantId: row.tenantId, id: row.customerId as string },
      },
    });
    return { ...row, items, customer: person } as T;
  };

  const appointmentClient = {
    rows: appointment.rows,
    findMany: async (args: Parameters<Table["findMany"]>[0] = {}) =>
      Promise.all(
        (await appointment.findMany(args)).map(withAppointmentRelations),
      ),
    findFirst: async (args: Parameters<Table["findFirst"]>[0] = {}) =>
      withAppointmentRelations(await appointment.findFirst(args)),
    findUnique: async (args: Parameters<Table["findUnique"]>[0]) =>
      withAppointmentRelations(await appointment.findUnique(args)),
    updateMany: (args: Parameters<Table["updateMany"]>[0]) =>
      appointment.updateMany(args),
    // Escrita aninhada do Prisma: `customer: { connect }` preenche as colunas
    // escalares da relação, e `items: { create }` grava os itens do acordo.
    create: async (args: { data: Record<string, unknown> }) => {
      const { customer: link, items, ...rest } = args.data;
      const connect = (link as Connect | undefined)?.connect?.tenantId_id;
      const row = await appointment.create({
        data: {
          ...rest,
          tenantId: connect?.tenantId ?? rest.tenantId,
          customerId: connect?.id ?? rest.customerId,
        },
      });
      const nested =
        (items as { create?: Array<Record<string, unknown>> } | undefined)
          ?.create ?? [];
      for (const item of nested) {
        const { service: serviceLink, ...itemRest } = item;
        await appointmentItem.create({
          data: {
            ...itemRest,
            tenantId: row.tenantId,
            appointmentId: row.id,
            serviceId: (serviceLink as Connect | undefined)?.connect
              ?.tenantId_id?.id,
          },
        });
      }
      return withAppointmentRelations(row);
    },
    update: async (args: Parameters<Table["update"]>[0]) =>
      withAppointmentRelations(await appointment.update(args)),
  };

  const pendingFailures: unknown[] = [];
  let databaseClockOffsetMs = 0;
  let advisoryLockAvailable = true;

  const client = {
    customer,
    customerNote,
    customerTag,
    service,
    calendarSettings,
    availabilityRule,
    availabilityException,
    timeBlock,
    appointmentHold,
    appointmentEvent,
    appointmentItem,
    calendarMutationIdempotency,
    appointment: appointmentClient,
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
    /**
     * O lock de dia é `pg_advisory_xact_lock(hashtext(tenant:date))`: aqui só
     * o argumento é guardado, o suficiente para provar quais dias foram
     * travados e em que ordem.
     */
    $executeRaw: async (query: { values?: unknown[] }) => {
      const key = query.values?.[0];
      if (typeof key === "string") journal.locks.push(key);
      return 1;
    },
    /**
     * Dois `$queryRaw` no recorte: `SELECT now()`, com que a agenda decide
     * vigência de hold — o dublê mantém um relógio **próprio**, movível por
     * `advanceDatabaseClock`, para provar que o código pergunta a hora ao
     * banco em vez de ler a do processo, sem `sleep` — e o
     * `pg_try_advisory_xact_lock` do lease da conclusão automática, cuja
     * disponibilidade um teste controla com `setAdvisoryLockAvailable`. Duas
     * instâncias reais disputando o mesmo lock são prova de integração; aqui
     * só se prova que o código respeita o resultado do lock.
     */
    $queryRaw: async (query: { strings?: string[] }) => {
      const text = query.strings?.join("?") ?? "";
      if (text.includes("pg_try_advisory_xact_lock")) {
        return [{ locked: advisoryLockAvailable }];
      }
      journal.databaseNowReads += 1;
      return [{ now: new Date(Date.now() + databaseClockOffsetMs) }];
    },
    $transaction: async <T>(
      run: (transaction: unknown) => Promise<T>,
      _options?: unknown,
    ): Promise<T> => {
      journal.transactions += 1;
      if (pendingFailures.length > 0) {
        // Aborto injetado antes do corpo: o dublê não desfaz escrita, e um
        // aborto serializável real não deixa nada gravado.
        throw pendingFailures.shift();
      }
      const previous = journal.transaction;
      journal.transaction = journal.transactions;
      try {
        return await run(client);
      } finally {
        journal.transaction = previous;
      }
    },
  };

  return {
    client,
    journal,
    /** Adianta o relógio **do banco**, sem mexer no relógio do processo. */
    advanceDatabaseClock(milliseconds: number) {
      databaseClockOffsetMs += milliseconds;
    },
    /** Simula outra instância já segurando o lease da conclusão automática. */
    setAdvisoryLockAvailable(available: boolean) {
      advisoryLockAvailable = available;
    },
    /** Faz as próximas `count` transações abortarem com o erro informado. */
    failNextTransactions(count: number, error: unknown) {
      for (let index = 0; index < count; index += 1) {
        pendingFailures.push(error);
      }
    },
    tables: {
      customer,
      customerRelation,
      customerNote,
      customerTag,
      service,
      calendarSettings,
      availabilityRule,
      availabilityException,
      appointment,
      appointmentItem,
      appointmentHold,
      appointmentEvent,
      timeBlock,
      calendarMutationIdempotency,
    },
  };
}

interface Connect {
  connect?: { tenantId_id?: { tenantId: string; id: string } };
}
