// @vitest-environment jsdom
/**
 * Goal112 — o fluxo de agendamento da Agenda não perde o que a pessoa fez ao
 * cruzar 1024 px (quadros A6, A8 e A9).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. no novo agendamento (A6), no cancelamento (A8) e na remarcação (A9), o
 *    campo em que a pessoa digitava é o mesmo nó do DOM, com o mesmo valor e
 *    com foco, depois de 390→1280 e de 1280→390;
 * 2. abaixo de 1024 px a barra do dia e a coluna não são montadas e nada é
 *    buscado para elas; ao ligar a divisão, a coluna aparece e busca;
 * 3. o invólucro do fluxo é o mesmo objeto nas duas larguras.
 *
 * O matchMedia daqui guarda os ouvintes e os chama quando a largura muda: é o
 * que `useWideLayout` escuta. Fidelidade visual não é provada aqui: jsdom não
 * tem layout.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type {
  Appointment,
  AppointmentHold,
  CalendarState,
  Customer,
  Service,
} from "@/data";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { CancelFlow } from "@/features/agenda/CancelFlow";
import { RescheduleFlow } from "@/features/agenda/RescheduleFlow";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";

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

const cancelAppointment = vi.fn();
const createAppointment = vi.fn();
const createHold = vi.fn();
const customersGet = vi.fn();
const customersList = vi.fn();
const getAgendaViewPreference = vi.fn();
const getAppointment = vi.fn();
const getAvailability = vi.fn();
const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const notificationsSummary = vi.fn();
const releaseHold = vi.fn();
const rescheduleAppointment = vi.fn();
const serviceCatalogList = vi.fn();
const settingsGet = vi.fn();
const statusGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    calendar: {
      cancelAppointment,
      createAppointment,
      createHold,
      getAppointment,
      getAvailability,
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
      releaseHold,
      rescheduleAppointment,
    },
    customers: { get: customersGet, list: customersList },
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
const FUTURE_DATE = "2099-01-05";

type Listener = () => void;

let width = NARROW;
const listeners = new Set<Listener>();

function installMatchMedia(initialWidth: number) {
  width = initialWidth;
  listeners.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: (_type: string, listener: Listener) => {
          listeners.add(listener);
        },
        addListener: () => undefined,
        dispatchEvent: () => false,
        get matches() {
          return min ? width >= Number(min[1]) : false;
        },
        media: query,
        onchange: null,
        removeEventListener: (_type: string, listener: Listener) => {
          listeners.delete(listener);
        },
        removeListener: () => undefined,
      };
    },
    writable: true,
  });
}

function resize(next: number) {
  width = next;
  act(() => {
    for (const listener of Array.from(listeners)) listener();
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
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  };
}

function serviceFixture(): Service {
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
  };
}

function customerFixture(): Customer {
  return { id: "cus-ana", name: "Ana Paula", phone: "+5511999990000" };
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
    date: FUTURE_DATE,
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

function holdFixture(): AppointmentHold {
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
  };
}

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
    createAppointment,
    createHold,
    customersGet,
    customersList,
    getAgendaViewPreference,
    getAppointment,
    getAvailability,
    getCalendar,
    listAppointments,
    listAvailabilityExceptions,
    listTimeBlocks,
    notificationsSummary,
    releaseHold,
    rescheduleAppointment,
    serviceCatalogList,
    settingsGet,
    statusGet,
    router.push,
    router.replace,
  ]) {
    mock.mockReset();
  }
  installMatchMedia(NARROW);
  getCalendar.mockResolvedValue(calendarFixture());
  getAppointment.mockResolvedValue(appointmentFixture());
  settingsGet.mockResolvedValue({ availability: { rules: [] } });
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [serviceFixture()],
    managedExternally: false,
    source: "AVENLY",
  });
  customersList.mockResolvedValue({
    items: [customerFixture()],
    managedExternally: false,
    source: "AVENLY",
  });
  customersGet.mockResolvedValue({
    appointmentStats: {
      averageIntervalDays: null,
      cancelled: 0,
      completed: 0,
      firstAppointmentDate: null,
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
  });
  listAppointments.mockImplementation(() =>
    Promise.resolve([appointmentFixture()]),
  );
  listTimeBlocks.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  getAgendaViewPreference.mockResolvedValue({ hiddenWeekdays: [] });
  getAvailability.mockImplementation((query: { startDate: string }) =>
    Promise.resolve([
      { date: query.startDate, endTime: "10:00", startTime: "09:00" },
      { date: query.startDate, endTime: "11:00", startTime: "10:00" },
    ]),
  );
  createHold.mockImplementation((input: { date: string; startTime: string }) =>
    Promise.resolve({
      ...holdFixture(),
      date: input.date,
      startTime: input.startTime,
    }),
  );
  releaseHold.mockResolvedValue({ ...holdFixture(), status: "RELEASED" });
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
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
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

function columnOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".list-detail-list");
}

type Flow = {
  name: string;
  frame: string;
  screen: () => ReactElement;
  /** Abre e devolve o campo em que a pessoa digita. */
  field: (user: ReturnType<typeof userEvent.setup>) => Promise<HTMLElement>;
  type: (user: ReturnType<typeof userEvent.setup>, field: HTMLElement) => Promise<string>;
};

