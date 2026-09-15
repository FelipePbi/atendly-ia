import type {
  AppointmentEventSource,
  AppointmentEventType,
  Prisma,
  PrismaClient,
} from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Histórico operacional do atendimento (Goal008): um evento por mutação,
 * gravado na **mesma transação** do efeito que ele descreve — nunca depois.
 * Nunca apagado nem reescrito; `updatedAt` do atendimento não substitui este
 * histórico.
 */
export interface AppointmentEventInput {
  type: AppointmentEventType;
  source: AppointmentEventSource;
  /** Ausente apenas para a conclusão automática, disparada pelo próprio sistema. */
  actor: string | null;
  reason?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

export async function recordAppointmentEvent(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
  event: AppointmentEventInput,
): Promise<void> {
  await transaction.appointmentEvent.create({
    data: {
      tenantId,
      appointmentId,
      type: event.type,
      source: event.source,
      actor: event.actor,
      reason: event.reason ?? null,
      before: event.before,
      after: event.after,
    },
  });
}

export interface AppointmentEventRecord {
  id: string;
  type: AppointmentEventType;
  source: AppointmentEventSource;
  actor: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  occurredAt: string;
  /** Desempate determinístico dentro do mesmo `occurredAt`. */
  sequence: string;
}

/**
 * Leitura cronológica do histórico de um atendimento.
 *
 * A ordenação é `occurredAt` **e depois** `sequence`, nunca só a primeira:
 * `occurredAt` tem `DEFAULT CURRENT_TIMESTAMP`, que em PostgreSQL é o
 * instante de início da transação, então os eventos que uma mesma mutação
 * grava juntos (`CREATED` + `OVERLAP_OVERRIDE` + `HOLD_CONSUMED`) carregam
 * exatamente o mesmo instante. Sem o desempate, "o que aconteceu antes"
 * dependeria da ordem física das linhas — que o PostgreSQL não promete.
 *
 * Eventos de criação para atendimentos existentes antes deste Goal não são
 * fabricados retroativamente: a ausência de `CREATED` no início da lista é
 * esperada para essas linhas.
 */
export async function listAppointmentEvents(
  prisma: Pick<PrismaClient, "appointmentEvent">,
  tenantId: string,
  appointmentId: string,
): Promise<AppointmentEventRecord[]> {
  const rows = await prisma.appointmentEvent.findMany({
    where: { tenantId, appointmentId },
    orderBy: [{ occurredAt: "asc" }, { sequence: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    source: row.source,
    actor: row.actor,
    reason: row.reason,
    before: row.before,
    after: row.after,
    occurredAt: row.occurredAt.toISOString(),
    // `BigInt` não é serializável em JSON; o histórico é lido como texto,
    // e a ordem já veio decidida pelo banco.
    sequence: row.sequence.toString(),
  }));
}

/** Teto padrão e máximo do feed da central de notificações (Goal022, WU-01). */
export const AI_CREATED_APPOINTMENT_EVENTS_DEFAULT_LIMIT = 50;
export const AI_CREATED_APPOINTMENT_EVENTS_MAX_LIMIT = 200;

export interface AiCreatedAppointmentEventRecord {
  id: string;
  appointmentId: string;
  after: unknown;
  occurredAt: string;
  sequence: string;
}

export interface ListAiCreatedAppointmentEventsInput {
  /** `sequence` do último evento já visto; ausente lê do início do feed. */
  afterSequence?: string | null;
  limit?: number;
}

export interface ListAiCreatedAppointmentEventsResult {
  items: AiCreatedAppointmentEventRecord[];
  /** Presente somente quando a página veio cheia — pode haver mais. */
  nextCursor: string | null;
}

/**
 * Feed de compromissos criados pela IA, para a central de notificações
 * (Goal022, WU-01): `type = CREATED` e `source = AI`, atravessando todos os
 * atendimentos do negócio.
 *
 * Avança por `sequence`, nunca por `occurredAt`: eventos gravados na mesma
 * transação compartilham `occurredAt` (ver o cabeçalho deste arquivo), e só
 * `sequence` é `@unique` e estritamente crescente. `sequence` já é o cursor —
 * não precisa de par de desempate como a leitura de falhas de entrega, que
 * ordena por um campo não único.
 */
export async function listAiCreatedAppointmentEvents(
  prisma: Pick<PrismaClient, "appointmentEvent">,
  tenantId: string,
  input: ListAiCreatedAppointmentEventsInput = {},
): Promise<ListAiCreatedAppointmentEventsResult> {
  const limit = Math.min(
    Math.max(1, input.limit ?? AI_CREATED_APPOINTMENT_EVENTS_DEFAULT_LIMIT),
    AI_CREATED_APPOINTMENT_EVENTS_MAX_LIMIT,
  );
  const afterSequence = parseSequenceCursor(input.afterSequence);

  const rows = await prisma.appointmentEvent.findMany({
    where: {
      tenantId,
      type: "CREATED",
      source: "AI",
      ...(afterSequence !== null
        ? { sequence: { gt: afterSequence } }
        : {}),
    },
    orderBy: [{ sequence: "asc" }],
    take: limit,
  });

  const items = rows.map((row) => ({
    id: row.id,
    appointmentId: row.appointmentId,
    after: row.after,
    occurredAt: row.occurredAt.toISOString(),
    sequence: row.sequence.toString(),
  }));

  const last = rows.at(-1);
  const nextCursor =
    rows.length === limit && last ? last.sequence.toString() : null;

  return { items, nextCursor };
}

function parseSequenceCursor(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  try {
    const sequence = BigInt(value);
    if (sequence < 0n) throw new Error("negative sequence");
    return sequence;
  } catch {
    throw new AppError(
      "INVALID_CURSOR",
      "The cursor is not a valid page token for this listing.",
      400,
    );
  }
}
