// @vitest-environment jsdom
/**
 * Goal069 §1 (WU-01): estrutura da Agenda — barra superior única, "+ Novo"
 * com os três tipos governados por capacidade, `BlockForm` aceitando o tipo
 * pedido pela URL, "Exceções do dia" ainda alcançável e copy sem os termos
 * técnicos banidos ("Operação diária", "fonte oficial", "Operacional",
 * "persistidos"). Cada teste aqui reprova no SHA `37c7371` (baseline aceita
 * do Goal069), que ainda tinha o cabeçalho "Operação diária", `SourceStrip`
 * e três botões soltos em vez de "+ Novo".
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CalendarState } from "@/data";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const createTimeBlock = vi.fn();
const deleteTimeBlock = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      createTimeBlock,
      deleteTimeBlock,
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
    },
  }),
}));

import BlockTimePage from "@/app/(platform)/agenda/bloquear/page";
import AgendaPage from "@/app/(platform)/agenda/page";

function calendarFixture(
  overrides: Partial<CalendarState> = {},
): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: false,
    },
    integration: null,
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 390;
  window.history.pushState({}, "", "/agenda");
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
});

function renderPage(page: React.ReactElement) {
  return render(<ShellConfigProvider>{page}</ShellConfigProvider>);
}

describe("/agenda troca cabeçalho técnico e botões soltos por uma barra única", () => {
  test("nenhuma copy técnica aparece, e o h1 'Agenda' continua acessível", async () => {
    renderPage(<AgendaPage />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Agenda" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Operação diária")).toBeNull();
    expect(screen.queryByText(/fonte oficial/i)).toBeNull();
    expect(screen.queryByText("Operacional")).toBeNull();
    expect(screen.queryByText(/persistidos/i)).toBeNull();
  });

  test("existe um só controle de criação ('+ Novo')", async () => {
    renderPage(<AgendaPage />);
    await screen.findByText("Nenhum atendimento neste dia.");

    expect(screen.getAllByRole("button", { name: "Novo" })).toHaveLength(1);
  });

  test("o menu '+ Novo' lista os três tipos, cada um com seu destino", async () => {
    const user = userEvent.setup();
    renderPage(<AgendaPage />);
    await screen.findByText("Nenhum atendimento neste dia.");

    await user.click(screen.getByRole("button", { name: "Novo" }));
    const menu = screen.getByRole("menu");

    expect(
      within(menu).getByRole("menuitem", { name: "Agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo");
    expect(
      within(menu).getByRole("menuitem", { name: "Compromisso pessoal" }),
    ).toHaveAttribute("href", "/agenda/bloquear?type=PERSONAL");
    expect(
      within(menu).getByRole("menuitem", { name: "Bloqueio" }),
    ).toHaveAttribute("href", "/agenda/bloquear?type=BLOCK");
  });

  test("Escape fecha o menu e devolve o foco ao botão 'Novo'", async () => {
    const user = userEvent.setup();
    renderPage(<AgendaPage />);
    await screen.findByText("Nenhum atendimento neste dia.");

    const trigger = screen.getByRole("button", { name: "Novo" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test("cada item do menu some sem a capacidade que o governa", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({
        capabilities: {
          createAppointments: false,
          manageAvailability: true,
          manageCustomers: true,
          manageServices: true,
          migrate: false,
        },
      }),
    );
    const user = userEvent.setup();
    renderPage(<AgendaPage />);
    await screen.findByText("Nenhum atendimento neste dia.");

    await user.click(screen.getByRole("button", { name: "Novo" }));
    const menu = screen.getByRole("menu");
    expect(
      within(menu).queryByRole("menuitem", { name: "Agendamento" }),
    ).toBeNull();
    expect(
      within(menu).getByRole("menuitem", { name: "Compromisso pessoal" }),
    ).toBeVisible();
  });

  test("sem nenhuma capacidade de criação, o botão 'Novo' não existe", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({
        capabilities: {
          createAppointments: false,
          manageAvailability: false,
          manageCustomers: true,
          manageServices: true,
          migrate: false,
        },
      }),
    );
    renderPage(<AgendaPage />);
    await screen.findByText("Nenhum atendimento neste dia.");

    expect(screen.queryByRole("button", { name: "Novo" })).toBeNull();
  });

  test("'Exceção do dia' continua alcançável pelo menu e some sem manageAvailability", async () => {
    // Goal092: o botão solto "Exceções do dia" virou o item "Exceção do dia"
    // do menu "Novo".
    const user = userEvent.setup();
    const first = renderPage(<AgendaPage />);
    await user.click(await screen.findByRole("button", { name: "Novo" }));
    expect(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "Exceção do dia",
      }),
    ).toHaveAttribute("href", "/agenda/excecoes");
    first.unmount();

    getCalendar.mockResolvedValue(
      calendarFixture({
        capabilities: {
          createAppointments: true,
          manageAvailability: false,
          manageCustomers: true,
          manageServices: true,
          migrate: false,
        },
      }),
    );
    renderPage(<AgendaPage />);
    await user.click(await screen.findByRole("button", { name: "Novo" }));
    expect(
      within(screen.getByRole("menu")).queryByRole("menuitem", {
        name: "Exceção do dia",
      }),
    ).toBeNull();
  });

  test("agenda sem fonte configurada explica a situação sem os termos banidos", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({ source: null, timezone: null }),
    );
    renderPage(<AgendaPage />);

    expect(
      await screen.findByText("Agenda ainda não configurada"),
    ).toBeVisible();
    expect(screen.queryByText(/fonte oficial/i)).toBeNull();
  });
});

describe("BlockForm aceita o tipo inicial pela URL (Goal069 §1)", () => {
  test("?type=PERSONAL abre com Compromisso pessoal selecionado", async () => {
    window.history.pushState({}, "", "/agenda/bloquear?type=PERSONAL");
    renderPage(<BlockTimePage />);

    expect(
      await screen.findByRole("radio", { name: /Compromisso pessoal/ }),
    ).toBeChecked();
  });

  test("sem type na URL, abre em Bloqueio operacional (o padrão de hoje)", async () => {
    window.history.pushState({}, "", "/agenda/bloquear");
    renderPage(<BlockTimePage />);

    expect(
      await screen.findByRole("radio", { name: /Bloqueio operacional/ }),
    ).toBeChecked();
  });

  test("?type=BLOCK abre em Bloqueio operacional explicitamente", async () => {
    window.history.pushState({}, "", "/agenda/bloquear?type=BLOCK");
    renderPage(<BlockTimePage />);

    expect(
      await screen.findByRole("radio", { name: /Bloqueio operacional/ }),
    ).toBeChecked();
  });
});