const FLOWS: Flow[] = [
  {
    name: "novo agendamento",
    frame: "A6",
    screen: () => <AppointmentForm />,
    field: async (user) => {
      await user.click(
        await screen.findByRole("button", { name: /Adicionar observação/ }),
      );
      return screen.getByLabelText("Observações");
    },
    type: async (user, field) => {
      await user.type(field, "Traz o próprio secador");
      return "Traz o próprio secador";
    },
  },
  {
    name: "cancelar",
    frame: "A8",
    screen: () => <CancelFlow appointmentId="apt-1" />,
    field: async () =>
      screen.findByLabelText("Motivo (opcional, só para você)"),
    type: async (user, field) => {
      await user.type(field, "Cliente viajou");
      return "Cliente viajou";
    },
  },
  {
    name: "remarcar",
    frame: "A9",
    screen: () => <RescheduleFlow appointmentId="apt-1" />,
    field: async (user) => {
      await user.click(
        await screen.findByRole("button", { name: "Outro horário" }),
      );
      const input = await screen.findByLabelText(
        "Outro horário, fora dos oferecidos",
      );
      fireEvent.change(input, { target: { value: "14:30" } });
      return input;
    },
    type: async () => "14:30",
  },
];

async function renderFlow(flow: Flow, initialWidth: number) {
  installMatchMedia(initialWidth);
  const user = userEvent.setup();
  const utils = render(<PlatformLayout>{flow.screen()}</PlatformLayout>);
  const field = await flow.field(user);
  return { ...utils, field, user };
}

describe.each(FLOWS)(
  "Goal112 $frame ($name): o campo é o mesmo nó ao cruzar 1024 px",
  (flow) => {
    test("390→1280: mesmo nó, mesmo valor e com foco", async () => {
      const { container, field, user } = await renderFlow(flow, NARROW);
      const expected = await flow.type(user, field);
      field.focus();
      expect(field).toHaveFocus();
      const wrapper = container.querySelector(".agenda-appt-split");
      expect(wrapper).not.toBeNull();

      resize(WIDE);

      expect(field.isConnected).toBe(true);
      expect(field).toHaveValue(expected);
      expect(field).toHaveFocus();
      expect(container.querySelector(".agenda-appt-split")).toBe(wrapper);
      await waitFor(() => expect(columnOf(container)).not.toBeNull());
      expect(field).toHaveValue(expected);
      expect(field).toHaveFocus();
    });

    test("1280→390: mesmo nó, mesmo valor e com foco; a coluna sai", async () => {
      const { container, field, user } = await renderFlow(flow, WIDE);
      await waitFor(() => expect(columnOf(container)).not.toBeNull());
      const expected = await flow.type(user, field);
      field.focus();
      expect(field).toHaveFocus();
      const wrapper = container.querySelector(".agenda-appt-split");

      resize(NARROW);

      expect(field.isConnected).toBe(true);
      expect(field).toHaveValue(expected);
      expect(field).toHaveFocus();
      expect(container.querySelector(".agenda-appt-split")).toBe(wrapper);
      expect(columnOf(container)).toBeNull();
    });

    test("390→1280→390: o nó sobrevive à ida e à volta", async () => {
      const { field, user } = await renderFlow(flow, NARROW);
      const expected = await flow.type(user, field);
      field.focus();

      resize(WIDE);
      resize(NARROW);

      expect(field.isConnected).toBe(true);
      expect(field).toHaveValue(expected);
      expect(field).toHaveFocus();
    });
  },
);

