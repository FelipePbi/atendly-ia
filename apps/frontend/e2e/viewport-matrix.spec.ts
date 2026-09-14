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
 */
const KNOWN_SMALL_TARGETS: { html: string; route: string; why: string }[] = [
  {
    html: '<input type="checkbox" name="remember">',
    route: "entrar",
    why: "Checkbox 'lembrar-me' sem estilo (13×13). Goal014 refaz o login no visual aprovado (critério 6).",
  },
  {
    html: '<input type="checkbox" required="" name="terms">',
    route: "criar-conta",
    why: "Checkbox de aceite legal sem estilo (13×13). Goal014 refaz o cadastro e o aceite legal (critério 6).",
  },
  {
    html: '<a class="auth-link" href="/login">Voltar para entrar</a>',
    route: "link-expirado",
    why: "Link isolado com altura de linha. Goal014 refaz as quatro telas de recuperação (critério 7).",
  },
];

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
          inline: boolean;
          html: string;
        }[] = [];
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue; // not rendered
          // 2.5.8 exempts a link sitting inside a sentence: its size is set by
          // the text around it, and padding it out would break the paragraph.
          const parent = el.parentElement;
          const inline = el.tagName === "A"
            && parent !== null
            && ["P", "LI", "SPAN", "LABEL", "TD"].includes(parent.tagName)
            && (parent.textContent ?? "").trim() !== (el.textContent ?? "").trim();
          controls.push({
            tag: el.tagName.toLowerCase(),
            label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30),
            w: Math.round(box.width),
            h: Math.round(box.height),
            inline,
            // Naming the offender is the difference between a finding someone
            // can act on and a number someone has to go hunting for.
            html: el.outerHTML.slice(0, 160),
          });
        }
        return controls;
      });

      const undersized = measured.filter(
        (c) => !c.inline && (c.w < TOUCH_TARGET_AA || c.h < TOUCH_TARGET_AA),
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
        (c) => !c.inline
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
