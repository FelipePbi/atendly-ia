// @vitest-environment jsdom
/**
 * Faturamento (D-177).
 *
 * A tela mostra o faturado, o previsto separado, a comparação, a participação
 * de cada serviço e os atendimentos sem valor; trocar o período pede o
 * período novo ao servidor (a soma nunca é feita no navegador); tocar no
 * melhor mês abre o mês; falha mostra "Tentar novamente"; sem atendimento, um
 * vazio que explica; e a primeira carga não pisca o "A" animado (D-168).
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type RevenueReport } from "@/data";
import { RevenueScreen } from "@/features/revenue/RevenueScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { forget } from "@/shared/runtime/sessionMemory";

import { expectNoA11yViolations } from "./support/a11y";

const revenueGet = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/faturamento",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ revenue: { get: revenueGet } }),
}));

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
    window: {
      from: "2026-10-01T03:00:00.000Z",
      to: "2026-10-16T18:00:00.000Z",
    },
    billed: { amount: 2000, count: 12, unvaluedCount: 2, averageTicket: 200 },
    expected: { amount: 450, count: 3, unvaluedCount: 0 },
    previous: {
      start: "2026-09-01",
      end: "2026-09-16",
      amount: 1600,
      count: 10,
      partial: true,
    },
    lost: {
      cancelledCount: 1,
      cancelledAmount: 150,
      noShowCount: 2,
      noShowAmount: 300,
    },
    services: [
      {
        serviceId: "svc-cilios",
        name: "Cílios 5D",
        colorToken: "ROSE",
        amount: 1300,
        count: 7,
        share: 0.65,
      },
      {
        serviceId: "svc-sobrancelha",
        name: "Sobrancelha",
        colorToken: "AMBER",
        amount: 700,
        count: 7,
        share: 0.35,
      },
    ],
    customers: [
      { customerId: "cus-ana", name: "Ana Souza", amount: 600, count: 3 },
    ],
    weekdays: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      amount: weekday === 6 ? 1200 : weekday === 3 ? 800 : 0,
      count: weekday === 6 ? 7 : weekday === 3 ? 5 : 0,
    })),
    series: Array.from({ length: 31 }, (_, index) => ({
      start: `2026-10-${String(index + 1).padStart(2, "0")}`,
      amount: index === 9 ? 500 : index < 16 ? 100 : 0,
      count: index < 16 ? 1 : 0,
      expectedAmount: index > 16 ? 50 : 0,
      aiAmount: 0,
    })),
    ai: EMPTY_AI,
    messages: null,
    ...overrides,
  };
}

const YEAR = report({
  period: "year",
  start: "2026-01-01",
  end: "2026-12-31",
  previous: {
    start: "2025-01-01",
    end: "2025-10-16",
    amount: 0,
    count: 0,
    partial: true,
  },
  series: Array.from({ length: 12 }, (_, index) => ({
    start: `2026-${String(index + 1).padStart(2, "0")}-01`,
    amount: index === 2 ? 3200 : index < 10 ? 1000 : 0,
    count: index < 10 ? 8 : 0,
    expectedAmount: index >= 10 ? 400 : 0,
    aiAmount: 0,
  })),
});

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <RevenueScreen />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  forget();
  revenueGet.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Faturamento", () => {
  test("mostra faturado, previsto à parte, comparação e participação por serviço", async () => {
    revenueGet.mockResolvedValue(report());
    const { container } = renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Faturamento", level: 1 }),
    ).toBeVisible();
    const summary = screen.getByRole("region", { name: "Faturado" });
    expect(within(summary).getByText("R$ 2.000,00")).toBeVisible();
    expect(within(summary).getByText("+25% que setembro")).toBeVisible();
    expect(
      within(summary).getByText(
        "Comparando 1 a 16 de outubro com 1 a 16 de setembro, até as 15:00.",
      ),
    ).toBeVisible();
    expect(within(summary).getByText("R$ 450,00")).toBeVisible();
    expect(
      within(summary).getByText("3 confirmados pela frente"),
    ).toBeVisible();
    expect(
      within(summary).getByText(/2 atendimentos concluídos sem valor/),
    ).toBeVisible();

    const services = screen.getByRole("region", { name: "Por serviço" });
    expect(within(services).getByText("Cílios 5D")).toBeVisible();
    expect(within(services).getByText("65% do faturamento")).toBeVisible();
    expect(within(services).getByText("35% do faturamento")).toBeVisible();

    expect(screen.getByRole("link", { name: "Ana Souza" })).toHaveAttribute(
      "href",
      "/clientes/detalhes?id=cus-ana",
    );
    expect(
      screen.getByText("Sábado: 60% do faturado, R$ 1.200,00."),
    ).toBeVisible();
    expect(
      screen.getByText("R$ 450,00 deixaram de entrar neste período."),
    ).toBeVisible();
    expect(revenueGet).toHaveBeenCalledWith(
      { period: "month" },
      expect.any(AbortSignal),
    );

    await expectNoA11yViolations(container);
  });

  test("ano destaca o melhor mês e tocar nele abre o mês", async () => {
    const user = userEvent.setup();
    revenueGet
      .mockResolvedValueOnce(report())
      .mockResolvedValueOnce(YEAR)
      .mockResolvedValue(report());
    renderScreen();
    await screen.findByText("Outubro de 2026");

    await user.click(screen.getByRole("button", { name: "Ano" }));
    expect(
      await screen.findByText("Melhor mês: março, R$ 3.200,00"),
    ).toBeVisible();
    expect(revenueGet).toHaveBeenLastCalledWith(
      { period: "year" },
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "Ano" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Sem faturamento no ano anterior, não inventa porcentagem.
    expect(
      screen.getByText("2025 não teve faturamento para comparar"),
    ).toBeVisible();

    const chart = screen.getByRole("group", { name: /Mês a mês/ });
    await user.click(
      within(chart).getByRole("button", {
        name: /^março, melhor mês, R\$ 3\.200,00 faturado/,
      }),
    );
    expect(revenueGet).toHaveBeenLastCalledWith(
      { period: "month", date: "2026-03-01" },
      expect.any(AbortSignal),
    );
  });

  test("setas pedem o período vizinho e 'Este mês' volta para hoje", async () => {
    const user = userEvent.setup();
    revenueGet
      .mockResolvedValueOnce(report())
      .mockResolvedValueOnce(report({ start: "2026-09-01", end: "2026-09-30" }))
      .mockResolvedValue(report());
    renderScreen();
    await screen.findByText("Outubro de 2026");

    await user.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(await screen.findByText("Setembro de 2026")).toBeVisible();
    expect(revenueGet).toHaveBeenLastCalledWith(
      { period: "month", date: "2026-09-01" },
      expect.any(AbortSignal),
    );
    await user.click(screen.getByRole("button", { name: "Este mês" }));
    expect(revenueGet).toHaveBeenLastCalledWith(
      { period: "month" },
      expect.any(AbortSignal),
    );
    expect(await screen.findByText("Outubro de 2026")).toBeVisible();
  });

  test("falha mostra 'Tentar novamente', que pede de novo", async () => {
    const user = userEvent.setup();
    revenueGet
      .mockRejectedValueOnce(
        new BffHttpError({
          code: "SCHEDULING_UNAVAILABLE",
          message: "Agenda indisponível.",
          requestId: "req-1",
          status: 503,
        }),
      )
      .mockResolvedValue(report());
    renderScreen();

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Não foi possível carregar o faturamento"),
    ).toBeVisible();
    await user.click(
      within(alert).getByRole("button", { name: "Tentar novamente" }),
    );
    expect(await screen.findByText("R$ 2.000,00")).toBeVisible();
  });

  test("sem atendimento no período, um vazio que explica", async () => {
    revenueGet.mockResolvedValue(
      report({
        billed: { amount: 0, count: 0, unvaluedCount: 0, averageTicket: null },
        expected: { amount: 0, count: 0, unvaluedCount: 0 },
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
      }),
    );
    renderScreen();
    expect(
      await screen.findByText("Nenhum atendimento neste período"),
    ).toBeVisible();
    // A navegação continua: dá para ir a outro período.
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeVisible();
  });

  test("carga rápida não pisca o A animado; demorada mostra", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolve!: (value: RevenueReport) => void;
    revenueGet.mockReturnValue(new Promise((done) => (resolve = done)));
    renderScreen();
    expect(document.querySelector(".brand-loader-screen")).toBeNull();
    expect(document.querySelector(".skeleton")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(document.querySelector(".brand-loader-screen")).not.toBeNull();
    await act(async () => resolve(report()));
    await waitFor(() =>
      expect(document.querySelector(".brand-loader-screen")).toBeNull(),
    );
    expect(screen.getByText("R$ 2.000,00")).toBeVisible();
  });
});
