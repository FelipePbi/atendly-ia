// @vitest-environment jsdom
/**
 * Goal093 — detalhe, cancelar e remarcar iguais ao protótipo (A5, A8, A9;
 * D-110, estendendo D-103).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. de 1024 px em diante, detalhe, cancelamento e remarcação montam a coluna
 *    da Agenda com exatamente uma linha `aria-current="page"`, a do agendamento
 *    aberto; abaixo de 1024 px a coluna não é montada, não busca nada, a casca
 *    é tela empurrada e a barra de abas não aparece;
 * 2. cada árvore chama `useShellConfig` uma única vez, nas três rotas e nas
 *    duas faixas;
 * 3. o detalhe mostra horário, status, cliente com telefone formatado,
 *    serviços, lembrete e histórico; "Remarcar" e "Cancelar" levam às rotas
 *    certas; Concluir e Não compareceu vivem no menu "•••" com as mesmas
 *    chamadas; não há "Editar" nem "Adicionar";
 * 4. "Conversa" só existe com `customerId` e leitura que responde, e nunca
 *    vira erro na tela;
 * 5. cancelar é um passo: a sheet é a confirmação e um toque envia uma vez;
 * 6. remarcar mostra "Horário atual" e "Novo horário" conforme a escolha e
 *    envia o mesmo pedido de sempre, com `notifyCustomer` marcado;
 * 7. fonte que não é `AVENLY`, ou agendamento cancelado, não oferece
 *    Remarcar, Cancelar nem as ações do menu.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pela comparação com o protótipo e pelo gate renderizado (G-7).
 */

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type {
  Appointment,
  AppointmentEvent,
  AppointmentHold,
  AppointmentLifecycle,
  AppointmentNotification,
  CalendarState,
  CustomerDetail,
} from "@/data";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { CancelFlow } from "@/features/agenda/CancelFlow";
import { RescheduleFlow } from "@/features/agenda/RescheduleFlow";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/agenda/agendamento",
  useRouter: () => router,
}));

const shellCallers = vi.hoisted(() => new Set<string>());

vi.mock("@/shared/layout/ShellConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof ShellConfigModule>();
  return {
    ...actual,
    useShellConfig: (config: ShellConfig) => {
      shellCallers.add(useId());
      actual.useShellConfig(config);
    },
  };
});

const cancelAppointment = vi.fn();
const completeAppointment = vi.fn();
const confirmAppointmentPresence = vi.fn();
const createHold = vi.fn();
const customersGet = vi.fn();
const conversationsList = vi.fn();
const getAgendaViewPreference = vi.fn();
const getAppointment = vi.fn();
const getAvailability = vi.fn();
const getCalendar = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const markAppointmentNoShow = vi.fn();
const notificationsSummary = vi.fn();
const releaseHold = vi.fn();
const rescheduleAppointment = vi.fn();
const serviceCatalogList = vi.fn();
const statusGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    calendar: {
      cancelAppointment,
      completeAppointment,
      confirmAppointmentPresence,
      createHold,
      getAppointment,
      getAvailability,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
      markAppointmentNoShow,
      releaseHold,
      rescheduleAppointment,
    },
    conversations: { list: conversationsList },
    customers: { get: customersGet },
    notifications: { summary: notificationsSummary },
    serviceCatalog: { list: serviceCatalogList },
    settings: { getAgendaViewPreference },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { id: "t1", name: "Studio Marina" },
      user: {
        email: "dona@studiomarina.com.br",
        id: "user-dona",
        name: "Marina Alves",
      },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

const WIDE = 1280;
const NARROW = 390;

/** Passado: o atendimento já começou, então Concluir e Não compareceu existem. */
const PAST_DATE = "2026-09-14";
/** Futuro: a remarcação parte da própria data e o horário ainda não começou. */
const FUTURE_DATE = "2099-01-05";

function setViewport(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: min ? width >= Number(min[1]) : false,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    },
    writable: true,
  });
}

