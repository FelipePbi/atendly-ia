// @vitest-environment jsdom
/**
 * Goal020 (WU-008): execução, progresso, pendências e conclusão definitiva.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - a execução envia a `previewVersion` que a tela de preview mostrou ao
 *   negócio — não a versão que ela descobriu depois;
 * - preview obsoleto (`409 IMPORT_PREVIEW_STALE`) vira estado de produto com
 *   saída própria ("analisar de novo"), nunca uma frase de erro genérica;
 * - o progresso exibido vem de `GET .../progress` e nunca de contagem local:
 *   os números da tela contradizem de propósito os da sessão lida antes;
 * - a leitura para em estado terminal — ela não consulta para sempre;
 * - `PARTIAL` é estado legítimo: o que faltou aparece por categoria e o que
 *   ainda está pendente é reprocessável na mesma sessão;
 * - concluir com itens não importados exige a confirmação que o vault define,
 *   palavra por palavra, incluindo "Esta é sua única importação.";
 * - sem pendência, essa confirmação não aparece e `acceptPending` não é
 *   enviado;
 * - dupla submissão não conclui duas vezes, e a retentativa da mesma tentativa
 *   reusa a mesma `Idempotency-Key`;
 * - depois de concluída, nenhum caminho da interface oferece nova importação.
 *
 * Cada teste falha se o comportamento for removido: uma tela que voltasse a
 * somar progresso localmente, a concluir sem confirmação ou a oferecer uma
 * segunda importação quebra aqui.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type ImportCompletion,
  type ImportHistory,
  type ImportLiveSession,
  type ImportPreview,
  type ImportProgress,
  type ImportState,
} from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getImportState = vi.fn();
const analyzeImport = vi.fn();
const executeImport = vi.fn();
const getImportProgress = vi.fn();
const completeImport = vi.fn();
const listImportItems = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration: vi.fn() },
    migration: {
      analyzeImport,
      completeImport,
      decideImportItem: vi.fn(),
      executeImport,
      getImportProgress,
      getImportState,
      listImportItems,
      setImportCategorySelection: vi.fn(),
      startImport: vi.fn(),
    },
  }),
}));

function sessionFixture(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 0, skipped: 0 },
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

/** Sessão que já teve uma passada de execução: `startedAt` escrito. */
function runningSessionFixture(
  overrides: Partial<ImportLiveSession> = {},
): ImportLiveSession {
  return sessionFixture({
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
    ...overrides,
  });
}

function previewFixture(previewVersion = 7): ImportPreview {
  return {
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
    changesSincePreviousVersion: { changedCount: 0, disappearedCount: 0, newCount: 12 },
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion,
    sessionId: "session-1",
  };
}

function progressFixture(overrides: Partial<ImportProgress> = {}): ImportProgress {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 0, skipped: 0 },
    finishedAt: null,
    previewVersion: 7,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
    ...overrides,
  };
}

/** Passada terminada com o que não entrou: 5 pendentes, 2 em revisão, 1 falha. */
function partialProgressFixture(): ImportProgress {
  return progressFixture({
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
        failed: 0,
        imported: 10,
        needsReview: 2,
        pending: 0,
        skipped: 0,
      },
      {
        category: "FUTURE_APPOINTMENT",
        failed: 1,
        imported: 2,
        needsReview: 0,
        pending: 0,
        skipped: 0,
      },
    ],
    counts: { failed: 1, imported: 42, needsReview: 2, pending: 5, skipped: 0 },
    status: "PARTIAL",
  });
}

/** Passada terminada sem deixar nada para trás. */
function cleanProgressFixture(): ImportProgress {
  return progressFixture({
    categories: [
      {
        category: "SERVICE",
        failed: 0,
        imported: 42,
        needsReview: 0,
        pending: 0,
        skipped: 0,
      },
    ],
    counts: { failed: 0, imported: 42, needsReview: 0, pending: 0, skipped: 0 },
    status: "READY",
  });
}

