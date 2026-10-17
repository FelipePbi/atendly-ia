import type { RevenuePeriod, RevenueReport } from "@/data";

/**
 * Textos e contas de exibição do Faturamento (D-177). Os totais já chegam
 * somados do servidor; aqui só se formata, nomeia o período e arredonda a
 * participação de cada serviço para fechar em 100%.
 */

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** `R$ 1.234,50`, com o espaço comum no lugar do não separável. */
export function formatMoney(amount: number): string {
  return currency.format(amount).replace(/ /g, " ");
}

export const PERIOD_OPTIONS: Array<{ value: RevenuePeriod; label: string }> = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
];

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const MONTHS_SHORT = MONTHS.map((month) => month.slice(0, 3));
const WEEKDAYS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function parts(date: string) {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return { year, month, day };
}

function utcDate(date: string): Date {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return utcDate(date).getUTCDay();
}

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? "";
}

export function monthName(date: string): string {
  return MONTHS[parts(date).month - 1] ?? "";
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

/** Um dia qualquer do período vizinho (`direction` = −1 ou +1). */
export function adjacentPeriodDate(
  period: RevenuePeriod,
  start: string,
  direction: -1 | 1,
): string {
  const value = utcDate(start);
  if (period === "day") value.setUTCDate(value.getUTCDate() + direction);
  else if (period === "week")
    value.setUTCDate(value.getUTCDate() + direction * 7);
  else if (period === "month")
    value.setUTCMonth(value.getUTCMonth() + direction, 1);
  else value.setUTCFullYear(value.getUTCFullYear() + direction, 0, 1);
  return format(value);
}

function dayMonth(date: string): string {
  const { day } = parts(date);
  return `${day} de ${monthName(date)}`;
}

/** "Sexta, 16 de outubro", "12 a 18 de outubro", "Outubro de 2026", "2026". */
export function periodTitle(
  report: Pick<RevenueReport, "period" | "start" | "end" | "today">,
): string {
  const { period, start, end, today } = report;
  const sameYear = parts(start).year === parts(today).year;
  const year = sameYear ? "" : ` de ${parts(start).year}`;
  if (period === "day") {
    return capitalize(`${weekdayName(weekdayOf(start))}, ${dayMonth(start)}${year}`);
  }
  if (period === "week") {
    const endYear = parts(end).year === parts(today).year ? "" : ` de ${parts(end).year}`;
    if (parts(start).month === parts(end).month) {
      return `${parts(start).day} a ${dayMonth(end)}${endYear}`;
    }
    return `${dayMonth(start)} a ${dayMonth(end)}${endYear}`;
  }
  if (period === "month") return capitalize(`${monthName(start)} de ${parts(start).year}`);
  return String(parts(start).year);
}

/** O período pedido contém hoje. */
export function isCurrentPeriod(
  report: Pick<RevenueReport, "start" | "end" | "today">,
): boolean {
  return report.today >= report.start && report.today <= report.end;
}

/** Nome do período anterior, para "+12% que setembro". */
export function previousName(
  report: Pick<RevenueReport, "period" | "previous" | "today">,
): string {
  const { period, previous, today } = report;
  if (period === "day") {
    const yesterday = adjacentPeriodDate("day", today, -1);
    return previous.start === yesterday ? "ontem" : "o dia anterior";
  }
  if (period === "week") return "a semana anterior";
  if (period === "month") return monthName(previous.start);
  return String(parts(previous.start).year);
}

/** Período como intervalo legível: "1 a 16 de setembro". */
export function rangeLabel(start: string, end: string): string {
  if (start === end) return dayMonth(start);
  if (parts(start).month === parts(end).month && parts(start).year === parts(end).year) {
    return `${parts(start).day} a ${dayMonth(end)}`;
  }
  return `${dayMonth(start)} a ${dayMonth(end)}`;
}

export type Comparison =
  | { kind: "none" }
  | { kind: "new"; text: string }
  | { kind: "change"; direction: "up" | "down" | "same"; text: string };

/** "+12% que setembro", "−8% que ontem", "Igual a 2025". */
export function comparison(report: RevenueReport): Comparison {
  const current = report.billed.amount;
  const before = report.previous.amount;
  const name = previousName(report);
  if (before <= 0) {
    if (current <= 0) return { kind: "none" };
    return { kind: "new", text: `${capitalize(name)} não teve faturamento para comparar` };
  }
  const change = Math.round(((current - before) / before) * 100);
  if (change === 0) return { kind: "change", direction: "same", text: `Igual a ${name}` };
  const sign = change > 0 ? "+" : "−";
  return {
    kind: "change",
    direction: change > 0 ? "up" : "down",
    text: `${sign}${Math.abs(change)}% que ${name}`,
  };
}

/**
 * Participações em porcentagem inteira que fecham em 100 (maior resto).
 * Fatia maior que zero que arredondaria para 0 aparece como "<1%".
 */
export function shareLabels(shares: readonly number[]): string[] {
  const total = shares.reduce((sum, share) => sum + share, 0);
  if (total <= 0) return shares.map(() => "0%");
  const raw = shares.map((share) => (share / total) * 100);
  const floors = raw.map(Math.floor);
  let missing = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (missing <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    missing -= 1;
  }
  return floors.map((value, index) =>
    value === 0 && (shares[index] ?? 0) > 0 ? "<1%" : `${value}%`,
  );
}

export function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export interface ChartBar {
  key: string;
  /** Rótulo curto sob a barra ("mar", "16", "sex"). */
  short: string;
  /** Nome completo para leitor de tela e destaque ("março", "sexta, 16 de outubro"). */
  long: string;
  amount: number;
  expectedAmount: number;
  count: number;
  /** Período que a barra abre ao ser tocada. */
  drill: { period: RevenuePeriod; date: string };
}

export function chartBars(report: RevenueReport): ChartBar[] {
  return report.series.map((bucket) => {
    if (report.period === "year") {
      return {
        key: bucket.start,
        short: MONTHS_SHORT[parts(bucket.start).month - 1] ?? "",
        long: monthName(bucket.start),
        amount: bucket.amount,
        expectedAmount: bucket.expectedAmount,
        count: bucket.count,
        drill: { period: "month", date: bucket.start },
      };
    }
    const weekday = weekdayOf(bucket.start);
    return {
      key: bucket.start,
      short:
        report.period === "week"
          ? (WEEKDAYS_SHORT[weekday] ?? "")
          : String(parts(bucket.start).day),
      long: `${weekdayName(weekday)}, ${dayMonth(bucket.start)}`,
      amount: bucket.amount,
      expectedAmount: bucket.expectedAmount,
      count: bucket.count,
      drill: { period: "day", date: bucket.start },
    };
  });
}

/** A barra de maior faturado; nenhuma quando nada foi faturado. */
export function bestBar(bars: readonly ChartBar[]): ChartBar | null {
  let best: ChartBar | null = null;
  for (const bar of bars) {
    if (bar.amount > 0 && (!best || bar.amount > best.amount)) best = bar;
  }
  return best;
}

/** O dia da semana de maior faturado; nenhum sem faturamento. */
export function strongestWeekday(
  weekdays: RevenueReport["weekdays"],
): { weekday: number; amount: number; share: number } | null {
  const total = weekdays.reduce((sum, day) => sum + day.amount, 0);
  if (total <= 0) return null;
  const best = weekdays.reduce((top, day) => (day.amount > top.amount ? day : top));
  return { weekday: best.weekday, amount: best.amount, share: best.amount / total };
}

/** Segunda a domingo, para a lista de dias da semana. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function weekdayShort(weekday: number): string {
  return WEEKDAYS_SHORT[weekday] ?? "";
}
