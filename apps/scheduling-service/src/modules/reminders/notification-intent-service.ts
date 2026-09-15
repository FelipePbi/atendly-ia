import type { Prisma } from "../../generated/prisma/client.js";
import type {
  AppointmentNotificationKind,
  AppointmentNotificationReason,
  AppointmentNotificationSlot,
  AppointmentNotificationState,
} from "../../generated/prisma/enums.js";
import { ReminderService } from "./reminder-service.js";

type TransactionClient = Prisma.TransactionClient;

/**
 * Recomputacao das intencoes de envio ao cliente (Goal021).
 *
 * Criar, remarcar e cancelar recomputam as intencoes **na mesma transacao da
 * mutacao**: as pendentes da versao antiga sao canceladas e as da versao nova
 * sao criadas. Nao ha worker que "descubra" depois que um lembrete deixou de
 * valer — remarcar nao pode deixar para tras o lembrete do horario velho, e
 * quem sabe que o horario mudou e a propria transacao que o mudou.
 *
 * O que decide e sempre o estado **ja gravado**: a linha relida (ou devolvida)
 * pela mutacao, com a versao que a politica unica de escrita acabou de
 * incrementar. Este modulo nunca escreve em `Appointment`.
 */

/**
 * O recorte do compromisso de que a recomputacao precisa: quando comeca, em
 * que estado esta e em que versao notificavel ficou **depois** da mutacao.
 */
export interface NotifiableAppointment {
  id: string;
  startAt: Date;
  status: string;
  notifiableVersion: number;
}

export interface RecomputeAppointmentIntentsInput {
  tenantId: string;
  /** O compromisso como ficou depois da mutacao, nunca como estava antes. */
  appointment: NotifiableAppointment;
  /** Instante do **banco** (`databaseNow`), nunca o relogio do processo. */
  now: Date;
  /**
   * Versao notificavel antes da mutacao, quando ha uma. Ausente em criacao.
   * Ela existe para uma unica decisao: remarcar para o horario em que o
   * atendimento ja estava nao mudou nada que o cliente precisasse saber, e
   * portanto nao avisa ninguem mesmo com a notificacao pedida.
   */
  previousVersion?: number;
  /**
   * `Notificar cliente` pedido explicitamente na alteracao manual (item 7 do
   * Goal021). Omitir e nao notificar: o default do contrato e silencio, e a
   * IA cancela e remarca a pedido do proprio cliente.
   */
  notifyCustomer?: boolean;
}

export interface AppointmentIntentPlan {
  kind: AppointmentNotificationKind;
  slot: AppointmentNotificationSlot;
  appointmentVersion: number;
  state: AppointmentNotificationState;
  reason: AppointmentNotificationReason | null;
  dueAt: Date;
}

export interface AppointmentIntentRecomputation {
  /** Versao para a qual as intencoes novas foram criadas. */
  version: number;
  /** Quantas pendentes de versao anterior foram canceladas. */
  cancelled: number;
  reminders: AppointmentIntentPlan[];
  changeNotice: AppointmentIntentPlan | null;
}

/** Um minuto em milissegundos, para a antecedencia configurada. */
const MINUTE_MS = 60_000;

export async function recomputeAppointmentIntentsWithin(
  transaction: TransactionClient,
  input: RecomputeAppointmentIntentsInput,
): Promise<AppointmentIntentRecomputation> {
  const version = input.appointment.notifiableVersion;
  const cancelled = await cancelSupersededIntents(transaction, input, version);
  const reminders = await scheduleReminders(transaction, input, version);
  const changeNotice = await scheduleChangeNotice(transaction, input, version);
  return { version, cancelled, reminders, changeNotice };
}

/**
 * Tudo o que estava agendado para uma versao que nao e mais a vigente deixou
 * de valer, lembrete ou aviso: o cliente nao pode receber "amanha as 9h"
 * depois de a remarcacao ter movido o atendimento.
 *
 * So `PENDING` e tocada. `CLAIMED` esta sob lease de quem ja a reivindicou, e
 * o invariante de banco amarra estado reivindicado a lease existente
 * (`AppointmentNotificationIntent_lifecycle_check`): cancela-la aqui gravaria
 * uma linha que o proprio banco recusa. A intencao reivindicada e resolvida na
 * revalidacao do momento do envio, que ja compara a versao.
 */
async function cancelSupersededIntents(
  transaction: TransactionClient,
  input: RecomputeAppointmentIntentsInput,
  version: number,
): Promise<number> {
  const { count } = await transaction.appointmentNotificationIntent.updateMany({
    where: {
      tenantId: input.tenantId,
      appointmentId: input.appointment.id,
      state: "PENDING",
      appointmentVersion: { not: version },
    },
    data: {
      state: "CANCELLED",
      reason: supersededReason(input.appointment.status),
      settledAt: input.now,
    },
  });
  return count;
}

