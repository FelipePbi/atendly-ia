// @vitest-environment jsdom
/**
 * Regressões da validação de 2026-10-12 na Agenda:
 *
 * 1. Painel do Dia a partir de 1024 px (D-165). Problema evitado: ao
 *    selecionar um atendimento, o painel mostrava um conteúdo fora do
 *    protótipo — cartão de topo, "Ver detalhes completos", o bloco "Ciclo do
 *    atendimento" com botões em linhas e o histórico antigo — em vez do corpo
 *    do quadro A5 que a rota `/agenda/agendamento` já mostrava.
 * 2. Visualização lembrada no aparelho. Problema evitado: quem deixava a
 *    Agenda em Mês voltava e a encontrava de novo em Dia ou Semana.
 *
 * Relógio fixo: terça 29/09/2026, 12:00 (o atendimento das 10:00 já começou,
 * então o "•••" oferece Concluir e Não compareceu).
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Appointment, CalendarState } from "@/data";
import {
  AGENDA_VIEW_STORAGE_KEY,
  AgendaBoard,
} from "@/features/agenda/AgendaBoard";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getAppointment = vi.fn();
const getCalendar = vi.fn();
const listAppointments = vi.fn();
const confirmAppointmentPresence = vi.fn();
const getAgendaViewPreference = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  useProductRuntime: () => ({ session: null }),
  getProductServices: () => ({
    calendar: {
      confirmAppointmentPresence,
      getAppointment,
      getCalendar,
      listAppointmentEvents: () => Promise.resolve([]),
      listAppointmentNotifications: () => Promise.resolve([]),
      listAppointments,
      listAvailabilityExceptions: () => Promise.resolve([]),
      listTimeBlocks: () => Promise.resolve([]),
    },
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

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 1366;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0));
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([appointmentFixture()]);
  getAppointment.mockResolvedValue(appointmentFixture());
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

async function selectAnaPaula(user: ReturnType<typeof setup>) {
  await user.click(await screen.findByRole("button", { name: /Ana Paula/ }));
  return within(
    screen.getByRole("complementary", { name: "Detalhe do agendamento" }),
  );
}

describe("painel do Dia a partir de 1024 px mostra o corpo do quadro A5 (D-165)", () => {
  test("selecionar um atendimento mostra horário, estado, cliente e as ações no •••, sem o conteúdo antigo", async () => {
    const user = setup();
    const { container } = renderBoard();
    expect(
      await screen.findByText("Selecione um atendimento para ver os detalhes"),
    ).toBeVisible();

    const panel = await selectAnaPaula(user);

    expect(
      await panel.findByRole("heading", { name: "Ana Paula" }),
    ).toBeVisible();
    expect(panel.getByText("10:00")).toBeVisible();
    expect(panel.getByText("Confirmado")).toBeVisible();
    expect(panel.getByRole("heading", { name: "Serviços" })).toBeVisible();
    expect(panel.getByRole("heading", { name: "Histórico" })).toBeVisible();
    expect(panel.getByRole("link", { name: "Remarcar" })).toHaveAttribute(
      "href",
      // A origem vai junto: o retorno volta ao dia do painel (D-167).
      "/agenda/reagendar?id=apt-1&voltar=%2Fagenda%3Fdia%3D2026-09-29",
    );
    expect(panel.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/agenda/cancelar?id=apt-1&voltar=%2Fagenda%3Fdia%3D2026-09-29",
    );

    await user.click(
      panel.getByRole("button", { name: "Mais ações do agendamento" }),
    );
    const items = panel
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items).toEqual([
      "Concluir atendimento",
      "Não compareceu",
      "Confirmar presença",
      "Registrar valor final",
    ]);

    // O conteúdo antigo do painel (D-089) não volta.
    expect(screen.queryByText("Ciclo do atendimento")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Ver detalhes completos" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Marcar falta" })).toBeNull();
    // A lista já está ao lado: o painel não tem voltar.
    expect(
      panel.queryByRole("link", { name: "Voltar para a agenda" }),
    ).toBeNull();

    await expectNoA11yViolations(container);
  });

  test("enquanto o agendamento carrega, o painel já mostra o que a lista sabe dele, ocupado e sem esqueleto", async () => {
    getAppointment.mockReturnValue(new Promise(() => undefined));
    const user = setup();
    renderBoard();

    const panel = await selectAnaPaula(user);

    // Decisão do usuário (2026-10-12, D-168): a semente da lista entra na
    // hora; o painel fica ocupado até a leitura completar, sem esqueleto.
    expect(panel.getByRole("heading", { name: "Ana Paula" })).toBeVisible();
    expect(panel.queryByLabelText("Carregando agendamento")).toBeNull();
    expect(
      screen
        .getByRole("complementary", { name: "Detalhe do agendamento" })
        .querySelector(".skeleton"),
    ).toBeNull();
    expect(
      document.querySelector(".agenda-day-detail .agenda-appt"),
    ).toHaveAttribute("aria-busy", "true");
  });

  test("leitura que falha mostra o mesmo erro da rota", async () => {
    getAppointment.mockRejectedValue(new Error("falhou"));
    const user = setup();
    renderBoard();

    const panel = await selectAnaPaula(user);

    expect(await panel.findByText("Agendamento indisponível")).toBeVisible();
  });

  test("uma ação do ••• atualiza o painel sem recarregar a Agenda", async () => {
    confirmAppointmentPresence.mockResolvedValue({
      completedAt: null,
      completionOrigin: null,
      finalValue: null,
      noShowAt: null,
      noShowNote: null,
      presenceConfirmedAt: "2026-09-29T14:30:00.000Z",
      status: "CONFIRMED",
    });
    const user = setup();
    renderBoard();
    const panel = await selectAnaPaula(user);
    await panel.findByRole("heading", { name: "Ana Paula" });
    const listCalls = listAppointments.mock.calls.length;

    await user.click(
      panel.getByRole("button", { name: "Mais ações do agendamento" }),
    );
    await user.click(
      panel.getByRole("menuitem", { name: "Confirmar presença" }),
    );

    await waitFor(() =>
      expect(confirmAppointmentPresence).toHaveBeenCalledWith("apt-1"),
    );
    await user.click(
      panel.getByRole("button", { name: "Mais ações do agendamento" }),
    );
    await waitFor(() =>
      expect(
        panel.queryByRole("menuitem", { name: "Confirmar presença" }),
      ).toBeNull(),
    );
    expect(panel.getByRole("heading", { name: "Ana Paula" })).toBeVisible();
    expect(listAppointments).toHaveBeenCalledTimes(listCalls);
  });
});

/**
 * Pedido de 2026-10-12: trocar de atendimento trocava o painel sem sinal de
 * carregamento. Agora só o corpo do detalhe vira esqueleto (aria-busy) até o
 * novo atendimento chegar, sem mostrar o anterior, sem recarregar a lista, a
 * barra ou a página, e uma resposta atrasada do anterior não sobrescreve o
 * novo.
 */
