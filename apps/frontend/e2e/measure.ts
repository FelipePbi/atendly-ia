import type { Locator, Page } from "@playwright/test";

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
      if (style.opacity === "0" || style.visibility === "hidden" || style.display === "none") {
        return true;
      }
      // The `sr-only` utility clips an absolutely positioned element to a
      // 1x1 box instead of using opacity/visibility/display — the standard
      // "visible to no one, present for screen readers" technique. A real
      // (buggy) undersized control renders at its native size, never
      // clipped to exactly 1x1, so this cannot mask a genuine defect.
      const rect = el.getBoundingClientRect();
      return style.position === "absolute" && rect.width <= 1 && rect.height <= 1;
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

export type NativeBorderControl = {
  selector: string;
  borderStyle: string;
  borderWidth: string;
  radius: string;
  html: string;
};

/**
 * Visible form controls still wearing the browser's own border (Goal083):
 * an `inset`/`outset` border, or a drawn border with a 0px radius. Both mean
 * no rule of the product's styled the control, which is what a person reads
 * as "this screen was not finished". Only a control with a drawn border
 * (`border-top-width > 0` and a style other than `none`) is considered;
 * checkbox, radio, range, color, file and hidden inputs are a different
 * kind of control and are left out.
 */
export async function measureNativeBorderControls(page: Page): Promise<NativeBorderControl[]> {
  return page.evaluate(() => {
    const selector = [
      "input:not([type='hidden']):not([type='checkbox']):not([type='radio'])"
        + ":not([type='range']):not([type='color']):not([type='file'])",
      "select",
      "textarea",
    ].join(", ");
    const describe = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute("type");
      const id = el.getAttribute("id");
      const name = el.getAttribute("name");
      const classes = typeof el.className === "string" && el.className.trim() !== ""
        ? `.${el.className.trim().split(/\s+/u).join(".")}`
        : "";
      return `${tag}${id ? `#${id}` : ""}${classes}${type ? `[type="${type}"]` : ""}${
        name ? `[name="${name}"]` : ""
      }`;
    };
    const found: {
      selector: string;
      borderStyle: string;
      borderWidth: string;
      radius: string;
      html: string;
    }[] = [];
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const rendered = box.width > 1
        && box.height > 1
        && style.display !== "none"
        && style.visibility !== "hidden"
        && style.opacity !== "0";
      if (!rendered) continue;
      const drawn = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none";
      if (!drawn) continue;
      const native = style.borderTopStyle === "inset"
        || style.borderTopStyle === "outset"
        || style.borderTopLeftRadius === "0px";
      if (!native) continue;
      found.push({
        selector: describe(el),
        borderStyle: style.borderTopStyle,
        borderWidth: style.borderTopWidth,
        radius: style.borderTopLeftRadius,
        html: el.outerHTML.slice(0, 160),
      });
    }
    return found;
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

/**
 * The shell's navigation, by what `AppShell` renders: the sidebar, the mobile
 * header and the bottom bar (whose class is `${module}-mobile-header` and
 * `${module}-bottom-nav`), and the floating action button that sits beside
 * the bottom bar. Content found under any of these is content the tenant
 * cannot reach.
 */
export const SHELL_NAVIGATION_SELECTOR =
  'aside.sidebar, header[class$="-mobile-header"], nav[class$="-bottom-nav"], a.fab';

export type CompositionHit = {
  /** `tag.class` of what `elementFromPoint` returned, or `null` for nothing. */
  element: string | null;
  html: string | null;
  insideMarker: boolean;
  /** `tag.class` of the navigation ancestor the hit lives in, if any. */
  navigation: string | null;
};

export type CompositionResult = {
  viewport: { width: number; height: number };
  marker: { top: number; left: number; right: number; bottom: number };
  /** The point probed: the centre of the marker's part inside the first screen. */
  point: { x: number; y: number } | null;
  hit: CompositionHit;
  /** Only when the sidebar is actually rendered at this width. */
  sidebar: { left: number; right: number } | null;
  main: { left: number; right: number } | null;
  /** Horizontal intersection of the two boxes, in px; 0 when they sit side by side. */
  sidebarMainOverlap: number;
  /**
   * The mobile header and the bottom bar, only when rendered at this width,
   * with `inside` telling whether the whole box sits on the glass. A bar
   * pushed to a negative `left` is neither overflow (nothing scrolls) nor a
   * covered marker, so neither reading above would see it.
   */
  chrome: ChromeBox[];
};

export type ChromeBox = {
  element: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  inside: boolean;
};

/** Sub-pixel rounding of a fixed bar's edge, never a bar out of place. */
const CHROME_TOLERANCE = 1;

/**
 * The composition of a screen: whether its content is where a person can see
 * it and reach it (Goal058, QA CV-01/CV-02).
 *
 * Overflow, touch target, contrast, focus and motion all passed on a shell
 * whose sidebar took the whole width and sat on top of the list. None of them
 * asks the question this one asks: is the screen's own content on the first
 * screen, and is it the thing a pointer lands on?
 *
 * Three readings, all taken with the page scrolled to the top:
 *
 * - the marker's top against the viewport height;
 * - `document.elementFromPoint` at the centre of the marker's visible part —
 *   the marker's box clipped to the viewport, which for a heading is its own
 *   centre, and for a page wrapper taller than the screen (`/inicio`) is the
 *   centre of what the first screen shows of it. A point off the glass would
 *   make `elementFromPoint` answer `null` for a reason that is not the layout;
 * - the sidebar's box against the `main` box, horizontally, only when the
 *   sidebar is rendered at this width;
 * - the mobile header and the bottom bar against the viewport, whole, only
 *   when rendered at this width (Goal058 round 2: the settings bottom bar sat
 *   at x=-195..195 at 390px and nothing above failed).
 *
 * The caller owns the assertions; this only reads the layout and names what
 * it found.
 */
export async function measureComposition(marker: Locator): Promise<CompositionResult> {
  await marker.page().evaluate(() => window.scrollTo(0, 0));
  return marker.evaluate((target, { navigationSelector, chromeTolerance }) => {
    const describe = (el: Element | null): string | null => {
      if (!el) return null;
      const classes = typeof el.className === "string" && el.className.trim() !== ""
        ? `.${el.className.trim().split(/\s+/u).join(".")}`
        : "";
      return `${el.tagName.toLowerCase()}${classes}`;
    };
    const isRendered = (el: Element | null): el is Element => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && box.width > 0
        && box.height > 0;
    };

    const width = window.innerWidth;
    const height = window.innerHeight;
    const box = target.getBoundingClientRect();

    const visibleLeft = Math.max(box.left, 0);
    const visibleRight = Math.min(box.right, width);
    const visibleTop = Math.max(box.top, 0);
    const visibleBottom = Math.min(box.bottom, height);
    const point = visibleRight > visibleLeft && visibleBottom > visibleTop
      ? { x: (visibleLeft + visibleRight) / 2, y: (visibleTop + visibleBottom) / 2 }
      : null;

    const found = point ? document.elementFromPoint(point.x, point.y) : null;
    const navigation = found?.closest(navigationSelector) ?? null;

    const sidebar = document.querySelector("aside.sidebar");
    const main = document.querySelector("main#main-content");
    const sidebarBox = isRendered(sidebar) ? sidebar.getBoundingClientRect() : null;
    const mainBox = isRendered(main) ? main.getBoundingClientRect() : null;
    const overlap = sidebarBox && mainBox
      ? Math.max(0, Math.min(sidebarBox.right, mainBox.right) - Math.max(sidebarBox.left, mainBox.left))
      : 0;

    const chrome = Array.from(
      document.querySelectorAll('header[class$="-mobile-header"], nav[class$="-bottom-nav"]'),
    )
      .filter(isRendered)
      .map((el) => {
        const chromeBox = el.getBoundingClientRect();
        return {
          element: describe(el) ?? el.tagName.toLowerCase(),
          left: Math.round(chromeBox.left),
          right: Math.round(chromeBox.right),
          top: Math.round(chromeBox.top),
          bottom: Math.round(chromeBox.bottom),
          inside: chromeBox.left >= -chromeTolerance
            && chromeBox.right <= width + chromeTolerance
            && chromeBox.top >= -chromeTolerance
            && chromeBox.bottom <= height + chromeTolerance,
        };
      });

    return {
      viewport: { width, height },
      marker: {
        top: Math.round(box.top),
        left: Math.round(box.left),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
      },
      point: point ? { x: Math.round(point.x), y: Math.round(point.y) } : null,
      hit: {
        element: describe(found),
        html: found ? found.outerHTML.slice(0, 160) : null,
        insideMarker: found !== null && (found === target || target.contains(found)),
        navigation: describe(navigation),
      },
      sidebar: sidebarBox
        ? { left: Math.round(sidebarBox.left), right: Math.round(sidebarBox.right) }
        : null,
      main: mainBox ? { left: Math.round(mainBox.left), right: Math.round(mainBox.right) } : null,
      sidebarMainOverlap: Math.round(overlap),
      chrome,
    };
  }, { navigationSelector: SHELL_NAVIGATION_SELECTOR, chromeTolerance: CHROME_TOLERANCE });
}

/** Where the shell swaps the bottom bar for the sidebar (`atendly.css`), and the sidebar's width in the prototype's desktop frames. */
export const SIDEBAR_BREAKPOINT = 1100;
export const SIDEBAR_WIDTH = 232;
/** Início, Conversas, Agenda, Clientes and Mais — in the mobile and the tablet frames alike. */
export const BOTTOM_NAV_ITEMS = 5;

export type ShellBands = {
  viewportWidth: number;
  /** `aside.sidebar`, only when it is rendered (not `display: none`) at this width. */
  sidebar: { width: number } | null;
  /** The bottom bar, only when rendered, with the count of its rendered items. */
  bottomNav: { items: number; top: number; bottom: number } | null;
  /** How many rendered `header[class$="-mobile-header"]` the page has. */
  mobileHeaders: number;
};

/**
 * Which navigation the shell is showing at this width (Goal087, G-1): the
 * sidebar, the bottom bar, and whether the mobile brand header is still there.
 * "Rendered" is the box, not the DOM: below 1100px the sidebar stays in the DOM
 * hidden, and a hidden one must not count.
 */
export async function measureShellBands(page: Page): Promise<ShellBands> {
  return page.evaluate(() => {
    const isRendered = (el: Element): boolean => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && box.width > 0
        && box.height > 0;
    };
    const sidebar = document.querySelector("aside.sidebar");
    const sidebarBox = sidebar && isRendered(sidebar) ? sidebar.getBoundingClientRect() : null;
    const bar = Array.from(document.querySelectorAll('nav[class$="-bottom-nav"]')).find(isRendered);
    const barBox = bar?.getBoundingClientRect() ?? null;
    return {
      viewportWidth: window.innerWidth,
      sidebar: sidebarBox ? { width: sidebarBox.width } : null,
      bottomNav: bar && barBox
        ? {
          items: Array.from(bar.querySelectorAll(".bottom-nav-item")).filter(isRendered).length,
          top: barBox.top,
          bottom: barBox.bottom,
        }
        : null,
      mobileHeaders: Array.from(document.querySelectorAll('header[class$="-mobile-header"]'))
        .filter(isRendered).length,
    };
  });
}

export type FocusableBox = { element: string; top: number; bottom: number };

export type BarClearance = {
  /** Top of the rendered bottom bar, or `null` when there is none at this width. */
  barTop: number | null;
  /** The last rendered focusable element inside `main`, after scrolling to the end. */
  lastFocusable: FocusableBox | null;
  /** `a.fab`, when the screen has one and it is rendered. */
  fab: FocusableBox | null;
};

/** Sub-pixel rounding of a fixed bar's edge, never content behind it. */
export const BAR_CLEARANCE_TOLERANCE = 1;

/**
 * Whether anything is left behind the fixed bottom bar (Goal087, G-2): scrolls
 * the document and `main` to their end, then reads the last focusable element
 * inside `main` and the floating action button against the bar's top edge.
 */
export async function measureBarClearance(page: Page): Promise<BarClearance> {
  return page.evaluate(() => {
    const isRendered = (el: Element): boolean => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && box.width > 0
        && box.height > 0;
    };
    const describe = (el: Element): string => {
      const classes = typeof el.className === "string" && el.className.trim() !== ""
        ? `.${el.className.trim().split(/\s+/u).join(".")}`
        : "";
      return `${el.tagName.toLowerCase()}${classes}`;
    };
    const box = (el: Element): { element: string; top: number; bottom: number } => {
      const rect = el.getBoundingClientRect();
      return { element: describe(el), top: rect.top, bottom: rect.bottom };
    };

    const main = document.querySelector<HTMLElement>("main#main-content");
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    if (main) main.scrollTo({ top: main.scrollHeight, behavior: "instant" });

    const bar = Array.from(document.querySelectorAll('nav[class$="-bottom-nav"]')).find(isRendered);
    const focusable = main
      ? Array.from(
        main.querySelectorAll(
          'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), '
            + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(isRendered)
      : [];
    const last = focusable.at(-1);
    const fab = Array.from(document.querySelectorAll("a.fab")).find(isRendered);
    return {
      barTop: bar ? bar.getBoundingClientRect().top : null,
      lastFocusable: last ? box(last) : null,
      fab: fab ? box(fab) : null,
    };
  });
}
