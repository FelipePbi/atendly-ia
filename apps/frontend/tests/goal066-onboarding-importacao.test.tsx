// @vitest-environment jsdom
/**
 * Goal066/WU-02 — a importação entra no onboarding (U-09).
 *
 * O que esta suíte prova:
 *
 * - a etapa `importacao`, sem sessão, mostra a tela de conectar do módulo de
 *   importação, sem o link "Configurações", sem link que saia do onboarding,
 *   com um `<h1>` só e sem abrir sessão por montar; ela é montada fora de
 *   `ShellConfigProvider`, então qualquer chamada de `useShellConfig` lançaria;
 * - "Importar agora" grava `calendar.source`, relê o onboarding e só então a
 *   etapa `importacao` real é montada e lê o estado da importação;
 * - com sessão viva, a retomada vai a `importacao` e a etapa mostra a fase
 *   da sessão;
 * - com a importação concluída, "Continuar" vai à primeira pendência (vault
 *   §5B), cada uma com o seu aviso;
 * - com falha na leitura do estado da importação, a retomada segue a regra
 *   sem importação;
 * - `/importacao` continua com o link "Configurações" e registrando o shell.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ImportHistory,
  ImportLiveSession,
  ImportProgress,
  ImportState,
  OnboardingState,
} from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const refreshSession = vi.fn();
const getImportState = vi.fn();
const getImportProgress = vi.fn();
const startImport = vi.fn();
const connectIntegration = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn().mockResolvedValue(undefined) },
    calendar: { connectIntegration },
    migration: {
      analyzeImport: vi.fn(),
      executeImport: vi.fn(),
      getImportPreview: vi.fn(),
      getImportProgress,
      getImportState,
      setImportCategorySelection: vi.fn(),
      startImport,
    },
    onboarding: { get: getOnboarding, update: updateOnboarding },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

import {
  nextRequiredStep,
  OnboardingResume,
  OnboardingRuntimeProvider,
} from "@/features/onboarding/OnboardingRuntime";
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
const calendarDone: Partial<OnboardingState> = {
  calendar: {
    integration: null,
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
  },
};
const serviceDone: Partial<OnboardingState> = {
  service: {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 60,
    id: "svc-1",
    name: "Corte",
    needsReview: false,
    price: 100,
    priceType: "FIXED",
  },
};
const availabilityDone: Partial<OnboardingState> = {
  availability: {
    customerChangeMinNoticeMinutes: 0,
    granularityMinutes: 30,
    maxLeadDays: 90,
    minLeadMinutes: 0,
    rules: [
      {
        active: true,
        dayOfWeek: 1,
        endTime: "18:00",
        id: "rule-1",
        startTime: "09:00",
      },
    ],
    timezone: "America/Sao_Paulo",
  },
};

function availableImportState(): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: null },
    session: null,
  };
}

function sessionFixture(
  overrides: Partial<ImportLiveSession> = {},
): ImportLiveSession {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 12, skipped: 0 },
    createdAt: "2026-09-15T10:00:00.000Z",
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewGeneratedAt: null,
    previewVersion: 1,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: "2026-09-15T10:00:00.000Z",
    status: "PARTIAL",
    ...overrides,
  };
}

function progressFixture(): ImportProgress {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 12, skipped: 0 },
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
  };
}

function historyFixture(): ImportHistory {
  return {
    categories: [],
    completedAt: "2026-09-15T12:00:00.000Z",
    completedBy: "user-1",
    counts: { failed: 0, imported: 386, needsReview: 0, pending: 0, skipped: 0 },
    finishedAt: "2026-09-15T12:00:00.000Z",
    pendingAcceptance: null,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: "2026-09-15T10:00:00.000Z",
    status: "COMPLETED",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
  refreshSession.mockResolvedValue(null);
  getImportState.mockResolvedValue(availableImportState());
  getImportProgress.mockResolvedValue(progressFixture());
});

/** Monta a etapa pela mesma árvore do app (provider do onboarding), sem
 * `ShellConfigProvider`: o onboarding não está dentro do shell. */
function renderStep(scenario: OnboardingScenario, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
}

