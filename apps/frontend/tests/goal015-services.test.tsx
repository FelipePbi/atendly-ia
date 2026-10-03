// @vitest-environment jsdom
/**
 * Goal015 (WU-07): provas renderizadas do domínio de Serviços — as quatro
 * semânticas de preço (fixo, a partir de, sob consulta, não informado), a
 * pendência de revisão herdada de importação ou cadastro manual, e a recusa
 * de salvar um serviço `FIXED` sem valor informado.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Service } from "@/data";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

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

describe("as quatro semânticas de preço", () => {
  test("fixo, a partir de, sob consulta e não informado renderizam textos distintos", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [
        serviceFixture({ id: "s1", name: "Corte", price: 150, priceType: "FIXED" }),
        serviceFixture({
          id: "s2",
          name: "Coloração",
          price: 80,
          priceType: "STARTING_AT",
        }),
        serviceFixture({
          id: "s3",
          name: "Design de sobrancelha",
          price: null,
          priceType: "ON_REQUEST",
        }),
        serviceFixture({
          id: "s4",
          name: "Massagem",
          price: null,
          priceType: "NOT_INFORMED",
        }),
      ],
      source: "ATENDLY",
    });

    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="list" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("4 ativos")).toBeVisible();
    expect(screen.getByText("45 min · R$ 150")).toBeVisible();
    expect(screen.getByText("45 min · a partir de R$ 80")).toBeVisible();
    expect(screen.getByText("45 min · sob consulta")).toBeVisible();
    expect(screen.getByText("45 min · sem preço informado")).toBeVisible();
  });
});

describe("pendência de revisão", () => {
  test("mostra a origem da pendência: importação ou cadastro manual", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [
        serviceFixture({
          id: "s1",
          name: "Corte importado",
          needsReview: true,
          reviewOrigin: "IMPORT",
        }),
        serviceFixture({
          id: "s2",
          name: "Corte manual",
          needsReview: true,
          reviewOrigin: "MANUAL",
        }),
        serviceFixture({
          durationMinutes: null,
          id: "s3",
          name: "Corte sem duração",
          needsReview: true,
          reviewOrigin: "MANUAL",
        }),
      ],
      source: "ATENDLY",
    });

    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="list" />
      </ShellConfigProvider>,
    );

    expect(
      await screen.findByText("Precisa de revisão · importado"),
    ).toBeVisible();
    expect(
      screen.getByText("Precisa de revisão · cadastro manual"),
    ).toBeVisible();
    expect(
      screen.getByText("Precisa de revisão · sem duração"),
    ).toBeVisible();
  });
});

describe("recusa de salvar um serviço FIXED sem valor", () => {
  test("o formulário recusa o envio e não chama a criação", async () => {
    serviceCatalogList.mockResolvedValue({ editable: true, items: [], source: "ATENDLY" });
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="new" />
      </ShellConfigProvider>,
    );

    await user.type(await screen.findByLabelText("Nome"), "Corte");
    expect(screen.getByRole("radio", { name: "Fixo" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    expect(
      await screen.findByText(
        "Informe o valor ou escolha sob consulta / sem preço.",
      ),
    ).toBeVisible();
    expect(serviceCatalogCreate).not.toHaveBeenCalled();
  });
});

describe("acessibilidade das telas novas de Serviços", () => {
  test("lista de serviços com dados não acusa violação de axe", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [
        serviceFixture({ id: "s1" }),
        serviceFixture({
          id: "s2",
          name: "Massagem",
          needsReview: true,
          price: null,
          priceType: "ON_REQUEST",
          reviewOrigin: "IMPORT",
        }),
      ],
      source: "ATENDLY",
    });
    const { container } = render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="list" />
      </ShellConfigProvider>,
    );
    await screen.findByText("1 ativo · 1 precisa de revisão");
    await expectNoA11yViolations(container);
  });

  test("formulário de novo serviço não acusa violação de axe", async () => {
    serviceCatalogList.mockResolvedValue({ editable: true, items: [], source: "ATENDLY" });
    const { container } = render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="new" />
      </ShellConfigProvider>,
    );
    await screen.findByLabelText("Nome");
    await expectNoA11yViolations(container);
  });
});

describe("erro de carregamento da lista de serviços", () => {
  test("recarregar com sucesso tira a tela do painel de erro", async () => {
    serviceCatalogList
      .mockRejectedValueOnce(new Error("falha de rede"))
      .mockResolvedValueOnce({
        editable: true,
        items: [serviceFixture({ id: "s1", name: "Corte" })],
        source: "ATENDLY",
      });
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="list" />
      </ShellConfigProvider>,
    );

    expect(
      await screen.findByText("Não foi possível carregar serviços"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Carregar novamente" }));

    expect(await screen.findByText("Corte")).toBeVisible();
    expect(screen.queryByText("Não foi possível carregar serviços")).toBeNull();
  });
});
