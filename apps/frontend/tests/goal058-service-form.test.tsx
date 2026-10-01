// @vitest-environment jsdom
/**
 * Goal058 (WU-02): duração aceita qualquer minuto a partir de 1 — sem exigir
 * múltiplo de 5 — e o CurrencyInput recebe o preço em reais (regra do
 * Goal084, que substituiu a máscara de centavos do Goal058).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Service } from "@/data";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { CurrencyInput } from "@/shared/ui/CurrencyInput";

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

function brl(amount: string): string {
  return `R$ ${amount}`;
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

describe("duração aceita qualquer minuto a partir de 1", () => {
  test("40, 45, 60 e 41 são válidos; 0 é recusado; vazio continua válido", async () => {
    serviceCatalogList.mockResolvedValue({ editable: true, items: [], source: "ATENDLY" });
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="new" />
      </ShellConfigProvider>,
    );

    const duration = await screen.findByLabelText<HTMLInputElement>(
      "Duração (minutos)",
      { exact: false },
    );

    expect(duration).toHaveAttribute("min", "1");
    expect(duration).toHaveAttribute("step", "1");

    for (const value of ["40", "45", "60", "41"]) {
      fireEvent.change(duration, { target: { value } });
      expect(duration.checkValidity()).toBe(true);
    }

    fireEvent.change(duration, { target: { value: "0" } });
    expect(duration.checkValidity()).toBe(false);
    expect(duration.validity.rangeUnderflow).toBe(true);

    fireEvent.change(duration, { target: { value: "" } });
    expect(duration.checkValidity()).toBe(true);
  });

  test("não pede número negativo", async () => {
    serviceCatalogList.mockResolvedValue({ editable: true, items: [], source: "ATENDLY" });
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="new" />
      </ShellConfigProvider>,
    );

    const duration = await screen.findByLabelText<HTMLInputElement>(
      "Duração (minutos)",
      { exact: false },
    );

    fireEvent.change(duration, { target: { value: "-5" } });
    expect(duration.checkValidity()).toBe(false);
  });
});

describe("preço do serviço", () => {
  test("serviço novo nasce com o campo de preço vazio", async () => {
    serviceCatalogList.mockResolvedValue({ editable: true, items: [], source: "ATENDLY" });
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="new" />
      </ShellConfigProvider>,
    );

    const price = await screen.findByPlaceholderText<HTMLInputElement>(
      "R$ 0,00",
    );
    expect(price.value).toBe("");
  });

  test("serviço existente mantém o valor salvo", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [serviceFixture({ id: "s1", price: 80, priceType: "FIXED" })],
      source: "ATENDLY",
    });
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="edit" serviceId="s1" />
      </ShellConfigProvider>,
    );

    const price = await screen.findByPlaceholderText<HTMLInputElement>(
      "R$ 0,00",
    );
    expect(price.value).toBe(brl("80,00"));
  });

  test("serviço existente sem preço nasce com o campo vazio", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [
        serviceFixture({
          id: "s1",
          price: null,
          priceType: "STARTING_AT",
        }),
      ],
      source: "ATENDLY",
    });
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="edit" serviceId="s1" />
      </ShellConfigProvider>,
    );

    const price = await screen.findByPlaceholderText<HTMLInputElement>(
      "R$ 0,00",
    );
    expect(price.value).toBe("");
  });
});

describe("CurrencyInput recebe reais e deixa o texto onde a pessoa digitou", () => {
  test("digitar 60 entrega 6000 centavos e só formata ao sair do campo", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CurrencyInput onValueChange={onValueChange} placeholder="R$ 0,00" />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    await user.type(input, "60");
    expect(input.value).toBe("60");
    expect(onValueChange).toHaveBeenLastCalledWith(6000);

    await user.tab();
    expect(input.value).toBe(brl("60,00"));
  });

  test("o dígito entra onde está o cursor, não é empurrado para o fim", async () => {
    const user = userEvent.setup();
    render(<CurrencyInput placeholder="R$ 0,00" />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    await user.type(input, "0");
    await user.type(input, "6", {
      initialSelectionStart: 0,
      initialSelectionEnd: 0,
    });
    expect(input.value).toBe("60");
  });

  test("Backspace tira o último caractere digitado", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CurrencyInput onValueChange={onValueChange} placeholder="R$ 0,00" />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    await user.type(input, "60");
    await user.type(input, "{Backspace}");
    expect(input.value).toBe("6");
    expect(onValueChange).toHaveBeenLastCalledWith(600);

    await user.tab();
    expect(input.value).toBe(brl("6,00"));
  });

  test("seleção total e novo dígito recomeça o valor", async () => {
    const user = userEvent.setup();
    render(<CurrencyInput placeholder="R$ 0,00" />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    await user.type(input, "60");
    expect(input.value).toBe("60");

    input.setSelectionRange(0, input.value.length);
    await user.type(input, "9", {
      initialSelectionStart: 0,
      initialSelectionEnd: input.value.length,
    });
    expect(input.value).toBe("9");

    await user.tab();
    expect(input.value).toBe(brl("9,00"));
  });

  test("colar um valor formatado entrega os centavos dele", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CurrencyInput onValueChange={onValueChange} placeholder="R$ 0,00" />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    await user.click(input);
    await user.paste("R$ 6.000,00");
    expect(onValueChange).toHaveBeenLastCalledWith(600000);

    await user.tab();
    expect(input.value).toBe(brl("6.000,00"));
  });

  // Teclado virtual Android e IME mandam `key: "Unidentified"` (keyCode 229)
  // no keydown, e ditado, preenchimento automático e texto arrastado nem
  // mandam keydown: o texto chega só pelo evento `input`. Aqui nenhum keydown
  // é disparado; o valor que o navegador monta (caractere inserido onde está o
  // cursor) chega pelo `input`, como no celular.
  test("caracteres que chegam só pelo evento input, sem keydown, valem como digitados", () => {
    const onValueChange = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <CurrencyInput
        onKeyDown={onKeyDown}
        onValueChange={onValueChange}
        placeholder="R$ 0,00"
      />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    for (const char of ["6", "0", ",", "5"]) {
      fireEvent.input(input, { target: { value: input.value + char } });
    }
    expect(input.value).toBe("60,5");
    expect(onValueChange).toHaveBeenLastCalledWith(6050);
    expect(onKeyDown).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(input.value).toBe(brl("60,50"));
  });

  test("apagar um caractere pelo evento input tira só ele, onde quer que esteja o cursor", () => {
    const onValueChange = vi.fn();
    render(
      <CurrencyInput
        defaultValueCents={6000}
        onValueChange={onValueChange}
        placeholder="R$ 0,00"
      />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");
    expect(input.value).toBe(brl("60,00"));

    fireEvent.focus(input);
    expect(input.value).toBe("60");

    // deleteContentBackward logo depois do "6": o navegador tira o "6".
    fireEvent.input(input, { target: { value: "0" } });
    expect(input.value).toBe("0");
    expect(onValueChange).toHaveBeenLastCalledWith(0);
  });

  test("texto trocado de uma vez (preenchimento automático, seleção total) vira o valor novo", () => {
    const onValueChange = vi.fn();
    render(
      <CurrencyInput
        defaultValueCents={6000}
        onValueChange={onValueChange}
        placeholder="R$ 0,00"
      />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: "R$ 45,00" } });
    expect(input.value).toBe("45,00");
    expect(onValueChange).toHaveBeenLastCalledWith(4500);

    // Caractere fora do permitido é descartado.
    fireEvent.input(input, { target: { value: `${input.value}a` } });
    expect(input.value).toBe("45,00");

    fireEvent.input(input, { target: { value: "0" } });
    expect(onValueChange).toHaveBeenLastCalledWith(0);

    fireEvent.blur(input);
    expect(input.value).toBe(brl("0,00"));
  });
});

describe("intervalos antes/depois do atendimento não mudam", () => {
  test("min 0 e step 5 continuam nos campos de buffer", async () => {
    serviceCatalogList.mockResolvedValue({ editable: true, items: [], source: "ATENDLY" });
    render(
      <ShellConfigProvider>
        <ProductServicesScreen scenario="new" />
      </ShellConfigProvider>,
    );

    await screen.findByLabelText("Nome do serviço");

    const before = screen.getByLabelText(
      "Intervalo antes do atendimento (minutos)",
    );
    const after = screen.getByLabelText(
      "Intervalo depois do atendimento (minutos)",
    );

    expect(before).toHaveAttribute("min", "0");
    expect(before).toHaveAttribute("step", "5");
    expect(after).toHaveAttribute("min", "0");
    expect(after).toHaveAttribute("step", "5");
  });
});
