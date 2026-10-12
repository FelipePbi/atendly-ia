// @vitest-environment jsdom
/**
 * Regressões dos pedidos de 2026-10-12 na ida da Agenda ao detalhe do
 * atendimento (`/agenda/agendamento?id=…`, quadro A5 com a coluna do Dia ao
 * lado, D-110 (a)). Problemas evitados:
 *
 * 1. Transição quebrada (D-167). Ao abrir um atendimento, a coluna do Dia
 *    mostrava o esqueleto da grade inteira da Agenda espremido em 380 px (um
 *    bloco cinza e um cartão branco alto com duas faixas estreitas), o
 *    Histórico era uma barra cinza genérica e tudo pulava quando os dados
 *    chegavam — mesmo vindo da própria Agenda, que já tinha lido tudo.
 * 2. Seleção invisível. A linha do atendimento aberto ao lado (painel do Dia
 *    e coluna da rota) não mostrava que estava selecionada.
 * 3. Voltar para hoje. O "voltar" do detalhe abria a Agenda em hoje, não no
 *    dia de onde a pessoa saiu.
 */

import { readFileSync } from "node:fs";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import AgendaPage from "@/app/(platform)/agenda/page";
import type { Appointment, AppointmentEvent, CalendarState } from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import {
  agendaDayParam,
  appointmentBackHref,
  internalReturnTo,
} from "@/features/agenda/agendaLinks";
import {
  forgetAgendaChanges,
  recalledAppointment,
  rememberAgendaWindow,
  rememberAppointment,
} from "@/features/agenda/agendaMemory";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { claimSessionMemory } from "@/shared/runtime/sessionMemory";

import { expectNoA11yViolations } from "./support/a11y";

