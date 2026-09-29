// @vitest-environment jsdom
/**
 * Goal015 (WU-07): fecha a ação (b) do blocker da rodada 2 do review014 —
 * `ShellConfigProvider` mais a tela autenticada real de Clientes e de
 * Serviços precisa sobreviver a montagem, carregamento e interação sem
 * violar a invariante de uma chamada de `useShellConfig` por árvore. Se essa
 * invariante for violada (por exemplo, duas montagens concorrentes do mesmo
 * config, ou um efeito que nunca estabiliza), React lança "Maximum update
 * depth exceeded" e o `render`/a interação abaixo lança essa mesma exceção,
 * derrubando o teste — não há necessidade de capturá-la explicitamente.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CalendarState, Customer, CustomerDetail, Service } from "@/data";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const customersList = vi.fn();
const customersGet = vi.fn();
const customersListMemory = vi.fn();
const calendarGetCalendar = vi.fn();
const calendarListAppointments = vi.fn();
const serviceCatalogList = vi.fn();

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
    serviceCatalog: {
      list: serviceCatalogList,
    },
  }),
}));

function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return { id: "c1", name: "Marina Duarte", phone: "11999990000", ...overrides };
}

function customerDetailFixture(
  overrides: Partial<CustomerDetail> = {},
): CustomerDetail {
  return {
    id: "c1",
    name: "Marina Duarte",
    notes: [],
    phone: "11999990000",
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

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    colorToken: null,
    description: null,
    durationMinutes: 45,
    id: "s1",
    name: "Corte",
    needsReview: false,
    price: 80,
    priceType: "FIXED",
    recurrenceIntervalDays: null,
    reviewOrigin: null,
    ...overrides,
  };
}

describe("ShellConfigProvider + tela real de Clientes não excede a profundidade de atualização", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    customersList.mockReset();
    customersGet.mockReset();
    customersListMemory.mockReset();
    calendarGetCalendar.mockReset();
    calendarListAppointments.mockReset();
    serviceCatalogList.mockReset();
  });

  test("lista carrega e responde a uma busca digitada caractere a caractere", async () => {
    customersList.mockResolvedValue({
      items: [customerFixture({ id: "c1" }), customerFixture({ id: "c2", name: "Bruno Alves" })],
      managedExternally: false,
      source: "ATENDLY",
    });
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="list" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("2 clientes")).toBeVisible();
    await user.type(screen.getByLabelText("Buscar cliente"), "Bruno");
    expect(await screen.findByText("1 cliente")).toBeVisible();
  });

  test("formulário de novo cliente responde a digitação contínua", async () => {
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="new" />
      </ShellConfigProvider>,
    );

    const nameField = await screen.findByLabelText("Nome");
    await user.type(nameField, "Camila Duarte");
    expect(nameField).toHaveValue("Camila Duarte");
  });

  test("perfil do cliente carrega identidade, agenda e memória juntos", async () => {
    customersGet.mockResolvedValue(customerDetailFixture());
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    calendarListAppointments.mockResolvedValue([]);
    customersListMemory.mockResolvedValue([]);
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Marina Duarte" }),
    ).toBeVisible();
  });
});

describe("ShellConfigProvider + tela real de Serviços não excede a profundidade de atualização", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    serviceCatalogList.mockReset();
  });

  test("lista carrega e responde à alternância de filtro", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [
        serviceFixture({ id: "s1" }),
        serviceFixture({ active: false, id: "s2", name: "Escova" }),
      ],
      source: "ATENDLY",
    });
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="list" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("2 serviços")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Ativos" }));
    expect(await screen.findByText("1 serviço")).toBeVisible();
  });

  test("formulário de novo serviço responde à troca repetida do tipo de preço", async () => {
    serviceCatalogList.mockResolvedValue({ editable: true, items: [], source: "ATENDLY" });
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="new" />
      </ShellConfigProvider>,
    );

    await screen.findByRole("heading", { name: "Novo serviço" });
    await user.click(screen.getByRole("radio", { name: "Sob consulta" }));
    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    await user.click(screen.getByRole("radio", { name: "Preço fixo" }));
    expect(screen.getByRole("radio", { name: "Preço fixo" })).toBeChecked();
  });

  test("formulário de edição carrega o serviço existente", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [serviceFixture({ id: "s1" })],
      source: "ATENDLY",
    });
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="edit" serviceId="s1" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByDisplayValue("Corte")).toBeVisible();
  });
});
