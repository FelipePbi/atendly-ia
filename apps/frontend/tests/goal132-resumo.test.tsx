// @vitest-environment jsdom
/**
 * Goal132 (WU-01): o resumo é o quadro 2.I4, nas duas molduras.
 *
 * O que esta suíte prova:
 *
 * - o título é só o título: sem descrição e, no onboarding, sem o eyebrow
 *   "Importação" (o quadro só mostra o da moldura); h1 no onboarding e h2 em
 *   Configurações;
 * - as linhas seguem a ordem do quadro (serviços, clientes, agendamentos
 *   futuros, atendimentos anteriores, cancelamentos, faltas, bloqueios e
 *   horários), com o nome antes do número (decisão da validação de
 *   2026-10-11: "Cancelamentos 0", invertendo o quadro);
 * - horários com regras encontradas mostram o selo e nenhum número, e dizem
 *   "encontrados" para a tecnologia assistiva; com 0 regras, mostram o número;
 * - a legenda da limitação e "Você deixou esta categoria de fora" seguem como
 *   hoje;
 * - "Importar tudo" com tudo escolhido e "Importar N registros" com a soma de
 *   hoje (inclusive `AVAILABILITY`) quando algo ficou de fora;
 * - "Escolher o que importar" é um botão com alvo de pelo menos 24 px, que
 *   abre a escolha sem pedido;
 * - o CSS do resumo usa classes novas e não toca `.imports-rows` nem
 *   `.imports-row-count`, que conflitos e execução usam.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ImportLiveSession,
  ImportPreviewCategory,
  ImportPreviewSnapshot,
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

/** Todas as oito categorias, na ordem do contrato (não a do quadro). */
function previewFixture(
  overrides: { availability?: number } = {},
): ImportPreviewSnapshot {
  return {
    categories: [
      categoryFixture("SERVICE", 12),
      categoryFixture("CUSTOMER", 386),
      categoryFixture("AVAILABILITY", overrides.availability ?? 6),
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
    previewVersion: 1,
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
    previewVersion: 1,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: null,
    status: "READY",
  };
}

function renderSummary(
  frame: ImportsFrame,
  session: ImportLiveSession = sessionFixture(),
) {
  return render(
    <ImportsFrameProvider frame={frame}>
      <ImportPreviewScreen
        onChanged={vi.fn()}
        onReplaceAccount={vi.fn()}
        session={session}
      />
    </ImportsFrameProvider>,
  );
}

async function summaryRows(): Promise<HTMLElement[]> {
  await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

beforeEach(() => {
  vi.resetAllMocks();
  getImportPreview.mockResolvedValue(previewFixture());
});

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "resumo na moldura %s",
  (frame) => {
    test("título sem descrição e sem o eyebrow Importação no onboarding", async () => {
      const { container } = renderSummary(frame);

      const heading = await screen.findByRole("heading", {
        name: "Encontramos isto no Minha Agenda",
      });
      expect(heading.tagName).toBe(frame === "onboarding" ? "H1" : "H2");
      expect(
        screen.queryByText("Isso não altera nada na Avenly. Revise antes de confirmar."),
      ).not.toBeInTheDocument();
      const header = container.querySelector(".imports-header") as HTMLElement;
      expect(header.querySelector("p")).toBeNull();
      expect(header.textContent).toBe("Encontramos isto no Minha Agenda");
      expect(container.querySelector("p.eyebrow")).toBeNull();
    });

    test("as linhas seguem a ordem do quadro, com o nome antes do número", async () => {
      renderSummary(frame);

      const rows = await summaryRows();
      expect(rows.map((row) => row.textContent)).toEqual([
        "Serviços12",
        "Clientes386",
        "Agendamentos futuros42",
        "Atendimentos anteriores1.400",
        "Cancelamentos9",
        "FaltasO Minha Agenda não distingue falta de cancelamento. Nenhum atendimento será marcado como falta a partir de lá.0",
        "Bloqueios3",
        "Horários de atendimento, encontrados",
      ]);
      const [services] = rows;
      const [copy, count] = Array.from(services.children);
      expect(copy.textContent).toBe("Serviços");
      expect(count.textContent).toBe("12");
    });

    test("horários encontrados mostram o selo, sem número, e dizem 'encontrados'", async () => {
      renderSummary(frame);

      const rows = await summaryRows();
      const row = rows[rows.length - 1];
      expect(row.textContent).not.toMatch(/\d/);
      expect(row.querySelector(".imports-summary-count")).toBeNull();
      const seal = row.querySelector(".imports-summary-seal");
      expect(seal).toHaveAttribute("aria-hidden", "true");
      expect(within(row).getByText("Horários de atendimento")).toBeInTheDocument();
      expect(within(row).getByText(", encontrados")).toHaveClass("sr-only");
      // O 6 de `AVAILABILITY` não aparece como número em lugar nenhum.
      expect(screen.queryByText("6")).not.toBeInTheDocument();
    });

    test("horários com 0 regras mostram o número, como as outras linhas", async () => {
      getImportPreview.mockResolvedValue(previewFixture({ availability: 0 }));
      renderSummary(frame);

      const rows = await summaryRows();
      const row = rows[rows.length - 1];
      expect(row.querySelector(".imports-summary-seal")).toBeNull();
      expect(row.querySelector(".imports-summary-count")?.textContent).toBe("0");
      expect(row.textContent).toBe("Horários de atendimento0");
    });

    test("a legenda da categoria deixada de fora segue como hoje", async () => {
      renderSummary(
        frame,
        sessionFixture(ALL_CATEGORIES.filter((c) => c !== "PAST_APPOINTMENT")),
      );

      const rows = await summaryRows();
      const past = rows.find((row) => row.textContent?.includes("Atendimentos anteriores"));
      expect(past?.textContent).toBe(
        "Atendimentos anterioresVocê deixou esta categoria de fora1.400",
      );
    });

    test("'Importar tudo' com tudo escolhido", async () => {
      const user = userEvent.setup();
      executeImport.mockResolvedValue({
        previewVersion: 1,
        sessionId: "session-1",
        status: "EXECUTING",
      });
      getImportState.mockResolvedValue({
        history: null,
        right: { available: true, sessionId: "session-1", completedAt: null },
        session: sessionFixture(),
      });
      renderSummary(frame);

      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
      await user.click(screen.getByRole("button", { name: "Importar tudo" }));

      expect(executeImport).toHaveBeenCalledWith(
        "session-1",
        { previewVersion: 1 },
        expect.any(String),
      );
      expect(setImportCategorySelection).not.toHaveBeenCalled();
    });

    test("'Importar N registros' soma o que está escolhido, inclusive os horários", async () => {
      renderSummary(
        frame,
        sessionFixture(["SERVICE", "CUSTOMER", "AVAILABILITY"]),
      );

      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
      // 12 + 386 + 6 horários.
      expect(
        screen.getByRole("button", { name: "Importar 404 registros" }),
      ).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Importar tudo" })).toBeNull();
      expect(
        screen.getByText(
          "Só o que está escolhido será importado. O que ficar de fora não poderá ser importado depois.",
        ),
      ).toBeInTheDocument();
    });

    test("com soma 0 o primário fica desabilitado", async () => {
      renderSummary(frame, sessionFixture([]));

      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
      expect(
        screen.getByRole("button", { name: "Importar 0 registros" }),
      ).toBeDisabled();
    });

    test("'Escolher o que importar' é um botão que abre a escolha sem pedido", async () => {
      const user = userEvent.setup();
      renderSummary(frame);

      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
      const action = screen.getByRole("button", { name: "Escolher o que importar" });
      expect(action.tagName).toBe("BUTTON");
      expect(action).toHaveAttribute("type", "button");
      expect(action).toHaveClass("imports-text-action");
      getImportPreview.mockClear();

      await user.click(action);

      expect(
        await screen.findByRole("heading", { name: "O que você quer trazer?" }),
      ).toBeInTheDocument();
      expect(getImportPreview).not.toHaveBeenCalled();
      expect(analyzeImport).not.toHaveBeenCalled();
      expect(setImportCategorySelection).not.toHaveBeenCalled();
      expect(executeImport).not.toHaveBeenCalled();
    });

    test("o primário vem antes da ação de texto", async () => {
      renderSummary(frame);

      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
      const primary = screen.getByRole("button", { name: "Importar tudo" });
      const text = screen.getByRole("button", { name: "Escolher o que importar" });
      expect(
        primary.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    test("axe: resumo sem violações", async () => {
      const { container } = renderSummary(frame);

      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" });
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
  const escaped = selector.replace(/[.[\]():,]/g, "\\$&");
  const match = new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `regra ${selector}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

describe("o CSS do resumo", () => {
  test("as regras de conflitos e execução ficam como estavam", () => {
    const css = readCss();
    expect(ruleBody(css, ".imports-rows .imports-row-count")).toMatch(
      /font-size:\s*20px/,
    );
    expect(ruleBody(css, ".imports-rows li")).toMatch(/min-height:\s*56px/);
    expect(css).not.toMatch(/\.imports-summary[^{]*\.imports-rows/);
    expect(css).not.toMatch(/\.imports-summary[^{]*\.imports-row-count/);
  });

  test("o número é Literata 22 px com algarismos tabulares, alinhado à direita", () => {
    const body = ruleBody(readCss(), ".imports-summary-count");
    expect(body).toMatch(/font-size:\s*22px/);
    expect(body).toMatch(/font-weight:\s*500/);
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(body).toMatch(/margin-left:\s*auto/);
    expect(body).toMatch(/text-align:\s*right/);
    expect(body).toMatch(/Literata/);
  });

  test("o selo tem 26 px, é redondo e usa o verde do quadro", () => {
    const body = ruleBody(readCss(), ".imports-summary-seal");
    expect(body).toMatch(/width:\s*26px/);
    expect(body).toMatch(/height:\s*26px/);
    expect(body).toMatch(/border-radius:\s*50%/);
    expect(body).toMatch(/background:\s*#dfefe4/);
  });

  test("a ação de texto é 15 px 600 #0f5f63, com alvo de 24 px e foco visível", () => {
    const css = readCss();
    const body = ruleBody(css, ".imports-text-action");
    expect(body).toMatch(/font-size:\s*15px/);
    expect(body).toMatch(/font-weight:\s*600/);
    expect(body).toMatch(/color:\s*#0f5f63/);
    expect(body).toMatch(/min-height:\s*24px/);
    expect(body).toMatch(/padding:\s*6px 0/);
    expect(ruleBody(css, ".imports-text-action:focus-visible")).toMatch(/outline:/);
  });
});
