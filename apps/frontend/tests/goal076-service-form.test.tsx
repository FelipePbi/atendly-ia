// @vitest-environment jsdom
/**
 * Goal076 (WU-02): fidelidade visual do formulário de Serviços — duração com
 * − e +, atalhos 30/60/90, a frase "A IA responde" por tipo de preço e a
 * ausência da copy técnica em /servicos/novo e /servicos/editar.
 */

import { fireEvent, render, screen } from "@testing-library/react";
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
const serviceCatalogGetAiInstruction = vi
  .fn()
  .mockResolvedValue({ content: "" });

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    serviceCatalog: {
      create: serviceCatalogCreate,
      getAiInstruction: serviceCatalogGetAiInstruction,
      list: serviceCatalogList,
      update: serviceCatalogUpdate,
    },
  }),
}));

const priceTypeLabel: Record<Service["priceType"], string> = {
  FIXED: "Fixo",
  NOT_INFORMED: "Sem preço",
  ON_REQUEST: "Sob consulta",
  STARTING_AT: "A partir de",
};

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
  serviceCatalogGetAiInstruction.mockReset().mockResolvedValue({ content: "" });
});

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
  return screen.findByLabelText<HTMLInputElement>("Nome");
}

function getDurationInput() {
  return screen.getByLabelText<HTMLInputElement>("Duração (minutos)", {
    exact: false,
  });
}

async function typePrice(
  user: ReturnType<typeof userEvent.setup>,
  digits: string,
) {
  const price = await screen.findByPlaceholderText<HTMLInputElement>(
    "R$ 0,00",
  );
  for (const digit of digits) {
    await user.type(price, digit);
  }
  return price;
}

describe("§4.5 duração com − e +, e atalhos", () => {
  test("+ leva de vazio a 5 e de 40 a 45; − leva de 45 a 40, não desce abaixo de 5 e não faz nada com o campo vazio", async () => {
    const user = userEvent.setup();
    await renderNewForm();

    const duration = getDurationInput();
    const plus = screen.getByRole("button", { name: "Aumentar duração" });
    const minus = screen.getByRole("button", { name: "Diminuir duração" });

    expect(duration.value).toBe("");
    await user.click(plus);
    expect(duration.value).toBe("5");

    await user.click(minus);
    expect(duration.value).toBe("5");

    fireEvent.change(duration, { target: { value: "40" } });
    await user.click(plus);
    expect(duration.value).toBe("45");

    await user.click(minus);
    expect(duration.value).toBe("40");

    fireEvent.change(duration, { target: { value: "" } });
    await user.click(minus);
    expect(duration.value).toBe("");
  });

  test("30, 60 e 90 põem o valor exato e ficam aria-pressed quando iguais ao valor", async () => {
    const user = userEvent.setup();
    await renderNewForm();

    const duration = getDurationInput();
    const shortcut30 = screen.getByRole("button", { name: "30" });
    const shortcut60 = screen.getByRole("button", { name: "60" });
    const shortcut90 = screen.getByRole("button", { name: "90" });

    expect(shortcut30).toHaveAttribute("aria-pressed", "false");
    expect(shortcut60).toHaveAttribute("aria-pressed", "false");
    expect(shortcut90).toHaveAttribute("aria-pressed", "false");

    await user.click(shortcut60);
    expect(duration.value).toBe("60");
    expect(shortcut60).toHaveAttribute("aria-pressed", "true");
    expect(shortcut30).toHaveAttribute("aria-pressed", "false");
    expect(shortcut90).toHaveAttribute("aria-pressed", "false");

    await user.click(shortcut90);
    expect(duration.value).toBe("90");
    expect(shortcut90).toHaveAttribute("aria-pressed", "true");
    expect(shortcut60).toHaveAttribute("aria-pressed", "false");
  });

  test("41 digitado continua válido", async () => {
    await renderNewForm();
    const duration = getDurationInput();

    fireEvent.change(duration, { target: { value: "41" } });
    expect(duration.checkValidity()).toBe(true);
  });
});

