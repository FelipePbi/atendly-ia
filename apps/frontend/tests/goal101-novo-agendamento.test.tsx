// @vitest-environment jsdom
/**
 * Goal101 — novo agendamento igual ao protótipo (A6; D-111, estendendo D-110
 * (a) e D-103).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. de 1024 px em diante, `/agenda/novo` monta a coluna da Agenda e o
 *    formulário no painel, sem linha `aria-current="page"` e sem a coluna de
 *    320 px do dia à direita; abaixo de 1024 px a coluna não é montada, não
 *    busca nada, a casca é tela empurrada, a barra de abas não aparece e a
 *    barra própria tem "×" e o título;
 * 2. cada árvore chama `useShellConfig` uma única vez, nas duas faixas;
 * 3. a coluna segue a data escolhida no formulário; ‹ › da coluna mudam só o
 *    dia dela, nunca a data do formulário nem o texto do CTA;
 * 4. criar continua enviando o mesmo pedido, com um clique: `customerId`,
 *    `holdId` e os dois `serviceIds`; "Outro, sem cadastro" envia
 *    `serviceIds: []`, `title` e `durationMinutes`, sem `holdId`; o
 *    `customerId` da URL chega escolhido e trocável;
 * 5. "×" leva a `/agenda`, tem nome acessível e, ao sair da rota, a reserva do
 *    horário escolhido é liberada;
 * 6. "Avisar a cliente pelo WhatsApp" não é renderizado (D-098 (e)).
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pela comparação com o protótipo e pelo gate renderizado (G-8).
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
  AppointmentHold,
  AvailabilitySlot,
  CalendarState,
  CreateAppointmentInput,
  Customer,
  Service,
} from "@/data";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { addDays, formatDate, isoDate } from "@/features/agenda/occupancy";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/agenda/novo",
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

const createAppointment = vi.fn<
  (input: CreateAppointmentInput, key: string) => Promise<Appointment>
>();
const createHold = vi.fn();
const customersList = vi.fn();
const getAgendaViewPreference = vi.fn();
const settingsGet = vi.fn();
const getAvailability = vi.fn();
const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const notificationsSummary = vi.fn();
const releaseHold = vi.fn();
const serviceCatalogList = vi.fn();
const statusGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    calendar: {
      createAppointment,
      createHold,
      getAvailability,
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
      releaseHold,
    },
    customers: { list: customersList },
    notifications: { summary: notificationsSummary },
    serviceCatalog: { list: serviceCatalogList },
    settings: { get: settingsGet, getAgendaViewPreference },
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

const TODAY = isoDate(new Date());
const IN_TWO_DAYS = isoDate(addDays(new Date(), 2));

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
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
  };
}

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 60,
    id: "svc-corte",
    name: "Corte feminino",
    needsReview: false,
    price: 90,
    priceType: "FIXED",
    ...overrides,
  };
}

function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cus-ana",
    name: "Ana Paula",
    phone: "+5511999990000",
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
    customer: customerFixture(),
    customerId: "cus-ana",
    date: TODAY,
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

function holdFixture(overrides: Partial<AppointmentHold> = {}): AppointmentHold {
  return {
    contactRef: null,
    customerId: "cus-ana",
    date: TODAY,
    durationMinutes: 90,
    endTime: "10:30",
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    id: "hold-1",
    serviceIds: ["svc-corte", "svc-escova"],
    source: "USER",
    startTime: "09:00",
    status: "ACTIVE",
    ...overrides,
  };
}

/** Um agendamento hoje e outro daqui a dois dias: a coluna mostra um de cada vez. */
const APPOINTMENTS = [
  appointmentFixture(),
  appointmentFixture({
    customer: customerFixture({
      id: "cus-bia",
      name: "Beatriz Lima",
      phone: "+5511977776666",
    }),
    customerId: "cus-bia",
    date: IN_TWO_DAYS,
    endTime: "15:00",
    id: "apt-2",
    startTime: "14:00",
  }),
];

/** Os dados que a coluna da Agenda lê. */
const COLUMN_READS = [
  listAppointments,
  listTimeBlocks,
  listAvailabilityExceptions,
  getAgendaViewPreference,
] as const;

