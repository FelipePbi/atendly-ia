// @vitest-environment jsdom
/**
 * Goal150 (WU-01): a lista de Clientes na medida do protótipo (CL1, CL3 e CL8).
 *
 * Os quadros não declaram `line-height` e a linha, a letra do grupo e a
 * contagem do cabeçalho usam o `normal`; a busca parada tem a altura desenhada
 * de 48 px e o bloco da meta tem `gap: 2px`. Tudo escopado a `.customer-panel-*`.
 * A mesma linha (com quem agenda por quem) aparece na lista sozinha e na coluna
 * ao lado do perfil.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  CustomerList,
  CustomerListPanel,
} from "@/features/customers/CustomerList";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

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

function stylesheet(file: string) {
  return readFileSync(resolve(__dirname, "../src/shared/styles", file), "utf8");
}

/** Corpo da regra de nível raiz com esse seletor exato (fora de `@media`). */
function ruleBody(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `regra "${selector}" em avenly-customers.css`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

const customers = stylesheet("avenly-customers.css");

describe("Goal150 — regras da lista de Clientes", () => {
  test.each([
    ".customer-panel-item",
    ".customer-panel-letter",
    ".customer-panel-count",
  ])("%s usa line-height: normal, como o quadro", (selector) => {
    expect(ruleBody(customers, selector)).toMatch(/line-height: normal;/);
  });

  test("a regra redundante da lista de busca saiu", () => {
    expect(customers).not.toMatch(
      /\.customer-search-results \.customer-panel-item\s*\{/,
    );
  });

  test("a busca parada tem a altura desenhada do quadro, 48 px; a busca em andamento segue em 48 px", () => {
    expect(ruleBody(customers, ".customer-panel-search .input")).toMatch(
      /min-height: 48px;/,
    );
    expect(ruleBody(customers, ".customer-panel-search .input")).not.toMatch(
      /46px/,
    );
    expect(
      ruleBody(customers, ".customer-panel-searchbar.is-searching .input"),
    ).toMatch(/min-height: 48px;/);
  });

  test("o texto da busca parada começa a 44 px da borda, como o quadro (42 px de padding mais a borda)", () => {
    expect(ruleBody(customers, ".customer-panel-search .input")).toMatch(
      /padding-left: 42px;/,
    );
  });

  test("o bloco da meta tem o espaçamento de 2 px do quadro", () => {
    expect(ruleBody(customers, ".customer-panel-meta")).toMatch(/gap: 2px;/);
  });

  test("o padding do quadro (linha, letra e busca) não mudou", () => {
    expect(ruleBody(customers, ".customer-panel-item")).toMatch(
      /padding: 14px 20px;/,
    );
    expect(ruleBody(customers, ".customer-panel-letter")).toMatch(
      /padding: 20px 20px 8px;/,
    );
    expect(ruleBody(customers, ".customer-panel-search")).toMatch(
      /padding: 14px 20px 0;/,
    );
  });

  test("nenhuma regra nova fora de .customer-panel-*: só as cinco da ficha do responsável seguem com line-height: normal", () => {
    const outside: string[] = [];
    for (const match of customers.matchAll(
      /(?:^|\n)\s*([^{}\n@][^{}]*?)\s*\{([^{}]*)\}/g,
    )) {
      if (!/line-height: normal;/.test(match[2])) continue;
      if (match[1].includes(".customer-panel-")) continue;
      outside.push(match[1].trim().replace(/\s+/g, " "));
    }
    expect(outside).toHaveLength(5);
    for (const selector of outside) {
      expect(selector).toMatch(/directory-detail-phone|customer-guardian/);
    }
  });

  test("a casca (avenly.css) não conhece o painel da lista", () => {
    expect(stylesheet("avenly.css")).not.toMatch(/customer-panel/);
  });
});

type Person = { id: string; name: string | null };
type Row = {
  id: string;
  name: string | null;
  phone: string | null;
  guardian?: Person | null;
  dependents?: Person[];
};

const ROWS: Row[] = [
  {
    guardian: { id: "m1", name: "Maria Souza" },
    id: "p1",
    name: "Pedro Souza",
    phone: null,
  },
  {
    dependents: [{ id: "p1", name: "Pedro Souza" }],
    id: "m1",
    name: "Maria Souza",
    phone: "5511987651100",
  },
];

describe("Goal150 — CustomerListPanel com guardian e dependents", () => {
  beforeEach(() => {
    customersList.mockReset();
    calendarGetCalendar.mockReset();
    calendarGetCalendar.mockResolvedValue({
      capabilities: { manageCustomers: true },
      timezone: "America/Sao_Paulo",
    });
    customersList.mockResolvedValue({
      items: ROWS,
      managedExternally: false,
      source: "AVENLY",
    });
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });

  test("ao lado do perfil, a Maria mostra 'agenda para Pedro Souza' e o Pedro mostra quem agenda por ele", async () => {
    setViewport(1366);
    const { container } = render(<CustomerListPanel openId="p1" />);

    const maria = await screen.findByRole("link", { name: /^Maria Souza/ });
    expect(within(maria).getByText("agenda para Pedro Souza")).toBeVisible();
    const pedro = await screen.findByRole("link", { name: /^Pedro Souza/ });
    expect(
      within(pedro).getByText("Maria Souza agenda por esta pessoa"),
    ).toBeVisible();

    expect(maria.closest(".customer-panel-item")).not.toBeNull();
    expect(pedro).toHaveClass("customer-panel-item", "is-open");
    expect(
      container.querySelectorAll(".customer-panel-relation"),
    ).toHaveLength(2);
  });

  test("a coluna ao lado do perfil desenha as mesmas linhas da lista sozinha", async () => {
    setViewport(1366);
    const panel = render(<CustomerListPanel />);
    await waitFor(() =>
      expect(
        panel.container.querySelectorAll(".customer-panel-item"),
      ).toHaveLength(2),
    );
    const panelRows = [
      ...panel.container.querySelectorAll(".customer-panel-item"),
    ].map((row) => row.textContent);
    panel.unmount();

    setViewport(390);
    const alone = render(
      <ShellConfigProvider>
        <CustomerList />
      </ShellConfigProvider>,
    );
    await waitFor(() =>
      expect(
        alone.container.querySelectorAll(".customer-panel-item"),
      ).toHaveLength(2),
    );
    const aloneRows = [
      ...alone.container.querySelectorAll(".customer-panel-item"),
    ].map((row) => row.textContent);

    expect(aloneRows).toEqual(panelRows);
    expect(aloneRows.join(" ")).toContain("agenda para Pedro Souza");
    expect(aloneRows.join(" ")).toContain("Maria Souza agenda por esta pessoa");
  });
});