function calendarFixture(overrides: Partial<CalendarState> = {}): CalendarState {
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
    customer: { id: "cus-ana", name: "Ana Paula", phone: "11998887766" },
    customerId: "cus-ana",
    date: PAST_DATE,
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
        serviceId: "svc-corte",
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

function otherAppointmentFixture(date: string): Appointment {
  return appointmentFixture({
    customer: { id: "cus-bia", name: "Beatriz Lima", phone: "11977776666" },
    customerId: "cus-bia",
    date,
    endTime: "15:00",
    id: "apt-2",
    startTime: "14:00",
  });
}

function eventFixture(overrides: Partial<AppointmentEvent> = {}): AppointmentEvent {
  return {
    actor: "user-dona",
    after: null,
    before: null,
    id: "evt-1",
    occurredAt: "2026-09-14T13:00:00.000Z",
    reason: null,
    sequence: "1",
    source: "USER",
    type: "CREATED",
    ...overrides,
  };
}

function notificationFixture(
  overrides: Partial<AppointmentNotification> = {},
): AppointmentNotification {
  return {
    appointmentVersion: 1,
    dueAt: "2026-09-13T12:00:00.000Z",
    id: "ntf-1",
    kind: "REMINDER",
    reason: null,
    sentAt: null,
    settledAt: null,
    slot: "FIRST",
    state: "PENDING",
    ...overrides,
  };
}

function lifecycleFixture(
  overrides: Partial<AppointmentLifecycle> = {},
): AppointmentLifecycle {
  return {
    completedAt: null,
    completedBy: null,
    completionOrigin: null,
    finalValue: null,
    finalValueSetAt: null,
    finalValueSetBy: null,
    id: "apt-1",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    status: "CONFIRMED",
    ...overrides,
  };
}

function holdFixture(overrides: Partial<AppointmentHold> = {}): AppointmentHold {
  return {
    contactRef: null,
    customerId: "cus-ana",
    date: FUTURE_DATE,
    durationMinutes: 60,
    endTime: "11:00",
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    id: "hold-1",
    serviceIds: ["svc-corte"],
    source: "USER",
    startTime: "10:00",
    status: "ACTIVE",
    ...overrides,
  };
}

function customerDetailFixture(): CustomerDetail {
  return {
    appointmentStats: {
      averageIntervalDays: 49,
      cancelled: 1,
      completed: 9,
      firstAppointmentDate: "2025-03-05",
      noShows: 0,
    },
    createdAt: "2025-01-10T10:00:00.000Z",
    id: "cus-ana",
    lastAppointment: null,
    name: "Ana Paula",
    nextAppointment: null,
    notes: [],
    phone: "11998887766",
    primaryGuardian: null,
    tags: [],
  };
}

/** Os dados que a coluna da Agenda lê: só o Dia da semana do agendamento. */
const COLUMN_READS = [
  listAppointments,
  listTimeBlocks,
  listAvailabilityExceptions,
  getAgendaViewPreference,
] as const;

beforeEach(() => {
  shellCallers.clear();
  for (const mock of [
    cancelAppointment,
    completeAppointment,
    confirmAppointmentPresence,
    createHold,
    customersGet,
    conversationsList,
    getAgendaViewPreference,
    getAppointment,
    getAvailability,
    getCalendar,
    listAppointmentEvents,
    listAppointmentNotifications,
    listAppointments,
    listAvailabilityExceptions,
    listTimeBlocks,
    markAppointmentNoShow,
    notificationsSummary,
    releaseHold,
    rescheduleAppointment,
    serviceCatalogList,
    statusGet,
    router.push,
    router.replace,
  ]) {
    mock.mockReset();
  }
  setViewport(NARROW);
  getCalendar.mockResolvedValue(calendarFixture());
  getAppointment.mockResolvedValue(appointmentFixture());
  listAppointments.mockImplementation(() =>
    Promise.resolve([
      appointmentFixture(),
      otherAppointmentFixture(PAST_DATE),
      appointmentFixture({ date: FUTURE_DATE, id: "apt-futuro" }),
    ]),
  );
  listTimeBlocks.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  getAgendaViewPreference.mockResolvedValue({ hiddenWeekdays: [] });
  listAppointmentEvents.mockResolvedValue([eventFixture()]);
  listAppointmentNotifications.mockResolvedValue([notificationFixture()]);
  customersGet.mockResolvedValue(customerDetailFixture());
  conversationsList.mockResolvedValue([{ id: "conv-9" }]);
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [],
    managedExternally: false,
    source: "AVENLY",
  });
  statusGet.mockResolvedValue({
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-27T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  });
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  getAvailability.mockImplementation((query: { startDate: string }) =>
    Promise.resolve([
      { date: query.startDate, endTime: "10:00", startTime: "09:00" },
      { date: query.startDate, endTime: "11:00", startTime: "10:00" },
      { date: query.startDate, endTime: "12:00", startTime: "11:00" },
    ]),
  );
  createHold.mockImplementation(
    (input: { startTime: string; date: string }) =>
      Promise.resolve(
        holdFixture({ date: input.date, startTime: input.startTime }),
      ),
  );
  releaseHold.mockResolvedValue(holdFixture({ status: "RELEASED" }));
  rescheduleAppointment.mockResolvedValue(appointmentFixture());
  cancelAppointment.mockResolvedValue(
    appointmentFixture({ status: "CANCELLED" }),
  );
  completeAppointment.mockResolvedValue(
    lifecycleFixture({
      completedAt: "2026-09-14T14:00:00.000Z",
      completionOrigin: "MANUAL",
      status: "COMPLETED",
    }),
  );
  markAppointmentNoShow.mockResolvedValue(
    lifecycleFixture({
      noShowAt: "2026-09-14T14:00:00.000Z",
      status: "NO_SHOW",
    }),
  );
});

