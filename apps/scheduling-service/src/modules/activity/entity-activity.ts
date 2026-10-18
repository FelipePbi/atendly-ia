import type { Prisma } from "../../generated/prisma/client.js";
import {
  type ActivityActor,
  type ActivityArea,
  type ActivityChange,
  diffFields,
  recordActivity,
} from "./activity-log.js";

type Transaction = Prisma.TransactionClient;
type Row = Record<string, unknown>;

/**
 * Campos de cada entidade que entram no antes/depois (D-176). Lista
 * permitida, nunca o objeto inteiro: o que não está aqui não é registrado.
 */
export const CUSTOMER_ACTIVITY_FIELDS = ["name", "phone"] as const;

export const SERVICE_ACTIVITY_FIELDS = [
  "name",
  "durationMinutes",
  "priceType",
  "price",
  "description",
  "color",
  "bufferBeforeMinutes",
  "bufferAfterMinutes",
  "recurrenceIntervalDays",
  "active",
] as const;

interface EntitySpec {
  area: ActivityArea;
  entityType: string;
  fields: readonly string[];
  label: (row: Row) => string | null;
}

const CUSTOMER: EntitySpec = {
  area: "CUSTOMERS",
  entityType: "customer",
  fields: CUSTOMER_ACTIVITY_FIELDS,
  label: (row) =>
    (typeof row.name === "string" && row.name) ||
    (typeof row.phone === "string" && row.phone) ||
    null,
};

const SERVICE: EntitySpec = {
  area: "SERVICES",
  entityType: "service",
  fields: SERVICE_ACTIVITY_FIELDS,
  label: (row) => (typeof row.name === "string" ? row.name : null),
};

async function created(
  spec: EntitySpec,
  transaction: Transaction,
  tenantId: string,
  actor: ActivityActor,
  row: Row & { id: string },
) {
  await recordActivity(transaction, tenantId, {
    actor,
    area: spec.area,
    action: `${spec.entityType}.created`,
    entityType: spec.entityType,
    entityId: row.id,
    entityLabel: spec.label(row),
    changes: diffFields(null, row, spec.fields),
  });
}

/** Nada mudou de fato: nada é registrado. */
async function updated(
  spec: EntitySpec,
  transaction: Transaction,
  tenantId: string,
  actor: ActivityActor,
  before: Row & { id: string },
  after: Row,
  action = `${spec.entityType}.updated`,
) {
  const changes = diffFields(before, after, spec.fields);
  if (changes.length === 0) return;
  await recordActivity(transaction, tenantId, {
    actor,
    area: spec.area,
    action,
    entityType: spec.entityType,
    entityId: before.id,
    entityLabel: spec.label(after) ?? spec.label(before),
    changes,
  });
}

async function deleted(
  spec: EntitySpec,
  transaction: Transaction,
  tenantId: string,
  actor: ActivityActor,
  row: Row & { id: string },
) {
  await recordActivity(transaction, tenantId, {
    actor,
    area: spec.area,
    action: `${spec.entityType}.deleted`,
    entityType: spec.entityType,
    entityId: row.id,
    entityLabel: spec.label(row),
  });
}

export const customerActivity = {
  created: created.bind(null, CUSTOMER),
  /** Desativar e reativar viram ação própria (2026-10-18); o resto é edição. */
  updated: (
    transaction: Transaction,
    tenantId: string,
    actor: ActivityActor,
    before: Row & { id: string },
    after: Row,
  ) => {
    const wasActive = !before.deactivatedAt;
    const isActive = !after.deactivatedAt;
    if (wasActive !== isActive) {
      // Registra mesmo sem nome ou telefone mudarem: a ação já é o fato.
      return recordActivity(transaction, tenantId, {
        actor,
        area: CUSTOMER.area,
        action: isActive ? "customer.reactivated" : "customer.deactivated",
        entityType: CUSTOMER.entityType,
        entityId: before.id,
        entityLabel: CUSTOMER.label(after) ?? CUSTOMER.label(before),
        changes: diffFields(before, after, CUSTOMER.fields),
      });
    }
    return updated(CUSTOMER, transaction, tenantId, actor, before, after);
  },
  deleted: deleted.bind(null, CUSTOMER),
};

/**
 * O serviço tem uma cor só (D-184): um token da paleta ou um `#rrggbb`. O
 * registro guarda as duas como um campo `color` (D-200), para o antes e o
 * depois falarem da mesma coisa. Antes eram dois campos, e `colorToken` ainda
 * caía no filtro de segredo (tem "token" no nome): trocar uma cor da paleta
 * por uma personalizada ficava "— → #d479ff".
 */
export function serviceActivityRow<T extends Row>(row: T): T & { color: string | null } {
  const hex =
    typeof row.colorHex === "string" && row.colorHex
      ? row.colorHex.toLowerCase()
      : null;
  const token =
    typeof row.colorToken === "string" && row.colorToken ? row.colorToken : null;
  return { ...row, color: hex ?? token };
}

export const serviceActivity = {
  created: (
    transaction: Transaction,
    tenantId: string,
    actor: ActivityActor,
    row: Row & { id: string },
  ) => created(SERVICE, transaction, tenantId, actor, serviceActivityRow(row)),
  /** Arquivar e reativar viram ação própria; o resto é edição. */
  updated: (
    transaction: Transaction,
    tenantId: string,
    actor: ActivityActor,
    beforeRow: Row & { id: string },
    afterRow: Row,
  ) => {
    const before = serviceActivityRow(beforeRow);
    const after = serviceActivityRow(afterRow);
    const onlyActive =
      before.active !== after.active &&
      diffFields(before, after, SERVICE.fields).length === 1;
    const action = onlyActive
      ? after.active
        ? "service.reactivated"
        : "service.archived"
      : "service.updated";
    return updated(SERVICE, transaction, tenantId, actor, before, after, action);
  },
};

/**
 * Fato sobre um cliente que não é edição de nome ou telefone: responsável,
 * observação, tag. O rótulo é o nome atual do cliente.
 */
export async function recordCustomerFact(
  transaction: Transaction,
  tenantId: string,
  actor: ActivityActor,
  customerId: string,
  action: string,
  changes: ActivityChange[] = [],
  details?: Record<string, unknown>,
): Promise<void> {
  const customer = await transaction.customer.findUnique({
    where: { tenantId_id: { tenantId, id: customerId } },
    select: { id: true, name: true, phone: true },
  });
  await recordActivity(transaction, tenantId, {
    actor,
    area: "CUSTOMERS",
    action,
    entityType: "customer",
    entityId: customerId,
    entityLabel: customer ? CUSTOMER.label(customer) : null,
    changes,
    details,
  });
}
