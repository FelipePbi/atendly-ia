// @vitest-environment jsdom
/**
 * Goal105 — Importação igual ao protótipo (I1, I2 e 2.I1).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. I2 e entrada: em `/importacao`, sem histórico e sem sessão, a tela é a
 *    entrada (ilustração, texto, "Importar do Minha Agenda" e a nota), sem
 *    campo de credencial; o botão mostra a origem sem pedido novo;
 *    "Continuar" mostra o formulário; enviar chama `connectIntegration` e
 *    `startImport` uma vez cada.
 * 2. Origem (2.I1): a etapa `importacao` do onboarding abre na origem, com o
 *    `h1` "De onde vamos trazer seus dados?", sem o I2 e sem credencial antes
 *    de "Continuar"; "Conectar outra conta", numa sessão viva, também abre na
 *    origem, e o "Cancelar" volta à sessão sem pedido.
 * 3. I1: o bloco verde com a data no fuso do negócio, sem a conta de origem; as
 *    categorias na ordem do quadro; o bloco âmbar só com pendência; o texto
 *    final com DD/MM; nenhum "Importar novamente".
 * 4. Composição: uma chamada de `useShellConfig` por árvore, com `pushed`; de
 *    1024 px em diante a lista do hub com "Importação" marcada, abaixo dela
 *    nenhuma lista; um só `h1` por largura; sem o link "Configurações" na
 *    moldura da plataforma; sem lista do hub na moldura do onboarding.
 * 5. Preservado: as telas de análise e de execução aparecem pelo estado,
 *    dentro da composição; a etapa 2.2 mostra a ilustração com o mesmo markup.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pela comparação com o protótipo (`visual:compare`) e pelo gate renderizado.
 */

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type {
  ImportHistory,
  ImportLiveSession,
  ImportState,
  OnboardingState,
  SettingsState,
} from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { OnboardingScenario } from "@/features/onboarding/scenarios";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import {
  type ShellConfig,
  ShellConfigProvider,
} from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace }),
}));

const shellCallers = vi.hoisted(() => new Set<string>());
const shellConfigs = vi.hoisted(() => [] as ShellConfig[]);

vi.mock("@/shared/layout/ShellConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof ShellConfigModule>();
  return {
    ...actual,
    useShellConfig: (config: ShellConfig) => {
      shellCallers.add(useId());
      shellConfigs.push(config);
      actual.useShellConfig(config);
    },
  };
});

const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const notificationsGetPreferences = vi.fn();
const serviceCatalogList = vi.fn();
const retentionGet = vi.fn();
const knowledgeList = vi.fn();
const knowledgeGetOtherInfo = vi.fn();
const settingsGet = vi.fn();
const whatsappGet = vi.fn();
const conversationsList = vi.fn();
const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const getActivationTest = vi.fn();
const logout = vi.fn();
const refreshSession = vi.fn();
const setUnauthenticated = vi.fn();
const connectIntegration = vi.fn();
const getImportState = vi.fn();
const startImport = vi.fn();
const analyzeImport = vi.fn();
const getImportPreview = vi.fn();
const getImportProgress = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: { get: getActivationTest },
    auth: { logout },
    calendar: { connectIntegration },
    conversations: { list: conversationsList },
    knowledge: { getOtherInfo: knowledgeGetOtherInfo, list: knowledgeList },
    migration: {
      analyzeImport,
      executeImport: vi.fn(),
      getImportPreview,
      getImportProgress,
      getImportState,
      setImportCategorySelection: vi.fn(),
      startImport,
    },
    notifications: {
      getPreferences: notificationsGetPreferences,
      summary: notificationsSummary,
    },
    onboarding: { get: getOnboarding, update: updateOnboarding },
    retention: { get: retentionGet },
    serviceCatalog: { list: serviceCatalogList },
    settings: { get: settingsGet },
    status: { get: statusGet },
    whatsapp: { get: whatsappGet },
  }),
  useProductRuntime: () => ({
    refreshSession,
    session: {
      businessProfile: { businessName: "Negócio da sessão" },
      tenant: { name: "Negócio da sessão" },
      user: { email: "dona@studiomarina.com.br", name: "Marina Alves" },
    },
    setUnauthenticated,
  }),
}));