afterEach(() => {
  cleanup();
});

type Route = {
  name: string;
  screen: () => ReactElement;
};

/** Marcador neutro: a cliente aparece em qualquer versão das três telas. */
const LOADED = "Ana Paula";

const ROUTES: Route[] = [
  {
    name: "/agenda/agendamento",
    screen: () => <AppointmentDetail appointmentId="apt-1" />,
  },
  {
    name: "/agenda/cancelar",
    screen: () => <CancelFlow appointmentId="apt-1" />,
  },
  {
    name: "/agenda/reagendar",
    screen: () => <RescheduleFlow appointmentId="apt-1" />,
  },
];

async function renderRoute(route: Route, width: number) {
  setViewport(width);
  const utils = render(<PlatformLayout>{route.screen()}</PlatformLayout>);
  await screen.findAllByText(LOADED, { exact: false });
  return utils;
}

function renderBare(element: ReactElement) {
  return render(<ShellConfigProvider>{element}</ShellConfigProvider>);
}

function columnOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".list-detail-list");
}

function bottomNavOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('nav[class$="bottom-nav"]');
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Mais ações do agendamento" }),
  );
}

describe("1. composição: coluna da Agenda de 1024 px em diante, tela empurrada abaixo", () => {
  test.each(ROUTES)(
    "$name em largura de desktop monta a coluna com uma só linha marcada, a do agendamento aberto",
    async (route) => {
      const { container } = await renderRoute(route, WIDE);

      const column = await waitFor(() => {
        const found = columnOf(container);
        expect(found).not.toBeNull();
        return found as HTMLElement;
      });
      await waitFor(() =>
        expect(
          column.querySelectorAll('[aria-current="page"]'),
        ).toHaveLength(1),
      );
      const [current] = column.querySelectorAll('[aria-current="page"]');
      expect(current).toHaveTextContent("Ana Paula");
      // Outra linha do mesmo dia está na coluna, sem marca.
      expect(column).toHaveTextContent("Beatriz Lima");
      // As leituras do Dia aconteceram, uma vez cada.
      for (const read of COLUMN_READS) expect(read).toHaveBeenCalled();
      expect(listAppointments).toHaveBeenCalledTimes(1);
      // A barra comum da Agenda (D-108) fica ao lado, com "Dia" marcado.
      expect(
        within(container).getByRole("link", { name: /Novo/ }),
      ).toHaveAttribute("href", "/agenda/novo");
    },
  );

  test.each(ROUTES)(
    "$name abaixo de 1024 px é tela empurrada: sem coluna, sem leituras dela e sem barra de abas",
    async (route) => {
      const { container } = await renderRoute(route, NARROW);

      expect(columnOf(container)).toBeNull();
      expect(container.querySelector(".list-detail")).toBeNull();
      expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
      expect(bottomNavOf(container)).toBeNull();
      // A coluna não é montada, então nenhum hook de dados dela busca.
      for (const read of COLUMN_READS) expect(read).not.toHaveBeenCalled();
    },
  );
});

