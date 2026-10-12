// @vitest-environment jsdom
/**
 * Goal131 (WU-02): a análise é o quadro 2.I3, nas duas molduras, sem número
 * inventado.
 *
 * O que esta suíte prova:
 *
 * - com a sessão em `ANALYZING` aparecem cinco linhas, na ordem do quadro:
 *   Serviços, Clientes, Agendamentos futuros, Atendimentos anteriores e
 *   Horários de atendimento;
 * - nenhuma linha mostra número, mesmo quando `session.categories` traz
 *   contagens;
 * - a barra é `progressbar` com nome acessível e sem `aria-valuenow`; é
 *   indeterminada (um trecho que corre em laço, sem keyframe de largura nem
 *   largura que pare numa fração) e o CSS para todo movimento com
 *   `prefers-reduced-motion`;
 * - as cinco linhas são iguais entre si (mesma classe, sem estado próprio) e
 *   a pílula não tem margem, para cada linha ter a altura do quadro;
 * - "Isso pode levar alguns minutos." vem depois do cartão e o painel
 *   continua `aria-busy`;
 * - na análise o único pedido que sai é `getImportState`;
 * - o título é h1 no onboarding e h2 em Configurações, sem o eyebrow
 *   "Importação" (o quadro só mostra o da moldura).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ImportLiveSession, ImportState } from "@/data";
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

const ROWS = [
  "Serviços",
  "Clientes",
  "Agendamentos futuros",
  "Atendimentos anteriores",
  "Horários de atendimento",
];

function sessionFixture(
  overrides: Partial<ImportLiveSession> = {},
): ImportLiveSession {
  return {
    categories: [
      { category: "SERVICE", selected: true },
      { category: "CUSTOMER", selected: true },
    ] as unknown as ImportLiveSession["categories"],
    counts: { failed: 0, imported: 0, needsReview: 0, pending: 0, skipped: 0 },
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
    startedAt: null,
    status: "ANALYZING",
    ...overrides,
  };
}

function analyzingState(): ImportState {
  return {
    history: null,
    right: { available: true, sessionId: "session-1", completedAt: null },
    session: sessionFixture(),
  };
}

function renderAnalysis(frame: ImportsFrame = "onboarding") {
  return render(
    <ImportsFrameProvider frame={frame}>
      <ImportPreviewScreen
        onChanged={vi.fn()}
        onReplaceAccount={vi.fn()}
        session={sessionFixture()}
      />
    </ImportsFrameProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  getImportState.mockResolvedValue(analyzingState());
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "análise em ANALYZING na moldura %s",
  (frame) => {
    test("mostra as cinco linhas na ordem do quadro", () => {
      renderAnalysis(frame);

      const rows = screen.getAllByRole("listitem");
      expect(rows.map((row) => row.textContent)).toEqual(ROWS);
    });

    test("nenhuma linha mostra número, mesmo com contagens na sessão", () => {
      const session = sessionFixture({
        categories: [
          { category: "SERVICE", discoveredCount: 12, selected: true },
          { category: "CUSTOMER", discoveredCount: 386, selected: true },
        ] as unknown as ImportLiveSession["categories"],
      });
      render(
        <ImportsFrameProvider frame={frame}>
          <ImportPreviewScreen
            onChanged={vi.fn()}
            onReplaceAccount={vi.fn()}
            session={session}
          />
        </ImportsFrameProvider>,
      );

      for (const row of screen.getAllByRole("listitem")) {
        expect(row.textContent).not.toMatch(/\d/);
      }
      expect(screen.queryByText("12")).not.toBeInTheDocument();
      expect(screen.queryByText("386")).not.toBeInTheDocument();
    });

    test("a barra é progressbar nomeada e sem aria-valuenow", () => {
      renderAnalysis(frame);

      const bar = screen.getByRole("progressbar", {
        name: "Analisando seus dados",
      });
      expect(bar).not.toHaveAttribute("aria-valuenow");
      expect(bar).not.toHaveAttribute("aria-valuemin");
      expect(bar).not.toHaveAttribute("aria-valuemax");
    });

    test("nenhuma linha tem classe ou estado diferente das outras", () => {
      renderAnalysis(frame);

      const rows = screen.getAllByRole("listitem");
      expect(rows).toHaveLength(ROWS.length);
      const [first] = rows;
      for (const row of rows) {
        expect(row.className).toBe(first.className);
        expect(row.className).not.toMatch(/pending|active|done/);
        expect(row.getAttributeNames().sort()).toEqual(
          first.getAttributeNames().sort(),
        );
        expect(row.querySelector("svg")?.getAttribute("stroke")).toBe(
          "currentColor",
        );
      }
    });

    test("a nota vem depois do cartão e o painel continua aria-busy", () => {
      const { container } = renderAnalysis(frame);

      const panel = container.querySelector(".imports-analysis");
      expect(panel).toHaveAttribute("aria-busy", "true");
      const note = within(panel as HTMLElement).getByText(
        "Isso pode levar alguns minutos.",
      );
      const card = within(panel as HTMLElement).getByRole("list");
      expect(
        card.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    test("título e descrição do quadro, sem o eyebrow Importação", () => {
      const { container } = renderAnalysis(frame);

      expect(
        screen.getByRole("heading", {
          level: frame === "onboarding" ? 1 : 2,
          name: "Analisando seus dados…",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Nada muda na Avenly até você confirmar."),
      ).toBeInTheDocument();
      expect(container.querySelector(".eyebrow")).toBeNull();
    });

    test("sem violação de acessibilidade", async () => {
      const { container } = renderAnalysis(frame);

      await expectNoA11yViolations(container);
    });
  },
);

describe("pedidos durante a análise", () => {
  test("só getImportState sai: nada de analyzeImport, preview, seleção ou execução", async () => {
    renderAnalysis();

    await vi.waitFor(() => expect(getImportState).toHaveBeenCalledTimes(1));

    expect(analyzeImport).not.toHaveBeenCalled();
    expect(getImportPreview).not.toHaveBeenCalled();
    expect(setImportCategorySelection).not.toHaveBeenCalled();
    expect(executeImport).not.toHaveBeenCalled();
    expect(getImportProgress).not.toHaveBeenCalled();
  });
});

function readCss(): string {
  return readFileSync(
    join(process.cwd(), "src/shared/styles/avenly-imports.css"),
    "utf8",
  );
}

/** Corpo da regra `selector { … }` (primeira ocorrência em `css`). */
/** Todos os blocos de uma regra (a mesma classe pode aparecer mais de uma vez). */
function ruleBodies(css: string, selector: string): string[] {
  const escaped = selector.replace(/[.[\]()]/g, "\\$&");
  return Array.from(
    css.matchAll(new RegExp(`(?:^|[{}/])\\s*${escaped}\\s*\\{([^}]*)\\}`, "g")),
    (match) => match[1],
  );
}

