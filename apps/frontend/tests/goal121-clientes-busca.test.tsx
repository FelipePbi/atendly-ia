// @vitest-environment jsdom
/**
 * Goal121 (WU-03): a busca de Clientes (CL3) e o preenchimento do formulário.
 *
 * CL3: o trecho digitado fica marcado no nome (a primeira ocorrência, sem
 * diferenciar caixa), "Cancelar" limpa a busca e a última linha cria o cliente
 * já com a busca (?nome= ou ?telefone=). O CustomerForm lê os dois da URL só
 * para preencher os campos e não grava nada antes de "Salvar cliente".
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CustomerListQuery } from "@/data";
import { CustomerForm } from "@/features/customers/CustomerForm";
import { CustomerList } from "@/features/customers/CustomerList";
import {
  ShellConfigProvider,
  useShellConfigValue,
} from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";
import {
  asServerSearch,
  waitForSearch,
} from "./support/customer-list-server";

const customersList = vi.fn();
const customersCreate = vi.fn();
const customersCandidates = vi.fn();
const calendarGetCalendar = vi.fn();
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { getCalendar: calendarGetCalendar },
    customers: {
      create: customersCreate,
      list: (query?: CustomerListQuery, signal?: AbortSignal) =>
        asServerSearch(customersList(query, signal), query),
      listCandidatesByPhone: customersCandidates,
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

const CUSTOMERS = [
  { id: "c1", name: "Marina Costa", phone: "5511990012200" },
  { id: "c2", name: "Marcos Vieira", phone: "5511988887766" },
  { id: "c3", name: "Beatriz Lima", phone: "5511955554321" },
];

type Row = { id: string; name: string; phone: string | null };

function listResult(managedExternally = false, items: Row[] = CUSTOMERS) {
  return { items, managedExternally, source: "AVENLY" };
}

function renderList() {
  return render(
    <ShellConfigProvider>
      <CustomerList />
    </ShellConfigProvider>,
  );
}

async function search(text: string) {
  const view = renderList();
  const user = userEvent.setup();
  await user.type(await screen.findByRole("searchbox"), text);
  await waitForSearch();
  return { ...view, user };
}

beforeEach(() => {
  customersList.mockReset();
  customersCreate.mockReset();
  customersCandidates.mockReset();
  routerReplace.mockReset();
  calendarGetCalendar.mockReset();
  calendarGetCalendar.mockResolvedValue({
    capabilities: { manageCustomers: true },
    timezone: "America/Sao_Paulo",
  });
  customersList.mockResolvedValue(listResult());
  setViewport(390);
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
  window.history.replaceState({}, "", "/");
});

describe("CL3 — Clientes · busca", () => {
  test("marca o trecho digitado no nome, mesmo com maiúsculas na busca", async () => {
    const { container } = await search("MAR");

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(Array.from(marks, (mark) => mark.textContent)).toEqual([
      "Mar",
      "Mar",
    ]);
    expect(screen.getByRole("link", { name: /Marina Costa/ })).toBeVisible();
    expect(screen.queryByText("Beatriz Lima")).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  test("marca só a primeira ocorrência dentro do nome", async () => {
    customersList.mockResolvedValue(
      listResult(false, [{ id: "c9", name: "Ana Mariana", phone: null }]),
    );
    const { container } = await search("ana");

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("Ana");
  });

  test("quando só o telefone casa, nenhum trecho do nome é marcado", async () => {
    const { container } = await search("9900");

    expect(await screen.findByText("Marina Costa")).toBeVisible();
    expect(container.querySelectorAll("mark")).toHaveLength(0);
    expect(screen.queryByText("Marcos Vieira")).not.toBeInTheDocument();
  });

  test("'Cancelar' limpa a busca e devolve a lista com o título", async () => {
    const { user } = await search("mar");
    expect(screen.queryByRole("heading", { name: "Clientes" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Clientes" })).toBeVisible();
    expect(screen.getByText("Beatriz Lima")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Adicionar novo cliente/ }),
    ).not.toBeInTheDocument();
  });

  test("a barra de abas some com a busca preenchida e volta depois de 'Cancelar'", async () => {
    function BottomNavProbe() {
      const config = useShellConfigValue();
      return (
        <output data-testid="bottom-nav">
          {config?.showBottomNav === false ? "oculta" : "visível"}
        </output>
      );
    }
    render(
      <ShellConfigProvider>
        <BottomNavProbe />
        <CustomerList />
      </ShellConfigProvider>,
    );
    const user = userEvent.setup();
    const probe = screen.getByTestId("bottom-nav");

    await user.type(await screen.findByRole("searchbox"), "mar");
    await waitFor(() => expect(probe).toHaveTextContent("oculta"));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(probe).toHaveTextContent("visível"));
  });

  test("a última linha cria o cliente com ?nome= quando a busca tem letra", async () => {
    await search("mar");

    const link = screen.getByRole("link", {
      name: "Adicionar novo cliente “Mar…”",
    });
    expect(link).toHaveAttribute("href", "/clientes/novo?nome=mar");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(within(items[items.length - 1]).getByRole("link"))
      .toBe(link);
  });

  test("a busca sem letra vai para ?telefone= só com os dígitos", async () => {
    await search("(11) 9900");

    expect(
      screen.getByRole("link", { name: /Adicionar novo cliente/ }),
    ).toHaveAttribute("href", "/clientes/novo?telefone=119900");
  });

  test("a linha de criação aparece também sem nenhum resultado", async () => {
    await search("zzz");

    expect(screen.getByText("Nenhum cliente corresponde à busca.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Adicionar novo cliente “Zzz…”" }),
    ).toHaveAttribute("href", "/clientes/novo?nome=zzz");
  });

  test("sem permissão para criar, a linha de criação não existe", async () => {
    customersList.mockResolvedValue(listResult(true));
    await search("mar");

    expect(
      screen.queryByRole("link", { name: /Adicionar novo cliente/ }),
    ).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "zzz");
    await waitForSearch();
    expect(screen.getByText("Nenhum cliente corresponde à busca.")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Adicionar novo cliente/ }),
    ).not.toBeInTheDocument();
  });
});

describe("CustomerForm — preenchimento pela busca", () => {
  function renderForm() {
    return render(
      <ShellConfigProvider>
        <CustomerForm />
      </ShellConfigProvider>,
    );
  }

  test("?nome= e ?telefone= preenchem os campos e nada é gravado antes de salvar", async () => {
    window.history.replaceState({}, "", "/clientes/novo?nome=Mar&telefone=11999990000");
    renderForm();

    const name = await screen.findByLabelText("Nome");
    await waitFor(() => expect(name).toHaveValue("Mar"));
    const phone = screen.getByLabelText<HTMLInputElement>(/Telefone/);
    expect(phone.value.replace(/\D/g, "")).toBe("5511999990000");
    expect(customersCreate).not.toHaveBeenCalled();
    expect(customersCandidates).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salvar cliente" })).toBeEnabled();
  });

  test("sem parâmetros os campos começam vazios", async () => {
    renderForm();

    const name = await screen.findByLabelText("Nome");
    expect(name).toHaveValue("");
    expect((screen.getByLabelText<HTMLInputElement>(/Telefone/)).value).toBe("");
  });

  test("'Salvar cliente' grava o que está nos campos, só então", async () => {
    window.history.replaceState({}, "", "/clientes/novo?nome=Mar");
    customersCreate.mockResolvedValue({ id: "novo", name: "Mar", phone: null });
    const user = userEvent.setup();
    renderForm();

    const name = await screen.findByLabelText("Nome");
    await waitFor(() => expect(name).toHaveValue("Mar"));
    expect(customersCreate).not.toHaveBeenCalled();

    await user.type(name, "ina");
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() => expect(customersCreate).toHaveBeenCalledTimes(1));
    expect(customersCreate).toHaveBeenCalledWith({ name: "Marina", phone: null });
  });
});