const WIDE = 1280;
const NARROW = 390;

function setViewport(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: min ? width >= Number(min[1]) : false,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    },
    writable: true,
  });
}

const COMPLETED_AT = "2026-09-18T13:42:00.000Z";
const ORIGIN_TITLE = "De onde vamos trazer seus dados?";
const EMPTY_TITLE = "Você ainda não importou do Minha Agenda";

function settingsFixture(timezone: string | null = "America/Sao_Paulo"): SettingsState {
  return {
    ai: { enabled: true, tone: "BALANCED" },
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: [
        { active: true, dayOfWeek: 1, endTime: "18:00", id: "r1", startTime: "09:00" },
      ],
      timezone: "America/Sao_Paulo",
    },
    business: timezone
      ? {
          address: "Rua Um, 100",
          category: "Beleza",
          contextProjectionStatus: "PROJECTED",
          currency: "BRL",
          language: "pt-BR",
          modalities: ["ON_SITE"],
          name: "Studio Marina",
          timezone,
        }
      : null,
    calendar: {
      capabilities: {
        createAppointments: true,
        manageAvailability: true,
        manageCustomers: true,
        manageServices: true,
        migrate: true,
      },
      integration: null,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
  };
}

function emptyImportState(): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: null },
    session: null,
  };
}

function sessionFixture(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 12, skipped: 0 },
    createdAt: "2026-09-15T10:00:00.000Z",
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewGeneratedAt: null,
    previewVersion: 0,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: "2026-09-15T10:00:00.000Z",
    status: "PARTIAL",
    ...overrides,
  };
}

function liveState(session: ImportLiveSession): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: session.sessionId },
    session,
  };
}

function categoryFixture(
  category: string,
  imported: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    category,
    discovered: imported,
    failed: 0,
    imported,
    limitationCode: null,
    needsReview: 0,
    pending: 0,
    skipped: 0,
    sourceSupported: true,
    ...overrides,
  };
}

function historyFixture(overrides: Record<string, unknown> = {}): ImportHistory {
  return {
    categories: [
      categoryFixture("AVAILABILITY", 5),
      categoryFixture("PAST_APPOINTMENT", 1400),
      categoryFixture("SERVICE", 12),
      categoryFixture("CUSTOMER", 386),
      categoryFixture("FUTURE_APPOINTMENT", 42),
    ],
    completedAt: COMPLETED_AT,
    completedBy: "user-1",
    counts: { failed: 0, imported: 1845, needsReview: 0, pending: 0, skipped: 0 },
    finishedAt: COMPLETED_AT,
    pendingAcceptance: null,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: "2026-09-18T13:30:00.000Z",
    status: "COMPLETED",
    ...overrides,
  } as ImportHistory;
}

function doneState(history: ImportHistory = historyFixture()): ImportState {
  return {
    history,
    right: { available: false, completedAt: COMPLETED_AT, sessionId: "session-1" },
    session: null,
  };
}

