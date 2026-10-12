// @vitest-environment jsdom
/**
 * Pedido do usuário de 2026-10-12 (D-170) — a tela "Novo agendamento" no
 * desktop e no tablet:
 *
 * 1. sem a barra da Agenda: nada de abas Dia/Semana/Mês, setas ‹ › nem
 *    "+ Novo"; fica só a barra do fluxo, com "×" e "Novo agendamento";
 * 2. só os 5 serviços mais usados à vista, ordenados por `usageCount`
 *    (atendimentos dos últimos 90 dias), empate na ordem do catálogo;
 * 3. "Ver outros serviços" abre um diálogo com os demais, com busca por nome
 *    quando são muitos; escolher ali seleciona o serviço, fecha o diálogo e o
 *    mostra entre os chips (a seleção nunca fica escondida);
 * 4. "Outro, sem cadastro" continua à vista;
 * 5. o pedido de criação continua igual;
 * 6. axe sem violações, com o diálogo fechado e aberto.
 *
 * Ampliação do mesmo dia (celular, tablet e desktop): revelação progressiva.
 * No começo só o Cliente; escolhido o cliente, Serviços; escolhido o serviço,
 * Data (com o dia pré-escolhido) e Horário; com o horário, "Criar agendamento"
 * fica ativo. O que abre preenchido aparece de uma vez, sem animação; o que
 * é revelado depois entra com `.motion-enter` (D-168), nunca com movimento
 * reduzido, e é anunciado em aria-live polite.
 */

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type {
  Appointment,
  AppointmentHold,
  AvailabilitySlot,
  CalendarState,
  CreateAppointmentInput,
  Service,
} from "@/data";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { servicesByUsage } from "@/features/agenda/NewAppointmentFields";
import { isoDate } from "@/features/agenda/occupancy";

import { expectNoA11yViolations } from "./support/a11y";
import { chooseDate, chooseManualTime } from "./support/pickers";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/agenda/novo",
  useRouter: () => router,
}));

const createAppointment =
  vi.fn<(input: CreateAppointmentInput, key: string) => Promise<Appointment>>();
const createHold = vi.fn();
const customersList = vi.fn();
const getAgendaViewPreference = vi.fn();
const getAvailability = vi.fn();
const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const notificationsSummary = vi.fn();
const releaseHold = vi.fn();
const serviceCatalogList = vi.fn();
const settingsGet = vi.fn();
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
      user: { email: "dona@studiomarina.com.br", id: "u1", name: "Marina" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

const DESKTOP = 1366;
const TABLET = 1024;
const TODAY = isoDate(new Date());

function setViewport(width: number, reducedMotion = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      const reduce = query.includes("prefers-reduced-motion: reduce");
      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: reduce ? reducedMotion : min ? width >= Number(min[1]) : false,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    },
    writable: true,
  });
}

function service(id: string, name: string, usageCount?: number): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 30,
    id,
    name,
    needsReview: false,
    price: 50,
    priceType: "FIXED",
    ...(usageCount === undefined ? {} : { usageCount }),
  };
}

/** Na ordem do catálogo (nome), como a API devolve. */
const CATALOG = [
  service("svc-coloracao", "Coloração", 2),
  service("svc-corte", "Corte feminino", 9),
  service("svc-masculino", "Corte masculino", 0),
  service("svc-escova", "Escova", 12),
  service("svc-hidratacao", "Hidratação", 5),
  service("svc-manicure", "Manicure", 0),
  service("svc-pedicure", "Pedicure", 2),
  service("svc-progressiva", "Progressiva", 1),
  service("svc-sobrancelha", "Sobrancelha", 0),
];

/** Escova 12, Corte 9, Hidratação 5 e o empate de 2 na ordem do catálogo. */
const MOST_USED = [
  "Escova",
  "Corte feminino",
  "Hidratação",
  "Coloração",
  "Pedicure",
];
const OTHERS = ["Progressiva", "Corte masculino", "Manicure", "Sobrancelha"];

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

