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

/** A folha do quadro A4 (Goal118) tomou o lugar do menu suspenso de "Novo". */
const SHEET = "O que você quer adicionar?";

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
    source: "AVENLY",
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

  // Pedido de 2026-10-12 (D-169): bloqueio, compromisso pessoal e exceção
  // do dia viraram uma linha só, "Bloquear horário".
  test("o menu '+ Novo' lista Agendamento e Bloquear horário, cada um com seu destino", async () => {
    const user = userEvent.setup();
    renderPage(<AgendaPage />);
    await screen.findByText("Nenhum atendimento neste dia.");

    await user.click(screen.getByRole("button", { name: "Novo" }));
    const menu = screen.getByRole("dialog", { name: SHEET });

    expect(
      within(menu).getByRole("link", { name: "Agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo");
    expect(
      within(menu).getByRole("link", { name: "Bloquear horário" }),
    ).toHaveAttribute("href", "/agenda/bloquear");
    expect(within(menu).getAllByRole("link")).toHaveLength(2);
  });

  test("Escape fecha o menu e devolve o foco ao botão 'Novo'", async () => {
    const user = userEvent.setup();
    renderPage(<AgendaPage />);
    await screen.findByText("Nenhum atendimento neste dia.");

    const trigger = screen.getByRole("button", { name: "Novo" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: SHEET })).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
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
    const menu = screen.getByRole("dialog", { name: SHEET });
    expect(
      within(menu).queryByRole("link", { name: "Agendamento" }),
    ).toBeNull();
    expect(
      within(menu).getByRole("link", { name: "Bloquear horário" }),
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

  test("fechar o dia continua alcançável pelo menu e some sem manageAvailability", async () => {
    // Goal092: o botão solto "Exceções do dia" virou o item "Exceção do dia"
    // do menu "Novo"; desde D-169 (2026-10-12) fechar o dia é um tipo de
    // "Bloquear horário".
    const user = userEvent.setup();
    const first = renderPage(<AgendaPage />);
    await user.click(await screen.findByRole("button", { name: "Novo" }));
    expect(
      within(screen.getByRole("dialog", { name: SHEET })).getByRole("link", {
        name: "Bloquear horário",
      }),
    ).toHaveAttribute("href", "/agenda/bloquear");
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
      within(screen.getByRole("dialog", { name: SHEET })).queryByRole("link", {
        name: "Bloquear horário",
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
  // Desde a tela única de 2026-10-12 (D-169), `?type=` pré-configura as duas
  // chaves: PERSONAL liga "É um compromisso pessoal" (com "Título e motivo"
  // aberto), CLOSED liga "Dia inteiro"; BLOCK ou nada é a pausa no
  // atendimento, com as duas desligadas.
  test("?type=PERSONAL abre com a chave de compromisso pessoal ligada", async () => {
    window.history.pushState({}, "", "/agenda/bloquear?type=PERSONAL");
    renderPage(<BlockTimePage />);

    expect(
      await screen.findByRole("switch", { name: "É um compromisso pessoal" }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Confirmar compromisso" }),
    ).toBeVisible();
  });

  test("sem type na URL, abre em Bloqueio operacional (o padrão de hoje)", async () => {
    window.history.pushState({}, "", "/agenda/bloquear");
    renderPage(<BlockTimePage />);

    expect(
      await screen.findByRole("button", { name: "Confirmar bloqueio" }),
    ).toBeVisible();
    expect(
      screen.getByRole("switch", { name: "Dia inteiro" }),
    ).not.toBeChecked();
  });

  test("?type=BLOCK abre em Bloqueio operacional explicitamente", async () => {
    window.history.pushState({}, "", "/agenda/bloquear?type=BLOCK");
    renderPage(<BlockTimePage />);

    expect(
      await screen.findByRole("button", { name: "Confirmar bloqueio" }),
    ).toBeVisible();
    expect(
      screen.getByRole("switch", { name: "Dia inteiro" }),
    ).not.toBeChecked();
  });
});
