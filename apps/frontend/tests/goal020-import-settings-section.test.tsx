// @vitest-environment jsdom
/**
 * Goal020 (WU-09): bloco de Importação em Configurações → Agenda.
 *
 * O que esta suíte prova:
 *
 * - o bloco lê o mesmo `ImportState` da rota `/importacao` (`migration.getImportState`),
 *   nunca inventa estado próprio;
 * - histórico concluído mostra origem, quando, o que entrou por categoria e o
 *   que ficou de fora, sem oferecer um CTA de nova importação;
 * - direito disponível sem histórico mostra o ponto de entrada, apontando
 *   para `/importacao`;
 * - sem direito e sem histórico, o bloco não existe.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ImportHistory, ImportState } from "@/data";
import { ImportSettingsSection } from "@/features/imports/ImportSettingsSection";

const getImportState = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    migration: { getImportState },
  }),
}));

function historyFixture(overrides: Partial<ImportHistory> = {}): ImportHistory {
  return {
    categories: [
      {
        category: "SERVICE",
        discovered: 12,
        failed: 0,
        imported: 12,
        limitationCode: null,
        needsReview: 0,
        pending: 0,
        skipped: 0,
        sourceSupported: true,
      },
    ],
    completedAt: "2026-09-15T12:00:00.000Z",
    completedBy: "user-1",
    counts: { failed: 0, imported: 12, needsReview: 0, pending: 0, skipped: 0 },
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

function stateFixture(overrides: Partial<ImportState> = {}): ImportState {
  return {
    history: null,
    right: { available: false, sessionId: null, completedAt: null },
    session: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("histórico concluído: mostra origem, quando e categorias, sem CTA de nova importação", async () => {
  getImportState.mockResolvedValue(
    stateFixture({ history: historyFixture() }),
  );
  render(<ImportSettingsSection />);

  expect(
    await screen.findByRole("heading", { name: "Importação concluída" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Minha Agenda · camila@example.com/)).toBeInTheDocument();
  expect(screen.getByText("serviços")).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /Começar importação/ }),
  ).not.toBeInTheDocument();
});

test("direito disponível, sem histórico: mostra o ponto de entrada para /importacao", async () => {
  getImportState.mockResolvedValue(
    stateFixture({
      right: { available: true, sessionId: null, completedAt: null },
    }),
  );
  render(<ImportSettingsSection />);

  const link = await screen.findByRole("link", { name: "Começar importação" });
  expect(link).toHaveAttribute("href", "/importacao");
  expect(
    screen.queryByRole("heading", { name: "Importação concluída" }),
  ).not.toBeInTheDocument();
});

test("sem direito e sem histórico: o bloco não existe", async () => {
  getImportState.mockResolvedValue(stateFixture());
  const { container } = render(<ImportSettingsSection />);

  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

describe("nunca inventa estado próprio", () => {
  test("erro ao carregar: some silenciosamente em vez de fabricar um estado", async () => {
    getImportState.mockRejectedValue(new Error("falhou"));
    const { container } = render(<ImportSettingsSection />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
