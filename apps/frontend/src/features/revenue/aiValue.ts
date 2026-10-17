import type { RevenueReport } from "@/data";

import {
  countLabel,
  formatMoney,
  isCurrentPeriod,
  monthName,
  rangeLabel,
} from "./revenueFormat";

/**
 * O que a IA fez por você (D-178): frases do bloco no topo do Faturamento e
 * do cartão do Início. Só o que a agenda prova — atendimentos que a IA marcou,
 * clientes cujo primeiro agendamento foi dela, o que ela marcou fora do
 * horário e o que ela remarcou. Nada estimado.
 */

export interface AiHighlight {
  key: "new-customers" | "after-hours" | "rescheduled";
  value: string;
  label: string;
  detail: string | null;
}

export type AiValueView =
  | { kind: "none" }
  | {
      kind: "value";
      headline: string;
      /** Parte do faturado que veio da IA, de 0 a 1; nula sem faturado. */
      share: number | null;
      expected: string | null;
      highlights: AiHighlight[];
      since: string | null;
    }
  | { kind: "invite"; headline: string; detail: string };

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function year(date: string): string {
  return date.slice(0, 4);
}

/** "neste mês", "hoje", "em setembro", "na semana de 5 a 11 de outubro". */
export function periodPhrase(
  report: Pick<RevenueReport, "period" | "start" | "end" | "today">,
): string {
  const current = isCurrentPeriod(report);
  const otherYear = year(report.start) !== year(report.today);
  switch (report.period) {
    case "day":
      return current ? "hoje" : `em ${rangeLabel(report.start, report.start)}`;
    case "week":
      return current
        ? "nesta semana"
        : `na semana de ${rangeLabel(report.start, report.end)}`;
    case "month":
      return current
        ? "neste mês"
        : `em ${monthName(report.start)}${otherYear ? ` de ${year(report.start)}` : ""}`;
    default:
      return current ? "neste ano" : `em ${year(report.start)}`;
  }
}

/** "Bia", "Bia e Carla", "Bia, Carla e mais 3". */
function namesLabel(names: readonly string[], total: number): string | null {
  if (names.length === 0) return null;
  const rest = total - names.length;
  if (rest > 0) return `${names.join(", ")} e mais ${rest}`;
  if (names.length === 1) return names[0] ?? null;
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

/**
 * `aiOff`: a IA está desligada, confirmado pelo status. Só então o lugar vira
 * convite; com o status ainda carregando ou incerto, não diz nada.
 */
export function aiValueView(
  report: RevenueReport,
  aiOff: boolean,
): AiValueView {
  const { ai } = report;
  const phrase = periodPhrase(report);
  const hasValue =
    ai.billed.count > 0 ||
    ai.expected.count > 0 ||
    ai.newCustomers.count > 0 ||
    ai.acquired.customers > 0;

  if (!hasValue) {
    const outside = report.messages?.outsideHours ?? 0;
    if (aiOff && outside > 0) {
      return {
        kind: "invite",
        headline: `${capitalize(phrase)}, ${countLabel(
          outside,
          "mensagem de cliente chegou",
          "mensagens de clientes chegaram",
        )} fora do seu horário de atendimento.`,
        detail:
          "Com a IA ligada, elas são respondidas na hora e viram agendamento, mesmo à noite e no fim de semana.",
      };
    }
    return { kind: "none" };
  }

  let headline: string;
  if (ai.billed.amount > 0) {
    headline = `A IA marcou ${formatMoney(ai.billed.amount)} dos seus ${formatMoney(report.billed.amount)} ${phrase}`;
  } else if (ai.billed.count > 0) {
    headline = `A IA marcou ${countLabel(ai.billed.count, "atendimento concluído", "atendimentos concluídos")} ${phrase}`;
  } else if (ai.expected.count > 0) {
    headline = `A IA já deixou ${countLabel(ai.expected.count, "atendimento marcado", "atendimentos marcados")} pela frente`;
  } else {
    headline = `A IA ainda não marcou atendimentos concluídos ${phrase}`;
  }

  const expected =
    ai.expected.count > 0 && ai.billed.count > 0
      ? `+ ${ai.expected.amount > 0 ? `${formatMoney(ai.expected.amount)} em ` : ""}${countLabel(
          ai.expected.count,
          "atendimento que ela já marcou",
          "atendimentos que ela já marcou",
        )} pela frente`
      : ai.expected.count > 0 && ai.expected.amount > 0
        ? `${formatMoney(ai.expected.amount)} previstos`
        : null;

  const highlights: AiHighlight[] = [];
  if (ai.newCustomers.count > 0) {
    const names = namesLabel(ai.newCustomers.names, ai.newCustomers.count);
    const spent =
      ai.newCustomers.amount > 0
        ? `Já gastaram ${formatMoney(ai.newCustomers.amount)}`
        : null;
    highlights.push({
      key: "new-customers",
      value: String(ai.newCustomers.count),
      label:
        ai.newCustomers.count === 1
          ? "cliente novo chegou pela IA"
          : "clientes novos chegaram pela IA",
      detail: [spent, names].filter(Boolean).join(" · ") || null,
    });
  }
  if (ai.afterHours.count > 0) {
    highlights.push({
      key: "after-hours",
      value: String(ai.afterHours.count),
      label:
        ai.afterHours.count === 1
          ? "atendimento marcado fora do seu horário"
          : "atendimentos marcados fora do seu horário",
      detail:
        ai.afterHours.amount > 0
          ? `${formatMoney(ai.afterHours.amount)} marcados à noite, no fim de semana ou em dia fechado`
          : "À noite, no fim de semana ou em dia fechado",
    });
  }
  if (ai.rescheduled.count > 0) {
    highlights.push({
      key: "rescheduled",
      value: String(ai.rescheduled.count),
      label:
        ai.rescheduled.count === 1
          ? "atendimento remarcado pela IA"
          : "atendimentos remarcados pela IA",
      detail:
        ai.rescheduled.amount > 0
          ? `${formatMoney(ai.rescheduled.amount)} que continuaram na sua agenda`
          : "Continuaram na sua agenda",
    });
  }

  const since =
    ai.acquired.customers > 0
      ? `Desde que você começou, a IA trouxe ${countLabel(
          ai.acquired.customers,
          "cliente novo",
          "clientes novos",
        )}${ai.acquired.amount > 0 ? `, que já faturaram ${formatMoney(ai.acquired.amount)}` : ""}.`
      : null;

  return {
    kind: "value",
    headline,
    share: ai.billed.amount > 0 ? ai.share : null,
    expected,
    highlights,
    since,
  };
}

/** Linha do Início: "Neste mês a IA trouxe R$ 400 · 5 clientes novos". */
export function homeAiLine(report: RevenueReport): string | null {
  const { ai } = report;
  const newcomers =
    ai.newCustomers.count > 0
      ? countLabel(ai.newCustomers.count, "cliente novo", "clientes novos")
      : null;
  const phrase = capitalize(periodPhrase(report));
  if (ai.billed.amount > 0) {
    const line = `${phrase} a IA trouxe ${formatMoney(ai.billed.amount)}`;
    return newcomers ? `${line} · ${newcomers}` : line;
  }
  if (newcomers) {
    return `${phrase}, ${newcomers} ${ai.newCustomers.count === 1 ? "chegou" : "chegaram"} pela IA`;
  }
  return null;
}
