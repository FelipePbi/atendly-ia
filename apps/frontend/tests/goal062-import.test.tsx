// @vitest-environment jsdom
/**
 * Goal062 (WU-05): telas de importação — conflito de disponibilidade e
 * textos por código.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - o conflito de `AVAILABILITY` mostra a grade atual do negócio e a
 *   proposta pela origem, por dia da semana, e resolve com "Usar os
 *   horários da Minha Agenda" (`INCLUDE`) ou "Manter meus horários"
 *   (`EXCLUDE`), sem pedir identificador de cadastro existente;
 * - `IMPORT_SOURCE_INVALID_RESPONSE` tem texto próprio, distinto do de
 *   `IMPORT_INTERNAL_ERROR`;
 * - o recuo da listagem de clientes (`CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED`)
 *   tem texto próprio, distinto do texto de lista incompleta
 *   (`CUSTOMER_DIRECTORY_UNAVAILABLE`);
 * - um código desconhecido cai sempre no texto genérico;
 * - nenhum texto de produto usado aqui contém "token", "OAuth", "API",
 *   "HTTP", "lease", "E.164" nem um código cru.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ImportItem,
  ImportLiveSession,
  ImportPreviewSnapshot,
  ImportProgress,
  ImportState,
} from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import {
  conflictReasonLabel,
  failedReasonLabel,
  limitationLabel,
  workErrorLabel,
} from "@/features/imports/labels";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getImportState = vi.fn();
const analyzeImport = vi.fn();
const getImportPreview = vi.fn();
const executeImport = vi.fn();
const listImportItems = vi.fn();
const decideImportItem = vi.fn();
const getImportProgress = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration: vi.fn() },
    settings: { get: () => new Promise<never>(() => undefined) },
    migration: {
      analyzeImport,
      decideImportItem,
      executeImport,
      getImportPreview,
      getImportProgress,
      getImportState,
      listImportItems,
      setImportCategorySelection: vi.fn(),
      startImport: vi.fn(),
    },
  }),
}));

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

function sessionFixture(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
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

function previewFixture(
  overrides: Partial<ImportPreviewSnapshot["categories"][number]> = {},
): ImportPreviewSnapshot {
  return {
    categories: [
      {
        category: "AVAILABILITY",
        discoveredCount: 1,
        failedCount: 0,
        importedCount: 0,
        limitationCode: null,
        limitationDetail: null,
        needsReviewCount: 1,
        pendingCount: 0,
        readCount: 1,
        skippedCount: 0,
        sourceReportedCount: 1,
        sourceSupported: true,
        ...overrides,
      },
    ],
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    sessionId: "session-1",
  };
}

function availabilityItemFixture(overrides: Partial<ImportItem> = {}): ImportItem {
  return {
    attemptCount: 0,
    category: "AVAILABILITY",
    currentAvailability: [
      { dayOfWeek: 1, startTime: "08:00", endTime: "12:00" },
    ],
    disappearedAt: null,
    entityType: null,
    externalId: "ext-avail-1",
    id: "item-avail-1",
    internalId: null,
    label: null,
    lastAttemptAt: null,
    processedAt: null,
    proposedAvailability: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ],
    reasonCode: "AVAILABILITY_REPLACES_CURRENT",
    reasonDetail: null,
    status: "NEEDS_REVIEW",
    ...overrides,
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

async function openAvailabilityConflict(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Revisar conflitos" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /horários de atendimento/ }),
  );
  await screen.findByRole("heading", { name: "horários de atendimento" });
  await user.click(await screen.findByRole("button", { name: "Resolver" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getImportProgress.mockResolvedValue(progressFixture());
  getImportState.mockResolvedValue(stateWithSession(sessionFixture()));
  getImportPreview.mockResolvedValue(previewFixture());
  listImportItems.mockResolvedValue({
    category: "AVAILABILITY",
    items: [availabilityItemFixture()],
    limit: 20,
    offset: 0,
    sessionId: "session-1",
    total: 1,
  });
});

describe("conflito de disponibilidade", () => {
  test("mostra a grade atual e a proposta por dia, e envia INCLUDE sem pedir identificador", async () => {
    const user = userEvent.setup();
    decideImportItem.mockResolvedValue({
      decision: {
        category: "AVAILABILITY",
        decidedAt: "2026-09-15T10:10:00.000Z",
        decidedBy: "user-1",
        decision: "INCLUDE",
        externalId: "ext-avail-1",
        id: "decision-1",
        itemId: "item-avail-1",
        noteCode: null,
        scope: "ITEM",
        targetInternalId: null,
      },
      item: availabilityItemFixture({ status: "IMPORTED" }),
    });
    const { container } = renderScreen();

    await openAvailabilityConflict(user);

    expect(screen.getByText("Horários atuais")).toBeInTheDocument();
    expect(screen.getByText("Horários do Minha Agenda")).toBeInTheDocument();
    expect(screen.getAllByText("Segunda")).toHaveLength(2);
    expect(screen.getByText("08:00–12:00")).toBeInTheDocument();
    expect(screen.getByText("09:00–18:00")).toBeInTheDocument();

    expect(
      screen.queryByLabelText("Identificador do cadastro existente"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    const includeButton = screen.getByRole("button", {
      name: "Usar os horários da Minha Agenda",
    });
    await user.click(includeButton);

    expect(decideImportItem).toHaveBeenCalledWith(
      "session-1",
      "item-avail-1",
      { decision: "INCLUDE", targetInternalId: undefined },
      expect.any(String),
    );

    const text = container.textContent ?? "";
    for (const forbidden of ["token", "OAuth", "API", "HTTP", "lease", "E.164"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/AVAILABILITY_[A-Z_]+/);
  });

  test("envia EXCLUDE ao manter os horários atuais, sem pedir identificador", async () => {
    const user = userEvent.setup();
    decideImportItem.mockResolvedValue({
      decision: {
        category: "AVAILABILITY",
        decidedAt: "2026-09-15T10:10:00.000Z",
        decidedBy: "user-1",
        decision: "EXCLUDE",
        externalId: "ext-avail-1",
        id: "decision-1",
        itemId: "item-avail-1",
        noteCode: null,
        scope: "ITEM",
        targetInternalId: null,
      },
      item: availabilityItemFixture({ status: "SKIPPED" }),
    });
    renderScreen();

    await openAvailabilityConflict(user);

    await user.click(
      screen.getByRole("button", { name: "Manter meus horários" }),
    );

    expect(decideImportItem).toHaveBeenCalledWith(
      "session-1",
      "item-avail-1",
      { decision: "EXCLUDE", targetInternalId: undefined },
      expect.any(String),
    );
  });
});

describe("texto por código, nunca a mensagem crua da origem", () => {
  test("IMPORT_SOURCE_INVALID_RESPONSE tem texto distinto de IMPORT_INTERNAL_ERROR", () => {
    const invalidResponse = workErrorLabel("IMPORT_SOURCE_INVALID_RESPONSE");
    const internalError = workErrorLabel("IMPORT_INTERNAL_ERROR");
    expect(invalidResponse).not.toBe(internalError);
    expect(invalidResponse.length).toBeGreaterThan(0);
    expect(internalError.length).toBeGreaterThan(0);
  });

  test("o recuo da listagem de clientes tem texto distinto do texto de lista incompleta", () => {
    const fallback = limitationLabel("CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED");
    const unavailable = limitationLabel("CUSTOMER_DIRECTORY_UNAVAILABLE");
    expect(fallback).not.toBe(unavailable);
    expect(fallback.length).toBeGreaterThan(0);
  });

  test("código desconhecido cai no texto genérico", () => {
    expect(workErrorLabel("SOME_UNKNOWN_CODE")).toBe(
      "Não foi possível continuar agora. Tente novamente.",
    );
    expect(limitationLabel("SOME_UNKNOWN_CODE")).toBe(
      "O Minha Agenda tem cobertura parcial nesta categoria.",
    );
    expect(conflictReasonLabel("SOME_UNKNOWN_CODE")).toBe(
      "Este item precisa da sua decisão antes de ser importado.",
    );
  });

  test("nenhum texto por código contém linguagem interna crua", () => {
    const codes = [
      "IMPORT_SOURCE_AUTH_REJECTED",
      "IMPORT_SOURCE_UNAVAILABLE",
      "IMPORT_SOURCE_INVALID_RESPONSE",
      "IMPORT_PREVIEW_STALE",
      "IMPORT_INTERNAL_ERROR",
    ];
    const limitationCodes = [
      "CUSTOMER_DIRECTORY_UNAVAILABLE",
      "CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED",
      "NO_SHOW_NOT_MODELED_BY_SOURCE",
    ];
    const conflictCodes = [
      "AVAILABILITY_REPLACES_CURRENT",
      "AVAILABILITY_SOURCE_OVERLAP",
      "SERVICE_PRICE_NOT_INFORMED",
    ];
    const failedCodes = [
      "AVAILABILITY_CHANGED_SINCE_ANALYSIS",
      "AVAILABILITY_SOURCE_OVERLAP",
    ];
    const allTexts = [
      ...codes.map(workErrorLabel),
      ...limitationCodes.map(limitationLabel),
      ...conflictCodes.map(conflictReasonLabel),
      ...failedCodes.map(failedReasonLabel),
    ];
    for (const text of allTexts) {
      for (const forbidden of ["token", "OAuth", "API", "HTTP", "lease", "E.164"]) {
        expect(text).not.toContain(forbidden);
      }
      expect(text).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
});

describe("textos leigos dos códigos novos da disponibilidade e do preço zero", () => {
  const FAILED_GENERIC = "Este item não foi importado.";
  const CONFLICT_GENERIC = "Este item precisa da sua decisão antes de ser importado.";

  function availabilityFailedProgress(reasonCode: string): ImportProgress {
    return progressFixture({
      categories: [
        {
          category: "AVAILABILITY",
          failed: 2,
          failedReasons: [{ reasonCode, count: 2 }],
          imported: 0,
          needsReview: 0,
          pending: 0,
          skipped: 0,
        },
      ],
      counts: { failed: 2, imported: 0, needsReview: 0, pending: 0, skipped: 0 },
    });
  }

  function expectNoInternalLanguage(text: string) {
    for (const forbidden of ["token", "OAuth", "API", "HTTP", "lease", "E.164"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
  }

  test("AVAILABILITY_CHANGED_SINCE_ANALYSIS na execução manda analisar de novo, nunca o genérico", async () => {
    getImportState.mockResolvedValue(
      stateWithSession(
        sessionFixture({ startedAt: "2026-09-15T10:10:00.000Z", status: "PARTIAL" }),
      ),
    );
    getImportProgress.mockResolvedValue(
      availabilityFailedProgress("AVAILABILITY_CHANGED_SINCE_ANALYSIS"),
    );
    const { container } = renderScreen();

    const reason = await screen.findByText(/mudaram depois da análise.*\(2\)/);
    expect(reason.textContent).toMatch(/Analise de novo/);
    expect(screen.queryByText(new RegExp(FAILED_GENERIC))).not.toBeInTheDocument();
    expectNoInternalLanguage(container.textContent ?? "");
  });

  test("AVAILABILITY_SOURCE_OVERLAP na execução tem texto próprio, nunca o genérico", async () => {
    getImportState.mockResolvedValue(
      stateWithSession(
        sessionFixture({ startedAt: "2026-09-15T10:10:00.000Z", status: "PARTIAL" }),
      ),
    );
    getImportProgress.mockResolvedValue(
      availabilityFailedProgress("AVAILABILITY_SOURCE_OVERLAP"),
    );
    const { container } = renderScreen();

    expect(await screen.findByText(/se sobrepõem no mesmo dia.*\(2\)/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(FAILED_GENERIC))).not.toBeInTheDocument();
    expectNoInternalLanguage(container.textContent ?? "");
  });

  test("SERVICE_PRICE_NOT_INFORMED tem texto próprio de preço não informado", () => {
    const text = conflictReasonLabel("SERVICE_PRICE_NOT_INFORMED");
    expect(text).not.toBe(CONFLICT_GENERIC);
    expect(text).toMatch(/sem preço informado/);
    expectNoInternalLanguage(text);
  });

  test("os textos novos de falha são distintos do genérico", () => {
    expect(failedReasonLabel("AVAILABILITY_CHANGED_SINCE_ANALYSIS")).not.toBe(FAILED_GENERIC);
    expect(failedReasonLabel("AVAILABILITY_SOURCE_OVERLAP")).not.toBe(FAILED_GENERIC);
  });
});
