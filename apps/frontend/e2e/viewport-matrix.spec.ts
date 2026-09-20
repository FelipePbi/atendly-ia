import { expect, test } from "@playwright/test";

import {
  findStaleExceptions,
  type KnownSmallTarget,
  measureOverflow,
  measureTouchTargets,
  OVERFLOW_TOLERANCE,
  TOUCH_TARGET_AA,
  TOUCH_TARGET_COMFORTABLE,
} from "./measure";
import { PUBLIC_ROUTES } from "./routes";

/**
 * The width matrix.
 *
 * Every assertion here is a layout fact that only a real engine can produce.
 * The vault's mobile-first rule is not "it compiles at 360px", it is "nothing
 * runs off the side, the touch targets can be hit, and the text can be read" —
 * and each of those is a measurement. The ruler itself (thresholds, the
 * overflow/touch-target measurement, the associated-label rule) lives in
 * `./measure.ts`, shared with the authenticated spec.
 */

/**
 * Accessibility debt that existed before this gate did.
 *
 * Introducing a check to a codebase that was never checked leaves a choice:
 * ship it red, or baseline what is already broken. Red on arrival is a gate
 * somebody disables, and it destroys the only thing the gate is for — telling
 * a Developer "you broke this" rather than "this was always broken".
 *
 * So each item is named, with its reason and its owner. The list is strict in
 * both directions: an entry that no longer reproduces FAILS, so a fix takes its
 * exception with it instead of leaving a graveyard behind.
 *
 * Empty now: Goal031 closed every known offender across all public routes
 * (see WU-02). The mechanism and its "stale exception" assertion stay, both
 * to catch the next regression and because Goal031 proved, with three
 * reverted control-negative mutations against three different targets, that
 * the ruler still bites when a control regresses below 24px:
 *
 * - `.check` (`remember` on `/login`, `terms` on `/cadastro`): the native
 *   `<input>` stays `opacity: 0`, its `<label>` shrunk to `height: 16px;
 *   overflow: hidden`, run against `npm run build && npx playwright test -g
 *   "entrar.*touch targets|criar-conta.*touch targets" --project=mobile-390`,
 *   which failed naming the `<input>` at 350×16px on both routes (the
 *   label's box, per the associated-label rule below) before being reverted.
 * - `.auth-link--standalone` (`link-expirado`'s "Voltar para entrar"),
 *   shrunk to 16px tall with `overflow: hidden`, run against `npm run build
 *   && npx playwright test -g "link-expirado.*touch targets"
 *   --project=mobile-390`, which failed naming the link at 115×16px before
 *   being reverted.
 * - `.field-action` (`PasswordField`'s visible eye `<button>`, not a hidden
 *   `<input>`, so measured as its own box, never a label union), shrunk to
 *   16×16px, run against `npm run build && npx playwright test -g
 *   "entrar.*touch targets" --project=mobile-390`, which failed naming the
 *   `<button>` at 16×16px before being reverted.
 */
const KNOWN_SMALL_TARGETS: KnownSmallTarget[] = [];

for (const route of PUBLIC_ROUTES) {
  test.describe(route.name, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route.path, { waitUntil: "networkidle" });
    });

    test("nothing overflows sideways", async ({ page }, testInfo) => {
      const overflow = await measureOverflow(page);

      expect(
        overflow.scrollWidth,
        `horizontal scroll at ${testInfo.project.name}: ${overflow.scrollWidth}px of content in `
          + `${overflow.clientWidth}px.\nFirst offenders: ${JSON.stringify(overflow.offenders, null, 2)}`,
      ).toBeLessThanOrEqual(overflow.clientWidth + OVERFLOW_TOLERANCE);
    });

    test("the page has exactly one first-level heading", async ({ page }) => {
      // Not style: a screen with no h1, or with several, gives a screen reader
      // no way to answer "where am I".
      await expect(page.locator("h1")).toHaveCount(1);
    });

    test("touch targets are reachable on a touch screen", async ({ page }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith("mobile"), "touch targets are a touch-screen rule");

      const measured = await measureTouchTargets(page);

      // Every control the selector reaches ends up here, measured or
      // exempted by name — never silently dropped. A route where the
      // selector matched nothing is a broken page, not a clean pass.
      await testInfo.attach(`controls-classified-${route.name}`, {
        body: JSON.stringify(
          { route: route.name, project: testInfo.project.name, classified: measured.length },
          null,
          2,
        ),
        contentType: "application/json",
      });
      expect(
        measured.length,
        `no touch-target controls collected at ${route.name}: selector matched nothing`,
      ).toBeGreaterThan(0);

      const undersized = measured.filter(
        (c) => c.exempt === null && (c.w < TOUCH_TARGET_AA || c.h < TOUCH_TARGET_AA),
      );

      const baselined = KNOWN_SMALL_TARGETS.filter((k) => k.route === route.name);
      const stale = findStaleExceptions(route.name, undersized, KNOWN_SMALL_TARGETS);
      expect(
        stale,
        `these exceptions no longer reproduce and must be deleted:\n${JSON.stringify(stale, null, 2)}`,
      ).toEqual([]);

      const belowAA = undersized.filter(
        (c) => !baselined.some((k) => k.html === c.html),
      );
      const belowComfortable = measured.filter(
        (c) => c.exempt === null
          && !belowAA.includes(c)
          && (c.w < TOUCH_TARGET_COMFORTABLE || c.h < TOUCH_TARGET_COMFORTABLE),
      );

      // Reported, never failed: the distance to "comfortable" is something a
      // person decides about, and it is invisible unless somebody writes it down.
      if (belowComfortable.length > 0) {
        await testInfo.attach(`below-${TOUCH_TARGET_COMFORTABLE}px-${route.name}`, {
          body: JSON.stringify(belowComfortable, null, 2),
          contentType: "application/json",
        });
      }

      expect(
        belowAA,
        `controls below the WCAG 2.5.8 AA minimum of ${TOUCH_TARGET_AA}px at ${testInfo.project.name}:\n`
          + JSON.stringify(belowAA, null, 2),
      ).toEqual([]);
    });

    test("evidence: full-page screenshot", async ({ page }, testInfo) => {
      // Not an assertion. This is the artefact a person looks at to judge
      // fidelity to the approved direction, which no automated check decides.
      const shot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`${route.name}-${testInfo.project.name}`, {
        body: shot,
        contentType: "image/png",
      });
    });
  });
}
