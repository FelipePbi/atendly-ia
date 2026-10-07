// @vitest-environment jsdom
/**
 * Goal132 (WU-02): a escolha do que importar é o quadro 2.I5, nas duas molduras.
 *
 * O que esta suíte prova:
 *
 * - a descrição é a do quadro, sem "Nada muda até você confirmar.", e no
 *   onboarding não há o eyebrow "Importação" (só o da moldura); h1 no
 *   onboarding e h2 em Configurações;
 * - cada linha é uma caixa NATIVA (`input type="checkbox"`) dentro de um
 *   `label`, marcada pela leitura da sessão, com o nome com maiúscula, na
 *   ordem do quadro; os horários não têm contagem;
 * - "histórico de cada cliente" fica sob os atendimentos anteriores, e a
 *   limitação da origem toma o lugar dela quando existe;
 * - marcar e desmarcar gravam uma vez, com o corpo de hoje, e desfazem com a
 *   mensagem de hoje quando a gravação falha;
 * - "Importar N registros" soma o que está escolhido (inclusive `AVAILABILITY`)
 *   e fica desabilitado com soma 0 ou durante a execução;
 * - "Voltar" é um botão de texto que volta ao resumo; nenhuma nota sobre o
 *   resumo por IA;
 * - `executeImport` leva o `previewVersion` da prévia, e a prévia obsoleta
 *   continua com a saída de hoje;
 * - o CSS da escolha desenha a caixa como o quadro (24 px, raio 7 px).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type ImportLiveSession,
  type ImportPreviewCategory,
  type ImportPreviewSnapshot,
} from "@/data";
import { ImportPreviewScreen } from "@/features/imports/ImportPreviewScreen";
import {
  type ImportsFrame,
  ImportsFrameProvider,
} from "@/features/imports/ImportsLayout";

import { expectNoA11yViolations } from "./support/a11y";

const getImportState = vi.fn();
const analyzeImport = vi.fn();
const getImportPreview = vi.fn();
const setImportCategorySelection = vi.fn();
const executeImport = vi.fn();
const getImportProgress = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    migration: {
      analyzeImport,
      executeImport,
      getImportPreview,
      getImportProgress,
      getImportState,
      setImportCategorySelection,
    },
  }),
}));

function categoryFixture(
  category: ImportPreviewCategory["category"],
  discoveredCount: number,
  overrides: Partial<ImportPreviewCategory> = {},
): ImportPreviewCategory {
  return {
    category,
    discoveredCount,
    failedCount: 0,
    importedCount: 0,
    limitationCode: null,
    limitationDetail: null,
    needsReviewCount: 0,
    pendingCount: discoveredCount,
    readCount: discoveredCount,
    skippedCount: 0,
    sourceReportedCount: discoveredCount,
    sourceSupported: true,
    ...overrides,
  };
}

/** As oito categorias na ordem do contrato (não a do quadro). */
function previewFixture(): ImportPreviewSnapshot {
  return {
    categories: [
      categoryFixture("SERVICE", 12),
      categoryFixture("CUSTOMER", 386),
      categoryFixture("AVAILABILITY", 6),
      categoryFixture("TIME_BLOCK", 3),
      categoryFixture("FUTURE_APPOINTMENT", 42),
      categoryFixture("PAST_APPOINTMENT", 1400),
      categoryFixture("CANCELLED_APPOINTMENT", 9),
      categoryFixture("NO_SHOW_APPOINTMENT", 0, {
        limitationCode: "NO_SHOW_NOT_MODELED_BY_SOURCE",
        sourceSupported: false,
      }),
    ],
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 7,
    sessionId: "session-1",
  };
}

const ALL_CATEGORIES = [
  "SERVICE",
  "CUSTOMER",
  "AVAILABILITY",
  "TIME_BLOCK",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
] as const;

function sessionFixture(
  selectedCategories: readonly (typeof ALL_CATEGORIES)[number][] = ALL_CATEGORIES,
): ImportLiveSession {
  return {
    categories: ALL_CATEGORIES.map((category) => ({
      category,
      failed: 0,
      imported: 0,
      needsReview: 0,
      pending: 0,
      selected: selectedCategories.includes(category),
      skipped: 0,
    })),
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 0, skipped: 0 },
    createdAt: "2026-09-15T10:00:00.000Z",
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewGeneratedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 7,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: null,
    status: "READY",
  };
}

