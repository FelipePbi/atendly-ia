// @vitest-environment jsdom
/**
 * Goal072/WU-03 — campos da agenda: duração em passos de 5 com atalhos, preço
 * com máscara (mesmo valor gravado), dias em pílulas com resumo em texto e
 * horas com intervalo escrito e barra decorativa de 0 a 24 h.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type OnboardingState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: { get: getOnboarding, update: updateOnboarding },
    serviceCatalog: { create: vi.fn(), list: vi.fn() },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn().mockResolvedValue(null),
    setUnauthenticated: vi.fn(),
  }),
}));

function emptyState(): OnboardingState {
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

function availabilityFor(
  days: number[],
): NonNullable<OnboardingState["availability"]> {
  return {
    customerChangeMinNoticeMinutes: 0,
    rules: days.map((dayOfWeek) => ({
      active: true,
      dayOfWeek,
      endTime: "18:00",
      startTime: "09:00",
    })),
    timezone: "America/Sao_Paulo",
  } as unknown as NonNullable<OnboardingState["availability"]>;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
});

async function renderStep(scenario: string, state = emptyState()) {
  getOnboarding.mockResolvedValue(state);
  const user = userEvent.setup();
  render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario as never} />
    </OnboardingRuntimeProvider>,
  );
  return user;
}

// Intl separa "R$" do valor com espaço não separável.
function brl(input: HTMLElement): string {
  return (input as HTMLInputElement).value.replace(/\s/g, " ");
}

describe("duração: passos de 5 minutos e atalhos (§6.6)", () => {
  test("+ a partir de 60 dá 65 e − dá 55", async () => {
    const user = await renderStep("servico-nome");
    const duration = await screen.findByLabelText("Duração em minutos");
    expect(duration).toHaveValue(60);
    expect(duration).toHaveAttribute("min", "5");
    expect(duration).toHaveAttribute("max", "1440");
    expect(duration).toHaveAttribute("step", "5");

    await user.click(screen.getByRole("button", { name: "Aumentar duração" }));
    expect(duration).toHaveValue(65);
    await user.click(screen.getByRole("button", { name: "Diminuir duração" }));
    await user.click(screen.getByRole("button", { name: "Diminuir duração" }));
    expect(duration).toHaveValue(55);
  });

  test("o atalho 90 dá 90 com aria-pressed=true e desmarca os outros", async () => {
    const user = await renderStep("servico-nome");
    await screen.findByLabelText("Duração em minutos");
    const shortcuts = within(
      screen.getByRole("group", { name: "Atalhos de duração" }),
    );
    expect(shortcuts.getByRole("button", { name: "60" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(shortcuts.getByRole("button", { name: "90" }));
    expect(screen.getByLabelText("Duração em minutos")).toHaveValue(90);
    expect(shortcuts.getByRole("button", { name: "90" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(shortcuts.getByRole("button", { name: "60" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("7 digitado é recusado com a mensagem, sem gravar", async () => {
    const user = await renderStep("servico-nome");
    await user.type(await screen.findByLabelText("Nome do serviço"), "Corte");
    await user.type(screen.getByLabelText("Preço em reais"), "9000");
    const duration = screen.getByLabelText("Duração em minutos");
    await user.clear(duration);
    await user.type(duration, "7");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(duration).toHaveAccessibleDescription(
      "A duração vai de 5 em 5 minutos.",
    );
    expect(updateOnboarding).not.toHaveBeenCalled();
  });
});

describe("preço: máscara e mesmo valor gravado (§6.7)", () => {
  test("mostra R$ 90,00 e grava 90 em PATCH /v1/onboarding", async () => {
    const user = await renderStep("servico-nome");
    await user.type(await screen.findByLabelText("Nome do serviço"), "Corte");
    const price = screen.getByLabelText("Preço em reais");
    await user.type(price, "9000");
    expect(brl(price)).toBe("R$ 90,00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        service: {
          active: true,
          durationMinutes: 60,
          id: undefined,
          name: "Corte",
          price: 90,
          priceType: "FIXED",
        },
      }),
    );
  });

  test("um preço já gravado volta mascarado", async () => {
    await renderStep("servico-nome", {
      ...emptyState(),
      service: {
        active: true,
        bufferAfterMinutes: 0,
        bufferBeforeMinutes: 0,
        durationMinutes: 45,
        id: "svc-1",
        name: "Corte",
        needsReview: false,
        price: 90,
        priceType: "FIXED",
      },
    });
    expect(brl(await screen.findByLabelText("Preço em reais"))).toBe(
      "R$ 90,00",
    );
  });

  test("erro de servidor em service.price aparece no campo do preço", async () => {
    updateOnboarding.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: {
            service: ["service.price is required for FIXED and STARTING_AT."],
          },
          formErrors: [],
        },
        message: "Invalid request body.",
        requestId: "req-72",
        status: 400,
      }),
    );
    const user = await renderStep("servico-nome");
    await user.type(await screen.findByLabelText("Nome do serviço"), "Corte");
    await user.type(screen.getByLabelText("Preço em reais"), "9000");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const price = screen.getByLabelText("Preço em reais");
    await waitFor(() => expect(price).toHaveAttribute("aria-invalid", "true"));
    expect(price).toHaveAccessibleDescription("Informe o valor do serviço.");
    expect(price).toHaveFocus();
    expect(screen.getByLabelText("Nome do serviço")).not.toHaveAttribute(
      "aria-invalid",
    );
  });
});

describe("dias: sete pílulas e resumo em texto (§6.8)", () => {
  const fullNames = [
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
    "Domingo",
  ];

  test("sete checkboxes nomeados pelo nome completo do dia", async () => {
    await renderStep("dias-de-atendimento");
    const group = await screen.findByRole("group", {
      name: "Dias de atendimento",
    });
    const boxes = within(group).getAllByRole("checkbox");
    expect(boxes).toHaveLength(7);
    for (const name of fullNames) {
      expect(
        within(group).getByRole("checkbox", { name }),
      ).toBeInTheDocument();
    }
  });

  test("resumo de segunda a sábado, dias soltos e um dia só", async () => {
    const user = await renderStep("dias-de-atendimento");
    await screen.findByRole("group", { name: "Dias de atendimento" });
    // Rascunho inicial: segunda a sexta.
    expect(
      screen.getByText("Segunda a sexta · 5 dias por semana"),
    ).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Sábado" }));
    expect(
      screen.getByText("Segunda a sábado · 6 dias por semana"),
    ).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Terça" }));
    await user.click(screen.getByRole("checkbox", { name: "Quinta" }));
    await user.click(screen.getByRole("checkbox", { name: "Sábado" }));
    expect(
      screen.getByText("Segunda, quarta e sexta · 3 dias por semana"),
    ).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Quarta" }));
    await user.click(screen.getByRole("checkbox", { name: "Sexta" }));
    expect(screen.getByText("Só segunda · 1 dia por semana")).toBeVisible();
  });

  test("nenhum dia marcado continua recusado com a mensagem de hoje", async () => {
    const user = await renderStep("dias-de-atendimento");
    const group = await screen.findByRole("group", {
      name: "Dias de atendimento",
    });
    for (const name of fullNames.slice(0, 5)) {
      await user.click(within(group).getByRole("checkbox", { name }));
    }
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(group).toHaveAccessibleDescription(
      "Escolha pelo menos um dia de atendimento.",
    );
    expect(updateOnboarding).not.toHaveBeenCalled();
  });
});

describe("horas: intervalo em texto e barra decorativa (§6.9)", () => {
  test("mostra o intervalo em texto e a barra de 0 a 24 h escondida da leitura", async () => {
    await renderStep("horarios", {
      ...emptyState(),
      availability: availabilityFor([1, 2, 3]),
    });
    expect(await screen.findByLabelText("Início")).toHaveValue("09:00");
    expect(screen.getByText("Das 09:00 às 18:00")).toBeVisible();

    const bar = document.querySelector(".hours-bar");
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar).toHaveTextContent("0 h");
    expect(bar).toHaveTextContent("24 h");
    expect(
      screen.getByLabelText("Início").getAttribute("type"),
    ).toBe("time");
  });

  test("o texto acompanha a edição do horário", async () => {
    const user = await renderStep("horarios", {
      ...emptyState(),
      availability: availabilityFor([1, 2, 3]),
    });
    const end = await screen.findByLabelText("Fim");
    await user.clear(end);
    await user.type(end, "20:00");
    expect(screen.getByText("Das 09:00 às 20:00")).toBeVisible();
  });

  test("fim antes do início continua recusado e não grava", async () => {
    const user = await renderStep("horarios", {
      ...emptyState(),
      availability: availabilityFor([1, 2, 3]),
    });
    const end = await screen.findByLabelText("Fim");
    await user.clear(end);
    await user.type(end, "08:00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription(
      "O horário final deve ser depois do horário inicial.",
    );
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("Personalizar dias diferentes continua botão com aria-expanded", async () => {
    const user = await renderStep("horarios", {
      ...emptyState(),
      availability: availabilityFor([1, 2, 3]),
    });
    const toggle = await screen.findByRole("button", {
      name: "Personalizar dias diferentes",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Segunda · Início")).toBeVisible();
  });
});
