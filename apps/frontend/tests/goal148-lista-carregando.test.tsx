// @vitest-environment jsdom
/**
 * Goal148 (WU-02): a lista de Clientes carregando (CL9).
 *
 * Título e busca ficam na tela enquanto a lista não chega, o esqueleto tem as
 * quatro linhas do quadro fora da árvore acessível e o texto digitado vale
 * quando a lista chega. O esqueleto só aparece se a carga passar de ~150 ms
 * (D-168, 2026-10-16): carga rápida não pisca. Erro (CL10), vazio (CL2), busca (CL3) e lista (CL1)
 * seguem como estavam.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type Customer, type CustomerListQuery } from "@/data";
import {
  CustomerList,
  CustomerListPanel,
} from "@/features/customers/CustomerList";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";
import { asServerSearch } from "./support/customer-list-server";

const customersList = vi.fn();
const calendarGetCalendar = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { getCalendar: calendarGetCalendar },
    customers: {
      list: (query?: CustomerListQuery, signal?: AbortSignal) =>
        asServerSearch(customersList(query, signal), query),
    },
  }),
}));

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

function renderList() {
  return render(
    <ShellConfigProvider>
      <CustomerList />
    </ShellConfigProvider>,
  );
}

type ListResult = {
  items: Customer[];
  managedExternally: boolean;
  source: "AVENLY";
};

/** Segura a lista até o teste liberar, como a resposta lenta do CL9. */
function holdList() {
  let release: (result: ListResult) => void = () => undefined;
  customersList.mockReturnValue(
    new Promise<ListResult>((resolveList) => {
      release = resolveList;
    }),
  );
  return (items: Customer[], managedExternally = false) =>
    release({ items, managedExternally, source: "AVENLY" });
}

const MARINA: Customer = {
  id: "c1",
  name: "Marina Costa",
  phone: "11999990000",
};
const BRUNO: Customer = {
  id: "c2",
  name: "Bruno Lima",
  phone: "11988880000",
};

function stylesheet(file: string) {
  return readFileSync(resolve(__dirname, "../src/shared/styles", file), "utf8");
}

