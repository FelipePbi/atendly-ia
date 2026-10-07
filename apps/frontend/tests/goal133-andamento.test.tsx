// @vitest-environment jsdom
/**
 * Goal133 (WU-01): a importação em andamento é o quadro 2.I7, nas duas molduras.
 *
 * O que esta suíte prova:
 *
 * - o título é "Importando…" e a descrição é "Leva alguns minutos." (sem "Fique
 *   nesta tela", que não é verdade: sair da tela não para a importação) e, no
 *   onboarding, sem o eyebrow "Importação";
 * - os processados e "de N registros" usam a conta de hoje (inclusive
 *   `AVAILABILITY`); a barra mantém o `role="progressbar"` e os `aria-*`; o
 *   resumo `aria-live` mantém o texto de hoje, visualmente oculto; o cabeçalho
 *   do painel de hoje sai da tela;
 * - a lista segue a ordem da execução, sem categoria que o negócio deixou de
 *   fora, e o estado de cada linha sai das contagens: concluída com `pending`
 *   0, em andamento só a primeira com `pending`, as outras na fila;
 * - a concluída mostra o total da categoria, a em andamento mostra "N de M", a
 *   na fila não mostra número, e os horários nunca mostram número;
 * - "Revisar itens" é ação de texto, só com item esperando decisão, e não há
 *   primário;
 * - nada muda fora do caso em andamento: interrompida, `PARTIAL`, `READY` e
 *   terminal seguem a tela de hoje; a releitura de 3 s, a parada dela, a
 *   retomada e a conclusão fazem os mesmos pedidos;
 * - o CSS usa classes novas, não toca as que a tela parada compartilha e só
 *   anima com `prefers-reduced-motion: no-preference`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ImportLiveSession, ImportProgress } from "@/data";
import { ImportRunScreen } from "@/features/imports/ImportRunScreen";
import {
  type ImportsFrame,
  ImportsFrameProvider,
} from "@/features/imports/ImportsLayout";

import { expectNoA11yViolations } from "./support/a11y";

const getImportProgress = vi.fn();
const getImportState = vi.fn();
const executeImport = vi.fn();
const completeImport = vi.fn();
const listImportItems = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    migration: {
      completeImport,
      decideImportItem: vi.fn(),
      executeImport,
      getImportProgress,
      getImportState,
      listImportItems,
    },
  }),
}));

type Category = ImportProgress["categories"][number];
type CategoryName = Category["category"];

function entry(
  category: CategoryName,
  counts: Partial<Omit<Category, "category" | "failedReasons">> = {},
): Category {
  return {
    category,
    failed: 0,
    failedReasons: [],
    imported: 0,
    needsReview: 0,
    pending: 0,
    skipped: 0,
    ...counts,
  };
}

function sumOf(categories: Category[]): ImportProgress["counts"] {
  const counts = { failed: 0, imported: 0, needsReview: 0, pending: 0, skipped: 0 };
  for (const category of categories) {
    counts.failed += category.failed;
    counts.imported += category.imported;
    counts.needsReview += category.needsReview;
    counts.pending += category.pending;
    counts.skipped += category.skipped;
  }
  return counts;
}

/** A captura do 2.I7: quatro categorias prontas e os atendimentos anteriores no meio. */
function quadroCategories(): Category[] {
  return [
    entry("SERVICE", { imported: 12 }),
    entry("CUSTOMER", { imported: 386 }),
    entry("AVAILABILITY", { imported: 6 }),
    entry("FUTURE_APPOINTMENT", { imported: 42 }),
    entry("PAST_APPOINTMENT", { imported: 764, pending: 636 }),
  ];
}

function progressFixture(
  categories: Category[] = quadroCategories(),
  overrides: Partial<ImportProgress> = {},
): ImportProgress {
  return {
    categories,
    counts: sumOf(categories),
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "EXECUTING",
    ...overrides,
  };
}

function sessionFixture(
  overrides: Partial<ImportLiveSession> & { deselected?: CategoryName[] } = {},
): ImportLiveSession {
  const { deselected = [], ...rest } = overrides;
  const categories = quadroCategories();
  return {
    categories: categories.map((category) => ({
      category: category.category,
      failed: category.failed,
      imported: category.imported,
      needsReview: category.needsReview,
      pending: category.pending,
      selected: !deselected.includes(category.category),
      skipped: category.skipped,
    })),
    counts: sumOf(categories),
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
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "EXECUTING",
    ...rest,
  };
}