beforeEach(() => {
  shellCallers.clear();
  for (const mock of [
    createAppointment,
    createHold,
    customersList,
    getAgendaViewPreference,
    getAvailability,
    getCalendar,
    listAppointments,
    listAvailabilityExceptions,
    listTimeBlocks,
    notificationsSummary,
    releaseHold,
    settingsGet,
    serviceCatalogList,
    statusGet,
    router.push,
    router.replace,
  ]) {
    mock.mockReset();
  }
  setViewport(NARROW);
  getCalendar.mockResolvedValue(calendarFixture());
  settingsGet.mockResolvedValue({ availability: { rules: [] } });
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [
      serviceFixture(),
      serviceFixture({
        durationMinutes: 30,
        id: "svc-escova",
        name: "Escova",
        price: 60,
      }),
    ],
    managedExternally: false,
    source: "ATENDLY",
  });
  customersList.mockResolvedValue({
    items: [
      customerFixture(),
      customerFixture({ id: "cus-bia", name: "Bia Castro", phone: null }),
    ],
    managedExternally: false,
    source: "ATENDLY",
  });
  listAppointments.mockImplementation(
    (query: { endDate: string; startDate: string }) =>
      Promise.resolve(
        APPOINTMENTS.filter(
          (item) => item.date >= query.startDate && item.date <= query.endDate,
        ),
      ),
  );
  listTimeBlocks.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  getAgendaViewPreference.mockResolvedValue({ hiddenWeekdays: [] });
  getAvailability.mockImplementation((query: { startDate: string }) =>
    Promise.resolve<AvailabilitySlot[]>([
      { date: query.startDate, endTime: "10:30", startTime: "09:00" },
      { date: query.startDate, endTime: "11:30", startTime: "10:00" },
    ]),
  );
  createHold.mockImplementation((input: { date: string; startTime: string }) =>
    Promise.resolve(
      holdFixture({ date: input.date, startTime: input.startTime }),
    ),
  );
  releaseHold.mockResolvedValue(holdFixture({ status: "RELEASED" }));
  createAppointment.mockResolvedValue(appointmentFixture());
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
});

afterEach(() => {
  cleanup();
});

async function renderInLayout(width: number, customerId?: string) {
  setViewport(width);
  const utils = render(
    <PlatformLayout>
      <AppointmentForm customerId={customerId} />
    </PlatformLayout>,
  );
  await screen.findByRole("form", { name: "Novo agendamento" });
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

async function waitForColumn(container: HTMLElement): Promise<HTMLElement> {
  return waitFor(() => {
    const column = columnOf(container);
    expect(column).not.toBeNull();
    return column as HTMLElement;
  });
}

function dateButton(offset: number): HTMLElement {
  const label = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(addDays(new Date(), offset));
  return screen.getByRole("button", { name: label });
}

function columnDay(column: HTMLElement): HTMLElement {
  return within(column).getByRole("region", { name: /^Agenda de / });
}

function createButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Criar agendamento/ });
}

describe("1. composição: coluna da Agenda de 1024 px em diante, tela empurrada abaixo", () => {
  test("em largura de desktop monta a coluna e o formulário no painel, sem linha marcada e sem a coluna do dia à direita", async () => {
    const { container } = await renderInLayout(WIDE);

    const column = await waitForColumn(container);
    // O Dia de hoje chegou na coluna, com as linhas que a Agenda mostra.
    expect(await within(column).findByText("Ana Paula")).toBeVisible();
    expect(columnDay(column)).toHaveAccessibleName(
      `Agenda de ${formatDate(TODAY)}`,
    );
    // Nada está aberto: nenhuma linha leva a marca de página atual.
    expect(column.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    // O formulário vive no painel, ao lado da coluna.
    const panel = container.querySelector<HTMLElement>(".list-detail-panel");
    expect(panel).not.toBeNull();
    expect(
      within(panel as HTMLElement).getByRole("form", {
        name: "Novo agendamento",
      }),
    ).toBeVisible();
    // A coluna de 320 px com o dia e a pré-visualização saiu.
    expect(
      screen.queryByRole("complementary", { name: /^Dia / }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".agenda-new-day-panel")).toBeNull();
    // As leituras do Dia aconteceram, uma vez cada leitura de agendamentos.
    for (const read of COLUMN_READS) expect(read).toHaveBeenCalled();
    expect(listAppointments).toHaveBeenCalledTimes(1);
  });

  test("abaixo de 1024 px é tela empurrada: sem coluna, sem leituras dela, sem barra de abas, com × e título", async () => {
    const { container } = await renderInLayout(NARROW);

    expect(columnOf(container)).toBeNull();
    expect(container.querySelector(".list-detail")).toBeNull();
    expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
    expect(bottomNavOf(container)).toBeNull();
    // A barra própria: "×" à esquerda e o título da tela.
    expect(
      screen.getByRole("link", { name: /^Fechar/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Novo agendamento" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Voltar" }),
    ).not.toBeInTheDocument();
    // A coluna não é montada, então nenhum hook de dados dela busca.
    for (const read of COLUMN_READS) expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole("complementary", { name: /^Dia / })).toBeNull();
  });
});