describe("2. uma chamada de useShellConfig por árvore renderizada", () => {
  test.each(
    ROUTES.flatMap((route) => [
      { route, width: WIDE, label: "1280 px" },
      { route, width: NARROW, label: "390 px" },
    ]),
  )("$route.name em $label", async ({ route, width }) => {
    const { container } = await renderRoute(route, width);
    if (width === WIDE) {
      await waitFor(() =>
        expect(
          columnOf(container)?.querySelectorAll('[aria-current="page"]'),
        ).toHaveLength(1),
      );
    }

    expect(shellCallers.size).toBe(1);
  });
});

describe("3. detalhe (A5)", () => {
  test("mostra horário, status, cliente, serviços, lembrete, observações e histórico", async () => {
    renderBare(<AppointmentDetail appointmentId="apt-1" />);

    expect(
      await screen.findByText("10:00", { selector: ".agenda-appt-hero" }),
    ).toBeVisible();
    expect(screen.getByText("Confirmado")).toBeVisible();
    expect(screen.getByText("Ana Paula")).toBeVisible();
    // Telefone formatado (D-099) e contagem lida do cliente.
    expect(
      await screen.findByText("(11) 99888-7766 · 9 atendimentos"),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Serviços" }),
    ).toBeVisible();
    expect(screen.getByText("Corte feminino")).toBeVisible();
    // Duração, preço do serviço e total.
    expect(screen.getAllByText("1 h · R$ 90")).toHaveLength(2);
    expect(screen.getByText("Total")).toBeVisible();
    // Lembrete a partir do estado lido, nunca de uma data calculada na tela.
    expect(await screen.findByText(/^Será enviado /)).toBeVisible();
    expect(listAppointmentNotifications).toHaveBeenCalledWith(
      "apt-1",
      expect.anything(),
    );
    expect(screen.getByText("Nenhuma observação.")).toBeVisible();
    // Histórico com autoria: o nome da pessoa, nunca o identificador.
    const item = await screen.findByRole("listitem");
    expect(within(item).getByText(/Criado/)).toBeVisible();
    expect(within(item).getByText("Marina Alves")).toBeVisible();
  });

  test("Remarcar e Cancelar levam às rotas certas, com o id do agendamento", async () => {
    renderBare(<AppointmentDetail appointmentId="apt-1" />);

    expect(await screen.findByRole("link", { name: "Remarcar" })).toHaveAttribute(
      "href",
      "/agenda/reagendar?id=apt-1",
    );
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/agenda/cancelar?id=apt-1",
    );
    expect(
      screen.queryByRole("link", { name: /Reagendar/ }),
    ).not.toBeInTheDocument();
  });

  test("Concluir atendimento vive no menu e chama a mesma rota de conclusão", async () => {
    renderBare(<AppointmentDetail appointmentId="apt-1" />);
    const user = userEvent.setup();

    expect(
      screen.queryByRole("button", { name: "Concluir atendimento" }),
    ).not.toBeInTheDocument();
    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Concluir atendimento" }),
    );

    await waitFor(() => expect(completeAppointment).toHaveBeenCalledWith("apt-1"));
    expect(completeAppointment).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Concluído")).toBeVisible();
  });

  test("Não compareceu vive no menu e chama a mesma rota de falta, com a observação", async () => {
    renderBare(<AppointmentDetail appointmentId="apt-1" />);
    const user = userEvent.setup();

    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Não compareceu" }),
    );
    await user.type(
      screen.getByLabelText("Observação da falta (opcional)"),
      "Avisou depois",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar falta" }));

    await waitFor(() =>
      expect(markAppointmentNoShow).toHaveBeenCalledWith("apt-1", {
        note: "Avisou depois",
      }),
    );
    expect(markAppointmentNoShow).toHaveBeenCalledTimes(1);
  });

  test("não há Editar nem Adicionar: o contrato não tem essas operações", async () => {
    renderBare(<AppointmentDetail appointmentId="apt-1" />);
    const user = userEvent.setup();

    await screen.findByRole("link", { name: "Remarcar" });
    await openMenu(user);
    await screen.findByRole("menuitem", { name: "Concluir atendimento" });

    expect(
      screen.queryByRole("menuitem", { name: /Editar/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Editar|Adicionar/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Adicionar/)).not.toBeInTheDocument();
  });
});

