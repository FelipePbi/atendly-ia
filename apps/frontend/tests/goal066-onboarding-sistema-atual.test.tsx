// @vitest-environment jsdom
/**
 * Goal066/WU-01 — "sistema-atual" e "quando-importar" substituem
 * "fonte-da-agenda", "agenda-atendly-confirmar" e "agenda-atendly-metodo"
 * (QA O-17, O-18, O-19, O-22). As três rotas antigas redirecionam para
 * "sistema-atual" (mesmo mecanismo de `legacyStepRedirects` do Goal065).
 * "Sim, quero importar" só navega; "Importar agora", "Fazer depois" e "Não,
 * começar do zero" gravam `calendar.source` e só avançam com 200 (evidência
 * 5 do Goal066: a importação exige `calendarSettings`).
 *
 * Também prova a observação 5 do review065: um dia personalizado só no
 * início (ou só no fim) acompanha o intervalo-base no campo não
 * personalizado, mesmo depois de o intervalo-base mudar.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (href: string): void => {
    redirectMock(href);
  },
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

function stateFixture(
  overrides: Partial<OnboardingState> = {},
): OnboardingState {
  return { ...emptyState(), ...overrides };
}

const businessDone: Partial<OnboardingState> = {
  business: {
    address: null,
    category: "Beleza",
    modalities: ["ONLINE"],
    name: "Studio Aurora",
    timezone: "America/Sao_Paulo",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
  refreshSession.mockResolvedValue(null);
});

async function renderStep(scenario: string, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  const user = userEvent.setup();
  const { OnboardingScreen } = await import(
    "@/features/onboarding/OnboardingScreen"
  );
  const { OnboardingRuntimeProvider } = await import(
    "@/features/onboarding/OnboardingRuntime"
  );
  render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario as never} />
    </OnboardingRuntimeProvider>,
  );
  return user;
}

describe("as três rotas antigas redirecionam para sistema-atual", () => {
  test.each([
    "fonte-da-agenda",
    "agenda-atendly-confirmar",
    "agenda-atendly-metodo",
  ])("%s redireciona para /onboarding/sistema-atual", async (step) => {
    const OnboardingPage = (await import("@/app/onboarding/[step]/page"))
      .default;
    await OnboardingPage({ params: Promise.resolve({ step }) });
    expect(redirectMock).toHaveBeenCalledWith("/onboarding/sistema-atual");
  });

  test("as três rotas antigas não existem mais como cenário válido", async () => {
    const { isOnboardingScenario } = await import(
      "@/features/onboarding/scenarios"
    );
    expect(isOnboardingScenario("fonte-da-agenda")).toBe(false);
    expect(isOnboardingScenario("agenda-atendly-confirmar")).toBe(false);
    expect(isOnboardingScenario("agenda-atendly-metodo")).toBe(false);
  });
});

describe("sistema-atual: dois cards de ação, sem marcação e sem Continuar", () => {
  // O clique real de "Continuar" em modalidade e em endereco, levando a
  // sistema-atual, é provado em goal065-onboarding-business.test.tsx
  // ("sem Local próprio, grava e avança direto para sistema-atual" e
  // "preenchido, grava com o endereço e avança para sistema-atual"). Aqui, a
  // retomada: a próxima etapa pendente depois do negócio.
  test("a retomada depois do negócio (sem ON_SITE, ou com ON_SITE e endereço) vai a sistema-atual", async () => {
    const { nextRequiredStep } = await import(
      "@/features/onboarding/OnboardingRuntime"
    );
    expect(nextRequiredStep(stateFixture(businessDone))).toBe(
      "sistema-atual",
    );
    expect(
      nextRequiredStep(
        stateFixture({
          business: {
            address: "Rua das Flores, 100",
            category: "Beleza",
            modalities: ["ON_SITE"],
            name: "Studio Aurora",
            timezone: "America/Sao_Paulo",
          },
        }),
      ),
    ).toBe("sistema-atual");
  });

  test("mostra a pergunta do vault e os dois cards, nenhum marcado, sem aria-pressed e sem ✓", async () => {
    await renderStep("sistema-atual", stateFixture(businessDone));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Você já usa algum sistema para organizar seus clientes e agendamentos?",
      }),
    ).toBeVisible();

    const importCard = screen.getByRole("button", {
      name: /Sim, quero importar/,
    });
    const scratchCard = screen.getByRole("button", {
      name: /Não, começar do zero/,
    });
    expect(importCard).not.toHaveAttribute("aria-pressed");
    expect(scratchCard).not.toHaveAttribute("aria-pressed");
    expect(importCard.className).not.toContain("is-selected");
    expect(scratchCard.className).not.toContain("is-selected");
    // Sem ✓ de seleção: o cartão só leva o ícone decorativo do quadro 2.1
    // (Goal089), nunca o de marcação (QA O-22 fecha por construção, não por
    // CSS escondendo o ícone).
    expect(importCard.querySelector('use[href$="#i-check"]')).toBeNull();
    expect(scratchCard.querySelector('use[href$="#i-check"]')).toBeNull();
  });

  test("não oferece Continuar", async () => {
    await renderStep("sistema-atual", stateFixture(businessDone));
    await screen.findByRole("button", { name: /Sim, quero importar/ });
    expect(
      screen.queryByRole("button", { name: "Continuar" }),
    ).toBeNull();
  });

  test("Voltar aponta para modalidade sem ON_SITE", async () => {
    await renderStep("sistema-atual", stateFixture(businessDone));
    expect(
      await screen.findByRole("link", { name: "Voltar" }),
    ).toHaveAttribute("href", "/onboarding/modalidade");
  });

  test("Voltar aponta para endereco com ON_SITE", async () => {
    await renderStep(
      "sistema-atual",
      stateFixture({
        business: {
          address: "Rua das Flores, 100",
          category: "Beleza",
          modalities: ["ON_SITE"],
          name: "Studio Aurora",
          timezone: "America/Sao_Paulo",
        },
      }),
    );
    expect(
      await screen.findByRole("link", { name: "Voltar" }),
    ).toHaveAttribute("href", "/onboarding/endereco");
  });

  test("'Sim, quero importar' só navega para quando-importar, sem gravar nada", async () => {
    const user = await renderStep("sistema-atual", stateFixture(businessDone));
    await user.click(
      await screen.findByRole("button", { name: /Sim, quero importar/ }),
    );
    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/quando-importar");
  });

  test("'Não, começar do zero' grava calendar.source e só avança para servico-nome com 200", async () => {
    const user = await renderStep("sistema-atual", stateFixture(businessDone));
    await user.click(
      await screen.findByRole("button", { name: /Não, começar do zero/ }),
    );

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        calendar: { source: "ATENDLY", timezone: "America/Sao_Paulo" },
      }),
    );
    expect(push).toHaveBeenCalledWith("/onboarding/servico-nome");
  });

  test("enquanto a gravação não volta, os dois cards ficam desabilitados e um segundo clique não grava de novo", async () => {
    updateOnboarding.mockReturnValue(new Promise(() => undefined));
    const user = await renderStep("sistema-atual", stateFixture(businessDone));
    const scratchCard = await screen.findByRole("button", {
      name: /Não, começar do zero/,
    });
    await user.click(scratchCard);

    await waitFor(() => expect(scratchCard).toBeDisabled());
    expect(
      screen.getByRole("button", { name: /Sim, quero importar/ }),
    ).toBeDisabled();
    await user.click(scratchCard);
    expect(updateOnboarding).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  test("'Não, começar do zero' com falha no PATCH fica na etapa, com o erro de tela, sem avançar", async () => {
    updateOnboarding.mockRejectedValue(new Error("network"));
    const user = await renderStep("sistema-atual", stateFixture(businessDone));
    await user.click(
      await screen.findByRole("button", { name: /Não, começar do zero/ }),
    );

    expect(
      await screen.findByText(
        "Algo deu errado do nosso lado e esta etapa não foi salva. Tente de novo em alguns instantes.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  test("nenhuma etapa do bloco mostra fuso horário, 'Fonte oficial' ou 'Agenda Atendly' como escolha", async () => {
    await renderStep("sistema-atual", stateFixture(businessDone));
    await screen.findByRole("button", { name: /Sim, quero importar/ });
    expect(screen.queryByText(/America\//)).toBeNull();
    expect(screen.queryByText("Fonte oficial")).toBeNull();
    expect(screen.queryByText(/Agenda Atendly cuidará/)).toBeNull();
  });

  test("servicePopulation e o aviso antigo de importação saíram do rascunho e da tela", async () => {
    await renderStep("sistema-atual", stateFixture(businessDone));
    await screen.findByRole("button", { name: /Sim, quero importar/ });
    expect(
      screen.queryByText(/A importação acontece depois, em Configurações/),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Importar do Minha Agenda/ }),
    ).toBeNull();
  });
});

const calendarDone = {
  calendar: {
    integration: null,
    source: "ATENDLY" as const,
    timezone: "America/Sao_Paulo",
  },
};

describe("quando-importar: Importar agora / Fazer depois gravam calendar.source", () => {
  test("mostra 'Quer importar agora?' e o texto sobre Mais › Importação", async () => {
    await renderStep(
      "quando-importar",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Quer importar agora?",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Se fizer depois, a importação fica em Mais › Importação.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Configurações → Agenda/)).toBeNull();
    expect(screen.queryByText("Fonte oficial")).toBeNull();
    expect(screen.queryByText(/America\//)).toBeNull();
  });

  test("Voltar aponta para sistema-atual", async () => {
    await renderStep(
      "quando-importar",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    expect(
      await screen.findByRole("link", { name: "Voltar" }),
    ).toHaveAttribute("href", "/onboarding/sistema-atual");
  });

  // A ordem PATCH → releitura → montagem da etapa importacao real é provada
  // em goal066-onboarding-importacao.test.tsx.
  test("'Importar agora' grava calendar.source e navega para importacao, só com 200", async () => {
    const user = await renderStep(
      "quando-importar",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Importar agora" }),
    );

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        calendar: { source: "ATENDLY", timezone: "America/Sao_Paulo" },
      }),
    );
    expect(push).toHaveBeenCalledWith("/onboarding/importacao");
  });

  test("'Importar agora' com falha no PATCH fica na etapa, sem avançar", async () => {
    updateOnboarding.mockRejectedValue(new Error("network"));
    const user = await renderStep(
      "quando-importar",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Importar agora" }),
    );

    expect(
      await screen.findByText(
        "Algo deu errado do nosso lado e esta etapa não foi salva. Tente de novo em alguns instantes.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  test("'Fazer depois' grava calendar.source e só avança para servico-nome com 200", async () => {
    const user = await renderStep(
      "quando-importar",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Fazer depois" }),
    );

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        calendar: { source: "ATENDLY", timezone: "America/Sao_Paulo" },
      }),
    );
    expect(push).toHaveBeenCalledWith("/onboarding/servico-nome");
  });

  test("'Fazer depois' com falha no PATCH fica na etapa, sem avançar", async () => {
    updateOnboarding.mockRejectedValue(new Error("network"));
    const user = await renderStep(
      "quando-importar",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Fazer depois" }),
    );

    expect(
      await screen.findByText(
        "Algo deu errado do nosso lado e esta etapa não foi salva. Tente de novo em alguns instantes.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });
});

function availabilityFixture(
  rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
): NonNullable<OnboardingState["availability"]> {
  return {
    customerChangeMinNoticeMinutes: 0,
    granularityMinutes: 30,
    maxLeadDays: 90,
    minLeadMinutes: 0,
    rules: rules.map((rule) => ({
      ...rule,
      active: true,
      id: `rule-${rule.dayOfWeek}`,
    })),
    timezone: "America/Sao_Paulo",
  };
}

describe("horários: personalizar só o início (ou só o fim) não congela o outro campo (review065, observação 5)", () => {
  test("personalizar só o início e depois mudar o fim do intervalo-base grava o fim novo para aquele dia", async () => {
    const user = await renderStep(
      "horarios",
      stateFixture({
        availability: availabilityFixture(
          [1, 2, 3, 4, 5].map((dayOfWeek) => ({
            dayOfWeek,
            endTime: "18:00",
            startTime: "09:00",
          })),
        ),
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Personalizar dias diferentes" }),
    );
    const mondayStart = screen.getByLabelText("Segunda · Início");
    await user.clear(mondayStart);
    await user.type(mondayStart, "08:00");

    // O fim do intervalo-base muda depois da personalização do início.
    const end = screen.getByLabelText("Termina");
    await user.clear(end);
    await user.type(end, "19:00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { availability: { rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }> } },
    ];
    const monday = patch.availability.rules.find((rule) => rule.dayOfWeek === 1);
    // Antes desta correção, o fim de segunda ficaria congelado em "18:00".
    expect(monday).toEqual({
      active: true,
      dayOfWeek: 1,
      endTime: "19:00",
      startTime: "08:00",
    });
  });

  test("personalizar só o fim e depois mudar o início do intervalo-base grava o início novo para aquele dia", async () => {
    const user = await renderStep(
      "horarios",
      stateFixture({
        availability: availabilityFixture(
          [1, 2, 3, 4, 5].map((dayOfWeek) => ({
            dayOfWeek,
            endTime: "18:00",
            startTime: "09:00",
          })),
        ),
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Personalizar dias diferentes" }),
    );
    const fridayEnd = screen.getByLabelText("Sexta · Fim");
    await user.clear(fridayEnd);
    await user.type(fridayEnd, "20:00");

    // O início do intervalo-base muda depois da personalização do fim.
    const start = screen.getByLabelText("Começa");
    await user.clear(start);
    await user.type(start, "10:00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { availability: { rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }> } },
    ];
    const friday = patch.availability.rules.find((rule) => rule.dayOfWeek === 5);
    // Antes desta correção, o início de sexta ficaria congelado em "09:00".
    expect(friday).toEqual({
      active: true,
      dayOfWeek: 5,
      endTime: "20:00",
      startTime: "10:00",
    });
  });
});
