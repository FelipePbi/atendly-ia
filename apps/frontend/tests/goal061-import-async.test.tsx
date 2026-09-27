// @vitest-environment jsdom
/**
 * Goal061 (WU-04): a importação longa não depende de uma requisição —
 * telas de importação acompanham o trabalho em segundo plano em vez de
 * esperar por ele (§6/§7.4).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - montar com sessão já analisada (`READY`, preview gravado) nunca chama
 *   `analyzeImport`, mesmo montando várias vezes;
 * - sessão `DRAFT` sem preview inicia a análise sozinha, uma única vez;
 *   sessão `ANALYZING` nunca inicia de novo, só lê o estado até sair de lá;
 * - "Importar tudo", o início da análise e a retomada ("Importar os N que
 *   faltam") com falha de transporte (rede, timeout ou 5xx) releem o estado
 *   antes de decidir: se o estado relido mostra que o trabalho começou, mostra
 *   o andamento, nunca um texto de erro; se nada começou, mostra o erro;
 * - "Tentar de novo"/"Continuar" aceito com 202 sai de "Análise
 *   indisponível"/"Análise interrompida" e mostra a análise em andamento;
 * - sessão interrompida (`interrupted`) oferece "Continuar", e cada classe de
 *   `lastError` tem texto próprio, nunca a mensagem crua da origem;
 * - motivo de item `FAILED` (`failedReasons`) aparece em linguagem leiga com
 *   a contagem, com texto próprio para cada código que a execução grava;
 *   código desconhecido cai num texto genérico;
 * - categoria com limitação declarada mostra `discoveredCount` também;
 * - todo erro é montado no formato real do BFF (`error.code: "UPSTREAM_ERROR"`
 *   com `error.details.upstreamCode`), e nenhum texto renderizado contém
 *   "token", "OAuth", "API", "HTTP", "lease" nem um código cru.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type ImportLiveSession,
  type ImportPreviewSnapshot,
  type ImportProgress,
  type ImportState,
} from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getImportState = vi.fn();
const analyzeImport = vi.fn();
const getImportPreview = vi.fn();
const setImportCategorySelection = vi.fn();
const executeImport = vi.fn();
const getImportProgress = vi.fn();
const completeImport = vi.fn();
const listImportItems = vi.fn();
const decideImportItem = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration: vi.fn() },
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
      startImport: vi.fn(),
    },
  }),
}));

/** Erro no formato real do BFF (Goal061 §7): sempre `UPSTREAM_ERROR` + `details.upstreamCode`. */
function upstreamError(upstreamCode: string, status = 409): BffHttpError {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: { upstreamCode },
    message: `The upstream reported ${upstreamCode}.`,
    requestId: "req-1",
    status,
  });
}

/** Falha de transporte real (Goal061 §6): o formato que `BffHttpClient` de fato produz. */
function networkError(): BffHttpError {
  return new BffHttpError({
    code: "NETWORK_ERROR",
    message: "Não foi possível acessar a Atendly.",
    requestId: "req-1",
    status: 0,
  });
}

/**
 * 5xx de transporte no formato real do BFF: o BFF devolve `UPSTREAM_ERROR`
 * com `502` quando o Scheduling não respondeu (timeout) ou respondeu 5xx.
 */
function gatewayError(): BffHttpError {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: { cause: "TimeoutError" },
    message: "scheduling request failed.",
    requestId: "req-1",
    status: 502,
  });
}

const TRANSPORT_FAILURES = [
  ["NETWORK_ERROR", networkError],
  ["5xx UPSTREAM_ERROR", gatewayError],
] as const;

