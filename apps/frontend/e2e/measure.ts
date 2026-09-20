import type { Page } from "@playwright/test";

/**
 * The measurement ruler, extracted from `viewport-matrix.spec.ts` (Goal033
 * WU-01) so the authenticated spec (WU-03) can reuse it without duplicating
 * the logic the public spec already proved.
 *
 * Two touch-target bars, because WCAG has two and they are not the same claim.
 *
 * 24px is 2.5.8 Target Size (Minimum), level AA — the bar the rest of this
 * layer is set to, so it is the one that FAILS. 44px is 2.5.5 Target Size
 * (Enhanced), level AAA, and "confortável" in the vault's words — it is
 * reported so the gap is visible, never as a failure, because a gate that is
 * red on arrival is a gate somebody switches off.
 */
export const TOUCH_TARGET_AA = 24;
export const TOUCH_TARGET_COMFORTABLE = 44;

/** A few pixels of tolerance: sub-pixel rounding is not a horizontal scroll. */
export const OVERFLOW_TOLERANCE = 1;

export type KnownSmallTarget = { html: string; route: string; why: string };

export type MeasuredControl = {
  tag: string;
  label: string;
  w: number;
  h: number;
  exempt: string | null;
  html: string;
};

export type OverflowResult = {
  scrollWidth: number;
  clientWidth: number;
  offenders: { tag: string; right: number; text: string }[];
};

export async function measureOverflow(page: Page): Promise<OverflowResult> {
  return page.evaluate(() => {
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
}

export async function measureTouchTargets(page: Page): Promise<MeasuredControl[]> {
  return page.evaluate(() => {
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
}

/**
 * `KNOWN_SMALL_TARGETS` is strict in both directions: an entry that no longer
 * reproduces FAILS, so a fix takes its exception with it instead of leaving a
 * graveyard behind. This is that assertion's data half — the caller still owns
 * the `expect(...).toEqual([])`, because that is what makes it a test failure.
 */
export function findStaleExceptions(
  route: string,
  undersized: MeasuredControl[],
  known: KnownSmallTarget[],
): KnownSmallTarget[] {
  const baselined = known.filter((k) => k.route === route);
  return baselined.filter((k) => !undersized.some((c) => c.html === k.html));
}

/**
 * Anything still running longer than this under `prefers-reduced-motion:
 * reduce` is an animation that ignored the preference. The number is the one
 * the public gate already uses (`accessibility.spec.ts`), kept here so the
 * authenticated gate cannot drift to a looser one.
 */
export const REDUCED_MOTION_TOLERANCE_SECONDS = 0.2;

export type FocusAfterTab = {
  tag: string;
  visible: boolean;
  outlineWidth: string;
  outlineStyle: string;
  boxShadow: string;
} | null;

/**
 * Presses the first `Tab` and reports where focus landed.
 *
 * The press is part of the measurement: "the first Tab" is the claim, so the
 * caller cannot accidentally measure the second one.
 *
 * `null` means focus went nowhere — a page with no keyboard entry point.
 */
export async function measureFirstTabFocus(page: Page): Promise<FocusAfterTab> {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
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
}

/**
 * A focus ring may be an outline or a shadow; what is forbidden is neither,
 * which is a keyboard user who cannot tell where they are.
 */
export function hasFocusIndicator(focus: FocusAfterTab): boolean {
  if (!focus) return false;
  return (
    (focus.outlineStyle !== "none" && focus.outlineWidth !== "0px")
    || (focus.boxShadow !== "none" && focus.boxShadow !== "")
  );
}

/**
 * Elements still animating under `prefers-reduced-motion: reduce`, named so a
 * failure says which ones. The caller emulates the media preference and loads
 * the screen; this only reads the computed result.
 */
export async function measureRunningAnimations(page: Page): Promise<string[]> {
  return page.evaluate((tolerance) => {
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const style = getComputedStyle(el);
      const duration = parseFloat(style.animationDuration) + parseFloat(style.transitionDuration);
      if (duration > tolerance) {
        offenders.push(
          `${el.tagName.toLowerCase()}.${el.className}: ${style.animationDuration}/${style.transitionDuration}`,
        );
      }
    }
    return offenders.slice(0, 10);
  }, REDUCED_MOTION_TOLERANCE_SECONDS);
}
