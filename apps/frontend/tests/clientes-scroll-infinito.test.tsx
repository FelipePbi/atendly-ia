// @vitest-environment jsdom
/**
 * Lista de Clientes sob demanda (scroll infinito).
 *
 * A primeira leva traz 15 pessoas e o cabeçalho mostra o total real do
 * negócio; o sentinela perto do fim pede a próxima leva pelo cursor, sem
 * repetir ninguém nem repetir o cabeçalho da letra que continua; uma leva
 * que falha mostra "Tentar de novo" sem perder o que já veio; a busca vai
 * para o servidor, que procura no negócio inteiro.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type CustomerListQuery } from "@/data";
import { CustomerList } from "@/features/customers/CustomerList";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const customersList = vi.fn();
const calendarGetCalendar = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { getCalendar: calendarGetCalendar },
    customers: { list: customersList },
  }),
}));

/** IntersectionObserver de mentira: o teste decide quando o sentinela aparece. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  disconnect() {
    this.disconnected = true;
  }

  unobserve() {}

  takeRecords() {
    return [];
  }

  static reachEnd() {
    for (const observer of FakeObserver.instances) {
      if (observer.disconnected) continue;
      observer.callback(
        [...observer.targets].map(
          (target) =>
            ({ isIntersecting: true, target }) as IntersectionObserverEntry,
        ),
        observer as unknown as IntersectionObserver,
      );
    }
  }
}

const TOTAL = 40;
const PEOPLE = Array.from({ length: TOTAL }, (_, index) => ({
  id: `c${index + 1}`,
  name: `Cliente ${String(index + 1).padStart(2, "0")}`,
  phone: `55119000000${String(index + 1).padStart(2, "0")}`,
}));

/** O servidor de mentira: pagina por cursor (o índice) e busca no todo. */
function serverPage(query: CustomerListQuery = {}) {
  const matches = query.q
    ? PEOPLE.filter((person) =>
        person.name.toLowerCase().includes(query.q!.toLowerCase()),
      )
    : PEOPLE;
  const start = query.cursor ? Number(query.cursor) : 0;
  const end = start + (query.limit ?? matches.length);
  return {
    items: matches.slice(start, end),
    managedExternally: false,
    nextCursor: end < matches.length ? String(end) : null,
    source: "AVENLY" as const,
    total: matches.length,
  };
}

function renderList() {
  return render(
    <ShellConfigProvider>
      <CustomerList />
    </ShellConfigProvider>,
  );
}

function rows() {
  return within(screen.getByRole("list", { name: "Clientes" })).getAllByRole(
    "link",
  );
}

