// @vitest-environment jsdom
/**
 * Goal138 (2.I6): as duas correções da tela de conflitos da importação.
 *
 * - "Carregar mais" depois de `IMPORT_ITEM_ALREADY_DECIDED`: o item também
 *   saiu da fila, então a conta de `hasMore` não pode mais contar com ele;
 * - as `notes` do 2.I6 não declaram a `ReplaceAccountZone`, porque no modo de
 *   conflitos ela não é renderizada.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type ImportCategory,
  type ImportItem,
  type ImportLiveSession,
  type ImportPreviewSnapshot,
  type ImportProgress,
} from "@/data";
import { ImportConflictsScreen } from "@/features/imports/ImportConflictsScreen";
import { ImportRunScreen } from "@/features/imports/ImportRunScreen";
import {
  type ImportsFrame,
  ImportsFrameProvider,
} from "@/features/imports/ImportsLayout";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const decideImportItem = vi.fn();
const getImportPreview = vi.fn();
const getImportProgress = vi.fn();
const getImportState = vi.fn();
const listImportItems = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration: vi.fn() },
    migration: {
      analyzeImport: vi.fn(),
      completeImport: vi.fn(),
      decideImportItem,
      executeImport: vi.fn(),
      getImportPreview,
      getImportProgress,
      getImportState,
      listImportItems,
      setImportCategorySelection: vi.fn(),
      startImport: vi.fn(),
    },
    settings: { get: () => new Promise<never>(() => undefined) },
  }),
}));

function serviceItem(index: number): ImportItem {
  return {
    attemptCount: 0,
    category: "SERVICE",
    disappearedAt: null,
    entityType: null,
    externalId: `ext-s${index}`,
    id: `s${index}`,
    internalId: null,
    label: `Serviço ${index}`,
    lastAttemptAt: null,
    processedAt: null,
    reasonCode: "SERVICE_DURATION_MISSING",
    reasonDetail: null,
    status: "NEEDS_REVIEW",
  };
}

/** A fila em revisão que a rota de itens devolve, cortada pelo deslocamento. */
let queue: ImportItem[] = [];

function serveQueue() {
  listImportItems.mockImplementation(
    async (
      sessionId: string,
      category: ImportCategory,
      query: { limit: number; offset: number },
    ) => ({
      category,
      items: queue.slice(query.offset, query.offset + query.limit),
      limit: query.limit,
      offset: query.offset,
      sessionId,
      total: queue.length,
    }),
  );
}

/** O Scheduling recusa a decisão de um item que já tem uma, e o item sai da fila do mesmo jeito. */
function refuseAsAlreadyDecided() {
  decideImportItem.mockImplementation(async (_session: string, itemId: string) => {
    queue = queue.filter((item) => item.id !== itemId);
    throw new BffHttpError({
      code: "UPSTREAM_ERROR",
      details: { upstreamCode: "IMPORT_ITEM_ALREADY_DECIDED" },
      message: "refused",
      requestId: "req-1",
      status: 409,
    });
  });
}