const getAppointment = vi.fn();
const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();
const getAgendaViewPreference = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  useProductRuntime: () => ({ session: null }),
  getProductServices: () => ({
    calendar: {
      getAppointment,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
      listAppointments,
      listAvailabilityExceptions: () => Promise.resolve([]),
      listTimeBlocks: () => Promise.resolve([]),
    },
    conversations: { list: () => Promise.resolve([]) },
    customers: { get: () => new Promise(() => undefined) },
    serviceCatalog: { list: () => Promise.resolve({ items: [] }) },
    settings: {
      get: () => Promise.resolve({ availability: { rules: [] } }),
      getAgendaViewPreference,
    },
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

const ana = () => appointmentFixture();
const bruna = () =>
  appointmentFixture({
    customer: { id: "c2", name: "Bruna Costa", phone: "5511977776655" },
    customerId: "c2",
    endTime: "15:00",
    id: "apt-2",
    startTime: "14:00",
  });

function wide(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        addEventListener: () => undefined,
        matches,
        media: query,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 1366;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0));
  wide(true);
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([ana(), bruna()]);
  getAppointment.mockImplementation((id: string) =>
    Promise.resolve(id === "apt-2" ? bruna() : ana()),
  );
  listAppointmentEvents.mockResolvedValue([]);
  listAppointmentNotifications.mockResolvedValue([]);
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [],
    initialView: "DAY",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

function renderRoute(appointmentId: string, returnTo?: string) {
  return render(
    <ShellConfigProvider>
      <AppointmentDetail appointmentId={appointmentId} returnTo={returnTo} />
    </ShellConfigProvider>,
  );
}

function renderBoard(initialDate?: string) {
  return render(
    <ShellConfigProvider>
      <AgendaBoard initialDate={initialDate} />
    </ShellConfigProvider>,
  );
}

function dayColumn() {
  return screen.getByRole("complementary", { name: "Agenda do dia" });
}

/** A Agenda lê a semana e sai da tela, como ao tocar num atendimento. */
async function visitAgendaFirst() {
  const board = renderBoard();
  await screen.findByRole("button", { name: /Ana Paula/ });
  board.unmount();
}

describe("1 — a coluna do Dia carrega na forma da coluna real (2026-10-12, D-167)", () => {
  test("sem nada lido, a coluna mostra faixa dos dias, resumo e linhas, fora da árvore acessível, e nunca a grade inteira", async () => {
    getAppointment.mockReturnValue(new Promise(() => undefined));
    const { container } = renderRoute("apt-1");

    const loading = within(dayColumn()).getByRole("status", {
      name: "Carregando agenda",
    });
    expect(loading).toHaveAttribute("aria-busy", "true");
    const drawing = loading.querySelector(".agenda-day-panel");
    expect(drawing).toHaveAttribute("aria-hidden", "true");
    // As mesmas peças do Dia real (DayView): faixa de 7 dias, resumo, linhas.
    expect(
      drawing?.querySelectorAll(".agenda-week-strip > .agenda-week-strip-day"),
    ).toHaveLength(7);
    expect(drawing?.querySelector(".agenda-day-summary")).not.toBeNull();
    expect(
      drawing?.querySelectorAll(
        ".agenda-day-list > .agenda-day-item .agenda-day-row",
      ),
    ).toHaveLength(3);
    // O esqueleto da grade da Agenda (cabeçalho e colunas) não aparece mais.
    expect(container.querySelector(".agenda-loading-shell")).toBeNull();
    expect(container.querySelector(".agenda-loading-grid")).toBeNull();
    // A barra do topo já ocupa o lugar dela, também fora da árvore acessível.
    expect(
      container.querySelector(".agenda-command-bar-skeleton"),
    ).toHaveAttribute("aria-hidden", "true");
    await expectNoA11yViolations(container);
  });

  test("a coluna carregada troca o esqueleto pelo Dia com fade, nas mesmas classes", async () => {
    renderRoute("apt-1");
    const column = dayColumn();
    expect(
      await within(column).findByRole("link", { name: /Bruna Costa/ }),
    ).toBeVisible();
    expect(within(column).queryByRole("status")).toBeNull();
    const day = column.querySelector(".agenda-day-panel");
    expect(day?.parentElement).toHaveClass("agenda-reveal");
  });

  test("vindo da Agenda, a coluna, a barra e o detalhe aparecem já preenchidos, sem esqueleto, e revalidam em segundo plano", async () => {
    await visitAgendaFirst();
    // A revalidação demora: nada pode esperar por ela.
    let answerAppointment: (value: Appointment) => void = () => undefined;
    getAppointment.mockReturnValue(
      new Promise<Appointment>((resolve) => {
        answerAppointment = resolve;
      }),
    );
    let answerWeek: (value: Appointment[]) => void = () => undefined;
    listAppointments.mockReturnValue(
      new Promise<Appointment[]>((resolve) => {
        answerWeek = resolve;
      }),
    );

    const { container } = renderRoute("apt-1");

    expect(screen.getByRole("heading", { name: "Ana Paula" })).toBeVisible();
    expect(
      within(dayColumn()).getByRole("link", { name: /Bruna Costa/ }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Próximo dia" })).toBeVisible();
    expect(
      screen.queryByRole("status", { name: "Carregando agenda" }),
    ).toBeNull();
    expect(
      screen.queryByRole("status", { name: "Carregando agendamento" }),
    ).toBeNull();
    expect(container.querySelector(".agenda-command-bar-skeleton")).toBeNull();
    // Quem já apareceu preenchido não anima.
    expect(container.querySelector(".agenda-appt-body")).not.toHaveClass(
      "agenda-reveal",
    );
    expect(getAppointment).toHaveBeenCalledWith("apt-1", expect.anything());

    // Os dados novos substituem os lembrados no lugar, sem esqueleto.
    await act(async () => {
      answerAppointment(ana());
      answerWeek([
        ana(),
        appointmentFixture({
          customer: { id: "c3", name: "Carla Nunes", phone: null },
          customerId: "c3",
          endTime: "17:00",
          id: "apt-3",
          startTime: "16:00",
        }),
      ]);
    });
    expect(
      await within(dayColumn()).findByRole("link", { name: /Carla Nunes/ }),
    ).toBeVisible();
    expect(
      within(dayColumn()).queryByRole("link", { name: /Bruna Costa/ }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "Ana Paula" })).toBeVisible();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  test("trocar de atendimento dentro da rota mostra o novo já lido na hora, ocupado e sem esqueleto (decisão do usuário, 2026-10-12)", async () => {
    await visitAgendaFirst();
    const view = renderRoute("apt-1");
    expect(screen.getByRole("heading", { name: "Ana Paula" })).toBeVisible();
    const column = within(dayColumn()).getByRole("link", {
      name: /Bruna Costa/,
    });

    view.rerender(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-2" />
      </ShellConfigProvider>,
    );
    // Sem esqueleto na troca (revê D-166 §2): o lembrado de B entra na hora e
    // o detalhe fica ocupado até a releitura chegar.
    expect(screen.getByRole("heading", { name: "Bruna Costa" })).toBeVisible();
    expect(
      screen.queryByRole("status", { name: "Carregando agendamento" }),
    ).toBeNull();
    expect(view.container.querySelector(".agenda-appt .skeleton")).toBeNull();
    expect(view.container.querySelector(".agenda-appt")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(column).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Bruna Costa" }),
    ).toBeVisible();
  });

  test("o histórico carregando reserva o espaço de uma linha, sem a barra genérica, e entra com fade", async () => {
    let answerEvents: (value: AppointmentEvent[]) => void = () => undefined;
    listAppointmentEvents.mockReturnValue(
      new Promise<AppointmentEvent[]>((resolve) => {
        answerEvents = resolve;
      }),
    );
    const { container } = renderRoute("apt-1");
    await screen.findByRole("heading", { name: "Histórico" });

    const history = container.querySelector(".agenda-appt-block.is-history");
    const placeholder = history?.querySelector(".agenda-appt-history-reserved");
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(
      placeholder?.querySelectorAll(".agenda-appt-history-item"),
    ).toHaveLength(1);
    expect(
      placeholder?.querySelector(
        ".agenda-appt-history-dot + .agenda-appt-history-body .agenda-appt-history-time",
      ),
    ).not.toBeNull();
    expect(history?.querySelector(".agenda-loading-column")).toBeNull();

    await act(async () => {
      answerEvents([
        {
          actor: null,
          appointmentId: "apt-1",
          id: "ev-1",
          occurredAt: "2026-09-20T13:00:00.000Z",
          reason: null,
          sequence: "1",
          source: "AI",
          type: "CREATED",
          before: null,
          after: null,
        } as unknown as AppointmentEvent,
      ]);
    });
    expect(await screen.findByText(/Criado/)).toBeVisible();
    expect(history?.querySelector(".agenda-appt-history-reserved")).toBeNull();
    expect(history?.querySelector("ol.agenda-appt-history")).toHaveClass(
      "agenda-reveal",
    );
  });

  test("o fade é curto e prefers-reduced-motion o desliga", () => {
    const css = readFileSync("src/shared/styles/avenly-agenda.css", "utf8");
    const rule = /\.agenda-reveal\s*\{\s*animation:\s*fade\s+(\d+)ms/.exec(css);
    expect(rule).not.toBeNull();
    expect(Number(rule?.[1])).toBeLessThanOrEqual(200);
    const reduced = css
      .split("@media (prefers-reduced-motion: reduce)")
      .slice(1)
      .some((block) =>
        /^\s*\{\s*\.agenda-reveal\s*\{\s*animation:\s*none;/.test(block),
      );
    expect(reduced).toBe(true);
  });
});

describe("1b — a memória da aba é da sessão e de antes da última gravação (D-167)", () => {
  test("outra sessão começa vazia, e criar, remarcar ou cancelar esquece o que foi lido", () => {
    claimSessionMemory("pessoa-a:negocio-a");
    rememberAppointment(ana());
    expect(recalledAppointment("apt-1")).not.toBeNull();
    claimSessionMemory("pessoa-a:negocio-a");
    expect(recalledAppointment("apt-1")).not.toBeNull();
    claimSessionMemory("pessoa-b:negocio-b");
    expect(recalledAppointment("apt-1")).toBeNull();

    rememberAgendaWindow({
      appointments: [bruna()],
      endDate: "2026-10-04",
      exceptions: [],
      source: "AVENLY",
      startDate: "2026-09-28",
      timeBlocks: [],
    });
    expect(recalledAppointment("apt-2")?.customer?.name).toBe("Bruna Costa");
    forgetAgendaChanges();
    expect(recalledAppointment("apt-2")).toBeNull();
  });
});

describe("2 — o atendimento aberto ao lado fica marcado na lista do Dia (2026-10-12)", () => {
  test("no painel do Dia: clicar em A marca A; clicar em B passa a marca para B, já durante a leitura", async () => {
    const user = setup();
    renderBoard();
    const anaRow = await screen.findByRole("button", { name: /Ana Paula/ });
    const brunaRow = screen.getByRole("button", { name: /Bruna Costa/ });

    await user.click(anaRow);
    expect(anaRow).toHaveAttribute("aria-current", "true");
    expect(anaRow).toHaveClass("is-selected");
    expect(brunaRow).not.toHaveAttribute("aria-current");
    expect(brunaRow).not.toHaveClass("is-selected");

    getAppointment.mockReturnValue(new Promise(() => undefined));
    await user.click(brunaRow);
    // Sem esqueleto na troca (decisão do usuário, 2026-10-12): o painel já
    // mostra B pela semente da lista, ocupado até a leitura completar.
    const panel = document.querySelector(".agenda-day-detail .agenda-appt");
    expect(panel).toHaveAttribute("aria-busy", "true");
    expect(panel?.querySelector(".skeleton")).toBeNull();
    expect(
      screen.queryByRole("status", { name: "Carregando agendamento" }),
    ).toBeNull();
    expect(brunaRow).toHaveAttribute("aria-current", "true");
    expect(brunaRow).toHaveClass("is-selected");
    expect(anaRow).not.toHaveAttribute("aria-current");
    expect(anaRow).not.toHaveClass("is-selected");
  });

  test("na rota: a linha do id da URL vem marcada na coluna", async () => {
    renderRoute("apt-2");
    const column = dayColumn();
    const brunaRow = await within(column).findByRole("link", {
      name: /Bruna Costa/,
    });
    expect(brunaRow).toHaveAttribute("aria-current", "page");
    expect(brunaRow).toHaveClass("is-selected");
    const anaRow = within(column).getByRole("link", { name: /Ana Paula/ });
    expect(anaRow).not.toHaveAttribute("aria-current");
    expect(anaRow).not.toHaveClass("is-selected");
  });

  test("o destaque não muda a altura da linha: só transborda para os lados", () => {
    const css = readFileSync("src/shared/styles/avenly-agenda.css", "utf8");
    const rule =
      /\.agenda-day-row\.is-selected\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    // Revisto em 2026-10-12: de ponta a ponta da lista (20 px), cantos retos.
    expect(rule).toMatch(/margin-inline:\s*-20px/);
    expect(rule).toMatch(/padding-inline:\s*20px/);
    expect(rule).not.toMatch(/padding(-block|-top|-bottom)?\s*:/);
    expect(rule).not.toMatch(/border(-left)?\s*:/);
    expect(rule).not.toMatch(/height/);
  });
});

describe("3 — o voltar do detalhe leva ao dia de onde a pessoa saiu (2026-10-12)", () => {
  beforeEach(() => {
    // Hoje é 12/10; a pessoa estava no dia 13.
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
    window.innerWidth = 390;
    wide(false);
    const day13 = appointmentFixture({ date: "2026-10-13" });
    listAppointments.mockResolvedValue([day13]);
    getAppointment.mockResolvedValue(day13);
  });

  test("a Agenda aberta com ?dia=2026-10-13 mostra o dia 13, e o atendimento dele leva a origem no link", async () => {
    renderBoard("2026-10-13");
    expect(await screen.findByRole("button", { name: /13/ })).toHaveAttribute(
      "aria-current",
      "date",
    );
    expect(
      await screen.findByRole("link", { name: /Ana Paula/ }),
    ).toHaveAttribute(
      "href",
      "/agenda/agendamento?id=apt-1&voltar=%2Fagenda%3Fdia%3D2026-10-13",
    );
  });

  test("a página /agenda repassa o ?dia= da URL do servidor para a Agenda", async () => {
    const page = AgendaPage({
      searchParams: Promise.resolve({ dia: "2026-10-13" }),
    });
    const inner = page.type as (props: unknown) => Promise<React.ReactElement>;
    const screenElement = await inner(page.props);
    expect(screenElement.props).toMatchObject({ initialDate: "2026-10-13" });
  });

  test("o voltar do detalhe aponta para a origem /agenda?dia=2026-10-13", async () => {
    renderRoute("apt-1", "/agenda?dia=2026-10-13");
    await screen.findByRole("heading", { name: "Ana Paula" });
    expect(
      screen.getByRole("link", { name: "Voltar para a agenda" }),
    ).toHaveAttribute("href", "/agenda?dia=2026-10-13");
    // Remarcar e Cancelar levam a origem adiante.
    expect(screen.getByRole("link", { name: "Remarcar" })).toHaveAttribute(
      "href",
      "/agenda/reagendar?id=apt-1&voltar=%2Fagenda%3Fdia%3D2026-10-13",
    );
  });

  test("sem origem, o voltar vai ao dia do atendimento", async () => {
    renderRoute("apt-1");
    await screen.findByRole("heading", { name: "Ana Paula" });
    expect(
      screen.getByRole("link", { name: "Voltar para a agenda" }),
    ).toHaveAttribute("href", "/agenda?dia=2026-10-13");
  });

  test.each([
    "https://outro.site/agenda",
    "//outro.site/agenda",
    "/\\outro.site",
    "javascript:alert(1)",
  ])(
    "origem externa (%s) é ignorada e o voltar vai ao dia do atendimento",
    async (origin) => {
      renderRoute("apt-1", origin);
      await screen.findByRole("heading", { name: "Ana Paula" });
      expect(
        screen.getByRole("link", { name: "Voltar para a agenda" }),
      ).toHaveAttribute("href", "/agenda?dia=2026-10-13");
      expect(screen.getByRole("link", { name: "Remarcar" })).toHaveAttribute(
        "href",
        "/agenda/reagendar?id=apt-1",
      );
    },
  );

  test("regras puras: dia inválido é ignorado e só caminho interno vale", () => {
    expect(agendaDayParam("2026-10-13")).toBe("2026-10-13");
    expect(agendaDayParam("2026-02-30")).toBeNull();
    expect(agendaDayParam("13/10/2026")).toBeNull();
    expect(internalReturnTo("/agenda?dia=2026-10-13")).toBe(
      "/agenda?dia=2026-10-13",
    );
    expect(internalReturnTo("//x.com")).toBeNull();
    expect(appointmentBackHref(undefined, null)).toBe("/agenda");
  });

  test("a Agenda ignora ?dia= inválido e abre em hoje", async () => {
    renderBoard("2026-99-99");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /12/ })).toHaveAttribute(
        "aria-current",
        "date",
      ),
    );
  });
});
