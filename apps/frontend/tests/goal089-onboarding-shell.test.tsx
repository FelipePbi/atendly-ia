// @vitest-environment jsdom
/**
 * Goal089/WU-03 — a casca do onboarding igual ao protótipo.
 *
 * O que esta suíte prova, pelo que a pessoa encontra:
 *
 * 1. nenhuma etapa renderiza barra superior: a marca aparece só dentro da
 *    sidebar "Configuração inicial", e "Sair" não está num `header` de barra
 *    (vale para `OnboardingShell` e para `OnboardingFrame`);
 * 2. o progresso tem quatro itens, o atual tem preenchimento parcial que cresce
 *    de uma etapa para a seguinte, e a Boas-vindas não tem barra;
 * 3. o stepper da sidebar mostra ✓ no concluído e número nos demais;
 * 4. o eyebrow do capítulo fica fora do `header` do título e a descrição vem
 *    logo depois do H1;
 * 5. "Sair" tem um único nome acessível e faz logout nas duas molduras.
 *
 * Largura, altura e CTA ancorado dependem de layout: jsdom não os alcança, e
 * quem decide isso é G-6 em `e2e/authenticated-matrix.spec.ts`.
 */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ActivationTestRun, OnboardingState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const getImportState = vi.fn();
const getActivationTest = vi.fn();
const getWhatsapp = vi.fn();
const getStatus = vi.fn();
const logout = vi.fn();
const setUnauthenticated = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: vi.fn(),
      start: vi.fn(),
    },
    auth: { logout },
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
      getImportState,
      setImportCategorySelection: vi.fn(),
      startImport: vi.fn(),
    },
    onboarding: {
      complete: vi.fn(),
      get: getOnboarding,
      update: vi.fn().mockResolvedValue(undefined),
    },
    status: { get: getStatus },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn().mockResolvedValue(null),
    setUnauthenticated,
  }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <div>Painel de conexão do WhatsApp</div>,
}));

import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import {
  type OnboardingScenario,
  onboardingScenarios,
} from "@/features/onboarding/scenarios";

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

const businessOnSite: Partial<OnboardingState> = {
  business: {
    address: null,
    category: "Beleza",
    modalities: ["ON_SITE"],
    name: "Studio Aurora",
    timezone: "America/Sao_Paulo",
  },
};

const calendarDone: Partial<OnboardingState> = {
  calendar: {
    integration: null,
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
  },
};

const succeededRun: ActivationTestRun = {
  appointmentId: null,
  attempts: 1,
  channelId: "channel-1",
  cleanupAt: null,
  cleanupResidue: [],
  cleanupState: "CLEAN",
  completedStep: null,
  currentStep: null,
  failedStep: null,
  failedStepLabel: null,
  failureCode: null,
  finishedAt: "2026-09-14T12:05:00.000Z",
  id: "run-1",
  maxAttempts: 3,
  milestones: [],
  pausedAt: null,
  startedAt: "2026-09-14T12:00:00.000Z",
  state: "SUCCEEDED",
  supersededByChannelChange: false,
  terminal: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  logout.mockResolvedValue(undefined);
  getImportState.mockResolvedValue({
    history: null,
    right: { available: true, completedAt: null, sessionId: null },
    session: null,
  });
  getActivationTest.mockResolvedValue(succeededRun);
  getWhatsapp.mockResolvedValue(null);
  getStatus.mockResolvedValue({
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "CONVERGED",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: { checkedAt: "2026-09-14T12:06:00.000Z", state: "CONNECTED" },
  });
});

function renderStep(scenario: OnboardingScenario, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
}

async function findStepHeading() {
  return screen.findByRole("heading", { level: 1 });
}

const progressGroupName = "Progresso da configuração inicial";

function sidebar() {
  return screen.getByRole("navigation", { name: "Configuração inicial" });
}

