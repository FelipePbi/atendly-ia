// @vitest-environment jsdom
/**
 * Goal020 (WU-011): prova transversal de acessibilidade das telas novas do
 * módulo de importação, com o que o axe sozinho não cobre.
 *
 * As suítes de cada Work Unit (goal020-imports-entry, goal020-import-preview,
 * goal020-import-conflicts, goal020-import-run, goal020-import-settings-section)
 * já provam comportamento pelo que a usuária encontra, mas nenhuma delas
 * afirma foco por teclado nos dois diálogos do módulo. Esta suíte fecha as
 * duas lacunas, no mesmo padrão que goal016-a11y.test.tsx e
 * goal017-a11y.test.tsx fecharam para os módulos anteriores: cada etapa da
 * jornada passa pelo axe, e os dois diálogos (trocar de conta e a confirmação
 * final da conclusão) têm foco que entra, fica preso e volta para quem abriu.
 *
 * O que esta suíte não prova: layout real, largura de viewport, contraste
 * computado. Isso é `npm run validate:ui`, não jsdom.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ImportHistory,
  ImportItem,
  ImportLiveSession,
  ImportPreviewSnapshot,
  ImportProgress,
  ImportState,
} from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

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

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration },
    settings: { get: () => new Promise<never>(() => undefined) },
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
  }),
}));

/** Avança Tab até o alvo receber foco, ou até o limite — nunca em loop indefinido. */
async function tabUntilFocused(
  user: UserEvent,
  target: HTMLElement,
  max = 40,
): Promise<void> {
  for (
    let attempt = 0;
    attempt < max && document.activeElement !== target;
    attempt += 1
  ) {
    await user.tab();
  }
}

function availableStateFixture(): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: null },
    session: null,
  };
}

/** Sessão já analisada (`READY`, preview gravado): a análise em si é provada em `goal061-import-async.test.tsx`. */
function sessionFixture(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
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
      {
        category: "CUSTOMER",
        discoveredCount: 7,
        failedCount: 0,
        importedCount: 0,
        limitationCode: null,
        limitationDetail: null,
        needsReviewCount: 0,
        pendingCount: 7,
        readCount: 7,
        skippedCount: 0,
        sourceReportedCount: 7,
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
        imported: 30,
        needsReview: 0,
        pending: 5,
        skipped: 0,
      },
      {
        category: "CUSTOMER",
        failed: 1,
        failedReasons: [],
        imported: 10,
        needsReview: 2,
        pending: 0,
        skipped: 0,
      },
    ],
    counts: { failed: 1, imported: 40, needsReview: 2, pending: 5, skipped: 0 },
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
  };
}

