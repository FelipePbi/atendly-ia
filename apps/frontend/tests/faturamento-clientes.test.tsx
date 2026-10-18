// @vitest-environment jsdom
/**
 * Todos os clientes do período (2026-10-18): o cartão "Clientes que mais
 * faturaram" mostra cinco e leva à lista completa, que pede ao servidor o
 * mesmo período e ordena por faturamento ou por atendimentos.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  revenueCustomersHref,
  RevenueCustomersScreen,
} from "@/features/revenue/RevenueCustomersScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const revenueCustomers = vi.fn();
let search = new URLSearchParams("periodo=week&data=2026-10-12");

vi.mock("next/navigation", () => ({
  usePathname: () => "/faturamento/clientes",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => search,
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ revenue: { customers: revenueCustomers } }),
}));

const customers = [
  { customerId: "a", name: "Ana", amount: 300, count: 1 },
  { customerId: "b", name: "Bia", amount: 200, count: 3 },
  { customerId: "c", name: null, amount: 100, count: 2 },
];

beforeEach(() => {
  search = new URLSearchParams("periodo=week&data=2026-10-12");
  revenueCustomers.mockReset();
  revenueCustomers.mockResolvedValue({
    period: "week",
    start: "2026-10-12",
    end: "2026-10-18",
    today: "2026-10-18",
    customers,
  });
});

function names() {
  return within(screen.getByRole("list"))
    .getAllByRole("link")
    .map((link) => link.textContent);
}

describe("Faturamento › clientes do período", () => {
  test("o link do cartão leva o período e o dia", () => {
    expect(revenueCustomersHref({ period: "week", date: "2026-10-12" })).toBe(
      "/faturamento/clientes?periodo=week&data=2026-10-12",
    );
  });

  test("pede o período da URL e mostra todos, do que mais faturou", async () => {
    render(
      <ShellConfigProvider>
        <RevenueCustomersScreen />
      </ShellConfigProvider>,
    );

    await waitFor(() => expect(names()).toHaveLength(3));
    expect(revenueCustomers).toHaveBeenCalledWith(
      { period: "week", date: "2026-10-12" },
      expect.any(AbortSignal),
    );
    expect(names()).toEqual(["Ana", "Bia", "Cliente sem nome"]);
    expect(screen.getByText("12 a 18 de outubro")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ana" })).toHaveAttribute(
      "href",
      "/clientes/detalhes?id=a",
    );
  });

  test("ordenar por atendimentos reordena sem pedir de novo", async () => {
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <RevenueCustomersScreen />
      </ShellConfigProvider>,
    );
    await waitFor(() => expect(names()).toHaveLength(3));

    await user.click(screen.getByRole("button", { name: "Atendimentos" }));

    expect(names()).toEqual(["Bia", "Cliente sem nome", "Ana"]);
    expect(
      screen.getByRole("button", { name: "Atendimentos" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(revenueCustomers).toHaveBeenCalledTimes(1);
  });
});