const shellCases: Array<{
  label: string;
  scenario: OnboardingScenario;
  state: OnboardingState;
}> = [
  { label: "boas-vindas", scenario: "boas-vindas", state: stateFixture() },
  {
    label: "segmento-e-nome",
    scenario: "segmento-e-nome",
    state: stateFixture(),
  },
  { label: "modalidade", scenario: "modalidade", state: stateFixture() },
  {
    label: "tom-da-ia",
    scenario: "tom-da-ia",
    state: stateFixture({ ...businessDone, ...calendarDone }),
  },
  {
    label: "whatsapp-conectar",
    scenario: "whatsapp-conectar",
    state: stateFixture({ ...businessDone, ...calendarDone }),
  },
];

const frameCase = {
  label: "importacao (OnboardingFrame)",
  scenario: "importacao" as OnboardingScenario,
  state: stateFixture({ ...businessDone, ...calendarDone }),
};

describe("1. nenhuma etapa renderiza barra superior", () => {
  test.each([...shellCases, frameCase])(
    "$label: a marca só existe dentro da sidebar e Sair não está num header",
    async ({ scenario, state }) => {
      const { container } = renderStep(scenario, state);
      await findStepHeading();

      const brands = screen.getAllByRole("link", { name: /Atendly/ });
      expect(brands).toHaveLength(1);
      expect(sidebar()).toContainElement(brands[0]);
      expect(brands[0].closest("header")).toBeNull();

      const exit = screen.getByRole("button", { name: "Sair" });
      expect(exit.closest("header")).toBeNull();
      expect(exit.closest("nav")).toBeNull();

      for (const header of container.querySelectorAll("header")) {
        expect(within(header).queryByRole("link", { name: /Atendly/ })).toBeNull();
        expect(within(header).queryByRole("button", { name: "Sair" })).toBeNull();
      }
    },
  );
});

describe("2. progresso parcial do capítulo atual", () => {
  function progressItems() {
    return within(screen.getByRole("group", { name: progressGroupName })).getAllByRole(
      "listitem",
    );
  }

  function fillOf(item: HTMLElement): number {
    const fill = item.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(fill, "o segmento atual não tem preenchimento").not.toBeNull();
    const width = fill?.style.width ?? "";
    expect(width).toMatch(/^\d+(\.\d+)?%$/);
    return Number.parseFloat(width);
  }

  test("segmento-e-nome, modalidade e endereco: quatro itens, o atual com preenchimento parcial que cresce", async () => {
    const steps: Array<{ scenario: OnboardingScenario; state: OnboardingState }> = [
      { scenario: "segmento-e-nome", state: stateFixture() },
      { scenario: "modalidade", state: stateFixture() },
      { scenario: "endereco", state: stateFixture(businessOnSite) },
    ];
    const fills: number[] = [];
    for (const { scenario, state } of steps) {
      renderStep(scenario, state);
      await findStepHeading();

      const items = progressItems();
      expect(items).toHaveLength(4);
      expect(items[0]).toHaveAttribute("aria-current", "step");
      expect(items.filter((item) => item.getAttribute("aria-current") === "step")).toEqual([
        items[0],
      ]);
      const fill = fillOf(items[0]);
      expect(fill).toBeGreaterThan(0);
      expect(fill).toBeLessThan(100);
      fills.push(fill);
      cleanup();
    }
    expect(fills[1]).toBeGreaterThan(fills[0]);
    expect(fills[2]).toBeGreaterThan(fills[1]);
  });

  test("tom-da-ia: os dois primeiros concluídos e o terceiro é o atual", async () => {
    renderStep("tom-da-ia", stateFixture({ ...businessDone, ...calendarDone }));
    await findStepHeading();

    const items = progressItems();
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveAccessibleName("Seu negócio, concluído");
    expect(items[1]).toHaveAccessibleName("Sua agenda, concluído");
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[2]).toHaveAccessibleName("Sua IA");
    expect(items[3]).not.toHaveAttribute("aria-current");
    const fill = fillOf(items[2]);
    expect(fill).toBeGreaterThan(0);
    expect(fill).toBeLessThan(100);
  });

  test("boas-vindas: o grupo de progresso não existe", async () => {
    renderStep("boas-vindas", stateFixture());
    await findStepHeading();
    expect(screen.queryByRole("group", { name: progressGroupName })).toBeNull();
  });
});

