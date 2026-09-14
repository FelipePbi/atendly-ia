// @vitest-environment jsdom
/**
 * The accessibility gate, checked against itself.
 *
 * An axe run that is misconfigured does not fail loudly — it passes
 * everything, forever, and every suite that uses it reports green while
 * checking nothing. So the helper is pointed at markup that is definitely
 * broken, and is required to notice.
 *
 * Delete this file and a future misconfiguration becomes invisible.
 */

import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { expectNoA11yViolations } from "./a11y";

describe("expectNoA11yViolations", () => {
  test("it catches an image with no text alternative", async () => {
    const { container } = render(<img src="/x.png" />);

    await expect(expectNoA11yViolations(container)).rejects.toThrow(/image-alt/);
  });

  test("it catches a control with no accessible name", async () => {
    const { container } = render(
      <button type="button">
        <span aria-hidden="true">×</span>
      </button>,
    );

    await expect(expectNoA11yViolations(container)).rejects.toThrow(/button-name/);
  });

  test("the failure names the rule, the impact and the offending markup", async () => {
    const { container } = render(<img src="/x.png" />);

    // An agent reading "expected 0, got 1" has to guess. It must not have to.
    const error = await expectNoA11yViolations(container).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/critical|serious|moderate|minor/);
    expect((error as Error).message).toContain("<img");
    expect((error as Error).message).toMatch(/https:\/\/dequeuniversity\.com/);
  });

  test("valid markup passes, so the gate is not merely always-red", async () => {
    const { container } = render(
      <main>
        <h1>Título</h1>
        <img src="/x.png" alt="Uma descrição" />
        <button type="button">Salvar</button>
      </main>,
    );

    await expect(expectNoA11yViolations(container)).resolves.toBeUndefined();
  });
});
