// @vitest-environment jsdom
/**
 * Goal112 — Clientes e Serviços não perdem o que a pessoa fez ao cruzar 1024 px.
 *
 * CL4 (`/clientes/novo`), CL5 (`/clientes/detalhes`), S3 (`/servicos/novo`) e
 * S4 (`/servicos/editar`) são renderizados na casca real do grupo `(platform)`.
 * O `matchMedia` daqui guarda os ouvintes e os dispara quando a largura muda,
 * como o navegador faz (o do Goal088 fixa a largura antes do render).
 *
 * A prova é por identidade de nó (`toBe`), por valor e por foco, nos dois
 * sentidos: começando estreito e começando largo.
 */

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type { CustomerDetail, Service } from "@/data";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const customersGet = vi.fn();
const customersList = vi.fn();
const customersListMemory = vi.fn();
const calendarGetCalendar = vi.fn();
const conversationsList = vi.fn();
const serviceCatalogList = vi.fn();
const serviceCatalogGetAiInstruction = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    calendar: { getCalendar: calendarGetCalendar },
    conversations: { list: conversationsList },
    customers: {
      get: customersGet,
      list: customersList,
      listMemory: customersListMemory,
    },
    notifications: { summary: notificationsSummary },
    serviceCatalog: {
      getAiInstruction: serviceCatalogGetAiInstruction,
      list: serviceCatalogList,
    },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br", name: "Marina Alves" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

const WIDE = 1280;
const NARROW = 390;

type Listener = () => void;

function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<Listener>();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: (_type: string, listener: Listener) => {
          listeners.add(listener);
        },
        get matches() {
          return min ? width >= Number(min[1]) : false;
        },
        media: query,
        removeEventListener: (_type: string, listener: Listener) => {
          listeners.delete(listener);
        },
      };
    },
    writable: true,
  });
  return {
    resize(next: number) {
      width = next;
      act(() => {
        for (const listener of Array.from(listeners)) listener();
      });
    },
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
    id: "c1",
    lastAppointment: null,
    name: "Ana Paula",
    nextAppointment: null,
    notes: [],
    phone: "11991234567",
    primaryGuardian: null,
    tags: [],
  };
}

function serviceFixture(): Service {
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
  };
}

const calendarFixture = {
  capabilities: {
    createAppointments: true,
    manageAvailability: true,
    manageCustomers: true,
    manageServices: true,
    migrate: true,
  },
  integration: null,
  source: "AVENLY",
  timezone: "America/Sao_Paulo",
};

function renderRoute(screenElement: ReactElement) {
  return render(<PlatformLayout>{screenElement}</PlatformLayout>);
}

