// @vitest-environment jsdom
/**
 * Validação de 2026-10-12, Agenda › Semana no desktop: clicar num atendimento
 * não fazia nada, e clicar numa hora vazia da grade também não. Agora:
 *
 *  1. o cartão do atendimento é um link para o mesmo detalhe do Dia e do Mês
 *     (`/agenda/agendamento?id=`), por clique e por Enter;
 *  2. o cartão de bloqueio abre as ações da ocorrência, como no Dia;
 *  3. a hora vazia é um botão que abre a folha do "Novo" com o dia (e, para
 *     bloqueio e compromisso, a hora) levados ao formulário, por clique e Enter;
 *  4. os formulários aceitam esse dia/hora como sugestão inicial.
 *
 * Relógio fixo: terça 29/09/2026, 12:00. Semana de 28/09 a 04/10.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Appointment, CalendarState, TimeBlock } from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { BlockForm } from "@/features/agenda/BlockForm";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const getAgendaViewPreference = vi.fn();
const getSettings = vi.fn();
const listCatalog = vi.fn();
const listCustomers = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  useProductRuntime: () => ({ session: null }),
  getProductServices: () => ({
    calendar: {
      getAvailability: () => Promise.resolve([]),
      getCalendar,
      listAppointmentEvents: () => Promise.resolve([]),
      listAppointmentNotifications: () => Promise.resolve([]),
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
    },
    customers: { list: listCustomers },
    serviceCatalog: { list: listCatalog },
    settings: { get: getSettings, getAgendaViewPreference },
  }),
}));

function calendarFixture(
  capabilities: Partial<CalendarState["capabilities"]> = {},
): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: false,
      ...capabilities,
    },
    integration: null,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  };
}

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Amanda Guntzel", phone: null },
    customerId: "c1",
    date: "2026-09-29",
    durationMinutes: 60,
    endTime: "11:00",
    finalValue: null,
    id: "apt-amanda",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [
      {
        durationMinutes: 60,
        name: "Manutenção 5D",
        price: 90,
        priceType: "FIXED",
        serviceId: "s-5d",
      },
    ],
    source: "USER",
    startTime: "10:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
    ...overrides,
  };
}

function blockFixture(): TimeBlock {
  // 15:00–16:00 UTC == 12:00–13:00 em America/Sao_Paulo.
  return {
    endAt: "2026-09-29T16:00:00.000Z",
    id: "block-1",
    kind: "BLOCK",
    reason: null,
    seriesId: null,
    startAt: "2026-09-29T15:00:00.000Z",
    title: "Almoço",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 1140;
  window.history.pushState({}, "", "/agenda");
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0));
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([
    appointmentFixture(),
    appointmentFixture({
      customer: { id: "c2", name: "Bia Castro", phone: null },
      customerId: "c2",
      date: "2026-09-30",
      endTime: "09:30",
      id: "apt-bia",
      startTime: "09:00",
    }),
  ]);
  listAvailabilityExceptions.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([blockFixture()]);
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [],
    initialView: "WEEK",
  });
  getSettings.mockResolvedValue({ availability: { rules: [] } });
  listCatalog.mockResolvedValue({ items: [] });
  listCustomers.mockResolvedValue({
    items: [],
    managedExternally: false,
    source: "AVENLY",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

function renderBoard() {
  return render(
    <ShellConfigProvider>
      <AgendaBoard />
    </ShellConfigProvider>,
  );
}

async function openWeek(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "Mapa da semana" });
}

/** Captura o clique que chega a um link, sem deixar o jsdom tentar navegar. */
function captureLinkClicks(): string[] {
  const hrefs: string[] = [];
  document.addEventListener(
    "click",
    (event) => {
      const link = (event.target as Element | null)?.closest("a");
      if (!link) return;
      event.preventDefault();
      hrefs.push(link.getAttribute("href") ?? "");
    },
    { capture: true },
  );
  return hrefs;
}