function completionFixture(
  overrides: Partial<ImportCompletion> = {},
): ImportCompletion {
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
    ...overrides,
  };
}

function historyFixture(): ImportHistory {
  return {
    ...completionFixture(),
    finishedAt: "2026-09-15T12:00:00.000Z",
    startedAt: "2026-09-15T10:10:00.000Z",
  };
}

function stateWithSession(session: ImportLiveSession): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: session.sessionId },
    session,
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

function httpError(code: string, status = 409): BffHttpError {
  return new BffHttpError({ code, message: code, requestId: "req-1", status });
}

/**
 * Com timers falsos, a montagem da tela passa por duas promessas (estado e
 * progresso) antes da primeira leitura. Este laço espera a leitura acontecer
 * sem esperar tempo nenhum: o que os testes de parada medem é o intervalo de
 * polling, não a montagem.
 */
async function flushUntilFirstRead() {
  for (let tick = 0; tick < 20 && getImportProgress.mock.calls.length === 0; tick += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
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

afterEach(() => {
  vi.useRealTimers();
});

describe("executar é executar o preview aprovado", () => {
  test("envia a previewVersion que a tela de preview mostrou", async () => {
    const user = userEvent.setup();
    getImportState
      .mockResolvedValueOnce(stateWithSession(sessionFixture()))
      .mockResolvedValueOnce(stateWithSession(runningSessionFixture()));
    analyzeImport.mockResolvedValue(previewFixture(7));
    executeImport.mockResolvedValue({
      categories: [],
      counts: { failed: 0, imported: 12, needsReview: 0, pending: 0, skipped: 0 },
      leaseLost: false,
      leaseOwner: "worker-1",
      previewVersion: 7,
      processed: 12,
      sessionId: "session-1",
      status: "READY",
    });
    getImportProgress.mockResolvedValue(cleanProgressFixture());
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Importar tudo" }));

    await waitFor(() =>
      expect(executeImport).toHaveBeenCalledWith(
        "session-1",
        { previewVersion: 7 },
        expect.any(String),
      ),
    );
  });

  test("preview obsoleto vira estado de produto com saída para analisar de novo", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    analyzeImport.mockResolvedValue(previewFixture(7));
    executeImport.mockRejectedValue(httpError("IMPORT_PREVIEW_STALE"));
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Importar tudo" }));

    expect(
      await screen.findByRole("heading", {
        name: "Seus dados mudaram desde esta análise",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nada foi importado. Sua agenda na Atendly continua como estava."),
    ).toBeInTheDocument();
    // Estado, não erro genérico: a saída é ver de novo o que existe agora.
    expect(screen.queryByText(/Não foi possível importar agora/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Analisar de novo" }));

    await waitFor(() => expect(analyzeImport).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
    ).toBeInTheDocument();
  });
});

describe("progresso é fato do banco", () => {
  test("os números vêm de GET .../progress, não das contagens da sessão lida", async () => {
    getImportState.mockResolvedValue(
      // A sessão diz 0 importados; o progresso diz 42. A tela mostra o
      // progresso: um contador local teria mostrado o da sessão.
      stateWithSession(
        runningSessionFixture({
          counts: { failed: 0, imported: 0, needsReview: 0, pending: 47, skipped: 0 },
        }),
      ),
    );
    getImportProgress.mockResolvedValue(partialProgressFixture());
    renderScreen();

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "45");
    expect(bar).toHaveAttribute("aria-valuemax", "50");
    expect(
      screen.getByText(/45 de 50 registros processados · 42 importados/),
    ).toBeInTheDocument();
    expect(getImportProgress).toHaveBeenCalledWith("session-1", expect.anything());
  });

  test("a leitura para em estado terminal: não consulta para sempre", async () => {
    vi.useFakeTimers();
    getImportState.mockResolvedValue(
      stateWithSession(runningSessionFixture({ status: "FAILED" })),
    );
    getImportProgress.mockResolvedValue(progressFixture({ status: "FAILED" }));
    renderScreen();

    await flushUntilFirstRead();
    const callsAfterFirstRead = getImportProgress.mock.calls.length;
    expect(callsAfterFirstRead).toBe(1);
    // Muito depois do intervalo de leitura: nada de novo foi pedido.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getImportProgress.mock.calls.length).toBe(callsAfterFirstRead);
  });

  test("enquanto o banco disser EXECUTING a leitura continua, e para quando ele parar", async () => {
    vi.useFakeTimers();
    getImportState.mockResolvedValue(
      stateWithSession(runningSessionFixture({ status: "EXECUTING" })),
    );
    getImportProgress
      .mockResolvedValueOnce(progressFixture({ status: "EXECUTING" }))
      .mockResolvedValue(partialProgressFixture());
    renderScreen();

    await flushUntilFirstRead();
    expect(getImportProgress).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(getImportProgress).toHaveBeenCalledTimes(2);
    // A segunda leitura veio `PARTIAL`: a terceira nunca acontece.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getImportProgress).toHaveBeenCalledTimes(2);
  });
});

describe("PARTIAL é estado legítimo", () => {
  test("mostra o que faltou por categoria e reprocessa os pendentes na sessão", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    executeImport.mockResolvedValue({
      categories: [],
      counts: { failed: 1, imported: 47, needsReview: 2, pending: 0, skipped: 0 },
      leaseLost: false,
      leaseOwner: "worker-1",
      previewVersion: 7,
      processed: 5,
      sessionId: "session-1",
      status: "PARTIAL",
    });
    renderScreen();

    expect(
      await screen.findByRole("heading", { name: "O que ainda não entrou (8)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("5 ainda não processados")).toBeInTheDocument();
    expect(screen.getByText("2 esperando sua decisão")).toBeInTheDocument();
    expect(screen.getByText("1 não importados")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Importar os 5 que faltam" }),
    );

    // Reprocessar é executar de novo a mesma versão de preview da sessão.
    await waitFor(() =>
      expect(executeImport).toHaveBeenCalledWith(
        "session-1",
        { previewVersion: 7 },
        expect.any(String),
      ),
    );
    // E o número volta a sair do banco, nunca de uma soma local.
    await waitFor(() => expect(getImportProgress.mock.calls.length).toBeGreaterThan(1));
  });

  test("os itens que esperam decisão são alcançáveis a partir do que faltou", async () => {
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
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Revisar itens" }));

    expect(
      await screen.findByRole("heading", {
        name: "Itens que precisam da sua decisão",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clientes/ })).toBeInTheDocument();
  });

  test("axe: execução com pendências sem violações", async () => {
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    const { container } = renderScreen();

    await screen.findByRole("heading", { name: "O que ainda não entrou (8)" });
    await expectNoA11yViolations(container);
  });
});

describe("concluir é definitivo", () => {
  test("com itens não importados, exige a confirmação do vault antes de enviar acceptPending", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    completeImport.mockResolvedValue(
      completionFixture({
        pendingAcceptance: {
          acceptedAt: "2026-09-15T12:00:00.000Z",
          acceptedBy: "user-1",
          pendingCount: 8,
        },
      }),
    );
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );

    // A copy do vault, palavra por palavra.
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Esta é sua única importação." }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Depois de concluir, não será possível importar novamente do Minha Agenda. Alguns registros não serão importados. Deseja concluir mesmo assim?",
      ),
    ).toBeInTheDocument();
    // Abrir a confirmação não conclui nada.
    expect(completeImport).not.toHaveBeenCalled();

    getImportState.mockResolvedValue(completedState());
    await user.click(
      within(dialog).getByRole("button", { name: "Concluir mesmo assim" }),
    );

    await waitFor(() =>
      expect(completeImport).toHaveBeenCalledWith(
        "session-1",
        { acceptPending: true },
        expect.any(String),
      ),
    );
  });

  test("recusar a confirmação mantém a sessão como estava, sem concluir", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Revisar antes de concluir" }),
    );

    expect(completeImport).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "O que ainda não entrou (8)" }),
    ).toBeInTheDocument();
  });

  test("sem pendências não há confirmação, e acceptPending não é enviado", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(runningSessionFixture({ status: "READY" })),
    );
    getImportProgress.mockResolvedValue(cleanProgressFixture());
    completeImport.mockResolvedValue(completionFixture());
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Esta é sua única importação."),
    ).not.toBeInTheDocument();
    getImportState.mockResolvedValue(completedState());
    await waitFor(() =>
      expect(completeImport).toHaveBeenCalledWith("session-1", {}, expect.any(String)),
    );
    expect(completeImport.mock.calls[0][1]).not.toHaveProperty("acceptPending");
  });

  test("dupla submissão não conclui duas vezes", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(runningSessionFixture({ status: "READY" })),
    );
    getImportProgress.mockResolvedValue(cleanProgressFixture());
    // A conclusão fica em voo: é exatamente a janela do segundo clique.
    completeImport.mockReturnValue(new Promise(() => {}));
    renderScreen();

    const button = await screen.findByRole("button", { name: "Concluir importação" });
    await user.click(button);
    await user.click(button);
    await user.click(
      await screen.findByRole("button", { name: "Concluindo..." }),
    );

    expect(completeImport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Concluindo..." })).toBeDisabled();
  });

  test("dupla submissão na confirmação também não conclui duas vezes", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    completeImport.mockReturnValue(new Promise(() => {}));
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );
    const confirm = screen.getByRole("button", { name: "Concluir mesmo assim" });
    await user.click(confirm);
    await user.click(screen.getByRole("button", { name: "Concluindo..." }));

    expect(completeImport).toHaveBeenCalledTimes(1);
  });

  test("a retentativa da mesma tentativa reusa a mesma Idempotency-Key", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(runningSessionFixture({ status: "READY" })),
    );
    getImportProgress.mockResolvedValue(cleanProgressFixture());
    completeImport.mockRejectedValueOnce(httpError("UPSTREAM_ERROR", 502));
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );
    expect(
      await screen.findByText(/Não foi possível concluir agora/),
    ).toBeInTheDocument();

    completeImport.mockResolvedValue(completionFixture());
    getImportState.mockResolvedValue(completedState());
    await user.click(screen.getByRole("button", { name: "Concluir importação" }));

    await waitFor(() => expect(completeImport).toHaveBeenCalledTimes(2));
    expect(completeImport.mock.calls[1][2]).toBe(completeImport.mock.calls[0][2]);
  });

  /**
   * A regressão que o review da rodada 1 registrou: a chave era criada uma
   * vez e nunca reposta, então a conclusão com `acceptPending` reusava a chave
   * da tentativa sem ele. O domínio inclui `acceptPending` no hash da
   * idempotência — mesma chave, corpo diferente é conflito, e a decisão
   * irreversível ficava sem saída na tela. Corpo diferente, chave nova.
   */
  test("aceitar as pendências depois da recusa usa uma Idempotency-Key nova", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(runningSessionFixture({ status: "READY" })),
    );
    // O banco viu pendência que a última leitura não tinha: a tela pede a
    // confirmação em vez de reenviar `acceptPending` por conta própria.
    getImportProgress.mockResolvedValue(cleanProgressFixture());
    completeImport.mockRejectedValueOnce(
      httpError("IMPORT_PENDING_ACCEPTANCE_REQUIRED"),
    );
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );
    await waitFor(() => expect(completeImport).toHaveBeenCalledTimes(1));
    expect(completeImport.mock.calls[0][1]).toEqual({});

    const dialog = await screen.findByRole("dialog");
    completeImport.mockResolvedValue(
      completionFixture({
        pendingAcceptance: {
          acceptedAt: "2026-09-15T12:00:00.000Z",
          acceptedBy: "user-1",
          pendingCount: 8,
        },
      }),
    );
    getImportState.mockResolvedValue(completedState());
    await user.click(
      within(dialog).getByRole("button", { name: "Concluir mesmo assim" }),
    );

    await waitFor(() => expect(completeImport).toHaveBeenCalledTimes(2));
    expect(completeImport.mock.calls[1][1]).toEqual({ acceptPending: true });
    expect(completeImport.mock.calls[1][2]).not.toBe(
      completeImport.mock.calls[0][2],
    );
  });

  test("retentar a conclusão com acceptPending reusa a chave dessa tentativa", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    completeImport.mockRejectedValueOnce(httpError("UPSTREAM_ERROR", 502));
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Concluir mesmo assim" }),
    );
    expect(
      await within(dialog).findByText(/Não foi possível concluir agora/),
    ).toBeInTheDocument();

    completeImport.mockResolvedValue(completionFixture());
    getImportState.mockResolvedValue(completedState());
    await user.click(
      within(dialog).getByRole("button", { name: "Concluir mesmo assim" }),
    );

    await waitFor(() => expect(completeImport).toHaveBeenCalledTimes(2));
    expect(completeImport.mock.calls[1][2]).toBe(completeImport.mock.calls[0][2]);
  });

  test("depois de concluída, nenhum caminho oferece nova importação", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(runningSessionFixture({ status: "READY" })),
    );
    getImportProgress.mockResolvedValue(cleanProgressFixture());
    completeImport.mockResolvedValue(completionFixture());
    renderScreen();

    await screen.findByRole("button", { name: "Concluir importação" });
    getImportState.mockResolvedValue(completedState());
    await user.click(screen.getByRole("button", { name: "Concluir importação" }));

    expect(
      await screen.findByRole("heading", { name: "Importação concluída" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sua única importação do Minha Agenda. Não é possível importar novamente.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Importar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Conectar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Concluir/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /outra conta/ }),
    ).not.toBeInTheDocument();
  });

  test("falha de leitura depois da conclusão não vira 'tente de novo'", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(runningSessionFixture({ status: "READY" })),
    );
    getImportProgress.mockResolvedValue(cleanProgressFixture());
    completeImport.mockResolvedValue(completionFixture());
    renderScreen();

    await screen.findByRole("button", { name: "Concluir importação" });
    // A conclusão deu certo e é irreversível; só a leitura seguinte falhou.
    getImportState.mockRejectedValue(httpError("UPSTREAM_ERROR", 502));
    await user.click(screen.getByRole("button", { name: "Concluir importação" }));

    expect(
      await screen.findByRole("heading", { name: "Importação concluída" }),
    ).toBeInTheDocument();
    expect(completeImport).toHaveBeenCalledTimes(1);
  });

  test("pendência que só o banco viu abre a confirmação, sem aceitar por conta própria", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(
      stateWithSession(runningSessionFixture({ status: "READY" })),
    );
    getImportProgress.mockResolvedValue(cleanProgressFixture());
    completeImport.mockRejectedValueOnce(
      httpError("IMPORT_PENDING_ACCEPTANCE_REQUIRED"),
    );
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Esta é sua única importação." }),
    ).toBeInTheDocument();
    // A primeira chamada nunca levou `acceptPending`.
    expect(completeImport).toHaveBeenCalledWith("session-1", {}, expect.any(String));
  });

  test("axe: confirmação final sem violações", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(runningSessionFixture()));
    getImportProgress.mockResolvedValue(partialProgressFixture());
    const { container } = renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Concluir importação" }),
    );
    await screen.findByRole("dialog");
    await expectNoA11yViolations(container);
  });
});