function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.[\]()]/g, "\\$&");
  const match = new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `regra ${selector}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

describe("a barra é indeterminada", () => {
  test("nenhum keyframe da barra mexe na largura e o trecho corre em laço", () => {
    const css = readCss();
    const fill = ruleBody(css, ".imports-analysis-fill");
    const animation = /animation:\s*([\w-]+)([^;]*);/.exec(fill);
    expect(animation).not.toBeNull();
    expect(animation?.[2]).toMatch(/\binfinite\b/);
    expect(animation?.[2]).not.toMatch(/\b(both|forwards)\b/);

    const name = (animation as RegExpExecArray)[1];
    const keyframes = new RegExp(
      `@keyframes ${name}\\s*\\{([\\s\\S]*?\\})\\s*\\}`,
    ).exec(css);
    expect(keyframes, `@keyframes ${name}`).not.toBeNull();
    const body = (keyframes as RegExpExecArray)[1];
    expect(body).not.toMatch(/width/);
    expect(body).toMatch(/transform:\s*translateX/);
    expect(css).not.toMatch(/imports-analysis-grow/);
  });

  test("a barra segue andando mesmo com movimento reduzido", () => {
    // Decisão da validação de 2026-10-11: parada, a análise parece travada.
    // A regra vence o seletor universal de movimento reduzido.
    const fill = ruleBodies(readCss(), ".imports-analysis-fill").join("\n");

    expect(fill).toMatch(/animation-duration:\s*1\.6s\s*!important/);
    expect(fill).toMatch(/animation-iteration-count:\s*infinite\s*!important/);
  });
});

describe("cartão da análise", () => {
  test("a pílula não tem margem e as linhas usam uma cor só", () => {
    const css = readCss();

    expect(ruleBody(css, ".imports-analysis-pill")).not.toMatch(/margin/);
    expect(css).not.toMatch(/is-pending/);
    expect(ruleBody(css, ".imports-analysis-row")).toMatch(/color:\s*#716859/);
    expect(ruleBody(css, ".imports-analysis-label")).toMatch(
      /color:\s*#5f574e/,
    );
  });
});

describe("movimento reduzido", () => {
  test("barra, linhas e pílula animam mesmo com movimento reduzido", () => {
    const css = readCss();

    expect(css).not.toMatch(
      /prefers-reduced-motion[^{]*\{[^@]*\.imports-analysis[^{]*\{[^}]*animation:\s*none/,
    );
    expect(ruleBodies(css, ".imports-analysis-pill").join("\n")).toMatch(
      /animation-iteration-count:\s*infinite\s*!important/,
    );
    expect(ruleBodies(css, ".imports-analysis-row:nth-child(5)").join("\n")).toMatch(
      /animation-delay:\s*4s\s*!important/,
    );
  });
});
