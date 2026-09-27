// @vitest-environment jsdom
/**
 * Goal058 (WU-02): duração aceita qualquer minuto a partir de 1 — sem exigir
 * múltiplo de 5 — e o CurrencyInput vira uma máscara de centavos que
 * acrescenta cada dígito ao fim, qualquer que seja a posição do cursor.
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

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    serviceCatalog: {
      create: serviceCatalogCreate,
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

describe("CurrencyInput ignora a posição do cursor", () => {
  test("digitar 6000 dá R$ 60,00 com o cursor no começo, no meio e no fim", async () => {
    const cases: Array<"start" | "middle" | "end"> = ["start", "middle", "end"];
    for (const cursor of cases) {
      const onValueChange = vi.fn();
      const { unmount } = render(
        <CurrencyInput onValueChange={onValueChange} placeholder="R$ 0,00" />,
      );
      const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");
      const user = userEvent.setup();

      for (const digit of ["6", "0", "0", "0"]) {
        const position =
          cursor === "start" ? 0 : cursor === "middle" ? Math.floor(input.value.length / 2) : input.value.length;
        input.setSelectionRange(position, position);
        await user.type(input, digit, {
          initialSelectionStart: position,
          initialSelectionEnd: position,
        });
      }

      expect(input.value).toBe(brl("60,00"));
      unmount();
    }
  });

  test("Backspace tira o último dígito, mesmo com seleção", async () => {
    const user = userEvent.setup();
    render(<CurrencyInput placeholder="R$ 0,00" />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    await user.type(input, "6000");
    expect(input.value).toBe(brl("60,00"));

    await user.type(input, "{Backspace}");
    expect(input.value).toBe(brl("6,00"));
  });

  test("seleção total e novo dígito recomeça o valor", async () => {
    const user = userEvent.setup();
    render(<CurrencyInput placeholder="R$ 0,00" />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    await user.type(input, "6000");
    expect(input.value).toBe(brl("60,00"));

    input.setSelectionRange(0, input.value.length);
    await user.type(input, "9", {
      initialSelectionStart: 0,
      initialSelectionEnd: input.value.length,
    });
    expect(input.value).toBe(brl("0,09"));
  });

  test("colar extrai dígitos do texto colado", async () => {
    const user = userEvent.setup();
    render(<CurrencyInput placeholder="R$ 0,00" />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    await user.click(input);
    await user.paste("R$ 6.000,00");
    expect(input.value).toBe(brl("6.000,00"));
  });

  // Teclado virtual Android e IME mandam `key: "Unidentified"` (keyCode 229)
  // no keydown, e ditado, preenchimento automático e texto arrastado nem
  // mandam keydown: o texto chega só pelo evento `input`. Aqui nenhum keydown
  // é disparado; o valor que o navegador monta (dígito inserido onde está o
  // cursor) chega pelo `input`, como no celular.
  test("dígitos que chegam só pelo evento input, sem keydown, acumulam ao fim", () => {
    const onValueChange = vi.fn();
    render(
      <CurrencyInput onValueChange={onValueChange} placeholder="R$ 0,00" />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    for (const cursor of ["start", "middle", "end"] as const) {
      fireEvent.input(input, { target: { value: "" } });
      for (const digit of ["6", "0", "0", "0"]) {
        const text = input.value;
        const position =
          cursor === "start" ? 0 : cursor === "middle" ? Math.floor(text.length / 2) : text.length;
        fireEvent.input(input, {
          target: { value: text.slice(0, position) + digit + text.slice(position) },
        });
      }
      expect(input.value).toBe(brl("60,00"));
    }
    expect(onValueChange).toHaveBeenLastCalledWith(6000);
  });

  test("apagar um caractere pelo evento input tira o último dígito, onde quer que esteja o cursor", () => {
    render(<CurrencyInput defaultValueCents={6000} placeholder="R$ 0,00" />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");
    expect(input.value).toBe(brl("60,00"));

    // deleteContentBackward logo depois do "6": o navegador tira o "6".
    const text = input.value;
    const afterSix = text.indexOf("6") + 1;
    fireEvent.input(input, {
      target: { value: text.slice(0, afterSix - 1) + text.slice(afterSix) },
    });
    expect(input.value).toBe(brl("6,00"));
  });

  test("texto trocado de uma vez (preenchimento automático, seleção total) fica com os dígitos novos", () => {
    render(<CurrencyInput defaultValueCents={6000} placeholder="R$ 0,00" />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("R$ 0,00");

    fireEvent.input(input, { target: { value: "R$ 45,00" } });
    expect(input.value).toBe(brl("45,00"));

    // Seleção total e "0": o "0" coincide com o fim do texto antigo.
    fireEvent.input(input, { target: { value: "0" } });
    expect(input.value).toBe(brl("0,00"));

    // Caractere que não é dígito é ignorado.
    fireEvent.input(input, { target: { value: `${input.value}a` } });
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
    await userEvent.click(
      screen.getByText("Descrição, cor, buffers, recorrência e status"),
    );

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
