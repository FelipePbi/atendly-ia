import type {
  ReturnCampaignState,
  ReturnCandidate,
  ReturnExclusionCounts,
  ReturnHabit,
  ReturnTarget,
} from "@/data";

/**
 * Frases da tela de Retorno de clientes (D-206): o que vence quando, há
 * quanto tempo ela não vem, os horários de costume e o andamento de cada
 * cliente na rodada — sempre em palavras, nunca o código do servidor.
 */

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function parse(date: string): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
}

/** Dias inteiros de `from` até `to`, datas locais. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

export function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** "17h" ou "17h30". */
export function clockLabel(time: string): string {
  const [hour, minute] = time.split(":");
  return minute === "00" ? `${Number(hour)}h` : `${Number(hour)}h${minute}`;
}

function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ou ${items.at(-1)}`;
}

/** "costuma vir sex ou sáb, das 16h às 19h". */
export function habitLabel(habit: ReturnHabit | null): string | null {
  if (!habit) return null;
  const band = `das ${clockLabel(habit.bandStart)} às ${clockLabel(habit.bandEnd)}`;
  if (habit.weekdays.length === 0) return `costuma vir ${band}`;
  const days = joinOr(habit.weekdays.map((day) => WEEKDAY_SHORT[day] ?? ""));
  return `costuma vir ${days}, ${band}`;
}

/** "vence em 5 dias", "vence amanhã", "venceu há 2 dias". */
export function dueLabel(expectedDate: string, today: string): string {
  const diff = daysBetween(today, expectedDate);
  if (diff === 0) return "vence hoje";
  if (diff === 1) return "vence amanhã";
  if (diff > 1) return `vence em ${diff} dias`;
  if (diff === -1) return "venceu ontem";
  return `venceu há ${-diff} dias`;
}

/** "há 45 dias", "há 3 meses", "há mais de um ano". */
export function absenceLabel(days: number): string {
  if (days < 60) return `há ${days} dias`;
  const months = Math.round(days / 30);
  return months >= 12 ? "há mais de um ano" : `há ${months} meses`;
}

/** Segunda linha da cliente na lista. */
export function candidateDetail(
  candidate: ReturnCandidate,
  today: string,
): string {
  const service = candidate.serviceName?.trim();
  if (candidate.expectedDate) {
    const due = dueLabel(candidate.expectedDate, today);
    return service ? `${service} ${due}` : `Retorno ${due}`;
  }
  const absence = `Última vez ${absenceLabel(candidate.daysSinceLastVisit)}`;
  return service ? `${absence} · mais feito: ${service}` : absence;
}

/** De onde veio o prazo de volta. */
export function intervalSourceLabel(candidate: ReturnCandidate): string | null {
  if (!candidate.intervalDays) return null;
  if (candidate.intervalSource === "SERVICE") {
    return `a cada ${candidate.intervalDays} dias, pelo serviço`;
  }
  if (candidate.intervalSource === "AVERAGE") {
    return `a cada ${candidate.intervalDays} dias, pela média dela`;
  }
  return null;
}

const EXCLUSION_LABELS: Array<[keyof ReturnExclusionCounts, string, string]> = [
  ["futureAppointment", "já tem horário marcado", "já têm horário marcado"],
  [
    "recentlyContacted",
    "recebeu convite há pouco",
    "receberam convite há pouco",
  ],
  ["queued", "já está numa rodada", "já estão numa rodada"],
  ["blocked", "pediu para não receber", "pediram para não receber"],
  ["ignored", "está nos contatos ignorados", "estão nos contatos ignorados"],
  ["personal", "é conversa pessoal", "são conversas pessoais"],
  ["noPhone", "não tem telefone", "não têm telefone"],
  ["deactivated", "está desativada", "estão desativadas"],
];

/** "Ficaram de fora: 2 já têm horário marcado, 1 pediu para não receber." */
export function exclusionSummary(
  excluded: ReturnExclusionCounts,
): string | null {
  const parts = EXCLUSION_LABELS.filter(([key]) => excluded[key] > 0).map(
    ([key, one, many]) =>
      `${excluded[key]} ${excluded[key] === 1 ? one : many}`,
  );
  if (parts.length === 0) return null;
  return `Ficaram de fora: ${parts.join(", ")}.`;
}

export const CAMPAIGN_STATE_LABELS: Record<ReturnCampaignState, string> = {
  ACTIVE: "Enviando aos poucos",
  PAUSED: "Pausada",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
};

const SKIP_REASONS: Record<string, string> = {
  DEACTIVATED: "cliente desativada",
  NO_PHONE: "sem telefone",
  HAS_APPOINTMENT: "marcou antes da mensagem",
  OPTED_OUT: "pediu para não receber",
  RECENTLY_CONTACTED: "recebeu outro convite há pouco",
  DEADLINE_PASSED: "passou do prazo antes da data dela",
  OWNER_SKIPPED: "você tirou da rodada",
  CAMPAIGN_CANCELLED: "rodada cancelada",
  CONTACT_IGNORED: "contato ignorado",
  PERSONAL_CONTACT: "conversa pessoal",
  NOT_ALLOWED_LOCALLY: "número fora da lista de teste",
  INVALID_PHONE: "telefone inválido",
};

/** Estado da cliente na rodada, em palavras. */
export function targetStateLabel(target: ReturnTarget): string {
  switch (target.state) {
    case "QUEUED":
      return target.plannedDate
        ? `Na fila, previsto para ${shortDate(target.plannedDate)}`
        : "Na fila";
    case "CLAIMED":
      return "Enviando";
    case "SENT":
      return target.followUpState === "SENT"
        ? "Enviada, com lembrete"
        : "Enviada";
    case "REPLIED":
      return "Respondeu";
    case "BOOKED":
      return "Agendou";
    case "DECLINED":
      return target.reason === "STOPPED" ? "Pediu para parar" : "Recusou";
    case "SKIPPED":
      return `Não enviada: ${SKIP_REASONS[target.reason ?? ""] ?? "fora das regras"}`;
    case "FAILED":
      return "A mensagem não saiu";
  }
}

export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function moneyLabel(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "seg a sáb, das 9h às 19h". */
export function windowLabel(
  days: number[],
  start: string,
  end: string,
): string {
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.every(
    (day, index) => index === 0 || day === sorted[index - 1] + 1,
  );
  const dayText =
    sorted.length === 7
      ? "todos os dias"
      : contiguous && sorted.length > 2
        ? `${WEEKDAY_SHORT[sorted[0]]} a ${WEEKDAY_SHORT[sorted.at(-1) ?? 0]}`
        : sorted.map((day) => WEEKDAY_SHORT[day]).join(", ");
  return `${dayText}, das ${clockLabel(start)} às ${clockLabel(end === "24:00" ? "23:59" : end)}`;
}

export { WEEKDAY_SHORT };
