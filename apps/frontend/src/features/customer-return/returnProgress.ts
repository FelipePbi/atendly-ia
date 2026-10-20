import type {
  ReturnCampaignCounts,
  ReturnCampaignState,
  ReturnCampaignSummary,
  ReturnOutcome,
  ReturnTarget,
} from "@/data";

import { clockLabel, moneyLabel, shortDate } from "./returnCopy";

/**
 * Andamento do retorno (D-210): a situação de cada cliente agrupada do jeito
 * que a profissional lê — quem marcou, quem respondeu, quem ainda pode
 * responder, quem ignorou, quem recusou, quem está na fila e quem nem
 * recebeu. Os grupos não se sobrepõem: somados, dão o total da aprovação.
 */

export type ProgressGroup =
  | "booked"
  | "replied"
  | "awaiting"
  | "noReply"
  | "declined"
  | "queued"
  | "notSent";

export interface ProgressGroupInfo {
  key: ProgressGroup;
  label: string;
  /** Frase curta da linha da cliente ("Agendou", "Na fila"). */
  badge: string;
  outcomes: ReturnOutcome[];
}

/** Ordem de leitura: do melhor resultado ao que nem saiu. */
export const PROGRESS_GROUPS: ProgressGroupInfo[] = [
  { key: "booked", label: "Agendaram", badge: "Agendou", outcomes: ["BOOKED"] },
  {
    key: "replied",
    label: "Responderam",
    badge: "Respondeu",
    outcomes: ["REPLIED"],
  },
  {
    key: "awaiting",
    label: "Aguardando resposta",
    badge: "Aguardando",
    outcomes: ["AWAITING"],
  },
  {
    key: "noReply",
    label: "Sem resposta",
    badge: "Sem resposta",
    outcomes: ["NO_REPLY"],
  },
  {
    key: "declined",
    label: "Recusaram",
    badge: "Recusou",
    outcomes: ["DECLINED", "STOPPED"],
  },
  {
    key: "queued",
    label: "Na fila",
    badge: "Na fila",
    outcomes: ["QUEUED", "SENDING"],
  },
  {
    key: "notSent",
    label: "Não enviadas",
    badge: "Não enviada",
    outcomes: ["NOT_SENT", "FAILED"],
  },
];

/** Os grupos de quem já recebeu a mensagem. */
export const SENT_GROUPS: ProgressGroup[] = [
  "booked",
  "replied",
  "awaiting",
  "noReply",
  "declined",
];

export function groupOf(outcome: ReturnOutcome): ProgressGroup {
  return (
    PROGRESS_GROUPS.find((group) => group.outcomes.includes(outcome))?.key ??
    "notSent"
  );
}

export function groupInfo(key: ProgressGroup): ProgressGroupInfo {
  return PROGRESS_GROUPS.find(
    (group) => group.key === key,
  ) as ProgressGroupInfo;
}

/**
 * Quantas em cada grupo, a partir dos números da aprovação. "Responderam"
 * é quem respondeu e ainda não marcou nem recusou: o que sobra do total.
 */
export function groupCounts(
  counts: ReturnCampaignCounts,
): Record<ProgressGroup, number> {
  const notSent = counts.skipped + counts.failed;
  const replied = Math.max(
    0,
    counts.total -
      counts.queued -
      counts.awaiting -
      counts.booked -
      counts.noReply -
      counts.declined -
      notSent,
  );
  return {
    booked: counts.booked,
    replied,
    awaiting: counts.awaiting,
    noReply: counts.noReply,
    declined: counts.declined,
    queued: counts.queued,
    notSent,
  };
}

export interface ProgressSegment {
  key: ProgressGroup;
  label: string;
  count: number;
}

/** Fatias de `keys` com pelo menos uma cliente, na ordem de leitura. */
export function progressSegments(
  counts: ReturnCampaignCounts,
  keys: readonly ProgressGroup[] = PROGRESS_GROUPS.map((group) => group.key),
): ProgressSegment[] {
  const byGroup = groupCounts(counts);
  return PROGRESS_GROUPS.filter((group) => keys.includes(group.key)).map(
    (group) => ({
      key: group.key,
      label: group.label,
      count: byGroup[group.key],
    }),
  );
}

/** Parte que marcou horário, de 0 a 100, das que receberam. */
export function bookedRate(counts: ReturnCampaignCounts): number | null {
  if (counts.sent === 0) return null;
  return Math.round((counts.booked / counts.sent) * 100);
}

export const CAMPAIGN_STATE_LABELS: Record<ReturnCampaignState, string> = {
  ACTIVE: "Enviando aos poucos",
  PAUSED: "Pausada",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
};

export function isLive(state: ReturnCampaignState): boolean {
  return state === "ACTIVE" || state === "PAUSED";
}

/** "Semana de 20/10" (Renovação) ou "60 dias ou mais sem vir" (Resgate). */
export function approvalTitle(campaign: ReturnCampaignSummary): string {
  if (campaign.kind === "RENEWAL") {
    return campaign.weekStart
      ? `Semana de ${shortDate(campaign.weekStart)}`
      : "Quem está no prazo";
  }
  return campaign.winbackDays
    ? `${campaign.winbackDays} dias ou mais sem vir`
    : "Quem sumiu";
}

