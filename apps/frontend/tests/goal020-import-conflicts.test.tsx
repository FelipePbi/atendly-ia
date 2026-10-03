// @vitest-environment jsdom
/**
 * Goal020 (WU-007): conflitos resolvidos por item.
 *
 * O que esta suíte prova:
 *
 * - as cinco decisões do contrato (`INCLUDE`, `MERGE_WITH_EXISTING`,
 *   `CREATE_NEW`, `KEEP_EXISTING`, `EXCLUDE`) são alcançáveis pela UI para uma
 *   categoria que aceita mesclagem, com `targetInternalId` exigido antes de
 *   confirmar `MERGE_WITH_EXISTING`/`KEEP_EXISTING`;
 * - o conflito é explicado em linguagem leiga (nunca o código bruto do
 *   classificador);
 * - conflito pendente não impede `Importar tudo`: o botão continua
 *   disponível ao lado do aviso de conflitos;
 * - uma segunda decisão sobre item já decidido (`409
 *   IMPORT_ITEM_ALREADY_DECIDED`) vira estado explicado na própria linha, não
 *   um erro genérico.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type ImportItem,
  type ImportLiveSession,
  type ImportPreviewSnapshot,
  type ImportProgress,
  type ImportState,
} from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getImportState = vi.fn();
const analyzeImport = vi.fn();
const getImportPreview = vi.fn();
const executeImport = vi.fn();
const listImportItems = vi.fn();
const decideImportItem = vi.fn();
const getImportProgress = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration: vi.fn() },
    settings: { get: () => new Promise<never>(() => undefined) },
    migration: {
      analyzeImport,
      decideImportItem,
      executeImport,
      getImportPreview,
      getImportProgress,
      getImportState,
      listImportItems,
      setImportCategorySelection: vi.fn(),
      startImport: vi.fn(),
    },
  }),
}));

/**
 * Progresso mínimo para as telas de execução (Goal020/WU-08), que entram em
 * cena quando esta suíte leva a sessão a um estado pós-análise. O que elas
 * mostram é provado em `goal020-import-run.test.tsx`.
 */
function progressFixture(): ImportProgress {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 0, skipped: 0 },
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
  };
}

/** Sessão já analisada (`READY`, preview gravado); a análise em si é provada em `goal061-import-async.test.tsx`. */
function sessionFixture(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 1, pending: 11, skipped: 0 },
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

function previewFixture(): ImportPreviewSnapshot {
  return {
    categories: [
      {
        category: "SERVICE",
        discoveredCount: 12,
        failedCount: 0,
        limitationCode: null,
        limitationDetail: null,
        needsReviewCount: 1,
        pendingCount: 11,
        readCount: 12,
        skippedCount: 0,
        sourceReportedCount: 12,
        sourceSupported: true,
        importedCount: 0,
      },
      {
        category: "CUSTOMER",
        discoveredCount: 7,
        failedCount: 0,
        limitationCode: null,
        limitationDetail: null,
        needsReviewCount: 0,
        pendingCount: 7,
        readCount: 7,
        skippedCount: 0,
        sourceReportedCount: 7,
        sourceSupported: true,
        importedCount: 0,
      },
    ],
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    sessionId: "session-1",
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
    reasonDetail:
      "Mais de um serviço já cadastrado tem o mesmo nome: escolha qual corresponde.",
    status: "NEEDS_REVIEW",
    ...overrides,
  };
}

function stateWithSession(session: ImportLiveSession): ImportState {
  return {
    history: null,
    right: { available: true, sessionId: session.sessionId, completedAt: null },
    session,
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
  getImportProgress.mockResolvedValue(progressFixture());
});

describe("aviso de conflitos não bloqueia o restante", () => {
  test("Importar tudo continua disponível ao lado do aviso de conflitos pendentes", async () => {
    const user = userEvent.setup();
    getImportState
      .mockResolvedValueOnce(stateWithSession(sessionFixture()))
      .mockResolvedValueOnce(
        stateWithSession(sessionFixture({ status: "PARTIAL" })),
      );
    getImportPreview.mockResolvedValue(previewFixture());
    executeImport.mockResolvedValue({
      categories: [],
      counts: { failed: 0, imported: 18, needsReview: 1, pending: 0, skipped: 0 },
      leaseLost: false,
      leaseOwner: "worker-1",
      previewVersion: 1,
      processed: 18,
      sessionId: "session-1",
      status: "READY",
    });
    renderScreen();

    expect(
      await screen.findByText(/1 item precisa da sua decisão\./),
    ).toBeInTheDocument();
    const importButton = screen.getByRole("button", { name: "Importar tudo" });
    expect(importButton).toBeEnabled();

    await user.click(importButton);

    await waitFor(() =>
      expect(executeImport).toHaveBeenCalledWith(
        "session-1",
        { previewVersion: 1 },
        expect.any(String),
      ),
    );
  });
});

