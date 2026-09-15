// @vitest-environment jsdom
/**
 * Goal020 (WU-006): análise, preview por categoria e escolha do que importar.
 *
 * O que esta suíte prova:
 *
 * - a tela afirma que a análise não altera nada, antes de qualquer confirmação;
 * - cada categoria mostra a contagem real vinda do preview (`analyzeImport`),
 *   nunca um valor calculado localmente;
 * - uma categoria sem cobertura na origem explica a limitação em linguagem de
 *   produto e nunca exibe um número para ela — nem `0`, nem o `readCount`
 *   parcial que a origem ofereceu;
 * - `Importar tudo` executa direto (`executeImport`), sem qualquer chamada de
 *   seleção antes;
 * - `Escolher o que importar` consome a rota de seleção por categoria
 *   (`setImportCategorySelection`) sem nunca re-analisar a origem — a
 *   `previewVersion` usada na execução final é a mesma da análise original.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ImportLiveSession,
  ImportPreview,
  ImportProgress,
  ImportState,
} from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getImportState = vi.fn();
const analyzeImport = vi.fn();
const setImportCategorySelection = vi.fn();
const executeImport = vi.fn();
const getImportProgress = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration: vi.fn() },
    migration: {
      analyzeImport,
      executeImport,
      getImportProgress,
      getImportState,
      setImportCategorySelection,
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
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
  };
}

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
    startedAt: "2026-09-15T10:00:00.000Z",
    status: "DRAFT",
    ...overrides,
  };
}

/**
 * Categoria da sessão viva (`GET /v1/calendar/imports`), que é outra forma da
 * categoria do preview: contagens do banco mais o `selected` já gravado.
 */
function sessionCategory(
  category: ImportLiveSession["categories"][number]["category"],
  selected: boolean,
): ImportLiveSession["categories"][number] {
  return {
    category,
    failed: 0,
    imported: 0,
    needsReview: 0,
    pending: 0,
    selected,
    skipped: 0,
  };
}

function previewFixture(): ImportPreview {
  return {
    categories: [
      {
        category: "SERVICE",
        discoveredCount: 12,
        failedCount: 0,
        limitationCode: null,
        limitationDetail: null,
        needsReviewCount: 0,
        pendingCount: 12,
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
        limitationCode: "CUSTOMER_DIRECTORY_UNAVAILABLE",
        limitationDetail:
          "A origem não expõe um endpoint de listagem de clientes; apenas clientes vinculados a um agendamento ou bloqueio lido no período consultado ficam visíveis.",
        needsReviewCount: 0,
        pendingCount: 7,
        readCount: 7,
        skippedCount: 0,
        sourceReportedCount: null,
        sourceSupported: false,
        importedCount: 0,
      },
      {
        category: "FUTURE_APPOINTMENT",
        discoveredCount: 42,
        failedCount: 0,
        limitationCode: null,
        limitationDetail: null,
        needsReviewCount: 0,
        pendingCount: 42,
        readCount: 42,
        skippedCount: 0,
        sourceReportedCount: 42,
        sourceSupported: true,
        importedCount: 0,
      },
      {
        category: "NO_SHOW_APPOINTMENT",
        discoveredCount: 0,
        failedCount: 0,
        limitationCode: "NO_SHOW_NOT_MODELED_BY_SOURCE",
        limitationDetail:
          "A origem não modela falta como estado distinto de cancelado; nenhum agendamento é classificado como falta a partir dela.",
        needsReviewCount: 0,
        pendingCount: 0,
        readCount: 0,
        skippedCount: 0,
        sourceReportedCount: null,
        sourceSupported: false,
        importedCount: 0,
      },
    ],
    changesSincePreviousVersion: { changedCount: 0, disappearedCount: 0, newCount: 61 },
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    sessionId: "session-1",
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

describe("análise e preview por categoria", () => {
  test("afirma que a análise não altera nada antes de qualquer confirmação, depois mostra a contagem real", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    let resolveAnalyze!: (value: ImportPreview) => void;
    analyzeImport.mockReturnValue(
      new Promise((resolve) => {
        resolveAnalyze = resolve;
      }),
    );
    renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Analisando seus dados…" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nada muda na Atendly até você confirmar."),
    ).toBeInTheDocument();

    resolveAnalyze(previewFixture());

    expect(
      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
    ).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(analyzeImport).toHaveBeenCalledWith(
      "session-1",
      expect.any(String),
      expect.anything(),
    );
  });

  test("categoria sem cobertura na origem explica a limitação em linguagem de produto, sem número fabricado", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    analyzeImport.mockResolvedValue(previewFixture());
    renderScreen();

    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });

    expect(
      screen.getByText(
        "O Minha Agenda não tem uma lista completa de clientes. Só trazemos quem aparece em um agendamento ou bloqueio encontrado.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "O Minha Agenda não distingue falta de cancelamento. Nenhum atendimento será marcado como falta a partir de lá.",
      ),
    ).toBeInTheDocument();
    // Nunca um número para a categoria sem cobertura, nem mesmo o readCount
    // parcial (7) que a origem ofereceu.
    expect(screen.queryByText("7")).not.toBeInTheDocument();
    // A linguagem de produto substitui o texto cru do servidor.
    expect(
      screen.queryByText(/endpoint de listagem de clientes/),
    ).not.toBeInTheDocument();
  });

  test("axe: preview sem violações", async () => {
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    analyzeImport.mockResolvedValue(previewFixture());
    const { container } = renderScreen();

    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
    await expectNoA11yViolations(container);
  });
});