function upstreamError(upstreamCode: string, status = 409): BffHttpError {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: { upstreamCode },
    message: `The upstream reported ${upstreamCode}.`,
    requestId: "req-1",
    status,
  });
}

async function openChoice(
  frame: ImportsFrame,
  session: ImportLiveSession = sessionFixture(),
) {
  const user = userEvent.setup();
  const view = render(
    <ImportsFrameProvider frame={frame}>
      <ImportPreviewScreen
        onChanged={vi.fn()}
        onReplaceAccount={vi.fn()}
        session={session}
      />
    </ImportsFrameProvider>,
  );
  await user.click(
    await screen.findByRole("button", { name: "Escolher o que importar" }),
  );
  await screen.findByRole("heading", { name: "O que você quer trazer?" });
  return { ...view, user };
}

function choiceRows(): HTMLElement[] {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

beforeEach(() => {
  vi.resetAllMocks();
  getImportPreview.mockResolvedValue(previewFixture());
});

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "escolha na moldura %s",
  (frame) => {
    test("a descrição é a do quadro, sem 'Nada muda até você confirmar.'", async () => {
      const { container } = await openChoice(frame);

      const heading = screen.getByRole("heading", { name: "O que você quer trazer?" });
      expect(heading.tagName).toBe(frame === "onboarding" ? "H1" : "H2");
      expect(
        screen.getByText("O que ficar de fora não poderá ser importado depois."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Nada muda até você confirmar/)).not.toBeInTheDocument();
      expect(container.querySelector("p.eyebrow")).toBeNull();
    });

    test("cada linha é uma caixa nativa, na ordem do quadro, com o nome com maiúscula", async () => {
      await openChoice(frame);

      const boxes = screen.getAllByRole("checkbox");
      expect(boxes).toHaveLength(8);
      for (const box of boxes) {
        expect(box.tagName).toBe("INPUT");
        expect(box).toHaveAttribute("type", "checkbox");
        expect(box.closest("label")).not.toBeNull();
      }
      expect(choiceRows().map((row) => row.textContent)).toEqual([
        "Serviços12",
        "Clientes386",
        "Agendamentos futuros42",
        "Atendimentos anterioreshistórico de cada cliente1.400",
        "Cancelamentos9",
        "FaltasO Minha Agenda não distingue falta de cancelamento. Nenhum atendimento será marcado como falta a partir de lá.0",
        "Bloqueios3",
        "Horários de atendimento",
      ]);
    });

    test("a marcação vem da leitura da sessão, sem pedido", async () => {
      await openChoice(
        frame,
        sessionFixture(ALL_CATEGORIES.filter((c) => c !== "PAST_APPOINTMENT")),
      );

      expect(screen.getByRole("checkbox", { name: /^Atendimentos anteriores/ })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: /^Serviços/ })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /^Horários de atendimento/ })).toBeChecked();
      expect(setImportCategorySelection).not.toHaveBeenCalled();
      expect(analyzeImport).not.toHaveBeenCalled();
      expect(executeImport).not.toHaveBeenCalled();
    });

    test("os horários não têm contagem; as outras linhas têm", async () => {
      await openChoice(frame);

      const rows = choiceRows();
      const availability = rows[rows.length - 1];
      expect(availability.querySelector(".imports-choice-count")).toBeNull();
      expect(availability.textContent).not.toMatch(/\d/);
      expect(screen.queryByText("6")).not.toBeInTheDocument();
      expect(rows[0].querySelector(".imports-choice-count")?.textContent).toBe("12");
    });

    test("a linha desmarcada leva a marca de tom, e a marcada não", async () => {
      await openChoice(
        frame,
        sessionFixture(ALL_CATEGORIES.filter((c) => c !== "PAST_APPOINTMENT")),
      );

      const rows = choiceRows();
      const past = rows[3].querySelector("label") as HTMLElement;
      const services = rows[0].querySelector("label") as HTMLElement;
      expect(past).toHaveClass("is-off");
      expect(services).not.toHaveClass("is-off");
    });

    test("a limitação da origem toma o lugar de 'histórico de cada cliente'", async () => {
      getImportPreview.mockResolvedValue({
        ...previewFixture(),
        categories: previewFixture().categories.map((entry) =>
          entry.category === "PAST_APPOINTMENT"
            ? {
                ...entry,
                limitationCode: "CUSTOMER_DIRECTORY_UNAVAILABLE",
                sourceSupported: false,
              }
            : entry,
        ),
      });
      await openChoice(frame);

      const past = choiceRows()[3];
      expect(past.textContent).not.toMatch(/histórico de cada cliente/);
      expect(past.textContent).toMatch(/O Minha Agenda não tem uma lista completa/);
    });

    test("desmarcar grava uma vez, com o corpo de hoje, e atualiza a soma", async () => {
      setImportCategorySelection.mockResolvedValue({
        category: "CUSTOMER",
        selected: false,
        sessionId: "session-1",
      });
      const { user } = await openChoice(frame);
      // 12 + 386 + 6 + 3 + 42 + 1400 + 9 + 0
      expect(
        screen.getByRole("button", { name: "Importar 1.858 registros" }),
      ).toBeEnabled();

      await user.click(screen.getByRole("checkbox", { name: /^Clientes/ }));

      await waitFor(() => expect(setImportCategorySelection).toHaveBeenCalledTimes(1));
      expect(setImportCategorySelection).toHaveBeenCalledWith(
        "session-1",
        "CUSTOMER",
        { selected: false },
        expect.any(String),
      );
      expect(screen.getByRole("checkbox", { name: /^Clientes/ })).not.toBeChecked();
      expect(
        screen.getByRole("button", { name: "Importar 1.472 registros" }),
      ).toBeInTheDocument();
    });

    test("marcar grava com selected: true", async () => {
      setImportCategorySelection.mockResolvedValue({
        category: "PAST_APPOINTMENT",
        selected: true,
        sessionId: "session-1",
      });
      const { user } = await openChoice(
        frame,
        sessionFixture(ALL_CATEGORIES.filter((c) => c !== "PAST_APPOINTMENT")),
      );

      await user.click(
        screen.getByRole("checkbox", { name: /^Atendimentos anteriores/ }),
      );

      await waitFor(() => expect(setImportCategorySelection).toHaveBeenCalledTimes(1));
      expect(setImportCategorySelection).toHaveBeenCalledWith(
        "session-1",
        "PAST_APPOINTMENT",
        { selected: true },
        expect.any(String),
      );
      expect(screen.getByRole("checkbox", { name: /^Atendimentos anteriores/ })).toBeChecked();
    });

    test("falha ao gravar desfaz a marca e mostra a mensagem de hoje", async () => {
      setImportCategorySelection.mockRejectedValue(new Error("boom"));
      const { user } = await openChoice(frame);

      await user.click(screen.getByRole("checkbox", { name: /^Serviços/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Não foi possível salvar essa escolha agora. Tente novamente.",
      );
      expect(screen.getByRole("checkbox", { name: /^Serviços/ })).toBeChecked();
      expect(
        screen.getByRole("button", { name: "Importar 1.858 registros" }),
      ).toBeInTheDocument();
    });

    test("a soma inclui AVAILABILITY: só os horários escolhidos dão 6", async () => {
      await openChoice(
        frame,
        sessionFixture(["AVAILABILITY"]),
      );

      expect(
        screen.getByRole("button", { name: "Importar 6 registros" }),
      ).toBeEnabled();
    });

    test("soma 0 desabilita o primário", async () => {
      await openChoice(frame, sessionFixture([]));

      expect(
        screen.getByRole("button", { name: "Importar 0 registros" }),
      ).toBeDisabled();
    });

    test("'Voltar' é botão de texto e volta ao resumo, sem pedido", async () => {
      const { user } = await openChoice(frame);

      const back = screen.getByRole("button", { name: "Voltar" });
      expect(back).toHaveClass("imports-text-action");
      expect(back).not.toHaveClass("btn");
      await user.click(back);

      expect(
        await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
      ).toBeInTheDocument();
      expect(setImportCategorySelection).not.toHaveBeenCalled();
      expect(executeImport).not.toHaveBeenCalled();
    });

    test("nenhuma nota sobre o resumo por IA", async () => {
      const { container } = await openChoice(frame);

      expect(container.textContent).not.toMatch(/resumo por IA/);
      expect(container.textContent).not.toMatch(/começa do zero/);
    });

    test("o primário executa com o previewVersion da prévia e durante a execução tudo fica desabilitado", async () => {
      let finish: (value: unknown) => void = () => {};
      executeImport.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      getImportState.mockResolvedValue({ right: null, history: null, session: null });
      const { user } = await openChoice(frame);

      await user.click(screen.getByRole("button", { name: /^Importar 1\.858/ }));

      expect(executeImport).toHaveBeenCalledTimes(1);
      expect(executeImport).toHaveBeenCalledWith(
        "session-1",
        { previewVersion: 7 },
        expect.any(String),
      );
      expect(await screen.findByRole("button", { name: "Importando..." })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Voltar" })).toBeDisabled();
      finish({ previewVersion: 7, sessionId: "session-1", status: "EXECUTING" });
    });

    test("prévia obsoleta leva à saída de hoje, sem executar a versão vigente", async () => {
      executeImport.mockRejectedValue(upstreamError("IMPORT_PREVIEW_STALE"));
      const { user } = await openChoice(frame);

      await user.click(screen.getByRole("button", { name: /^Importar 1\.858/ }));

      expect(
        await screen.findByRole("heading", {
          name: "Seus dados mudaram desde esta análise",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Analisar de novo" }),
      ).toBeInTheDocument();
      expect(executeImport).toHaveBeenCalledTimes(1);
    });

    test("falha ao importar mostra a mensagem de hoje", async () => {
      executeImport.mockRejectedValue(new Error("boom"));
      getImportState.mockResolvedValue({
        right: null,
        history: null,
        session: sessionFixture(),
      });
      const { user } = await openChoice(frame);

      await user.click(screen.getByRole("button", { name: /^Importar 1\.858/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Não foi possível importar agora. Tente novamente.",
      );
      expect(screen.getByRole("button", { name: /^Importar 1\.858/ })).toBeEnabled();
    });

    test("sem violação de acessibilidade", async () => {
      const { container } = await openChoice(frame);

      await expectNoA11yViolations(container);
    });
  },
);

function readCss(): string {
  return readFileSync(
    join(process.cwd(), "src/shared/styles/avenly-imports.css"),
    "utf8",
  );
}

/** Corpo da regra `selector { … }` (primeira ocorrência em `css`). */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.[\]():,"]/g, "\\$&");
  const match = new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `regra ${selector}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

describe("o CSS da escolha", () => {
  test("a caixa tem 24 px, raio 7 px e a borda de 1,5 px do quadro", () => {
    const body = ruleBody(readCss(), '.imports-choice-row input[type="checkbox"]');
    expect(body).toMatch(/width:\s*24px/);
    expect(body).toMatch(/height:\s*24px/);
    expect(body).toMatch(/border-radius:\s*7px/);
    expect(body).toMatch(/border:\s*1\.5px solid #d6cec2/);
    expect(body).toMatch(/box-sizing:\s*border-box/);
    expect(body).toMatch(/appearance:\s*none/);
  });

  test("marcada, a caixa é #0f5f63 com o visto claro", () => {
    const body = ruleBody(
      readCss(),
      '.imports-choice-row input[type="checkbox"]:checked',
    );
    expect(body).toMatch(/background-color:\s*#0f5f63/);
    expect(body).toMatch(/%23F7F4EF/);
  });

  test("o foco da caixa é visível", () => {
    expect(
      ruleBody(readCss(), '.imports-choice-row input[type="checkbox"]:focus-visible'),
    ).toMatch(/outline:\s*2px solid #0f5f63/);
  });

  test("nome 15 px 600, legenda 13 px #716859, contagem 15 px #5f574e tabular", () => {
    const css = readCss();
    expect(ruleBody(css, ".imports-choice-copy strong")).toMatch(/font-size:\s*15px/);
    expect(ruleBody(css, ".imports-choice-copy strong")).toMatch(/font-weight:\s*600/);
    expect(ruleBody(css, ".imports-choice-copy small")).toMatch(/font-size:\s*13px/);
    expect(ruleBody(css, ".imports-choice-copy small")).toMatch(/color:\s*#716859/);
    const count = ruleBody(css, ".imports-choice-count");
    expect(count).toMatch(/font-size:\s*15px/);
    expect(count).toMatch(/color:\s*#5f574e/);
    expect(count).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  test("desmarcada, o nome vai a #5f574e e a contagem a #716859", () => {
    const css = readCss();
    expect(ruleBody(css, ".imports-choice-row.is-off .imports-choice-copy strong")).toMatch(
      /color:\s*#5f574e/,
    );
    expect(ruleBody(css, ".imports-choice-row.is-off .imports-choice-count")).toMatch(
      /color:\s*#716859/,
    );
  });

  test("as regras antigas da escolha saíram e as de conflitos ficaram", () => {
    const css = readCss();
    expect(css).not.toMatch(/\.imports-select-row/);
    expect(css).toMatch(/\.imports-actions\.is-split\s*\{/);
  });
});