describe("1 — o cartão do atendimento abre o detalhe dele", () => {
  test("clique leva ao detalhe do atendimento certo", async () => {
    const user = setup();
    renderBoard();
    const week = await openWeek();
    const card = within(week).getByRole("link", {
      name: /^Atendimento: Amanda Guntzel, Manutenção 5D/,
    });
    // O cartão leva a origem: o "voltar" do detalhe volta ao dia dele (D-167).
    expect(card).toHaveAttribute(
      "href",
      "/agenda/agendamento?id=apt-amanda&voltar=%2Fagenda%3Fdia%3D2026-09-29",
    );
    expect(
      within(week).getByRole("link", { name: /^Atendimento: Bia Castro/ }),
    ).toHaveAttribute(
      "href",
      "/agenda/agendamento?id=apt-bia&voltar=%2Fagenda%3Fdia%3D2026-09-30",
    );

    const clicked = captureLinkClicks();
    await user.click(card);
    expect(clicked).toEqual([
      "/agenda/agendamento?id=apt-amanda&voltar=%2Fagenda%3Fdia%3D2026-09-29",
    ]);
  });

  test("teclado: o cartão recebe foco e Enter abre o mesmo detalhe", async () => {
    const user = setup();
    renderBoard();
    const week = await openWeek();
    const card = within(week).getByRole("link", { name: /Amanda Guntzel/ });

    const clicked = captureLinkClicks();
    card.focus();
    expect(card).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(clicked).toEqual([
      "/agenda/agendamento?id=apt-amanda&voltar=%2Fagenda%3Fdia%3D2026-09-29",
    ]);
  });
});

describe("2 — o cartão de bloqueio abre as ações da ocorrência, como no Dia", () => {
  // Desde 2026-10-12 as ações abrem numa folha modal, não embutidas abaixo da grade.
  test("clique abre a folha; Esc fecha e devolve o foco; Enter também abre", async () => {
    const user = setup();
    renderBoard();
    const week = await openWeek();
    const block = within(week).getByRole("button", {
      name: /^Bloqueio: Almoço/,
    });
    expect(block).toHaveAttribute("aria-pressed", "false");

    await user.click(block);
    expect(
      screen.getByRole("dialog", { name: "Ações de Bloqueio operacional" }),
    ).toBeVisible();
    expect(block).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Ações de Bloqueio operacional" }),
    ).toBeNull();
    expect(block).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("dialog", { name: "Ações de Bloqueio operacional" }),
    ).toBeVisible();
  });

  /**
   * Pedido de 2026-10-12: as ações do bloqueio (e do compromisso pessoal)
   * apareciam num painel embutido entre a grade e o cartão do dia. Agora
   * abrem na mesma folha modal do "Novo": foco preso nela, Esc, toque fora e
   * "Fechar" fecham, e o foco volta ao bloco.
   */
  test("na Semana, o bloqueio abre um diálogo com as ações, nada embutido abaixo da grade", async () => {
    const user = setup();
    const { container } = renderBoard();
    const week = await openWeek();
    const block = within(week).getByRole("button", {
      name: /^Bloqueio: Almoço/,
    });

    await user.click(block);
    const dialog = screen.getByRole("dialog", {
      name: "Ações de Bloqueio operacional",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(within(dialog).getByText("Bloqueio operacional")).toBeVisible();
    expect(
      within(dialog).getByRole("heading", { name: "Esta ocorrência" }),
    ).toBeVisible();
    expect(within(dialog).getByText(/^Afeta só/)).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Remover esta ocorrência" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Mover esta ocorrência" }),
    ).toBeVisible();
    // Nada embutido: nem região de ações, nem o conteúdo fora da folha.
    expect(screen.queryByRole("region", { name: /^Ações de/ })).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Esta ocorrência" })).toEqual(
      [within(dialog).getByRole("heading", { name: "Esta ocorrência" })],
    );
    expect(week).not.toContainElement(dialog);
    await expectNoA11yViolations(container);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(block).toHaveFocus();

    await user.click(block);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(block).toHaveFocus();

    await user.click(block);
    // Toque fora da folha (no fundo escurecido) fecha.
    await user.pointer({
      keys: "[MouseLeft]",
      target: screen.getByRole("dialog").parentElement!,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("no Dia, o compromisso pessoal abre a mesma folha", async () => {
    listTimeBlocks.mockResolvedValue([
      { ...blockFixture(), kind: "PERSONAL", title: "Dentista" },
    ]);
    const user = setup();
    renderBoard();
    await openWeek();
    await user.click(screen.getByRole("tab", { name: "Dia" }));
    const block = await screen.findByRole("button", { name: /Dentista/ });

    await user.click(block);
    const dialog = screen.getByRole("dialog", {
      name: "Ações de Compromisso pessoal",
    });
    expect(
      within(dialog).getByRole("button", { name: "Remover esta ocorrência" }),
    ).toBeVisible();
    expect(screen.queryByRole("region", { name: /^Ações de/ })).toBeNull();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(block).toHaveFocus();
  });

  test("sem permissão de gerenciar disponibilidade o bloqueio fica só leitura", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({ manageAvailability: false }),
    );
    renderBoard();
    const week = await openWeek();
    expect(within(week).getByLabelText(/^Bloqueio: Almoço/).tagName).toBe(
      "DIV",
    );
  });
});