beforeEach(() => {
  customersList.mockReset();
  calendarGetCalendar.mockReset();
  calendarGetCalendar.mockResolvedValue({ timezone: "America/Sao_Paulo" });
  setViewport(390);
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

describe("CL9 — Clientes · carregando", () => {
  test("título, busca e esqueleto aparecem; contagem e 'Nenhum resultado' não", async () => {
    holdList();
    const { container } = renderList();

    expect(
      screen.getByRole("heading", { level: 1, name: "Clientes" }),
    ).toBeVisible();
    const search = screen.getByRole("searchbox", { name: "Buscar cliente" });
    expect(search).toHaveAttribute(
      "placeholder",
      "Buscar por nome ou telefone",
    );
    expect(search).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Carregando clientes");
    // No primeiro quadro, nada de esqueleto: carga rápida entra direto.
    expect(container.querySelector(".customer-skeleton")).toBeNull();

    await waitFor(() =>
      expect(container.querySelectorAll(".customer-skeleton-row")).toHaveLength(
        4,
      ),
    );
    const skeleton = container.querySelector(".customer-skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(within(skeleton as HTMLElement).queryByRole("status")).toBeNull();

    expect(container.querySelector(".customer-panel-count")).toBeNull();
    expect(screen.queryByText(/Nenhum cliente/)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await expectNoA11yViolations(container);
  });

  test("abaixo de 1024 px nem o '+' do painel nem a ação da casca aparecem carregando", () => {
    holdList();
    renderList();

    expect(screen.queryByRole("link", { name: "Novo cliente" })).toBeNull();
  });

  test("quando a lista chega, o esqueleto sai e a lista aparece", async () => {
    const release = holdList();
    const { container } = renderList();

    release([MARINA]);

    expect(await screen.findByText("Marina Costa")).toBeVisible();
    expect(container.querySelector(".customer-skeleton")).toBeNull();
    expect(screen.queryByText("Carregando clientes")).toBeNull();
    expect(container.querySelector(".customer-panel-count")).toHaveTextContent(
      "1",
    );
  });

  test("o texto digitado durante o carregamento filtra a lista quando ela chega", async () => {
    const release = holdList();
    renderList();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Buscar cliente" }),
      "bru",
    );
    expect(screen.getByRole("searchbox")).toHaveValue("bru");
    expect(screen.queryByText(/Nenhum cliente/)).toBeNull();

    release([MARINA, BRUNO]);

    const results = await screen.findByRole("list", { name: "Clientes" });
    expect(within(results).getByText("Bru")).toBeVisible();
    expect(within(results).queryByText(/Marina/)).toBeNull();
    expect(screen.getByRole("searchbox")).toHaveValue("bru");
  });

  test("a partir de 1024 px o '+' do quadro acompanha o título e o painel de detalhe fica vazio", async () => {
    setViewport(1280);
    const release = holdList();
    renderList();

    expect(screen.getByRole("link", { name: "Novo cliente" })).toHaveAttribute(
      "href",
      "/clientes/novo",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Carregando clientes");
    expect(
      screen.queryByText("Selecione um cliente para ver o perfil"),
    ).toBeNull();

    release([MARINA]);

    expect(
      await screen.findByText("Selecione um cliente para ver o perfil"),
    ).toBeVisible();
  });

  test("CustomerListPanel mostra o mesmo carregamento", async () => {
    const release = holdList();
    const { container } = render(<CustomerListPanel />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Clientes" }),
    ).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "Buscar cliente" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Carregando clientes");
    expect(container.querySelector(".customer-skeleton")).toBeNull();
    await waitFor(() =>
      expect(container.querySelectorAll(".customer-skeleton-row")).toHaveLength(
        4,
      ),
    );

    release([MARINA]);
    expect(await screen.findByText("Marina Costa")).toBeVisible();
  });
});

describe("Goal148 — os outros estados da lista não mudam", () => {
  test("erro (CL10): texto do quadro e ação, sem busca nem esqueleto", async () => {
    customersList.mockRejectedValue(
      new BffHttpError({
        code: "SERVICE_UNAVAILABLE",
        message: "Serviço indisponível",
        requestId: "req-503-abc",
        status: 503,
      }),
    );
    const { container } = renderList();

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(
      screen.getByText(
        "Verifique sua conexão e tente novamente. Seus dados continuam guardados.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeVisible();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(container.querySelector(".customer-skeleton")).toBeNull();
  });

  test("vazio (CL2): sem busca e sem esqueleto", async () => {
    customersList.mockResolvedValue({
      items: [],
      managedExternally: false,
      source: "AVENLY",
    });
    const { container } = renderList();

    expect(
      await screen.findByRole("heading", { name: "Nenhum cliente ainda" }),
    ).toBeVisible();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(container.querySelector(".customer-skeleton")).toBeNull();
  });

  test("busca (CL3): sem resultado, a mensagem aparece", async () => {
    customersList.mockResolvedValue({
      items: [MARINA],
      managedExternally: false,
      source: "AVENLY",
    });
    renderList();

    await screen.findByText("Marina Costa");
    await userEvent.type(screen.getByRole("searchbox"), "zzz");

    expect(
      await screen.findByText("Nenhum cliente corresponde à busca."),
    ).toBeVisible();
    expect(screen.queryByText("Carregando clientes")).toBeNull();
  });

  test("lista (CL1): agrupada, com contagem, sem esqueleto", async () => {
    customersList.mockResolvedValue({
      items: [MARINA, BRUNO],
      managedExternally: false,
      source: "AVENLY",
    });
    const { container } = renderList();

    const list = await screen.findByRole("list", { name: "Clientes" });
    await waitFor(() =>
      expect(within(list).getAllByRole("listitem")).toHaveLength(2),
    );
    expect(container.querySelector(".customer-panel-count")).toHaveTextContent(
      "2",
    );
    expect(container.querySelector(".customer-skeleton")).toBeNull();
  });
});

describe("Goal148 — estilos do esqueleto", () => {
  const customers = stylesheet("avenly-customers.css");

  test("quatro linhas com as larguras e os raios do quadro", () => {
    expect(customers).toMatch(
      /\.customer-skeleton-name\s*\{[^}]*height: 12px;[^}]*width: 45%;[^}]*border-radius: 6px;/,
    );
    expect(customers).toMatch(
      /\.customer-skeleton-meta\s*\{[^}]*height: 10px;[^}]*width: 60%;[^}]*border-radius: 5px;/,
    );
    expect(customers).toMatch(
      /\.customer-skeleton-avatar\s*\{[^}]*width: 40px;[^}]*height: 40px;[^}]*border-radius: 50%;/,
    );
    for (const [row, name, meta] of [
      [2, "55%", "50%"],
      [3, "40%", "62%"],
      [4, "50%", "56%"],
    ] as const) {
      expect(customers).toMatch(
        new RegExp(
          `nth-child\\(${row}\\) \\.customer-skeleton-name\\s*\\{\\s*width: ${name};`,
        ),
      );
      expect(customers).toMatch(
        new RegExp(
          `nth-child\\(${row}\\) \\.customer-skeleton-meta\\s*\\{\\s*width: ${meta};`,
        ),
      );
    }
  });

  test("brilho #EFEAE2/#F7F4EF de 1,6 s, escopado à lista e parado com reduced motion", () => {
    expect(customers).toMatch(
      /linear-gradient\(90deg, #efeae2 25%, #f7f4ef 50%, #efeae2 75%\)/,
    );
    expect(customers).toMatch(
      /animation: customer-shimmer 1\.6s linear infinite/,
    );
    expect(customers).toMatch(/@keyframes customer-shimmer/);
    expect(customers).toMatch(
      /prefers-reduced-motion: reduce\) \{[^}]*\.customer-skeleton-avatar[^}]*\{\s*animation: none;/,
    );
  });

  test("o .skeleton global e o shimmer das outras telas seguem intactos", () => {
    const global = stylesheet("avenly.css");
    expect(global).toMatch(
      /\.skeleton \{\s*border-radius: 8px;[^}]*animation: shimmer 1\.35s infinite;/,
    );
    expect(global).toMatch(/\.skeleton-line \{\s*height: 12px;/);
    expect(global).toMatch(/\.skeleton-title \{\s*width: 48%;/);
    expect(global).toMatch(/@keyframes shimmer \{/);
    expect(customers).not.toMatch(/(^|\n)\.skeleton[\s{,]/);
  });
});
