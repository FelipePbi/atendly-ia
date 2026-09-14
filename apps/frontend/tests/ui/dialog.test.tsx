// @vitest-environment jsdom
/**
 * Dialog — where keyboard focus is won or lost.
 *
 * A modal that does not move focus in, hold it, and give it back leaves a
 * keyboard user tabbing through a page they cannot see. None of that is
 * visible in a screenshot, and all of it is visible here.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Dialog } from "@/shared/ui/Dialog";

import { expectNoA11yViolations } from "../support/a11y";

function open(onClose = vi.fn()) {
  const result = render(
    <Dialog open title="Confirmar remoção" onClose={onClose}>
      <button type="button">Remover</button>
    </Dialog>,
  );
  return { ...result, onClose };
}

describe("Dialog", () => {
  test("it is a dialog by role, modal by state, and named by its heading", async () => {
    const { container } = open();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Confirmar remoção");
    await expectNoA11yViolations(container);
  });

  test("opening moves focus inside instead of leaving it behind", () => {
    open();
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
  });

  test("Tab wraps inside the panel rather than escaping to the page", async () => {
    open();

    const close = screen.getByRole("button", { name: "Fechar" });
    const remove = screen.getByRole("button", { name: "Remover" });

    await userEvent.tab();
    expect(remove).toHaveFocus();

    // Past the last item, focus returns to the first — it never lands on the
    // page behind the overlay.
    await userEvent.tab();
    expect(close).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(remove).toHaveFocus();
  });

  test("Escape closes it", async () => {
    const { onClose } = open();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  test("closing returns focus to whatever opened it", async () => {
    const onClose = vi.fn();
    function Host() {
      const [isOpen, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <Dialog
            open={isOpen}
            title="Confirmar"
            onClose={() => {
              setOpen(false);
              onClose();
            }}
          >
            <button type="button">Remover</button>
          </Dialog>
        </>
      );
    }
    render(<Host />);

    const trigger = screen.getByRole("button", { name: "Abrir" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger, "focus stranded on a node that no longer exists").toHaveFocus();
  });

  test("a closed dialog renders nothing at all", () => {
    render(
      <Dialog open={false} title="Confirmar" onClose={vi.fn()}>
        <button type="button">Remover</button>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