function onboardingFixture(
  overrides: Partial<OnboardingState> = {},
): OnboardingState {
  return {
    ai: { tone: "PROFESSIONAL" },
    availability: null,
    business: {
      address: null,
      category: "Beleza",
      modalities: ["ONLINE"],
      name: "Studio Aurora",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      integration: null,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
    ...overrides,
  };
}

beforeEach(() => {
  shellCallers.clear();
  shellConfigs.length = 0;
  push.mockReset();
  replace.mockReset();
  for (const mock of [
    statusGet,
    notificationsSummary,
    notificationsGetPreferences,
    serviceCatalogList,
    retentionGet,
    knowledgeList,
    knowledgeGetOtherInfo,
    settingsGet,
    whatsappGet,
    conversationsList,
    getOnboarding,
    updateOnboarding,
    getActivationTest,
    logout,
    refreshSession,
    setUnauthenticated,
    connectIntegration,
    getImportState,
    startImport,
    analyzeImport,
    getImportPreview,
    getImportProgress,
  ]) {
    mock.mockReset();
  }
  statusGet.mockResolvedValue({
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: false,
      effectiveEnabled: false,
      reconciled: "NOOP",
      state: "OFF",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-27T12:00:00.000Z",
      phoneNumber: "5511987654321",
      status: "CONNECTED",
    },
  });
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  notificationsGetPreferences.mockResolvedValue({ aiAppointmentCreated: false });
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [{ active: true, needsReview: false }],
    managedExternally: false,
    source: "AVENLY",
  });
  retentionGet.mockResolvedValue({
    appliesFrom: "NEXT_SWEEP",
    commercialRetentionDays: 90,
    lastSweepCompletedAt: null,
    personalRetentionDays: 30,
    retentionDaysOptions: [30, 90, 180, 365],
    unclassifiedRetentionFollows: "COMMERCIAL",
  });
  knowledgeList.mockResolvedValue([]);
  knowledgeGetOtherInfo.mockResolvedValue({ content: "" });
  settingsGet.mockResolvedValue(settingsFixture());
  whatsappGet.mockResolvedValue(null);
  conversationsList.mockResolvedValue([]);
  getActivationTest.mockResolvedValue(null);
  getOnboarding.mockResolvedValue(onboardingFixture());
  updateOnboarding.mockResolvedValue(onboardingFixture());
  refreshSession.mockResolvedValue(undefined);
  getImportState.mockResolvedValue(emptyImportState());
  getImportProgress.mockResolvedValue({
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 12, skipped: 0 },
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
  });
  analyzeImport.mockResolvedValue({
    previewVersion: 0,
    sessionId: "session-1",
    status: "ANALYZING",
  });
  getImportPreview.mockResolvedValue({
    categories: [],
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    sessionId: "session-1",
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

function renderImports(width = NARROW) {
  setViewport(width);
  return render(
    <ShellConfigProvider>
      <ImportsScreen />
    </ShellConfigProvider>,
  );
}

function renderPlatform(width: number) {
  setViewport(width);
  return render(
    <PlatformLayout>
      <ImportsScreen />
    </PlatformLayout>,
  );
}

function renderOnboardingStep(
  scenario: OnboardingScenario,
  state: OnboardingState = onboardingFixture(),
) {
  setViewport(NARROW);
  getOnboarding.mockResolvedValue(state);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
}

function credentialsLabel() {
  return screen.queryByLabelText("E-mail do Minha Agenda");
}

describe("Goal105 prova 1: I2 e a entrada da importação", () => {
  test("sem histórico e sem sessão: ilustração, texto, botão e nota do I2, sem campo de credencial", async () => {
    const { container } = renderImports();

    expect(
      await screen.findByRole("heading", { name: EMPTY_TITLE }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Traga serviços, clientes, horários e agendamentos de uma vez. Leva alguns minutos e acontece uma única vez. Depois, a Avenly é sua agenda oficial.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Importar do Minha Agenda" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Já tem clientes ou serviços aqui? Avisamos se algo coincidir antes de importar.",
      ),
    ).toBeVisible();

    const illustration = container.querySelector(".import-illustration");
    expect(illustration).not.toBeNull();
    expect(illustration).toHaveAttribute("aria-hidden", "true");
    expect(illustration?.textContent).toContain("Minha Agenda");
    expect(illustration?.textContent).toContain("uma vez");
    expect(illustration?.textContent).toContain("Avenly");

    expect(credentialsLabel()).toBeNull();
    expect(screen.queryByLabelText("Senha")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Entre no Minha Agenda" }),
    ).toBeNull();
  });

  test("o botão mostra a origem sem pedido novo; 'Continuar' mostra o formulário", async () => {
    const user = userEvent.setup();
    renderImports();
    await user.click(
      await screen.findByRole("button", { name: "Importar do Minha Agenda" }),
    );

    expect(
      screen.getByRole("heading", { name: ORIGIN_TITLE }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Isto é uma migração, não uma conexão" }),
    ).toBeVisible();
    expect(credentialsLabel()).toBeNull();
    expect(getImportState).toHaveBeenCalledTimes(1);
    expect(connectIntegration).not.toHaveBeenCalled();
    expect(startImport).not.toHaveBeenCalled();
    expect(analyzeImport).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByRole("heading", { name: "Entre no Minha Agenda" }),
    ).toBeVisible();
    expect(screen.getByLabelText("E-mail do Minha Agenda")).toBeVisible();
    expect(screen.getByLabelText("Senha")).toBeVisible();
    expect(connectIntegration).not.toHaveBeenCalled();
    expect(startImport).not.toHaveBeenCalled();
  });

  test("enviar chama connectIntegration e startImport uma vez cada, como antes", async () => {
    const user = userEvent.setup();
    getImportState
      .mockResolvedValueOnce(emptyImportState())
      .mockResolvedValue(doneState());
    connectIntegration.mockResolvedValue({});
    startImport.mockResolvedValue({
      created: true,
      replacedSessionId: null,
      sessionId: "session-1",
      status: "DRAFT",
    });
    renderImports();

    await user.click(
      await screen.findByRole("button", { name: "Importar do Minha Agenda" }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.type(
      await screen.findByLabelText("E-mail do Minha Agenda"),
      "camila@example.com",
    );
    await user.type(screen.getByLabelText("Senha"), "super-secret");
    await user.click(screen.getByRole("button", { name: "Analisar meus dados" }));

    await screen.findByRole("heading", { name: "Importação concluída" });
    expect(connectIntegration).toHaveBeenCalledTimes(1);
    expect(connectIntegration).toHaveBeenCalledWith({
      email: "camila@example.com",
      password: "super-secret",
    });
    expect(startImport).toHaveBeenCalledTimes(1);
    expect(startImport).toHaveBeenCalledWith(
      {
        replace: false,
        sourceAccountId: "camila@example.com",
        sourceAccountLabel: "camila@example.com",
      },
      expect.any(String),
    );
    expect(connectIntegration.mock.invocationCallOrder[0]).toBeLessThan(
      startImport.mock.invocationCallOrder[0],
    );
  });
});

describe("Goal105 prova 2: a origem (2.I1) vem antes das credenciais", () => {
  test("na etapa importacao do onboarding: h1 da origem, sem o I2 e sem credencial antes de 'Continuar'", async () => {
    const user = userEvent.setup();
    renderOnboardingStep("importacao");

    expect(
      await screen.findByRole("heading", { level: 1, name: ORIGIN_TITLE }),
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Minha Agenda")).toBeVisible();
    expect(
      screen.getByText("Serviços, clientes, horários e agendamentos"),
    ).toBeVisible();
    expect(
      screen.getByText("Por enquanto, a importação está disponível para o Minha Agenda."),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: EMPTY_TITLE })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Importar do Minha Agenda" }),
    ).toBeNull();
    expect(credentialsLabel()).toBeNull();
    expect(getImportState).toHaveBeenCalledTimes(1);
    expect(startImport).not.toHaveBeenCalled();
    expect(connectIntegration).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByLabelText("E-mail do Minha Agenda")).toBeVisible();
    expect(screen.getByLabelText("Senha")).toBeVisible();
  });

  test("'Conectar outra conta', numa sessão viva, abre na origem; 'Cancelar' volta à sessão sem pedido", async () => {
    const user = userEvent.setup();
    // A tela parada ("Importação quase concluída") não tem mais a troca de
    // conta (validação de 2026-10-11); a execução interrompida ainda tem.
    getImportState.mockResolvedValue(liveState(sessionFixture({ interrupted: true })));
    getImportProgress.mockResolvedValue({
      categories: [],
      counts: { failed: 0, imported: 0, needsReview: 0, pending: 12, skipped: 0 },
      finishedAt: null,
      interrupted: true,
      lastError: null,
      previewVersion: 1,
      sessionId: "session-1",
      startedAt: "2026-09-15T10:10:00.000Z",
      status: "PARTIAL",
    });
    renderImports();

    await screen.findByRole("heading", { name: "Isso parou no meio do caminho" });
    await user.click(screen.getByRole("button", { name: "Conectar outra conta" }));
    await user.click(
      screen.getByRole("button", { name: "Descartar e conectar outra conta" }),
    );

    expect(
      await screen.findByRole("heading", { name: ORIGIN_TITLE }),
    ).toBeVisible();
    expect(credentialsLabel()).toBeNull();
    expect(screen.queryByRole("heading", { name: EMPTY_TITLE })).toBeNull();
    const stateReads = getImportState.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      await screen.findByRole("heading", { name: "Isso parou no meio do caminho" }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: ORIGIN_TITLE })).toBeNull();
    expect(getImportState).toHaveBeenCalledTimes(stateReads);
    expect(startImport).not.toHaveBeenCalled();
    expect(connectIntegration).not.toHaveBeenCalled();
  });
});

