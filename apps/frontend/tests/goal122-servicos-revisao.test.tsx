// @vitest-environment jsdom
/**
 * Goal122 (WU-02): S7 — editar um serviço que precisa de revisão abre o modo
 * de revisão (aviso âmbar, duração em foco, atalhos 20/30/45, botão
 * "Salvar e liberar para a IA" desabilitado até haver duração).
 */

import { render, screen, waitFor } from "@testing-library/react";
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
const serviceCatalogGetAiInstruction = vi.fn();
const serviceCatalogUpdateAiInstruction = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    serviceCatalog: {
      create: serviceCatalogCreate,
      getAiInstruction: serviceCatalogGetAiInstruction,
      list: serviceCatalogList,
      update: serviceCatalogUpdate,
      updateAiInstruction: serviceCatalogUpdateAiInstruction,
    },
  }),
}));

function reviewService(overrides: Partial<Service> = {}): Service {
  return {
    active: false,
    bufferAfterMinutes: 10,
    bufferBeforeMinutes: 5,
    colorToken: "ROSE",
    description: "Descrição que já existia",
    durationMinutes: null,
    id: "s7",
    name: "Design de sobrancelha",
    needsReview: true,
    price: 45,
    priceType: "FIXED",
    recurrenceIntervalDays: 21,
    reviewOrigin: "IMPORT",
    ...overrides,
  };
}

function renderEdit(service: Service) {
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [service],
    source: "AVENLY",
  });
  serviceCatalogUpdate.mockResolvedValue({
    ...service,
    durationMinutes: 30,
    needsReview: false,
  });
  return render(
    <ShellConfigProvider>
      <ProductServicesScreen scenario="edit" serviceId={service.id} />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  serviceCatalogList.mockReset();
  serviceCatalogCreate.mockReset();
  serviceCatalogUpdate.mockReset();
  serviceCatalogGetAiInstruction
    .mockReset()
    .mockResolvedValue({ content: "Instrução privada" });
  serviceCatalogUpdateAiInstruction.mockReset().mockResolvedValue(undefined);
});

describe("S7 — aviso e nota de importação", () => {
  test("IMPORT mostra o texto do Minha Agenda e a nota de preço importado", async () => {
    renderEdit(reviewService());

    expect(await screen.findByText("Falta a duração")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Este serviço veio do Minha Agenda sem esse dado. Sem duração, a IA não consegue oferecer horários para ele.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Veio preenchido da importação. Confira se continua certo.",
      ),
    ).toBeInTheDocument();
  });

  test("MANUAL mostra o texto de serviço salvo sem o dado e não mostra a nota", async () => {
    renderEdit(reviewService({ reviewOrigin: "MANUAL" }));

    expect(await screen.findByText("Falta a duração")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Este serviço foi salvo sem esse dado. Sem duração, a IA não consegue oferecer horários para ele.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Veio preenchido da importação/)).toBeNull();
  });

  test("origem ausente usa o texto de salvo sem o dado", async () => {
    renderEdit(reviewService({ reviewOrigin: null }));

    expect(
      await screen.findByText(
        "Este serviço foi salvo sem esse dado. Sem duração, a IA não consegue oferecer horários para ele.",
      ),
    ).toBeInTheDocument();
  });

  test("IMPORT sem preço não mostra a nota de importação", async () => {
    renderEdit(reviewService({ price: null, priceType: "NOT_INFORMED" }));

    expect(await screen.findByText("Falta a duração")).toBeInTheDocument();
    expect(screen.queryByText(/Veio preenchido da importação/)).toBeNull();
  });
});

