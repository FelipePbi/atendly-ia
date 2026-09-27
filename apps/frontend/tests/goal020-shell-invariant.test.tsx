// @vitest-environment jsdom
/**
 * Goal020 (WU-011): fecha a mesma invariante que goal016/goal017/goal019
 * fecharam para os módulos anteriores — `ShellConfigProvider` mais a árvore
 * real do módulo de importação precisa sobreviver a montagem, transições de
 * etapa e interação repetida sem violar a regra de uma chamada de
 * `useShellConfig` por árvore. `ImportsScreen` é o único ponto do módulo que
 * chama o hook; `ConnectSourceScreen`, `ImportPreviewScreen`,
 * `ImportConflictsScreen` e `ImportRunScreen` nunca chamam. Se essa invariante
 * for violada (por exemplo, duas montagens concorrentes do mesmo config, ou
 * um efeito que nunca estabiliza), React lança "Maximum update depth
 * exceeded" e a interação abaixo lança essa mesma exceção, derrubando o
 * teste — não há necessidade de capturá-la explicitamente.
 *
 * Quatro cenários cobrem as etapas da jornada única (Goal020): conexão da
 * origem, análise/seleção com alternância de modo, conflitos resolvidos por
 * item, e execução com os dois diálogos de confirmação do módulo.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ImportItem,
  ImportLiveSession,
  ImportPreview,
  ImportProgress,
  ImportState,
} from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getImportState = vi.fn();
const connectIntegration = vi.fn();
const startImport = vi.fn();
const analyzeImport = vi.fn();
const setImportCategorySelection = vi.fn();
const executeImport = vi.fn();
const getImportProgress = vi.fn();
const listImportItems = vi.fn();
const decideImportItem = vi.fn();
const completeImport = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration },
    migration: {
      analyzeImport,
      completeImport,
      decideImportItem,
      executeImport,
      getImportProgress,
      getImportState,
      listImportItems,
      setImportCategorySelection,
      startImport,
    },
  }),
}));

function availableStateFixture(): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: null },
    session: null,
  };
}

function sessionFixture(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 1, pending: 12, skipped: 0 },
    createdAt: "2026-09-15T10:00:00.000Z",
    finishedAt: null,
    previewGeneratedAt: null,
    previewVersion: 0,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: null,
    status: "DRAFT",
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

function previewWithConflicts(): ImportPreview {
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
    changesSincePreviousVersion: { changedCount: 0, disappearedCount: 0, newCount: 19 },
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
        imported: 30,
        needsReview: 0,
        pending: 5,
        skipped: 0,
      },
      {
        category: "CUSTOMER",
        failed: 1,
        imported: 10,
        needsReview: 2,
        pending: 0,
        skipped: 0,
      },
    ],
    counts: { failed: 1, imported: 40, needsReview: 2, pending: 5, skipped: 0 },
    finishedAt: null,
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

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <ImportsScreen />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setImportCategorySelection.mockResolvedValue({
    category: "SERVICE",
    selected: true,
    sessionId: "session-1",
  });
});

describe("ShellConfigProvider + conexão da origem não excede a profundidade de atualização", () => {
  test("digita continuamente em todos os campos do formulário", async () => {
    getImportState.mockResolvedValue(availableStateFixture());
    const user = userEvent.setup();

    renderScreen();

    await screen.findByRole("heading", { name: "Entre no Minha Agenda" });
    await user.type(
      screen.getByLabelText("E-mail do Minha Agenda"),
      "camila@example.com",
    );
    await user.type(screen.getByLabelText("Senha do Minha Agenda"), "super-secret");

    expect(screen.getByLabelText("Senha do Minha Agenda")).toHaveValue("super-secret");
    expect(startImport).not.toHaveBeenCalled();
  });
});

describe("ShellConfigProvider + análise e seleção não excede a profundidade de atualização", () => {
  test("alterna repetidamente entre resumo e seleção, e marca/desmarca categorias continuamente", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    analyzeImport.mockResolvedValue(previewWithConflicts());
    const user = userEvent.setup();

    renderScreen();

    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "Escolher o que importar" }));
      await user.click(screen.getByRole("button", { name: "Voltar" }));
    }

    await user.click(screen.getByRole("button", { name: "Escolher o que importar" }));
    const [firstCheckbox] = screen.getAllByRole("checkbox");
    for (let i = 0; i < 4; i += 1) {
      await user.click(firstCheckbox);
    }
    await user.click(screen.getByRole("button", { name: "Revisar conflitos" }));
    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(
      screen.getByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
    ).toBeInTheDocument();
  });
});

describe("ShellConfigProvider + conflitos por item não excede a profundidade de atualização", () => {
  test("expande, alterna a decisão e recolhe repetidamente sem confirmar", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    analyzeImport.mockResolvedValue(previewWithConflicts());
    listImportItems.mockResolvedValue({
      category: "SERVICE",
      items: [conflictItemFixture()],
      limit: 20,
      offset: 0,
      sessionId: "session-1",
      total: 1,
    });
    const user = userEvent.setup();

    renderScreen();

    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
    await user.click(screen.getByRole("button", { name: "Revisar conflitos" }));
    await user.click(await screen.findByRole("button", { name: /serviços/ }));

    for (let i = 0; i < 4; i += 1) {
      await user.click(await screen.findByRole("button", { name: "Resolver" }));
      await user.click(screen.getByRole("radio", { name: "Incluir mesmo assim" }));
      await user.click(screen.getByRole("radio", { name: "Não importar este item" }));
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
    }

    expect(decideImportItem).not.toHaveBeenCalled();
  });
});

describe("ShellConfigProvider + execução não excede a profundidade de atualização", () => {
  test("abre e fecha a confirmação de trocar de conta repetidamente", async () => {
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    const user = userEvent.setup();

    renderScreen();

    // Espera a leitura de progresso assentar: `ReplaceAccountZone` também
    // aparece na tela de carregamento, e um `findBy` ansioso pegaria o botão
    // da renderização transitória em vez do da tela final.
    await screen.findByRole("heading", { name: "Importação parcial em andamento" });
    const replaceTrigger = screen.getByRole("button", { name: "Conectar outra conta" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(replaceTrigger);
      await user.click(
        await screen.findByRole("button", { name: "Continuar esta importação" }),
      );
    }

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(startImport).not.toHaveBeenCalled();
  });

  test("abre e fecha o diálogo de conclusão repetidamente sem confirmar", async () => {
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    const user = userEvent.setup();

    renderScreen();

    const completeTrigger = await screen.findByRole("button", {
      name: "Concluir importação",
    });
    for (let i = 0; i < 4; i += 1) {
      await user.click(completeTrigger);
      const dialog = await screen.findByRole("dialog", {
        name: "Esta é sua única importação.",
      });
      await user.click(
        within(dialog).getByRole("button", { name: "Revisar antes de concluir" }),
      );
    }

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(completeImport).not.toHaveBeenCalled();
  });

  test("entra e sai da revisão de itens pendentes repetidamente", async () => {
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
    const user = userEvent.setup();

    renderScreen();

    for (let i = 0; i < 4; i += 1) {
      await user.click(await screen.findByRole("button", { name: "Revisar itens" }));
      await user.click(await screen.findByRole("button", { name: "Voltar" }));
    }

    expect(
      await screen.findByRole("heading", { name: "O que ainda não entrou (8)" }),
    ).toBeInTheDocument();
  });
});
