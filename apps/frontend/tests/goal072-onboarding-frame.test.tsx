// @vitest-environment jsdom
/**
 * Goal072/WU-01 — a moldura do onboarding.
 *
 * O que esta suíte prova, pelo que a pessoa encontra:
 *
 * - "Voltar" é um chevron único no topo de cada etapa com etapa anterior, com
 *   o mesmo destino de sempre, e nenhum "Voltar" fica no rodapé;
 * - na Boas-vindas ele existe inativo (sem href, fora da ordem de Tab); nas
 *   telas de estado do teste real e em `whatsapp-concluido` não existe;
 * - o trilho "Configuração inicial" e a barra segmentada mostram os quatro
 *   capítulos na ordem, com o mesmo capítulo atual e o concluído nomeado;
 * - `importacao` sem `calendarSource` volta para `sistema-atual` sem tocar na
 *   importação.
 *
 * As duas formas de progresso ficam no DOM (uma delas some por CSS), e o
 * jsdom não carrega CSS: por isso cada uma é consultada pelo seu grupo.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
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

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: vi.fn(),
      start: vi.fn(),
    },
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
    setUnauthenticated: vi.fn(),
  }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <div>Painel de conexão do WhatsApp</div>,
}));

import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { OnboardingScenario } from "@/features/onboarding/scenarios";

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

function businessState(
  modalities: Array<"ON_SITE" | "AT_HOME" | "ONLINE">,
): Partial<OnboardingState> {
  return {
    business: {
      address: null,
      category: "Beleza",
      modalities,
      name: "Studio Aurora",
      timezone: "America/Sao_Paulo",
    },
  };
}

function stateFixture(
  overrides: Partial<OnboardingState> = {},
): OnboardingState {
  return { ...emptyState(), ...overrides };
}

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

describe("Voltar é um chevron único no topo, com o destino de sempre", () => {
  const cases: Array<{
    href: string;
    label: string;
    scenario: OnboardingScenario;
    state: OnboardingState;
  }> = [
    {
      href: "/onboarding/boas-vindas",
      label: "segmento-e-nome",
      scenario: "segmento-e-nome",
      state: stateFixture(),
    },
    {
      href: "/onboarding/segmento-e-nome",
      label: "modalidade",
      scenario: "modalidade",
      state: stateFixture(),
    },
    {
      href: "/onboarding/modalidade",
      label: "endereco",
      scenario: "endereco",
      state: stateFixture(businessState(["ON_SITE"])),
    },
    {
      href: "/onboarding/modalidade",
      label: "sistema-atual sem Local próprio",
      scenario: "sistema-atual",
      state: stateFixture(businessState(["ONLINE"])),
    },
    {
      href: "/onboarding/endereco",
      label: "sistema-atual com Local próprio",
      scenario: "sistema-atual",
      state: stateFixture(businessState(["ON_SITE"])),
    },
    {
      href: "/onboarding/sistema-atual",
      label: "quando-importar",
      scenario: "quando-importar",
      state: stateFixture(businessState(["ONLINE"])),
    },
    {
      href: "/onboarding/sistema-atual",
      label: "servico-nome",
      scenario: "servico-nome",
      state: stateFixture({ ...businessState(["ONLINE"]), ...calendarDone }),
    },
    {
      href: "/onboarding/dias-de-atendimento",
      label: "horarios",
      scenario: "horarios",
      state: stateFixture({ ...businessState(["ONLINE"]), ...calendarDone }),
    },
    {
      href: "/onboarding/demonstracao-da-ia",
      label: "tom-da-ia",
      scenario: "tom-da-ia",
      state: stateFixture({ ...businessState(["ONLINE"]), ...calendarDone }),
    },
    {
      href: "/onboarding/whatsapp",
      label: "whatsapp-conectar",
      scenario: "whatsapp-conectar",
      state: stateFixture({ ...businessState(["ONLINE"]), ...calendarDone }),
    },
    {
      href: "/onboarding/contatos-ignorados",
      label: "teste-real",
      scenario: "teste-real",
      state: stateFixture({ ...businessState(["ONLINE"]), ...calendarDone }),
    },
  ];

  test.each(cases)(
    "$label: um link Voltar antes do título, para $href, e nenhum no rodapé",
    async ({ href, scenario, state }) => {
      const { container } = renderStep(scenario, state);
      const heading = await findStepHeading();

      const links = screen.getAllByRole("link", { name: "Voltar" });
      expect(links).toHaveLength(1);
      const [back] = links;
      expect(back).toHaveAttribute("href", href);
      expect(
        back.compareDocumentPosition(heading) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(back.closest(".onboarding-actions")).toBeNull();

      for (const actions of container.querySelectorAll(".onboarding-actions")) {
        expect(
          within(actions as HTMLElement).queryByRole("link", {
            name: /Voltar/,
          }),
        ).toBeNull();
        expect(
          within(actions as HTMLElement).queryByRole("button", {
            name: /Voltar/,
          }),
        ).toBeNull();
      }
    },
  );
});

describe("Voltar inativo na Boas-vindas e ausente nas telas de estado", () => {
  test("boas-vindas: Voltar com aria-disabled, sem href e fora da ordem de Tab", async () => {
    const user = userEvent.setup();
    renderStep("boas-vindas", stateFixture());
    await findStepHeading();

    const back = screen.getByRole("link", { name: "Voltar" });
    expect(back).toHaveAttribute("aria-disabled", "true");
    expect(back).not.toHaveAttribute("href");
    expect(back.tabIndex).toBe(-1);

    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(back).not.toHaveFocus();
    }
  });

  test.each<OnboardingScenario>(["teste-real-sucesso", "whatsapp-concluido"])(
    "%s não tem Voltar",
    async (scenario) => {
      renderStep(
        scenario,
        stateFixture({ ...businessState(["ONLINE"]), ...calendarDone }),
      );
      await findStepHeading();
      expect(screen.queryByRole("link", { name: "Voltar" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
    },
  );
});

describe("progresso: trilho e barra segmentada mostram o mesmo capítulo", () => {
  test("em servico-nome, 'Sua agenda' é o atual e 'Seu negócio' está concluído", async () => {
    renderStep(
      "servico-nome",
      stateFixture({ ...businessState(["ONLINE"]), ...calendarDone }),
    );
    await findStepHeading();

    const rail = screen.getByRole("navigation", {
      name: "Configuração inicial",
    });
    const segments = screen.getByRole("group", {
      name: "Progresso da configuração inicial",
    });

    for (const scope of [rail, segments]) {
      const items = within(scope).getAllByRole("listitem");
      expect(items).toHaveLength(4);
      expect(items[0]).toHaveAccessibleName(/Seu negócio.*concluído/);
      expect(items[1]).toHaveAccessibleName("Sua agenda");
      expect(items[2]).toHaveAccessibleName("Sua IA");
      expect(items[3]).toHaveAccessibleName("WhatsApp");

      const current = items.filter(
        (item) => item.getAttribute("aria-current") === "step",
      );
      expect(current).toEqual([items[1]]);
    }
  });

  test("na Boas-vindas nenhum capítulo é o atual nem está concluído", async () => {
    renderStep("boas-vindas", stateFixture());
    await findStepHeading();

    const items = within(
      screen.getByRole("navigation", { name: "Configuração inicial" }),
    ).getAllByRole("listitem");
    for (const item of items) {
      expect(item).not.toHaveAttribute("aria-current");
      expect(item.getAttribute("aria-label")).not.toMatch(/concluído/);
    }
  });

  test("a etapa importacao, na moldura, usa o mesmo progresso e não ganha chevron", async () => {
    renderStep(
      "importacao",
      stateFixture({ ...businessState(["ONLINE"]), ...calendarDone }),
    );
    await screen.findByRole("heading", {
      level: 1,
      name: "De onde vamos trazer seus dados?",
    });

    const items = within(
      screen.getByRole("navigation", { name: "Configuração inicial" }),
    ).getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).toHaveAccessibleName(/concluído/);
    expect(screen.getByRole("button", { name: "Sair" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Voltar" })).toBeNull();
  });
});

describe("importacao sem calendarSource volta para sistema-atual", () => {
  test("troca a rota e não chama a importação", async () => {
    renderStep("importacao", stateFixture(businessState(["ONLINE"])));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/onboarding/sistema-atual"),
    );
    expect(getImportState).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", {
        level: 1,
        name: "De onde vamos trazer seus dados?",
      }),
    ).toBeNull();
  });

  test("com a fonte gravada, abre a etapa e não troca a rota", async () => {
    renderStep(
      "importacao",
      stateFixture({ ...businessState(["ONLINE"]), ...calendarDone }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "De onde vamos trazer seus dados?",
      }),
    ).toBeVisible();
    expect(getImportState).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
