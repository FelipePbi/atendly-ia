// @vitest-environment jsdom
/**
 * A lista de Clientes mora no layout de `/clientes` (CustomersWorkspace):
 * abrir uma cliente, trocar de cliente e voltar não remontam nem buscam a
 * lista de novo; ela só atualiza quando o cadastro muda. E só os itens rolam:
 * título, contador, "+" e busca ficam fora da área que rola.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { type CustomerListQuery, notifyCustomersChanged } from "@/data";
import { CustomerList } from "@/features/customers/CustomerList";
import { CustomersWorkspace } from "@/features/customers/CustomersWorkspace";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const customersList = vi.fn();
const calendarGetCalendar = vi.fn();
const navigation = { pathname: "/clientes", search: "" };

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { getCalendar: calendarGetCalendar },
    customers: { list: customersList },
  }),
}));

const PEOPLE = Array.from({ length: 20 }, (_, index) => ({
  id: `c${index + 1}`,
  name: `Cliente ${String(index + 1).padStart(2, "0")}`,
  phone: `55119000000${String(index + 1).padStart(2, "0")}`,
}));

function serverPage(query: CustomerListQuery = {}) {
  const start = query.cursor ? Number(query.cursor) : 0;
  const end = start + (query.limit ?? PEOPLE.length);
  return {
    items: PEOPLE.slice(start, end),
    managedExternally: false,
    nextCursor: end < PEOPLE.length ? String(end) : null,
    source: "AVENLY" as const,
    total: PEOPLE.length,
  };
}

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

function DetailStub({ id }: { id: string }) {
  return <section aria-label="Perfil">Perfil de {id}</section>;
}

/** O que o App Router monta em cada rota: o layout persiste, a página troca. */
function route(pathname: string, search = "") {
  navigation.pathname = pathname;
  navigation.search = search;
  const id = new URLSearchParams(search).get("id");
  return (
    <ShellConfigProvider>
      <CustomersWorkspace>
        {pathname === "/clientes" ? (
          <CustomerList key="list" />
        ) : (
          <DetailStub id={id ?? ""} key={`detail-${id}`} />
        )}
      </CustomersWorkspace>
    </ShellConfigProvider>
  );
}

function listNode() {
  return screen.getByRole("list", { name: "Clientes" });
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
  customersList.mockReset();
  customersList.mockImplementation(async (query?: CustomerListQuery) =>
    serverPage(query),
  );
  calendarGetCalendar.mockReset();
  calendarGetCalendar.mockResolvedValue({ timezone: "America/Sao_Paulo" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Clientes — lista persistente entre lista e detalhe", () => {
  test("no desktop, abrir e trocar de cliente não busca nem remonta a lista", async () => {
    setViewport(1440);
    const view = render(route("/clientes"));
    const list = await screen.findByRole("list", { name: "Clientes" });
    expect(customersList).toHaveBeenCalledTimes(1);

    view.rerender(route("/clientes/detalhes", "?id=c2"));
    expect(await screen.findByText("Perfil de c2")).toBeVisible();
    expect(listNode()).toBe(list);
    expect(
      within(list).getByRole("link", { name: /^Cliente 02/ }),
    ).toHaveAttribute("aria-current", "page");

    view.rerender(route("/clientes/detalhes", "?id=c3"));
    expect(await screen.findByText("Perfil de c3")).toBeVisible();
    expect(listNode()).toBe(list);
    expect(
      within(list).getByRole("link", { name: /^Cliente 03/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(customersList).toHaveBeenCalledTimes(1);
  });

  test("no celular, voltar do detalhe encontra a lista e a busca como ficaram, sem buscar de novo", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const view = render(route("/clientes"));
    await screen.findByRole("list", { name: "Clientes" });
    await user.type(screen.getByRole("searchbox"), "Cliente 1");
    await screen.findByRole("link", { name: /^Cliente 12/ });
    const calls = customersList.mock.calls.length;

    view.rerender(route("/clientes/detalhes", "?id=c12"));
    expect(await screen.findByText("Perfil de c12")).toBeVisible();
    // Lista e detalhe são telas separadas no celular.
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();

    view.rerender(route("/clientes"));
    expect(screen.getByRole("searchbox")).toHaveValue("Cliente 1");
    expect(screen.getByRole("link", { name: /^Cliente 12/ })).toBeVisible();
    expect(customersList).toHaveBeenCalledTimes(calls);
  });

  test("cadastro que muda atualiza a lista sem esqueleto e sem remontar", async () => {
    setViewport(1440);
    render(route("/clientes/detalhes", "?id=c1"));
    const list = await screen.findByRole("list", { name: "Clientes" });
    customersList.mockImplementation(async (query?: CustomerListQuery) => {
      const page = serverPage(query);
      return {
        ...page,
        items: [{ id: "c0", name: "Aaron Novo", phone: null }, ...page.items],
        total: page.total + 1,
      };
    });

    act(() => notifyCustomersChanged());

    expect(
      await within(list).findByRole("link", { name: /^Aaron Novo/ }),
    ).toBeVisible();
    expect(screen.queryByText("Carregando clientes")).not.toBeInTheDocument();
    expect(listNode()).toBe(list);
    expect(screen.getByText("21")).toBeVisible();
  });

  test("só os itens rolam: título, contador, '+' e busca ficam fora da área que rola", async () => {
    setViewport(1440);
    const { container } = render(route("/clientes"));
    const list = await screen.findByRole("list", { name: "Clientes" });

    const scroller = container.querySelector(".customer-panel-scroll");
    expect(scroller).not.toBeNull();
    expect(scroller).toContainElement(list);
    expect(scroller).not.toContainElement(screen.getByRole("searchbox"));
    expect(scroller).not.toContainElement(
      screen.getByRole("heading", { name: "Clientes" }),
    );
    expect(scroller).not.toContainElement(
      screen.getByRole("link", { name: "Novo cliente" }),
    );
  });
});

describe("Clientes — sem a casca da rota", () => {
  test("a tela sozinha (sem layout) continua buscando a própria lista", async () => {
    setViewport(390);
    render(
      <ShellConfigProvider>
        <CustomerList />
      </ShellConfigProvider>,
    );
    await screen.findByRole("list", { name: "Clientes" });
    await waitFor(() => expect(customersList).toHaveBeenCalledTimes(1));
  });
});
