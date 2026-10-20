import { FOLLOW_UP_AFTER_DAYS } from "./return-rules.js";

/**
 * Situação de cada cliente na aprovação, do jeito que a profissional pensa
 * nela (D-210): na fila, aguardando resposta, respondeu, agendou, sem
 * resposta, recusou, pediu para parar, não enviada ou falhou. É a única
 * regra da tela: a lista, os números e os gráficos leem daqui.
 */
export const RETURN_OUTCOMES = [
  "QUEUED",
  "SENDING",
  "AWAITING",
  "REPLIED",
  "BOOKED",
  "NO_REPLY",
  "DECLINED",
  "STOPPED",
  "NOT_SENT",
  "FAILED",
] as const;
export type ReturnOutcome = (typeof RETURN_OUTCOMES)[number];

/**
 * Sem lembrete possível (aprovação pausada, cancelada ou encerrada há mais
 * de 14 dias), a mensagem fica sem resposta depois do mesmo prazo do
 * lembrete. Com lembrete pendente, a folga cobre um dia de fila cheia.
 */
const NO_REPLY_WITHOUT_FOLLOW_UP_DAYS = FOLLOW_UP_AFTER_DAYS * 2 + 1;
/** Rodada `DONE` ainda manda lembrete por 14 dias (`claimDueReturnTargets`). */
const FOLLOW_UP_AFTER_DONE_DAYS = 14;

export interface OutcomeTarget {
  state: string;
  reason: string | null;
  sentAt: Date | null;
  followUpState: string | null;
  followUpSentAt: Date | null;
}

export interface OutcomeCampaign {
  state: string;
  completedAt: Date | null;
}

function daysAgo(now: Date, days: number): number {
  return now.getTime() - days * 86_400_000;
}

/** O lembrete único ainda pode sair por esta aprovação? */
function followUpPossible(campaign: OutcomeCampaign, now: Date): boolean {
  if (campaign.state === "ACTIVE") return true;
  return (
    campaign.state === "DONE" &&
    campaign.completedAt !== null &&
    campaign.completedAt.getTime() >= daysAgo(now, FOLLOW_UP_AFTER_DONE_DAYS)
  );
}

/** Enviada e ainda sem resposta: esperando ou já sem resposta? */
function sentOutcome(
  target: OutcomeTarget,
  campaign: OutcomeCampaign,
  now: Date,
): "AWAITING" | "NO_REPLY" {
  const sentAt = target.sentAt?.getTime() ?? now.getTime();
  if (target.followUpState === "SENT") {
    const followUpAt = target.followUpSentAt?.getTime() ?? sentAt;
    return followUpAt <= daysAgo(now, FOLLOW_UP_AFTER_DAYS)
      ? "NO_REPLY"
      : "AWAITING";
  }
  if (target.followUpState !== null) {
    // Lembrete descartado ou que não saiu: não há mais contato.
    return "NO_REPLY";
  }
  const waitDays = followUpPossible(campaign, now)
    ? NO_REPLY_WITHOUT_FOLLOW_UP_DAYS
    : FOLLOW_UP_AFTER_DAYS;
  return sentAt <= daysAgo(now, waitDays) ? "NO_REPLY" : "AWAITING";
}

export function returnOutcome(
  target: OutcomeTarget,
  campaign: OutcomeCampaign,
  now: Date,
): ReturnOutcome {
  switch (target.state) {
    case "QUEUED":
      return "QUEUED";
    case "CLAIMED":
      return "SENDING";
    case "SENT":
      return sentOutcome(target, campaign, now);
    case "REPLIED":
      return "REPLIED";
    case "BOOKED":
      return "BOOKED";
    case "DECLINED":
      return target.reason === "STOPPED" ? "STOPPED" : "DECLINED";
    case "SKIPPED":
      return "NOT_SENT";
    default:
      return "FAILED";
  }
}