function holdFixture(
  overrides: Partial<AppointmentHold> = {},
): AppointmentHold {
  return {
    contactRef: null,
    customerId: "cus-ana",
    date: TODAY,
    durationMinutes: 60,
    endTime: "10:00",
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    id: "hold-1",
    serviceIds: ["svc-escova", "svc-manicure"],
    source: "USER",
    startTime: "09:00",
    status: "ACTIVE",
    ...overrides,
  };
}

function catalog(items: Service[]) {
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items,
    managedExternally: false,
    source: "AVENLY",
  });
}

beforeEach(() => {
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
    serviceCatalogList,
    settingsGet,
    statusGet,
    router.push,
    router.replace,
  ]) {
    mock.mockReset();
  }
  getCalendar.mockResolvedValue(calendarFixture());
  settingsGet.mockResolvedValue({ availability: { rules: [] } });
  catalog(CATALOG);
  customersList.mockResolvedValue({
    items: [{ id: "cus-ana", name: "Ana Paula", phone: "+5511999990000" }],
    managedExternally: false,
    source: "AVENLY",
  });
  listAppointments.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  getAgendaViewPreference.mockResolvedValue({ hiddenWeekdays: [] });
  getAvailability.mockImplementation((query: { startDate: string }) =>
    Promise.resolve<AvailabilitySlot[]>([
      { date: query.startDate, endTime: "10:00", startTime: "09:00" },
    ]),
  );
  createHold.mockImplementation((input: { startTime: string }) =>
    Promise.resolve(holdFixture({ startTime: input.startTime })),
  );
  releaseHold.mockResolvedValue(holdFixture({ status: "RELEASED" }));
  createAppointment.mockResolvedValue({ id: "apt-1" } as Appointment);
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
      checkedAt: "2026-10-12T12:00:00.000Z",
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

/** Com o cliente já escolhido (vindo do perfil), Serviços abre à vista. */
async function renderNew(width = DESKTOP, customerId = "cus-ana") {
  setViewport(width);
  const utils = render(
    <PlatformLayout>
      <AppointmentForm customerId={customerId} />
    </PlatformLayout>,
  );
  await screen.findByRole("form", { name: "Novo agendamento" });
  await screen.findByRole("checkbox", { name: /Escova/ });
  return utils;
}

function serviceChips(): string[] {
  const group = screen.getByRole("group", { name: "Serviços" });
  return within(group)
    .getAllByRole("checkbox")
    .map(
      (box) => box.closest("label")?.textContent?.split("·")[0]?.trim() ?? "",
    );
}

