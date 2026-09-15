import { describe, expect, it } from "vitest";

import {
  importCategorySelectionResultSchema,
  importStateSchema,
} from "../src/data/mappers/publicApiSchemas";

/**
 * Goal020 (WU-003/WU-004): contrato novo do estado da importação (direito,
 * sessão viva, histórico) e da seleção de categoria. `importSessionStartSchema`
 * e companhia continuam provados em `tests/goal010-import-schema.test.ts` —
 * esta suíte só estende o que o Goal020 acrescentou.
 */

const liveSession = {
  sessionId: "session-1",
  status: "READY" as const,
  previewVersion: 2,
  provider: "MINHA_AGENDA" as const,
  sourceAccountId: "account-1",
  sourceAccountLabel: "Salão da Ana",
  createdAt: "2026-09-12T12:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  previewGeneratedAt: "2026-09-12T12:05:00.000Z",
  counts: {
    pending: 12,
    imported: 0,
    skipped: 0,
    failed: 0,
    needsReview: 0,
  },
  categories: [
    {
      category: "SERVICE" as const,
      pending: 12,
      imported: 0,
      skipped: 0,
      failed: 0,
      needsReview: 0,
      selected: true,
    },
  ],
};

const history = {
  sessionId: "session-0",
  provider: "MINHA_AGENDA" as const,
  sourceAccountId: "account-1",
  sourceAccountLabel: "Salão da Ana",
  status: "COMPLETED" as const,
  completedAt: "2026-09-01T12:30:00.000Z",
  completedBy: "user-1",
  startedAt: "2026-09-01T12:00:00.000Z",
  finishedAt: "2026-09-01T12:25:00.000Z",
  counts: {
    pending: 0,
    imported: 14,
    skipped: 1,
    failed: 0,
    needsReview: 0,
  },
  categories: [
    {
      category: "SERVICE" as const,
      pending: 0,
      imported: 14,
      skipped: 1,
      failed: 0,
      needsReview: 0,
      discovered: 15,
      sourceSupported: true,
      limitationCode: null,
    },
  ],
  pendingAcceptance: null,
};

describe("contrato do estado da importação e da seleção de categoria (Goal020)", () => {
  it("decodifica o estado vazio: sem sessão viva e sem histórico", () => {
    const state = importStateSchema.parse({
      right: { available: true, sessionId: null, completedAt: null },
      session: null,
      history: null,
    });

    expect(state.right.available).toBe(true);
    expect(state.session).toBeNull();
    expect(state.history).toBeNull();
  });

  it("decodifica a sessão viva com contagens por categoria e seleção", () => {
    const state = importStateSchema.parse({
      right: { available: false, sessionId: "session-1", completedAt: null },
      session: liveSession,
      history: null,
    });

    expect(state.session?.categories[0]).toMatchObject({
      category: "SERVICE",
      selected: true,
    });
  });

  it("decodifica o histórico de uma importação já concluída", () => {
    const state = importStateSchema.parse({
      right: { available: false, sessionId: null, completedAt: history.completedAt },
      session: null,
      history,
    });

    expect(state.history?.categories[0].discovered).toBe(15);
    expect(state.history?.pendingAcceptance).toBeNull();
  });

  it("recusa estado fora do contrato em vez de decodificar pela metade", () => {
    expect(() =>
      importStateSchema.parse({
        right: { available: true, sessionId: null, completedAt: null },
        session: null,
        // Categoria fora do vocabulário fechado.
        history: { ...history, categories: [{ ...history.categories[0], category: "INVOICES" }] },
      }),
    ).toThrow();
  });

  it("decodifica o resultado de marcar/desmarcar uma categoria", () => {
    expect(
      importCategorySelectionResultSchema.parse({
        sessionId: "session-1",
        category: "SERVICE",
        selected: false,
      }),
    ).toEqual({ sessionId: "session-1", category: "SERVICE", selected: false });
  });
});
