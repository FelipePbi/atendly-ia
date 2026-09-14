/**
 * Accessibility assertions over a rendered tree.
 *
 * The product vault makes accessibility a rule, not a nicety: keyboard focus,
 * touch targets, contrast and state that is never signalled by colour alone.
 * Reading a component's source can suggest those hold; only running the rules
 * against a rendered tree can show it.
 *
 * axe-core is the engine. This wraps it for two reasons: a failure has to name
 * the rule, the impact and the offending markup — an assertion that only says
 * "expected 0, got 3" makes an agent guess — and the rule set has to be chosen
 * here rather than in every test.
 */

import axe, { type ElementContext, type Result, type RunOptions } from "axe-core";
import { expect } from "vitest";

/**
 * WCAG 2.1 A and AA, which is the bar the vault sets.
 *
 * `color-contrast` is excluded on purpose and is NOT an oversight: jsdom does
 * not do layout or cascade, so axe cannot read a computed colour and reports
 * every node as "incomplete". Contrast is a property of the token palette, and
 * it is checked where the tokens are defined, not per component.
 */
const RULE_SET: RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  rules: { "color-contrast": { enabled: false } },
};

function describeViolations(violations: Result[]): string {
  return violations
    .map((v) => {
      const where = v.nodes
        .map((n) => `      ${n.html}\n      ${n.failureSummary?.replace(/\n/g, "\n      ")}`)
        .join("\n");
      return `  [${v.impact ?? "unknown"}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${where}`;
    })
    .join("\n\n");
}

/** Runs the rule set over a rendered container and fails with what broke. */
export async function expectNoA11yViolations(
  container: ElementContext,
  options: RunOptions = {},
): Promise<void> {
  const results = await axe.run(container, { ...RULE_SET, ...options });
  expect(
    results.violations,
    results.violations.length === 0
      ? ""
      : `${results.violations.length} accessibility violation(s):\n\n${describeViolations(results.violations)}`,
  ).toHaveLength(0);
}
