// @vitest-environment jsdom
/**
 * Goal072/WU-02 — a seleção do onboarding.
 *
 * Provado pelo que a pessoa encontra, não pela cor:
 *
 * - nenhum h1–h6 dentro de <button> ou <label> em `modalidade`,
 *   `sistema-atual`, `tom-da-ia` e `dias-de-atendimento`, e os botões de
 *   `sistema-atual` continuam alcançáveis pelo nome do título;
 * - cada cartão de modalidade tem ícone decorativo e continua um checkbox
 *   nomeado pelo título; marcado, tem a classe de seleção e o ✓;
 * - o chip de segmento selecionado tem `aria-pressed="true"` e o ✓, e
 *   `.segment-chip-row` continua com oito `.chip` (o gate conta essas classes).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: { get: vi.fn(), restart: vi.fn(), start: vi.fn() },
    auth: { logout: vi.fn().mockResolvedValue(undefined) },
    calendar: { connectIntegration: vi.fn() },
    conversations: {
      ignoreByPhone: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      setIgnored: vi.fn(),
    },
    migration: {
      analyzeImport: vi.fn(),
      executeImport: vi.fn(),
      getImportPreview: vi.fn(),
      getImportProgress: vi.fn(),
      getImportState: vi.fn().mockResolvedValue({
        history: null,
        right: { available: true, completedAt: null, sessionId: null },
        session: null,
      }),
      setImportCategorySelection: vi.fn(),
      startImport: vi.fn(),
    },
    onboarding: {
      complete: vi.fn(),
      get: getOnboarding,
      update: vi.fn().mockResolvedValue(undefined),
    },
    status: { get: vi.fn() },
    whatsapp: { get: vi.fn().mockResolvedValue(null) },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn().mockResolvedValue(null),
    setUnauthenticated: vi.fn(),
  }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <div>Painel de conexão do WhatsApp</div>,
}));

import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { OnboardingScenario } from "@/features/onboarding/scenarios";

function stateFixture(
  overrides: Partial<OnboardingState> = {},
): OnboardingState {
  return {
    ai: { tone: null },
    availability: null,
    business: null,
    calendar: { integration: null, source: null, timezone: null },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
    ...overrides,
  };
}

const businessOnline: Partial<OnboardingState> = {
  business: {
    address: null,
    category: "Cabelo",
    modalities: ["ONLINE"],
    name: "Studio Aurora",
    timezone: "America/Sao_Paulo",
  },
};

const calendarDone: Partial<OnboardingState> = {
  calendar: {
    integration: null,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  },
};

function renderStep(scenario: OnboardingScenario, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
}

function headingsInsideControls(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll("h1, h2, h3, h4, h5, h6"),
  ).filter((heading) => heading.closest("button, label"));
}

function hasCheckMark(element: Element) {
  return element.querySelector('use[href$="#i-check"]') !== null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("nenhum heading dentro de botão ou label", () => {
  const cases: Array<{
    scenario: OnboardingScenario;
    state: OnboardingState;
    wait: string;
  }> = [
    { scenario: "modalidade", state: stateFixture(), wait: "Local próprio" },
    {
      scenario: "sistema-atual",
      state: stateFixture(businessOnline),
      wait: "Sim, quero importar",
    },
    {
      scenario: "tom-da-ia",
      state: stateFixture({ ...businessOnline, ...calendarDone }),
      wait: "Equilibrada",
    },
    {
      scenario: "dias-de-atendimento",
      state: stateFixture({ ...businessOnline, ...calendarDone }),
      wait: "Segunda",
    },
  ];

  test.each(cases)(
    "$scenario: os títulos dos cartões são texto, não heading",
    async ({ scenario, state, wait }) => {
      const { container } = renderStep(scenario, state);
      await screen.findByText(wait);
      expect(headingsInsideControls(container)).toEqual([]);
    },
  );

  test("sistema-atual: os botões continuam alcançáveis pelo nome do título", async () => {
    renderStep("sistema-atual", stateFixture(businessOnline));
    expect(
      await screen.findByRole("button", { name: /Sim, quero importar/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Não, começar do zero/ }),
    ).toBeEnabled();
  });
});

describe("modalidade: ícone, indicador e checkbox nomeado pelo título", () => {
  test("cada cartão tem ícone decorativo e um checkbox nomeado pelo título", async () => {
    renderStep("modalidade", stateFixture());
    for (const title of ["Local próprio", "A domicílio", "Online"]) {
      const checkbox = await screen.findByRole("checkbox", {
        name: new RegExp(`^${title}`),
      });
      const card = checkbox.closest("label") as HTMLElement;
      const icon = card.querySelector(".choice-icon svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).not.toHaveAttribute("aria-label");
    }
  });

  test("marcado, o cartão ganha a classe de seleção e o ✓; desmarcado, não", async () => {
    const user = userEvent.setup();
    renderStep("modalidade", stateFixture());
    const checkbox = await screen.findByRole("checkbox", {
      name: /^A domicílio/,
    });
    const card = checkbox.closest("label") as HTMLElement;
    expect(card).not.toHaveClass("is-selected");
    expect(hasCheckMark(card)).toBe(false);

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(card).toHaveClass("is-selected");
    expect(hasCheckMark(card)).toBe(true);
    expect(card.querySelector(".choice-indicator svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    await user.click(checkbox);
    expect(card).not.toHaveClass("is-selected");
    expect(hasCheckMark(card)).toBe(false);
  });
});

describe("segmento: chip selecionado com ✓", () => {
  test("o chip escolhido tem aria-pressed e o ✓; os outros não; continuam oito .chip", async () => {
    const user = userEvent.setup();
    const { container } = renderStep("segmento-e-nome", stateFixture());
    const chip = await screen.findByRole("button", { name: "Barbearia" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(hasCheckMark(chip)).toBe(false);

    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveClass("is-active");
    expect(hasCheckMark(chip)).toBe(true);

    const row = container.querySelector(".segment-chip-row") as HTMLElement;
    expect(row.querySelectorAll(".chip")).toHaveLength(8);
    const marked = within(row)
      .getAllByRole("button")
      .filter((button) => hasCheckMark(button));
    expect(marked).toEqual([chip]);
  });
});
