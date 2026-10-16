// @vitest-environment jsdom
/**
 * A lista de Serviços mora no layout de `/servicos` (ServicesWorkspace), como
 * a de Clientes: abrir um serviço, trocar de serviço e voltar não remontam
 * nem buscam a lista de novo; ela só atualiza quando o catálogo muda. Só os
 * itens rolam: título, resumo, "+" e busca ficam fora da área que rola.
 *
 * Com a lista ao lado, o editor não mostra esqueleto: na primeira carga fica
 * vazio até o serviço chegar e entra com a animação curta; na troca, o
 * anterior fica (`aria-busy`) até o novo chegar, e a troca é o crossfade da
 * View Transition `service-swap`.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { notifyServicesChanged, type Service } from "@/data";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import { ServicesWorkspace } from "@/features/services/ServicesWorkspace";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const serviceCatalogList = vi.fn();
const serviceCatalogGetAiInstruction = vi.fn();
const navigation = { pathname: "/servicos", search: "" };

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    serviceCatalog: {
      getAiInstruction: serviceCatalogGetAiInstruction,
      list: serviceCatalogList,
    },
  }),
}));

function service(id: string, name: string): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    colorToken: "SKY",
    description: null,
    durationMinutes: 45,
    id,
    name,
    needsReview: false,
    price: 90,
    priceType: "FIXED",
    recurrenceIntervalDays: null,
    reviewOrigin: null,
  };
}

const SERVICES = [
  service("s1", "Corte feminino"),
  service("s2", "Escova"),
  service("s3", "Hidratação"),
];

function catalog(items: Service[]) {
  return {
    editable: true,
    items,
    managedExternally: false,
    source: "AVENLY" as const,
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

/**
 * O que o App Router monta em cada rota: o layout persiste, a página troca.
 * Trocar só o `?id=` do editor mantém a mesma página montada.
 */
function route(pathname: string, search = "") {
  navigation.pathname = pathname;
  navigation.search = search;
  const id = new URLSearchParams(search).get("id") ?? undefined;
  return (
    <ShellConfigProvider>
      <ServicesWorkspace>
        {pathname === "/servicos/editar" ? (
          <ProductServicesScreen key="edit" scenario="edit" serviceId={id} />
        ) : (
          <ProductServicesScreen key="list" />
        )}
      </ServicesWorkspace>
    </ShellConfigProvider>
  );
}

function listAside() {
  return screen.getByRole("complementary", { name: "Serviços" });
}

function editor() {
  return document.querySelector("section.service-form-screen");
}

/** Instrução da IA que só responde quando o teste manda. */
function deferredInstruction() {
  let resolve: (value: { content: string }) => void = () => undefined;
  serviceCatalogGetAiInstruction.mockImplementationOnce(
    () =>
      new Promise<{ content: string }>((done) => {
        resolve = done;
      }),
  );
  return () => act(async () => resolve({ content: "" }));
}

/** View Transition fake: aplica a atualização na hora e anota o tipo. */
function stubViewTransition() {
  const types: string[][] = [];
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (update: () => void) => {
      types.push(
        [...document.documentElement.classList].filter((name) =>
          name.startsWith("vt-"),
        ),
      );
      update();
      return { finished: Promise.resolve() };
    },
  });
  return types;
}

beforeEach(() => {
  serviceCatalogList.mockReset();
  serviceCatalogList.mockImplementation(async () => catalog(SERVICES));
  serviceCatalogGetAiInstruction.mockReset();
  serviceCatalogGetAiInstruction.mockResolvedValue({ content: "" });
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(document, "startViewTransition");
});

