// @vitest-environment jsdom
/**
 * Goal121 (WU-02): o vazio (CL2) e o erro (CL10) da lista de Clientes.
 *
 * CL2: "Nenhum cliente ainda", o texto do quadro e "Adicionar cliente" só
 * quando a agenda aceita criação. CL10: o título e o texto do quadro,
 * "Tentar novamente" que relê a lista uma vez, e a referência do pedido numa
 * linha própria (divergência declarada).
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type Customer } from "@/data";
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

function unavailable() {
  return new BffHttpError({
    code: "SERVICE_UNAVAILABLE",
    message: "Serviço indisponível",
    requestId: "req-503-abc",
    status: 503,
  });
}

const EMPTY_TEXT =
  "Seus clientes aparecerão aqui quando você criar um agendamento ou cadastrá-los manualmente. Quem marcar pelo WhatsApp é cadastrado pela IA na hora da confirmação.";
const ERROR_TEXT =
  "Verifique sua conexão e tente novamente. Seus dados continuam guardados.";

beforeEach(() => {
  customersList.mockReset();
  calendarGetCalendar.mockReset();
  calendarGetCalendar.mockResolvedValue({ timezone: "America/Sao_Paulo" });
  setViewport(390);
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

describe("CL2 — Clientes · vazio", () => {
  test("mostra o título, o texto do quadro e 'Adicionar cliente' para /clientes/novo", async () => {
    customersList.mockResolvedValue({
      items: [],
      managedExternally: false,
      source: "AVENLY",
    });
    const { container } = renderList();

    expect(
      await screen.findByRole("heading", { name: "Nenhum cliente ainda" }),
    ).toBeVisible();
    expect(screen.getByText(EMPTY_TEXT)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Adicionar cliente" }),
    ).toHaveAttribute("href", "/clientes/novo");
    expect(screen.queryByText("Cadastrar cliente")).not.toBeInTheDocument();
    expect(screen.queryByText("Seus clientes aparecerão aqui")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Novo cliente" }),
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  test("sem permissão para criar, o botão não existe", async () => {
    customersList.mockResolvedValue({
      items: [],
      managedExternally: true,
      source: "AVENLY",
    });
    renderList();

    expect(
      await screen.findByRole("heading", { name: "Nenhum cliente ainda" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Adicionar cliente" }),
    ).not.toBeInTheDocument();
  });

  test("a partir de 1024 px o vazio ocupa a largura toda, sem a coluna do perfil", async () => {
    setViewport(1280);
    customersList.mockResolvedValue({
      items: [],
      managedExternally: false,
      source: "AVENLY",
    });
    renderList();

    expect(
      await screen.findByRole("heading", { name: "Nenhum cliente ainda" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Selecione um cliente para ver o perfil"),
    ).not.toBeInTheDocument();
  });

  test("com clientes, o vazio não aparece e a coluna do perfil volta", async () => {
    setViewport(1280);
    const customer: Customer = {
      id: "c1",
      name: "Marina Costa",
      phone: "11999990000",
    };
    customersList.mockResolvedValue({
      items: [customer],
      managedExternally: false,
      source: "AVENLY",
    });
    renderList();

    expect(await screen.findByText("Marina Costa")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Nenhum cliente ainda" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Selecione um cliente para ver o perfil"),
    ).toBeVisible();
  });
});

describe("CL10 — Clientes · erro", () => {
  test("mostra o título e o texto do quadro, a referência numa linha própria e a ação", async () => {
    customersList.mockRejectedValue(unavailable());
    const { container } = renderList();

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("heading", {
        name: "Não foi possível carregar seus clientes",
      }),
    ).toBeVisible();
    expect(within(alert).getByText(ERROR_TEXT)).toBeVisible();
    const reference = within(alert).getByText("Referência: req-503-abc");
    expect(reference).toBeVisible();
    expect(reference.tagName).toBe("P");
    expect(reference).not.toBe(within(alert).getByText(ERROR_TEXT));
    expect(
      within(alert).getByRole("button", { name: "Tentar novamente" }),
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  test("falha sem resposta do BFF não inventa referência", async () => {
    customersList.mockRejectedValue(new Error("rede"));
    renderList();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(ERROR_TEXT)).toBeVisible();
    expect(within(alert).queryByText(/Referência/)).not.toBeInTheDocument();
  });

  test("'Tentar novamente' relê a lista uma vez e mostra os clientes", async () => {
    const user = userEvent.setup();
    customersList
      .mockRejectedValueOnce(unavailable())
      .mockResolvedValueOnce({
        items: [{ id: "c1", name: "Marina Costa", phone: "11999990000" }],
        managedExternally: false,
        source: "AVENLY",
      });
    renderList();

    await user.click(
      await screen.findByRole("button", { name: "Tentar novamente" }),
    );

    expect(await screen.findByText("Marina Costa")).toBeVisible();
    await waitFor(() => expect(customersList).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("se a releitura falha de novo, o erro volta e a lista foi pedida só mais uma vez", async () => {
    const user = userEvent.setup();
    customersList.mockRejectedValue(unavailable());
    renderList();

    await user.click(
      await screen.findByRole("button", { name: "Tentar novamente" }),
    );

    expect(await screen.findByRole("alert")).toBeVisible();
    await waitFor(() => expect(customersList).toHaveBeenCalledTimes(2));
  });

  test("a partir de 1024 px o erro ocupa a largura toda, sem a coluna do perfil", async () => {
    setViewport(1280);
    customersList.mockRejectedValue(unavailable());
    renderList();

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(
      screen.queryByText("Selecione um cliente para ver o perfil"),
    ).not.toBeInTheDocument();
  });
});
