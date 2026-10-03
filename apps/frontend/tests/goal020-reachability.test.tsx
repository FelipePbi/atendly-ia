// @vitest-environment jsdom
/**
 * Goal020 (WU-011) — alcançabilidade pela rota.
 *
 * `implementationHints` desta unidade é direto: "teste que passe sobre
 * componente sem importador não prova fluxo entregue". Esta suíte monta a
 * rota real `app/(platform)/importacao/page.tsx` — não `ImportsScreen`
 * importado direto — pelas quatro etapas da jornada (conexão, análise com
 * conflitos, execução com pendências, histórico concluído), e a rota real
 * `app/(platform)/configuracoes/page.tsx` (hub), provando que o ponto de
 * entrada de Configurações aponta para `/importacao` com o mesmo `href` que
 * a entrada "Mais" da navegação declara. Desde o Goal024/WU-02 esse ponto de
 * entrada vive só no hub — `ImportSettingsSection` não é mais montada dentro
 * de Configurações → Agenda. Nenhuma das telas do módulo
 * (`ImportConflictsScreen`, `ImportHistoryCard`) fica sem importador de
 * produção: todas são alcançadas por uma dessas duas rotas.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ImportHistory,
  ImportLiveSession,
  ImportPreviewSnapshot,
  ImportProgress,
  ImportState,
  SettingsState,
} from "@/data";
import { MORE_DESTINATIONS } from "@/shared/layout/navigation";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import type * as SystemStatusModule from "@/shared/runtime/systemStatus";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getImportState = vi.fn();
const connectIntegration = vi.fn();
const startImport = vi.fn();
const analyzeImport = vi.fn();
const getImportPreview = vi.fn();
const setImportCategorySelection = vi.fn();
const executeImport = vi.fn();
const getImportProgress = vi.fn();
const listImportItems = vi.fn();
const decideImportItem = vi.fn();
const completeImport = vi.fn();
const getSettings = vi.fn();
const getReminders = vi.fn();
const getWhatsapp = vi.fn();
const getRetention = vi.fn();
const serviceCatalogList = vi.fn();

// Goal097: o hub do M1 lê o status da IA e do WhatsApp para as linhas e o
// bloco de identidade; esta suíte não monta `SystemStatusProvider`.
vi.mock("@/shared/runtime/systemStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof SystemStatusModule>();
  return {
    ...actual,
    useSystemStatus: () => ({
      ai: null,
      aiView: "off",
      phase: "loaded",
      whatsapp: null,
      whatsappView: "off",
    }),
  };
});

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration },
    migration: {
      analyzeImport,
      completeImport,
      decideImportItem,
      executeImport,
      getImportPreview,
      getImportProgress,
      getImportState,
      listImportItems,
      setImportCategorySelection,
      startImport,
    },
    retention: { get: getRetention },
    serviceCatalog: { list: serviceCatalogList },
    settings: { get: getSettings, getReminders },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
    session: { user: { email: "camila@example.com" } },
    setUnauthenticated: vi.fn(),
  }),
}));

import SettingsHubPage from "@/app/(platform)/configuracoes/page";
import ImportacaoPage from "@/app/(platform)/importacao/page";

function availableStateFixture(): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: null },
    session: null,
  };
}

/** Sessão já analisada (`READY`, preview gravado); a análise em si é provada em `goal061-import-async.test.tsx`. */
function sessionFixture(
  overrides: Partial<ImportLiveSession> = {},
): ImportLiveSession {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 1, pending: 12, skipped: 0 },
    createdAt: "2026-09-15T10:00:00.000Z",
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewGeneratedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: null,
    status: "READY",
    ...overrides,
  };
}

function runningSessionFixture(
  overrides: Partial<ImportLiveSession> = {},
): ImportLiveSession {
  return sessionFixture({
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
    ...overrides,
  });
}

function stateWithSession(session: ImportLiveSession): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: session.sessionId },
    session,
  };
}

function previewWithConflicts(): ImportPreviewSnapshot {
  return {
    categories: [
      {
        category: "SERVICE",
        discoveredCount: 12,
        failedCount: 0,
        importedCount: 0,
        limitationCode: null,
        limitationDetail: null,
        needsReviewCount: 1,
        pendingCount: 11,
        readCount: 12,
        skippedCount: 0,
        sourceReportedCount: 12,
        sourceSupported: true,
      },
    ],
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    sessionId: "session-1",
  };
}

function partialProgressFixture(): ImportProgress {
  return {
    categories: [
      {
        category: "SERVICE",
        failed: 0,
        failedReasons: [],
        imported: 10,
        needsReview: 2,
        pending: 0,
        skipped: 0,
      },
    ],
    counts: { failed: 0, imported: 10, needsReview: 2, pending: 0, skipped: 0 },
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
  };
}

