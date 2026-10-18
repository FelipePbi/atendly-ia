import type { Appointment, RevenueReport } from "@/data";
import {
  chartBars,
  monthName,
  strongestWeekday,
  weekdayName,
  weekdayOf,
} from "@/features/revenue/revenueFormat";

/**
 * Contas e textos da Home "Faturamento que vale a tela" (2026-10-18). Os
 * totais chegam somados do servidor (`GET /v1/revenue`, D-177); aqui só se
 * escolhe o que mostrar e como escrever. Nada é estimado: sem meta e sem
 * projeção, o mês mostra o que já entrou e o que está confirmado pela frente.
 */

const whole = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const cents = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

/** "R$ 1.180"; com centavos só quando existem ("R$ 52,50"). */
export function homeMoney(amount: number): string {
  const format = Number.isInteger(amount) ? whole : cents;
  // O Intl já separa "R$" do valor com espaço não separável: nunca quebra.
  return format.format(amount);
}

/** O número em cima de cada coluna da semana: "720", "1.240". */
export function barLabel(amount: number): string {
  return Math.round(amount).toLocaleString("pt-BR");
}

export function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

/** Valor de um atendimento na agenda: o final registrado ou o preço fixo combinado. */
export function appointmentAmount(appointment: Appointment): number | null {
  if (appointment.finalValue !== null && appointment.finalValue !== undefined) {
    return appointment.finalValue;
  }
  if (
    appointment.totalPriceType === "FIXED" &&
    appointment.totalPrice !== null
  ) {
    return appointment.totalPrice;
  }
  return null;
}

export function isCompleted(appointment: Appointment): boolean {
  return appointment.status.toUpperCase() === "COMPLETED";
}

/** "Bia", "Bia e Marina", "Bia, Marina e Renata", "Bia, Marina e mais 2". */
export function firstNames(appointments: readonly Appointment[]): string {
  const names = appointments.map(
    (appointment) =>
      appointment.customer?.name?.trim().split(/\s+/)[0] ??
      appointment.title ??
      "Cliente",
  );
  if (names.length <= 3) {
    if (names.length === 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
  }
  return `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}`;
}

export type HomeChange = {
  direction: "up" | "down" | "same";
  /** "+12%", "−8%", "Igual". */
  short: string;
  /** "que ontem a esta hora", "a ontem a esta hora" (depois de "Igual"). */
  sub: string;
  /** O valor do período anterior, para "(R$ 410)". */
  previous: number;
};

/**
 * Variação contra o período anterior, só quando há o que comparar: sem
 * faturamento ainda ou sem faturamento no anterior, nada (vault, Faturamento
 * no Início). Com o período correndo, o servidor já cortou o anterior na
 * mesma hora de agora.
 */
export function homeChange(report: RevenueReport): HomeChange | null {
  const current = report.billed.amount;
  const before = report.previous.amount;
  if (current <= 0 || before <= 0) return null;
  const name = previousLabel(report);
  const change = Math.round(((current - before) / before) * 100);
  if (change === 0) {
    return {
      direction: "same",
      short: "Igual",
      sub: `a ${name}`,
      previous: before,
    };
  }
  return {
    direction: change > 0 ? "up" : "down",
    short: `${change > 0 ? "+" : "−"}${Math.abs(change)}%`,
    sub: `que ${name}`,
    previous: before,
  };
}

/** "ontem a esta hora", "a semana passada até quinta", "ontem". */
function previousLabel(report: RevenueReport): string {
  const running = report.previous.partial;
  if (report.period === "week") {
    return running
      ? `a semana passada até ${weekdayName(weekdayOf(report.today))}`
      : "a semana passada";
  }
  return running ? "ontem a esta hora" : "ontem";
}

/** "+12% que ontem a esta hora (R$ 410)". */
export function changeSentence(change: HomeChange, withAmount = false): string {
  const amount = withAmount ? ` (${homeMoney(change.previous)})` : "";
  return `${change.short} ${change.sub}${amount}`;
}

export type WeekBar = {
  key: string;
  label: string;
  long: string;
  billed: number;
  expected: number;
  /** Altura da coluna em relação ao maior dia, de 0 a 100. */
  height: number;
  /** Parte faturada dentro da coluna, de 0 a 100. */
  billedShare: number;
  isToday: boolean;
};

/** Segunda a domingo: o faturado embaixo, o confirmado pela frente em cima. */
export function weekBars(report: RevenueReport): WeekBar[] {
  const bars = chartBars(report);
  const max = Math.max(
    ...bars.map((bar) => bar.amount + bar.expectedAmount),
    0,
  );
  return bars.map((bar) => {
    const value = bar.amount + bar.expectedAmount;
    return {
      key: bar.key,
      label: bar.short,
      long: bar.long,
      billed: bar.amount,
      expected: bar.expectedAmount,
      height: max > 0 ? Math.round((value / max) * 100) : 0,
      billedShare: value > 0 ? (bar.amount / value) * 100 : 0,
      isToday: bar.key === report.today,
    };
  });
}

/** O último dia da semana com confirmado pela frente: "sábado". */
export function lastExpectedWeekday(report: RevenueReport): string | null {
  const last = [...report.series]
    .reverse()
    .find((day) => day.expectedAmount > 0);
  return last ? weekdayName(weekdayOf(last.start)) : null;
}

function daysInMonth(date: string): number {
  const [year, month] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "faltam 16 dias", "falta 1 dia", "último dia do mês". */
export function daysLeftLabel(today: string): string {
  const left = daysInMonth(today) - Number(today.slice(8, 10));
  if (left <= 0) return "último dia do mês";
  return left === 1 ? "falta 1 dia" : `faltam ${left} dias`;
}

/** "Outubro". */
export function monthTitle(report: RevenueReport): string {
  return capitalize(monthName(report.start));
}

/** "sábado é seu dia mais forte", pelo faturado do mês. */
export function strongestDayLabel(report: RevenueReport): string | null {
  const best = strongestWeekday(report.weekdays);
  return best ? `${weekdayName(best.weekday)} é seu dia mais forte` : null;
}

/** "R$ 2.770 a entrar até o fim do mês". */
export function monthExpectedLabel(report: RevenueReport): string | null {
  return report.expected.amount > 0
    ? `${homeMoney(report.expected.amount)} a entrar até o fim do mês`
    : null;
}

/** Parte de `part` em `total`, em porcentagem inteira; nula sem total. */
export function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null;
}