describe("3. stepper da sidebar", () => {
  function stepperItems() {
    return within(sidebar()).getAllByRole("listitem");
  }

  function marker(item: HTMLElement): HTMLElement {
    return item.firstElementChild as HTMLElement;
  }

  test("tom-da-ia: ✓ no concluído, número no atual e no pendente", async () => {
    renderStep("tom-da-ia", stateFixture({ ...businessDone, ...calendarDone }));
    await findStepHeading();

    const items = stepperItems();
    expect(items).toHaveLength(4);
    for (const index of [0, 1]) {
      expect(items[index].getAttribute("aria-label")).toMatch(/, concluído$/);
      expect(marker(items[index]).querySelector("use")?.getAttribute("href")).toMatch(
        /#i-check$/,
      );
      expect(marker(items[index]).textContent?.trim()).toBe("");
    }
    expect(items[0]).toHaveAccessibleName("Seu negócio, concluído");
    expect(items[1]).toHaveAccessibleName("Sua agenda, concluído");

    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[2]).toHaveAccessibleName("Sua IA");
    expect(marker(items[2]).textContent?.trim()).toBe("3");
    expect(marker(items[2]).querySelector("svg")).toBeNull();

    expect(items[3]).not.toHaveAttribute("aria-current");
    expect(marker(items[3]).textContent?.trim()).toBe("4");
    expect(marker(items[3]).querySelector("svg")).toBeNull();
  });

  test("boas-vindas: nenhum item é o atual e todos mostram número", async () => {
    renderStep("boas-vindas", stateFixture());
    await findStepHeading();

    const items = stepperItems();
    expect(items).toHaveLength(4);
    items.forEach((item, index) => {
      expect(item).not.toHaveAttribute("aria-current");
      expect(item.getAttribute("aria-label")).not.toMatch(/concluído/);
      expect(marker(item).textContent?.trim()).toBe(String(index + 1));
    });
  });
});

describe("4. eyebrow e descrição do título", () => {
  test.each<{
    scenario: OnboardingScenario;
    state: OnboardingState;
  }>([
    { scenario: "segmento-e-nome", state: stateFixture() },
    {
      scenario: "tom-da-ia",
      state: stateFixture({ ...businessDone, ...calendarDone }),
    },
  ])(
    "$scenario: eyebrow fora do header do título e descrição colada ao H1",
    async ({ scenario, state }) => {
      renderStep(scenario, state);
      const heading = await findStepHeading();
      const [eyebrowText, , descriptionText] = onboardingScenarios[scenario];

      const titleHeader = heading.closest("header");
      expect(titleHeader).not.toBeNull();

      const eyebrows = screen
        .getAllByText(eyebrowText)
        .filter(
          (element) =>
            !element.closest("nav") &&
            !element.closest(`[role="group"]`) &&
            element.tagName === "P",
        );
      expect(eyebrows).toHaveLength(1);
      const [eyebrow] = eyebrows;
      expect(titleHeader).not.toContainElement(eyebrow);
      expect(
        eyebrow.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      const description = screen.getByText(descriptionText);
      expect(heading.nextElementSibling).toBe(description);
    },
  );
});

describe("5. Sair: um único nome acessível e logout nas duas molduras", () => {
  test.each([shellCases[1], frameCase])(
    "$label: um botão Sair que faz logout e volta ao login",
    async ({ scenario, state }) => {
      const user = userEvent.setup();
      renderStep(scenario, state);
      await findStepHeading();

      const exits = screen.getAllByRole("button", { name: /Sair/ });
      expect(exits).toHaveLength(1);
      expect(exits[0]).toHaveAccessibleName("Sair");

      await user.click(exits[0]);
      await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
      expect(setUnauthenticated).toHaveBeenCalledTimes(1);
    },
  );
});