describe("1. sem a barra da Agenda no novo agendamento (pedido de 2026-10-12)", () => {
  test.each([
    ["desktop", DESKTOP],
    ["tablet", TABLET],
  ])(
    "no %s não há abas Dia/Semana/Mês, setas nem + Novo; fica o × com o título",
    async (_label, width) => {
      const { container } = await renderNew(width);
      // A coluna do Dia continua ao lado (D-110/D-111).
      await waitFor(() =>
        expect(container.querySelector(".list-detail-list")).not.toBeNull(),
      );
      await waitFor(() => expect(listAppointments).toHaveBeenCalled());

      expect(
        screen.queryByRole("navigation", { name: "Visualização da agenda" }),
      ).not.toBeInTheDocument();
      for (const tab of ["Dia", "Semana", "Mês"]) {
        expect(
          screen.queryByRole("link", { name: tab }),
        ).not.toBeInTheDocument();
      }
      expect(
        screen.queryByRole("button", { name: "Dia anterior" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Próximo dia" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /^Novo$/ }),
      ).not.toBeInTheDocument();
      expect(container.querySelector(".agenda-command-bar")).toBeNull();

      expect(
        screen.getByRole("link", { name: "Fechar novo agendamento" }),
      ).toHaveAttribute("href", "/agenda");
      expect(
        screen.getByRole("heading", { level: 1, name: "Novo agendamento" }),
      ).toBeVisible();
    },
  );
});

describe("2. os 5 serviços mais usados", () => {
  test("aparecem só 5, ordenados por uso, e o empate segue o catálogo", async () => {
    await renderNew();

    expect(serviceChips()).toEqual(MOST_USED);
    for (const name of OTHERS) {
      expect(
        screen.queryByRole("checkbox", { name: new RegExp(name) }),
      ).not.toBeInTheDocument();
    }
    // "Outro, sem cadastro" continua à vista, ao lado de "Ver outros serviços".
    expect(
      screen.getByRole("button", { name: "Outro, sem cadastro" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Ver outros serviços" }),
    ).toBeVisible();
  });

  test("negócio sem atendimentos (sem usageCount) fica na ordem do catálogo", async () => {
    catalog(CATALOG.map(({ usageCount: _unused, ...item }) => item));
    await renderNew();

    expect(serviceChips()).toEqual([
      "Coloração",
      "Corte feminino",
      "Corte masculino",
      "Escova",
      "Hidratação",
    ]);
  });

  test("com 5 serviços ou menos não há Ver outros serviços", async () => {
    catalog(CATALOG.slice(0, 5));
    await renderNew();

    expect(serviceChips()).toHaveLength(5);
    expect(
      screen.queryByRole("button", { name: "Ver outros serviços" }),
    ).not.toBeInTheDocument();
  });

  test("servicesByUsage é estável no empate", () => {
    expect(
      servicesByUsage([
        { id: "a", usageCount: 1 },
        { id: "b", usageCount: 3 },
        { id: "c", usageCount: 1 },
        { id: "d" },
      ]).map((item) => item.id),
    ).toEqual(["b", "a", "c", "d"]);
  });
});

describe("3. Ver outros serviços", () => {
  test("abre um diálogo com os demais serviços", async () => {
    const user = userEvent.setup();
    await renderNew();

    await user.click(
      screen.getByRole("button", { name: "Ver outros serviços" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Outros serviços",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const options = within(dialog)
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label") !== "Fechar")
      .map((button) => button.textContent?.split("·")[0]?.trim());
    expect(options.map((text) => text?.replace(/\d.*$/, "").trim())).toEqual(
      OTHERS,
    );
    // Poucos serviços: sem busca.
    expect(within(dialog).queryByRole("searchbox")).not.toBeInTheDocument();
  });

  test("escolher no diálogo seleciona, fecha e mostra o serviço entre os chips", async () => {
    const user = userEvent.setup();
    await renderNew();

    await user.click(
      screen.getByRole("button", { name: "Ver outros serviços" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Outros serviços",
    });
    await user.click(within(dialog).getByRole("button", { name: /Manicure/ }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const manicure = screen.getByRole("checkbox", { name: /Manicure/ });
    expect(manicure).toBeChecked();
    expect(manicure).toHaveFocus();
    expect(serviceChips()).toEqual([...MOST_USED, "Manicure"]);
    expect(screen.getByText("1 serviço")).toBeVisible();

    // Desmarcar não esconde o serviço trazido da folha.
    await user.click(manicure);
    expect(
      screen.getByRole("checkbox", { name: /Manicure/ }),
    ).not.toBeChecked();

    // A folha seguinte mostra só os que ainda não estão à vista.
    await user.click(
      screen.getByRole("button", { name: "Ver outros serviços" }),
    );
    const next = await screen.findByRole("dialog", { name: "Outros serviços" });
    expect(
      within(next).queryByRole("button", { name: /Manicure/ }),
    ).not.toBeInTheDocument();
  });

  test("com muitos serviços, a busca por nome filtra a lista", async () => {
    catalog([
      ...CATALOG,
      ...Array.from({ length: 10 }, (_, index) =>
        service(`svc-extra-${index}`, `Extra ${index}`, 0),
      ),
      service("svc-design", "Design de sobrancelha", 0),
    ]);
    const user = userEvent.setup();
    await renderNew();

    await user.click(
      screen.getByRole("button", { name: "Ver outros serviços" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Outros serviços",
    });
    const search = within(dialog).getByRole("searchbox", {
      name: "Buscar serviço",
    });
    await waitFor(() => expect(search).toHaveFocus());

    await user.type(search, "sobrancel");

    const options = within(dialog)
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label") !== "Fechar");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("Sobrancelha"),
      expect.stringContaining("Design de sobrancelha"),
    ]);

    await user.clear(search);
    await user.type(search, "xyz");
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Nenhum serviço com “xyz”.",
    );
  });

  test("Esc fecha o diálogo sem escolher nada", async () => {
    const user = userEvent.setup();
    await renderNew();
    const opener = screen.getByRole("button", { name: "Ver outros serviços" });

    await user.click(opener);
    await screen.findByRole("dialog", { name: "Outros serviços" });
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(serviceChips()).toEqual(MOST_USED);
    expect(opener).toHaveFocus();
  });
});

describe("4. o pedido de criação continua igual", () => {
  test("serviço da folha e chip: customerId, holdId e os dois serviceIds, num clique", async () => {
    const user = userEvent.setup();
    await renderNew(DESKTOP, "cus-ana");

    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));
    await user.click(
      screen.getByRole("button", { name: "Ver outros serviços" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Outros serviços",
    });
    await user.click(within(dialog).getByRole("button", { name: /Manicure/ }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    expect(createHold.mock.calls[0][0]).toEqual({
      customerId: "cus-ana",
      date: TODAY,
      serviceIds: ["svc-escova", "svc-manicure"],
      startTime: "09:00",
    });

    await user.click(
      screen.getByRole("button", { name: /^Criar agendamento/ }),
    );

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0]).toEqual({
      comments: undefined,
      customerId: "cus-ana",
      customerName: undefined,
      customerPhone: undefined,
      date: TODAY,
      durationMinutes: undefined,
      holdId: "hold-1",
      overlapOverride: undefined,
      overlapOverrideReason: undefined,
      serviceIds: ["svc-escova", "svc-manicure"],
      startTime: "09:00",
      title: undefined,
    });
    expect(router.replace).toHaveBeenCalledWith("/agenda/agendamento?id=apt-1");
  });
});

describe("5. acessibilidade", () => {
  test("axe sem violações com o diálogo fechado e aberto", async () => {
    const user = userEvent.setup();
    const { container } = await renderNew();

    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole("button", { name: "Ver outros serviços" }),
    );
    await screen.findByRole("dialog", { name: "Outros serviços" });

    await expectNoA11yViolations(document.body);
  });
});

// Revelação progressiva (ampliação do pedido de 2026-10-12, D-170).
describe("6. revelação por etapas", () => {
  async function renderEmpty(width = DESKTOP, reducedMotion = false) {
    setViewport(width, reducedMotion);
    const utils = render(
      <PlatformLayout>
        <AppointmentForm />
      </PlatformLayout>,
    );
    await screen.findByRole("form", { name: "Novo agendamento" });
    return utils;
  }

  function liveRegion(container: HTMLElement): HTMLElement {
    return container.querySelector('[aria-live="polite"]') as HTMLElement;
  }

  test.each([
    ["celular", 390],
    ["desktop", DESKTOP],
  ])("no %s, no início só existe o Cliente", async (_label, width) => {
    const { container } = await renderEmpty(width);

    expect(screen.getByLabelText("Nome do cliente")).toBeVisible();
    expect(
      screen.queryByRole("group", { name: "Serviços" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Data" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /^Horário/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Criar agendamento/ }),
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  test("escolher o cliente revela Serviços, anuncia e leva o foco a eles", async () => {
    const user = userEvent.setup();
    const { container } = await renderEmpty();

    await user.type(screen.getByLabelText("Nome do cliente"), "Ana");
    await user.click(screen.getByRole("button", { name: /Ana Paula/ }));

    const services = await screen.findByRole("group", { name: "Serviços" });
    expect(services).toHaveClass("motion-enter");
    expect(liveRegion(container)).toHaveTextContent("Serviços");
    await waitFor(() =>
      expect(within(services).getAllByRole("checkbox")[0]).toHaveFocus(),
    );
    expect(
      screen.queryByRole("group", { name: "Data" }),
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  test("escolher o serviço revela Data, com o dia pré-escolhido, e Horários", async () => {
    const user = userEvent.setup();
    const { container } = await renderEmpty();
    await user.type(screen.getByLabelText("Nome do cliente"), "Ana");
    await user.click(screen.getByRole("button", { name: /Ana Paula/ }));

    const escova = await screen.findByRole("checkbox", { name: /Escova/ });
    await user.click(escova);

    const date = await screen.findByRole("group", { name: "Data" });
    expect(
      within(date).getByRole("gridcell", { selected: true }),
    ).toHaveAttribute("data-today", "true");
    expect(await screen.findByRole("radio", { name: "09:00" })).toBeVisible();
    expect(liveRegion(container)).toHaveTextContent("Data e horário");
    // O foco fica no chip: dá para escolher mais de um serviço.
    expect(escova).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  test("escolher o horário habilita Criar agendamento", async () => {
    const user = userEvent.setup();
    await renderNew();
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));

    const cta = await screen.findByRole("button", {
      name: /^Criar agendamento/,
    });
    expect(cta).toBeDisabled();
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Criar agendamento · .*09:00$/ }),
      ).toBeEnabled(),
    );
  });

  test("trocar o serviço recalcula os horários e apaga o horário escolhido", async () => {
    const user = userEvent.setup();
    await renderNew();
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    const callsBefore = getAvailability.mock.calls.length;

    await user.click(screen.getByRole("checkbox", { name: /Corte feminino/ }));

    await waitFor(() =>
      expect(getAvailability.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    expect(
      (
        getAvailability.mock.calls.at(-1)?.[0] as
          { serviceIds: string[] } | undefined
      )?.serviceIds,
    ).toEqual(["svc-escova", "svc-corte"]);
    expect(
      await screen.findByRole("radio", { name: "09:00" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /^Criar agendamento$/ }),
    ).toBeDisabled();
  });

  test("aberto com o cliente preenchido, Serviços já aparece, sem animar nem anunciar", async () => {
    const { container } = await renderNew();

    const services = screen.getByRole("group", { name: "Serviços" });
    expect(services).not.toHaveClass("motion-enter");
    expect(liveRegion(container)).toHaveTextContent("");
    expect(screen.getByRole("button", { name: "Trocar" })).toBeVisible();
  });

  test("trocar o cliente não esconde as etapas já reveladas", async () => {
    const user = userEvent.setup();
    await renderNew();
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));
    await screen.findByRole("group", { name: "Data" });

    await user.click(screen.getByRole("button", { name: "Trocar" }));

    expect(screen.getByLabelText("Nome do cliente")).toBeVisible();
    expect(screen.getByRole("group", { name: "Serviços" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Data" })).toBeVisible();
    expect(screen.getByText("Escolha ou cadastre o cliente.")).toBeVisible();
  });

  test("com movimento reduzido, nada recebe a classe de animação", async () => {
    const user = userEvent.setup();
    const { container } = await renderEmpty(DESKTOP, true);
    await user.type(screen.getByLabelText("Nome do cliente"), "Ana");
    await user.click(screen.getByRole("button", { name: /Ana Paula/ }));
    await user.click(await screen.findByRole("checkbox", { name: /Escova/ }));
    await screen.findByRole("group", { name: "Data" });

    expect(container.querySelectorAll(".motion-enter")).toHaveLength(0);
    // Mesmo assim a etapa nova é anunciada.
    expect(liveRegion(container)).toHaveTextContent("Data e horário");
  });

  test("cliente novo digitado: o pedido de criação continua igual", async () => {
    const user = userEvent.setup();
    await renderEmpty();
    await user.type(screen.getByLabelText("Nome do cliente"), "Carla Nunes");
    // Digitar não revela nada no meio da busca; "Cadastrar" assume o nome.
    expect(
      screen.queryByRole("group", { name: "Serviços" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Cadastrar “Carla Nunes”/ }),
    );
    const escova = await screen.findByRole("checkbox", { name: /Escova/ });
    await waitFor(() =>
      expect(
        within(screen.getByRole("group", { name: "Serviços" })).getAllByRole(
          "checkbox",
        )[0],
      ).toHaveFocus(),
    );
    await user.click(escova);
    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() => expect(createHold).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("button", { name: /^Criar agendamento · / }),
    );

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0]).toEqual({
      comments: undefined,
      customerId: undefined,
      customerName: "Carla Nunes",
      customerPhone: undefined,
      date: TODAY,
      durationMinutes: undefined,
      holdId: "hold-1",
      overlapOverride: undefined,
      overlapOverrideReason: undefined,
      serviceIds: ["svc-escova"],
      startTime: "09:00",
      title: undefined,
    });
  });
});

// Seletores-de-Data-e-Hora.dc.html, "03 · Juntos": a data começa recolhida
// em semana, o horário fica ao lado e o resumo grande repete a decisão.
describe("7. quadro Data e horário", () => {
  const MONTH = new Intl.DateTimeFormat("pt-BR", { month: "long" });

  function summary(): HTMLElement {
    const region = screen.getByRole("region", { name: "Data e horário" });
    return region.querySelector<HTMLElement>(".agenda-new-when-summary")!;
  }

  test("o resumo repete dia, início e fim, e diz quem, o quê e quanto tempo", async () => {
    const user = userEvent.setup();
    await renderNew();
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));

    const region = await screen.findByRole("region", {
      name: "Data e horário",
    });
    const today = new Date();
    expect(summary()).toHaveTextContent(
      `Hoje, ${today.getDate()} de ${MONTH.format(today)} · escolha o horário`,
    );
    expect(region).toHaveTextContent("Ana Paula · Escova · 30 min");
    // O calendário nasce em semana, não no mês.
    expect(
      within(region).getByRole("button", {
        expanded: false,
        name: /\d{4}$/,
      }),
    ).toBeVisible();

    await user.click(await screen.findByRole("radio", { name: "09:00" }));
    await waitFor(() =>
      expect(summary()).toHaveTextContent(/· 09:00 – 09:30$/),
    );
  });

  test("escolher outro dia no calendário consulta os horários desse dia", async () => {
    const user = userEvent.setup();
    await renderNew();
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));
    await screen.findByRole("radio", { name: "09:00" });

    const target = new Date();
    target.setDate(target.getDate() + 3);
    await chooseDate(user, target);

    await waitFor(() =>
      expect(
        (
          getAvailability.mock.calls.at(-1)?.[0] as
            { startDate: string } | undefined
        )?.startDate,
      ).toBe(isoDate(target)),
    );
    expect(summary()).toHaveTextContent(
      `${target.getDate()} de ${MONTH.format(target)}`,
    );
  });

  test("Outro horário abre o tambor; Usar este horário reserva o escolhido", async () => {
    const user = userEvent.setup();
    await renderNew();
    await user.click(screen.getByRole("checkbox", { name: /Escova/ }));
    await screen.findByRole("radio", { name: "09:00" });

    await user.click(screen.getByRole("button", { name: "Outro horário" }));
    const drum = screen.getByRole("group", {
      name: "Outro horário, fora dos oferecidos",
    });
    expect(within(drum).getByRole("listbox", { name: "Horas" })).toBeVisible();
    await chooseManualTime(user, "11:30");
    expect(within(drum).getByText("até 12:00 · 30 min")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Usar este horário" }));

    await waitFor(() =>
      expect(createHold.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ startTime: "11:30" }),
      ),
    );
    await waitFor(() =>
      expect(summary()).toHaveTextContent(/· 11:30 – 12:00$/),
    );
  });
});