export function kindLabel(kind: ReturnCampaignSummary["kind"]): string {
  return kind === "RENEWAL" ? "Renovação" : "Resgate";
}

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function parseDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export function addDays(date: string, amount: number): string {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

/** Data local de hoje, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "hoje", "amanhã" ou "qua, 22/10". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "hoje";
  if (date === addDays(today, 1)) return "amanhã";
  return `${WEEKDAY[parseDate(date).getUTCDay()]}, ${shortDate(date)}`;
}

/** Rótulo curto do dia no gráfico: "hoje" ou "qua". */
export function weekdayShort(date: string, today: string): string {
  if (date === today) return "hoje";
  return WEEKDAY[parseDate(date).getUTCDay()] ?? "";
}

/** Data e hora locais de um instante: "20/10 às 14h32". */
export function momentLabel(iso: string): string {
  const value = new Date(iso);
  const date = localToday(value);
  const time = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  return `${shortDate(date)} às ${clockLabel(time)}`;
}

const SKIP_REASONS: Record<string, string> = {
  DEACTIVATED: "cliente desativada",
  NO_PHONE: "sem telefone",
  HAS_APPOINTMENT: "marcou antes da mensagem",
  OPTED_OUT: "pediu para não receber",
  RECENTLY_CONTACTED: "recebeu outro convite há pouco",
  DEADLINE_PASSED: "passou do prazo antes da data dela",
  OWNER_SKIPPED: "você tirou da fila",
  CAMPAIGN_CANCELLED: "envios cancelados",
  CONTACT_IGNORED: "contato ignorado",
  PERSONAL_CONTACT: "conversa pessoal",
  NOT_ALLOWED_LOCALLY: "número fora da lista de teste",
  INVALID_PHONE: "telefone inválido",
  REPLIED: "falou com você antes do envio",
};

const FOLLOW_UP_AFTER_DAYS = 3;

/**
 * A linha de andamento da cliente: quando sai, quando saiu, o lembrete, a
 * resposta e o horário que ela marcou — sempre com data, nunca o código.
 */
export function timelineLabel(
  target: ReturnTarget,
  campaignState: ReturnCampaignState,
  today: string,
): string {
  switch (target.outcome) {
    case "QUEUED": {
      const planned = target.plannedDate;
      if (campaignState === "PAUSED") {
        return planned && planned >= today
          ? `Pausada: sairia ${dayLabel(planned, today)}`
          : "Pausada: sai quando você retomar";
      }
      if (!planned || planned < today) return "Sai no próximo horário de envio";
      return `Sai ${dayLabel(planned, today)}`;
    }
    case "SENDING":
      return "Saindo agora";
    case "AWAITING": {
      const sent = target.sentAt
        ? `Enviada ${momentLabel(target.sentAt)}`
        : "Enviada";
      if (target.followUpState === "SENT" && target.followUpSentAt) {
        return `${sent} · lembrete ${momentLabel(target.followUpSentAt)}`;
      }
      if (
        target.followUpState === null &&
        target.sentAt &&
        isLive(campaignState)
      ) {
        const reminder = addDays(
          localToday(new Date(target.sentAt)),
          FOLLOW_UP_AFTER_DAYS,
        );
        return `${sent} · lembrete ${reminder <= today ? "em breve" : `em ${shortDate(reminder)}`} se não responder`;
      }
      return sent;
    }
    case "REPLIED":
      return target.repliedAt
        ? `Respondeu ${momentLabel(target.repliedAt)} · a IA está conversando com ela`
        : "Respondeu · a IA está conversando com ela";
    case "BOOKED":
      return bookedLabel(target);
    case "NO_REPLY": {
      const sent = target.sentAt
        ? `Enviada em ${shortDate(localToday(new Date(target.sentAt)))}`
        : "Enviada";
      return target.followUpState === "SENT"
        ? `${sent} · não respondeu, nem depois do lembrete`
        : `${sent} · não respondeu`;
    }
    case "DECLINED":
      return "Recusou: fica 90 dias sem convite";
    case "STOPPED":
      return "Pediu para não receber mais";
    case "NOT_SENT":
      return `Não enviada: ${SKIP_REASONS[target.reason ?? ""] ?? "fora das regras"}`;
    case "FAILED":
      return "A mensagem não saiu";
  }
}

function bookedLabel(target: ReturnTarget): string {
  const appointment = target.appointment;
  if (!appointment) return "Marcou um horário";
  const start = new Date(appointment.startAt);
  const date = localToday(start);
  const time = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  const parts = [
    `Marcou para ${WEEKDAY[parseDate(date).getUTCDay()]}, ${shortDate(date)} às ${clockLabel(time)}`,
  ];
  if (appointment.status === "COMPLETED") parts.push("atendida");
  if (appointment.status === "CANCELLED") parts.push("depois cancelou");
  if (appointment.status === "NO_SHOW") parts.push("faltou");
  if (appointment.value !== null && appointment.value > 0) {
    parts.push(moneyLabel(appointment.value));
  }
  return parts.join(" · ");
}

/** "R$ 640 faturados · R$ 320 em horários marcados", sem a parte vazia. */
export function valueDetail(counts: {
  revenue: number;
  expectedRevenue: number;
}): string | null {
  const parts: string[] = [];
  if (counts.revenue > 0)
    parts.push(`${moneyLabel(counts.revenue)} já faturados`);
  if (counts.expectedRevenue > 0) {
    parts.push(`${moneyLabel(counts.expectedRevenue)} em horários marcados`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
