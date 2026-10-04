// @vitest-environment jsdom
/**
 * Goal092 (WU-03): provas do Dia como lista cronológica do quadro A1 — barra
 * com mês e ano, traço da cor do serviço lido do catálogo, resumo "Hoje, …",
 * saída do cartão "Próximo agendamento", "Exceção do dia" dentro do menu de
 * criar e o painel de detalhe a partir de 1024 px.
 *
 * Relógio fixo: terça 29/09/2026, 12:00.
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

function catalogItem(id: string, colorToken: ServiceColorToken | null) {
  return { colorToken, id, name: id };
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

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest(".agenda-day-row");
  if (!row) throw new Error(`linha do Dia não encontrada para ${name}`);
  return row as HTMLElement;
}

function stripeColors(row: HTMLElement): Array<string | null> {
  return Array.from(row.querySelectorAll(".agenda-day-stripe-part")).map(
    (part) => part.getAttribute("data-color"),
  );
}

describe("1 — a barra mostra mês e ano do dia focado", () => {
  test("Dia, Semana e Mês mostram 'Setembro 2026', sem a data completa, e mantêm os nomes de ‹ ›", async () => {
    const user = setup();
    renderBoard();

    await screen.findByRole("tab", { name: "Dia" });
    const labels: Array<[string, string, string]> = [
      ["Dia", "Dia anterior", "Próximo dia"],
      ["Semana", "Semana anterior", "Próxima semana"],
      ["Mês", "Mês anterior", "Próximo mês"],
    ];
    for (const [tab, previous, next] of labels) {
      await user.click(screen.getByRole("tab", { name: tab }));
      const title = document.querySelector(".agenda-date-title");
      expect(title).toHaveTextContent("Setembro 2026");
      expect(screen.queryByText(/29 de setembro/i)).toBeNull();
      expect(screen.getByRole("button", { name: previous })).toBeVisible();
      expect(screen.getByRole("button", { name: next })).toBeVisible();
    }
  });

  test("o mês e o ano acompanham o dia focado ao navegar", async () => {
    const user = setup();
    renderBoard();

    await screen.findByRole("tab", { name: "Mês" });
    await user.click(screen.getByRole("tab", { name: "Mês" }));
    await user.click(screen.getByRole("button", { name: "Próximo mês" }));

    expect(document.querySelector(".agenda-date-title")).toHaveTextContent(
      "Outubro 2026",
    );
  });
});

describe("2 — o Dia é uma lista cronológica", () => {
  test("ordem de início, horário, nome, 'serviço · duração' e estado; sem eixo de horas; textos do quadro", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: { id: "c2", name: "Bia Castro", phone: null },
        endTime: "15:00",
        id: "apt-late",
        services: [serviceEntry("s-amber", "Escova", 30)],
        durationMinutes: 30,
        startTime: "14:30",
      }),
      appointmentFixture({
        bufferAfterMinutes: 15,
        endTime: "11:00",
        id: "apt-early",
        startTime: "10:00",
      }),
      appointmentFixture({
        customer: { id: "c3", name: "Carla Nunes", phone: null },
        endTime: "09:00",
        id: "apt-no-show",
        durationMinutes: 60,
        startTime: "08:00",
        status: "NO_SHOW",
      }),
    ]);
    listTimeBlocks.mockResolvedValue([
      timeBlockFixture(),
      timeBlockFixture({
        endAt: "2026-09-29T19:00:00.000Z",
        id: "block-2",
        kind: "PERSONAL",
        startAt: "2026-09-29T18:00:00.000Z",
        title: "Dentista",
      }),
    ]);
    renderBoard();

    await screen.findByText("Ana Paula");
    const list = document.querySelector(".agenda-day-list") as HTMLElement;
    expect(list).not.toBeNull();
    expect(
      document.querySelector(".agenda-time-grid, .agenda-day-hours"),
    ).toBeNull();

    const titles = Array.from(
      list.querySelectorAll(
        ".agenda-day-name, .agenda-day-pill-title, .agenda-day-personal-title, .agenda-day-buffer-text",
      ),
    ).map((node) => node.textContent);
    expect(titles).toEqual([
      "Carla Nunes",
      "Ana Paula",
      "intervalo · 15 min",
      "Almoço",
      "Bia Castro",
      "Dentista",
    ]);

    const ana = rowOf("Ana Paula");
    expect(within(ana).getByText("10:00")).toBeVisible();
    expect(ana).toHaveTextContent("Corte feminino · 1 h");
    expect(ana).toHaveTextContent("Confirmado");
    expect(rowOf("Carla Nunes")).toHaveTextContent("Não compareceu");
    expect(rowOf("Bia Castro")).toHaveTextContent("Escova · 30 min");

    expect(rowOf("Almoço")).toHaveTextContent("bloqueio · 1 h");
    expect(rowOf("Dentista")).toHaveTextContent("compromisso pessoal · 1 h");
    expect(rowOf("Dentista").querySelector(".agenda-day-stripe")).toBeNull();
  });

  test("agendamento concluído (hoje, já passado) mostra 'Concluído' sem o preço", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({
        endTime: "09:00",
        id: "apt-done",
        startTime: "08:00",
        status: "COMPLETED",
      }),
    ]);
    renderBoard();

    await screen.findByText("Ana Paula");
    const row = rowOf("Ana Paula");
    expect(row).toHaveTextContent("Concluído");
    expect(row).toHaveTextContent("Corte feminino · 1 h");
    expect(row).not.toHaveTextContent("R$");
  });

  test("o preço mantém o espaço não separável entre 'R$' e o valor, para não quebrar em duas linhas", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({ endTime: "23:00", startTime: "22:00" }),
    ]);
    renderBoard();

    await screen.findByText("Ana Paula");
    const meta = rowOf("Ana Paula").querySelector(".agenda-day-meta");
    expect(meta?.textContent).toBe("Corte feminino · 1 h · R$ 90");
  });

  test("com presenceConfirmedAt, a observação traz o texto do quadro; Concluído e Não compareceu não a mostram", async () => {
    const confirmedAt = "2026-09-28T12:00:00.000Z";
    listAppointments.mockResolvedValue([
      appointmentFixture({ presenceConfirmedAt: confirmedAt }),
      appointmentFixture({
        customer: { id: "c2", name: "Bia Castro", phone: null },
        endTime: "09:00",
        id: "apt-done",
        presenceConfirmedAt: confirmedAt,
        startTime: "08:00",
        status: "COMPLETED",
      }),
      appointmentFixture({
        customer: { id: "c3", name: "Carla Nunes", phone: null },
        endTime: "07:30",
        id: "apt-no-show",
        presenceConfirmedAt: confirmedAt,
        startTime: "06:30",
        status: "NO_SHOW",
      }),
    ]);
    renderBoard();

    await screen.findByText("Ana Paula");
    expect(rowOf("Ana Paula")).toHaveTextContent(
      "presença confirmada pelo lembrete",
    );
    expect(rowOf("Bia Castro")).not.toHaveTextContent("presença confirmada");
    expect(rowOf("Carla Nunes")).not.toHaveTextContent("presença confirmada");
  });

  test("cancelado fica fora da lista", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture(),
      appointmentFixture({
        customer: { id: "cx", name: "Cancelada Silva", phone: null },
        id: "apt-cancelled",
        startTime: "13:00",
        endTime: "14:00",
        status: "CANCELLED",
      }),
    ]);
    renderBoard();

    await screen.findByText("Ana Paula");
    expect(screen.queryByText("Cancelada Silva")).toBeNull();
  });
});

describe("3 — a cor do serviço vem do catálogo", () => {
  test("o traço tem o token do serviço; dois serviços dividem o traço", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture(),
      appointmentFixture({
        customer: { id: "c2", name: "Bia Castro", phone: null },
        endTime: "15:00",
        id: "apt-two",
        services: [
          serviceEntry("s-violet", "Corte feminino", 30),
          serviceEntry("s-amber", "Escova", 30),
        ],
        startTime: "14:00",
      }),
    ]);
    renderBoard();

    await screen.findByText("Ana Paula");
    await vi.waitFor(() =>
      expect(stripeColors(rowOf("Ana Paula"))).toEqual(["VIOLET"]),
    );
    expect(stripeColors(rowOf("Bia Castro"))).toEqual(["VIOLET", "AMBER"]);
  });

  test("serviço sem cor no catálogo dá traço neutro, com a lista inteira na tela", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({
        id: "apt-plain",
        services: [serviceEntry("s-plain", "Corte masculino")],
      }),
      appointmentFixture({
        customer: { id: "c2", name: "Bia Castro", phone: null },
        endTime: "15:00",
        id: "apt-violet",
        startTime: "14:00",
      }),
    ]);
    renderBoard();

    await screen.findByText("Ana Paula");
    await vi.waitFor(() =>
      expect(stripeColors(rowOf("Bia Castro"))).toEqual(["VIOLET"]),
    );
    expect(stripeColors(rowOf("Ana Paula"))).toEqual([null]);
    expect(screen.getByText("Bia Castro")).toBeVisible();
  });

  test("catálogo falhado dá traço neutro, sem mensagem de erro, com a lista inteira", async () => {
    listCatalog.mockRejectedValue(new Error("falha de rede"));
    listAppointments.mockResolvedValue([
      appointmentFixture(),
      appointmentFixture({
        customer: { id: "c2", name: "Bia Castro", phone: null },
        endTime: "15:00",
        id: "apt-2",
        startTime: "14:00",
      }),
    ]);
    renderBoard();

    await screen.findByText("Ana Paula");
    expect(screen.getByText("Bia Castro")).toBeVisible();
    expect(stripeColors(rowOf("Ana Paula"))).toEqual([null]);
    expect(stripeColors(rowOf("Bia Castro"))).toEqual([null]);
    expect(screen.queryByText("falha de rede")).toBeNull();
    expect(screen.queryByText("Agenda indisponível")).toBeNull();
  });
});

describe("4 — o resumo do dia", () => {
  test("'Hoje, …' no dia de hoje, com o compromisso pessoal fora dos bloqueios", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture(),
      appointmentFixture({
        customer: { id: "c2", name: "Bia Castro", phone: null },
        endTime: "15:00",
        id: "apt-2",
        startTime: "14:00",
      }),
    ]);
    listTimeBlocks.mockResolvedValue([
      timeBlockFixture(),
      timeBlockFixture({
        endAt: "2026-09-29T19:00:00.000Z",
        id: "block-2",
        kind: "PERSONAL",
        startAt: "2026-09-29T18:00:00.000Z",
        title: "Dentista",
      }),
    ]);
    renderBoard();

    await screen.findByText("Ana Paula");
    const summary = document.querySelector(".agenda-day-summary");
    expect(summary).toHaveTextContent("Hoje, terça 29");
    expect(summary).toHaveTextContent("2 atendimentos · 1 bloqueio");
    expect(summary).not.toHaveTextContent("2 bloqueios");
  });

  test("outro dia não diz 'Hoje'", async () => {
    const user = setup();
    renderBoard();

    await screen.findByRole("button", { name: "Próximo dia" });
    await user.click(screen.getByRole("button", { name: "Próximo dia" }));

    const summary = document.querySelector(".agenda-day-summary");
    expect(summary).toHaveTextContent("Quarta 30");
    expect(summary).not.toHaveTextContent("Hoje");
  });
});

describe("5 — 'Próximo agendamento' não aparece", () => {
  test("nem em Dia, nem em Semana, nem em Mês", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({
        customer: { id: "c2", name: "Cliente Futuro", phone: null },
        date: "2026-10-01",
        id: "apt-futuro",
      }),
    ]);
    const user = setup();
    renderBoard();

    await screen.findByRole("tab", { name: "Dia" });
    expect(screen.queryByText(/Próximo agendamento/)).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Semana" }));
    await screen.findByRole("region", { name: "Mapa da semana" });
    expect(screen.queryByText(/Próximo agendamento/)).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Mês" }));
    await screen.findByRole("region", { name: "Mapa do mês" });
    expect(screen.queryByText(/Próximo agendamento/)).toBeNull();
  });
});

describe("6 — o menu de criar", () => {
  test("tem os quatro itens com seus destinos, e o botão solto 'Exceções do dia' não existe", async () => {
    const user = setup();
    renderBoard();

    await user.click(await screen.findByRole("button", { name: "Novo" }));
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
    expect(
      within(menu).getByRole("menuitem", { name: "Exceção do dia" }),
    ).toHaveAttribute("href", "/agenda/excecoes");
    expect(screen.queryByRole("link", { name: "Exceções do dia" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Exceções do dia" })).toBeNull();
  });

  test("'Exceção do dia' some sem manageAvailability; os outros itens seguem a capacidade deles", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({ manageAvailability: false }),
    );
    const user = setup();
    renderBoard();

    await user.click(await screen.findByRole("button", { name: "Novo" }));
    const menu = screen.getByRole("menu");

    expect(
      within(menu).getByRole("menuitem", { name: "Agendamento" }),
    ).toBeVisible();
    expect(
      within(menu).queryByRole("menuitem", { name: "Exceção do dia" }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: "Bloqueio" }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: "Compromisso pessoal" }),
    ).toBeNull();
  });

  test("Escape fecha o menu e devolve o foco ao botão 'Novo'", async () => {
    const user = setup();
    renderBoard();

    const trigger = await screen.findByRole("button", { name: "Novo" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

describe("7 — seleção e painel de detalhe", () => {
  test("a partir de 1024 px, tocar num atendimento seleciona para o painel, que abre com o texto do quadro", async () => {
    window.innerWidth = 1366;
    listAppointments.mockResolvedValue([appointmentFixture()]);
    const user = setup();
    renderBoard();

    await screen.findByRole("tab", { name: "Dia" });
    await user.click(screen.getByRole("tab", { name: "Dia" }));
    const panel = await screen.findByRole("complementary", {
      name: "Detalhe do agendamento",
    });
    expect(panel).toHaveTextContent(
      "Selecione um atendimento para ver os detalhes",
    );

    const row = await screen.findByRole("button", { name: /Ana Paula/ });
    expect(row.closest("a")).toBeNull();
    await user.click(row);

    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(
      within(
        screen.getByRole("complementary", { name: "Detalhe do agendamento" }),
      ).getByRole("heading", { name: "Ana Paula" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Selecione um atendimento para ver os detalhes"),
    ).toBeNull();
  });

  test("abaixo de 1024 px, o atendimento é um link para /agenda/agendamento?id=…", async () => {
    window.innerWidth = 390;
    listAppointments.mockResolvedValue([appointmentFixture()]);
    renderBoard();

    const link = await screen.findByRole("link", { name: /Ana Paula/ });
    expect(link).toHaveAttribute("href", "/agenda/agendamento?id=apt-1");
    expect(
      screen.queryByRole("complementary", { name: "Detalhe do agendamento" }),
    ).toBeNull();
  });
});
