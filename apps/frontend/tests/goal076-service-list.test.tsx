// @vitest-environment jsdom
/**
 * Goal076 (WU-01): fidelidade visual da lista de Serviços — grupos (Precisa
 * de revisão, Ativos, Inativos), a linha "duração · preço", o filete na cor
 * de `colorToken`, "Corrigir" nas pendências, ativar/desativar e a ausência
 * da copy técnica ("Gerenciado pela", "Controle completo", origem "Agenda
 * Atendly" por linha).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Service } from "@/data";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const serviceCatalogList = vi.fn();
const serviceCatalogCreate = vi.fn();
const serviceCatalogUpdate = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    serviceCatalog: {
      create: serviceCatalogCreate,
      list: serviceCatalogList,
      update: serviceCatalogUpdate,
    },
  }),
}));

function serviceFixture(overrides: Partial<Service> = {}): Service {
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
    ...overrides,
  };
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  serviceCatalogList.mockReset();
  serviceCatalogCreate.mockReset();
  serviceCatalogUpdate.mockReset();
});

async function renderList(items: Service[], editable = true) {
  serviceCatalogList.mockResolvedValue({ editable, items, source: "ATENDLY" });
  render(
    <ShellConfigProvider>
      <ProductServicesScreen scenario="list" />
    </ShellConfigProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Serviços" });
}

describe("§4.1 a linha mostra duração · preço, com recorrência e sem oferta", () => {
  test("as cinco combinações renderizam o texto exato", async () => {
    await renderList([
      serviceFixture({
        durationMinutes: 45,
        id: "s1",
        name: "Corte",
        price: 90,
        priceType: "FIXED",
      }),
      serviceFixture({
        durationMinutes: 40,
        id: "s2",
        name: "Escova",
        price: 60,
        priceType: "STARTING_AT",
      }),
      serviceFixture({
        durationMinutes: 30,
        id: "s3",
        name: "Hidratação",
        price: null,
        priceType: "NOT_INFORMED",
      }),
      serviceFixture({
        durationMinutes: 90,
        id: "s4",
        name: "Coloração",
        price: null,
        priceType: "ON_REQUEST",
        recurrenceIntervalDays: 35,
      }),
      serviceFixture({
        active: false,
        durationMinutes: 120,
        id: "s5",
        name: "Massagem",
        price: 250,
        priceType: "FIXED",
      }),
    ]);

    expect(screen.getByText("45 min · R$ 90")).toBeVisible();
    expect(screen.getByText("40 min · a partir de R$ 60")).toBeVisible();
    expect(screen.getByText("30 min · sem preço informado")).toBeVisible();
    expect(
      screen.getByText("1 h 30 · sob consulta · a cada 5 semanas"),
    ).toBeVisible();
    expect(
      screen.getByText("2 h · R$ 250 · a IA não oferece"),
    ).toBeVisible();
    expect(screen.queryByText("Agenda Atendly")).toBeNull();
  });
});

describe("§4.2 grupos, resumo e busca", () => {
  test("pendente em Precisa de revisão com Corrigir; inativo em Inativos; ativos em ordem pt-BR; resumo certo", async () => {
    await renderList([
      serviceFixture({ active: true, id: "s1", name: "Ábaco" }),
      serviceFixture({ active: true, id: "s2", name: "Zíper" }),
      serviceFixture({
        active: true,
        id: "s3",
        name: "Pendente",
        needsReview: true,
        reviewOrigin: "MANUAL",
      }),
      serviceFixture({ active: false, id: "s4", name: "Antiga" }),
    ]);

    const reviewGroup = screen.getByText("Precisa de revisão").closest("div");
    expect(reviewGroup).not.toBeNull();
    expect(
      within(reviewGroup as HTMLElement).getByRole("link", {
        name: "Corrigir Pendente",
      }),
    ).toHaveAttribute("href", "/servicos/editar?id=s3");

    const inactiveGroup = screen.getByText("Inativos").closest("div");
    expect(inactiveGroup).not.toBeNull();
    expect(
      within(inactiveGroup as HTMLElement).getByText("Antiga"),
    ).toBeVisible();

    const activeGroup = screen.getByText("Ativos").closest("div");
    expect(activeGroup).not.toBeNull();
    const activeNames = within(activeGroup as HTMLElement)
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label"));
    expect(activeNames).toEqual(["Editar Ábaco", "Editar Zíper"]);

    expect(
      screen.getByText("2 ativos · 1 precisa de revisão · 1 inativo"),
    ).toBeVisible();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Buscar serviço"), "Zíper");
    expect(screen.queryByText("Precisa de revisão")).toBeNull();
    expect(screen.queryByText("Inativos")).toBeNull();
    expect(screen.getByText("Ativos")).toBeVisible();
  });
});

describe("§4.3 nome acessível, filete e somente leitura", () => {
  test("a linha é link Editar <nome>; o filete usa colorToken; sem editable some link, Corrigir e ativar/desativar", async () => {
    await renderList([
      serviceFixture({ colorToken: "ROSE", id: "s1", name: "Corte" }),
      serviceFixture({ colorToken: null, id: "s2", name: "Escova" }),
    ]);

    const link = screen.getByRole("link", { name: "Editar Corte" });
    expect(link).toHaveAttribute("href", "/servicos/editar?id=s1");

    const coloredRow = link.closest("li");
    expect(coloredRow).not.toBeNull();
    const coloredAccent = (coloredRow as HTMLElement).querySelector(
      ".service-row-accent",
    );
    expect(coloredAccent).toHaveAttribute("data-color", "ROSE");

    const neutralLink = screen.getByRole("link", { name: "Editar Escova" });
    const neutralRow = neutralLink.closest("li");
    const neutralAccent = (neutralRow as HTMLElement).querySelector(
      ".service-row-accent",
    );
    expect(neutralAccent).not.toHaveAttribute("data-color");
  });

  test("sem editable, a lista não tem link de edição, Corrigir nem ativar/desativar", async () => {
    await renderList(
      [
        serviceFixture({ id: "s1", name: "Corte" }),
        serviceFixture({
          id: "s2",
          name: "Pendente",
          needsReview: true,
          reviewOrigin: "IMPORT",
        }),
      ],
      false,
    );

    expect(screen.queryByRole("link", { name: "Editar Corte" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Corrigir Pendente" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Desativar" }),
    ).toBeNull();
    expect(screen.getAllByText("Somente leitura").length).toBeGreaterThan(0);
  });
});

describe("§4.4 ativar e desativar", () => {
  test("abrem a confirmação e chamam o PATCH com active trocado", async () => {
    const user = userEvent.setup();
    const service = serviceFixture({ active: true, id: "s1", name: "Corte" });
    serviceCatalogUpdate.mockResolvedValue({ ...service, active: false });
    await renderList([service]);

    await user.click(screen.getByRole("button", { name: "Desativar" }));
    expect(
      await screen.findByText("Desativar serviço?"),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Desativar serviço" }),
    );

    expect(serviceCatalogUpdate).toHaveBeenCalledWith(
      "s1",
      { active: false },
    );
  });
});

describe("§4.7 (lista) sem copy técnica", () => {
  test("'Gerenciado pela', 'Controle completo' e a origem 'Agenda Atendly' não aparecem em /servicos", async () => {
    await renderList([serviceFixture()]);

    expect(screen.queryByText(/Gerenciado pela/)).toBeNull();
    expect(screen.queryByText(/Controle completo/)).toBeNull();
    expect(screen.queryByText("Agenda Atendly")).toBeNull();
    expect(
      screen.queryByText(/podem ser criados, editados e desativados aqui/),
    ).toBeNull();
  });
});