describe("importar tudo é o caminho principal", () => {
  test("executa direto, sem nenhuma chamada de seleção antes", async () => {
    const user = userEvent.setup();
    getImportState
      .mockResolvedValueOnce(stateWithSession(sessionFixture()))
      .mockResolvedValueOnce(
        stateWithSession(sessionFixture({ status: "PARTIAL" })),
      );
    analyzeImport.mockResolvedValue(previewFixture());
    executeImport.mockResolvedValue({
      categories: [],
      counts: { failed: 0, imported: 61, needsReview: 0, pending: 0, skipped: 0 },
      leaseLost: false,
      leaseOwner: "worker-1",
      previewVersion: 1,
      processed: 61,
      sessionId: "session-1",
      status: "READY",
    });
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Importar tudo" }),
    );

    await waitFor(() =>
      expect(executeImport).toHaveBeenCalledWith(
        "session-1",
        { previewVersion: 1 },
        expect.any(String),
      ),
    );
    expect(setImportCategorySelection).not.toHaveBeenCalled();
    expect(analyzeImport).toHaveBeenCalledTimes(1);
    await screen.findByRole("heading", { name: "Continuar importação" });
  });
});

describe("escolher o que importar", () => {
  test("consome a rota de seleção por categoria, sem re-analisar a origem", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    analyzeImport.mockResolvedValue(previewFixture());
    setImportCategorySelection.mockResolvedValue({
      category: "CUSTOMER",
      selected: false,
      sessionId: "session-1",
    });
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Escolher o que importar" }),
    );
    await screen.findByRole("heading", { name: "O que você quer trazer?" });

    await user.click(screen.getByRole("checkbox", { name: /clientes/ }));

    await waitFor(() =>
      expect(setImportCategorySelection).toHaveBeenCalledWith(
        "session-1",
        "CUSTOMER",
        { selected: false },
        expect.any(String),
      ),
    );
    // A seleção nunca dispara uma nova análise: `previewVersion` continua a
    // mesma usada na execução final.
    expect(analyzeImport).toHaveBeenCalledTimes(1);

    executeImport.mockResolvedValue({
      categories: [],
      counts: { failed: 0, imported: 54, needsReview: 0, pending: 0, skipped: 7 },
      leaseLost: false,
      leaseOwner: "worker-1",
      previewVersion: 1,
      processed: 54,
      sessionId: "session-1",
      status: "READY",
    });
    getImportState.mockResolvedValueOnce(
      stateWithSession(sessionFixture({ status: "PARTIAL" })),
    );

    await user.click(
      screen.getByRole("button", { name: /Importar \d+ registros/ }),
    );

    await waitFor(() =>
      expect(executeImport).toHaveBeenCalledWith(
        "session-1",
        { previewVersion: 1 },
        expect.any(String),
      ),
    );
  });

  /**
   * A regressão que o review da rodada 1 registrou: a escolha era gravada no
   * servidor, a tela voltava para o resumo e o resumo continuava oferecendo
   * "Importar tudo" com a contagem de todas as categorias. A execução lê
   * `selected` do banco, então o botão prometia o que não ia acontecer — e,
   * numa importação única, o descartado não teria segunda chance.
   */
  test("o resumo deixa de prometer tudo depois que uma categoria sai", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    analyzeImport.mockResolvedValue(previewFixture());
    setImportCategorySelection.mockResolvedValue({
      category: "SERVICE",
      selected: false,
      sessionId: "session-1",
    });
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Escolher o que importar" }),
    );
    await screen.findByRole("heading", { name: "O que você quer trazer?" });
    await user.click(screen.getByRole("checkbox", { name: /serviços/ }));
    await waitFor(() => expect(setImportCategorySelection).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });

    expect(
      screen.queryByRole("button", { name: "Importar tudo" }),
    ).not.toBeInTheDocument();
    // 12 serviços fora dos 54 restantes (7 clientes + 42 futuros + 0 faltas).
    expect(
      screen.getByRole("button", { name: "Importar 49 registros" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Você deixou esta categoria de fora"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Só o que está escolhido será importado. O que ficar de fora não poderá ser importado depois.",
      ),
    ).toBeInTheDocument();
  });

  test("a escolha já gravada na sessão chega ao resumo, não só à tela de escolha", async () => {
    getImportState.mockResolvedValue(
      stateWithSession(
        sessionFixture({
          categories: [
            sessionCategory("SERVICE", false),
            sessionCategory("CUSTOMER", true),
            sessionCategory("FUTURE_APPOINTMENT", true),
            sessionCategory("NO_SHOW_APPOINTMENT", true),
          ],
        }),
      ),
    );
    analyzeImport.mockResolvedValue(previewFixture());
    renderScreen();

    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });

    expect(
      screen.queryByRole("button", { name: "Importar tudo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Importar 49 registros" }),
    ).toBeInTheDocument();
  });

  test("sem nada escolhido, não há como executar por engano", async () => {
    getImportState.mockResolvedValue(
      stateWithSession(
        sessionFixture({
          categories: [
            sessionCategory("SERVICE", false),
            sessionCategory("CUSTOMER", false),
            sessionCategory("FUTURE_APPOINTMENT", false),
            sessionCategory("NO_SHOW_APPOINTMENT", false),
          ],
        }),
      ),
    );
    analyzeImport.mockResolvedValue(previewFixture());
    renderScreen();

    await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });

    expect(screen.getByRole("button", { name: "Importar 0 registros" })).toBeDisabled();
    expect(
      screen.getByText(
        "Nada está escolhido para importar. Escolha o que trazer antes de continuar.",
      ),
    ).toBeInTheDocument();
    expect(executeImport).not.toHaveBeenCalled();
  });

  test("axe: seleção por categoria sem violações", async () => {
    const user = userEvent.setup();
    getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
    analyzeImport.mockResolvedValue(previewFixture());
    const { container } = renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Escolher o que importar" }),
    );
    await screen.findByRole("heading", { name: "O que você quer trazer?" });
    await expectNoA11yViolations(container);
  });
});