describe("4. Conversa só com customerId e leitura que responde", () => {
  test("com customerId, Conversa leva à primeira conversa da cliente", async () => {
    renderBare(<AppointmentDetail appointmentId="apt-1" />);

    const link = await screen.findByRole("link", { name: "Conversa" });
    expect(link).toHaveAttribute("href", "/conversas/conv-9");
    expect(conversationsList).toHaveBeenCalledWith(
      { customerId: "cus-ana", limit: 1 },
      expect.anything(),
    );
  });

  test("sem customerId, o botão não aparece, nada é lido e não há erro", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture({
        customer: { id: "", name: "Cliente avulso", phone: "11998887766" },
        customerId: null,
      }),
    );
    renderBare(<AppointmentDetail appointmentId="apt-1" />);

    await screen.findByText("Cliente avulso");
    await screen.findByRole("link", { name: "Remarcar" });
    expect(
      screen.queryByRole("link", { name: "Conversa" }),
    ).not.toBeInTheDocument();
    expect(conversationsList).not.toHaveBeenCalled();
    expect(customersGet).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("com a leitura da conversa falhada, o botão não aparece e a tela não mostra erro", async () => {
    conversationsList.mockRejectedValue(new Error("falha"));
    customersGet.mockRejectedValue(new Error("falha"));
    renderBare(<AppointmentDetail appointmentId="apt-1" />);

    await screen.findByRole("link", { name: "Remarcar" });
    await waitFor(() => expect(conversationsList).toHaveBeenCalled());
    await waitFor(() => expect(customersGet).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Conversa" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Só o telefone, sem contagem.
    expect(screen.getByText("(11) 99888-7766")).toBeVisible();
  });
});

describe("5. cancelar em um passo (A8)", () => {
  beforeEach(() => {
    getAppointment.mockResolvedValue(
      appointmentFixture({ date: FUTURE_DATE }),
    );
  });

  test("um toque em Cancelar agendamento envia uma vez, com comments e notifyCustomer marcado, sem diálogo intermediário", async () => {
    renderBare(<CancelFlow appointmentId="apt-1" />);
    const user = userEvent.setup();

    const dialog = await screen.findByRole("dialog");
    expect(
      screen.queryByRole("button", { name: /Revisar cancelamento/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", {
        name: /Avisar a cliente pelo WhatsApp/,
      }),
    ).toBeChecked();
    await user.type(
      within(dialog).getByLabelText("Motivo (opcional, só para você)"),
      "Cliente pediu",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Cancelar agendamento" }),
    );

    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledTimes(1));
    expect(cancelAppointment.mock.calls[0][0]).toBe("apt-1");
    expect(cancelAppointment.mock.calls[0][1]).toEqual({
      comments: "Cliente pediu",
      notifyCustomer: true,
    });
    // Nenhum segundo passo: não existe "Confirmar cancelamento".
    expect(
      screen.queryByRole("button", { name: /Confirmar cancelamento/ }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        "/agenda/agendamento?id=apt-1",
      ),
    );
  });

  test("desmarcar o aviso envia notifyCustomer false", async () => {
    renderBare(<CancelFlow appointmentId="apt-1" />);
    const user = userEvent.setup();

    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: /Avisar a cliente pelo WhatsApp/,
      }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Cancelar agendamento" }),
    );

    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledTimes(1));
    expect(cancelAppointment.mock.calls[0][1]).toEqual({
      comments: undefined,
      notifyCustomer: false,
    });
  });

  test("Voltar leva ao detalhe do mesmo id e não cancela", async () => {
    renderBare(<CancelFlow appointmentId="apt-1" />);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Voltar" })).toHaveAttribute(
      "href",
      "/agenda/agendamento?id=apt-1",
    );
    expect(cancelAppointment).not.toHaveBeenCalled();
  });
});

