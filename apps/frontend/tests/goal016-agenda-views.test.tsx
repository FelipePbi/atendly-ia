// @vitest-environment jsdom
/**
 * Goal016 (WU-04): provas renderizadas de Dia, Semana e Mês com ocupação
 * honesta — alternância visível com a escolha marcada por `aria-selected`
 * (nunca só por cor), seleção no Mês abrindo o Dia, atendimento/bloqueio/
 * compromisso pessoal/exceção/buffer distinguíveis por texto, cancelado fora
 * da grade e falta distinto de confirmado sem ocupar buffer, e o retry do
 * erro de carregamento realmente saindo do erro (review015).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  Appointment,
  AvailabilityException,
  CalendarState,
  TimeBlock,
} from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listTimeBlocks = vi.fn();
const listAvailabilityExceptions = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
    },
  }),
}));

const today = new Date();
const ISO_TODAY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

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

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Ana Paula", phone: "+5511999990000" },
    customerId: "c1",
    date: ISO_TODAY,
    durationMinutes: 60,
    endTime: "11:00",
    finalValue: null,
    id: "apt-1",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [
      {
        durationMinutes: 60,
        name: "Corte feminino",
        price: 90,
        priceType: "FIXED",
        serviceId: "s1",
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

function timeBlockFixture(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    // 15:00–16:00 UTC == 12:00–13:00 em America/Sao_Paulo (UTC-3, sem DST).
    endAt: `${ISO_TODAY}T16:00:00.000Z`,
    id: "block-1",
    kind: "BLOCK",
    reason: "Almoço",
    seriesId: null,
    startAt: `${ISO_TODAY}T15:00:00.000Z`,
    title: null,
    ...overrides,
  };
}

function exceptionFixture(
  overrides: Partial<AvailabilityException> = {},
): AvailabilityException {
  return {
    available: false,
    date: ISO_TODAY,
    decidedBy: null,
    decidedReason: null,
    endTime: null,
    id: "exc-1",
    reason: "Feriado local",
    startTime: null,
    ...overrides,
  };
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  getCalendar.mockReset();
  listAppointments.mockReset();
  listTimeBlocks.mockReset();
  listAvailabilityExceptions.mockReset();
  // Goal073: Automática abre em Semana a partir de 1024px (o padrão do
  // jsdom); esta suíte é sobre Dia/Semana/Mês alternáveis, não sobre a
  // largura, então fixa a viewport abaixo do corte para manter Dia como
  // abertura inicial, como antes do Goal073.
  window.innerWidth = 390;
});

function renderBoard() {
  return render(
    <ShellConfigProvider>
      <AgendaBoard />
    </ShellConfigProvider>,
  );
}

describe("Dia, Semana e Mês alternáveis", () => {
  test("a escolha da visualização fica marcada por aria-selected; no Mês o primeiro toque seleciona o dia e o segundo abre o Dia", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([appointmentFixture()]);
    listTimeBlocks.mockResolvedValue([]);
    listAvailabilityExceptions.mockResolvedValue([]);
    const user = userEvent.setup();

    renderBoard();

    const dayTab = await screen.findByRole("tab", { name: "Dia" });
    const weekTab = screen.getByRole("tab", { name: "Semana" });
    const monthTab = screen.getByRole("tab", { name: "Mês" });
    expect(dayTab).toHaveAttribute("aria-selected", "true");
    expect(weekTab).toHaveAttribute("aria-selected", "false");
    expect(monthTab).toHaveAttribute("aria-selected", "false");
    expect((await screen.findAllByText("Ana Paula")).length).toBeGreaterThan(0);

    await user.click(weekTab);
    expect(weekTab).toHaveAttribute("aria-selected", "true");
    expect(dayTab).toHaveAttribute("aria-selected", "false");
    expect(
      await screen.findByRole("region", { name: "Mapa da semana" }),
    ).toBeVisible();

    await user.click(monthTab);
    expect(monthTab).toHaveAttribute("aria-selected", "true");
    const monthGrid = await screen.findByRole("region", {
      name: "Mapa do mês",
    });
    const todayCell = within(monthGrid).getByRole("button", {
      current: "date",
    });

    // Goal100: o primeiro toque num dia diferente só o seleciona (aria-pressed)
    // e a visualização segue no Mês; tocar no dia já marcado abre o Dia.
    const otherCell = within(monthGrid)
      .getAllByRole("button")
      .find(
        (cell) =>
          cell !== todayCell && cell.getAttribute("aria-pressed") === "false",
      ) as HTMLElement;
    await user.click(otherCell);
    expect(otherCell).toHaveAttribute("aria-pressed", "true");
    expect(monthTab).toHaveAttribute("aria-selected", "true");
    expect(dayTab).toHaveAttribute("aria-selected", "false");

    await user.click(todayCell);
    expect(todayCell).toHaveAttribute("aria-pressed", "true");
    expect(monthTab).toHaveAttribute("aria-selected", "true");

    await user.click(todayCell);

    expect(dayTab).toHaveAttribute("aria-selected", "true");
    expect(monthTab).toHaveAttribute("aria-selected", "false");
    expect((await screen.findAllByText("Ana Paula")).length).toBeGreaterThan(0);
  });

  /**
   * Rodada 3, blocker 1: `changeView` disparava `setLoading(true)` mesmo
   * quando a aba clicada já era a ativa. Como nem `view` nem `cursor` mudavam,
   * o `useEffect` que busca a janela nunca reexecutava e nada tirava a tela do
   * esqueleto — carregamento permanente. A correção sai cedo quando
   * `nextView === view`; este teste clica na aba já ativa e afirma que o
   * conteúdo carregado continua visível, sem o esqueleto preso.
   */
  test("clicar na aba já ativa não prende a tela no esqueleto de carregamento", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([appointmentFixture()]);
    listTimeBlocks.mockResolvedValue([]);
    listAvailabilityExceptions.mockResolvedValue([]);
    const user = userEvent.setup();

    renderBoard();

    const dayTab = await screen.findByRole("tab", { name: "Dia" });
    expect((await screen.findAllByText("Ana Paula")).length).toBeGreaterThan(0);

    await user.click(dayTab);

    expect(
      screen.queryByLabelText("Carregando agenda"),
    ).not.toBeInTheDocument();
    expect((await screen.findAllByText("Ana Paula")).length).toBeGreaterThan(0);
  });
});