describe("conflitos resolvidos por item", () => {
  test("explica o conflito em linguagem leiga e oferece as cinco decisões, exigindo o cadastro alvo em MERGE_WITH_EXISTING", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    getImportPreview.mockResolvedValue(previewFixture());
    listImportItems.mockResolvedValue({
      category: "SERVICE",
      items: [conflictItemFixture()],
      limit: 20,
      offset: 0,
      sessionId: "session-1",
      total: 1,
    });
    decideImportItem.mockResolvedValue({
      decision: {
        category: "SERVICE",
        decidedAt: "2026-09-15T10:10:00.000Z",
        decidedBy: "user-1",
        decision: "MERGE_WITH_EXISTING",
        externalId: "ext-42",
        id: "decision-1",
        itemId: "item-42",
        noteCode: null,
        scope: "ITEM",
        targetInternalId: "service-9",
      },
      item: conflictItemFixture({ internalId: "service-9", status: "IMPORTED" }),
    });
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Revisar conflitos" }),
    );
    await screen.findByRole("heading", { name: "Itens que precisam da sua decisão" });

    await user.click(screen.getByRole("button", { name: /serviços/ }));
    await screen.findByRole("heading", { name: "serviços" });

    expect(
      await screen.findByText(
        "Mais de um serviço já cadastrado tem esse mesmo nome. Escolha qual corresponde, ou crie um novo.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("SERVICE_MATCH_AMBIGUOUS")).not.toBeInTheDocument();
    expect(
      listImportItems,
    ).toHaveBeenCalledWith(
      "session-1",
      "SERVICE",
      { status: "NEEDS_REVIEW", limit: 20, offset: 0 },
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "Resolver" }));

    expect(
      screen.getByRole("radio", { name: "Incluir mesmo assim" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Mesclar com um cadastro existente" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Criar um novo cadastro" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: "Manter o cadastro existente (não importar este)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Não importar este item" }),
    ).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: "Confirmar decisão" });
    expect(confirmButton).toBeDisabled();

    await user.click(
      screen.getByRole("radio", { name: "Mesclar com um cadastro existente" }),
    );
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(
      await screen.findByText("Informe o identificador do cadastro existente."),
    ).toBeInTheDocument();
    expect(decideImportItem).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("Identificador do cadastro existente"),
      "service-9",
    );
    await user.click(confirmButton);

    await waitFor(() =>
      expect(decideImportItem).toHaveBeenCalledWith(
        "session-1",
        "item-42",
        { decision: "MERGE_WITH_EXISTING", targetInternalId: "service-9" },
        expect.any(String),
      ),
    );
  });

  test("segunda decisão sobre item já decidido vira estado explicado na linha, não um erro genérico", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    getImportPreview.mockResolvedValue(previewFixture());
    listImportItems.mockResolvedValue({
      category: "SERVICE",
      items: [conflictItemFixture()],
      limit: 20,
      offset: 0,
      sessionId: "session-1",
      total: 1,
    });
    decideImportItem.mockRejectedValue(
      new BffHttpError({
        code: "IMPORT_ITEM_ALREADY_DECIDED",
        message: "This item already has a decision; a decision is registered once.",
        requestId: "req-1",
        status: 409,
      }),
    );
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Revisar conflitos" }),
    );
    await user.click(await screen.findByRole("button", { name: /serviços/ }));
    await screen.findByRole("heading", { name: "serviços" });
    await user.click(screen.getByRole("button", { name: "Resolver" }));
    await user.click(screen.getByRole("radio", { name: "Não importar este item" }));
    await user.click(screen.getByRole("button", { name: "Confirmar decisão" }));

    expect(
      await screen.findByText("Este item já foi decidido antes de você confirmar."),
    ).toBeInTheDocument();
    expect(screen.getByText("Já decidido")).toBeInTheDocument();
    expect(
      screen.queryByText("Não foi possível registrar essa decisão agora. Tente novamente."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Não importar este item" }),
    ).not.toBeInTheDocument();
  });

  test("axe: revisão de conflitos sem violações", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    getImportPreview.mockResolvedValue(previewFixture());
    listImportItems.mockResolvedValue({
      category: "SERVICE",
      items: [conflictItemFixture()],
      limit: 20,
      offset: 0,
      sessionId: "session-1",
      total: 1,
    });
    const user = userEvent.setup();
    const { container } = renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Revisar conflitos" }),
    );
    await user.click(await screen.findByRole("button", { name: /serviços/ }));
    await screen.findByRole("heading", { name: "serviços" });
    await expectNoA11yViolations(container);
  });
});