function expectOnlyOnboardingLinks(container: HTMLElement) {
  for (const link of container.querySelectorAll("a")) {
    expect(link.getAttribute("href") ?? "").toMatch(/^\/onboarding(\/|$)/);
  }
}

describe("importacao sem sessão: a tela de conectar, na moldura do onboarding", () => {
  test("mostra a tela de conectar do módulo, sem o link Configurações e com um <h1> só", async () => {
    const { container } = renderStep(
      "importacao",
      stateFixture({ ...businessDone, ...calendarDone }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Importar do Minha Agenda",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Entre no Minha Agenda" }),
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Configurações/ })).toBeNull();
    expectOnlyOnboardingLinks(container);
    // A moldura é a do onboarding: bloco e "Sair".
    expect(screen.getByText("Sua agenda")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sair" })).toBeVisible();
  });

  test("montar a etapa só lê o estado da importação, sem abrir sessão", async () => {
    renderStep("importacao", stateFixture({ ...businessDone, ...calendarDone }));
    await screen.findByRole("heading", {
      level: 1,
      name: "Importar do Minha Agenda",
    });
    expect(getImportState).toHaveBeenCalledTimes(1);
    expect(startImport).not.toHaveBeenCalled();
    expect(connectIntegration).not.toHaveBeenCalled();
  });
});

describe("'Importar agora' grava calendar.source antes de montar a importação", () => {
  test("PATCH, depois a releitura do onboarding, depois a etapa importacao real lê o estado da importação", async () => {
    getOnboarding.mockResolvedValue(stateFixture(businessDone));
    // A navegação do app, com a mesma árvore: `push` troca a etapa montada.
    function Harness() {
      const [step, setStep] = useState<OnboardingScenario>("quando-importar");
      push.mockImplementation((href: string) => {
        setStep(href.replace("/onboarding/", "") as OnboardingScenario);
      });
      return <OnboardingScreen scenario={step} />;
    }
    const user = userEvent.setup();
    render(
      <OnboardingRuntimeProvider>
        <Harness />
      </OnboardingRuntimeProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Importar agora" }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Importar do Minha Agenda",
      }),
    ).toBeVisible();
    expect(updateOnboarding).toHaveBeenCalledWith({
      calendar: { source: "ATENDLY", timezone: "America/Sao_Paulo" },
    });
    expect(push).toHaveBeenCalledWith("/onboarding/importacao");

    const patchAt = updateOnboarding.mock.invocationCallOrder[0];
    // A primeira leitura é a do provider ao montar; a segunda, a releitura
    // depois do PATCH.
    const refreshAt = getOnboarding.mock.invocationCallOrder[1];
    const pushAt = push.mock.invocationCallOrder[0];
    const importReadAt = getImportState.mock.invocationCallOrder[0];
    expect(patchAt).toBeLessThan(refreshAt);
    expect(refreshAt).toBeLessThan(pushAt);
    expect(pushAt).toBeLessThan(importReadAt);
  });
});

