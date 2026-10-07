// @vitest-environment jsdom
/**
 * Goal120 (WU-02): as recusas da importação chegam às telas como o BFF as
 * entrega — embrulhadas em `UPSTREAM_ERROR`, com o código de domínio em
 * `details.upstreamCode`. Todo erro montado aqui tem esse envelope; o código
 * de domínio nunca está em `error.code`.
 *
 * Cada teste falha se a tela voltar a comparar `error.code` cru: o envelope
 * real cairia na mensagem genérica.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type ImportCompletion,
  type ImportItem,
  type ImportLiveSession,
  type ImportPreviewSnapshot,
  type ImportProgress,
  type ImportState,
} from "@/data";
import { ConnectSourceScreen } from "@/features/imports/ConnectSourceScreen";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const connectIntegration = vi.fn();
const startImport = vi.fn();
const getImportState = vi.fn();
const analyzeImport = vi.fn();
const getImportPreview = vi.fn();
const executeImport = vi.fn();
const getImportProgress = vi.fn();
const completeImport = vi.fn();
const listImportItems = vi.fn();
const decideImportItem = vi.fn();

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
      setImportCategorySelection: vi.fn(),
      startImport,
    },
  }),
}));

const ENGLISH_MESSAGE = "Upstream refusal in English that must never reach the screen.";

/** A recusa como o BFF a entrega: `UPSTREAM_ERROR` + `details.upstreamCode`. */
function upstreamRefusal(upstreamCode: string, status = 409): BffHttpError {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: {
      upstream: "scheduling",
      upstreamCode,
      upstreamDetails: {},
      upstreamRequestId: "up-req-1",
    },
    message: ENGLISH_MESSAGE,
    requestId: "req-bff-1",
    status,
  });
}

function sessionFixture(
  overrides: Partial<ImportLiveSession> = {},
): ImportLiveSession {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 0, skipped: 0 },
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

function stateWithSession(session: ImportLiveSession): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: session.sessionId },
    session,
  };
}

function cleanProgress(): ImportProgress {
  return {
    categories: [
      {
        category: "SERVICE",
        failed: 0,
        failedReasons: [],
        imported: 42,
        needsReview: 0,
        pending: 0,
        skipped: 0,
      },
    ],
    counts: { failed: 0, imported: 42, needsReview: 0, pending: 0, skipped: 0 },
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "READY",
  };
}

function previewFixture(): ImportPreviewSnapshot {
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

function conflictItem(): ImportItem {
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
  };
}

function completion(): ImportCompletion {
  return {
    categories: [],
    completedAt: "2026-09-15T12:00:00.000Z",
    completedBy: "user-1",
    counts: { failed: 0, imported: 42, needsReview: 0, pending: 0, skipped: 0 },
    pendingAcceptance: null,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    status: "COMPLETED",
  };
}

function renderImports() {
  return render(
    <ShellConfigProvider>
      <ImportsScreen />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getImportProgress.mockResolvedValue(cleanProgress());
  getImportPreview.mockResolvedValue(previewFixture());
});

