// @vitest-environment jsdom
/**
 * Button — the primitive every screen presses.
 *
 * What this file states: the loading and disabled states are readable by
 * something that is not an eye. The vault forbids state signalled by colour
 * alone, and a spinner is colour-and-shape; `aria-busy` and `disabled` are what
 * a screen reader and a keyboard actually get.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Button } from "@/shared/ui/Button";

import { expectNoA11yViolations } from "../support/a11y";

describe("Button", () => {
  test("a loading button announces itself busy and refuses the press", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Salvar
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Salvar" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick, "a busy button that still fires is a double submit").not.toHaveBeenCalled();
  });

  test("the spinner is decoration, so it never reaches the accessible name", () => {
    const { container } = render(<Button loading>Salvar</Button>);

    expect(screen.getByRole("button")).toHaveAccessibleName("Salvar");
    expect(container.querySelector(".spinner")).toHaveAttribute("aria-hidden", "true");
  });

  test("an idle button is reachable and operable from the keyboard alone", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Confirmar</Button>);

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Confirmar" })).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test("every variant renders without an accessibility violation", async () => {
    for (const variant of ["primary", "secondary", "tertiary", "danger"] as const) {
      const { container, unmount } = render(<Button variant={variant}>Ação</Button>);
      await expectNoA11yViolations(container);
      unmount();
    }
  });
});
