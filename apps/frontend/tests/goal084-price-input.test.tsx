// @vitest-environment jsdom
/**
 * Goal084/WU-01 — o campo de preço recebe reais: "60" vale R$ 60,00, a vírgula
 * separa os centavos, o ponto de milhar é aceito, o texto fica onde a pessoa
 * digitou e só vira "R$ 60,00" ao sair do campo. `onValueChange` continua em
 * centavos, então serviço novo, edição de serviço e onboarding gravam o preço
 * em reais que já gravavam.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState, Service } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { CurrencyInput } from "@/shared/ui/CurrencyInput";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const refreshSession = vi.fn();
const serviceCatalogList = vi.fn();
const serviceCatalogCreate = vi.fn();
const serviceCatalogUpdate = vi.fn();
const serviceCatalogGetAiInstruction = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: { get: getOnboarding, update: updateOnboarding },
    serviceCatalog: {
      create: serviceCatalogCreate,
      getAiInstruction: serviceCatalogGetAiInstruction,
      list: serviceCatalogList,
      update: serviceCatalogUpdate,
    },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

function plain(text: string): string {
  return text.replace(/ /g, " ");
}

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
    price: 60,
    priceType: "FIXED",
    recurrenceIntervalDays: null,
    reviewOrigin: null,
    ...overrides,
  };
}

function emptyOnboardingState(): OnboardingState {
  return {
    ai: { tone: null },
    availability: null,
    business: null,
    calendar: { integration: null, source: null, timezone: null },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceCatalogList.mockReset();
  serviceCatalogCreate.mockReset();
  serviceCatalogUpdate.mockReset();
  serviceCatalogGetAiInstruction.mockReset().mockResolvedValue({ content: "" });
  updateOnboarding.mockResolvedValue(emptyOnboardingState());
  refreshSession.mockResolvedValue(null);
});

const TABLE: ReadonlyArray<{
  cents: number;
  shown: string;
  typed: string;
}> = [
  { cents: 6000, shown: "R$ 60,00", typed: "60" },
  { cents: 6050, shown: "R$ 60,50", typed: "60,5" },
  { cents: 6050, shown: "R$ 60,50", typed: "60,50" },
  { cents: 90, shown: "R$ 0,90", typed: "0,90" },
  { cents: 120000, shown: "R$ 1.200,00", typed: "1.200" },
  { cents: 120050, shown: "R$ 1.200,50", typed: "1.200,50" },
  { cents: 123456, shown: "R$ 1.234,56", typed: "R$ 1.234,56" },
  { cents: 6050, shown: "R$ 60,50", typed: "60.50" },
];

function renderInput() {
  const onValueChange = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <CurrencyInput
        aria-label="Preço"
        onValueChange={onValueChange}
        placeholder="R$ 0,00"
      />
      <button type="button">Fora</button>
    </>,
  );
  return {
    input: screen.getByLabelText<HTMLInputElement>("Preço"),
    onValueChange,
    user,
  };
}

describe("1. a tabela de leitura do preço", () => {
  test.each(TABLE)(
    "digitar $typed entrega $cents centavos e mostra $shown ao sair do campo",
    async ({ cents, shown, typed }) => {
      const { input, onValueChange, user } = renderInput();

      await user.click(input);
      await user.keyboard(typed);
      expect(onValueChange).toHaveBeenLastCalledWith(cents);

      await user.tab();
      expect(plain(input.value)).toBe(shown);
    },
  );

  test.each(TABLE)(
    "colar $typed entrega $cents centavos e mostra $shown ao sair do campo",
    async ({ cents, shown, typed }) => {
      const { input, onValueChange, user } = renderInput();

      await user.click(input);
      await user.paste(typed);
      expect(onValueChange).toHaveBeenLastCalledWith(cents);

      await user.tab();
      expect(plain(input.value)).toBe(shown);
    },
  );

  test("vazio entrega null e continua vazio ao sair do campo", async () => {
    const { input, onValueChange, user } = renderInput();

    await user.type(input, "60");
    await user.clear(input);
    expect(onValueChange).toHaveBeenLastCalledWith(null);

    await user.tab();
    expect(input.value).toBe("");
  });

  test("terceira casa depois da vírgula é descartada e só a primeira vírgula conta", async () => {
    const { input, onValueChange, user } = renderInput();

    await user.click(input);
    await user.paste("60,509");
    expect(onValueChange).toHaveBeenLastCalledWith(6050);
    expect(input.value).toBe("60,50");

    await user.clear(input);
    await user.paste("60,5,9");
    expect(onValueChange).toHaveBeenLastCalledWith(6059);
  });

  test("valor acima de Number.MAX_SAFE_INTEGER centavos é recusado", async () => {
    const { input, onValueChange, user } = renderInput();

    await user.click(input);
    await user.paste("90071992547410");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  test("ao entrar num campo preenchido o texto vira a forma editável, sem R$ e sem ,00", async () => {
    const user = userEvent.setup();
    render(
      <>
        <CurrencyInput aria-label="Cheio" defaultValueCents={6000} />
        <CurrencyInput aria-label="Quebrado" defaultValueCents={6050} />
      </>,
    );
    const whole = screen.getByLabelText<HTMLInputElement>("Cheio");
    const broken = screen.getByLabelText<HTMLInputElement>("Quebrado");
    expect(plain(whole.value)).toBe("R$ 60,00");

    await user.click(whole);
    expect(whole.value).toBe("60");
    await user.click(broken);
    expect(broken.value).toBe("60,5");
    expect(plain(whole.value)).toBe("R$ 60,00");
  });

  test("o campo usa o teclado decimal", () => {
    render(<CurrencyInput aria-label="Preço" />);
    expect(screen.getByLabelText("Preço")).toHaveAttribute(
      "inputmode",
      "decimal",
    );
  });
});

describe("2. serviço novo", () => {
  test("digitar 60 no preço e criar envia price: 60", async () => {
    const user = userEvent.setup();
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [],
      source: "AVENLY",
    });
    serviceCatalogCreate.mockResolvedValue(serviceFixture({ id: "novo" }));
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="new" />
      </ShellConfigProvider>,
    );

    await user.type(await screen.findByLabelText("Nome"), "Corte");
    await user.type(
      screen.getByLabelText<HTMLInputElement>("Duração (minutos)", {
        exact: false,
      }),
      "45",
    );
    await user.type(screen.getByPlaceholderText("R$ 0,00"), "60");
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    await waitFor(() =>
      expect(serviceCatalogCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Corte", price: 60 }),
      ),
    );
  });
});

describe("3. edição de serviço", () => {
  test("abre com R$ 60,00 e trocar para 75,50 envia price: 75.5", async () => {
    const user = userEvent.setup();
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [serviceFixture({ id: "s1", price: 60 })],
      source: "AVENLY",
    });
    serviceCatalogUpdate.mockResolvedValue(serviceFixture({ price: 75.5 }));
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="edit" serviceId="s1" />
      </ShellConfigProvider>,
    );

    const price =
      await screen.findByPlaceholderText<HTMLInputElement>("R$ 0,00");
    expect(plain(price.value)).toBe("R$ 60,00");

    await user.click(price);
    expect(price.value).toBe("60");
    await user.clear(price);
    await user.type(price, "75,50");
    await user.click(screen.getByRole("button", { name: /^Salvar/ }));

    await waitFor(() =>
      expect(serviceCatalogUpdate).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ price: 75.5 }),
      ),
    );
  });
});

describe("4. onboarding, etapa do preço do primeiro serviço", () => {
  test("digitar 60 grava price: 60 em PATCH /v1/onboarding", async () => {
    getOnboarding.mockResolvedValue(emptyOnboardingState());
    const user = userEvent.setup();
    render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="servico-nome" />
      </OnboardingRuntimeProvider>,
    );

    await user.type(
      await screen.findByLabelText("Nome do serviço"),
      "Corte feminino",
    );
    const duration = screen.getByLabelText("Duração em minutos");
    await user.clear(duration);
    await user.type(duration, "45");
    await user.type(screen.getByLabelText("Preço em reais"), "60");
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        service: {
          active: true,
          durationMinutes: 45,
          id: undefined,
          name: "Corte feminino",
          price: 60,
          priceType: "FIXED",
        },
      }),
    );
  });
});
