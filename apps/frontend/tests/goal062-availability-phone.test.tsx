// @vitest-environment jsdom
/**
 * Goal062 (WU-06): a Disponibilidade não apaga em silêncio, e o telefone
 * brasileiro reconhecido aparece formatado onde o produto o mostra.
 *
 * - `AvailabilitySettings` mostra todos os intervalos ativos de um dia, não
 *   só o primeiro, e salvar grava exatamente a grade mostrada — sem
 *   substituir por um horário único nem exigir confirmação (Goal067/WU-03
 *   reescreveu o formulário para representar qualquer grade do Scheduling).
 * - Lista e perfil de Clientes mostram `+55…` formatado por
 *   `formatBrazilianPhone`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CalendarState, Customer, CustomerDetail, SettingsState } from "@/data";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import { AvailabilitySettings } from "@/features/settings/AvailabilitySettings";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const updateAvailability = vi.fn();
const customersList = vi.fn();
const customersGet = vi.fn();
const calendarGetCalendar = vi.fn();
const calendarListAppointments = vi.fn();
const customersListMemory = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getCalendar: calendarGetCalendar,
      listAppointments: calendarListAppointments,
    },
    conversations: { list: () => Promise.resolve([]) },
    customers: {
      get: customersGet,
      list: customersList,
      listMemory: customersListMemory,
    },
    settings: { updateAvailability },
  }),
}));

function settingsFixture(overrides: Partial<SettingsState> = {}): SettingsState {
  return {
    ai: { enabled: true, tone: "BALANCED" },
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: [],
      timezone: "America/Sao_Paulo",
    },
    business: {
      address: null,
      category: "Beleza",
      contextProjectionStatus: "PROJECTED",
      currency: "BRL",
      language: "pt-BR",
      modalities: ["ON_SITE"],
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      capabilities: {
        createAppointments: true,
        manageAvailability: true,
        manageCustomers: true,
        manageServices: true,
        migrate: true,
      },
      integration: null,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
    ...overrides,
  };
}

function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return { id: "c1", name: "Marina Duarte", phone: "5511998887766", ...overrides };
}

function customerDetailFixture(
  overrides: Partial<CustomerDetail> = {},
): CustomerDetail {
  return {
    id: "c1",
    name: "Marina Duarte",
    notes: [],
    phone: "5511998887766",
    primaryGuardian: null,
    tags: [],
    ...overrides,
  };
}

function calendarStateFixture(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: true,
    },
    integration: null,
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("Disponibilidade não apaga em silêncio", () => {
  test("dois intervalos no mesmo dia aparecem os dois, editáveis", () => {
    const settings = settingsFixture({
      availability: {
        customerChangeMinNoticeMinutes: 0,
        granularityMinutes: 30,
        maxLeadDays: 90,
        minLeadMinutes: 0,
        rules: [
          { active: true, dayOfWeek: 1, endTime: "12:00", id: "r1", startTime: "09:00" },
          { active: true, dayOfWeek: 1, endTime: "18:00", id: "r2", startTime: "14:00" },
        ],
        timezone: "America/Sao_Paulo",
      },
    });
    render(<AvailabilitySettings onSaved={vi.fn()} settings={settings} />);

    expect(screen.getByLabelText("Segunda · início do intervalo 1")).toHaveValue(
      "09:00",
    );
    expect(screen.getByLabelText("Segunda · fim do intervalo 1")).toHaveValue(
      "12:00",
    );
    expect(screen.getByLabelText("Segunda · início do intervalo 2")).toHaveValue(
      "14:00",
    );
    expect(screen.getByLabelText("Segunda · fim do intervalo 2")).toHaveValue(
      "18:00",
    );
  });

  test("salvar grava exatamente os intervalos mostrados, sem exigir confirmação", async () => {
    const user = userEvent.setup();
    const settings = settingsFixture({
      availability: {
        customerChangeMinNoticeMinutes: 0,
        granularityMinutes: 30,
        maxLeadDays: 90,
        minLeadMinutes: 0,
        rules: [
          { active: true, dayOfWeek: 1, endTime: "12:00", id: "r1", startTime: "09:00" },
          { active: true, dayOfWeek: 1, endTime: "18:00", id: "r2", startTime: "14:00" },
        ],
        timezone: "America/Sao_Paulo",
      },
    });
    updateAvailability.mockResolvedValue(settings.availability);
    render(<AvailabilitySettings onSaved={vi.fn()} settings={settings} />);

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(updateAvailability).toHaveBeenCalledWith({
      timezone: "America/Sao_Paulo",
      rules: [
        { active: true, dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
        { active: true, dayOfWeek: 1, startTime: "14:00", endTime: "18:00" },
      ],
    });
  });
});

describe("telefone brasileiro reconhecido aparece formatado", () => {
  test("na lista de clientes", async () => {
    customersList.mockResolvedValue({
      items: [customerFixture()],
      managedExternally: false,
      source: "ATENDLY",
    });
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="list" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("+55 11 99888-7766")).toBeVisible();
    expect(screen.queryByText("5511998887766")).not.toBeInTheDocument();
  });

  test("no perfil do cliente", async () => {
    customersGet.mockResolvedValue(customerDetailFixture());
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    calendarListAppointments.mockResolvedValue([]);
    customersListMemory.mockResolvedValue([]);
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("+55 11 99888-7766")).toBeVisible();
    expect(screen.queryByText("5511998887766")).not.toBeInTheDocument();
  });

  test("valor não reconhecido como brasileiro mostra o que está gravado", async () => {
    customersList.mockResolvedValue({
      items: [customerFixture({ phone: "12025550123" })],
      managedExternally: false,
      source: "ATENDLY",
    });
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="list" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("12025550123")).toBeVisible();
  });
});