function renderScreen(total: number, frame: ImportsFrame) {
  render(
    <ImportsFrameProvider frame={frame}>
      <ImportConflictsScreen
        categories={[{ category: "SERVICE", needsReviewCount: total }]}
        onBack={vi.fn()}
        sessionId="session-1"
      />
    </ImportsFrameProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  queue = [];
  serveQueue();
});

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "'Carregar mais' depois de IMPORT_ITEM_ALREADY_DECIDED, na moldura %s",
  (frame) => {
    test("o último item que faltava sai da fila: não sobra nada a carregar", async () => {
      queue = [serviceItem(0)];
      refuseAsAlreadyDecided();
      const user = userEvent.setup();
      renderScreen(1, frame);

      await screen.findByText("Serviço 0");
      expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();

      await user.click(screen.getByRole("button", { name: "Importar mesmo assim" }));

      expect(
        await screen.findByText("Este item já foi decidido antes de você confirmar."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
      expect(listImportItems).toHaveBeenCalledTimes(1);
    });

    test("com mais itens na fila, aparece e lê a página seguinte contando só o que ainda está nela", async () => {
      queue = Array.from({ length: 25 }, (_, index) => serviceItem(index));
      refuseAsAlreadyDecided();
      const user = userEvent.setup();
      renderScreen(25, frame);

      await screen.findByText("Serviço 0");
      expect(screen.queryByText("Serviço 20")).toBeNull();

      await user.click(screen.getByRole("button", { name: "Importar mesmo assim" }));
      await screen.findByText("Este item já foi decidido antes de você confirmar.");
      await user.click(screen.getByRole("button", { name: "Carregar mais" }));

      await screen.findByText("Serviço 24");
      expect(listImportItems).toHaveBeenLastCalledWith(
        "session-1",
        "SERVICE",
        { limit: 20, offset: 19, status: "NEEDS_REVIEW" },
        expect.anything(),
      );
      expect(screen.getAllByText(/^Serviço \d+$/)).toHaveLength(25);
      expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    });
  },
);

/* --- A ReplaceAccountZone fora do modo de conflitos ------------------------ */

const REPLACE_NOTE = /Prefere conectar outra conta do Minha Agenda\?/;

function sessionOf(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
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

function previewOf(): ImportPreviewSnapshot {
  const base = {
    failedCount: 0,
    importedCount: 0,
    limitationCode: null,
    limitationDetail: null,
    skippedCount: 0,
    sourceSupported: true,
  };
  return {
    categories: [
      { ...base, category: "SERVICE", discoveredCount: 12, needsReviewCount: 1, pendingCount: 11, readCount: 12, sourceReportedCount: 12 },
    ],
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    sessionId: "session-1",
  };
}

function progressOf(): ImportProgress {
  return {
    categories: [
      { category: "SERVICE", failed: 0, failedReasons: [], imported: 11, needsReview: 1, pending: 0, skipped: 0 },
    ],
    counts: { failed: 0, imported: 11, needsReview: 1, pending: 0, skipped: 0 },
    finishedAt: "2026-09-15T10:20:00.000Z",
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
  };
}

describe("no modo de conflitos a ReplaceAccountZone não é renderizada", () => {
  test("nem o resumo nem os conflitos têm a zona", async () => {
    queue = [serviceItem(0)];
    getImportState.mockResolvedValue({
      history: null,
      right: { available: true, completedAt: null, sessionId: "session-1" },
      session: sessionOf(),
    });
    getImportPreview.mockResolvedValue(previewOf());
    getImportProgress.mockResolvedValue({});
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ImportsScreen />
      </ShellConfigProvider>,
    );

    // A troca de conta saiu do resumo (validação de 2026-10-11): fica só nos
    // estados de erro e de análise interrompida.
    await screen.findByRole("button", { name: "Revisar conflitos" });
    expect(screen.queryByText(REPLACE_NOTE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Conectar outra conta" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Revisar conflitos" }));
    await screen.findByText("Serviço 0");

    expect(screen.queryByText(REPLACE_NOTE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Conectar outra conta" })).toBeNull();
  });

  test.each<ImportsFrame>(["onboarding", "platform"])(
    "nem a tela parada nem 'Revisar pendências' têm a zona, na moldura %s",
    async (frame) => {
      queue = [serviceItem(0)];
      getImportProgress.mockResolvedValue(progressOf());
      const user = userEvent.setup();
      render(
        <ImportsFrameProvider frame={frame}>
          <ImportRunScreen
            onChanged={vi.fn()}
            onReplaceAccount={vi.fn()}
            session={sessionOf({ status: "PARTIAL", startedAt: "2026-09-15T10:10:00.000Z" })}
          />
        </ImportsFrameProvider>,
      );

      // O andamento já leu: a tela de carregamento ainda tem a zona, a tela
      // parada não (validação de 2026-10-11: a troca de conta saiu da tela
      // "Importação quase concluída").
      const review = await screen.findByRole("button", { name: "Revisar pendências" });
      expect(
        screen.getByRole("heading", { name: "Importação quase concluída" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(REPLACE_NOTE)).toBeNull();
      expect(screen.queryByRole("button", { name: "Conectar outra conta" })).toBeNull();

      await user.click(review);
      await screen.findByText("Serviço 0");

      expect(screen.queryByText(REPLACE_NOTE)).toBeNull();
      expect(screen.queryByRole("button", { name: "Conectar outra conta" })).toBeNull();
    },
  );
});

/* --- As notes do 2.I6 ------------------------------------------------------- */

type Target = { code: string; file: string; notes?: string };

const targets = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../e2e/visual/targets.json"), "utf8"),
  ) as { targets: Target[] }
).targets;

function notesOf(code: string): string {
  const found = targets.find(
    (item) => item.code === code && item.file === "Onboarding-2-Importacao.dc.html",
  );
  expect(found, code).toBeDefined();
  return found?.notes ?? "";
}

describe("as notes do 2.I6", () => {
  test("não citam a ReplaceAccountZone, e as demais divergências do Goal137 continuam", () => {
    const notes = notesOf("2.I6");

    expect(notes).not.toContain("ReplaceAccountZone");
    expect(notes).not.toContain("Prefere conectar outra conta?");
    for (const divergence of [
      "decidido do quadro",
      "Manter o da Avenly",
      "Criar outro serviço",
      "Não importar este item",
      "borda neutra",
      "um por vez",
      "Nomes parecidos. São a mesma pessoa?",
      "CUSTOMER_PHONE_SHARED",
      "1.843",
      "1.837",
      "D-147",
      "formatServicePrice",
      "color: var(--fg)",
      "D-145",
      "D-104",
      "chapterFraction",
      "iPhone",
      "reducedMotion",
    ]) {
      expect(notes, divergence).toContain(divergence);
    }
  });

  test("as notes dos outros alvos da importação ainda declaram a ReplaceAccountZone", () => {
    for (const code of ["2.I4", "2.I8", "2.I9"]) {
      expect(notesOf(code), code).toContain("ReplaceAccountZone");
    }
  });
});