beforeEach(() => {
  shellCallers.clear();
  for (const mock of [
    statusGet,
    notificationsSummary,
    customersGet,
    customersList,
    customersListMemory,
    calendarGetCalendar,
    conversationsList,
    serviceCatalogList,
    serviceCatalogGetAiInstruction,
  ]) {
    mock.mockReset();
  }
  statusGet.mockResolvedValue({
    accountDeletion: { status: "NONE", dueAt: null },
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
  customersGet.mockResolvedValue(customerDetailFixture());
  customersListMemory.mockResolvedValue([]);
  customersList.mockResolvedValue({
    items: [{ id: "c1", name: "Ana Paula", phone: "11991234567" }],
    managedExternally: false,
    source: "AVENLY",
  });
  calendarGetCalendar.mockResolvedValue(calendarFixture);
  conversationsList.mockResolvedValue([]);
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [serviceFixture()],
    managedExternally: false,
    source: "AVENLY",
  });
  serviceCatalogGetAiInstruction.mockResolvedValue({ content: "" });
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

const DIRECTIONS = [
  ["estreito para largo e de volta", NARROW, WIDE],
  ["largo para estreito e de volta", WIDE, NARROW],
] as const;

describe("Goal112 CL4: /clientes/novo guarda o que foi digitado", () => {
  test.each(DIRECTIONS)("%s", async (_name, from, to) => {
    const media = installMatchMedia(from);
    const user = userEvent.setup();
    renderRoute(<ProductCustomersScreen scenario="new" />);

    const name = await screen.findByLabelText("Nome");
    const phone = screen.getByLabelText(/^Telefone/);
    await user.type(name, "Maria Souza");
    await user.type(phone, "11987654321");
    const typedPhone = (phone as HTMLInputElement).value;
    expect(typedPhone).not.toBe("");
    expect(phone).toHaveFocus();

    media.resize(to);
    expect(screen.getByLabelText("Nome")).toBe(name);
    expect(screen.getByLabelText(/^Telefone/)).toBe(phone);
    expect(name).toHaveValue("Maria Souza");
    expect(phone).toHaveValue(typedPhone);
    expect(phone).toHaveFocus();
    expect(name.isConnected).toBe(true);

    media.resize(from);
    expect(screen.getByLabelText("Nome")).toBe(name);
    expect(screen.getByLabelText(/^Telefone/)).toBe(phone);
    expect(name).toHaveValue("Maria Souza");
    expect(phone).toHaveValue(typedPhone);
    expect(phone).toHaveFocus();
  });
});

describe("Goal112 CL5: /clientes/detalhes guarda a edição aberta", () => {
  test.each(DIRECTIONS)("%s", async (_name, from, to) => {
    const media = installMatchMedia(from);
    const user = userEvent.setup();
    renderRoute(<ProductCustomersScreen customerId="c1" scenario="detail" />);

    await user.click(
      await screen.findByRole("button", { name: "Mais ações do cliente" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar dados" }));

    const name = screen.getByLabelText("Nome");
    const phone = screen.getByLabelText("Telefone");
    await user.type(name, " Silva");
    await user.clear(phone);
    await user.type(phone, "21988887777");
    await user.click(name);
    expect(name).toHaveValue("Ana Paula Silva");
    expect(phone).toHaveValue("21988887777");

    media.resize(to);
    expect(screen.getByLabelText("Nome")).toBe(name);
    expect(screen.getByLabelText("Telefone")).toBe(phone);
    expect(name).toHaveValue("Ana Paula Silva");
    expect(phone).toHaveValue("21988887777");
    expect(name).toHaveFocus();

    media.resize(from);
    expect(screen.getByLabelText("Nome")).toBe(name);
    expect(screen.getByLabelText("Telefone")).toBe(phone);
    expect(name).toHaveValue("Ana Paula Silva");
    expect(phone).toHaveValue("21988887777");
    expect(name).toHaveFocus();
  });
});

describe("Goal112 S3: /servicos/novo guarda o preço digitado", () => {
  test.each(DIRECTIONS)("%s", async (_name, from, to) => {
    const media = installMatchMedia(from);
    const user = userEvent.setup();
    renderRoute(<ProductServicesScreen scenario="new" />);

    const price = await screen.findByRole("textbox", { name: "Preço" });
    await user.type(price, "125,5");
    expect(price).toHaveValue("125,5");
    expect(price).toHaveFocus();

    media.resize(to);
    expect(screen.getByRole("textbox", { name: "Preço" })).toBe(price);
    expect(price).toHaveValue("125,5");
    expect(price).toHaveFocus();

    media.resize(from);
    expect(screen.getByRole("textbox", { name: "Preço" })).toBe(price);
    expect(price).toHaveValue("125,5");
    expect(price).toHaveFocus();
  });
});

describe("Goal112 S4: /servicos/editar guarda o preço e a linha aberta", () => {
  test.each(DIRECTIONS)("%s", async (_name, from, to) => {
    const media = installMatchMedia(from);
    const user = userEvent.setup();
    const { container } = renderRoute(
      <ProductServicesScreen scenario="edit" serviceId="s1" />,
    );

    const price = await screen.findByRole("textbox", { name: "Preço" });
    const row = container.querySelector<HTMLButtonElement>(
      '[data-option="description"] .service-option-row',
    ) as HTMLButtonElement;
    expect(row).not.toBeNull();
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");

    await user.click(price);
    await user.type(price, ",5");
    expect(price).toHaveValue("80,5");
    expect(price).toHaveFocus();

    media.resize(to);
    expect(screen.getByRole("textbox", { name: "Preço" })).toBe(price);
    expect(
      container.querySelector('[data-option="description"] .service-option-row'),
    ).toBe(row);
    expect(price).toHaveValue("80,5");
    expect(price).toHaveFocus();
    expect(row).toHaveAttribute("aria-expanded", "true");

    media.resize(from);
    expect(screen.getByRole("textbox", { name: "Preço" })).toBe(price);
    expect(
      container.querySelector('[data-option="description"] .service-option-row'),
    ).toBe(row);
    expect(price).toHaveValue("80,5");
    expect(price).toHaveFocus();
    expect(row).toHaveAttribute("aria-expanded", "true");
  });
});

describe("Goal112: a lista só existe onde cabe (D-103 f)", () => {
  test("/clientes/novo estreito não monta nem busca a lista; larga busca uma vez", async () => {
    const media = installMatchMedia(NARROW);
    const { container } = renderRoute(<ProductCustomersScreen scenario="new" />);
    await screen.findByLabelText("Nome");

    expect(container.querySelector(".list-detail-list")).toBeNull();
    expect(customersList).not.toHaveBeenCalled();

    media.resize(WIDE);
    const list = container.querySelector<HTMLElement>(".list-detail-list");
    expect(list).not.toBeNull();
    expect(list?.tagName).toBe("ASIDE");
    expect(list).toHaveAttribute("aria-label", "Clientes");
    await waitFor(() => expect(customersList).toHaveBeenCalledTimes(1));
    await within(list as HTMLElement).findByText("Ana Paula");

    media.resize(NARROW);
    expect(container.querySelector(".list-detail-list")).toBeNull();
    expect(customersList).toHaveBeenCalledTimes(1);
  });

  test("/clientes/detalhes estreito não busca a lista", async () => {
    const media = installMatchMedia(NARROW);
    const { container } = renderRoute(
      <ProductCustomersScreen customerId="c1" scenario="detail" />,
    );
    await screen.findAllByText("Ana Paula");

    expect(container.querySelector(".list-detail-list")).toBeNull();
    expect(customersList).not.toHaveBeenCalled();
    expect(customersGet).toHaveBeenCalledTimes(1);

    media.resize(WIDE);
    await waitFor(() => expect(customersList).toHaveBeenCalledTimes(1));
    expect(customersGet).toHaveBeenCalledTimes(1);
  });

  test("/servicos/editar estreito lê o catálogo uma vez; largo, duas (formulário e lista)", async () => {
    const media = installMatchMedia(NARROW);
    const { container } = renderRoute(
      <ProductServicesScreen scenario="edit" serviceId="s1" />,
    );
    await screen.findByRole("textbox", { name: "Preço" });

    expect(container.querySelector(".list-detail-list")).toBeNull();
    expect(serviceCatalogList).toHaveBeenCalledTimes(1);

    media.resize(WIDE);
    await waitFor(() => expect(serviceCatalogList).toHaveBeenCalledTimes(2));
    expect(container.querySelector(".list-detail-list")).not.toBeNull();
  });
});

describe("Goal112: uma chamada de useShellConfig por árvore em todas as larguras", () => {
  const SCREENS: Array<[string, () => ReactElement, () => Promise<unknown>]> = [
    [
      "CL4",
      () => <ProductCustomersScreen scenario="new" />,
      () => screen.findByLabelText("Nome"),
    ],
    [
      "CL5",
      () => <ProductCustomersScreen customerId="c1" scenario="detail" />,
      () => screen.findAllByText("Ana Paula"),
    ],
    [
      "S3",
      () => <ProductServicesScreen scenario="new" />,
      () => screen.findByRole("textbox", { name: "Preço" }),
    ],
    [
      "S4",
      () => <ProductServicesScreen scenario="edit" serviceId="s1" />,
      () => screen.findByRole("textbox", { name: "Preço" }),
    ],
  ];

  test.each(SCREENS)("%s: estreito, largo e de volta", async (_name, make, loaded) => {
    const media = installMatchMedia(NARROW);
    renderRoute(make());
    await loaded();
    await waitFor(() => expect(shellCallers.size).toBe(1));

    media.resize(WIDE);
    await loaded();
    expect(shellCallers.size).toBe(1);

    media.resize(NARROW);
    expect(shellCallers.size).toBe(1);
  });
});