describe("S7 — botão e duração", () => {
  test("botão desabilitado com duração vazia, ligado por atalho ou digitação", async () => {
    const user = userEvent.setup();
    renderEdit(reviewService());

    const button = await screen.findByRole("button", {
      name: "Salvar e liberar para a IA",
    });
    expect(button).toBeDisabled();
    const help = screen.getByText(
      "O botão ativa quando a duração for informada.",
    );
    expect(button).toHaveAttribute("aria-describedby", help.id);

    for (const minutes of ["20", "30", "45"]) {
      expect(screen.getByRole("button", { name: minutes })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "60" })).toBeNull();

    const helpText = "O botão ativa quando a duração for informada.";

    await user.click(screen.getByRole("button", { name: "30" }));
    expect(button).toBeEnabled();
    expect(screen.queryByText(helpText)).toBeNull();
    expect(button).not.toHaveAttribute("aria-describedby");

    const input = screen.getByLabelText<HTMLInputElement>("Duração (minutos)", {
      exact: false,
    });
    await user.clear(input);
    expect(button).toBeDisabled();
    const helpAgain = screen.getByText(helpText);
    expect(button).toHaveAttribute("aria-describedby", helpAgain.id);
    await user.type(input, "50");
    expect(button).toBeEnabled();
    expect(screen.queryByText(helpText)).toBeNull();
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  test("o campo de duração abre em foco", async () => {
    renderEdit(reviewService());

    await screen.findByText("Falta a duração");
    expect(
      screen.getByLabelText("Duração (minutos)", { exact: false }),
    ).toHaveFocus();
  });

  test("duração zero mantém o botão desabilitado", async () => {
    const user = userEvent.setup();
    renderEdit(reviewService());

    const button = await screen.findByRole("button", {
      name: "Salvar e liberar para a IA",
    });
    const input = screen.getByLabelText<HTMLInputElement>("Duração (minutos)", {
      exact: false,
    });
    await user.type(input, "0");
    expect(button).toBeDisabled();
  });

  test("campos fora da tela não aparecem no modo de revisão", async () => {
    renderEdit(reviewService());

    await screen.findByText("Falta a duração");
    expect(screen.getByText("Cor na agenda")).toBeInTheDocument();
    expect(screen.queryByText("Serviço ativo")).toBeNull();
    expect(screen.queryByText(/Instruções para a IA/)).toBeNull();
    expect(screen.queryByText(/Recorrência/)).toBeNull();
    expect(screen.queryByLabelText(/Descrição/)).toBeNull();
    expect(screen.queryByText("Intervalo antes e depois")).toBeNull();
  });
});

describe("S7 — salvar", () => {
  test("PATCH leva a duração e os valores que o serviço já tinha, sem tocar a instrução da IA", async () => {
    const user = userEvent.setup();
    renderEdit(reviewService());

    await screen.findByText("Falta a duração");
    await waitFor(() =>
      expect(serviceCatalogGetAiInstruction).toHaveBeenCalled(),
    );
    await user.click(screen.getByRole("button", { name: "30" }));
    await user.click(
      screen.getByRole("button", { name: "Salvar e liberar para a IA" }),
    );

    await waitFor(() => expect(serviceCatalogUpdate).toHaveBeenCalledTimes(1));
    expect(serviceCatalogUpdate).toHaveBeenCalledWith("s7", {
      active: false,
      bufferAfterMinutes: 10,
      bufferBeforeMinutes: 5,
      colorToken: "ROSE",
      description: "Descrição que já existia",
      durationMinutes: 30,
      name: "Design de sobrancelha",
      price: 45,
      priceType: "FIXED",
      recurrenceIntervalDays: 21,
    });
    expect(serviceCatalogUpdateAiInstruction).not.toHaveBeenCalled();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/servicos"));
  });
});

describe("S7 — fora do modo de revisão nada muda", () => {
  test("editar serviço sem revisão mantém 'Salvar alterações'", async () => {
    renderEdit(
      reviewService({
        durationMinutes: 45,
        needsReview: false,
        reviewOrigin: null,
      }),
    );

    expect(
      await screen.findByRole("button", { name: "Salvar alterações" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Falta a duração")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Salvar e liberar para a IA" }),
    ).toBeNull();
  });

  test("criar mantém 'Salvar serviço' e os atalhos 30/60/90", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [],
      source: "AVENLY",
    });
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="new" />
      </ShellConfigProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Salvar serviço" }),
    ).toBeInTheDocument();
    for (const minutes of ["30", "60", "90"]) {
      expect(screen.getByRole("button", { name: minutes })).toBeInTheDocument();
    }
    expect(screen.queryByText("Falta a duração")).toBeNull();
  });
});
