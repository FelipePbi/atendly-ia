// @vitest-environment jsdom
/**
 * Goal084 (WU-02): telefone de cliente exibido formatado, na forma nacional e
 * em toda tela que o mostra.
 *
 *  5. `formatBrazilianPhone(…, "parens")` reconhece a forma nacional;
 *  6. "55991919817" aparece como "(55) 99191-9817", nunca cru, na lista, no
 *     perfil, no seletor do novo agendamento, no detalhe do agendamento e na
 *     confirmação de duplicata do cadastro.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  Appointment,
  CalendarState,
  Customer,
  CustomerDetail,
} from "@/data";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { formatBrazilianPhone } from "@/shared/phone";

const RAW = "55991919817";
const FORMATTED = "(55) 99191-9817";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getCalendar = vi.fn();
const getAppointment = vi.fn();
const getAvailability = vi.fn();
const listAppointments = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();
const listTimeBlocks = vi.fn();
const customersList = vi.fn();
const customersGet = vi.fn();
const customersListMemory = vi.fn();
const customersListCandidatesByPhone = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getAppointment,
      getAvailability,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
      listAppointments,
      listTimeBlocks,
    },
    conversations: { list: () => Promise.resolve([]) },
    customers: {
      get: customersGet,
      list: customersList,
      listCandidatesByPhone: customersListCandidatesByPhone,
      listMemory: customersListMemory,
    },
    serviceCatalog: { list: listServices },
  }),
  useProductRuntime: () => ({ session: null }),
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

function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return { id: "c1", name: "Marina Duarte", phone: RAW, ...overrides };
}

function customerDetailFixture(): CustomerDetail {
  return {
    id: "c1",
    name: "Marina Duarte",
    notes: [],
    phone: RAW,
    primaryGuardian: null,
    tags: [],
  };
}

function appointmentFixture(customer: Customer): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer,
    customerId: customer.id,
    date: "2026-09-14",
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
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
  getAvailability.mockResolvedValue([]);
  listAppointmentEvents.mockResolvedValue([]);
  listAppointmentNotifications.mockResolvedValue([]);
  customersListMemory.mockResolvedValue([]);
  listServices.mockResolvedValue({ editable: true, items: [], source: "AVENLY" });
});

describe("prova 5 — formatBrazilianPhone reconhece a forma nacional", () => {
  test.each([
    [RAW, FORMATTED],
    ["5133334444", "(51) 3333-4444"],
    ["5191234567", "(51) 99123-4567"],
    ["051991234567", "(51) 99123-4567"],
    ["+5555991919817", FORMATTED],
    ["5555991919817", FORMATTED],
    ["+55 (11) 99888-7766", "(11) 99888-7766"],
    ["551133334444", "(11) 3333-4444"],
  ])("%s vira %s", (input, expected) => {
    expect(formatBrazilianPhone(input, "parens")).toBe(expected);
  });

  test.each(["12025550123", "0099", "", "1234567", "5100000000"])(
    "%s continua sem formato brasileiro",
    (input) => {
      expect(formatBrazilianPhone(input, "parens")).toBeNull();
    },
  );
});

describe("prova 6 — telefone nacional formatado em toda tela", () => {
  test("lista de clientes", async () => {
    customersList.mockResolvedValue({
      items: [customerFixture()],
      managedExternally: false,
      source: "AVENLY",
    });
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="list" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("+55 55 99191-9817")).toBeVisible();
    expect(screen.queryByText(RAW)).not.toBeInTheDocument();
  });

  test("perfil do cliente", async () => {
    customersGet.mockResolvedValue(customerDetailFixture());
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("+55 55 99191-9817")).toBeVisible();
    expect(screen.queryByText(RAW)).not.toBeInTheDocument();
  });

  test("seletor de cliente do novo agendamento, com e sem nome", async () => {
    customersList.mockResolvedValue({
      items: [
        customerFixture(),
        customerFixture({ id: "c2", name: null, phone: "5133334444" }),
        customerFixture({ id: "c3", name: null, phone: RAW }),
      ],
      managedExternally: false,
      source: "AVENLY",
    });
    render(
      <ShellConfigProvider>
        <AppointmentForm />
      </ShellConfigProvider>,
    );

    const options = await screen.findByRole("list", {}, { timeout: 3000 });
    const marina = within(options).getByRole("button", { name: /Marina Duarte/ });
    expect(within(marina).getByText(FORMATTED)).toBeVisible();
    expect(
      within(options).getByRole("button", { name: /\(51\) 3333-4444/ }),
    ).toBeVisible();
    expect(within(options).getByRole("button", { name: FORMATTED })).toBeVisible();
    expect(screen.queryByText(RAW)).not.toBeInTheDocument();
    expect(options.textContent).not.toContain(RAW);
  });

  test("detalhe do agendamento, com cliente sem nome no lugar do nome", async () => {
    getAppointment.mockResolvedValue(
      appointmentFixture(customerFixture({ name: null })),
    );
    render(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );

    expect((await screen.findAllByText(FORMATTED)).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.queryByText(RAW)).not.toBeInTheDocument();
  });

  test("detalhe do agendamento com nome mostra o telefone formatado", async () => {
    getAppointment.mockResolvedValue(appointmentFixture(customerFixture()));
    render(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText(FORMATTED)).toBeVisible();
    expect(screen.queryByText(RAW)).not.toBeInTheDocument();
  });

  test("confirmação de duplicata do cadastro", async () => {
    customersListCandidatesByPhone.mockResolvedValue({
      items: [customerFixture()],
      managedExternally: false,
      source: "AVENLY",
    });
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="new" />
      </ShellConfigProvider>,
    );
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Telefone (opcional)"), RAW);
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(`com o telefone ${FORMATTED}.`);
    const list = screen.getByRole("list", { name: "Cadastros com este telefone" });
    expect(within(list).getByText(FORMATTED)).toBeVisible();
    expect(screen.queryByText(RAW)).not.toBeInTheDocument();
    expect(status.textContent).not.toContain(RAW);
    expect(customersListCandidatesByPhone).toHaveBeenCalledWith(RAW);
  });
});