describe("Serviços — lista persistente entre lista e editor", () => {
  test("no desktop, abrir e trocar de serviço não busca nem remonta a lista", async () => {
    setViewport(1440);
    const view = render(route("/servicos"));
    await screen.findByRole("link", { name: "Editar Escova" });
    const aside = listAside();
    expect(serviceCatalogList).toHaveBeenCalledTimes(1);

    view.rerender(route("/servicos/editar", "?id=s2"));
    expect(await screen.findByDisplayValue("Escova")).toBeVisible();
    expect(listAside()).toBe(aside);
    expect(
      within(aside).getByRole("link", { name: "Editar Escova" }),
    ).toHaveAttribute("aria-current", "page");

    view.rerender(route("/servicos/editar", "?id=s3"));
    expect(await screen.findByDisplayValue("Hidratação")).toBeVisible();
    expect(listAside()).toBe(aside);
    expect(
      within(aside).getByRole("link", { name: "Editar Hidratação" }),
    ).toHaveAttribute("aria-current", "page");
    expect(serviceCatalogList).toHaveBeenCalledTimes(1);
  });

  test("no celular, voltar do editor encontra a lista e a busca como ficaram, sem buscar de novo", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const view = render(route("/servicos"));
    await screen.findByRole("link", { name: "Editar Escova" });
    await user.type(screen.getByRole("searchbox"), "Esc");
    expect(
      screen.queryByRole("link", { name: "Editar Hidratação" }),
    ).not.toBeInTheDocument();

    view.rerender(route("/servicos/editar", "?id=s2"));
    expect(await screen.findByDisplayValue("Escova")).toBeVisible();
    // Lista e editor são telas separadas no celular.
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();

    view.rerender(route("/servicos"));
    expect(screen.getByRole("searchbox")).toHaveValue("Esc");
    expect(screen.getByRole("link", { name: "Editar Escova" })).toBeVisible();
    expect(serviceCatalogList).toHaveBeenCalledTimes(1);
  });

  test("catálogo que muda atualiza a lista sem esqueleto e sem remontar", async () => {
    setViewport(1440);
    render(route("/servicos/editar", "?id=s1"));
    await screen.findByDisplayValue("Corte feminino");
    const aside = listAside();
    serviceCatalogList.mockImplementation(async () =>
      catalog([...SERVICES, service("s4", "Manicure")]),
    );

    act(() => notifyServicesChanged());

    expect(
      await within(aside).findByRole("link", { name: "Editar Manicure" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Carregando dados")).toBeNull();
    expect(listAside()).toBe(aside);
    // O que a pessoa digitava no serviço aberto não é apagado.
    expect(screen.getByDisplayValue("Corte feminino")).toBeVisible();
  });

  test("só os itens rolam: título, resumo, '+' e busca ficam fora da área que rola", async () => {
    setViewport(1440);
    render(route("/servicos"));
    const row = await screen.findByRole("link", { name: "Editar Escova" });

    const scroller = listAside().querySelector(".service-panel-scroll");
    expect(scroller).not.toBeNull();
    expect(scroller).toContainElement(row);
    expect(scroller).not.toContainElement(screen.getByRole("searchbox"));
    expect(scroller).not.toContainElement(
      screen.getByRole("heading", { name: "Serviços" }),
    );
    expect(scroller).not.toContainElement(
      screen.getByRole("link", { name: "Novo serviço" }),
    );
    expect(scroller).not.toContainElement(screen.getByText("3 ativos"));
  });

  test("no celular, a lista em tela cheia também rola só os itens", async () => {
    setViewport(390);
    render(route("/servicos"));
    const row = await screen.findByRole("link", { name: "Editar Escova" });

    // Sem a coluna ao lado: a lista é a própria tela e o "+" é o da casca.
    expect(
      screen.queryByRole("complementary", { name: "Serviços" }),
    ).not.toBeInTheDocument();
    const scroller = document.querySelector(
      ".service-list-screen .service-panel-scroll",
    );
    expect(scroller).not.toBeNull();
    expect(scroller).toContainElement(row);
    expect(scroller).not.toContainElement(screen.getByRole("searchbox"));
    expect(scroller).not.toContainElement(
      screen.getByRole("heading", { name: "Serviços" }),
    );
    expect(scroller).not.toContainElement(screen.getByText("3 ativos"));
  });
});

describe("Serviços — editor ao lado da lista", () => {
  test("carregando, o editor não mostra esqueleto; o serviço entra com a animação", async () => {
    setViewport(1440);
    const arrive = deferredInstruction();
    render(route("/servicos/editar", "?id=s1"));

    await screen.findByRole("link", { name: "Editar Escova" });
    expect(document.querySelector(".directory-loading-shell")).toBeNull();
    expect(screen.queryByDisplayValue("Corte feminino")).toBeNull();

    await arrive();
    expect(await screen.findByDisplayValue("Corte feminino")).toBeVisible();
    expect(editor()).toHaveClass("is-entering");
  });

  test("trocar de serviço faz crossfade `service-swap`, sem esqueleto e sem rebuscar a lista", async () => {
    setViewport(1440);
    const transitions = stubViewTransition();
    const view = render(route("/servicos/editar", "?id=s1"));
    const firstName = await screen.findByDisplayValue("Corte feminino");
    const aside = listAside();
    // A primeira carga não usa a transição: não há conteúdo anterior.
    expect(transitions).toEqual([]);

    const arrive = deferredInstruction();
    view.rerender(route("/servicos/editar", "?id=s2"));

    // Enquanto o novo não chega: o anterior fica, sem esqueleto.
    expect(firstName).toBeInTheDocument();
    expect(editor()).toHaveClass("is-refreshing");
    expect(editor()).not.toHaveClass("is-entering");
    expect(editor()).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector(".directory-loading-shell")).toBeNull();

    await arrive();
    expect(await screen.findByDisplayValue("Escova")).toBeVisible();
    expect(firstName).not.toBeInTheDocument();
    expect(transitions).toEqual([["vt-service-swap"]]);
    // A nova não roda a entrada de opacidade zero: era isso que piscava.
    expect(editor()).not.toHaveClass("is-entering");
    expect(editor()).not.toHaveClass("is-refreshing");
    expect(editor()).not.toHaveAttribute("aria-busy");
    expect(listAside()).toBe(aside);
    expect(serviceCatalogList).toHaveBeenCalledTimes(1);
  });

  test("no celular, o editor empurrado mantém o esqueleto enquanto carrega", async () => {
    setViewport(390);
    const arrive = deferredInstruction();
    render(route("/servicos/editar", "?id=s1"));
    await waitFor(() =>
      expect(document.querySelector(".directory-loading-shell")).not.toBeNull(),
    );
    await arrive();
    expect(await screen.findByDisplayValue("Corte feminino")).toBeVisible();
  });
});