describe("Goal105 prova 3: I1, o histórico só de leitura", () => {
  function historyRows(): HTMLElement[] {
    return screen.getAllByRole("listitem");
  }

  test("bloco verde com a data no fuso do negócio, sem a conta de origem", async () => {
    getImportState.mockResolvedValue(doneState());
    renderImports();

    expect(
      await screen.findByRole("heading", { name: "Importação concluída" }),
    ).toBeVisible();
    expect(
      await screen.findByText("Minha Agenda · 18 de setembro de 2026, 10:42"),
    ).toBeVisible();
    expect(screen.queryByText(/camila@example\.com/)).toBeNull();
    expect(
      screen.getByText(
        "A importação do Minha Agenda é feita uma única vez. Alterações feitas lá depois de 18/09 não chegam à Avenly: sua agenda oficial é esta.",
      ),
    ).toBeVisible();
  });

  test("o mesmo instante em Pacific/Auckland dá outro dia, no bloco verde e no texto final", async () => {
    settingsGet.mockResolvedValue(settingsFixture("Pacific/Auckland"));
    getImportState.mockResolvedValue(doneState());
    renderImports();

    expect(
      await screen.findByText("Minha Agenda · 19 de setembro de 2026, 01:42"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "A importação do Minha Agenda é feita uma única vez. Alterações feitas lá depois de 19/09 não chegam à Avenly: sua agenda oficial é esta.",
      ),
    ).toBeVisible();
  });

  test.each([
    ["sem settings.business", () => settingsGet.mockResolvedValue(settingsFixture(null))],
    ["com a leitura de settings falhando", () => settingsGet.mockRejectedValue(new Error("falhou"))],
  ] as const)("%s, vale America/Sao_Paulo", async (_label, arrange) => {
    arrange();
    getImportState.mockResolvedValue(doneState());
    renderImports();

    expect(
      await screen.findByText("Minha Agenda · 18 de setembro de 2026, 10:42"),
    ).toBeVisible();
    expect(screen.getByText(/depois de 18\/09 não chegam/)).toBeVisible();
  });

  test("categorias na ordem do quadro, com '1.400' e o ícone de confirmação em AVAILABILITY", async () => {
    getImportState.mockResolvedValue(doneState());
    renderImports();
    await screen.findByRole("heading", { name: "Importação concluída" });

    const rows = historyRows();
    expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual([
      "serviços",
      "clientes",
      "agendamentos futuros",
      "atendimentos anteriores",
      "horários de atendimento",
    ]);
    expect(within(rows[0]).getByText("12")).toBeVisible();
    expect(within(rows[1]).getByText("386")).toBeVisible();
    expect(within(rows[2]).getByText("42")).toBeVisible();
    expect(within(rows[3]).getByText("1.400")).toBeVisible();
    expect(within(rows[4]).getByRole("img", { name: "Importados" })).toBeVisible();
    expect(rows[4].textContent ?? "").not.toMatch(/\d/);
  });

  test("as demais categorias vêm depois das cinco, com as segundas linhas de sem suporte e de não importados", async () => {
    getImportState.mockResolvedValue(
      doneState(
        historyFixture({
          categories: [
            categoryFixture("NO_SHOW_APPOINTMENT", 0, { sourceSupported: false }),
            categoryFixture("AVAILABILITY", 0),
            categoryFixture("CANCELLED_APPOINTMENT", 7, { failed: 4 }),
            categoryFixture("SERVICE", 12),
          ],
        }),
      ),
    );
    renderImports();
    await screen.findByRole("heading", { name: "Importação concluída" });

    const rows = historyRows();
    expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual([
      "serviços",
      "horários de atendimento",
      "cancelamentos",
      "faltas",
    ]);
    expect(within(rows[1]).queryByRole("img", { name: "Importados" })).toBeNull();
    expect(within(rows[1]).getByText("0")).toBeVisible();
    expect(within(rows[2]).getByText("4 não importados")).toBeVisible();
    expect(
      within(rows[3]).getByText("Minha Agenda não oferece esta categoria"),
    ).toBeVisible();
  });

  test("bloco âmbar: 3 registros, 1 registro e a linha do aceite", async () => {
    getImportState.mockResolvedValue(
      doneState(
        historyFixture({
          pendingAcceptance: {
            acceptedAt: "2026-09-18T13:41:00.000Z",
            acceptedBy: "user-1",
            pendingCount: 3,
          },
        }),
      ),
    );
    const view = renderImports();

    expect(
      await screen.findByRole("heading", { name: "3 registros com pendência" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Ficaram pendentes e foram aceitos por decisão explícita em 18 de setembro de 2026, 10:41.",
      ),
    ).toBeVisible();
    view.unmount();

    getImportState.mockResolvedValue(
      doneState(
        historyFixture({
          pendingAcceptance: {
            acceptedAt: "2026-09-18T13:41:00.000Z",
            acceptedBy: "user-1",
            pendingCount: 1,
          },
        }),
      ),
    );
    renderImports();
    expect(
      await screen.findByRole("heading", { name: "1 registro com pendência" }),
    ).toBeVisible();
    expect(screen.queryByText(/registros com pendência/)).toBeNull();
  });

  test.each([
    ["sem pendingAcceptance", null],
    [
      "com pendingCount 0",
      { acceptedAt: "2026-09-18T13:41:00.000Z", acceptedBy: "user-1", pendingCount: 0 },
    ],
  ] as const)("%s, nenhum bloco âmbar", async (_label, pendingAcceptance) => {
    getImportState.mockResolvedValue(doneState(historyFixture({ pendingAcceptance })));
    renderImports();
    await screen.findByRole("heading", { name: "Importação concluída" });

    expect(screen.queryByText(/com pendência/)).toBeNull();
    expect(screen.queryByText(/foram aceitos por decisão explícita/)).toBeNull();
  });

  test("nenhum 'Importar novamente' nem a descrição antiga da tela", async () => {
    getImportState.mockResolvedValue(doneState());
    renderImports();
    await screen.findByRole("heading", { name: "Importação concluída" });

    expect(screen.queryByText(/Importar novamente/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Importar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Conectar/ })).toBeNull();
    expect(screen.queryByText(/Não é possível importar novamente/)).toBeNull();
  });

  // Goal134 (2.I10): no onboarding a conclusão não é o cartão do histórico, e
  // sim o selo, o título e as pílulas, sem data nem conta de origem. O cartão,
  // com a data no fuso do negócio, continua em `/importacao` (testes acima).
  test("no onboarding, a conclusão é o 2.I10: sem o cartão, sem a data e sem a conta de origem", async () => {
    getImportState.mockResolvedValue(doneState());
    renderOnboardingStep("importacao");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Importação concluída" }),
    ).toBeVisible();
    expect(screen.queryByText(/Minha Agenda · /)).toBeNull();
    expect(screen.queryByText(/depois de 18\/09 não chegam/)).toBeNull();
    expect(screen.queryByText(/camila@example\.com/)).toBeNull();
  });
});