function sessionFixture(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
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

function previewFixture(overrides: Partial<ImportPreviewSnapshot> = {}): ImportPreviewSnapshot {
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
      {
        category: "CUSTOMER",
        discoveredCount: 7,
        failedCount: 0,
        importedCount: 0,
        limitationCode: "CUSTOMER_DIRECTORY_UNAVAILABLE",
        limitationDetail: "internal provider detail, never shown to the user",
        needsReviewCount: 0,
        pendingCount: 7,
        readCount: 7,
        skippedCount: 0,
        sourceReportedCount: null,
        sourceSupported: false,
      },
    ],
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    sessionId: "session-1",
    ...overrides,
  };
}

function progressFixture(overrides: Partial<ImportProgress> = {}): ImportProgress {
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
    ...overrides,
  };
}

function stateWithSession(session: ImportLiveSession | null): ImportState {
  return {
    history: null,
    right: { available: true, sessionId: session?.sessionId ?? null, completedAt: null },
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

/** Nenhum texto de produto pode conter linguagem interna crua (Goal061 §6/§7). */
function assertNoLeakedInternals(container: HTMLElement) {
  const text = container.textContent ?? "";
  for (const forbidden of ["token", "OAuth", "API", "HTTP", "lease"]) {
    expect(text).not.toContain(forbidden);
  }
  // Nenhum código de `lastError` ou `failedReasons` cru na tela.
  expect(text).not.toMatch(/IMPORT_[A-Z_]+/);
}

beforeEach(() => {
  // `reset`, não só `clear`: um `mockResolvedValueOnce` que um teste não
  // consumiu não pode vazar para o seguinte e decidir o resultado dele.
  vi.resetAllMocks();
  getImportPreview.mockResolvedValue(previewFixture());
  getImportProgress.mockResolvedValue(progressFixture());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("montar não reanalisa", () => {
  test("sessão READY com preview gravado nunca chama analyzeImport, nem montando três vezes", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { unmount, container } = renderScreen();
      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
      assertNoLeakedInternals(container);
      unmount();
    }

    expect(analyzeImport).not.toHaveBeenCalled();
    expect(getImportPreview).toHaveBeenCalledTimes(3);
  });
});

describe("DRAFT inicia sozinho, ANALYZING só lê o estado", () => {
  test("sessão DRAFT sem preview inicia a análise uma única vez", async () => {
    getImportState
      .mockResolvedValueOnce(stateWithSession(sessionFixture({ previewVersion: 0, status: "DRAFT" })))
      .mockResolvedValueOnce(stateWithSession(sessionFixture({ previewVersion: 1, status: "READY" })));
    analyzeImport.mockResolvedValue({
      previewVersion: 0,
      sessionId: "session-1",
      status: "ANALYZING",
    });
    renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
    ).toBeInTheDocument();
    expect(analyzeImport).toHaveBeenCalledTimes(1);
    expect(analyzeImport).toHaveBeenCalledWith(
      "session-1",
      expect.any(String),
      expect.anything(),
    );
  });

  test("sessão ANALYZING nunca inicia de novo, só lê o estado até sair de ANALYZING", async () => {
    vi.useFakeTimers();
    // As duas primeiras leituras (a da montagem de `ImportsScreen` e a
    // primeira do polling) continuam `ANALYZING`; só a terceira sai de lá —
    // isso prova que a tela lê de novo, sem nunca chamar `analyzeImport`.
    let reads = 0;
    getImportState.mockImplementation(async () => {
      reads += 1;
      return stateWithSession(
        sessionFixture({
          previewVersion: reads <= 2 ? 0 : 1,
          status: reads <= 2 ? "ANALYZING" : "READY",
        }),
      );
    });
    renderScreen();

    for (let tick = 0; tick < 10 && getImportPreview.mock.calls.length === 0; tick += 1) {
      await vi.advanceTimersByTimeAsync(3_000);
    }
    vi.useRealTimers();

    expect(
      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
    ).toBeInTheDocument();
    expect(reads).toBeGreaterThanOrEqual(3);
    expect(analyzeImport).not.toHaveBeenCalled();
  });
});

describe("incerteza não é falha", () => {
  test("falha de transporte com estado relido EXECUTING mostra o andamento, nunca o erro", async () => {
    const user = userEvent.setup();
    getImportState
      .mockResolvedValueOnce(stateWithSession(sessionFixture()))
      .mockResolvedValueOnce(
        stateWithSession(
          sessionFixture({ startedAt: "2026-09-15T10:10:00.000Z", status: "EXECUTING" }),
        ),
      );
    executeImport.mockRejectedValue(networkError());
    getImportProgress.mockResolvedValue(progressFixture({ status: "EXECUTING" }));
    const { container } = renderScreen();

    await user.click(await screen.findByRole("button", { name: "Importar tudo" }));

    expect(
      await screen.findByRole("heading", { name: "Importando seus dados" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Não foi possível importar agora/),
    ).not.toBeInTheDocument();
    assertNoLeakedInternals(container);
  });

  test("falha de transporte com estado relido sem início mostra o erro", async () => {
    const user = userEvent.setup();
    getImportState
      .mockResolvedValueOnce(stateWithSession(sessionFixture()))
      .mockResolvedValueOnce(stateWithSession(sessionFixture()));
    executeImport.mockRejectedValue(networkError());
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Importar tudo" }));

    expect(
      await screen.findByText("Não foi possível importar agora. Tente novamente."),
    ).toBeInTheDocument();
    // Continua na tela de preview, sem passar ao acompanhamento.
    expect(
      screen.getByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
    ).toBeInTheDocument();
  });
});

describe("incerteza não é falha no início da análise", () => {
  const draft = () => sessionFixture({ previewVersion: 0, status: "DRAFT" });

  test.each(TRANSPORT_FAILURES)(
    "%s com estado relido ANALYZING mostra a análise em andamento, nunca o erro",
    async (_label, failure) => {
      getImportState
        .mockResolvedValueOnce(stateWithSession(draft()))
        .mockResolvedValue(
          stateWithSession(sessionFixture({ previewVersion: 0, status: "ANALYZING" })),
        );
      analyzeImport.mockRejectedValue(failure());
      const { container } = renderScreen();

      await waitFor(() => expect(getImportState).toHaveBeenCalledTimes(2));

      expect(
        screen.getByRole("heading", { name: "Analisando seus dados…" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Análise indisponível")).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Não foi possível analisar/),
      ).not.toBeInTheDocument();
      expect(analyzeImport).toHaveBeenCalledTimes(1);
      assertNoLeakedInternals(container);
    },
  );

  test.each(TRANSPORT_FAILURES)(
    "%s com estado relido já analisado mostra o preview, nunca o erro",
    async (_label, failure) => {
      getImportState
        .mockResolvedValueOnce(stateWithSession(draft()))
        .mockResolvedValue(stateWithSession(sessionFixture()));
      analyzeImport.mockRejectedValue(failure());
      renderScreen();

      expect(
        await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Análise indisponível")).not.toBeInTheDocument();
    },
  );

  test.each(TRANSPORT_FAILURES)(
    "%s com estado relido sem início mostra o erro",
    async (_label, failure) => {
      getImportState.mockResolvedValue(stateWithSession(draft()));
      analyzeImport.mockRejectedValue(failure());
      const { container } = renderScreen();

      expect(await screen.findByText("Análise indisponível")).toBeInTheDocument();
      expect(
        screen.getByText("Não foi possível analisar seus dados do Minha Agenda agora."),
      ).toBeInTheDocument();
      expect(getImportState).toHaveBeenCalledTimes(2);
      assertNoLeakedInternals(container);
    },
  );
});

describe("reinício pelo dono não fica mascarado pela tentativa anterior", () => {
  test.each([
    [
      "lastError",
      sessionFixture({
        lastError: { code: "IMPORT_SOURCE_UNAVAILABLE" },
        previewVersion: 0,
        status: "DRAFT",
      }),
      "Análise indisponível",
      "Tentar de novo",
    ],
    [
      "interrupted",
      sessionFixture({ interrupted: true, previewVersion: 0, status: "ANALYZING" }),
      "Análise interrompida",
      "Continuar",
    ],
  ] as const)(
    "sessão com %s, clique aceito com 202 e estado ANALYZING mostra a análise em andamento",
    async (_label, initial, stoppedTitle, actionLabel) => {
      const user = userEvent.setup();
      getImportState
        .mockResolvedValueOnce(stateWithSession(initial))
        .mockResolvedValue(
          stateWithSession(sessionFixture({ previewVersion: 0, status: "ANALYZING" })),
        );
      let accept: (value: unknown) => void = () => {};
      analyzeImport.mockReturnValue(
        new Promise((resolve) => {
          accept = resolve;
        }),
      );
      const { container } = renderScreen();

      expect(await screen.findByText(stoppedTitle)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: actionLabel }));

      // Antes da resposta do início: a tela já é da análise, não da tentativa
      // anterior, e não oferece um segundo clique.
      expect(
        screen.getByRole("heading", { name: "Analisando seus dados…" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(stoppedTitle)).not.toBeInTheDocument();

      accept({ previewVersion: 0, sessionId: "session-1", status: "ANALYZING" });

      await waitFor(() => expect(getImportState.mock.calls.length).toBeGreaterThanOrEqual(2));
      expect(
        await screen.findByRole("heading", { name: "Analisando seus dados…" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(stoppedTitle)).not.toBeInTheDocument();
      expect(screen.queryByText(/não respondeu/)).not.toBeInTheDocument();
      expect(screen.queryByText(/parou no meio do caminho/)).not.toBeInTheDocument();
      expect(analyzeImport).toHaveBeenCalledTimes(1);
      assertNoLeakedInternals(container);
    },
  );
});

describe("incerteza não é falha na retomada da execução", () => {
  const partial = () =>
    sessionFixture({
      counts: { failed: 0, imported: 5, needsReview: 0, pending: 4, skipped: 0 },
      startedAt: "2026-09-15T10:10:00.000Z",
      status: "PARTIAL",
    });
  const partialProgress = () =>
    progressFixture({
      categories: [
        {
          category: "FUTURE_APPOINTMENT",
          failed: 0,
          failedReasons: [],
          imported: 5,
          needsReview: 0,
          pending: 4,
          skipped: 0,
        },
      ],
      counts: { failed: 0, imported: 5, needsReview: 0, pending: 4, skipped: 0 },
    });

  test.each(TRANSPORT_FAILURES)(
    "%s com estado relido EXECUTING mostra o andamento, nunca o erro",
    async (_label, failure) => {
      const user = userEvent.setup();
      getImportState
        .mockResolvedValueOnce(stateWithSession(partial()))
        .mockResolvedValue(
          stateWithSession(sessionFixture({ ...partial(), status: "EXECUTING" })),
        );
      getImportProgress
        .mockResolvedValueOnce(partialProgress())
        .mockResolvedValue(progressFixture({ ...partialProgress(), status: "EXECUTING" }));
      executeImport.mockRejectedValue(failure());
      const { container } = renderScreen();

      await user.click(
        await screen.findByRole("button", { name: "Importar os 4 que faltam" }),
      );

      await waitFor(() => expect(getImportState).toHaveBeenCalledTimes(2));
      expect(
        await screen.findByRole("heading", { name: "Importando seus dados" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/Não foi possível continuar a importação/),
      ).not.toBeInTheDocument();
      assertNoLeakedInternals(container);
    },
  );

  test.each(TRANSPORT_FAILURES)(
    "%s com estado relido sem início mostra o erro",
    async (_label, failure) => {
      const user = userEvent.setup();
      getImportState.mockResolvedValue(stateWithSession(partial()));
      getImportProgress.mockResolvedValue(partialProgress());
      executeImport.mockRejectedValue(failure());
      const { container } = renderScreen();

      await user.click(
        await screen.findByRole("button", { name: "Importar os 4 que faltam" }),
      );

      expect(
        await screen.findByText("Não foi possível continuar a importação agora. Tente novamente."),
      ).toBeInTheDocument();
      expect(getImportState).toHaveBeenCalledTimes(2);
      assertNoLeakedInternals(container);
    },
  );
});

describe("interrompida oferece Continuar, e cada classe de lastError tem texto próprio", () => {
  function runningSession(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
    return sessionFixture({
      startedAt: "2026-09-15T10:10:00.000Z",
      status: "PARTIAL",
      ...overrides,
    });
  }

  test("interrupted mostra Continuar e reinicia a execução", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(runningSession()));
    getImportProgress.mockResolvedValue(
      progressFixture({ interrupted: true, status: "EXECUTING" }),
    );
    executeImport.mockResolvedValue({
      previewVersion: 1,
      sessionId: "session-1",
      status: "EXECUTING",
    });
    const { container } = renderScreen();

    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(executeImport).toHaveBeenCalledWith(
        "session-1",
        { previewVersion: 1 },
        expect.any(String),
      ),
    );
    assertNoLeakedInternals(container);
  });

  test.each([
    ["IMPORT_SOURCE_AUTH_REJECTED", "senha pode ter mudado"],
    ["IMPORT_SOURCE_UNAVAILABLE", "não respondeu"],
    ["IMPORT_INTERNAL_ERROR", "falha da Atendly"],
  ] as const)("classe %s mostra texto próprio", async (code, expectedFragment) => {
    getImportState.mockResolvedValue(stateWithSession(runningSession()));
    getImportProgress.mockResolvedValue(
      progressFixture({
        interrupted: true,
        lastError: { code },
        status: "EXECUTING",
      }),
    );
    const { container } = renderScreen();

    expect(await screen.findByText(new RegExp(expectedFragment))).toBeInTheDocument();
    assertNoLeakedInternals(container);
  });

  test("classes distintas de lastError produzem textos distintos", async () => {
    getImportState.mockResolvedValue(stateWithSession(runningSession()));
    getImportProgress.mockResolvedValue(
      progressFixture({
        interrupted: true,
        lastError: { code: "IMPORT_SOURCE_AUTH_REJECTED" },
        status: "EXECUTING",
      }),
    );
    const { unmount } = renderScreen();
    const authText = (
      await screen.findByText(/senha pode ter mudado/)
    ).textContent;
    unmount();

    getImportProgress.mockResolvedValue(
      progressFixture({
        interrupted: true,
        lastError: { code: "IMPORT_SOURCE_UNAVAILABLE" },
        status: "EXECUTING",
      }),
    );
    renderScreen();
    const unavailableText = (
      await screen.findByText(/não respondeu/)
    ).textContent;

    expect(authText).not.toBe(unavailableText);
  });
});

describe("motivo do item falho (IM-08)", () => {
  function runningSession(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
    return sessionFixture({
      startedAt: "2026-09-15T10:10:00.000Z",
      status: "PARTIAL",
      ...overrides,
    });
  }

  test("IMPORT_SERVICE_MAPPING_MISSING mostra o texto leigo e a contagem", async () => {
    getImportState.mockResolvedValue(stateWithSession(runningSession()));
    getImportProgress.mockResolvedValue(
      progressFixture({
        categories: [
          {
            category: "FUTURE_APPOINTMENT",
            failed: 3,
            failedReasons: [{ reasonCode: "IMPORT_SERVICE_MAPPING_MISSING", count: 3 }],
            imported: 5,
            needsReview: 0,
            pending: 0,
            skipped: 0,
          },
        ],
        counts: { failed: 3, imported: 5, needsReview: 0, pending: 0, skipped: 0 },
      }),
    );
    const { container } = renderScreen();

    expect(
      await screen.findByText(/O serviço deste atendimento não veio da Minha Agenda.*\(3\)/),
    ).toBeInTheDocument();
    assertNoLeakedInternals(container);
  });

  test.each([
    ["IMPORT_SERVICE_MAPPING_MISSING", "O serviço deste atendimento não veio da Minha Agenda"],
    ["IMPORT_CUSTOMER_MAPPING_MISSING", "O cliente deste atendimento não foi importado"],
    ["IMPORT_APPOINTMENT_INTERVAL_INVALID", "está sem duração e sem horário de término"],
    ["IMPORT_SOURCE_RECORD_INVALID", "veio incompleto ou em um formato"],
    ["IMPORT_AVAILABILITY_COMPANY_MISSING", "não informou o horário de funcionamento"],
    ["IMPORT_ITEM_FAILED", "falha inesperada ao importar este item"],
  ] as const)("código conhecido %s tem texto leigo próprio", async (reasonCode, fragment) => {
    getImportState.mockResolvedValue(stateWithSession(runningSession()));
    getImportProgress.mockResolvedValue(
      progressFixture({
        categories: [
          {
            category: "FUTURE_APPOINTMENT",
            failed: 2,
            failedReasons: [{ reasonCode, count: 2 }],
            imported: 5,
            needsReview: 0,
            pending: 0,
            skipped: 0,
          },
        ],
        counts: { failed: 2, imported: 5, needsReview: 0, pending: 0, skipped: 0 },
      }),
    );
    const { container } = renderScreen();

    expect(await screen.findByText(new RegExp(`${fragment}.*\\(2\\)`))).toBeInTheDocument();
    expect(screen.queryByText(/Este item não foi importado/)).not.toBeInTheDocument();
    assertNoLeakedInternals(container);
  });

  test("código de motivo desconhecido cai no texto genérico, nunca o código cru", async () => {
    getImportState.mockResolvedValue(stateWithSession(runningSession()));
    getImportProgress.mockResolvedValue(
      progressFixture({
        categories: [
          {
            category: "FUTURE_APPOINTMENT",
            failed: 2,
            failedReasons: [{ reasonCode: "IMPORT_SOMETHING_NEVER_DOCUMENTED", count: 2 }],
            imported: 5,
            needsReview: 0,
            pending: 0,
            skipped: 0,
          },
        ],
        counts: { failed: 2, imported: 5, needsReview: 0, pending: 0, skipped: 0 },
      }),
    );
    const { container } = renderScreen();

    expect(await screen.findByText(/Este item não foi importado.*\(2\)/)).toBeInTheDocument();
    expect(screen.queryByText(/IMPORT_SOMETHING_NEVER_DOCUMENTED/)).not.toBeInTheDocument();
    assertNoLeakedInternals(container);
  });
});

describe("contagem de clientes com limitação (IM-05)", () => {
  test("categoria com limitação mostra discoveredCount, junto do texto da limitação", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    renderScreen();

    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(
      screen.getByText(
        "O Minha Agenda não tem uma lista completa de clientes. Só trazemos quem aparece em um agendamento ou bloqueio encontrado.",
      ),
    ).toBeInTheDocument();
    // Nunca o texto cru do provider.
    expect(
      screen.queryByText(/internal provider detail/),
    ).not.toBeInTheDocument();
  });
});

describe("erros no formato real do BFF", () => {
  test("recusa de seleção de categoria (UPSTREAM_ERROR + upstreamCode) não derruba a tela", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    setImportCategorySelection.mockRejectedValue(
      upstreamError("IMPORT_SESSION_CATEGORY_NOT_FOUND"),
    );
    const { container } = renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Escolher o que importar" }),
    );
    await user.click(screen.getByRole("checkbox", { name: /clientes/ }));

    expect(
      await screen.findByText("Não foi possível salvar essa escolha agora. Tente novamente."),
    ).toBeInTheDocument();
    assertNoLeakedInternals(container);
  });
});