describe("2. uma chamada de useShellConfig por árvore renderizada", () => {
  test("em 1280 px, com a coluna já montada", async () => {
    const { container } = await renderInLayout(WIDE);
    const column = await waitForColumn(container);
    await within(column).findByText("Ana Paula");

    expect(shellCallers.size).toBe(1);
  });

  test("em 390 px", async () => {
    await renderInLayout(NARROW);

    expect(shellCallers.size).toBe(1);
  });
});

describe("3. a coluna segue a data do formulário", () => {
  test("escolher outra data no formulário leva a coluna para esse dia", async () => {
    const { container } = await renderInLayout(WIDE, "cus-ana");
    const user = userEvent.setup();
    const column = await waitForColumn(container);
    expect(await within(column).findByText("Ana Paula")).toBeVisible();
    expect(
      within(column).queryByText("Beatriz Lima"),
    ).not.toBeInTheDocument();

    await user.click(dateButton(2));

    await waitFor(() =>
      expect(columnDay(column)).toHaveAccessibleName(
        `Agenda de ${formatDate(IN_TWO_DAYS)}`,
      ),
    );
    expect(await within(column).findByText("Beatriz Lima")).toBeVisible();
    expect(within(column).queryByText("Ana Paula")).not.toBeInTheDocument();
    expect(dateButton(2)).toHaveAttribute("aria-pressed", "true");
  });

  test("‹ › da coluna mudam o dia dela e não mudam a data do formulário nem o CTA", async () => {
    const { container } = await renderInLayout(WIDE, "cus-ana");
    const user = userEvent.setup();
    const column = await waitForColumn(container);
    await within(column).findByText("Ana Paula");

    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));
    await user.click(dateButton(2));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    expect((createHold.mock.calls[0][0] as { date: string }).date).toBe(
      IN_TWO_DAYS,
    );

    const ctaBefore = createButton().textContent;
    expect(createButton()).toHaveAccessibleName(
      new RegExp(
        `^Criar agendamento · \\S+ ${addDays(new Date(), 2).getDate()}, 09:00$`,
      ),
    );

    await user.click(screen.getByRole("button", { name: "Próximo dia" }));
    await waitFor(() =>
      expect(columnDay(column)).toHaveAccessibleName(
        `Agenda de ${formatDate(isoDate(addDays(new Date(), 3)))}`,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Dia anterior" }));
    await user.click(screen.getByRole("button", { name: "Dia anterior" }));
    await waitFor(() =>
      expect(columnDay(column)).toHaveAccessibleName(
        `Agenda de ${formatDate(isoDate(addDays(new Date(), 1)))}`,
      ),
    );

    // O formulário e o CTA ficaram onde estavam.
    expect(dateButton(2)).toHaveAttribute("aria-pressed", "true");
    expect(createButton().textContent).toBe(ctaBefore);
    expect(createButton()).toBeEnabled();
    expect(createHold).toHaveBeenCalledTimes(1);
    expect(releaseHold).not.toHaveBeenCalled();
  });
});