function historyFixture(overrides: Partial<ImportHistory> = {}): ImportHistory {
  return {
    categories: [
      {
        category: "SERVICE",
        discovered: 12,
        failed: 0,
        imported: 12,
        limitationCode: null,
        needsReview: 0,
        pending: 0,
        skipped: 0,
        sourceSupported: true,
      },
    ],
    completedAt: "2026-09-15T12:00:00.000Z",
    completedBy: "user-1",
    counts: { failed: 0, imported: 12, needsReview: 0, pending: 0, skipped: 0 },
    finishedAt: "2026-09-15T12:00:00.000Z",
    pendingAcceptance: null,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: "2026-09-15T10:00:00.000Z",
    status: "COMPLETED",
    ...overrides,
  };
}

function completedState(): ImportState {
  return {
    history: historyFixture(),
    right: {
      available: false,
      completedAt: "2026-09-15T12:00:00.000Z",
      sessionId: "session-1",
    },
    session: null,
  };
}

function settingsFixture(
  overrides: Partial<SettingsState> = {},
): SettingsState {
  return {
    ai: { enabled: true, tone: "BALANCED" },
    availability: null,
    business: {
      category: "Beleza",
      currency: "BRL",
      language: "pt-BR",
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      capabilities: {
        createAppointments: true,
        manageAvailability: true,
        manageCustomers: true,
        manageServices: true,
        migrate: true,
      },
      integration: null,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
    ...overrides,
  };
}

function renderPage(page: React.ReactElement) {
  return render(<ShellConfigProvider>{page}</ShellConfigProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getWhatsapp.mockResolvedValue(null);
  getRetention.mockRejectedValue(new Error("fora do escopo desta suíte"));
  serviceCatalogList.mockRejectedValue(new Error("fora do escopo desta suíte"));
  // Bloco de Lembretes (Goal021/WU-010) monta junto de CalendarSettingsPage;
  // esta suíte prova alcançabilidade da importação, não lembretes.
  getReminders.mockResolvedValue({
    configured: false,
    confirmationEnabled: false,
    pricePolicy: "NEVER",
    rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
  });
});

describe("/importacao monta a jornada real pela própria rota", () => {
  test("direito disponível, sem sessão: monta a conexão da origem", async () => {
    getImportState.mockResolvedValue(availableStateFixture());
    renderPage(<ImportacaoPage />);

    expect(
      await screen.findByRole("heading", { name: "Entre no Minha Agenda" }),
    ).toBeVisible();
    // Volta para Configurações é o outro lado do mesmo link, alcançável pela rota real.
    expect(screen.getByRole("link", { name: /Configurações/ })).toHaveAttribute(
      "href",
      "/configuracoes",
    );
  });

  test("sessão em análise: a seleção leva aos conflitos e volta, sem sair da rota", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    getImportPreview.mockResolvedValue(previewWithConflicts());
    renderPage(<ImportacaoPage />);

    await screen.findByRole("heading", {
      name: "Encontramos isto no Minha Agenda",
    });
    await user.click(screen.getByRole("button", { name: "Revisar conflitos" }));

    expect(
      await screen.findByRole("heading", {
        name: "Itens que precisam da sua decisão",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /serviços/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(
      await screen.findByRole("heading", {
        name: "Encontramos isto no Minha Agenda",
      }),
    ).toBeVisible();
  });

  test("sessão em execução: mostra o progresso real e alcança a revisão de pendências", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    listImportItems.mockResolvedValue({
      category: "CUSTOMER",
      items: [],
      limit: 20,
      offset: 0,
      sessionId: "session-1",
      total: 0,
    });
    renderPage(<ImportacaoPage />);

    expect(
      await screen.findByRole("progressbar", {
        name: "Andamento da importação",
      }),
    ).toBeVisible();
    await user.click(
      await screen.findByRole("button", { name: "Revisar itens" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Itens que precisam da sua decisão",
      }),
    ).toBeVisible();
  });

  test("importação concluída: monta o histórico, sem oferecer nova importação", async () => {
    getImportState.mockResolvedValue(completedState());
    renderPage(<ImportacaoPage />);

    expect(
      await screen.findByRole("heading", { name: "Importação concluída" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Importar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Conectar/ })).toBeNull();
  });
});

describe("Configurações → hub aponta para a mesma rota que a navegação declara", () => {
  test("o hub de Configurações mostra o ponto de entrada para /importacao", async () => {
    getSettings.mockResolvedValue(settingsFixture());
    renderPage(<SettingsHubPage />);

    const link = await screen.findByRole("link", { name: /Importação/ });
    expect(link).toHaveAttribute("href", "/importacao");
  });

  test("a entrada 'Importação' do menu Mais aponta para a mesma rota que existe e monta conteúdo real", async () => {
    const destination = MORE_DESTINATIONS.find(
      (entry) => entry.section === "importacao",
    );
    expect(destination?.href).toBe("/importacao");

    getImportState.mockResolvedValue(availableStateFixture());
    renderPage(<ImportacaoPage />);

    expect(
      await screen.findByRole("heading", { name: "Entre no Minha Agenda" }),
    ).toBeVisible();
  });
});
