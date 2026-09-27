// @vitest-environment jsdom
/**
 * Goal020 (WU-005): módulo `features/imports`, entrada por estado e conexão
 * da origem.
 *
 * O que esta suíte prova:
 *
 * - o ponto de entrada é decidido pelo `ImportState` lido (`right`, `session`,
 *   `history`), nunca por uma tentativa de abrir sessão;
 * - a tela de conexão consome `POST /v1/calendar/integration/connect`
 *   (`calendar.connectIntegration`) antes de abrir a sessão de importação;
 * - erro de credencial vira mensagem de produto — nunca a mensagem crua do
 *   erro upstream;
 * - a credencial não sobrevive à navegação: nunca toca `localStorage`,
 *   `sessionStorage` nem a URL;
 * - sessão viva é o padrão (retomar); substituir é uma decisão explícita,
 *   apresentada como descarte, atrás de confirmação;
 * - `ShellConfigProvider` + a árvore real sobrevive a montagem e interação
 *   sem violar a invariante de uma chamada de `useShellConfig` por árvore.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type ImportHistory,
  type ImportLiveSession,
  type ImportPreviewSnapshot,
  type ImportProgress,
  type ImportState,
} from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getImportState = vi.fn();
const connectIntegration = vi.fn();
const startImport = vi.fn();
const analyzeImport = vi.fn();
const getImportPreview = vi.fn();
const getImportProgress = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration },
    migration: {
      analyzeImport,
      executeImport: vi.fn(),
      getImportPreview,
      getImportProgress,
      getImportState,
      setImportCategorySelection: vi.fn(),
      startImport,
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

function previewFixture(overrides: Partial<ImportPreviewSnapshot> = {}): ImportPreviewSnapshot {
  return {
    categories: [],
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    sessionId: "session-1",
    ...overrides,
  };
}

function availableStateFixture(): ImportState {
  return {
    history: null,
    right: { available: true, sessionId: null, completedAt: null },
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
    status: "DRAFT",
    ...overrides,
  };
}

function historyFixture(overrides: Partial<ImportHistory> = {}): ImportHistory {
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

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByLabelText("E-mail do Minha Agenda"),
    "camila@example.com",
  );
  await user.type(screen.getByLabelText("Senha do Minha Agenda"), "super-secret");
}

beforeEach(() => {
  vi.clearAllMocks();
  getImportProgress.mockResolvedValue(progressFixture());
  analyzeImport.mockResolvedValue({
    previewVersion: 0,
    sessionId: "session-1",
    status: "ANALYZING",
  });
  getImportPreview.mockResolvedValue(previewFixture());
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("entrada decidida pelo estado", () => {
  test("direito disponível, sem sessão nem histórico: mostra a conexão da origem", async () => {
    getImportState.mockResolvedValue(availableStateFixture());
    renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Entre no Minha Agenda" }),
    ).toBeInTheDocument();
    expect(startImport).not.toHaveBeenCalled();
  });

  test("sessão viva: mostra o resumo para retomar, não a conexão", async () => {
    getImportState.mockResolvedValue({
      history: null,
      right: { available: true, sessionId: "session-1", completedAt: null },
      // PARTIAL, não DRAFT: sessão em execução já passou da etapa de
      // análise/preview (Goal020/WU-06), que tem tela própria.
      session: sessionFixture({ status: "PARTIAL" }),
    });
    renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Continuar importação" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Entre no Minha Agenda" }),
    ).not.toBeInTheDocument();
  });

  test("histórico presente: só o histórico, sem CTA de nova importação", async () => {
    getImportState.mockResolvedValue({
      history: historyFixture(),
      right: { available: false, sessionId: "session-1", completedAt: "2026-09-15T12:00:00.000Z" },
      session: null,
    });
    renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Importação concluída" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Entre no Minha Agenda" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Conectar/ }),
    ).not.toBeInTheDocument();
  });
});

describe("conexão da origem", () => {
  test("envia a credencial a connectIntegration, depois abre a sessão", async () => {
    const user = userEvent.setup();
    getImportState
      .mockResolvedValueOnce(availableStateFixture())
      .mockResolvedValueOnce({
        history: null,
        right: { available: true, sessionId: "session-1", completedAt: null },
        session: sessionFixture(),
      })
      // Leitura interna da análise (Goal061 §6): a sessão DRAFT inicia a
      // análise sozinha e o preview screen lê o estado até sair de ANALYZING.
      .mockResolvedValueOnce({
        history: null,
        right: { available: true, sessionId: "session-1", completedAt: null },
        session: sessionFixture({ previewVersion: 1, startedAt: null, status: "READY" }),
      });
    connectIntegration.mockResolvedValue({
      capabilities: {
        createAppointments: false,
        manageAvailability: false,
        manageCustomers: false,
        manageServices: false,
        migrate: false,
      },
      integration: null,
      source: null,
      timezone: null,
    });
    startImport.mockResolvedValue({
      created: true,
      replacedSessionId: null,
      sessionId: "session-1",
      status: "DRAFT",
    });
    renderScreen();

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Conectar Minha Agenda" }));

    await waitFor(() =>
      expect(connectIntegration).toHaveBeenCalledWith({
        email: "camila@example.com",
        password: "super-secret",
      }),
    );
    await waitFor(() =>
      expect(startImport).toHaveBeenCalledWith(
        {
          replace: false,
          sourceAccountId: "camila@example.com",
          sourceAccountLabel: "camila@example.com",
        },
        expect.any(String),
      ),
    );
    // Sessão recém-aberta está DRAFT: a próxima tela é a de análise/preview
    // (Goal020/WU-06), não o resumo genérico de retomada.
    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
  });

  test("credencial recusada vira mensagem de produto, não a mensagem crua do erro", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(availableStateFixture());
    connectIntegration.mockRejectedValue(
      new BffHttpError({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "MINHA_AGENDA_AUTH_FAILED" },
        message: "The upstream Minha Agenda integration reported an error.",
        requestId: "req-1",
        status: 422,
      }),
    );
    renderScreen();

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Conectar Minha Agenda" }));

    expect(
      await screen.findByText(
        "Não foi possível entrar no Minha Agenda com esses dados. Confira o e-mail e a senha.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "The upstream Minha Agenda integration reported an error.",
      ),
    ).not.toBeInTheDocument();
    expect(startImport).not.toHaveBeenCalled();
  });

  test("a credencial não vai para localStorage, sessionStorage nem a URL", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(availableStateFixture());
    connectIntegration.mockRejectedValue(
      new BffHttpError({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "MINHA_AGENDA_AUTH_FAILED" },
        message: "falhou",
        requestId: "req-1",
        status: 422,
      }),
    );
    renderScreen();

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Conectar Minha Agenda" }));
    await screen.findByText(/Não foi possível entrar no Minha Agenda/);

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.href).not.toContain("super-secret");
  });
});

describe("sessão viva: retomar é o padrão, substituir é decisão explícita", () => {
  test("por padrão mostra o resumo para retomar, sem pedir credencial de novo", async () => {
    getImportState.mockResolvedValue({
      history: null,
      right: { available: true, sessionId: "session-1", completedAt: null },
      // PARTIAL, não DRAFT: estas provas são sobre o mecanismo de retomar e
      // substituir conta, não sobre a análise/preview (Goal020/WU-06).
      session: sessionFixture({ status: "PARTIAL" }),
    });
    renderScreen();

    await screen.findByRole("heading", { name: "Continuar importação" });
    expect(
      screen.queryByLabelText("E-mail do Minha Agenda"),
    ).not.toBeInTheDocument();
  });

  test("substituir exige confirmação explícita antes de descartar a sessão", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue({
      history: null,
      right: { available: true, sessionId: "session-1", completedAt: null },
      // PARTIAL, não DRAFT: estas provas são sobre o mecanismo de retomar e
      // substituir conta, não sobre a análise/preview (Goal020/WU-06).
      session: sessionFixture({ status: "PARTIAL" }),
    });
    renderScreen();

    // A tela da execução lê `GET .../progress` ao montar (Goal020/WU-08):
    // esperar o estado assentar é o que a pessoa faz antes de clicar.
    await screen.findByRole("heading", { name: "Importação parcial em andamento" });
    await user.click(screen.getByRole("button", { name: "Conectar outra conta" }));
    expect(
      screen.getByRole("heading", { name: "Descartar esta importação?" }),
    ).toBeInTheDocument();
    // Ainda não abriu o formulário de conexão: a confirmação é uma etapa própria.
    expect(
      screen.queryByLabelText("E-mail do Minha Agenda"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Descartar e conectar outra conta" }),
    );

    expect(
      await screen.findByLabelText("E-mail do Minha Agenda"),
    ).toBeInTheDocument();
  });

  test("confirmação recusada mantém a sessão viva, sem chamar substituição", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue({
      history: null,
      right: { available: true, sessionId: "session-1", completedAt: null },
      // PARTIAL, não DRAFT: estas provas são sobre o mecanismo de retomar e
      // substituir conta, não sobre a análise/preview (Goal020/WU-06).
      session: sessionFixture({ status: "PARTIAL" }),
    });
    renderScreen();

    await screen.findByRole("heading", { name: "Importação parcial em andamento" });
    await user.click(screen.getByRole("button", { name: "Conectar outra conta" }));
    await user.click(
      screen.getByRole("button", { name: "Continuar esta importação" }),
    );

    expect(
      screen.queryByLabelText("E-mail do Minha Agenda"),
    ).not.toBeInTheDocument();
    expect(startImport).not.toHaveBeenCalled();
  });
});
