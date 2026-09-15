import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  AppointmentNotificationKind,
  AppointmentNotificationReason,
  AppointmentNotificationSlot,
  AppointmentNotificationState,
} from "../../generated/prisma/enums.js";

/**
 * Leitura das intencoes de envio **de um compromisso** (Goal021, item 8).
 *
 * A configuracao do negocio (`ReminderSettings`) diz com quanta antecedencia
 * o lembrete sairia; ela nao diz nada sobre esta ocorrencia. O que o detalhe
 * do agendamento precisa mostrar — enviado, nao enviado com motivo, ainda
 * agendado — so existe aqui, na linha que a propria mutacao criou.
 *
 * Esta leitura nunca devolve `facts` nem `leaseToken`: o primeiro carrega o
 * telefone do cliente e os fatos ja formatados para a composicao da IA, o
 * segundo e credencial de reivindicacao. A tela nao precisa de nenhum dos
 * dois, e o que nao sai daqui nao vaza pelo BFF.
 */
export interface AppointmentNotificationRecord {
  id: string;
  kind: AppointmentNotificationKind;
  slot: AppointmentNotificationSlot;
  /** Versao do compromisso para a qual a intencao nasceu. */
  appointmentVersion: number;
  state: AppointmentNotificationState;
  /** Vocabulario fechado; presente exatamente nos estados terminais que o exigem. */
  reason: AppointmentNotificationReason | null;
  dueAt: string;
  sentAt: string | null;
  settledAt: string | null;
}

/**
 * Ordem de leitura: `dueAt` e depois `id`. O desempate existe porque duas
 * intencoes podem vencer no mesmo instante — o aviso de alteracao vence na
 * hora da mutacao, e uma antecedencia ja vencida nasce com o mesmo `dueAt`
 * calculado — e "qual veio antes" nao pode depender da ordem fisica das
 * linhas, que o PostgreSQL nao promete.
 */
export async function listAppointmentNotifications(
  prisma: Pick<PrismaClient, "appointmentNotificationIntent">,
  tenantId: string,
  appointmentId: string,
): Promise<AppointmentNotificationRecord[]> {
  const rows = await prisma.appointmentNotificationIntent.findMany({
    where: { tenantId, appointmentId },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    slot: row.slot,
    appointmentVersion: row.appointmentVersion,
    state: row.state,
    reason: row.reason,
    dueAt: row.dueAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
  }));
}