describe("ocupação honesta da grade", () => {
  test("atendimento, buffer, bloqueio, compromisso pessoal e exceção aparecem com rótulos distintos", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([
      appointmentFixture({ bufferAfterMinutes: 10, bufferBeforeMinutes: 15 }),
    ]);
    listTimeBlocks.mockResolvedValue([
      timeBlockFixture(),
      timeBlockFixture({
        endAt: `${ISO_TODAY}T19:00:00.000Z`,
        id: "block-2",
        kind: "PERSONAL",
        reason: null,
        startAt: `${ISO_TODAY}T18:00:00.000Z`,
        title: "Dentista",
      }),
    ]);
    listAvailabilityExceptions.mockResolvedValue([exceptionFixture()]);

    renderBoard();

    // Goal092: o Dia é a lista do quadro A1. Cada tipo tem o texto do quadro
    // (o rótulo "Atendimento"/"Buffer" da grade saiu), e só o intervalo
    // depois do atendimento é listado.
    const appointmentRow = (await screen.findByText("Ana Paula")).closest(
      ".agenda-day-row",
    );
    expect(appointmentRow).toHaveTextContent("Corte feminino · 1 h");
    expect(screen.getAllByText(/^intervalo · /)).toHaveLength(1);
    expect(screen.getByText("intervalo · 10 min")).toBeVisible();
    expect(
      screen.getByText("Almoço").closest(".agenda-day-row"),
    ).toHaveTextContent("bloqueio · 1 h");
    expect(
      screen.getByText("Dentista").closest(".agenda-day-row"),
    ).toHaveTextContent("compromisso pessoal · 1 h");
    expect(
      screen.getByText("Indisponível").closest(".agenda-day-row"),
    ).toHaveTextContent("exceção · indisponibilidade");
    expect(screen.getByText("Feriado local")).toBeVisible();
  });

  test("cancelado não ocupa a grade; falta aparece distinto e sem gerar buffer", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: { id: "cx", name: "Bia Castro", phone: null },
        id: "apt-cancelled",
        status: "CANCELLED",
      }),
      appointmentFixture({
        bufferAfterMinutes: 10,
        bufferBeforeMinutes: 10,
        customer: { id: "cy", name: "Carla Nunes", phone: null },
        endTime: "14:00",
        id: "apt-noshow",
        startTime: "13:00",
        status: "NO_SHOW",
      }),
    ]);
    listTimeBlocks.mockResolvedValue([]);
    listAvailabilityExceptions.mockResolvedValue([]);

    renderBoard();

    expect(await screen.findByText("Carla Nunes")).toBeVisible();
    expect(screen.getByText("Não compareceu")).toBeVisible();
    expect(screen.queryByText("Bia Castro")).not.toBeInTheDocument();
    expect(screen.queryByText(/^intervalo · /)).not.toBeInTheDocument();
  });

  test("nenhum campo ausente do read model é fabricado: cliente e serviço ausentes mostram o texto genérico do produto", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([
      appointmentFixture({ customer: null, customerId: null, services: [] }),
    ]);
    listTimeBlocks.mockResolvedValue([]);
    listAvailabilityExceptions.mockResolvedValue([]);

    renderBoard();

    expect(
      (await screen.findAllByText("Cliente não identificado")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Serviço não informado/).length).toBeGreaterThan(
      0,
    );
  });
});

