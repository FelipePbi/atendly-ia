// @vitest-environment jsdom
/**
 * Goal100 (WU-03): provas da Semana como mapa (A10) e do Mês como pilha de
 * traços (A11) — cor do serviço lida do catálogo, horas fora do horário
 * rebaixadas a partir de `availability.rules`, linha da semana com contagem e
 * legenda, primeiro toque no Mês seleciona e o segundo abre o Dia, cartão de
 * resumo do dia e pílula de dias visíveis que leva a Configurações › Agenda.
 *
 * Relógio fixo: terça 29/09/2026, 12:00. Semana de 28/09 a 04/10.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  Appointment,
  CalendarState,
  ServiceColorToken,
  TimeBlock,
} from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const getAgendaViewPreference = vi.fn();
const getSettings = vi.fn();
const listCatalog = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  useProductRuntime: () => ({ session: null }),
  getProductServices: () => ({
    calendar: {
      getCalendar,
      listAppointmentEvents: () => Promise.resolve([]),
      listAppointmentNotifications: () => Promise.resolve([]),
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
    },
    serviceCatalog: { list: listCatalog },
    settings: { get: getSettings, getAgendaViewPreference },
  }),
}));

function calendarFixture(): CalendarState {
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
  };
}

function serviceEntry(
  serviceId: string,
  name: string,
  durationMinutes = 60,
): Appointment["services"][number] {
  return {
    durationMinutes,
    name,
    price: 90,
    priceType: "FIXED",
    serviceId,
  };
}

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Ana Paula", phone: "5511998887766" },
    customerId: "c1",
    date: "2026-09-29",
    durationMinutes: 60,
    endTime: "11:00",
    finalValue: null,
    id: "apt-1",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [serviceEntry("s-violet", "Corte feminino")],
    source: "USER",
    startTime: "10:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
    ...overrides,
  };
}

function customerOf(id: string, name: string): Appointment["customer"] {
  return { id, name, phone: null };
}

function timeBlockFixture(overrides: Partial<TimeBlock> = {}): TimeBlock {
  // 15:00–16:00 UTC == 12:00–13:00 em America/Sao_Paulo.
  return {
    endAt: "2026-09-29T16:00:00.000Z",
    id: "block-1",
    kind: "BLOCK",
    reason: null,
    seriesId: null,
    startAt: "2026-09-29T15:00:00.000Z",
    title: "Almoço",
    ...overrides,
  };
}

function personalFixture(): TimeBlock {
  // 18:00–19:00 UTC == 15:00–16:00 em America/Sao_Paulo.
  return timeBlockFixture({
    endAt: "2026-09-29T19:00:00.000Z",
    id: "block-2",
    kind: "PERSONAL",
    startAt: "2026-09-29T18:00:00.000Z",
    title: "Dentista",
  });
}

function catalogItem(id: string, colorToken: ServiceColorToken | null) {
  return { colorToken, id, name: id };
}

function rule(dayOfWeek: number, startTime: string, endTime: string) {
  return { active: true, dayOfWeek, endTime, startTime };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 390;
  window.history.pushState({}, "", "/agenda");
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0));
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [],
    initialView: null,
  });
  getSettings.mockResolvedValue({ availability: { rules: [] } });
  listCatalog.mockResolvedValue({
    items: [
      catalogItem("s-violet", "VIOLET"),
      catalogItem("s-amber", "AMBER"),
      catalogItem("s-slate", "SLATE"),
      catalogItem("s-plain", null),
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderBoard() {
  return render(
    <ShellConfigProvider>
      <AgendaBoard />
    </ShellConfigProvider>,
  );
}

function setup() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

async function openWeek(user: ReturnType<typeof setup>): Promise<HTMLElement> {
  await user.click(await screen.findByRole("tab", { name: "Semana" }));
  return screen.findByRole("region", { name: "Mapa da semana" });
}

async function openMonth(user: ReturnType<typeof setup>): Promise<HTMLElement> {
  await user.click(await screen.findByRole("tab", { name: "Mês" }));
  return screen.findByRole("region", { name: "Mapa do mês" });
}

function barOf(week: HTMLElement, label: RegExp): HTMLElement {
  return within(week).getByLabelText(label);
}

function barColors(bar: HTMLElement): Array<string | null> {
  return Array.from(bar.querySelectorAll(".week-bar-stripe b")).map((part) =>
    part.getAttribute("data-color"),
  );
}

function dayCell(month: HTMLElement, label: RegExp): HTMLElement {
  return within(month).getByRole("button", { name: label });
}

function stripeColors(cell: HTMLElement): Array<Array<string | null>> {
  return Array.from(cell.querySelectorAll(".month-stripe")).map((stripe) =>
    Array.from(stripe.querySelectorAll("b")).map((part) =>
      part.getAttribute("data-color"),
    ),
  );
}

function summaryCard(): HTMLElement {
  return screen.getByRole("region", { name: "Resumo do dia" });
}

describe("1 — a Semana colore a barra com o serviço do catálogo", () => {
  test("token do serviço por atendimento, barra dividida com dois serviços, bloqueio e compromisso com classe de tipo e prefixo no nome acessível", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: customerOf("c1", "Ana Paula"),
        date: "2026-09-28",
        id: "apt-violet",
      }),
      appointmentFixture({
        customer: customerOf("c2", "Bia Castro"),
        endTime: "15:00",
        id: "apt-two",
        services: [
          serviceEntry("s-violet", "Corte feminino", 30),
          serviceEntry("s-amber", "Escova", 30),
        ],
        startTime: "14:00",
      }),
    ]);
    listTimeBlocks.mockResolvedValue([timeBlockFixture(), personalFixture()]);
    const user = setup();
    renderBoard();

    const week = await openWeek(user);
    await vi.waitFor(() =>
      expect(barColors(barOf(week, /Ana Paula/))).toEqual(["VIOLET"]),
    );
    const two = barOf(week, /Bia Castro/);
    expect(barColors(two)).toEqual(["VIOLET", "AMBER"]);
    expect(two.querySelector(".week-bar-stripe")).toHaveClass("is-split");

    const block = barOf(week, /^Bloqueio: Almoço/);
    expect(block).toHaveClass("week-bar", "is-block");
    const personal = barOf(week, /^Compromisso pessoal: Dentista/);
    expect(personal).toHaveClass("week-bar", "is-personal");
    expect(block.querySelector(".week-bar-stripe")).toBeNull();
    expect(personal.querySelector(".week-bar-stripe")).toBeNull();
  });

  test("serviço sem cor no catálogo dá barra neutra, com as outras barras na tela", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: customerOf("c1", "Ana Paula"),
        id: "apt-plain",
        services: [serviceEntry("s-plain", "Corte masculino")],
      }),
      appointmentFixture({
        customer: customerOf("c2", "Bia Castro"),
        endTime: "15:00",
        id: "apt-violet",
        startTime: "14:00",
      }),
    ]);
    const user = setup();
    renderBoard();

    const week = await openWeek(user);
    await vi.waitFor(() =>
      expect(barColors(barOf(week, /Bia Castro/))).toEqual(["VIOLET"]),
    );
    expect(barColors(barOf(week, /Ana Paula/))).toEqual([null]);
  });

  test("catálogo falhado dá barra neutra, sem mensagem de erro e com as barras na tela", async () => {
    listCatalog.mockRejectedValue(new Error("falha de rede"));
    listAppointments.mockResolvedValue([
      appointmentFixture({ customer: customerOf("c1", "Ana Paula") }),
      appointmentFixture({
        customer: customerOf("c2", "Bia Castro"),
        endTime: "15:00",
        id: "apt-2",
        startTime: "14:00",
      }),
    ]);
    const user = setup();
    renderBoard();

    const week = await openWeek(user);
    await vi.waitFor(() => expect(listCatalog).toHaveBeenCalled());
    expect(barColors(barOf(week, /Ana Paula/))).toEqual([null]);
    expect(barColors(barOf(week, /Bia Castro/))).toEqual([null]);
    expect(screen.queryByText("falha de rede")).toBeNull();
    expect(screen.queryByText("Agenda indisponível")).toBeNull();
  });
});

describe("2 — a Semana rebaixa as horas fora do horário de atendimento", () => {
  function offRanges(week: HTMLElement, columnIndex: number) {
    const column = week.querySelectorAll(".week-map-column")[columnIndex];
    return Array.from(column.querySelectorAll("[data-testid='week-off-hours']")).map(
      (node) => {
        const style = (node as HTMLElement).style;
        return [
          Number(style.getPropertyValue("--start")),
          Number(style.getPropertyValue("--span")),
        ];
      },
    );
  }

  test("a terça atende das 09h às 18h: a janela de 8h a 20h marca 08–09 e 18–20 só na terça", async () => {
    getSettings.mockResolvedValue({
      availability: { rules: [rule(2, "09:00", "18:00")] },
    });
    const user = setup();
    renderBoard();

    const week = await openWeek(user);
    await vi.waitFor(() =>
      expect(offRanges(week, 1)).toEqual([
        [0, 1],
        [10, 2],
      ]),
    );
    expect(offRanges(week, 0)).toEqual([]);
    expect(offRanges(week, 2)).toEqual([]);
  });

  test("sem regras, nada fica marcado", async () => {
    const user = setup();
    renderBoard();

    const week = await openWeek(user);
    await vi.waitFor(() => expect(getSettings).toHaveBeenCalled());
    expect(
      week.querySelectorAll("[data-testid='week-off-hours']"),
    ).toHaveLength(0);
  });

  test("leitura das configurações falhada, nada fica marcado e a Semana segue na tela", async () => {
    getSettings.mockRejectedValue(new Error("falha de rede"));
    const user = setup();
    renderBoard();

    const week = await openWeek(user);
    await vi.waitFor(() => expect(getSettings).toHaveBeenCalled());
    expect(
      week.querySelectorAll("[data-testid='week-off-hours']"),
    ).toHaveLength(0);
    expect(week).toBeVisible();
  });
});

describe("3 — linha da semana, contagem e legenda", () => {
  test("intervalo dos dias visíveis, atendimentos não cancelados e legenda só com os serviços da semana", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: customerOf("c1", "Ana Paula"),
        date: "2026-09-28",
        id: "apt-1",
      }),
      appointmentFixture({
        customer: customerOf("c2", "Bia Castro"),
        id: "apt-2",
        services: [serviceEntry("s-amber", "Escova")],
      }),
      appointmentFixture({
        customer: customerOf("c3", "Carla Nunes"),
        date: "2026-09-30",
        id: "apt-3",
        services: [serviceEntry("s-plain", "Corte masculino")],
      }),
      appointmentFixture({
        customer: customerOf("c4", "Dani Souza"),
        date: "2026-09-30",
        id: "apt-cancelled",
        services: [serviceEntry("s-slate", "Barba")],
        startTime: "15:00",
        endTime: "16:00",
        status: "CANCELLED",
      }),
      appointmentFixture({
        customer: customerOf("c5", "Eva Lima"),
        date: "2026-10-05",
        id: "apt-next-week",
        services: [serviceEntry("s-slate", "Hidratação")],
      }),
    ]);
    listTimeBlocks.mockResolvedValue([timeBlockFixture()]);
    const user = setup();
    renderBoard();

    const week = await openWeek(user);
    await vi.waitFor(() =>
      expect(within(week).getByText("3 atendimentos")).toBeVisible(),
    );
    expect(week.querySelector(".week-map-range")).toHaveTextContent(
      "28 de setembro – 4 de outubro",
    );

    const legend = within(week).getByRole("list", {
      name: "Legenda de serviços",
    });
    const items = within(legend).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Corte feminino",
      "Escova",
      "Sem cor definida",
    ]);
    expect(within(legend).queryByText("Barba")).toBeNull();
    expect(within(legend).queryByText("Hidratação")).toBeNull();
    expect(
      items[0].querySelector(".week-map-dot")?.getAttribute("data-color"),
    ).toBe("VIOLET");
    expect(
      items[1].querySelector(".week-map-dot")?.getAttribute("data-color"),
    ).toBe("AMBER");
  });

  test("com o domingo oculto, o intervalo vai até o sábado e o atendimento do domingo não conta", async () => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0],
      initialView: null,
    });
    listAppointments.mockResolvedValue([
      appointmentFixture({ customer: customerOf("c1", "Ana Paula") }),
      appointmentFixture({
        customer: customerOf("c2", "Bia Castro"),
        date: "2026-10-04",
        id: "apt-sunday",
      }),
    ]);
    const user = setup();
    renderBoard();

    const week = await openWeek(user);
    await vi.waitFor(() =>
      expect(within(week).getByText("1 atendimento")).toBeVisible(),
    );
    expect(week.querySelector(".week-map-range")).toHaveTextContent(
      "28 de setembro – 3 de outubro",
    );
  });
});

describe("4 — o Mês é uma pilha de traços por dia", () => {
  test("um traço por entrada com o token do serviço, '+N' acima do limite, sem cancelado nem intervalo", async () => {
    const at = (hour: number) => ({
      endTime: `${String(hour + 1).padStart(2, "0")}:00`,
      startTime: `${String(hour).padStart(2, "0")}:00`,
    });
    listAppointments.mockResolvedValue([
      appointmentFixture({
        ...at(8),
        bufferAfterMinutes: 15,
        customer: customerOf("c1", "Ana Paula"),
        id: "apt-a",
      }),
      appointmentFixture({
        ...at(9),
        customer: customerOf("c2", "Bia Castro"),
        id: "apt-b",
        services: [
          serviceEntry("s-violet", "Corte feminino", 30),
          serviceEntry("s-amber", "Escova", 30),
        ],
      }),
      appointmentFixture({
        ...at(10),
        customer: customerOf("c3", "Carla Nunes"),
        id: "apt-c",
        services: [serviceEntry("s-plain", "Corte masculino")],
      }),
      appointmentFixture({
        ...at(11),
        customer: customerOf("c4", "Dani Souza"),
        id: "apt-d",
        services: [serviceEntry("s-slate", "Barba")],
      }),
      appointmentFixture({
        ...at(13),
        customer: customerOf("c5", "Eva Lima"),
        id: "apt-e",
      }),
      appointmentFixture({
        ...at(14),
        customer: customerOf("c6", "Fabi Reis"),
        id: "apt-f",
      }),
      appointmentFixture({
        ...at(15),
        customer: customerOf("c7", "Gabi Alves"),
        id: "apt-cancelled",
        status: "CANCELLED",
      }),
    ]);
    const user = setup();
    renderBoard();

    const month = await openMonth(user);
    const cell = dayCell(month, /^29 de setembro/);
    await vi.waitFor(() =>
      expect(stripeColors(cell)[0]).toEqual(["VIOLET"]),
    );
    expect(stripeColors(cell)).toEqual([
      ["VIOLET"],
      ["VIOLET", "AMBER"],
      [null],
      ["SLATE"],
      ["VIOLET"],
    ]);
    expect(within(cell).getByText("+1")).toBeVisible();
    expect(cell.querySelector(".month-line")).toBeNull();
  });

  test("bloqueio e compromisso pessoal são traços de tipo, sem cor de serviço", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({ bufferAfterMinutes: 15 }),
    ]);
    listTimeBlocks.mockResolvedValue([timeBlockFixture(), personalFixture()]);
    const user = setup();
    renderBoard();

    const month = await openMonth(user);
    const cell = dayCell(month, /^29 de setembro/);
    await vi.waitFor(() => expect(stripeColors(cell)[0]).toEqual(["VIOLET"]));
    expect(cell.querySelectorAll(".month-stripe")).toHaveLength(3);
    expect(cell.querySelectorAll(".month-stripe.is-block")).toHaveLength(1);
    expect(cell.querySelectorAll(".month-stripe.is-personal")).toHaveLength(1);
    expect(within(cell).queryByText(/^\+\d/)).toBeNull();
  });

  test("a partir de 1024 px o dia mostra linhas 'Nome · Serviço' e '+N' além de duas", async () => {
    window.innerWidth = 1366;
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: customerOf("c1", "Ana Paula"),
        endTime: "09:00",
        id: "apt-a",
        startTime: "08:00",
      }),
      appointmentFixture({
        customer: customerOf("c2", "Bia Castro"),
        id: "apt-b",
        services: [serviceEntry("s-amber", "Escova")],
        startTime: "10:00",
      }),
      appointmentFixture({
        customer: customerOf("c3", "Carla Nunes"),
        endTime: "13:00",
        id: "apt-c",
        startTime: "12:00",
      }),
      appointmentFixture({
        customer: customerOf("c4", "Dani Souza"),
        endTime: "15:00",
        id: "apt-d",
        startTime: "14:00",
      }),
    ]);
    const user = setup();
    renderBoard();

    const month = await openMonth(user);
    const cell = dayCell(month, /^29 de setembro/);
    const lines = Array.from(cell.querySelectorAll(".month-line"));
    expect(lines.map((line) => line.textContent)).toEqual([
      "Ana Paula · Corte feminino",
      "Bia Castro · Escova",
    ]);
    expect(within(cell).getByText("+2")).toBeVisible();
    expect(cell.querySelector(".month-stripe")).toBeNull();
  });
});

describe("5 — Mês: o primeiro toque seleciona, o segundo abre o Dia", () => {
  beforeEach(() => {
    listAppointments.mockResolvedValue([
      appointmentFixture({ customer: customerOf("c1", "Ana Paula") }),
      appointmentFixture({
        customer: customerOf("c2", "Bia Castro"),
        date: "2026-09-30",
        id: "apt-30",
        services: [serviceEntry("s-amber", "Escova")],
      }),
    ]);
  });

  test("o primeiro toque marca a célula e mostra o resumo dela, sem trocar de visualização", async () => {
    const user = setup();
    renderBoard();

    const month = await openMonth(user);
    const today = dayCell(month, /^29 de setembro/);
    const other = dayCell(month, /^30 de setembro/);
    expect(today).toHaveAttribute("aria-pressed", "true");
    expect(other).toHaveAttribute("aria-pressed", "false");
    expect(summaryCard()).toHaveTextContent("Hoje, terça 29");

    await user.click(other);

    expect(other).toHaveAttribute("aria-pressed", "true");
    expect(today).toHaveAttribute("aria-pressed", "false");
    expect(summaryCard()).toHaveTextContent("Quarta, 30");
    expect(summaryCard()).toHaveTextContent("1 atendimento");
    expect(summaryCard()).not.toHaveTextContent("Hoje");
    expect(screen.getByRole("tab", { name: "Mês" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Dia" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("region", { name: "Mapa do mês" })).toBeVisible();
  });

  test("o segundo toque no mesmo dia abre o Dia nessa data", async () => {
    const user = setup();
    renderBoard();

    const month = await openMonth(user);
    const other = dayCell(month, /^30 de setembro/);
    await user.click(other);
    await user.click(other);

    expect(screen.getByRole("tab", { name: "Dia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("Bia Castro")).toBeVisible();
    expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
      "Quarta, 30",
    );
    expect(screen.queryByRole("region", { name: "Mapa do mês" })).toBeNull();
  });

  test("'Abrir dia' abre o Dia na data do resumo, no primeiro toque de outro dia", async () => {
    const user = setup();
    renderBoard();

    const month = await openMonth(user);
    await user.click(dayCell(month, /^1 de outubro/));
    expect(summaryCard()).toHaveTextContent("Quinta, 1");
    expect(screen.getByRole("tab", { name: "Mês" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(
      within(summaryCard()).getByRole("button", { name: /Abrir dia/ }),
    );

    expect(screen.getByRole("tab", { name: "Dia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
      "Quinta, 1",
    );
  });

  test("teclado: Enter seleciona e Espaço no dia marcado abre o Dia", async () => {
    const user = setup();
    renderBoard();

    const month = await openMonth(user);
    const other = dayCell(month, /^30 de setembro/);
    other.focus();
    await user.keyboard("{Enter}");
    expect(other).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("tab", { name: "Mês" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard(" ");
    expect(screen.getByRole("tab", { name: "Dia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // Pedido de 2026-10-12: o cabeçalho escolhe o dia para o resumo e a
  // Semana continua; "Abrir dia" é que leva ao Dia.
  test("na Semana, tocar no cabeçalho de um dia o escolhe para o resumo, e 'Abrir dia' abre o Dia", async () => {
    const user = setup();
    renderBoard();

    const week = await openWeek(user);
    await user.click(
      within(week).getByRole("button", { name: /^QUA\s*30, mostrar quarta, 30/ }),
    );

    expect(screen.getByRole("tab", { name: "Semana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("region", { name: "Resumo do dia" })).toHaveTextContent(
      "Quarta, 30",
    );
    await user.click(screen.getByRole("button", { name: "Abrir dia" }));
    expect(screen.getByRole("tab", { name: "Dia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
      "Quarta, 30",
    );
  });
});

describe("6 — o resumo do dia", () => {
  test("'Hoje, …', contagem, pílula por serviço com '×N' quando repete e a linha de bloqueio e compromisso", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({ customer: customerOf("c1", "Ana Paula"), startTime: "08:00", endTime: "09:00" }),
      appointmentFixture({
        customer: customerOf("c2", "Bia Castro"),
        endTime: "15:00",
        id: "apt-2",
        startTime: "14:00",
      }),
      appointmentFixture({
        customer: customerOf("c3", "Carla Nunes"),
        endTime: "17:00",
        id: "apt-3",
        services: [serviceEntry("s-amber", "Escova")],
        startTime: "16:00",
      }),
    ]);
    listTimeBlocks.mockResolvedValue([timeBlockFixture(), personalFixture()]);
    const user = setup();
    renderBoard();

    await openWeek(user);
    const card = summaryCard();
    await vi.waitFor(() =>
      expect(
        card.querySelector(".agenda-summary-dot")?.getAttribute("data-color"),
      ).toBe("VIOLET"),
    );
    expect(card).toHaveTextContent("Hoje, terça 29");
    expect(card).toHaveTextContent("3 atendimentos");
    const chips = Array.from(card.querySelectorAll(".agenda-summary-chip")).map(
      (chip) => chip.textContent,
    );
    expect(chips).toEqual(["Corte feminino ×2", "Escova"]);
    expect(card.querySelector(".agenda-summary-others")).toHaveTextContent(
      "+ Almoço · Dentista",
    );
    expect(card).not.toHaveTextContent("em confirmação");
  });

  test("dia sem atendimento mostra o resumo vazio e, sem horário no dia, o motivo", async () => {
    getSettings.mockResolvedValue({
      availability: { rules: [rule(2, "09:00", "18:00")] },
    });
    const user = setup();
    renderBoard();

    await openWeek(user);
    await screen.findByText("Nenhum atendimento neste dia.");
    expect(screen.queryByText("Você não atende neste dia.")).toBeNull();

    const month = await openMonth(user);
    await user.click(dayCell(month, /^30 de setembro/));
    expect(await screen.findByText("Você não atende neste dia.")).toBeVisible();
  });
});

describe("7 — a pílula de dias visíveis", () => {
  // Goal118: a pílula deixou de levar a Configurações › Agenda e abre a folha
  // "Dias visíveis" na própria Agenda (quadro A12).
  test("'Todos os dias' sem ocultos, e abre a folha dos dias visíveis, na Semana e no Mês", async () => {
    const user = setup();
    renderBoard();

    await openWeek(user);
    const pill = screen.getByRole("button", { name: "Todos os dias" });
    expect(pill).toHaveAttribute("aria-haspopup", "dialog");

    await user.click(screen.getByRole("tab", { name: "Mês" }));
    expect(
      screen.getByRole("button", { name: "Todos os dias" }),
    ).toHaveAttribute("aria-haspopup", "dialog");
  });

  test("'Seg–Sáb' com o domingo oculto", async () => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0],
      initialView: null,
    });
    const user = setup();
    renderBoard();

    await openWeek(user);
    const pill = await screen.findByRole("button", { name: "Seg–Sáb" });
    expect(pill).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("button", { name: "Todos os dias" })).toBeNull();
  });

  test("o Dia não tem a pílula", async () => {
    renderBoard();

    await screen.findByRole("tab", { name: "Dia" });
    expect(document.querySelector(".agenda-visible-days")).toBeNull();
    expect(screen.queryByRole("button", { name: "Todos os dias" })).toBeNull();
  });
});
