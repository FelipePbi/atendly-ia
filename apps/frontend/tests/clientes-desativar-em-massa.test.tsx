// @vitest-environment jsdom
/**
 * Desativação em massa na aba Inativos (2026-10-18): escolhe há quanto tempo
 * a cliente não vem, a lista chega marcada, a profissional desmarca quem não
 * quer e confirma — só as marcadas vão para Inativos.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BulkDeactivateDialog,
  lastVisitLabel,
} from "@/features/customers/BulkDeactivateDialog";

const inactivityCandidates = vi.fn();
const deactivateMany = vi.fn();
const showToast = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    customers: { inactivityCandidates, deactivateMany },
  }),
}));
vi.mock("@/shared/ui/toastBus", () => ({
  showToast: (...args: unknown[]) => {
    showToast(...args);
  },
}));

beforeEach(() => {
  inactivityCandidates.mockReset();
  deactivateMany.mockReset();
  showToast.mockReset();
  inactivityCandidates.mockImplementation(async (months: number) => ({
    months,
    items:
      months === 6
        ? [
            {
              id: "a",
              name: "Ana",
              phone: null,
              lastVisitAt: "2025-12-01T12:00:00.000Z",
            },
            { id: "b", name: "Bia", phone: null, lastVisitAt: null },
            {
              id: "c",
              name: "Cris",
              phone: null,
              lastVisitAt: "2026-02-01T12:00:00.000Z",
            },
          ]
        : [
            {
              id: "a",
              name: "Ana",
              phone: null,
              lastVisitAt: "2025-12-01T12:00:00.000Z",
            },
          ],
  }));
  deactivateMany.mockResolvedValue({ deactivated: 2 });
});

describe("Desativar em massa", () => {
  test("vem de 6 meses, tudo marcado; desmarcar e confirmar manda só as marcadas", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BulkDeactivateDialog onClose={onClose} open />);

    const dialog = screen.getByRole("dialog", { name: "Desativar em massa" });
    await waitFor(() =>
      expect(within(dialog).getAllByRole("checkbox")).toHaveLength(4),
    );
    expect(inactivityCandidates).toHaveBeenCalledWith(
      6,
      expect.any(AbortSignal),
    );
    expect(within(dialog).getByText("3 de 3 selecionados")).toBeVisible();
    expect(within(dialog).getByText("nunca veio")).toBeVisible();

    await user.click(within(dialog).getByRole("checkbox", { name: /Cris/ }));
    expect(within(dialog).getByText("2 de 3 selecionados")).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Desativar 2 clientes" }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(deactivateMany).toHaveBeenCalledWith(["a", "b"]);
    expect(showToast).toHaveBeenCalledWith("2 clientes desativados.");
  });

  test("trocar o período busca de novo e marca a nova lista", async () => {
    const user = userEvent.setup();
    render(<BulkDeactivateDialog onClose={vi.fn()} open />);
    await waitFor(() =>
      expect(screen.getByText("3 de 3 selecionados")).toBeVisible(),
    );

    await user.click(screen.getByRole("button", { name: "1 ano" }));

    await waitFor(() =>
      expect(screen.getByText("1 de 1 selecionados")).toBeVisible(),
    );
    expect(inactivityCandidates).toHaveBeenLastCalledWith(
      12,
      expect.any(AbortSignal),
    );
  });

  test("rótulo do último atendimento", () => {
    const now = new Date("2026-10-18T12:00:00.000Z");
    expect(lastVisitLabel(null, now)).toBe("nunca veio");
    expect(lastVisitLabel("2026-03-10T12:00:00.000Z", now)).toBe(
      "última vez há 7 meses",
    );
    expect(lastVisitLabel("2025-09-01T12:00:00.000Z", now)).toBe(
      "última vez há 1 ano",
    );
  });
});