describe("§4.6 a frase 'A IA responde' por tipo de preço", () => {
  test("FIXED: 'Manicure custa R$ 55 e leva 40 min.'", async () => {
    const user = userEvent.setup();
    const name = await renderNewForm();

    await user.type(name, "Manicure");
    fireEvent.change(getDurationInput(), { target: { value: "40" } });
    await typePrice(user, "55");

    expect(
      screen.getByText("A IA responde: “Manicure custa R$ 55 e leva 40 min.”"),
    ).toBeVisible();
  });

  test("STARTING_AT: 'Escova custa a partir de R$ 60 e leva 40 min.'", async () => {
    const user = userEvent.setup();
    const name = await renderNewForm();

    await user.type(name, "Escova");
    fireEvent.change(getDurationInput(), { target: { value: "40" } });
    await user.click(screen.getByLabelText(priceTypeLabel.STARTING_AT));
    await typePrice(user, "60");

    expect(
      screen.getByText("A IA responde: “Escova custa a partir de R$ 60 e leva 40 min.”"),
    ).toBeVisible();
  });

  test("ON_REQUEST: 'O valor de Coloração é combinado no atendimento, que leva 1 h 30.'", async () => {
    const user = userEvent.setup();
    const name = await renderNewForm();

    await user.type(name, "Coloração");
    fireEvent.change(getDurationInput(), { target: { value: "90" } });
    await user.click(screen.getByLabelText(priceTypeLabel.ON_REQUEST));

    expect(
      screen.getByText(
        "A IA responde: “O valor de Coloração é combinado no atendimento, que leva 1 h 30.”",
      ),
    ).toBeVisible();
  });

  test("NOT_INFORMED: 'Hidratação leva 30 min; o valor você confirma com a cliente.'", async () => {
    const user = userEvent.setup();
    const name = await renderNewForm();

    await user.type(name, "Hidratação");
    fireEvent.change(getDurationInput(), { target: { value: "30" } });
    await user.click(screen.getByLabelText(priceTypeLabel.NOT_INFORMED));

    expect(
      screen.getByText(
        "A IA responde: “Hidratação leva 30 min; o valor você confirma com a cliente.”",
      ),
    ).toBeVisible();
  });

  test("some sem nome", async () => {
    const user = userEvent.setup();
    await renderNewForm();

    fireEvent.change(getDurationInput(), { target: { value: "40" } });
    await typePrice(user, "55");

    expect(screen.queryByText(/custa R\$/)).toBeNull();
    expect(screen.queryByText(/A IA responde/)).toBeNull();
  });

  test("perde a parte da duração quando não há duração", async () => {
    const user = userEvent.setup();
    const name = await renderNewForm();

    await user.type(name, "Manicure");
    await typePrice(user, "55");

    expect(screen.getByText("A IA responde: “Manicure custa R$ 55.”")).toBeVisible();
  });

  test("com preço fixo sem valor, a frase não aparece", async () => {
    const user = userEvent.setup();
    const name = await renderNewForm();

    await user.type(name, "Manicure");
    fireEvent.change(getDurationInput(), { target: { value: "40" } });

    expect(screen.queryByText(/A IA responde/)).toBeNull();
  });

  test("acompanha a mudança de tipo e de valor", async () => {
    const user = userEvent.setup();
    const name = await renderNewForm();

    await user.type(name, "Manicure");
    fireEvent.change(getDurationInput(), { target: { value: "40" } });
    await typePrice(user, "55");
    expect(
      screen.getByText("A IA responde: “Manicure custa R$ 55 e leva 40 min.”"),
    ).toBeVisible();

    await user.click(screen.getByLabelText(priceTypeLabel.STARTING_AT));
    expect(
      screen.getByText("A IA responde: “Manicure custa a partir de R$ 55 e leva 40 min.”"),
    ).toBeVisible();

    await typePrice(user, "0");
    expect(
      screen.getByText(
        "A IA responde: “Manicure custa a partir de R$ 550 e leva 40 min.”",
      ),
    ).toBeVisible();
  });
});

describe("§4.7 (formulário) sem copy técnica", () => {
  test("'Gerenciado pela', 'Controle completo' e a origem 'Agenda Avenly' não aparecem em /servicos/novo", async () => {
    await renderNewForm();

    expect(screen.queryByText(/Gerenciado pela/)).toBeNull();
    expect(screen.queryByText(/Controle completo/)).toBeNull();
    expect(screen.queryByText("Agenda Avenly")).toBeNull();
    expect(
      screen.queryByText(/podem ser criados, editados e desativados aqui/),
    ).toBeNull();
  });

  test("'Gerenciado pela', 'Controle completo' e a origem 'Agenda Avenly' não aparecem em /servicos/editar", async () => {
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

    expect(screen.queryByText(/Gerenciado pela/)).toBeNull();
    expect(screen.queryByText(/Controle completo/)).toBeNull();
    expect(screen.queryByText("Agenda Avenly")).toBeNull();
    expect(
      screen.queryByText(/podem ser criados, editados e desativados aqui/),
    ).toBeNull();
  });
});
