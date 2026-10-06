// @vitest-environment jsdom
/**
 * Goal122 (WU-01): o vazio (S2) da lista de Serviços — título e texto do
 * quadro, "Criar primeiro serviço" só quando a agenda aceita edição, e o
 * esboço decorativo fora da árvore acessível.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError } from "@/data";
import { ServiceList } from "@/features/services/ServiceList";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const serviceCatalogList = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    serviceCatalog: { list: serviceCatalogList },
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
      <ServiceList />
    </ShellConfigProvider>,
  );
}

const EMPTY_TEXT =
  "Nome, duração e preço bastam. É com isso que a IA responde perguntas e encontra horários para seus clientes.";

beforeEach(() => {
  serviceCatalogList.mockReset();
  setViewport(390);
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

describe("S2 — Serviços · vazio", () => {
  test("mostra o título, o texto do quadro e 'Criar primeiro serviço' para /servicos/novo", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [],
      source: "AVENLY",
    });
    const { container } = renderList();

    expect(
      await screen.findByRole("heading", { name: "Nenhum serviço cadastrado" }),
    ).toBeVisible();
    expect(screen.getByText(EMPTY_TEXT)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Criar primeiro serviço" }),
    ).toHaveAttribute("href", "/servicos/novo");
    expect(screen.queryByText("Cadastre seu primeiro serviço")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Novo serviço" }),
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  test("sem permissão de edição, o botão não existe", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: false,
      items: [],
      source: "AVENLY",
    });
    renderList();

    expect(
      await screen.findByRole("heading", { name: "Nenhum serviço cadastrado" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Criar primeiro serviço" }),
    ).not.toBeInTheDocument();
  });

  test("o esboço é decorativo: aria-hidden e sem link", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [],
      source: "AVENLY",
    });
    const { container } = renderList();
    await screen.findByRole("heading", { name: "Nenhum serviço cadastrado" });

    const sketch = container.querySelector(".service-state-sketch");
    expect(sketch).not.toBeNull();
    expect(sketch).toHaveAttribute("aria-hidden", "true");
    expect(sketch?.querySelectorAll("a, button")).toHaveLength(0);
    expect(sketch?.textContent).toBe("");
  });

  test("a partir de 1024 px o vazio ocupa a largura toda, sem a coluna 'Selecione um serviço'", async () => {
    setViewport(1280);
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [],
      source: "AVENLY",
    });
    renderList();

    expect(
      await screen.findByRole("heading", { name: "Nenhum serviço cadastrado" }),
    ).toBeVisible();
    expect(screen.queryByText("Selecione um serviço")).not.toBeInTheDocument();
  });

  test("com serviços, o vazio não aparece e a coluna do detalhe volta", async () => {
    setViewport(1280);
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [
        {
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
        },
      ],
      source: "AVENLY",
    });
    renderList();

    expect(await screen.findByText("Corte")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Nenhum serviço cadastrado" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Selecione um serviço")).toBeVisible();
  });

  test("o erro da lista continua o DirectoryState de antes", async () => {
    serviceCatalogList.mockRejectedValue(
      new BffHttpError({
        code: "SERVICE_UNAVAILABLE",
        message: "Serviço indisponível",
        requestId: "req-503-abc",
        status: 503,
      }),
    );
    renderList();

    expect(
      await screen.findByRole("heading", {
        name: "Não foi possível carregar serviços",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Carregar novamente" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: "Nenhum serviço cadastrado" }),
    ).not.toBeInTheDocument();
  });
});