describe("Dia em ordem cronológica", () => {
  /**
   * Goal092: o Dia deixou de ser a grade de horas (`--start`/`--span`, uma
   * hora por 72px) e virou a lista cronológica do quadro A1. A prova de
   * posição passa a ser a ordem de início e o horário escrito em cada linha.
   */
  test("cada entrada do Dia é uma linha com o horário de início, em ordem de início", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([appointmentFixture()]);
    listTimeBlocks.mockResolvedValue([timeBlockFixture()]);
    listAvailabilityExceptions.mockResolvedValue([]);

    renderBoard();

    const daySection = await screen.findByLabelText(/Agenda de/);
    // Atendimento 10:00–11:00, bloqueio 12:00–13:00 no fuso do negócio.
    const appointment = within(daySection).getByRole("link", {
      name: /Ana Paula/,
    });
    expect(within(appointment).getByText("10:00")).toBeVisible();
    const block = within(daySection).getByRole("button", { name: /Almoço/ });
    expect(within(block).getByText("12:00")).toBeVisible();
    expect(
      appointment.compareDocumentPosition(block) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("evento fora do horário comercial entra na lista com o próprio horário, sem ser empurrado para a borda", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([
      appointmentFixture({ endTime: "07:00", startTime: "06:00" }),
    ]);
    listTimeBlocks.mockResolvedValue([]);
    listAvailabilityExceptions.mockResolvedValue([]);

    renderBoard();

    const daySection = await screen.findByLabelText(/Agenda de/);
    const appointment = within(daySection).getByRole("link", {
      name: /Ana Paula/,
    });
    expect(within(appointment).getByText("06:00")).toBeVisible();
  });

  test("entradas sobrepostas aparecem as duas, cada uma na sua linha e em ordem de início", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([
      appointmentFixture(),
      appointmentFixture({
        customer: { id: "c2", name: "Bia Castro", phone: null },
        endTime: "11:30",
        id: "apt-2",
        startTime: "10:30",
      }),
    ]);
    listTimeBlocks.mockResolvedValue([]);
    listAvailabilityExceptions.mockResolvedValue([]);

    renderBoard();

    const daySection = await screen.findByLabelText(/Agenda de/);
    const first = within(daySection).getByRole("link", { name: /Ana Paula/ });
    const second = within(daySection).getByRole("link", { name: /Bia Castro/ });
    expect(first).not.toBe(second);
    expect(first.closest("li")).not.toBe(second.closest("li"));
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /**
   * Rodada 3, blocker 2: o Dia usava `entries` sem filtrar por data, então um
   * bloqueio que atravessa a meia-noite — iniciado no dia anterior e com
   * `date` fixada no dia de início (`timeBlockEntries`) — vazava para o dia
   * seguinte na posição de início (ex.: 23:00) mesmo sem pertencer a ele.
   * `entriesForDate` corrige isso; este teste afirma as duas pontas: o
   * bloqueio não aparece no dia seguinte, e aparece no dia de início truncado
   * à virada.
   */
  test("bloqueio que atravessa a meia-noite não vaza para o dia seguinte", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([]);
    listTimeBlocks.mockResolvedValue([
      timeBlockFixture({
        // 23:00 do dia anterior até 00:30 de ISO_TODAY em America/Sao_Paulo
        // (UTC-3): a virada cai dentro do bloco.
        endAt: `${ISO_TODAY}T03:30:00.000Z`,
        id: "block-midnight",
        reason: "Manutenção noturna",
        startAt: `${ISO_TODAY}T02:00:00.000Z`,
      }),
    ]);
    listAvailabilityExceptions.mockResolvedValue([]);
    const user = userEvent.setup();

    renderBoard();

    const todaySection = await screen.findByLabelText(/Agenda de/);
    expect(
      within(todaySection).queryByText("Manutenção noturna"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dia anterior" }));

    const yesterdaySection = await screen.findByLabelText(/Agenda de/);
    const block = within(yesterdaySection).getByRole("button", {
      name: /Manutenção noturna/,
    });
    expect(within(block).getByText("23:00")).toBeVisible();
  });
});

describe("carregando, vazio e erro recuperável", () => {
  test("mostra o esqueleto de carregamento antes da resposta", async () => {
    getCalendar.mockReturnValue(new Promise(() => undefined));
    listAppointments.mockReturnValue(new Promise(() => undefined));
    listTimeBlocks.mockReturnValue(new Promise(() => undefined));
    listAvailabilityExceptions.mockReturnValue(new Promise(() => undefined));

    renderBoard();

    // O esqueleto só aparece se a carga passar de ~150 ms (D-168).
    expect(
      await screen.findByLabelText("Carregando agenda"),
    ).toBeInTheDocument();
  });

  test("dia sem eventos mostra o vazio, não uma grade fabricada", async () => {
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([]);
    listTimeBlocks.mockResolvedValue([]);
    listAvailabilityExceptions.mockResolvedValue([]);

    renderBoard();

    // Goal069 §2: "Nenhum evento neste dia." virou "Nenhum atendimento neste
    // dia.", a mesma copy do dia vazio com contexto de disponibilidade.
    expect(
      await screen.findByText("Nenhum atendimento neste dia."),
    ).toBeVisible();
  });

  test("recarregar com sucesso tira a tela do painel de erro", async () => {
    getCalendar
      .mockRejectedValueOnce(new Error("falha de rede"))
      .mockResolvedValue(calendarFixture());
    listAppointments.mockResolvedValue([]);
    listTimeBlocks.mockResolvedValue([]);
    listAvailabilityExceptions.mockResolvedValue([]);
    const user = userEvent.setup();

    renderBoard();

    // Falha de rede mostra a mensagem do produto, nunca o erro tecnico
    // cru (2026-10-12: "Internal server error." aparecia na Agenda).
    expect(
      await screen.findByText(
        /Não foi possível carregar a agenda\. Tente novamente em instantes\./,
      ),
    ).toBeVisible();
    expect(screen.queryByText("falha de rede")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByText("Nenhum atendimento neste dia."),
    ).toBeVisible();
    expect(screen.queryByText("falha de rede")).toBeNull();
  });
});
