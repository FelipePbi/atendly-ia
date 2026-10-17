// @vitest-environment jsdom
/**
 * O que a IA fez por você (D-178), no Faturamento e no Início.
 *
 * Prova, pelo que a profissional lê:
 * - quanto do faturado veio da IA, com a parte em porcentagem;
 * - clientes novos que chegaram pela IA, o que ela marcou fora do horário e o
 *   que ela remarcou, cada um só quando aconteceu;
 * - "desde que você começou", quando a IA já trouxe clientes;
 * - com a IA desligada e sem nada dela no período, o convite com as mensagens
 *   que chegaram fora do horário — e nenhum convite com o status incerto;
 * - a barra do gráfico com a parte da IA e a legenda;
 * - o cartão do Início, que só aparece quando a IA trouxe algo no mês.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { RevenueReport } from "@/data";
import { AiValueCard } from "@/features/revenue/AiValueCard";
import {
  aiValueView,
  homeAiLine,
  periodPhrase,
} from "@/features/revenue/aiValue";
import { HomeAiValue } from "@/features/revenue/HomeAiValue";
import { RevenueChart } from "@/features/revenue/RevenueChart";
import { chartBars } from "@/features/revenue/revenueFormat";

import { expectNoA11yViolations } from "./support/a11y";

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
    period: "month",
    start: "2026-10-01",
    end: "2026-10-31",
    today: "2026-10-16",
    timezone: "America/Sao_Paulo",
    window: {
      from: "2026-10-01T03:00:00.000Z",
      to: "2026-10-16T18:00:00.000Z",
    },
    billed: { amount: 1000, count: 8, unvaluedCount: 0, averageTicket: 125 },
    expected: { amount: 250, count: 2, unvaluedCount: 0 },
    previous: {
      start: "2026-09-01",
      end: "2026-09-16",
      amount: 0,
      count: 0,
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
    ai: NO_AI,
    messages: null,
    ...overrides,
  };
}

const WITH_AI = report({
  ai: {
    billed: { amount: 400, count: 3 },
    expected: { amount: 250, count: 2 },
    share: 0.4,
    newCustomers: { count: 5, amount: 800, names: ["Bia", "Carla", "Duda"] },
    afterHours: { count: 4, amount: 320 },
    rescheduled: { count: 0, amount: 0 },
    acquired: { customers: 12, amount: 3200 },
  },
});

describe("frases do que a IA fez", () => {
  test("nomeia o período: corrente e passado", () => {
    expect(periodPhrase(report())).toBe("neste mês");
    expect(
      periodPhrase(report({ start: "2026-09-01", end: "2026-09-30" })),
    ).toBe("em setembro");
    expect(
      periodPhrase(
        report({ period: "year", start: "2025-01-01", end: "2025-12-31" }),
      ),
    ).toBe("em 2025");
    expect(
      periodPhrase(
        report({ period: "day", start: "2026-10-16", end: "2026-10-16" }),
      ),
    ).toBe("hoje");
  });

  test("sem nada da IA e com ela ligada, não diz nada", () => {
    expect(aiValueView(report(), false)).toEqual({ kind: "none" });
  });

  test("o Início só mostra a linha quando a IA trouxe algo no mês", () => {
    expect(homeAiLine(report())).toBeNull();
    expect(homeAiLine(WITH_AI)).toBe(
      "Neste mês a IA trouxe R$ 400,00 · 5 clientes novos",
    );
    expect(
      homeAiLine(
        report({
          ai: { ...NO_AI, newCustomers: { count: 1, amount: 0, names: [] } },
        }),
      ),
    ).toBe("Neste mês, 1 cliente novo chegou pela IA");
  });
});

describe("bloco no Faturamento", () => {
  test("mostra a parte da IA no faturado e só os destaques que aconteceram", async () => {
    const { container } = render(
      <AiValueCard aiOff={false} report={WITH_AI} />,
    );
    const block = screen.getByRole("region", {
      name: "O que a IA fez por você",
    });

    expect(
      within(block).getByRole("heading", {
        name: "A IA marcou R$ 400,00 dos seus R$ 1.000,00 neste mês",
      }),
    ).toBeVisible();
    expect(within(block).getByText("40%")).toBeVisible();
    expect(
      within(block).getByText(
        "+ R$ 250,00 em 2 atendimentos que ela já marcou pela frente",
      ),
    ).toBeVisible();

    const items = within(block).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "5clientes novos chegaram pela IAJá gastaram R$ 800,00 · Bia, Carla, Duda e mais 2",
      "4atendimentos marcados fora do seu horárioR$ 320,00 marcados à noite, no fim de semana ou em dia fechado",
    ]);
    // Nada remarcado pela IA: o destaque não aparece.
    expect(within(block).queryByText(/remarcad/)).toBeNull();
    expect(
      within(block).getByText(
        "Desde que você começou, a IA trouxe 12 clientes novos, que já faturaram R$ 3.200,00.",
      ),
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("IA desligada e mensagens fora do horário: convite para ligar a IA", () => {
    render(
      <AiValueCard
        aiOff
        report={report({ messages: { total: 30, outsideHours: 18 } })}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Neste mês, 18 mensagens de clientes chegaram fora do seu horário de atendimento.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Ligar a IA" })).toHaveAttribute(
      "href",
      "/configuracoes/ia",
    );
  });

  test("status incerto ou nenhuma mensagem fora do horário: nenhum convite", () => {
    const { container, rerender } = render(
      <AiValueCard
        aiOff={false}
        report={report({ messages: { total: 30, outsideHours: 18 } })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <AiValueCard
        aiOff
        report={report({ messages: { total: 30, outsideHours: 0 } })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<AiValueCard aiOff report={report()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("gráfico", () => {
  test("a barra diz a parte da IA e a legenda aparece", () => {
    const yearly = report({
      period: "year",
      start: "2026-01-01",
      end: "2026-12-31",
      series: [
        {
          start: "2026-01-01",
          amount: 1000,
          count: 6,
          expectedAmount: 0,
          aiAmount: 400,
        },
        {
          start: "2026-02-01",
          amount: 500,
          count: 3,
          expectedAmount: 0,
          aiAmount: 0,
        },
      ],
    });
    render(
      <RevenueChart
        bars={chartBars(yearly)}
        caption="Mês a mês"
        onOpen={() => undefined}
        period="year"
      />,
    );
    expect(
      screen.getByRole("button", { name: /^janeiro, melhor mês/ }),
    ).toHaveAccessibleName(
      "janeiro, melhor mês, R$ 1.000,00 faturado, R$ 400,00 marcado pela IA, 6 atendimentos. Abrir o mês",
    );
    expect(screen.getByText("Marcado pela IA")).toBeInTheDocument();
  });
});

describe("cartão do Início", () => {
  test("aparece com a linha do mês e leva ao Faturamento", async () => {
    revenueGet.mockResolvedValue(WITH_AI);
    render(<HomeAiValue />);
    const link = await screen.findByRole("link", {
      name: /Neste mês a IA trouxe R\$ 400,00 · 5 clientes novos/,
    });
    expect(link).toHaveAttribute("href", "/faturamento");
    expect(revenueGet).toHaveBeenCalledWith(
      { period: "month" },
      expect.any(AbortSignal),
    );
  });

  test("sem nada da IA no mês, não aparece", async () => {
    revenueGet.mockResolvedValue(report());
    const { container } = render(<HomeAiValue />);
    await vi.waitFor(() => expect(revenueGet).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
