// @vitest-environment jsdom
/**
 * Goal075 (WU-03): fidelidade visual da lista de Clientes.
 *
 * §6.6 — a linha mostra "próximo hoje 15:00", "último há 3 sem", "último
 * faltou · hoje" e "sem atendimentos" nos casos correspondentes, sem data
 * ISO, e o nome acessível da linha carrega nome, telefone e esse texto.
 * §6.7 — a lista tem separadores por letra, em ordem pt-BR sem acento
 * distinguindo letra, "Sem nome" no fim, e a busca esconde separador vazio.
 * Blocker 2 da rodada 1: "hoje" é o dia no fuso do calendário do negócio,
 * não o dia UTC do navegador, e 30 a 44 dias dizem "há 1 mês".
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Customer } from "@/data";
import { CustomerList } from "@/features/customers/CustomerList";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const customersList = vi.fn();
const calendarGetCalendar = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { getCalendar: calendarGetCalendar },
    customers: { list: customersList },
  }),
}));

function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return { id: "c1", name: "Marina Duarte", phone: "11999990000", ...overrides };
}

function renderList() {
  return render(
    <ShellConfigProvider>
      <CustomerList />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  customersList.mockReset();
  calendarGetCalendar.mockReset();
  calendarGetCalendar.mockResolvedValue({ timezone: "America/Sao_Paulo" });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("§6.6 texto de próximo, último e sem atendimentos na linha", () => {
  test("mostra 'próximo hoje 15:00', 'último há 3 sem', 'último faltou · hoje' e 'sem atendimentos', sem data ISO", async () => {
    customersList.mockResolvedValue({
      items: [
        customerFixture({
          id: "c1",
          name: "Marina Duarte",
          nextAppointment: {
            date: "2026-09-29",
            startTime: "15:00",
            status: "CONFIRMED",
          },
          phone: "11999990000",
        }),
        customerFixture({
          id: "c2",
          lastAppointment: {
            date: "2026-09-08",
            startTime: "10:00",
            status: "COMPLETED",
          },
          name: "Bruno Alves",
          phone: "11988880000",
        }),
        customerFixture({
          id: "c3",
          lastAppointment: {
            date: "2026-09-29",
            startTime: "09:00",
            status: "NO_SHOW",
          },
          name: "Carla Nunes",
          phone: "11977770000",
        }),
        customerFixture({
          id: "c4",
          lastAppointment: null,
          name: "Diego Prado",
          nextAppointment: null,
          phone: "11966660000",
        }),
      ],
      managedExternally: false,
      source: "AVENLY",
    });

    renderList();

    const list = await screen.findByRole("list", { name: "Clientes" });
    expect(
      within(list).getByRole("link", { name: /Marina Duarte.*próximo hoje 15:00/ }),
    ).toBeVisible();
    expect(
      within(list).getByRole("link", { name: /Bruno Alves.*último há 3 sem/ }),
    ).toBeVisible();
    expect(
      within(list).getByRole("link", {
        name: /Carla Nunes.*último faltou · hoje/,
      }),
    ).toBeVisible();
    expect(
      within(list).getByRole("link", { name: /Diego Prado.*sem atendimentos/ }),
    ).toBeVisible();

    expect(list.textContent).not.toMatch(/2026-09-29|2026-09-08/);
  });
});

describe("§6.7 separadores por letra em ordem pt-BR", () => {
  test("agrupa por letra sem acento, com 'Sem nome' no fim", async () => {
    customersList.mockResolvedValue({
      items: [
        customerFixture({ id: "c1", name: "Bruno Lima" }),
        customerFixture({ id: "c2", name: "Ana Souza" }),
        customerFixture({ id: "c3", name: "Álvaro Pires" }),
        customerFixture({ id: "c4", name: null, phone: null }),
      ],
      managedExternally: false,
      source: "AVENLY",
    });

    renderList();
    const list = await screen.findByRole("list", { name: "Clientes" });

    const separators = within(list)
      .getAllByText(/^(A|B|Sem nome)$/)
      .map((node) => node.textContent);
    expect(separators).toEqual(["A", "B"]);

    const names = within(list)
      .getAllByRole("link")
      .map((link) => link.querySelector(".list-item-title")?.textContent);
    expect(names).toEqual([
      "Álvaro Pires",
      "Ana Souza",
      "Bruno Lima",
      "Cliente sem nome",
    ]);
  });

  test("a busca esconde o separador de letra sem resultado", async () => {
    const user = userEvent.setup();
    customersList.mockResolvedValue({
      items: [
        customerFixture({ id: "c1", name: "Bruno Lima" }),
        customerFixture({ id: "c2", name: "Ana Souza" }),
      ],
      managedExternally: false,
      source: "AVENLY",
    });

    renderList();
    const list = await screen.findByRole("list", { name: "Clientes" });
    expect(within(list).getAllByText(/^(A|B)$/)).toHaveLength(2);

    await user.type(screen.getByLabelText("Buscar cliente"), "Bruno");

    expect(within(list).queryByText("A")).not.toBeInTheDocument();
    expect(within(list).getByText("B")).toBeVisible();
  });
});

describe("§6.6 'hoje' no fuso do calendário do negócio", () => {
  test("às 22:30 em Brasília (01:30 UTC do dia seguinte) mostra 'próximo hoje', 'próximo amanhã' e 'último hoje'", async () => {
    vi.setSystemTime(new Date("2026-09-30T01:30:00Z"));
    customersList.mockResolvedValue({
      items: [
        customerFixture({
          id: "c1",
          name: "Marina Duarte",
          nextAppointment: {
            date: "2026-09-29",
            startTime: "22:45",
            status: "CONFIRMED",
          },
        }),
        customerFixture({
          id: "c2",
          name: "Bruno Alves",
          nextAppointment: {
            date: "2026-09-30",
            startTime: "10:00",
            status: "CONFIRMED",
          },
        }),
        customerFixture({
          id: "c3",
          lastAppointment: {
            date: "2026-09-29",
            startTime: "19:00",
            status: "COMPLETED",
          },
          name: "Carla Nunes",
        }),
      ],
      managedExternally: false,
      source: "AVENLY",
    });

    renderList();

    const list = await screen.findByRole("list", { name: "Clientes" });
    expect(
      within(list).getByRole("link", { name: /Marina Duarte.*próximo hoje 22:45/ }),
    ).toBeVisible();
    expect(
      within(list).getByRole("link", {
        name: /Bruno Alves.*próximo amanhã 10:00/,
      }),
    ).toBeVisible();
    expect(
      within(list).getByRole("link", { name: /Carla Nunes.*último hoje/ }),
    ).toBeVisible();
  });

  test("o fuso vem do calendário: em Lisboa, 01:30 UTC já é o dia seguinte", async () => {
    vi.setSystemTime(new Date("2026-09-30T01:30:00Z"));
    calendarGetCalendar.mockResolvedValue({ timezone: "Europe/Lisbon" });
    customersList.mockResolvedValue({
      items: [
        customerFixture({
          id: "c1",
          name: "Marina Duarte",
          nextAppointment: {
            date: "2026-09-30",
            startTime: "10:00",
            status: "CONFIRMED",
          },
        }),
      ],
      managedExternally: false,
      source: "AVENLY",
    });

    renderList();

    const list = await screen.findByRole("list", { name: "Clientes" });
    expect(
      within(list).getByRole("link", { name: /Marina Duarte.*próximo hoje 10:00/ }),
    ).toBeVisible();
  });

  test("de 30 a 44 dias diz 'há 1 mês', não 'há 1 meses'", async () => {
    customersList.mockResolvedValue({
      items: [
        customerFixture({
          id: "c1",
          lastAppointment: {
            date: "2026-08-20",
            startTime: "10:00",
            status: "COMPLETED",
          },
          name: "Marina Duarte",
        }),
        customerFixture({
          id: "c2",
          lastAppointment: {
            date: "2026-07-01",
            startTime: "10:00",
            status: "COMPLETED",
          },
          name: "Bruno Alves",
        }),
      ],
      managedExternally: false,
      source: "AVENLY",
    });

    renderList();

    const list = await screen.findByRole("list", { name: "Clientes" });
    expect(
      within(list).getByRole("link", { name: /Marina Duarte.*último há 1 mês/ }),
    ).toBeVisible();
    expect(
      within(list).getByRole("link", { name: /Bruno Alves.*último há 3 meses/ }),
    ).toBeVisible();
    expect(list.textContent).not.toMatch(/há 1 meses/);
  });
});