function conflictItemFixture(overrides: Partial<ImportItem> = {}): ImportItem {
  return {
    attemptCount: 0,
    category: "SERVICE",
    disappearedAt: null,
    entityType: null,
    externalId: "ext-42",
    id: "item-42",
    internalId: null,
    label: "Corte de cabelo",
    lastAttemptAt: null,
    processedAt: null,
    reasonCode: "SERVICE_MATCH_AMBIGUOUS",
    reasonDetail: "Mais de um serviço já cadastrado tem o mesmo nome.",
    status: "NEEDS_REVIEW",
    ...overrides,
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

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <ImportsScreen />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("conexão da origem", () => {
  test("sem violação de acessibilidade", async () => {
    getImportState.mockResolvedValue(availableStateFixture());
    const user = userEvent.setup();
    const { container } = renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Importar do Minha Agenda" }),
    );
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByRole("heading", { name: "Entre no Minha Agenda" });
    await expectNoA11yViolations(container);
  });
});

describe("análise e seleção", () => {
  test("resumo sem violação de acessibilidade", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    getImportPreview.mockResolvedValue(previewWithConflicts());
    const { container } = renderScreen();

    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
    await expectNoA11yViolations(container);
  });

  test("seleção por categoria sem violação, com o conflito comunicado também por texto", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    getImportPreview.mockResolvedValue(previewWithConflicts());
    const user = userEvent.setup();
    const { container } = renderScreen();

    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
    await user.click(screen.getByRole("button", { name: "Escolher o que importar" }));
    await screen.findByRole("heading", { name: "O que você quer trazer?" });

    // Nunca só a cor do badge: o número de conflitos também é texto.
    expect(
      screen.getByText(/1 item precisa da sua decisão\./),
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe("conflitos por item", () => {
  async function openConflicts() {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    getImportPreview.mockResolvedValue(previewWithConflicts());
    listImportItems.mockResolvedValue({
      category: "SERVICE",
      items: [conflictItemFixture()],
      limit: 20,
      offset: 0,
      sessionId: "session-1",
      total: 1,
    });
    const user = userEvent.setup();
    const result = renderScreen();
    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
    await user.click(screen.getByRole("button", { name: "Revisar conflitos" }));
    return { user, ...result };
  }

  test("lista de cartões de conflito sem violação de acessibilidade", async () => {
    const { container } = await openConflicts();

    await screen.findByRole("heading", { name: "1 registro precisa da sua decisão" });
    await expectNoA11yViolations(container);
  });

  test("cartão aberto: as decisões são alcançáveis por teclado e sem violação", async () => {
    const { container, user } = await openConflicts();

    await screen.findByRole("heading", { name: "1 registro precisa da sua decisão" });
    const keep = await screen.findByRole("button", { name: "Criar outro serviço" });
    await tabUntilFocused(user, keep);
    expect(keep).toHaveFocus();
    const exclude = screen.getByRole("button", { name: "Não importar" });
    await tabUntilFocused(user, exclude);
    expect(exclude).toHaveFocus();

    await expectNoA11yViolations(container);
  });
});

describe("execução", () => {
  test("sem violação com pendências visíveis", async () => {
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    listImportItems.mockResolvedValue({
      category: "CUSTOMER",
      items: [
        {
          attemptCount: 0,
          category: "CUSTOMER",
          disappearedAt: null,
          entityType: null,
          externalId: "1042",
          id: "item-1",
          internalId: null,
          label: "Cliente sem nome (origem #1042)",
          lastAttemptAt: null,
          processedAt: null,
          reasonCode: "CUSTOMER_NAME_MISSING",
          reasonDetail: null,
          status: "NEEDS_REVIEW",
        },
      ],
      limit: 5,
      offset: 0,
      sessionId: "session-1",
      total: 1,
    });
    const { container } = renderScreen();

    await screen.findByRole("heading", { name: "2 registros precisam de revisão" });
    await screen.findByRole("button", {
      name: "Nomear Cliente sem nome (origem #1042)",
    });
    await expectNoA11yViolations(container);
  });

  test("diálogo de trocar de conta: foco entra, Tab fica preso e Esc devolve o foco a quem abriu", async () => {
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    const user = userEvent.setup();
    renderScreen();

    // Espera a leitura de progresso assentar: `ReplaceAccountZone` também
    // aparece na tela de carregamento, e um `findBy` ansioso pegaria o botão
    // da renderização transitória em vez do da tela final.
    await screen.findByRole("heading", { name: "Importação quase concluída" });
    const trigger = screen.getByRole("button", { name: "Conectar outra conta" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Descartar esta importação?",
    });

    await expectNoA11yViolations(document.body);
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(
      within(dialog).getByRole("button", { name: "Descartar e conectar outra conta" }),
    ).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test("diálogo de conclusão final: foco entra, Tab fica preso e Esc devolve o foco a quem abriu", async () => {
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    const user = userEvent.setup();
    renderScreen();

    const trigger = await screen.findByRole("button", {
      name: "Concluir importação",
    });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Esta é sua única importação.",
    });

    await expectNoA11yViolations(document.body);
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(
      within(dialog).getByRole("button", { name: "Voltar e revisar" }),
    ).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(completeImport).not.toHaveBeenCalled();
  });
});

describe("histórico", () => {
  test("sem violação de acessibilidade", async () => {
    getImportState.mockResolvedValue(completedState());
    const { container } = renderScreen();

    await screen.findByRole("heading", { name: "Importação concluída" });
    await expectNoA11yViolations(container);
  });
});
