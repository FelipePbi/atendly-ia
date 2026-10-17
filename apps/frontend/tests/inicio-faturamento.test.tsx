// @vitest-environment jsdom
/**
 * Faturamento no Início (D-180).
 *
 * Prova, pelo que a profissional lê:
 * - "Hoje" é o padrão: total do dia (faturado + previsto), a divisão entre os
 *   dois, atendimentos concluídos de quantos, ticket médio, a variação e
 *   quanto a IA marcou;
 * - "Semana" pede a semana ao servidor e mostra uma coluna por dia com o
 *   valor;
 * - sem faturamento ainda no período, nenhuma comparação ("−100% que ontem"
 *   num dia que nem começou não informa nada);
 * - se a leitura falhar, o cartão não aparece — é complemento do Início.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RevenueReport } from "@/data";
import { HomeRevenueCard } from "@/features/revenue/HomeRevenueCard";

const revenueGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ revenue: { get: revenueGet } }),
}));

const NO_AI: RevenueReport["ai"] = {
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
    period: "day",
    start: "2026-10-16",
    end: "2026-10-16",
    today: "2026-10-16",
    timezone: "America/Sao_Paulo",
    window: {
      from: "2026-10-16T03:00:00.000Z",
      to: "2026-10-16T18:00:00.000Z",
    },
    billed: { amount: 420, count: 3, unvaluedCount: 0, averageTicket: 140 },
    expected: { amount: 600, count: 4, unvaluedCount: 0 },
    previous: {
      start: "2026-10-15",
      end: "2026-10-15",
      amount: 300,
      count: 2,
      partial: true,
    },
    lost: {
      cancelledCount: 0,
      cancelledAmount: 0,
      noShowCount: 0,
      noShowAmount: 0,
    },
    services: [],
    customers: [],
    weekdays: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      amount: 0,
      count: 0,
    })),
    series: [],
    ai: { ...NO_AI, billed: { amount: 160, count: 1 } },
    messages: null,
    ...overrides,
  };
}

const WEEK = report({
  period: "week",
  start: "2026-10-12",
  end: "2026-10-18",
  previous: {
    start: "2026-10-05",
    end: "2026-10-09",
    amount: 0,
    count: 0,
    partial: true,
  },
  series: [
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
  ].map((start, index) => ({
    start,
    amount: index === 4 ? 420 : 0,
    count: index === 4 ? 3 : 0,
    expectedAmount: index === 5 ? 1240 : 0,
    aiAmount: 0,
  })),
});

beforeEach(() => {
  revenueGet.mockReset();
});

describe("cartão de faturamento do Início", () => {
  test("hoje: total do dia, divisão, concluídos, ticket, variação e IA", async () => {
    revenueGet.mockResolvedValue(report());
    render(<HomeRevenueCard />);

    const card = await screen.findByRole("region", { name: "Faturamento" });
    expect(revenueGet).toHaveBeenCalledWith(
      { period: "day" },
      expect.any(AbortSignal),
    );
    expect(within(card).getByRole("button", { name: "Hoje" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(card).getByText("R$ 1.020,00")).toBeVisible();
    expect(within(card).getByText("no total de hoje")).toBeVisible();
    expect(within(card).getByText("R$ 420,00")).toBeVisible();
    expect(within(card).getByText("R$ 600,00")).toBeVisible();
    expect(
      within(card).getByText("3 de 7 atendimentos concluídos"),
    ).toBeVisible();
    expect(within(card).getByText("Ticket médio de R$ 140,00")).toBeVisible();
    expect(within(card).getByText("+40% que ontem")).toBeVisible();
    expect(within(card).getByText(/R\$ 160,00 marcados pela IA/)).toBeVisible();
    expect(
      within(card).getByRole("link", { name: /Ver faturamento completo/ }),
    ).toHaveAttribute("href", "/faturamento");
  });

  test("semana: pede a semana e mostra o valor de cada dia", async () => {
    const user = userEvent.setup();
    revenueGet.mockImplementation(async ({ period }: { period: string }) =>
      period === "week" ? WEEK : report(),
    );
    render(<HomeRevenueCard />);
    const card = await screen.findByRole("region", { name: "Faturamento" });

    await user.click(within(card).getByRole("button", { name: "Semana" }));
    // Até a semana chegar, o dia continua na tela: o cartão não some.
    expect(card).toBeInTheDocument();
    expect(revenueGet).toHaveBeenLastCalledWith(
      { period: "week" },
      expect.any(AbortSignal),
    );
    expect(await within(card).findByText("no total da semana")).toBeVisible();
    const days = within(card).getAllByRole("listitem", { name: /:/ });
    expect(days).toHaveLength(7);
    expect(days[4]).toHaveAccessibleName(
      "sexta, 16 de outubro: R$ 420,00 faturado",
    );
    expect(days[4]).toHaveTextContent("R$ 420");
    expect(days[5]).toHaveTextContent("R$ 1,2 mil");
    expect(days[0]).toHaveTextContent("—");
  });

  test("sem faturamento ainda no período, nenhuma comparação", async () => {
    revenueGet.mockResolvedValue(
      report({
        billed: { amount: 0, count: 0, unvaluedCount: 0, averageTicket: null },
        expected: { amount: 0, count: 0, unvaluedCount: 0 },
      }),
    );
    render(<HomeRevenueCard />);
    const card = await screen.findByRole("region", { name: "Faturamento" });
    expect(within(card).getByText("Nenhum atendimento hoje")).toBeVisible();
    expect(within(card).queryByText(/que ontem/)).toBeNull();
    expect(within(card).queryByText(/Ticket médio/)).toBeNull();
  });

  test("se a leitura falhar, o cartão não aparece", async () => {
    revenueGet.mockRejectedValue(new Error("fora do ar"));
    const { container } = render(<HomeRevenueCard />);
    await vi.waitFor(() => expect(revenueGet).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
