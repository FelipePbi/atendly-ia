import type {
  AppointmentEventSource,
  AppointmentEventType,
  Prisma,
  PrismaClient,
} from "../../generated/prisma/client.js";

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
