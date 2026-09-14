// @vitest-environment jsdom
/**
 * Empty, error and loading — the three states a screen is judged on.
 *
 * The vault requires loading, error and empty to be covered wherever they
 * apply, and an error to offer a way out. These assert the shape a user meets,
 * not the class names.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Skeleton, StatePanel } from "@/shared/ui/States";

import { expectNoA11yViolations } from "../support/a11y";

describe("StatePanel", () => {
  test("an empty state names itself and explains, under a real heading", async () => {
    const { container } = render(
      <StatePanel title="Nenhuma conversa" description="Quando alguém escrever, aparece aqui." />,
    );

    expect(screen.getByRole("heading", { name: "Nenhuma conversa" })).toBeVisible();
    expect(screen.getByText("Quando alguém escrever, aparece aqui.")).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("an error state offers a way out, and the way out works from the keyboard", async () => {
    const onAction = vi.fn();
    const { container } = render(
      <StatePanel
        tone="error"
        title="Não foi possível carregar"
        description="Tente novamente em instantes."
        actionLabel="Tentar de novo"
        onAction={onAction}
      />,
    );

    const retry = screen.getByRole("button", { name: "Tentar de novo" });
    await userEvent.tab();
    expect(retry, "a recoverable error the keyboard cannot reach is not recoverable").toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  test("the error tone is carried by words, not only by colour", () => {
    render(<StatePanel tone="error" title="Falhou" description="Detalhe do erro." />);

    // The title and description are the signal. A tone that lived only in the
    // stylesheet would leave a screen reader with an ordinary empty state.
    expect(screen.getByRole("heading", { name: "Falhou" })).toBeVisible();
    expect(screen.getByText("Detalhe do erro.")).toBeVisible();
  });
});

describe("Skeleton", () => {
  test("a placeholder is hidden from assistive technology", () => {
    const { container } = render(<Skeleton>carregando</Skeleton>);

    const skeleton = container.querySelector(".skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");

    // Placeholder text must not be readable as content: "carregando carregando
    // carregando" is what a screen reader gets when it is. Ignoring the
    // aria-hidden subtree is how the query is asked what assistive technology
    // would see — drop the attribute from the component and this finds the text
    // again, which is exactly the regression worth catching.
    expect(
      screen.queryByText("carregando", { ignore: '[aria-hidden="true"], script, style' }),
    ).not.toBeInTheDocument();
  });
});
