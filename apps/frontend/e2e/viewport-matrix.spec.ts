import { expect, test } from "@playwright/test";

import { PUBLIC_ROUTES } from "./routes";

/**
 * The width matrix.
 *
 * Every assertion here is a layout fact that only a real engine can produce.
 * The vault's mobile-first rule is not "it compiles at 360px", it is "nothing
 * runs off the side, the touch targets can be hit, and the text can be read" —
 * and each of those is a measurement.
 */

/**
 * Two touch-target bars, because WCAG has two and they are not the same claim.
 *
 * 24px is 2.5.8 Target Size (Minimum), level AA — the bar the rest of this
 * layer is set to, so it is the one that FAILS. 44px is 2.5.5 Target Size
 * (Enhanced), level AAA, and "confortável" in the vault's words — it is
 * reported so the gap is visible, never as a failure, because a gate that is
 * red on arrival is a gate somebody switches off.
 */
const TOUCH_TARGET_AA = 24;
const TOUCH_TARGET_COMFORTABLE = 44;

/** A few pixels of tolerance: sub-pixel rounding is not a horizontal scroll. */
const OVERFLOW_TOLERANCE = 1;

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
const KNOWN_SMALL_TARGETS: { html: string; route: string; why: string }[] = [];

for (const route of PUBLIC_ROUTES) {
  test.describe(route.name, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route.path, { waitUntil: "networkidle" });
    });

    test("nothing overflows sideways", async ({ page }, testInfo) => {
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const offenders: { tag: string; right: number; text: string }[] = [];
        const limit = doc.clientWidth;
        for (const el of Array.from(document.body.querySelectorAll("*"))) {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (box.right > limit + 1) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              right: Math.round(box.right),
              text: (el.textContent ?? "").trim().slice(0, 40),
            });
          }
        }
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          offenders: offenders.slice(0, 5),
        };
      });

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

      const measured = await page.evaluate(() => {
        const selector = 'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea';
        const controls: {
          tag: string;
          label: string;
          w: number;
          h: number;
          exempt: string | null;
          html: string;
        }[] = [];

        // A native control can be visually hidden (opacity 0, absolute) and
        // toggled by an associated <label> instead — nested, or matched by
        // `for`/`id`. Clicking that label is what actually reaches the
        // control, so the label is part of the pointer target, not the
        // control's own (possibly tiny, off-path) box.
        //
        // This only applies when the control itself is visually hidden: a
        // visible control (a text input, a button) that merely sits inside a
        // <label> used for accessible naming is not this pattern — its own
        // box already is the real pointer target, and unioning it with the
        // whole label would hide a genuinely small target instead of finding one.
        const isVisuallyHidden = (el: Element): boolean => {
          const style = window.getComputedStyle(el);
          return style.opacity === "0" || style.visibility === "hidden" || style.display === "none";
        };
        const associatedLabel = (el: Element): Element | null => {
          if (el.tagName !== "INPUT" || !isVisuallyHidden(el)) return null;
          const nested = el.closest("label");
          if (nested) return nested;
          const id = el.getAttribute("id");
          if (!id) return null;
          return document.querySelector(`label[for="${CSS.escape(id)}"]`);
        };

        for (const el of Array.from(document.querySelectorAll(selector))) {
          const ownBox = el.getBoundingClientRect();
          const label = associatedLabel(el);
          const labelBox = label?.getBoundingClientRect() ?? null;

          // The target region: the associated label's own box when the
          // control is visually hidden and has one, otherwise the control's
          // own box. Not a union of the two — a visually hidden control
          // (especially `display: none`) reports a degenerate box (Chromium
          // gives `display: none` elements a (0,0,0,0) rect regardless of
          // where the label actually sits), so widening by `Math.min`/`Math.max`
          // against it stretches the measured region from the viewport origin
          // to the label's far corner instead of measuring the label itself.
          // The label is the real pointer target in this case; the control's
          // own box is not part of what a finger can reach.
          const targetBox = labelBox ?? ownBox;
          const left = targetBox.left;
          const top = targetBox.top;
          const right = targetBox.right;
          const bottom = targetBox.bottom;
          const w = right - left;
          const h = bottom - top;

          let exempt: string | null = null;
          if (w === 0 || h === 0) {
            exempt = "not-rendered";
          } else {
            // 2.5.8 exempts a link sitting inside a sentence: its size is set
            // by the text around it, and padding it out would break the
            // paragraph.
            const parent = el.parentElement;
            const isInlineLink = el.tagName === "A"
              && parent !== null
              && ["P", "LI", "SPAN", "LABEL", "TD"].includes(parent.tagName)
              && (parent.textContent ?? "").trim() !== (el.textContent ?? "").trim();
            if (isInlineLink) exempt = "inline-link";
          }

          controls.push({
            tag: el.tagName.toLowerCase(),
            label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30),
            w: Math.round(w),
            h: Math.round(h),
            exempt,
            // Naming the offender is the difference between a finding someone
            // can act on and a number someone has to go hunting for.
            html: el.outerHTML.slice(0, 160),
          });
        }
        return controls;
      });

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
      const stale = baselined.filter((k) => !undersized.some((c) => c.html === k.html));
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