describe("Goal105 prova 4: a composição de /importacao", () => {
  const STATES: Array<[string, () => void, string]> = [
    ["entrada (I2)", () => getImportState.mockResolvedValue(emptyImportState()), EMPTY_TITLE],
    ["histórico (I1)", () => getImportState.mockResolvedValue(doneState()), "Importação concluída"],
    [
      "sessão em execução",
      () => getImportState.mockResolvedValue(liveState(sessionFixture())),
      "Importação quase concluída",
    ],
  ];

  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)(
    "uma chamada de useShellConfig por árvore, com pushed, na faixa %s",
    async (_label, width) => {
      for (const [state, arrange, heading] of STATES) {
        shellCallers.clear();
        shellConfigs.length = 0;
        arrange();
        const { unmount } = renderPlatform(width);
        await screen.findByRole("heading", { name: heading });
        await waitFor(() => {
          expect(shellCallers.size, state).toBe(1);
        });
        expect(shellConfigs.length).toBeGreaterThan(0);
        for (const config of shellConfigs) {
          expect(config.pushed, state).toBe(true);
          expect(config.title, state).toBe("Importação");
        }
        unmount();
      }
    },
  );

  test("de 1024 px em diante, a lista do hub tem 'Importação' marcada, o título dela é h2 e há um só h1", async () => {
    const { container } = renderPlatform(WIDE);
    await screen.findByRole("heading", { name: EMPTY_TITLE });

    const list = container.querySelector<HTMLElement>(".list-detail-list");
    expect(list).not.toBeNull();
    expect(list).toHaveAttribute("aria-label", "Configurações");
    await waitFor(() => {
      const current = (list as HTMLElement).querySelectorAll('[aria-current="page"]');
      expect(current).toHaveLength(1);
      expect(current[0]?.textContent ?? "").toMatch(/^Importação/);
    });
    expect(within(list as HTMLElement).queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(
      within(list as HTMLElement).getAllByRole("heading", { level: 2 }).length,
    ).toBeGreaterThan(0);
    expect(within(container).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      within(container).getByRole("heading", { level: 1, name: "Importação" }),
    ).toBeVisible();
  });

  test("abaixo de 1024 px, é tela empurrada sem a lista e há um só h1", async () => {
    const { container } = renderPlatform(NARROW);
    await screen.findByRole("heading", { name: EMPTY_TITLE });
    await waitFor(() => expect(settingsGet).toHaveBeenCalled());

    expect(container.querySelector(".list-detail")).toBeNull();
    expect(container.querySelector(".list-detail-list")).toBeNull();
    expect(within(container).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      within(container).getByRole("heading", { level: 1, name: "Importação" }),
    ).toBeVisible();
  });

  test("sem a leitura de settings, ou se ela falhar, a tela da importação aparece sozinha, sem lista", async () => {
    settingsGet.mockRejectedValue(new Error("falhou"));
    const { container } = renderPlatform(WIDE);

    expect(await screen.findByRole("heading", { name: EMPTY_TITLE })).toBeVisible();
    await waitFor(() => expect(settingsGet).toHaveBeenCalled());
    expect(container.querySelector(".list-detail")).toBeNull();
    expect(within(container).getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)(
    "na moldura da plataforma não há o link 'Configurações' dentro da tela, na faixa %s",
    async (_label, width) => {
      getImportState.mockResolvedValue(doneState());
      const { container } = renderPlatform(width);
      await screen.findByRole("heading", { name: "Importação concluída" });

      const page = container.querySelector<HTMLElement>(".imports-page");
      expect(page).not.toBeNull();
      expect(
        within(page as HTMLElement).queryByRole("link", { name: "Configurações" }),
      ).toBeNull();
      expect(within(page as HTMLElement).queryByText("Configurações")).toBeNull();
      expect(
        within(page as HTMLElement).getByRole("link", {
          name: "Voltar para configurações",
        }),
      ).toHaveAttribute("href", "/configuracoes");
    },
  );

  test("na moldura do onboarding, não há lista do hub nem barra empurrada", async () => {
    const { container } = renderOnboardingStep("importacao");
    await screen.findByRole("heading", { level: 1, name: ORIGIN_TITLE });
    await waitFor(() => expect(getImportState).toHaveBeenCalled());

    expect(container.querySelector(".list-detail")).toBeNull();
    expect(container.querySelector(".list-detail-list")).toBeNull();
    expect(screen.queryByRole("link", { name: /onfigurações/ })).toBeNull();
    expect(settingsGet).not.toHaveBeenCalled();
    expect(shellCallers.size).toBe(0);
  });
});

describe("Goal105 prova 5: o que fica como era", () => {
  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)(
    "sessão em análise: a tela de análise aparece pelo estado, dentro da composição, na faixa %s",
    async (_label, width) => {
      getImportState.mockResolvedValue(
        liveState(
          sessionFixture({
            previewGeneratedAt: "2026-09-15T10:05:00.000Z",
            previewVersion: 1,
            startedAt: null,
            status: "READY",
          }),
        ),
      );
      getImportPreview.mockResolvedValue({
        categories: [
          {
            category: "SERVICE",
            discoveredCount: 12,
            failedCount: 0,
            importedCount: 0,
            limitationCode: null,
            limitationDetail: null,
            needsReviewCount: 0,
            pendingCount: 12,
            readCount: 12,
            skippedCount: 0,
            sourceReportedCount: 12,
            sourceSupported: true,
          },
        ],
        generatedAt: "2026-09-15T10:05:00.000Z",
        previewVersion: 1,
        sessionId: "session-1",
      });
      renderPlatform(width);

      expect(
        await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
      ).toBeVisible();
      expect(analyzeImport).not.toHaveBeenCalled();
      expect(startImport).not.toHaveBeenCalled();
      expect(connectIntegration).not.toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: EMPTY_TITLE })).toBeNull();
      expect(credentialsLabel()).toBeNull();
    },
  );

  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)(
    "sessão em execução: a tela de execução aparece pelo estado, com o progresso lido, na faixa %s",
    async (_label, width) => {
      getImportState.mockResolvedValue(liveState(sessionFixture()));
      renderPlatform(width);

      expect(
        await screen.findByRole("heading", { name: "Importação quase concluída" }),
      ).toBeVisible();
      // A tela parada não oferece trocar de conta (validação de 2026-10-11).
      expect(
        screen.queryByRole("button", { name: "Conectar outra conta" }),
      ).toBeNull();
      await waitFor(() => expect(getImportProgress).toHaveBeenCalled());
      expect(startImport).not.toHaveBeenCalled();
      expect(connectIntegration).not.toHaveBeenCalled();
    },
  );

  test("montar a rota só lê o estado: nenhuma sessão é aberta sem as credenciais", async () => {
    renderImports();
    await screen.findByRole("heading", { name: EMPTY_TITLE });

    expect(getImportState).toHaveBeenCalledTimes(1);
    expect(connectIntegration).not.toHaveBeenCalled();
    expect(startImport).not.toHaveBeenCalled();
    expect(analyzeImport).not.toHaveBeenCalled();
  });

  test("a etapa 2.2 (quando-importar) mostra a ilustração com o mesmo markup", async () => {
    const { container } = renderOnboardingStep("quando-importar");
    await screen.findByRole("button", { name: "Importar agora" });

    const illustration = container.querySelector(".import-illustration");
    expect(illustration).not.toBeNull();
    const bars = (width: number) =>
      `<span class="import-bar" style="width: ${width}%;"></span>`;
    const allBars = [80, 60, 70, 45].map(bars).join("");
    expect((illustration as HTMLElement).outerHTML).toBe(
      '<div aria-hidden="true" class="import-illustration">' +
        '<div class="import-card"><span class="import-card-label">Minha Agenda</span>' +
        allBars +
        "</div>" +
        '<div class="import-arrow">' +
        '<svg fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 34 24" width="34">' +
        '<path d="M2 12h28M23 5l7 7-7 7"></path></svg>' +
        "<span>uma vez</span></div>" +
        '<div class="import-card is-avenly"><span class="import-card-label">Avenly</span>' +
        allBars +
        "</div></div>",
    );
  });
});