describe('3 — a hora vazia abre o "Novo" com dia e hora', () => {
  test("clique abre a folha do Novo com o dia no agendamento e dia e hora no bloqueio", async () => {
    const user = setup();
    renderBoard();
    const week = await openWeek();

    await user.click(
      within(week).getByRole("button", {
        name: "Novo às 15:00, quarta-feira, 30 de setembro",
      }),
    );

    const sheet = screen.getByRole("dialog", {
      name: "O que você quer adicionar?",
    });
    expect(
      within(sheet).getByRole("link", { name: "Agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo?date=2026-09-30");
    // Desde 2026-10-12 (D-169) bloqueio, compromisso e dia fechado são uma
    // linha só, "Bloquear horário", que leva o dia e a hora.
    expect(
      within(sheet).getByRole("link", { name: "Bloquear horário" }),
    ).toHaveAttribute("href", "/agenda/bloquear?date=2026-09-30&time=15%3A00");
  });

  test("teclado: Enter na hora abre a folha e Esc devolve o foco para a hora", async () => {
    const user = setup();
    renderBoard();
    const week = await openWeek();
    const slot = within(week).getByRole("button", {
      name: "Novo às 08:00, segunda-feira, 28 de setembro",
    });

    slot.focus();
    await user.keyboard("{Enter}");
    const sheet = screen.getByRole("dialog", {
      name: "O que você quer adicionar?",
    });
    expect(
      within(sheet).getByRole("link", { name: "Agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo?date=2026-09-28");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(slot).toHaveFocus();
  });

  test("o botão Novo continua abrindo a folha sem dia nem hora", async () => {
    const user = setup();
    renderBoard();
    await openWeek();

    await user.click(screen.getByRole("button", { name: "Novo" }));
    const sheet = screen.getByRole("dialog", {
      name: "O que você quer adicionar?",
    });
    expect(
      within(sheet).getByRole("link", { name: "Agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo");
    expect(
      within(sheet).getByRole("link", { name: "Bloquear horário" }),
    ).toHaveAttribute("href", "/agenda/bloquear");
  });

  test("sem permissão de criar nada, a grade não oferece horas clicáveis", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({ createAppointments: false, manageAvailability: false }),
    );
    renderBoard();
    const week = await openWeek();
    expect(within(week).queryByRole("button", { name: /^Novo às/ })).toBeNull();
  });

  test("a Semana clicável passa no axe", async () => {
    const { container } = renderBoard();
    await openWeek();
    await expectNoA11yViolations(container);
  });
});

describe("4 — os formulários recebem o dia e a hora como sugestão", () => {
  test("Bloqueio: data, início e fim de uma hora vindos da Semana", async () => {
    window.history.pushState(
      {},
      "",
      "/agenda/bloquear?type=BLOCK&date=2026-09-30&time=15%3A00",
    );
    render(
      <ShellConfigProvider>
        <BlockForm />
      </ShellConfigProvider>,
    );

    expect(await screen.findByLabelText("Data")).toHaveValue("30/09/2026");
    expect(screen.getByLabelText("Início")).toHaveValue("15:00");
    expect(screen.getByLabelText("Fim")).toHaveValue("16:00");
  });

  test("Agendamento: o dia vindo da Semana chega escolhido", async () => {
    // Revelação progressiva (pedido de 2026-10-12, D-170): a Data aparece
    // depois do serviço, já com o dia vindo da Semana escolhido.
    listCatalog.mockResolvedValue({
      items: [
        {
          active: true,
          bufferAfterMinutes: 0,
          bufferBeforeMinutes: 0,
          durationMinutes: 30,
          id: "svc-escova",
          name: "Escova",
          needsReview: false,
          price: 60,
          priceType: "FIXED",
        },
      ],
    });
    listCustomers.mockResolvedValue({
      items: [{ id: "c1", name: "Ana Paula", phone: null }],
      managedExternally: false,
      source: "AVENLY",
    });
    render(
      <ShellConfigProvider>
        <AppointmentForm customerId="c1" initialDate="2026-10-01" />
      </ShellConfigProvider>,
    );
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Escova/ }),
    );

    expect(
      await screen.findByRole("gridcell", {
        name: /^Quinta-feira, 1 de outubro de 2026/,
      }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