describe("conexão: IMPORT_ALREADY_COMPLETED no envelope real", () => {
  test("mostra a mensagem própria, sem repetir a mensagem em inglês", async () => {
    const user = userEvent.setup();
    connectIntegration.mockRejectedValue(
      upstreamRefusal("IMPORT_ALREADY_COMPLETED"),
    );
    render(<ConnectSourceScreen onConnected={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await user.type(
      await screen.findByLabelText("E-mail do Minha Agenda"),
      "camila@example.com",
    );
    await user.type(screen.getByLabelText("Senha"), "super-secret");
    await user.click(screen.getByRole("button", { name: "Analisar meus dados" }));

    expect(
      await screen.findByText(
        "Este negócio já concluiu sua única importação do Minha Agenda.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(ENGLISH_MESSAGE)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Não foi possível conectar ao Minha Agenda agora/),
    ).not.toBeInTheDocument();
  });
});

describe("conclusão: recusas no envelope real", () => {
  test("IMPORT_ALREADY_COMPLETED dá a mensagem própria", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(sessionFixture({ startedAt: "2026-09-15T10:10:00.000Z" })),
    );
    completeImport.mockRejectedValue(upstreamRefusal("IMPORT_ALREADY_COMPLETED"));
    renderImports();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );

    expect(
      await screen.findByText("Esta importação já foi concluída."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Não foi possível concluir agora/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(ENGLISH_MESSAGE)).not.toBeInTheDocument();
  });

  test("IMPORT_SESSION_NOT_COMPLETABLE dá a mensagem própria", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(sessionFixture({ startedAt: "2026-09-15T10:10:00.000Z" })),
    );
    completeImport.mockRejectedValue(
      upstreamRefusal("IMPORT_SESSION_NOT_COMPLETABLE"),
    );
    renderImports();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );

    expect(
      await screen.findByText(
        "Esta importação ainda não pode ser concluída. Aguarde o fim do processamento.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Não foi possível concluir agora/),
    ).not.toBeInTheDocument();
  });

  test("outro código no envelope segue na mensagem genérica", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(sessionFixture({ startedAt: "2026-09-15T10:10:00.000Z" })),
    );
    completeImport.mockRejectedValue(upstreamRefusal("SOMETHING_ELSE", 502));
    renderImports();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );

    expect(
      await screen.findByText(/Não foi possível concluir agora/),
    ).toBeInTheDocument();
  });

  test("IMPORT_PENDING_ACCEPTANCE_REQUIRED reabre a confirmação sem reenviar acceptPending", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(sessionFixture({ startedAt: "2026-09-15T10:10:00.000Z" })),
    );
    completeImport.mockRejectedValueOnce(
      upstreamRefusal("IMPORT_PENDING_ACCEPTANCE_REQUIRED"),
    );
    renderImports();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Esta é sua única importação." }),
    ).toBeInTheDocument();
    expect(completeImport).toHaveBeenCalledTimes(1);
    expect(completeImport).toHaveBeenCalledWith("session-1", {}, expect.any(String));
    expect(
      screen.queryByText(/Não foi possível concluir agora/),
    ).not.toBeInTheDocument();

    completeImport.mockResolvedValue(completion());
    getImportState.mockResolvedValue({
      history: null,
      right: {
        available: false,
        completedAt: "2026-09-15T12:00:00.000Z",
        sessionId: "session-1",
      },
      session: null,
    } satisfies ImportState);
    await user.click(
      within(dialog).getByRole("button", { name: "Concluir importação" }),
    );
    await waitFor(() => expect(completeImport).toHaveBeenCalledTimes(2));
    expect(completeImport.mock.calls[1][1]).toEqual({ acceptPending: true });
  });
});

describe("conflitos: IMPORT_ITEM_ALREADY_DECIDED no envelope real", () => {
  test("chama onAlreadyDecided e mostra o item como já decidido, sem a mensagem genérica", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(
        sessionFixture({
          counts: { failed: 0, imported: 0, needsReview: 1, pending: 11, skipped: 0 },
        }),
      ),
    );
    listImportItems.mockResolvedValue({
      category: "SERVICE",
      items: [conflictItem()],
      limit: 20,
      offset: 0,
      sessionId: "session-1",
      total: 1,
    });
    decideImportItem.mockRejectedValue(
      upstreamRefusal("IMPORT_ITEM_ALREADY_DECIDED"),
    );
    renderImports();

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
      screen.queryByText(
        "Não foi possível registrar essa decisão agora. Tente novamente.",
      ),
    ).not.toBeInTheDocument();
  });

  test("outro código no envelope segue na mensagem genérica", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(
        sessionFixture({
          counts: { failed: 0, imported: 0, needsReview: 1, pending: 11, skipped: 0 },
        }),
      ),
    );
    listImportItems.mockResolvedValue({
      category: "SERVICE",
      items: [conflictItem()],
      limit: 20,
      offset: 0,
      sessionId: "session-1",
      total: 1,
    });
    decideImportItem.mockRejectedValue(upstreamRefusal("SOMETHING_ELSE", 502));
    renderImports();

    await user.click(
      await screen.findByRole("button", { name: "Revisar conflitos" }),
    );
    await user.click(await screen.findByRole("button", { name: /serviços/ }));
    await screen.findByRole("heading", { name: "serviços" });
    await user.click(screen.getByRole("button", { name: "Resolver" }));
    await user.click(screen.getByRole("radio", { name: "Não importar este item" }));
    await user.click(screen.getByRole("button", { name: "Confirmar decisão" }));

    expect(
      await screen.findByText(
        "Não foi possível registrar essa decisão agora. Tente novamente.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Este item já foi decidido antes de você confirmar."),
    ).not.toBeInTheDocument();
  });
});