/**
 * Motivo nomeado do cancelamento, no vocabulario fechado do banco: um registro
 * que a central de notificacoes do Goal022 precisa conseguir explicar sem
 * adivinhar. Cancelar o atendimento e diferente de remarca-lo, e concluir ou
 * marcar falta e diferente dos dois.
 */
function supersededReason(status: string): AppointmentNotificationReason {
  if (status === "CANCELLED") return "APPOINTMENT_CANCELLED";
  if (status !== "CONFIRMED") return "APPOINTMENT_NOT_CONFIRMED";
  return "APPOINTMENT_VERSION_SUPERSEDED";
}

/**
 * Lembretes da versao nova, um por posicao configurada.
 *
 * So compromisso **futuro e confirmado** gera lembrete: atendimento passado,
 * concluido, cancelado ou com falta sai daqui sem nenhuma intencao — e sem
 * nem consultar a configuracao do negocio, que e o que faz uma importacao de
 * milhares de atendimentos antigos nao virar milhares de leituras inuteis
 * nem um unico lembrete.
 */
async function scheduleReminders(
  transaction: TransactionClient,
  input: RecomputeAppointmentIntentsInput,
  version: number,
): Promise<AppointmentIntentPlan[]> {
  const { appointment, now } = input;
  if (appointment.status !== "CONFIRMED") return [];
  if (appointment.startAt.getTime() <= now.getTime()) return [];

  const config = await new ReminderService(transaction, input.tenantId).get();
  const plans: AppointmentIntentPlan[] = [];
  for (const rule of config.rules) {
    const dueAt = new Date(
      appointment.startAt.getTime() - rule.leadMinutes * MINUTE_MS,
    );
    // Antecedencia ja vencida no momento do agendamento: marcar as 22h para
    // amanha as 9h NAO dispara agora um lembrete de "24 horas antes". A
    // intencao nasce dispensada com motivo — o registro de que ela existiu e
    // por que nao saiu — em vez de virar um envio imediato.
    const overdue = dueAt.getTime() <= now.getTime();
    plans.push(
      await putIntent(transaction, input, {
        kind: "REMINDER",
        slot: rule.slot,
        appointmentVersion: version,
        state: overdue ? "DISMISSED" : "PENDING",
        reason: overdue ? "LEAD_ALREADY_PASSED" : null,
        dueAt,
      }),
    );
  }
  return plans;
}

/**
 * Aviso de alteracao: so quando a notificacao foi pedida **e** a mutacao
 * mudou o que o cliente precisaria saber. Cancelar sempre cancela as
 * pendentes; avisar e decisao separada de quem cancelou.
 */
async function scheduleChangeNotice(
  transaction: TransactionClient,
  input: RecomputeAppointmentIntentsInput,
  version: number,
): Promise<AppointmentIntentPlan | null> {
  if (input.notifyCustomer !== true) return null;
  if (
    input.previousVersion !== undefined &&
    input.previousVersion === version
  ) {
    return null;
  }
  return putIntent(transaction, input, {
    kind: "CHANGE_NOTICE",
    slot: "CHANGE_NOTICE",
    appointmentVersion: version,
    state: "PENDING",
    reason: null,
    // O aviso vence no instante da mutacao: ele fala de algo que acabou de
    // acontecer, e nao tem antecedencia para esperar.
    dueAt: input.now,
  });
}

/**
 * Grava a intencao pela identidade que o indice unico declara — compromisso,
 * especie, posicao e versao. `upsert` porque a recomputacao e **repetivel**:
 * duas mutacoes que nao mudaram a versao, ou uma transacao repetida pelo
 * retry serializavel da politica de escrita, produzem a mesma intencao, nunca
 * duas. E uma intencao ja liquidada (dispensada, enviada) nao volta: o
 * `update` vazio e deliberado.
 */
async function putIntent(
  transaction: TransactionClient,
  input: RecomputeAppointmentIntentsInput,
  plan: AppointmentIntentPlan,
): Promise<AppointmentIntentPlan> {
  const terminal = plan.state !== "PENDING";
  await transaction.appointmentNotificationIntent.upsert({
    where: {
      tenantId_appointmentId_kind_slot_appointmentVersion: {
        tenantId: input.tenantId,
        appointmentId: input.appointment.id,
        kind: plan.kind,
        slot: plan.slot,
        appointmentVersion: plan.appointmentVersion,
      },
    },
    create: {
      tenantId: input.tenantId,
      appointmentId: input.appointment.id,
      kind: plan.kind,
      slot: plan.slot,
      appointmentVersion: plan.appointmentVersion,
      state: plan.state,
      reason: plan.reason,
      dueAt: plan.dueAt,
      // Todo estado terminal tem instante de liquidacao
      // (`AppointmentNotificationIntent_lifecycle_check`).
      settledAt: terminal ? input.now : null,
    },
    update: {},
  });
  return plan;
}