describe("trocar de atendimento mostra o esqueleto só no detalhe até o novo chegar (2026-10-12)", () => {
  type Pending = { id: string; resolve: (value: Appointment) => void };
  let pending: Pending[];

  const ana = () => appointmentFixture();
  const bruna = () =>
    appointmentFixture({
      customer: { id: "c2", name: "Bruna Costa", phone: "5511977776655" },
      customerId: "c2",
      endTime: "15:00",
      id: "apt-2",
      startTime: "14:00",
    });

  beforeEach(() => {
    pending = [];
    listAppointments.mockResolvedValue([ana(), bruna()]);
    getAppointment.mockImplementation(
      (id: string) =>
        new Promise<Appointment>((resolve) => pending.push({ id, resolve })),
    );
  });

  function answer(index: number, appointment: Appointment) {
    const call = pending[index];
    expect(call?.id).toBe(appointment.id);
    call?.resolve(appointment);
  }

  function expectBusyOnlyInside(region: HTMLElement) {
    const busy = Array.from(document.querySelectorAll('[aria-busy="true"]'));
    expect(busy.length).toBeGreaterThan(0);
    for (const element of busy) expect(region.contains(element)).toBe(true);
  }

  test("no painel do Dia: A, depois B na hora pela semente da lista, ocupado e sem esqueleto; a lista e a barra ficam", async () => {
    const user = setup();
    renderBoard();
    const panelRegion = () =>
      screen.getByRole("complementary", { name: "Detalhe do agendamento" });

    await user.click(await screen.findByRole("button", { name: /Ana Paula/ }));
    answer(0, ana());
    expect(
      await within(panelRegion()).findByRole("heading", { name: "Ana Paula" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Bruna Costa/ }));
    const panel = within(panelRegion());
    // Sem esqueleto (decisão do usuário, 2026-10-12): B entra na hora com o
    // que a lista sabe, ocupado até a leitura completar; nada de A fica.
    expect(panel.getByRole("heading", { name: "Bruna Costa" })).toBeVisible();
    expect(
      panel.queryByRole("status", { name: "Carregando agendamento" }),
    ).toBeNull();
    expect(panelRegion().querySelector(".skeleton")).toBeNull();
    expect(panelRegion().querySelector(".agenda-appt")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(panel.queryByRole("heading", { name: "Ana Paula" })).toBeNull();
    expect(panel.queryByText("10:00")).toBeNull();
    // Só o detalhe carrega: a lista do dia, as abas e o "Novo" seguem na tela.
    expectBusyOnlyInside(panelRegion());
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(screen.getByRole("button", { name: /Ana Paula/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Bruna Costa/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Dia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(listAppointments).toHaveBeenCalledTimes(1);

    answer(1, bruna());
    expect(
      await within(panelRegion()).findByRole("heading", {
        name: "Bruna Costa",
      }),
    ).toBeVisible();
    expect(within(panelRegion()).getByText("14:00")).toBeVisible();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  test("no painel do Dia: a resposta atrasada de A não sobrescreve B", async () => {
    const user = setup();
    renderBoard();
    const panelRegion = () =>
      screen.getByRole("complementary", { name: "Detalhe do agendamento" });

    await user.click(await screen.findByRole("button", { name: /Ana Paula/ }));
    await user.click(screen.getByRole("button", { name: /Bruna Costa/ }));
    answer(1, bruna());
    expect(
      await within(panelRegion()).findByRole("heading", {
        name: "Bruna Costa",
      }),
    ).toBeVisible();

    answer(0, ana());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(
      within(panelRegion()).getByRole("heading", { name: "Bruna Costa" }),
    ).toBeVisible();
    expect(
      within(panelRegion()).queryByRole("heading", { name: "Ana Paula" }),
    ).toBeNull();
  });

  test("na rota /agenda/agendamento, trocar pela coluna não mostra esqueleto e ignora a resposta antiga", async () => {
    // A partir de 1024 px a coluna do Dia fica ao lado do detalhe.
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          addEventListener: () => undefined,
          matches: true,
          media: query,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    const view = render(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    const detailRegion = () =>
      view.container.querySelector<HTMLElement>(".agenda-appt")!;

    answer(0, ana());
    expect(
      await screen.findByRole("heading", { name: "Ana Paula" }),
    ).toBeVisible();
    const column = await screen.findByRole("link", { name: /Bruna Costa/ });

    view.rerender(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-2" />
      </ShellConfigProvider>,
    );
    // Sem esqueleto (decisão do usuário, 2026-10-12): o detalhe fica ocupado
    // e mostra o que já se sabe de B (a coluna o leu) ou, se nada, A até B chegar.
    expect(
      screen.queryByRole("status", { name: "Carregando agendamento" }),
    ).toBeNull();
    expect(detailRegion().querySelector(".skeleton")).toBeNull();
    expect(detailRegion()).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByRole("heading", { name: "Bruna Costa" }) ??
        screen.queryByRole("heading", { name: "Ana Paula" }),
    ).not.toBeNull();
    expectBusyOnlyInside(detailRegion());
    // A coluna do Dia não some nem recarrega durante a troca.
    expect(column).toBeInTheDocument();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();

    // Volta para A e logo vai para B: B responde primeiro, A chega depois.
    view.rerender(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    view.rerender(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-2" />
      </ShellConfigProvider>,
    );
    answer(pending.length - 1, bruna());
    answer(pending.length - 2, ana());
    answer(1, bruna());
    expect(
      await screen.findByRole("heading", { name: "Bruna Costa" }),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByRole("heading", { name: "Bruna Costa" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Ana Paula" })).toBeNull();
    expect(
      document.querySelector('[aria-busy="true"]')?.outerHTML ?? null,
    ).toBeNull();
  });
});

describe("a Agenda lembra a última visualização escolhida neste aparelho", () => {
  test("trocar para Mês grava a escolha, e a Agenda remontada abre em Mês mesmo com a preferência do negócio em Dia", async () => {
    const user = setup();
    const first = renderBoard();
    await user.click(await screen.findByRole("tab", { name: "Mês" }));
    expect(window.localStorage.getItem(AGENDA_VIEW_STORAGE_KEY)).toBe("month");
    first.unmount();

    renderBoard();

    expect(await screen.findByRole("tab", { name: "Mês" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => expect(getAgendaViewPreference).toHaveBeenCalled());
    expect(screen.getByRole("tab", { name: "Mês" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("a escolha automática por largura não grava nada", async () => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: null,
    });
    renderBoard();
    expect(await screen.findByRole("tab", { name: "Semana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(window.localStorage.getItem(AGENDA_VIEW_STORAGE_KEY)).toBeNull();
  });

  test("valor inválido no storage é ignorado e vale o padrão de hoje", async () => {
    window.localStorage.setItem(AGENDA_VIEW_STORAGE_KEY, "agenda-antiga");
    window.innerWidth = 390;
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: null,
    });
    renderBoard();

    expect(await screen.findByRole("tab", { name: "Dia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("storage indisponível (navegação privada) cai no padrão de hoje e a troca continua funcionando", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: null,
    });
    const user = setup();
    renderBoard();

    expect(await screen.findByRole("tab", { name: "Semana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("tab", { name: "Mês" }));
    expect(screen.getByRole("tab", { name: "Mês" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