describe("6. remarcar (A9)", () => {
  beforeEach(() => {
    getAppointment.mockResolvedValue(
      appointmentFixture({ date: FUTURE_DATE }),
    );
  });

  function boxValue(label: string): HTMLElement {
    return screen.getByText(label).nextElementSibling as HTMLElement;
  }

  test("Horário atual e Novo horário mudam conforme a escolha", async () => {
    renderBare(<RescheduleFlow appointmentId="apt-1" />);
    const user = userEvent.setup();

    await screen.findByRole("radio", { name: "10:00" });
    expect(boxValue("Horário atual")).toHaveTextContent(/· 10:00$/);
    expect(boxValue("Novo horário")).toHaveTextContent("—");

    await user.click(screen.getByRole("radio", { name: "09:00" }));
    await waitFor(() =>
      expect(boxValue("Novo horário")).toHaveTextContent(/· 09:00$/),
    );
    expect(boxValue("Horário atual")).toHaveTextContent(/· 10:00$/);

    await user.click(screen.getByRole("radio", { name: "11:00" }));
    await waitFor(() =>
      expect(boxValue("Novo horário")).toHaveTextContent(/· 11:00$/),
    );
  });

  test("Confirmar novo horário envia o mesmo pedido de sempre, com notifyCustomer marcado", async () => {
    renderBare(<RescheduleFlow appointmentId="apt-1" />);
    const user = userEvent.setup();

    expect(
      await screen.findByRole("checkbox", {
        name: /Avisar a cliente pelo WhatsApp/,
      }),
    ).toBeChecked();
    await user.click(await screen.findByRole("radio", { name: "11:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("button", { name: "Confirmar novo horário" }),
    );

    await waitFor(() => expect(rescheduleAppointment).toHaveBeenCalledTimes(1));
    expect(rescheduleAppointment.mock.calls[0][0]).toBe("apt-1");
    expect(rescheduleAppointment.mock.calls[0][1]).toEqual({
      date: FUTURE_DATE,
      holdId: "hold-1",
      notifyCustomer: true,
      overlapOverride: undefined,
      overlapOverrideReason: undefined,
      startTime: "11:00",
    });
  });
});

describe("7. sem Remarcar, Cancelar nem ações do menu fora do que a agenda permite", () => {
  test("fonte que não é AVENLY não oferece Remarcar, Cancelar nem menu", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({
        capabilities: {
          createAppointments: false,
          manageAvailability: false,
          manageCustomers: false,
          manageServices: false,
          migrate: false,
        },
        source: null,
        timezone: null,
      }),
    );
    renderBare(<AppointmentDetail appointmentId="apt-1" />);

    await screen.findByText("Ana Paula");
    expect(
      screen.queryByRole("link", { name: "Remarcar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mais ações do agendamento" }),
    ).not.toBeInTheDocument();
    expect(listAppointmentEvents).not.toHaveBeenCalled();
    expect(listAppointmentNotifications).not.toHaveBeenCalled();
  });

  test("agendamento cancelado não oferece Remarcar nem Cancelar, e o menu não oferece ação de ciclo", async () => {
    getAppointment.mockResolvedValue(appointmentFixture({ status: "CANCELLED" }));
    renderBare(<AppointmentDetail appointmentId="apt-1" />);
    const user = userEvent.setup();

    expect(await screen.findByText("Cancelado")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Remarcar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
    const menu = screen.queryByRole("button", {
      name: "Mais ações do agendamento",
    });
    if (menu) {
      await user.click(menu);
      for (const name of [
        "Concluir atendimento",
        "Não compareceu",
        "Confirmar presença",
        "Registrar valor final",
      ]) {
        expect(
          screen.queryByRole("menuitem", { name }),
        ).not.toBeInTheDocument();
      }
    }
  });
});
