// @vitest-environment jsdom
/**
 * Goal078 (WU-04): campo "Instruções para a IA" no formulário de Serviços —
 * leitura na edição, gravação só quando o texto muda, os dois modos de falha
 * e a remoção de DirectorySourceStrip.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type Service } from "@/data";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import * as ServiceListModule from "@/features/services/ServiceList";
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

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    colorToken: "SKY",
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
  serviceCatalogGetAiInstruction.mockReset();
  serviceCatalogUpdateAiInstruction.mockReset();
});

async function renderEditForm() {
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [serviceFixture()],
    source: "AVENLY",
  });
  render(
    <ShellConfigProvider>
      <ProductServicesScreen scenario="edit" serviceId="s1" />
    </ShellConfigProvider>,
  );
  await screen.findByLabelText("Nome");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /^Instruções para a IA/ }));
  return screen.findByLabelText<HTMLTextAreaElement>("Instruções para a IA");
}

async function renderNewForm() {
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
  await screen.findByLabelText("Nome");
  const user = userEvent.setup();
  // Cor obrigatória na criação manual (decisão de 2026-10-12).
  await user.click(screen.getByRole("button", { name: /^Cor na agenda/ }));
  await user.click(screen.getByRole("radio", { name: "Ameixa" }));
  await user.click(screen.getByRole("button", { name: /^Instruções para a IA/ }));
  return screen.getByLabelText<HTMLTextAreaElement>("Instruções para a IA");
}

describe("§6.12 edição: leitura, mudança e apagar", () => {
  test("mostra o texto lido; mudar e salvar chama PATCH e depois PUT com o texto novo", async () => {
    const user = userEvent.setup();
    serviceCatalogGetAiInstruction.mockResolvedValue({
      content: "Não atendo aos domingos.",
    });
    serviceCatalogUpdate.mockResolvedValue(serviceFixture());
    serviceCatalogUpdateAiInstruction.mockResolvedValue({
      content: "Nova instrução.",
    });

    const textarea = await renderEditForm();
    await waitFor(() =>
      expect(textarea.value).toBe("Não atendo aos domingos."),
    );

    await user.clear(textarea);
    await user.type(textarea, "Nova instrução.");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(serviceCatalogUpdateAiInstruction).toHaveBeenCalledWith(
        "s1",
        "Nova instrução.",
      ),
    );
    expect(serviceCatalogUpdate).toHaveBeenCalledTimes(1);
    expect(
      serviceCatalogUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(
      serviceCatalogUpdateAiInstruction.mock.invocationCallOrder[0],
    );
    expect(replace).toHaveBeenCalledWith("/servicos");
  });

  test("apagar o texto e salvar manda string vazia", async () => {
    const user = userEvent.setup();
    serviceCatalogGetAiInstruction.mockResolvedValue({
      content: "Não atendo aos domingos.",
    });
    serviceCatalogUpdate.mockResolvedValue(serviceFixture());
    serviceCatalogUpdateAiInstruction.mockResolvedValue({ content: "" });

    const textarea = await renderEditForm();
    await waitFor(() =>
      expect(textarea.value).toBe("Não atendo aos domingos."),
    );

    await user.clear(textarea);
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(serviceCatalogUpdateAiInstruction).toHaveBeenCalledWith("s1", ""),
    );
  });
});

describe("§6.13 salvar sem mudar o texto", () => {
  test("chama só o PATCH, sem PUT — o caminho de saveDurationByForm continua igual", async () => {
    const user = userEvent.setup();
    serviceCatalogGetAiInstruction.mockResolvedValue({
      content: "Não atendo aos domingos.",
    });
    serviceCatalogUpdate.mockResolvedValue(serviceFixture());

    const textarea = await renderEditForm();
    await waitFor(() =>
      expect(textarea.value).toBe("Não atendo aos domingos."),
    );

    const duration = screen.getByLabelText<HTMLInputElement>(
      "Duração (minutos)",
      { exact: false },
    );
    await user.clear(duration);
    await user.type(duration, "50");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(serviceCatalogUpdate).toHaveBeenCalledTimes(1));
    expect(serviceCatalogUpdateAiInstruction).not.toHaveBeenCalled();
  });
});

describe("§6.14 serviço novo", () => {
  test("com texto, o POST vem antes e o PUT usa o id devolvido", async () => {
    const user = userEvent.setup();
    serviceCatalogCreate.mockResolvedValue(serviceFixture({ id: "new-id" }));
    serviceCatalogUpdateAiInstruction.mockResolvedValue({
      content: "Regra nova.",
    });

    const textarea = await renderNewForm();
    await user.type(screen.getByLabelText("Nome"), "Manicure");
    const duration = screen.getByLabelText<HTMLInputElement>(
      "Duração (minutos)",
      { exact: false },
    );
    await user.type(duration, "40");
    await user.type(
      await screen.findByPlaceholderText("R$ 0,00"),
      "55",
    );
    await user.type(textarea, "Regra nova.");
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    await waitFor(() =>
      expect(serviceCatalogUpdateAiInstruction).toHaveBeenCalledWith(
        "new-id",
        "Regra nova.",
      ),
    );
    expect(
      serviceCatalogCreate.mock.invocationCallOrder[0],
    ).toBeLessThan(
      serviceCatalogUpdateAiInstruction.mock.invocationCallOrder[0],
    );
  });

  test("sem texto, não há PUT", async () => {
    const user = userEvent.setup();
    serviceCatalogCreate.mockResolvedValue(serviceFixture({ id: "new-id" }));

    await renderNewForm();
    await user.type(screen.getByLabelText("Nome"), "Manicure");
    const duration = screen.getByLabelText<HTMLInputElement>(
      "Duração (minutos)",
      { exact: false },
    );
    await user.type(duration, "40");
    await user.type(
      await screen.findByPlaceholderText("R$ 0,00"),
      "55",
    );
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    await waitFor(() => expect(serviceCatalogCreate).toHaveBeenCalledTimes(1));
    expect(serviceCatalogUpdateAiInstruction).not.toHaveBeenCalled();
  });
});

describe("§6.15 os dois modos de falha", () => {
  test("leitura falhando: o campo fica desabilitado e o serviço ainda salva, sem PUT", async () => {
    const user = userEvent.setup();
    serviceCatalogGetAiInstruction.mockRejectedValue(new Error("boom"));
    serviceCatalogUpdate.mockResolvedValue(serviceFixture());

    const textarea = await renderEditForm();
    await waitFor(() => expect(textarea).toBeDisabled());
    expect(
      screen.getByText(
        "Não foi possível carregar as instruções para a IA agora. Você ainda pode salvar o serviço.",
      ),
    ).toBeVisible();

    const duration = screen.getByLabelText<HTMLInputElement>(
      "Duração (minutos)",
      { exact: false },
    );
    await user.clear(duration);
    await user.type(duration, "50");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(serviceCatalogUpdate).toHaveBeenCalledTimes(1));
    expect(serviceCatalogUpdateAiInstruction).not.toHaveBeenCalled();
  });

  test("PUT falhando: aparece erro, o serviço não é desfeito e o texto digitado continua no campo", async () => {
    const user = userEvent.setup();
    serviceCatalogGetAiInstruction.mockResolvedValue({
      content: "Não atendo aos domingos.",
    });
    serviceCatalogUpdate.mockResolvedValue(serviceFixture());
    serviceCatalogUpdateAiInstruction.mockRejectedValue(
      new BffHttpError({
        code: "HTTP_ERROR",
        message: "falhou",
        requestId: "req-1",
        status: 500,
      }),
    );

    const textarea = await renderEditForm();
    await waitFor(() =>
      expect(textarea.value).toBe("Não atendo aos domingos."),
    );

    await user.clear(textarea);
    await user.type(textarea, "Nova instrução.");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(
      await screen.findByText(
        "Serviço salvo, mas não foi possível salvar as instruções para a IA. Referência: req-1",
      ),
    ).toBeVisible();
    expect(serviceCatalogUpdate).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    expect(textarea.value).toBe("Nova instrução.");
  });
});

describe("correção rodada 2, blocker 1: PUT falhando no serviço novo não repete o POST no reenvio", () => {
  test("POST roda uma vez; reenvio depois do PUT falhar chama PATCH com o id criado, não outro POST", async () => {
    const user = userEvent.setup();
    serviceCatalogCreate.mockResolvedValue(serviceFixture({ id: "new-id" }));
    serviceCatalogUpdate.mockResolvedValue(serviceFixture({ id: "new-id" }));
    serviceCatalogUpdateAiInstruction
      .mockRejectedValueOnce(
        new BffHttpError({
          code: "HTTP_ERROR",
          message: "falhou",
          requestId: "req-2",
          status: 500,
        }),
      )
      .mockResolvedValueOnce({ content: "Regra nova." });

    const textarea = await renderNewForm();
    await user.type(screen.getByLabelText("Nome"), "Manicure");
    const duration = screen.getByLabelText<HTMLInputElement>(
      "Duração (minutos)",
      { exact: false },
    );
    await user.type(duration, "40");
    await user.type(await screen.findByPlaceholderText("R$ 0,00"), "55");
    await user.type(textarea, "Regra nova.");
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    expect(
      await screen.findByText(
        "Serviço salvo, mas não foi possível salvar as instruções para a IA. Referência: req-2",
      ),
    ).toBeVisible();
    expect(serviceCatalogCreate).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    await waitFor(() =>
      expect(serviceCatalogUpdateAiInstruction).toHaveBeenCalledTimes(2),
    );
    expect(serviceCatalogCreate).toHaveBeenCalledTimes(1);
    expect(serviceCatalogUpdate).toHaveBeenCalledWith(
      "new-id",
      expect.objectContaining({ name: "Manicure" }),
    );
    expect(serviceCatalogUpdateAiInstruction).toHaveBeenLastCalledWith(
      "new-id",
      "Regra nova.",
    );
    expect(replace).toHaveBeenCalledWith("/servicos");
  });
});

describe("§6.16 DirectorySourceStrip", () => {
  test("não existe mais em apps/frontend/src", () => {
    expect(
      (ServiceListModule as Record<string, unknown>).DirectorySourceStrip,
    ).toBeUndefined();
  });
});
