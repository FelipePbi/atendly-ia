// @vitest-environment jsdom
/**
 * Toast de sucesso ao salvar (2026-10-18): qualquer tela chama `showToast` e
 * a casca mostra o aviso no canto, que some sozinho.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { showToast } from "@/shared/ui/toastBus";
import { TOAST_DURATION_MS, ToastHost } from "@/shared/ui/ToastHost";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ToastHost", () => {
  test("mostra o aviso e tira depois do tempo", () => {
    const { container } = render(<ToastHost />);
    expect(container).toBeEmptyDOMElement();

    act(() => showToast("Dados do negócio salvos."));
    expect(screen.getByText("Dados do negócio salvos.")).toBeInTheDocument();
    expect(container.querySelector(".toast-success")).not.toBeNull();
    // O texto do formulário é o anúncio; o toast não repete para o leitor.
    expect(container.querySelector(".toast-stack")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelector("button")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(screen.queryByText("Dados do negócio salvos.")).toBeNull();
  });

  test("empilha no máximo três; o mais antigo sai", () => {
    render(<ToastHost />);
    act(() => {
      for (const n of [1, 2, 3, 4]) showToast(`Aviso ${n}`);
    });
    expect(screen.queryByText("Aviso 1")).toBeNull();
    expect(screen.getByText("Aviso 4")).toBeInTheDocument();
  });
});