describe("4. criação preservada", () => {
  test("cliente cadastrado e dois serviços: um clique envia customerId, holdId e os dois serviceIds", async () => {
    renderBare(<AppointmentForm />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Nome do cliente"), "Ana");
    await user.click(screen.getByRole("button", { name: /Ana Paula/ }));
    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    expect(createHold.mock.calls[0][0]).toEqual({
      customerId: "cus-ana",
      date: TODAY,
      serviceIds: ["svc-corte", "svc-escova"],
      startTime: "09:00",
    });
    expect(createAppointment).not.toHaveBeenCalled();

    await user.click(createButton());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.customerId).toBe("cus-ana");
    expect(body.customerName).toBeUndefined();
    expect(body.holdId).toBe("hold-1");
    expect(body.serviceIds).toEqual(["svc-corte", "svc-escova"]);
    expect(body.startTime).toBe("09:00");
    expect(router.replace).toHaveBeenCalledWith("/agenda/agendamento?id=apt-1");
  });

  test("Outro, sem cadastro envia serviceIds vazio, title e durationMinutes, sem holdId", async () => {
    renderBare(<AppointmentForm customerId="cus-ana" />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Outro, sem cadastro" }),
    );
    await user.type(screen.getByLabelText("Título do atendimento"), "Retoque");
    await user.type(screen.getByLabelText("Duração em minutos"), "25");
    await user.type(
      screen.getByLabelText("Outro horário, fora dos oferecidos"),
      "11:30",
    );
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));
    await user.click(createButton());

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    const body = createAppointment.mock.calls[0][0];
    expect(body.serviceIds).toEqual([]);
    expect(body.title).toBe("Retoque");
    expect(body.durationMinutes).toBe(25);
    expect(body.holdId).toBeUndefined();
    expect(createHold).not.toHaveBeenCalled();
  });

  test("o customerId da URL chega escolhido e é trocável", async () => {
    renderBare(<AppointmentForm customerId="cus-ana" />);
    const user = userEvent.setup();

    expect(await screen.findByText("Ana Paula")).toBeVisible();
    expect(screen.queryByLabelText("Nome do cliente")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Trocar" }));

    expect(await screen.findByLabelText("Nome do cliente")).toBeVisible();
  });
});

describe("5. ×", () => {
  test("leva a /agenda e tem nome acessível", async () => {
    await renderInLayout(NARROW);

    const close = screen.getByRole("link", { name: /^Fechar( novo agendamento)?$/ });
    expect(close).toHaveAttribute("href", "/agenda");
    expect(close).toBeVisible();
  });

  test("em largura de desktop o × continua na barra do painel, com o mesmo destino", async () => {
    await renderInLayout(WIDE);

    expect(
      screen.getByRole("link", { name: /^Fechar( novo agendamento)?$/ }),
    ).toHaveAttribute("href", "/agenda");
  });

  test("com horário escolhido, a reserva é liberada ao sair da rota", async () => {
    const { unmount } = await renderInLayout(NARROW, "cus-ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    expect(releaseHold).not.toHaveBeenCalled();

    unmount();

    await waitFor(() => expect(releaseHold).toHaveBeenCalledWith("hold-1"));
  });
});

describe("5b. dia sem atendimento esmaecido na faixa de datas (A6)", () => {
  test("só o dia da semana sem regra ativa é marcado como fechado; sem regras nada é marcado", async () => {
    const closedWeekday = addDays(new Date(), 2).getDay();
    settingsGet.mockResolvedValue({
      availability: {
        rules: [0, 1, 2, 3, 4, 5, 6]
          .filter((day) => day !== closedWeekday)
          .map((dayOfWeek) => ({
            active: true,
            dayOfWeek,
            endTime: "18:00",
            startTime: "09:00",
          })),
      },
    });
    renderBare(<AppointmentForm customerId="cus-ana" />);

    await screen.findByRole("form", { name: "Novo agendamento" });
    await waitFor(() =>
      expect(document.querySelectorAll('[data-closed="true"]').length).toBe(1),
    );
    const closed = document.querySelector('[data-closed="true"]');
    expect(closed?.getAttribute("aria-label")).toBe(
      new Intl.DateTimeFormat("pt-BR", {
        day: "numeric",
        month: "long",
        weekday: "long",
      }).format(addDays(new Date(), 2)),
    );
  });

  test("sem regras de atendimento nenhum dia é esmaecido", async () => {
    renderBare(<AppointmentForm customerId="cus-ana" />);

    await screen.findByRole("form", { name: "Novo agendamento" });
    await waitFor(() => expect(settingsGet).toHaveBeenCalled());
    expect(document.querySelectorAll('[data-closed="true"]').length).toBe(0);
  });
});

describe("6. sem aviso à cliente na criação", () => {
  test("não há controle Avisar a cliente pelo WhatsApp", async () => {
    renderBare(<AppointmentForm customerId="cus-ana" />);
    const user = userEvent.setup();

    await screen.findByRole("form", { name: "Novo agendamento" });
    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));

    expect(
      screen.queryByRole("checkbox", { name: /Avisar a cliente/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: /Avisar a cliente/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Avisar a cliente/)).not.toBeInTheDocument();
  });
});
