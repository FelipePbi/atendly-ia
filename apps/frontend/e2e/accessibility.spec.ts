import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { PUBLIC_ROUTES } from "./routes";

/**
 * Accessibility against a real engine.
 *
 * The jsdom layer in `tests/` already runs axe over the accessibility tree and
 * disables `color-contrast`, because jsdom has no cascade and no layout so axe
 * cannot resolve a computed colour. Here it can. This file is the only place
 * contrast is actually decided, and it is decided against the rendered token
 * palette rather than against the hex values someone wrote down.
 */

for (const route of PUBLIC_ROUTES) {
  test.describe(route.name, () => {
    test("meets WCAG 2.1 AA, contrast included", async ({ page }, testInfo) => {
      await page.goto(route.path, { waitUntil: "networkidle" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      if (results.violations.length > 0) {
        await testInfo.attach(`axe-${route.name}-${testInfo.project.name}`, {
          body: JSON.stringify(results.violations, null, 2),
          contentType: "application/json",
        });
      }

      const summary = results.violations
        .map((v) => `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.html).join("\n    ")}`)
        .join("\n");

      expect(
        results.violations,
        `${results.violations.length} violation(s) at ${testInfo.project.name}:\n${summary}`,
      ).toEqual([]);
    });
  });
}

test.describe("the gate, checked against itself", () => {
  test("contrast really is being evaluated here", async ({ page }) => {
    // The whole reason this file exists is that jsdom cannot resolve a computed
    // colour, so `color-contrast` is disabled in the unit layer. If it were
    // also silently off HERE, contrast would be checked nowhere and every suite
    // would still be green. So: inject text that definitely fails, and require
    // axe to say so.
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.evaluate(() => {
      const el = document.createElement("p");
      el.textContent = "Contraste deliberadamente insuficiente";
      el.style.cssText = "color:#bbbbbb;background:#cccccc;font-size:14px;padding:8px";
      document.body.append(el);
    });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.map((v) => v.id),
      "axe did not flag obviously insufficient contrast — the rule is not running",
    ).toContain("color-contrast");
  });
});

test.describe("keyboard and motion", () => {
  test("the first Tab reaches something visible, with a focus indicator", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        visible: box.width > 0 && box.height > 0,
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
      };
    });

    expect(focused, "Tab moved focus nowhere: the page has no keyboard entry point").not.toBeNull();
    expect(focused?.visible, "focus landed on something with no box").toBe(true);

    // A focus ring may be an outline or a shadow; what is forbidden is neither,
    // which is a keyboard user who cannot tell where they are.
    const hasIndicator =
      (focused?.outlineStyle !== "none" && focused?.outlineWidth !== "0px")
      || (focused?.boxShadow !== "none" && focused?.boxShadow !== "");
    expect(hasIndicator, `no visible focus indicator on <${focused?.tag}>`).toBe(true);
  });

  test("reduced motion is honoured, not merely declared", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login", { waitUntil: "networkidle" });

    const moving = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const style = getComputedStyle(el);
        const duration = parseFloat(style.animationDuration) + parseFloat(style.transitionDuration);
        // Anything still running for a noticeable time under `reduce` is an
        // animation that ignored the preference.
        if (duration > 0.2) {
          offenders.push(`${el.tagName.toLowerCase()}.${el.className}: ${style.animationDuration}/${style.transitionDuration}`);
        }
      }
      return offenders.slice(0, 10);
    });

    expect(moving, `animation still running under prefers-reduced-motion:\n${moving.join("\n")}`).toEqual([]);
  });
});