describe.each(FLOWS)(
  "Goal112 $frame ($name): a coluna do dia segue a divisão",
  (flow) => {
    test("abaixo de 1024 px não monta a coluna nem a barra e não busca", async () => {
      const { container } = await renderFlow(flow, NARROW);

      const wrapper = container.querySelector(".agenda-appt-split");
      expect(wrapper).toHaveClass("agenda-appt-split-flat");
      expect(columnOf(container)).toBeNull();
      expect(container.querySelector(".agenda-command-bar")).toBeNull();
      expect(
        screen.queryByRole("region", { name: /^Agenda de / }),
      ).not.toBeInTheDocument();
      for (const read of COLUMN_READS) expect(read).not.toHaveBeenCalled();
      expect(container.querySelector(".list-detail")).toBeNull();
      expect(container.querySelector(".list-detail-flat")).not.toBeNull();
    });

    test("a partir de 1024 px a coluna e a barra aparecem e a coluna busca uma vez", async () => {
      const { container } = await renderFlow(flow, WIDE);

      const column = await waitFor(() => {
        const found = columnOf(container);
        expect(found).not.toBeNull();
        return found as HTMLElement;
      });
      await waitFor(() =>
        expect(
          container.querySelector(".agenda-command-bar"),
        ).not.toBeNull(),
      );
      expect(column).toBeInTheDocument();
      expect(container.querySelector(".agenda-appt-split")).not.toHaveClass(
        "agenda-appt-split-flat",
      );
      for (const read of COLUMN_READS) expect(read).toHaveBeenCalled();
      expect(listAppointments).toHaveBeenCalledTimes(1);
    });

    test("estreitar de novo tira a coluna e não busca outra vez", async () => {
      const { container } = await renderFlow(flow, WIDE);
      await waitFor(() => expect(columnOf(container)).not.toBeNull());
      await waitFor(() => expect(listAppointments).toHaveBeenCalledTimes(1));

      resize(NARROW);

      expect(columnOf(container)).toBeNull();
      expect(container.querySelector(".agenda-command-bar")).toBeNull();
      expect(listAppointments).toHaveBeenCalledTimes(1);
    });

    test("uma chamada de useShellConfig por árvore nas duas larguras", async () => {
      const { container } = await renderFlow(flow, NARROW);
      expect(shellCallers.size).toBe(1);

      resize(WIDE);
      await waitFor(() => expect(columnOf(container)).not.toBeNull());

      expect(shellCallers.size).toBe(1);
    });
  },
);

describe("Goal112 Agenda: a data do dia da coluna continua a do fluxo", () => {
  test("a coluna aberta pela primeira vez em 1280 px mostra o dia do agendamento", async () => {
    const { container } = await renderFlow(FLOWS[1], NARROW);
    resize(WIDE);

    await waitFor(() => expect(listAppointments).toHaveBeenCalled());
    const query = listAppointments.mock.calls[0]?.[0] as {
      endDate: string;
      startDate: string;
    };
    expect(query.startDate <= FUTURE_DATE).toBe(true);
    expect(query.endDate >= FUTURE_DATE).toBe(true);
    expect(container.querySelector(".agenda-appt-split")).not.toBeNull();
  });
});