beforeEach(() => {
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  customersList.mockReset();
  customersList.mockImplementation(async (query?: CustomerListQuery) =>
    serverPage(query),
  );
  calendarGetCalendar.mockReset();
  calendarGetCalendar.mockResolvedValue({ timezone: "America/Sao_Paulo" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Clientes — scroll infinito", () => {
  test("a primeira leva traz 15, o total é o do negócio e o fim da lista pede a próxima pelo cursor", async () => {
    renderList();
    await screen.findByRole("list", { name: "Clientes" });

    expect(rows()).toHaveLength(15);
    expect(customersList).toHaveBeenCalledTimes(1);
    // A lista principal é a aba Ativos, por nome (2026-10-18).
    expect(customersList.mock.calls[0]?.[0]).toEqual({
      limit: 15,
      q: undefined,
      status: "active",
      sort: "name",
    });
    expect(screen.getByText("40")).toBeVisible();
    expect(screen.getByText("clientes")).toBeInTheDocument();

    FakeObserver.reachEnd();
    await waitFor(() => expect(rows()).toHaveLength(30));
    expect(customersList.mock.calls[1]?.[0]).toMatchObject({
      cursor: "15",
      limit: 15,
    });
    // A leva nova continua a letra C: um cabeçalho só.
    expect(screen.getAllByText(/^C$/)).toHaveLength(1);
    expect(screen.queryByText("Fim da lista")).not.toBeInTheDocument();

    FakeObserver.reachEnd();
    await waitFor(() => expect(rows()).toHaveLength(40));
    expect(await screen.findByText("Fim da lista")).toBeVisible();

    // No fim, o sentinela não pede mais nada.
    FakeObserver.reachEnd();
    expect(customersList).toHaveBeenCalledTimes(3);
  });

  test("a mesma pessoa em duas levas aparece uma vez só", async () => {
    customersList.mockImplementation(async (query?: CustomerListQuery) => {
      const page = serverPage(query);
      // A segunda leva repete a última pessoa da primeira.
      return query?.cursor
        ? { ...page, items: [PEOPLE[14], ...page.items] }
        : page;
    });
    renderList();
    await screen.findByRole("list", { name: "Clientes" });

    FakeObserver.reachEnd();
    // Folga para a suíte inteira rodando em paralelo (era instável a 1 s).
    await waitFor(() => expect(rows()).toHaveLength(30), { timeout: 4000 });
    expect(screen.getAllByRole("link", { name: /Cliente 15/ })).toHaveLength(1);
  });

  test("leva que falha mostra 'Tentar de novo', mantém o que veio e só tenta de novo quando pedido", async () => {
    const user = userEvent.setup();
    customersList.mockImplementation(async (query?: CustomerListQuery) => {
      if (query?.cursor) {
        throw new BffHttpError({
          code: "UPSTREAM_UNAVAILABLE",
          message: "fora do ar",
          requestId: "req-more",
          status: 503,
        });
      }
      return serverPage(query);
    });
    const { container } = renderList();
    await screen.findByRole("list", { name: "Clientes" });

    FakeObserver.reachEnd();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar mais clientes.");
    expect(rows()).toHaveLength(15);
    await expectNoA11yViolations(container);

    // O sentinela sozinho não martela o servidor depois da falha.
    FakeObserver.reachEnd();
    expect(customersList).toHaveBeenCalledTimes(2);

    customersList.mockImplementation(async (query?: CustomerListQuery) =>
      serverPage(query),
    );
    const retry = within(alert).getByRole("button", { name: "Tentar de novo" });
    retry.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(rows()).toHaveLength(30));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(customersList.mock.calls[2]?.[0]).toMatchObject({ cursor: "15" });
  });

  test("a busca vai para o servidor e acha quem ainda não foi carregado", async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByRole("list", { name: "Clientes" });
    expect(
      screen.queryByRole("link", { name: /^Cliente 38/ }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "cliente 38");

    expect(
      await screen.findByRole("link", { name: /^Cliente 38/ }),
    ).toBeVisible();
    expect(customersList).toHaveBeenLastCalledWith(
      { limit: 15, q: "cliente 38", status: "active", sort: "name" },
      expect.any(AbortSignal),
    );
  });

  test("busca que falha mostra 'Tentar de novo' e volta a buscar", async () => {
    const user = userEvent.setup();
    customersList.mockImplementation(async (query?: CustomerListQuery) => {
      if (query?.q) throw new Error("rede");
      return serverPage(query);
    });
    renderList();
    await screen.findByRole("list", { name: "Clientes" });

    await user.type(screen.getByRole("searchbox"), "cliente 38");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível buscar agora.");

    customersList.mockImplementation(async (query?: CustomerListQuery) =>
      serverPage(query),
    );
    await user.click(
      within(alert).getByRole("button", { name: "Tentar de novo" }),
    );
    expect(
      await screen.findByRole("link", { name: /^Cliente 38/ }),
    ).toBeVisible();
  });

  // Abas Ativos/Inativos e ordem (2026-10-18).
  test("a aba Inativos pede só os desativados e mostra o vazio próprio", async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(rows()).toHaveLength(15));
    customersList.mockImplementation(async (query?: CustomerListQuery) =>
      query?.status === "inactive"
        ? {
            items: [],
            total: 0,
            nextCursor: null,
            source: "AVENLY",
            managedExternally: false,
          }
        : serverPage(query),
    );

    await user.click(screen.getByRole("button", { name: "Inativos" }));

    expect(await screen.findByText(/Nenhum cliente inativo/)).toBeVisible();
    expect(customersList).toHaveBeenLastCalledWith(
      { limit: 15, q: undefined, status: "inactive", sort: "name" },
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "Inativos" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // As abas continuam lá para voltar.
    await user.click(screen.getByRole("button", { name: "Ativos" }));
    await waitFor(() => expect(rows()).toHaveLength(15));
  });

  test("Ordenar abre a folha e a escolha vai para o servidor, sem letras", async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(rows()).toHaveLength(15));

    await user.click(screen.getByRole("button", { name: /Ordenar por/ }));
    const sheet = screen.getByRole("dialog", { name: "Ordenar clientes" });
    expect(
      within(sheet)
        .getAllByRole("radio")
        .map(
          (radio) =>
            radio.closest("label")?.querySelector("strong")?.textContent,
        ),
    ).toEqual([
      "Nome",
      "Último atendimento",
      "Próximos atendimentos",
      "Frequência",
    ]);
    await user.click(within(sheet).getByRole("radio", { name: /Frequência/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(customersList).toHaveBeenLastCalledWith(
        { limit: 15, q: undefined, status: "active", sort: "frequency" },
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByRole("button", { name: /Ordenar por/ }),
    ).toHaveTextContent("Frequência");
    expect(document.querySelector(".customer-panel-letter")).toBeNull();
  });

  test("Ordenar é um modal no centro e fecha ao tocar até na opção já marcada", async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(rows()).toHaveLength(15));

    await user.click(screen.getByRole("button", { name: /Ordenar por/ }));
    const dialog = screen.getByRole("dialog", { name: "Ordenar clientes" });
    expect(dialog.closest(".bottom-sheet-wrap")).toBeNull();
    await user.click(within(dialog).getByRole("radio", { name: /^Nome/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Ordenar por/ }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("radio", {
        name: /Próximos atendimentos/,
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(customersList).toHaveBeenLastCalledWith(
        { limit: 15, q: undefined, status: "active", sort: "next" },
        expect.any(AbortSignal),
      ),
    );
  });
});
