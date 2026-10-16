// @vitest-environment jsdom
/**
 * Perfil da cliente no painel ao lado da lista (pedido de 2026-10-15).
 *
 * Sem esqueleto no painel: enquanto a cliente carrega, o painel fica vazio na
 * primeira carga e, na troca, mantém a anterior esmaecida (`aria-busy`). Cada
 * cliente que chega entra com a animação curta (`is-entering`), na primeira
 * carga e em cada troca; o conteúdo é remontado, a lista não. Trocar de aba
 * não repete a entrada, e o erro continua com estado próprio.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CalendarState, Customer, CustomerDetail } from "@/data";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  usePathname: () => "/clientes/detalhes",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const customersGet = vi.fn();
const customersList = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getCalendar: async () => calendar,
      listAppointments: async () => [],
    },
    conversations: { list: async () => [] },
    customers: {
      get: customersGet,
      list: customersList,
      listMemory: async () => [],
    },
  }),
}));

const calendar: CalendarState = {
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

function customer(id: string, name: string): Customer {
  return { id, name, phone: "11991234567" };
}

function detail(id: string, name: string): CustomerDetail {
  return {
    createdAt: "2025-01-10T10:00:00.000Z",
    id,
    name,
    notes: [],
    phone: "11991234567",
    primaryGuardian: null,
    tags: [],
  } as CustomerDetail;
}

const DETAILS: Record<string, CustomerDetail> = {
  c1: detail("c1", "Ana Paula"),
  c2: detail("c2", "Bia Castro"),
};

/** Pedido de detalhe que só responde quando o teste manda. */
function deferredDetail() {
  let resolve: (value: CustomerDetail) => void = () => undefined;
  customersGet.mockImplementationOnce(
    () =>
      new Promise<CustomerDetail>((done) => {
        resolve = done;
      }),
  );
  return (value: CustomerDetail) => act(async () => resolve(value));
}

function setWideViewport() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: /min-width:\s*1024px/.test(query),
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
    writable: true,
  });
}

function screenFor(customerId: string) {
  return (
    <ShellConfigProvider>
      <ProductCustomersScreen customerId={customerId} scenario="detail" />
    </ShellConfigProvider>
  );
}

function profileSection() {
  return document.querySelector("section.customer-profile");
}

function profileHeading(name: string) {
  return screen.findByRole("heading", { level: 1, name });
}

beforeEach(() => {
  setWideViewport();
  window.history.pushState({}, "", "/clientes/detalhes?id=c1");
  customersList.mockResolvedValue({
    items: [customer("c1", "Ana Paula"), customer("c2", "Bia Castro")],
    managedExternally: false,
    source: "AVENLY",
  });
  customersGet.mockImplementation(async (id: string) => DETAILS[id]);
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

describe("perfil da cliente no painel ao lado da lista", () => {
  test("carregando, o painel não mostra esqueleto; a cliente entra com a animação", async () => {
    const arrive = deferredDetail();
    render(screenFor("c1"));

    await screen.findByRole("list", { name: /clientes/i });
    expect(screen.queryByLabelText("Carregando dados")).toBeNull();
    expect(document.querySelector(".directory-loading-shell")).toBeNull();

    await arrive(DETAILS.c1);
    await profileHeading("Ana Paula");
    expect(profileSection()).toHaveClass("is-entering");
  });

  test("trocar de cliente esmaece a anterior e roda a entrada de novo, sem remontar a lista", async () => {
    const { rerender } = render(screenFor("c1"));
    const firstHeading = await profileHeading("Ana Paula");
    const list = screen.getByRole("list", { name: /clientes/i });

    const arrive = deferredDetail();
    rerender(screenFor("c2"));

    // Enquanto a nova não chega: a anterior fica, esmaecida, sem esqueleto.
    expect(firstHeading).toBeInTheDocument();
    expect(profileSection()).toHaveClass("is-refreshing");
    // A entrada anterior sai: o fim dela seguraria a opacidade em 1.
    expect(profileSection()).not.toHaveClass("is-entering");
    expect(profileSection()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByLabelText("Carregando dados")).toBeNull();

    await arrive(DETAILS.c2);
    const secondHeading = await profileHeading("Bia Castro");

    expect(secondHeading).not.toBe(firstHeading);
    expect(firstHeading).not.toBeInTheDocument();
    expect(profileSection()).toHaveClass("is-entering");
    expect(profileSection()).not.toHaveClass("is-refreshing");
    expect(profileSection()).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("list", { name: /clientes/i })).toBe(list);
  });

  test("trocar de aba não repete a entrada", async () => {
    const user = userEvent.setup();
    render(screenFor("c1"));
    await profileHeading("Ana Paula");
    expect(profileSection()).toHaveClass("is-entering");

    await user.click(screen.getByRole("tab", { name: "Notas" }));
    expect(profileSection()).not.toHaveClass("is-entering");
  });

  test("o erro continua com estado próprio", async () => {
    customersGet.mockRejectedValueOnce(new Error("falhou"));
    render(screenFor("c1"));

    expect(
      await screen.findByRole("heading", { name: "Cliente indisponível" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeVisible();
  });
});
