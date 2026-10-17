/**
 * Faturamento (D-177): textos e contas de exibição. Os totais vêm do
 * servidor; aqui se prova o formato em reais, o nome do período, a frase da
 * comparação e a participação que fecha em 100%.
 */

import { describe, expect, test } from "vitest";

import type { RevenueReport } from "@/data";
import {
  adjacentPeriodDate,
  bestBar,
  chartBars,
  comparison,
  formatCompactMoney,
  formatMoney,
  periodTitle,
  shareLabels,
  strongestWeekday,
} from "@/features/revenue/revenueFormat";

const EMPTY_AI: RevenueReport["ai"] = {
  billed: { amount: 0, count: 0 },
  expected: { amount: 0, count: 0 },
  share: null,
  newCustomers: { count: 0, amount: 0, names: [] },
  afterHours: { count: 0, amount: 0 },
  rescheduled: { count: 0, amount: 0 },
  acquired: { customers: 0, amount: 0 },
};

function report(overrides: Partial<RevenueReport> = {}): RevenueReport {
  return {
    period: "month",
    start: "2026-10-01",
    end: "2026-10-31",
    today: "2026-10-16",
    timezone: "America/Sao_Paulo",
    window: { from: "2026-10-01T03:00:00.000Z", to: "2026-10-16T18:00:00.000Z" },
    billed: { amount: 1120, count: 8, unvaluedCount: 0, averageTicket: 140 },
    expected: { amount: 0, count: 0, unvaluedCount: 0 },
    previous: { start: "2026-09-01", end: "2026-09-16", amount: 1000, count: 7, partial: true },
    lost: { cancelledCount: 0, cancelledAmount: 0, noShowCount: 0, noShowAmount: 0 },
    services: [],
    customers: [],
    weekdays: Array.from({ length: 7 }, (_, weekday) => ({ weekday, amount: 0, count: 0 })),
    series: [],
    ai: EMPTY_AI,
    messages: null,
    ...overrides,
  };
}

describe("formato do faturamento", () => {
  test("valores em reais no formato pt-BR", () => {
    expect(formatMoney(1234.5)).toBe("R$ 1.234,50");
    expect(formatMoney(0)).toBe("R$ 0,00");
  });

  test("comparação com o período anterior", () => {
    expect(comparison(report())).toEqual({
      kind: "change",
      direction: "up",
      text: "+12% que setembro",
    });
    expect(
      comparison(report({ billed: { amount: 900, count: 6, unvaluedCount: 0, averageTicket: 150 } })),
    ).toMatchObject({ direction: "down", text: "−10% que setembro" });
    expect(
      comparison(report({ previous: { start: "2026-09-01", end: "2026-09-16", amount: 0, count: 0, partial: true } })),
    ).toEqual({ kind: "new", text: "Setembro não teve faturamento para comparar" });
    expect(
      comparison(
        report({
          period: "year",
          start: "2026-01-01",
          end: "2026-12-31",
          previous: { start: "2025-01-01", end: "2025-10-16", amount: 1120, count: 8, partial: true },
        }),
      ),
    ).toMatchObject({ direction: "same", text: "Igual a 2025" });
  });

  test("participação fecha em 100% e fatia pequena aparece como <1%", () => {
    expect(shareLabels([65, 20, 15])).toEqual(["65%", "20%", "15%"]);
    expect(shareLabels([1, 1, 1])).toEqual(["34%", "33%", "33%"]);
    expect(shareLabels([999, 1])).toEqual(["100%", "<1%"]);
  });

  test("nome do período", () => {
    expect(periodTitle(report())).toBe("Outubro de 2026");
    expect(periodTitle(report({ period: "week", start: "2026-10-12", end: "2026-10-18" }))).toBe(
      "12 a 18 de outubro",
    );
    expect(periodTitle(report({ period: "week", start: "2026-09-28", end: "2026-10-04" }))).toBe(
      "28 de setembro a 4 de outubro",
    );
    expect(periodTitle(report({ period: "day", start: "2026-10-16", end: "2026-10-16" }))).toBe(
      "Sexta, 16 de outubro",
    );
    expect(periodTitle(report({ period: "year", start: "2025-01-01", end: "2025-12-31" }))).toBe("2025");
  });

  test("navegação entre períodos", () => {
    expect(adjacentPeriodDate("month", "2026-01-01", -1)).toBe("2025-12-01");
    expect(adjacentPeriodDate("week", "2026-10-12", 1)).toBe("2026-10-19");
    expect(adjacentPeriodDate("day", "2026-03-01", -1)).toBe("2026-02-28");
    expect(adjacentPeriodDate("year", "2026-01-01", 1)).toBe("2027-01-01");
  });

  test("melhor mês do ano e dia da semana mais forte", () => {
    const yearly = report({
      period: "year",
      start: "2026-01-01",
      end: "2026-12-31",
      series: [
        { start: "2026-01-01", amount: 300, count: 2, expectedAmount: 0, aiAmount: 0 },
        { start: "2026-02-01", amount: 900, count: 6, expectedAmount: 0, aiAmount: 0 },
        { start: "2026-03-01", amount: 0, count: 0, expectedAmount: 450, aiAmount: 0 },
      ],
    });
    const bars = chartBars(yearly);
    expect(bars.map((bar) => bar.short)).toEqual(["jan", "fev", "mar"]);
    expect(bestBar(bars)).toMatchObject({ long: "fevereiro", amount: 900 });
    expect(bars[1]?.drill).toEqual({ period: "month", date: "2026-02-01" });
    expect(bestBar(chartBars(report()))).toBeNull();

    const weekdays = report().weekdays.map((day) =>
      day.weekday === 6 ? { ...day, amount: 300 } : day.weekday === 2 ? { ...day, amount: 100 } : day,
    );
    expect(strongestWeekday(weekdays)).toEqual({ weekday: 6, amount: 300, share: 0.75 });
  });
});

/**
 * Valor em toda coluna do gráfico (pedido de 2026-10-17): antes, só o maior
 * dia ou mês tinha o valor escrito.
 */
describe("valor curto em cima de cada coluna", () => {
  test("reais inteiros abaixo de mil e milhares com uma casa", () => {
    expect(formatCompactMoney(0)).toBe("R$ 0");
    expect(formatCompactMoney(770)).toBe("R$ 770");
    expect(formatCompactMoney(999.6)).toBe("R$ 1000");
    expect(formatCompactMoney(1240)).toBe("R$ 1,2 mil");
    expect(formatCompactMoney(9740)).toBe("R$ 9,7 mil");
    expect(formatCompactMoney(13000)).toBe("R$ 13 mil");
    expect(formatCompactMoney(125400)).toBe("R$ 125 mil");
  });
});
