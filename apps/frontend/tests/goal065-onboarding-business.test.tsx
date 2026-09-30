// @vitest-environment jsdom
/**
 * Goal065/WU-02 — "Seu negócio" vira quatro etapas: Boas-vindas (sem
 * gravação, entrada da conta nova), Segmento + nome, Modalidade e Endereço
 * (condicional, só com Local próprio). Cada etapa grava e só avança com
 * sucesso do BFF; nenhuma chama `checkValidity`/`reportValidity` — a
 * validação usa `noValidate` no formulário e decoração manual de
 * `aria-invalid`/`aria-describedby`, no mesmo padrão de AuthScreen
 * (D-082 item 5, `goal064-auth-screens.test.tsx`).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type OnboardingState } from "@/data";
import {
  nextRequiredStep,
  OnboardingRuntimeProvider,
} from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: { get: getOnboarding, update: updateOnboarding },
  }),
  useProductRuntime: () => ({
    refreshSession,
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

function stateFixture(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return { ...emptyState(), ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
  refreshSession.mockResolvedValue(null);
});

async function renderStep(scenario: string, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  const user = userEvent.setup();
  render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario as never} />
    </OnboardingRuntimeProvider>,
  );
  return user;
}

describe("boas-vindas: entrada da conta nova, sem gravação", () => {
  test("conta nova entra em boas-vindas", () => {
    expect(nextRequiredStep(emptyState())).toBe("boas-vindas");
  });

  test("Começar avança para segmento-e-nome sem chamar o BFF", async () => {
    const user = await renderStep("boas-vindas", emptyState());
    await user.click(
      await screen.findByRole("button", { name: "Começar" }),
    );

    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/segmento-e-nome");
  });

  test("Voltar existe só inativo: é sempre o primeiro passo", async () => {
    await renderStep("boas-vindas", emptyState());
    await screen.findByRole("button", { name: "Começar" });
    const back = screen.getByRole("link", { name: "Voltar" });
    expect(back).toHaveAttribute("aria-disabled", "true");
    expect(back).not.toHaveAttribute("href");
  });

  test("texto do vault, a frase do progresso e a composição estática de três elementos", async () => {
    await renderStep("boas-vindas", emptyState());
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Configure sua Atendly em poucos passos.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText("Seu progresso fica salvo a cada etapa."),
    ).toBeVisible();
    // Mensagem do cliente, resposta da IA e horário na agenda, numa figura
    // estática com nome próprio (sem carrossel nem animação).
    const scene = screen.getByRole("img", { name: /a IA responde/ });
    expect(scene).toHaveTextContent("Oi! Tem horário na sexta?");
    expect(scene).toHaveTextContent("Tenho sexta às 15h30. Posso confirmar?");
    expect(scene).toHaveTextContent("15:30");
    expect(scene).toHaveTextContent("Ana Paula · Corte");
  });
});

describe("segmento-e-nome: valida inline, grava e avança para modalidade", () => {
  test("segue o vault: título, eyebrow, segmento primeiro e depois o nome com a ajuda", async () => {
    await renderStep("segmento-e-nome", emptyState());
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Vamos começar pelo seu negócio",
    });
    expect(heading.previousElementSibling).toHaveTextContent("Seu negócio");
    const segmentGroup = screen.getByRole("group", {
      name: "Qual é o seu segmento?",
    });
    const nameInput = screen.getByLabelText("Como seus clientes conhecem você?");
    expect(
      segmentGroup.compareDocumentPosition(nameInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(nameInput).toHaveAccessibleDescription(
      "Pode ser seu nome ou o nome do seu negócio.",
    );
    expect(screen.queryByText("Nome do negócio")).toBeNull();
  });

  test("envio vazio mostra o erro do grupo de segmento e o do nome juntos, foca o grupo e não grava nada", async () => {
    const user = await renderStep("segmento-e-nome", emptyState());
    const nameInput = await screen.findByLabelText(
      "Como seus clientes conhecem você?",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const segmentGroup = screen.getByRole("group", {
      name: "Qual é o seu segmento?",
    });
    expect(screen.getByText("Escolha o segmento do seu negócio.")).toBeVisible();
    expect(segmentGroup).toHaveAttribute("aria-invalid", "true");
    expect(segmentGroup).toHaveAccessibleDescription(
      "Escolha o segmento do seu negócio.",
    );
    expect(
      screen.getByText("Digite como seus clientes conhecem você."),
    ).toBeVisible();
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    // A ajuda continua ligada ao campo, junto do erro.
    expect(nameInput).toHaveAccessibleDescription(
      "Pode ser seu nome ou o nome do seu negócio. Digite como seus clientes conhecem você.",
    );
    // Foco no primeiro inválido: o primeiro chip do grupo de segmento.
    expect(screen.getByRole("button", { name: "Cabelo" })).toHaveFocus();
    expect(screen.queryByRole("alert", { name: /Não foi possível/ })).toBeNull();
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("com 'Outro' e tudo vazio, o campo curto e o nome mostram os erros juntos e o foco vai ao campo curto", async () => {
    const user = await renderStep("segmento-e-nome", emptyState());
    const nameInput = await screen.findByLabelText(
      "Como seus clientes conhecem você?",
    );
    await user.click(screen.getByRole("button", { name: "Outro" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const customSegment = screen.getByRole("textbox", {
      name: "Qual é o seu segmento?",
    });
    expect(screen.getByText("Digite seu segmento.")).toBeVisible();
    expect(
      screen.getByText("Digite como seus clientes conhecem você."),
    ).toBeVisible();
    expect(customSegment).toHaveFocus();
    expect(customSegment).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    // Com "Outro", o grupo tem escolha: o erro é do campo curto, não do grupo.
    expect(
      screen.getByRole("group", { name: "Qual é o seu segmento?" }),
    ).not.toHaveAttribute("aria-invalid");
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("recusa de validação do servidor cai no campo, com texto de tela e sem o aviso geral", async () => {
    updateOnboarding.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: {
            business: ["Too small: expected string to have >=2 characters"],
          },
          formErrors: [],
        },
        message: "Invalid request body.",
        requestId: "req-1",
        status: 400,
      }),
    );
    const user = await renderStep("segmento-e-nome", emptyState());
    const nameInput = await screen.findByLabelText(
      "Como seus clientes conhecem você?",
    );
    await user.click(screen.getByRole("button", { name: "Cabelo" }));
    await user.type(nameInput, "Studio Aurora");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText("Digite como seus clientes conhecem você."),
    ).toBeVisible();
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveFocus();
    expect(
      screen.queryByText("Não foi possível salvar esta etapa. Tente novamente."),
    ).toBeNull();
    expect(screen.queryByText(/Too small/)).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  test("chips de segmento têm aria-pressed, só o escolhido true", async () => {
    const user = await renderStep("segmento-e-nome", emptyState());
    await screen.findByLabelText("Como seus clientes conhecem você?");
    const cabelo = screen.getByRole("button", { name: "Cabelo" });
    const barbearia = screen.getByRole("button", { name: "Barbearia" });
    expect(cabelo).toHaveAttribute("aria-pressed", "false");

    await user.click(cabelo);
    expect(cabelo).toHaveAttribute("aria-pressed", "true");
    expect(barbearia).toHaveAttribute("aria-pressed", "false");
  });

  test("preenchido, grava name+category+timezone e avança para modalidade", async () => {
    const user = await renderStep("segmento-e-nome", emptyState());
    await user.click(await screen.findByRole("button", { name: "Cabelo" }));
    await user.type(
      screen.getByLabelText("Como seus clientes conhecem você?"),
      "Studio Aurora",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalledWith({
      business: {
        category: "Cabelo",
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    }));
    expect(push).toHaveBeenCalledWith("/onboarding/modalidade");
  });
});

const businessSegmentDone: Partial<OnboardingState> = {
  business: {
    address: null,
    category: "Cabelo",
    modalities: [],
    name: "Studio Aurora",
    timezone: "America/Sao_Paulo",
  },
};

describe("modalidade: exige ao menos uma opção, com o erro ligado ao grupo", () => {
  test("segue o vault: 'Onde você atende?', 'Pode escolher mais de uma opção.' e 'A domicílio · Você vai até o cliente'", async () => {
    await renderStep("modalidade", stateFixture(businessSegmentDone));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Onde você atende?" }),
    ).toBeVisible();
    expect(screen.getByText("Pode escolher mais de uma opção.")).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: /A domicílio\s*Você vai até o cliente/ }),
    ).not.toBeChecked();
  });

  test("nenhuma modalidade escolhida mostra o erro no grupo, foca a primeira opção e não grava", async () => {
    const user = await renderStep(
      "modalidade",
      stateFixture(businessSegmentDone),
    );
    await screen.findByText("Modalidade de atendimento");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const group = screen.getByRole("group", {
      name: "Modalidade de atendimento",
    });
    expect(
      await screen.findByText("Escolha ao menos uma modalidade de atendimento."),
    ).toBeVisible();
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription(
      "Escolha ao menos uma modalidade de atendimento.",
    );
    expect(screen.getByRole("checkbox", { name: /Local próprio/ })).toHaveFocus();
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("sem Local próprio, grava e avança direto para sistema-atual", async () => {
    const user = await renderStep(
      "modalidade",
      stateFixture(businessSegmentDone),
    );
    await user.click(await screen.findByText("Online"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalledWith({
      business: {
        category: "Cabelo",
        modalities: ["ONLINE"],
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    }));
    // Goal066/WU-01: "fonte-da-agenda" saiu da sequência; o próximo passo do
    // bloco "Sua agenda" é "sistema-atual".
    expect(push).toHaveBeenCalledWith("/onboarding/sistema-atual");
  });

  test("com Local próprio, grava e avança para endereco", async () => {
    const user = await renderStep(
      "modalidade",
      stateFixture(businessSegmentDone),
    );
    await user.click(await screen.findByText("Local próprio"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalledWith({
      business: {
        category: "Cabelo",
        modalities: ["ON_SITE"],
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    }));
    expect(push).toHaveBeenCalledWith("/onboarding/endereco");
  });
});

const onSiteWithoutAddress: Partial<OnboardingState> = {
  business: {
    address: null,
    category: "Cabelo",
    modalities: ["ON_SITE"],
    name: "Studio Aurora",
    timezone: "America/Sao_Paulo",
  },
};

describe("endereco: só existe para Local próprio, exige valor não vazio", () => {
  test("a retomada com ON_SITE e sem endereço abre endereco", () => {
    expect(nextRequiredStep(stateFixture(onSiteWithoutAddress))).toBe(
      "endereco",
    );
  });

  test("envio vazio bloqueia com erro inline, foca o campo e não grava", async () => {
    const user = await renderStep("endereco", stateFixture(onSiteWithoutAddress));
    const addressInput = await screen.findByLabelText("Endereço do seu espaço");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText("Informe o endereço do seu espaço."),
    ).toBeVisible();
    expect(addressInput).toHaveFocus();
    expect(addressInput).toHaveAttribute("aria-invalid", "true");
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("valor só de espaços bloqueia com o mesmo erro, sem gravar", async () => {
    const user = await renderStep("endereco", stateFixture(onSiteWithoutAddress));
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "   ",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText("Informe o endereço do seu espaço."),
    ).toBeVisible();
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("preenchido, grava com o endereço e avança para sistema-atual", async () => {
    const user = await renderStep("endereco", stateFixture(onSiteWithoutAddress));
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "Rua das Flores, 100",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalledWith({
      business: {
        address: "Rua das Flores, 100",
        category: "Cabelo",
        modalities: ["ON_SITE"],
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    }));
    // Goal066/WU-01: mesma troca de destino do teste sem ON_SITE acima.
    expect(push).toHaveBeenCalledWith("/onboarding/sistema-atual");
  });

  test("BUSINESS_ADDRESS_REQUIRED do servidor cai no campo de endereço, sem o aviso geral", async () => {
    updateOnboarding.mockRejectedValue(
      new BffHttpError({
        code: "BUSINESS_ADDRESS_REQUIRED",
        details: { field: "address" },
        message: "Address is required for ON_SITE.",
        requestId: "req-2",
        status: 400,
      }),
    );
    const user = await renderStep("endereco", stateFixture(onSiteWithoutAddress));
    const addressInput = await screen.findByLabelText("Endereço do seu espaço");
    await user.type(addressInput, "Rua das Flores, 100");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText("Informe o endereço do seu espaço."),
    ).toBeVisible();
    expect(addressInput).toHaveAttribute("aria-invalid", "true");
    expect(addressInput).toHaveAccessibleDescription(
      "Informe o endereço do seu espaço.",
    );
    expect(
      screen.queryByText("Não foi possível salvar esta etapa. Tente novamente."),
    ).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Sair: nome acessível único, sem duplicar com conteúdo gerado por CSS", () => {
  test("o botão Sair é alcançável por um único nome acessível", async () => {
    await renderStep("boas-vindas", emptyState());
    await screen.findByRole("button", { name: "Começar" });
    const exitButtons = screen.getAllByRole("button", { name: "Sair" });
    expect(exitButtons).toHaveLength(1);
    // O texto do botão é um único nó ("Sair"); nada de conteúdo duplicado.
    expect(exitButtons[0].textContent).toBe("Sair");
    // O ícone é decorativo: fora da árvore acessível.
    const icon = exitButtons[0].querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    // Estilo de botão do design system em todas as larguras (QA O-02); a
    // aparência em si é medida no gate autenticado.
    expect(exitButtons[0]).toHaveClass("btn", "btn-secondary");
  });
});

describe("noValidate: nenhuma etapa depende da validação nativa do navegador", () => {
  test("o formulário do onboarding declara noValidate", async () => {
    getOnboarding.mockResolvedValue(emptyState());
    const { container } = render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="segmento-e-nome" />
      </OnboardingRuntimeProvider>,
    );
    await screen.findByLabelText("Como seus clientes conhecem você?");
    const form = container.querySelector("form");
    expect(form?.noValidate).toBe(true);
  });
});