function renderRun(
  frame: ImportsFrame,
  session: ImportLiveSession = sessionFixture(),
) {
  return render(
    <ImportsFrameProvider frame={frame}>
      <ImportRunScreen
        onChanged={vi.fn()}
        onReplaceAccount={vi.fn()}
        session={session}
      />
    </ImportsFrameProvider>,
  );
}

async function runningList(): Promise<HTMLElement> {
  await screen.findByRole("heading", { name: "Importando…" });
  return document.querySelector(".imports-running-list") as HTMLElement;
}

/** Cada linha como a usuária a encontra: o nome, o estado dito e o número. */
function describeRows(list: HTMLElement) {
  return within(list)
    .getAllByRole("listitem")
    .map((row) => ({
      count: row.querySelector(".imports-running-count")?.textContent ?? null,
      name: row.querySelector("strong")?.textContent ?? "",
      state: (/is-(done|active|queued)/.exec(row.className) ?? [])[1],
      said: row.querySelector(".sr-only")?.textContent ?? "",
    }));
}

beforeEach(() => {
  vi.resetAllMocks();
  getImportProgress.mockResolvedValue(progressFixture());
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "andamento na moldura %s",
  (frame) => {
    test("título e descrição do quadro, sem o aviso falso e sem o eyebrow no onboarding", async () => {
      const { container } = renderRun(frame);

      const heading = await screen.findByRole("heading", { name: "Importando…" });
      expect(heading.tagName).toBe(frame === "onboarding" ? "H1" : "H2");
      expect(screen.getByText("Leva alguns minutos.")).toBeInTheDocument();
      expect(screen.queryByText(/Fique nesta tela/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Importando seus dados/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Estamos trazendo seus dados/)).not.toBeInTheDocument();
      expect(container.querySelector("p.eyebrow")).toBeNull();
    });

    test("o número grande e 'de N registros' usam a conta de hoje, inclusive os horários", async () => {
      renderRun(frame);

      await screen.findByRole("heading", { name: "Importando…" });
      // 12 + 386 + 6 + 42 + 764 importados e 636 pendentes: 1.846 no total.
      expect(document.querySelector(".imports-running-processed")).toHaveTextContent(
        /^1\.210$/,
      );
      expect(document.querySelector(".imports-running-of")).toHaveTextContent(
        /^de 1\.846 registros$/,
      );
    });

    test("a barra mantém o papel e os aria-* de hoje, com a largura processados sobre total", async () => {
      renderRun(frame);

      const bar = await screen.findByRole("progressbar");
      expect(bar).toHaveAttribute("aria-label", "Andamento da importação");
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "1846");
      expect(bar).toHaveAttribute("aria-valuenow", "1210");
      expect(bar).toHaveAttribute(
        "aria-valuetext",
        "1.210 de 1.846 registros processados",
      );
      const fill = bar.querySelector(".imports-running-fill") as HTMLElement;
      expect(parseFloat(fill.style.width)).toBeCloseTo((1210 / 1846) * 100, 5);
    });

    test("o resumo aria-live mantém o texto de hoje, visualmente oculto", async () => {
      renderRun(frame);

      const summary = await screen.findByText(
        "1.210 de 1.846 registros processados · 1.210 importados",
      );
      expect(summary).toHaveAttribute("aria-live", "polite");
      expect(summary).toHaveClass("sr-only");
    });

    test("o cabeçalho do painel de hoje e o painel do que não entrou saem da tela", async () => {
      const { container } = renderRun(frame);

      await screen.findByRole("heading", { name: "Importando…" });
      expect(container.querySelector(".imports-panel")).toBeNull();
      expect(container.querySelector(".imports-progress-track")).toBeNull();
      expect(screen.queryByText(/desde/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Minha Agenda · /)).not.toBeInTheDocument();
      expect(screen.queryByText(/O que ainda não entrou/)).not.toBeInTheDocument();
      expect(screen.getAllByRole("heading", { name: "Importando…" })).toHaveLength(1);
      expect(screen.queryByRole("heading", { name: "Importando" })).not.toBeInTheDocument();
    });

    test("as linhas seguem a ordem da execução, com o estado das contagens", async () => {
      renderRun(frame);

      const rows = describeRows(await runningList());
      expect(rows).toEqual([
        { count: "12", name: "Serviços", said: ", concluída", state: "done" },
        { count: "386", name: "Clientes", said: ", concluída", state: "done" },
        {
          count: null,
          name: "Horários de atendimento",
          said: ", concluída",
          state: "done",
        },
        {
          count: "42",
          name: "Agendamentos futuros",
          said: ", concluída",
          state: "done",
        },
        {
          count: "764 de 1.400",
          name: "Atendimentos anteriores",
          said: ", em andamento",
          state: "active",
        },
      ]);
    });

    test("só a primeira categoria com pending está em andamento; as outras ficam na fila", async () => {
      const categories = [
        entry("SERVICE", { imported: 12 }),
        entry("CUSTOMER", { imported: 100, pending: 286 }),
        entry("AVAILABILITY", { pending: 6 }),
        entry("FUTURE_APPOINTMENT", { pending: 42 }),
        entry("PAST_APPOINTMENT", { pending: 1400 }),
      ];
      getImportProgress.mockResolvedValue(progressFixture(categories));
      renderRun(frame);

      const list = await runningList();
      const rows = describeRows(list);
      expect(rows.map((row) => row.state)).toEqual([
        "done",
        "active",
        "queued",
        "queued",
        "queued",
      ]);
      expect(list.querySelectorAll(".is-active")).toHaveLength(2);
      expect(list.querySelectorAll(".imports-running-row.is-active")).toHaveLength(1);
      expect(rows.map((row) => row.said)).toEqual([
        ", concluída",
        ", em andamento",
        ", na fila",
        ", na fila",
        ", na fila",
      ]);
      // A na fila não mostra número; a em andamento, "N de M" com a barra.
      expect(rows[1].count).toBe("100 de 386");
      expect(rows[3].count).toBeNull();
      expect(rows[4].count).toBeNull();
      const active = list.querySelector(".imports-running-row.is-active") as HTMLElement;
      const fill = active.querySelector(".imports-running-bar-fill") as HTMLElement;
      expect(parseFloat(fill.style.width)).toBeCloseTo((100 / 386) * 100, 5);
    });

    test.each([
      ["concluída", [entry("AVAILABILITY", { imported: 6 }), entry("PAST_APPOINTMENT", { pending: 3 })]],
      ["em andamento", [entry("AVAILABILITY", { imported: 2, pending: 4 }), entry("PAST_APPOINTMENT", { pending: 3 })]],
      ["na fila", [entry("SERVICE", { imported: 1, pending: 1 }), entry("AVAILABILITY", { pending: 6 })]],
    ])("os horários de atendimento nunca mostram número (%s)", async (_state, categories) => {
      getImportProgress.mockResolvedValue(progressFixture(categories));
      renderRun(frame);

      const list = await runningList();
      const row = within(list)
        .getAllByRole("listitem")
        .find((item) => item.textContent?.includes("Horários de atendimento")) as HTMLElement;
      expect(row.querySelector(".imports-running-count")).toBeNull();
      expect(row.textContent).not.toMatch(/\d/);
    });

    test("categoria que o negócio deixou de fora não entra na lista", async () => {
      renderRun(
        frame,
        sessionFixture({ deselected: ["CUSTOMER", "FUTURE_APPOINTMENT"] }),
      );

      const rows = describeRows(await runningList());
      expect(rows.map((row) => row.name)).toEqual([
        "Serviços",
        "Horários de atendimento",
        "Atendimentos anteriores",
      ]);
    });

    test("categoria sem nenhum registro não entra na lista", async () => {
      getImportProgress.mockResolvedValue(
        progressFixture([
          entry("SERVICE", { imported: 5 }),
          entry("CUSTOMER"),
          entry("PAST_APPOINTMENT", { pending: 4 }),
        ]),
      );
      renderRun(frame);

      const rows = describeRows(await runningList());
      expect(rows.map((row) => row.name)).toEqual(["Serviços", "Atendimentos anteriores"]);
    });

    test("a legenda diz o que espera decisão e o que não foi importado, sem a parte do que falta", async () => {
      getImportProgress.mockResolvedValue(
        progressFixture([
          entry("SERVICE", { failed: 1, imported: 10, needsReview: 2 }),
          entry("CUSTOMER", { imported: 3, pending: 4 }),
        ]),
      );
      renderRun(frame);

      const list = await runningList();
      const [service, customer] = within(list).getAllByRole("listitem");
      expect(service.querySelector(".imports-running-detail")).toHaveTextContent(
        "2 esperando sua decisão · 1 não importados",
      );
      expect(service.textContent).not.toMatch(/ainda não processados/);
      expect(customer.querySelector(".imports-running-detail")).toBeNull();
      expect(screen.queryByText(/ainda não processados/)).not.toBeInTheDocument();
    });

    test("o círculo, o anel e o visto são decorativos", async () => {
      renderRun(frame);

      const list = await runningList();
      const marks = list.querySelectorAll(".imports-running-mark");
      expect(marks).toHaveLength(5);
      for (const mark of Array.from(marks)) {
        expect(mark).toHaveAttribute("aria-hidden", "true");
      }
    });

    test("'Revisar itens' é ação de texto, só com item esperando decisão, e abre os conflitos", async () => {
      const user = userEvent.setup();
      const categories = [
        entry("SERVICE", { imported: 12 }),
        entry("CUSTOMER", { imported: 100, needsReview: 2, pending: 286 }),
      ];
      getImportProgress.mockResolvedValue(progressFixture(categories));
      listImportItems.mockResolvedValue({
        category: "CUSTOMER",
        items: [],
        limit: 20,
        offset: 0,
        sessionId: "session-1",
        total: 0,
      });
      renderRun(frame);

      const action = await screen.findByRole("button", { name: "Revisar itens" });
      expect(action).toHaveClass("imports-text-action");
      expect(action).not.toHaveClass("btn");

      await user.click(action);

      expect(
        await screen.findByRole("heading", { name: "Itens que precisam da sua decisão" }),
      ).toBeInTheDocument();
    });

    test("sem item esperando decisão, 'Revisar itens' não aparece", async () => {
      renderRun(frame);

      await screen.findByRole("heading", { name: "Importando…" });
      expect(screen.queryByRole("button", { name: "Revisar itens" })).not.toBeInTheDocument();
    });

    test("não há ação primária; a troca de conta segue por último, como hoje", async () => {
      const { container } = renderRun(frame);

      await screen.findByRole("heading", { name: "Importando…" });
      expect(container.querySelector(".btn-primary")).toBeNull();
      expect(
        screen.queryByRole("button", { name: /Concluir importação|Continuar|Importar os/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Conectar outra conta" })).toBeInTheDocument();
      const page = container.querySelector(".imports-running") as HTMLElement;
      expect(page).toHaveAttribute("aria-busy", "true");
    });

    test("uma leitura que falhou depois de uma boa avisa e mantém os números", async () => {
      vi.useFakeTimers();
      getImportProgress
        .mockResolvedValueOnce(progressFixture())
        .mockRejectedValue(new Error("rede"));
      renderRun(frame);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });

      expect(
        screen.getByText(/A última leitura do andamento falhou/),
      ).toBeInTheDocument();
      expect(document.querySelector(".imports-running-processed")).toHaveTextContent("1.210");
    });

    test("axe: andamento sem violações", async () => {
      const { container } = renderRun(frame);

      await screen.findByRole("heading", { name: "Importando…" });
      await expectNoA11yViolations(container);
    });
  },
);

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "o que não muda na moldura %s",
  (frame) => {
    test("interrompida: a tela é a de hoje, com 'Continuar'", async () => {
      getImportProgress.mockResolvedValue(
        progressFixture(quadroCategories(), { interrupted: true }),
      );
      const { container } = renderRun(frame, sessionFixture({ interrupted: true }));

      expect(
        await screen.findByRole("heading", { name: "Isso parou no meio do caminho" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Importando…" })).not.toBeInTheDocument();
      expect(container.querySelector(".imports-running")).toBeNull();
      expect(container.querySelector(".imports-progress-track")).not.toBeNull();
      expect(screen.getByText(/O que ainda não entrou/)).toBeInTheDocument();
      if (frame === "onboarding") {
        expect(container.querySelector("p.eyebrow")).not.toBeNull();
      }
    });

    test("PARTIAL: a tela parada (2.I8), com 'Concluir importação' e a confirmação", async () => {
      const user = userEvent.setup();
      getImportProgress.mockResolvedValue(
        progressFixture(quadroCategories(), { status: "PARTIAL" }),
      );
      const { container } = renderRun(frame, sessionFixture({ status: "PARTIAL" }));

      expect(
        await screen.findByRole("heading", { name: "Importação quase concluída" }),
      ).toBeInTheDocument();
      expect(container.querySelector(".imports-running")).toBeNull();
      expect(screen.getByRole("button", { name: "Importar os 636 que faltam" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Concluir importação" }));

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("button", { name: "Concluir importação" }),
      ).toBeInTheDocument();
    });

    test("READY depois de uma passada: a tela parada (2.I8)", async () => {
      getImportProgress.mockResolvedValue(
        progressFixture([entry("SERVICE", { imported: 12 })], { status: "READY" }),
      );
      const { container } = renderRun(frame, sessionFixture({ status: "READY" }));

      expect(
        await screen.findByRole("heading", { name: "Importação quase concluída" }),
      ).toBeInTheDocument();
      expect(container.querySelector(".imports-running")).toBeNull();
      expect(screen.getByRole("button", { name: "Concluir importação" })).toBeInTheDocument();
    });

    test("terminal: a tela parada de hoje, sem retomada", async () => {
      getImportProgress.mockResolvedValue(
        progressFixture(quadroCategories(), { status: "FAILED" }),
      );
      const { container } = renderRun(frame, sessionFixture({ status: "FAILED" }));

      expect(
        await screen.findByRole("heading", { name: "Esta importação não pode continuar" }),
      ).toBeInTheDocument();
      expect(container.querySelector(".imports-running")).toBeNull();
      expect(screen.queryByRole("button", { name: "Concluir importação" })).not.toBeInTheDocument();
    });

    test("a retomada a partir de PARTIAL mostra a tela em andamento enquanto retrying", async () => {
      const user = userEvent.setup();
      getImportProgress.mockResolvedValue(
        progressFixture(quadroCategories(), { status: "PARTIAL" }),
      );
      executeImport.mockReturnValue(new Promise<never>(() => undefined));
      renderRun(frame, sessionFixture({ status: "PARTIAL" }));

      await user.click(
        await screen.findByRole("button", { name: "Importar os 636 que faltam" }),
      );

      expect(await screen.findByRole("heading", { name: "Importando…" })).toBeInTheDocument();
      expect(executeImport).toHaveBeenCalledWith(
        "session-1",
        { previewVersion: 1 },
        expect.any(String),
      );
      expect(screen.queryByRole("button", { name: "Concluir importação" })).not.toBeInTheDocument();
    });

    test("a releitura é a cada 3 s enquanto o banco disser EXECUTING e para quando ele parar", async () => {
      vi.useFakeTimers();
      getImportProgress
        .mockResolvedValueOnce(progressFixture())
        .mockResolvedValueOnce(
          progressFixture([entry("PAST_APPOINTMENT", { imported: 1400 })], {
            status: "READY",
          }),
        );
      renderRun(frame);

      for (let tick = 0; tick < 20 && getImportProgress.mock.calls.length === 0; tick += 1) {
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(getImportProgress).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2_999);
      expect(getImportProgress).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(getImportProgress).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getImportProgress).toHaveBeenCalledTimes(2);
    });

    test("a tela passa de em andamento para a parada quando a leitura diz READY", async () => {
      vi.useFakeTimers();
      getImportProgress
        .mockResolvedValueOnce(progressFixture())
        .mockResolvedValue(
          progressFixture([entry("PAST_APPOINTMENT", { imported: 1400 })], {
            status: "READY",
          }),
        );
      renderRun(frame);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole("heading", { name: "Importando…" })).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(screen.getByRole("heading", { name: "Importação quase concluída" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Concluir importação" })).toBeInTheDocument();
    });

    test("a conclusão sem pendência segue sem confirmação e sem acceptPending", async () => {
      const user = userEvent.setup();
      const onChanged = vi.fn();
      getImportProgress.mockResolvedValue(
        progressFixture([entry("SERVICE", { imported: 12 })], { status: "READY" }),
      );
      completeImport.mockResolvedValue({
        categories: [],
        completedAt: "2026-09-15T12:00:00.000Z",
        completedBy: "user-1",
        counts: { failed: 0, imported: 12, needsReview: 0, pending: 0, skipped: 0 },
        pendingAcceptance: null,
        provider: "MINHA_AGENDA",
        sessionId: "session-1",
        sourceAccountId: "camila@example.com",
        sourceAccountLabel: "camila@example.com",
        status: "COMPLETED",
      });
      getImportState.mockResolvedValue({
        history: null,
        right: { available: false, completedAt: "2026-09-15T12:00:00.000Z", sessionId: "session-1" },
        session: null,
      });
      render(
        <ImportsFrameProvider frame={frame}>
          <ImportRunScreen
            onChanged={onChanged}
            onReplaceAccount={vi.fn()}
            session={sessionFixture({ status: "READY" })}
          />
        </ImportsFrameProvider>,
      );

      await user.click(await screen.findByRole("button", { name: "Concluir importação" }));

      await waitFor(() => expect(completeImport).toHaveBeenCalledTimes(1));
      expect(completeImport).toHaveBeenCalledWith("session-1", {}, expect.any(String));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
  const match = new RegExp(`(?:^|[{}/])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `regra ${selector}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

/** O último bloco `@media (...) { … }`, com as chaves aninhadas. */
function mediaBlock(css: string, query: string): string {
  const start = css.lastIndexOf(`@media (${query})`);
  expect(start, `@media (${query})`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  throw new Error(`@media (${query}) sem fechamento`);
}

describe("o CSS do andamento", () => {
  test("as classes que a tela parada, os conflitos e a prévia usam ficam como estavam", () => {
    const css = readCss();
    expect(ruleBody(css, ".imports-progress-track")).toMatch(/height:\s*8px/);
    expect(ruleBody(css, ".imports-progress-fill")).toMatch(/transition:\s*width 240ms ease/);
    expect(ruleBody(css, ".imports-rows .imports-row-count")).toMatch(/font-size:\s*20px/);
    expect(ruleBody(css, ".imports-rows li")).toMatch(/min-height:\s*56px/);
    // Nenhum seletor mistura as classes da tela em andamento com as compartilhadas.
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("{")
      .map((chunk) => chunk.split("}").pop() ?? "");
    const running = selectors.filter((entry) => entry.includes(".imports-running"));
    expect(running.length).toBeGreaterThan(10);
    for (const selector of running) {
      expect(selector).not.toMatch(/\.imports-(rows|row-count|progress|panel)/);
    }
  });

  test("o número é Literata 34 px 500 com algarismos tabulares e linha 1", () => {
    const body = ruleBody(readCss(), ".imports-running-processed");
    expect(body).toMatch(/Literata/);
    expect(body).toMatch(/font-size:\s*34px/);
    expect(body).toMatch(/font-weight:\s*500/);
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(body).toMatch(/line-height:\s*1;/);
  });

  test("'de N registros' é 14 px #5f574e e a linha do total alinha pela base", () => {
    const css = readCss();
    const of = ruleBody(css, ".imports-running-of");
    expect(of).toMatch(/font-size:\s*14px/);
    expect(of).toMatch(/color:\s*#5f574e/);
    const figures = ruleBody(css, ".imports-running-figures");
    expect(figures).toMatch(/align-items:\s*baseline/);
    expect(figures).toMatch(/justify-content:\s*space-between/);
  });

  test("a barra do total tem 8 px, raio 4 px, fundo #e5ded4 e preenchimento #0f5f63", () => {
    const css = readCss();
    const track = ruleBody(css, ".imports-running-track");
    expect(track).toMatch(/height:\s*8px/);
    expect(track).toMatch(/border-radius:\s*4px/);
    expect(track).toMatch(/background:\s*#e5ded4/);
    expect(ruleBody(css, ".imports-running-fill")).toMatch(/background:\s*#0f5f63/);
  });

  test("a barra da linha tem 4 px, raio 2 px e não anima o crescimento", () => {
    const css = readCss();
    const bar = ruleBody(css, ".imports-running-bar");
    expect(bar).toMatch(/height:\s*4px/);
    expect(bar).toMatch(/border-radius:\s*2px/);
    expect(bar).toMatch(/background:\s*#e5ded4/);
    const fill = ruleBody(css, ".imports-running-bar-fill");
    expect(fill).toMatch(/background:\s*#0f5f63/);
    expect(fill).not.toMatch(/animation|transition/);
  });

  test("cada linha tem 12 px de respiro, 14 px de espaço e divisória de 1 px", () => {
    const row = ruleBody(readCss(), ".imports-running-row");
    expect(row).toMatch(/padding:\s*12px 0/);
    expect(row).toMatch(/gap:\s*14px/);
    expect(row).toMatch(/align-items:\s*center/);
    expect(row).toMatch(/border-bottom:\s*1px solid #e5ded4/);
  });

  test("o círculo, o anel e o ponto têm as medidas e as cores do quadro", () => {
    const css = readCss();
    const mark = ruleBody(css, ".imports-running-mark");
    expect(mark).toMatch(/width:\s*24px/);
    expect(mark).toMatch(/height:\s*24px/);
    expect(mark).toMatch(/border-radius:\s*50%/);
    const done = ruleBody(css, ".imports-running-mark.is-done");
    expect(done).toMatch(/background:\s*#2e7d4f/);
    expect(done).toMatch(/color:\s*#fffdfa/);
    const queued = ruleBody(css, ".imports-running-mark.is-queued");
    expect(queued).toMatch(/border:\s*1\.5px solid #d6cec2/);
    expect(queued).toMatch(/box-sizing:\s*border-box/);
    expect(ruleBody(css, ".imports-running-halo")).toMatch(/border:\s*1\.5px solid #0f5f63/);
    const dot = ruleBody(css, ".imports-running-dot");
    expect(dot).toMatch(/inset:\s*7px/);
    expect(dot).toMatch(/background:\s*#0f5f63/);
  });

  test("a legenda é 13 px #716859 e a linha na fila é 15 px 500 #716859", () => {
    const css = readCss();
    const detail = ruleBody(css, ".imports-running-detail");
    expect(detail).toMatch(/font-size:\s*13px/);
    expect(detail).toMatch(/color:\s*#716859/);
    const queued = ruleBody(css, ".imports-running-row.is-queued .imports-running-name strong");
    expect(queued).toMatch(/font-weight:\s*500/);
    expect(queued).toMatch(/color:\s*#716859/);
    expect(ruleBody(css, ".imports-running-name strong")).toMatch(/font-size:\s*15px/);
  });

  test("a contagem é 14 px #5f574e com algarismos tabulares", () => {
    const body = ruleBody(readCss(), ".imports-running-count");
    expect(body).toMatch(/font-size:\s*14px/);
    expect(body).toMatch(/color:\s*#5f574e/);
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  test("o anel só respira com movimento permitido, e a transição da barra também", () => {
    const css = readCss();
    const permitted = mediaBlock(css, "prefers-reduced-motion: no-preference");
    expect(permitted).toMatch(/\.imports-running-halo\s*\{[^}]*animation:\s*at-breathe 2\.4s/);
    expect(permitted).toMatch(/\.imports-running-fill\s*\{[^}]*transition/);
    const outside = css.replace(permitted, "");
    expect(outside).not.toMatch(/\.imports-running[^{]*\{[^}]*animation:/);
    expect(outside).not.toMatch(/\.imports-running[^{]*\{[^}]*transition:/);
  });

  test("'Revisar itens' é a ação de texto de D-146, com alvo de pelo menos 24 px", () => {
    const body = ruleBody(readCss(), ".imports-text-action");
    expect(body).toMatch(/min-height:\s*24px/);
    expect(body).toMatch(/padding:\s*6px 0/);
  });

  test("o respiro do rodapé da moldura do onboarding é 46 px no celular e 32 px de 768 px em diante", () => {
    const css = readCss();
    expect(ruleBody(css, ".imports-page:has(.imports-running):not(.is-pushed)")).toMatch(
      /padding-bottom:\s*46px/,
    );
    expect(mediaBlock(css, "min-width: 768px")).toMatch(
      /\.imports-page:has\(\.imports-running\):not\(\.is-pushed\)\s*\{[^}]*padding-bottom:\s*32px/,
    );
  });
});