describe("sessão viva: a retomada volta à importação, na fase da sessão", () => {
  test("nextRequiredStep devolve importacao com calendar.source, sem serviço e com sessão viva", () => {
    expect(
      nextRequiredStep(stateFixture({ ...businessDone, ...calendarDone }), {
        history: null,
        right: { available: false, completedAt: null, sessionId: "session-1" },
        session: sessionFixture(),
      }),
    ).toBe("importacao");
  });

  test("OnboardingResume lê a importação e leva a /onboarding/importacao", async () => {
    getOnboarding.mockResolvedValue(
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    getImportState.mockResolvedValue({
      history: null,
      right: { available: false, completedAt: null, sessionId: "session-1" },
      session: sessionFixture(),
    });
    render(
      <OnboardingRuntimeProvider>
        <OnboardingResume />
      </OnboardingRuntimeProvider>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/onboarding/importacao"),
    );
    expect(replace).toHaveBeenCalledTimes(1);
  });

  test("a etapa importacao mostra a fase da sessão viva, sem o link Configurações", async () => {
    getImportState.mockResolvedValue({
      history: null,
      right: { available: false, completedAt: null, sessionId: "session-1" },
      session: sessionFixture(),
    });
    const { container } = renderStep(
      "importacao",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Continuar importação",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Configurações/ })).toBeNull();
    expectOnlyOnboardingLinks(container);
    expect(startImport).not.toHaveBeenCalled();
  });
});

describe("importação concluída: 'Continuar' vai à primeira pendência (vault §5B)", () => {
  const historyState: ImportState = {
    history: historyFixture(),
    right: { available: false, completedAt: "2026-09-15T12:00:00.000Z", sessionId: null },
    session: null,
  };

  test.each([
    {
      expected: "/onboarding/servico-nome",
      label: "sem serviço ativo, vai a servico-nome",
      notice:
        "Nenhum serviço importado está ativo. Cadastre pelo menos um serviço para continuar.",
      state: stateFixture({ ...businessDone, ...calendarDone }),
    },
    {
      expected: "/onboarding/dias-de-atendimento",
      label: "sem horário ativo, vai a dias-de-atendimento",
      notice:
        "A importação não trouxe seus horários de atendimento. Informe os dias e horários em que você atende.",
      state: stateFixture({ ...businessDone, ...calendarDone, ...serviceDone }),
    },
    {
      expected: "/onboarding/demonstracao-da-ia",
      label: "sem pendência, vai a demonstracao-da-ia",
      notice:
        "Seus serviços e horários foram importados. Agora é só ver sua IA em ação.",
      state: stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...availabilityDone,
      }),
    },
  ])("$label, com o seu aviso", async ({ expected, notice, state }) => {
    getImportState.mockResolvedValue(historyState);
    const user = userEvent.setup();
    const { container } = renderStep("importacao", state);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Importação concluída" }),
    ).toBeVisible();
    expect(await screen.findByText(notice)).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Configurações/ })).toBeNull();
    expectOnlyOnboardingLinks(container);

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith(expected);
    expect(push).toHaveBeenCalledTimes(1);
  });

  test("a retomada com importação concluída e sem serviço ativo segue a mesma ordem: servico-nome", async () => {
    getOnboarding.mockResolvedValue(
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    getImportState.mockResolvedValue(historyState);
    render(
      <OnboardingRuntimeProvider>
        <OnboardingResume />
      </OnboardingRuntimeProvider>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/onboarding/servico-nome"),
    );
  });
});

describe("falha na leitura do estado da importação não bloqueia a retomada", () => {
  test("a retomada vai à etapa da regra sem importação (servico-nome), sem mensagem de erro", async () => {
    getOnboarding.mockResolvedValue(
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    getImportState.mockRejectedValue(new Error("network"));
    render(
      <OnboardingRuntimeProvider>
        <OnboardingResume />
      </OnboardingRuntimeProvider>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/onboarding/servico-nome"),
    );
    expect(
      screen.queryByText("Não foi possível retomar sua configuração."),
    ).toBeNull();
  });

  test("antes de calendar.source, a retomada nem lê a importação", async () => {
    getOnboarding.mockResolvedValue(stateFixture(businessDone));
    render(
      <OnboardingRuntimeProvider>
        <OnboardingResume />
      </OnboardingRuntimeProvider>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/onboarding/sistema-atual"),
    );
    expect(getImportState).not.toHaveBeenCalled();
  });
});

describe("/importacao não muda", () => {
  test("mantém o link Configurações e registra o shell da plataforma", async () => {
    const { ImportsScreen } = await import("@/features/imports/ImportsScreen");
    const { ShellConfigProvider, useShellConfigValue } = await import(
      "@/shared/layout/ShellConfig"
    );
    function ShellProbe() {
      const config = useShellConfigValue();
      return (
        <output data-testid="shell">
          {config ? `${config.active}|${config.title}|${config.module}` : ""}
        </output>
      );
    }
    render(
      <ShellConfigProvider>
        <ShellProbe />
        <ImportsScreen />
      </ShellConfigProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Importar do Minha Agenda",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Configurações/ })).toHaveAttribute(
      "href",
      "/configuracoes",
    );
    await waitFor(() =>
      expect(screen.getByTestId("shell")).toHaveTextContent(
        "importacao|Importação|migration",
      ),
    );
  });
});
