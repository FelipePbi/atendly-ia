import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Locator, type Page } from "@playwright/test";

import {
  findStaleExceptions,
  hasFocusIndicator,
  type KnownSmallTarget,
  measureFirstTabFocus,
  measureOverflow,
  measureRunningAnimations,
  measureTouchTargets,
  OVERFLOW_TOLERANCE,
  TOUCH_TARGET_AA,
  TOUCH_TARGET_COMFORTABLE,
} from "./measure";
import { AUTHENTICATED_ROUTES } from "./routes";

/**
 * The width matrix, with a session (Goal033, A-02).
 *
 * The public gate measures the seven screens a visitor can reach. Everything
 * the product is actually made of — the Agenda at 360px, the Inbox, Clientes,
 * Serviços, Configurações, Início, Notificações — was never measured by
 * anything with layout, because the gate had no session and this project does
 * not fabricate one.
 *
 * So: `scripts/goal033-authenticated-ui-rehearsal.mjs` boots the real stack,
 * seeds a business through the product's own routes, serves the built
 * frontend, and hands this spec an e-mail and a password. The session comes
 * from typing them into `/login` and submitting the form — no `addCookies`,
 * no `localStorage`, no hand-written `storageState`, no call to the session
 * route to assemble a browser context.
 *
 * The ruler is `./measure.ts`, the same module the public gate uses. There is
 * no threshold in this file: a looser bar for the screens nobody had measured
 * yet would be the one thing this gate exists to prevent.
 */

type AuthenticatedRoute = (typeof AUTHENTICATED_ROUTES)[number];

/** What the rehearsal seeded, by name — used to prove the screen has data. */
type SeedContent = {
  businessName: string;
  customerName: string;
  serviceName: string;
  contactName: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. This spec measures the authenticated screens of a seeded, running stack; `
        + "`scripts/goal033-authenticated-ui-rehearsal.mjs` boots it and exports every variable this "
        + "file reads. There is no fallback and no skip: a gate that guesses its own credentials "
        + "would measure whatever happened to answer.",
    );
  }
  return value;
}

const BASE_URL = requireEnv("GOAL033_GATE_BASE_URL");
const EMAIL = requireEnv("GOAL033_EMAIL");
const PASSWORD = requireEnv("GOAL033_PASSWORD");
const SEED = JSON.parse(requireEnv("GOAL033_SEED")) as SeedContent;
/**
 * The day (YYYY-MM-DD) the rehearsal seeded the appointment on.
 *
 * The Agenda's day view opens on `new Date()` — the browser's own clock at
 * mount time, not the day the rehearsal chose. Those two agree whenever the
 * seeding happens early enough in the business day for a same-day slot to
 * exist; near midnight, seeding is pushed to the following calendar day (see
 * `scripts/goal033-authenticated-ui-rehearsal.mjs`) while the browser's clock
 * is still on the seeding day, minutes later. Without this, the gate would
 * measure an Agenda that legitimately has nothing on its default day — not a
 * bug in the product, but the wrong day asked of it.
 */
const MEASURED_DATE = requireEnv("GOAL033_MEASURED_DATE");

/**
 * Declared ceilings, so a hang is a named failure instead of a Playwright
 * default nobody chose.
 */
const LOGIN_TIMEOUT_MS = 30_000;
const SESSION_TIMEOUT_MS = 20_000;
const CONTENT_TIMEOUT_MS = 20_000;

/**
 * The seeded name each screen must show once its own data has arrived.
 *
 * This is what separates "loaded" from "empty": a screen whose request failed
 * renders its empty state with no skeleton and no `aria-busy`, and a purely
 * structural check would call that ready. Naming the seeded row means the
 * gate measures the screen with content on it.
 *
 * `/inicio`, `/configuracoes` and `/notificacoes` are absent on purpose: the
 * first two are proven by the heading their loaded branch renders (their
 * loading and error branches render different headings), and the notification
 * texts are produced by the platform, not by the rehearsal's fixture, so
 * there is no seeded string to name.
 */
const SEEDED_CONTENT: Partial<Record<AuthenticatedRoute["name"], keyof SeedContent>> = {
  agenda: "customerName",
  clientes: "customerName",
  conversas: "contactName",
  servicos: "serviceName",
};

/**
 * Accessibility debt these screens carry, named before it is tolerated.
 *
 * Same contract as the public gate's list: route, element, reason, owner, and
 * strict in BOTH directions — an entry that no longer reproduces FAILS, so a
 * fix takes its exception with it instead of leaving a graveyard behind.
 *
 * Empty here means "nothing has been granted an exception yet", never "not
 * checked": what the ruler rejects is fixed in `apps/frontend/src/**` unless
 * the fix would require deciding the screen's visual composition, which is
 * human review and is not this Goal's to make.
 */
const KNOWN_SMALL_TARGETS: KnownSmallTarget[] = [];

type KnownContrastFailure = { html: string; route: string; why: string };

/**
 * Contrast failures granted an exception, same contract and same strictness.
 *
 * A contrast failure is baselined only when clearing it means choosing a new
 * colour; a token applied wrongly is a fix, not an entry here.
 */
const KNOWN_CONTRAST_FAILURES: KnownContrastFailure[] = [];

/**
 * Bookkeeping for the list above — not a second ruler. Contrast itself is
 * decided by axe against the rendered palette; this only answers which
 * baselined entries stopped reproducing.
 */
function findStaleContrastExceptions(
  route: string,
  offenders: { html: string }[],
): KnownContrastFailure[] {
  return KNOWN_CONTRAST_FAILURES
    .filter((known) => known.route === route)
    .filter((known) => !offenders.some((node) => node.html === known.html));
}

/**
 * Where the typed session is kept between the tests of one run.
 *
 * The product throttles its own login route: `POST /v1/auth/login` allows ten
 * attempts per IP per fifteen minutes (`apps/bff/src/modules/auth/routes.ts`).
 * Seven routes times five widths is thirty-five tests, and a login inside each
 * one walked into `429` from the eleventh test onwards — the screen answered
 * "Não foi possível falar com a Atendly" and every later test died at the
 * login timeout without measuring anything. Relaxing the throttle is not on
 * the table: it is a product rule, and this gate exists to measure the product
 * as it is.
 *
 * So the session is typed ONCE per run and reused. What is reused is the
 * cookie the product's own `/login` form issued to a browser that filled in
 * the e-mail and the password and pressed the button — there is no
 * hand-written `storageState`, no `addCookies`, no call to the session route
 * to assemble a context. Nothing about the measurement is weakened: every
 * test still proves, before measuring, that it is on the route it claims, that
 * the authenticated shell marks the destination, that the shell is showing the
 * seeded tenant, and that the screen's own data has arrived.
 *
 * The file lives beside the rest of the run's output, and is only reused while
 * fresh: a stale cookie would send the browser back to `/login`, and the
 * proof above would fail the test instead of quietly measuring the wrong
 * screen.
 */
const SESSION_STATE_FILE = path.join(
  process.cwd(),
  "e2e-results",
  "authenticated",
  // The run's own identifier is part of the name: every rehearsal drops and
  // recreates its three databases, so a cookie from the previous run points at
  // a tenant that no longer exists. A file per run cannot be inherited by the
  // next one; inside one run, every worker restart reuses it.
  `typed-session-${requireEnv("GOAL033_RUN_ID")}.json`,
);
const SESSION_STATE_MAX_AGE_MS = 10 * 60 * 1_000;

function freshSessionState(): boolean {
  if (!existsSync(SESSION_STATE_FILE)) return false;
  return Date.now() - statSync(SESSION_STATE_FILE).mtimeMs < SESSION_STATE_MAX_AGE_MS;
}

/**
 * The worker's session: typed and submitted, then handed to every test in the
 * worker as its `storageState`.
 *
 * Worker-scoped on purpose. Playwright restarts a worker after a failure, and
 * a login per restart would hit the same throttle from a different direction;
 * the file survives the restart, so a red run does not turn into a run that
 * cannot log in at all.
 */
const test = base.extend<object, { typedSession: string }>({
  typedSession: [
    async ({ browser }, use) => {
      if (!freshSessionState()) {
        mkdirSync(path.dirname(SESSION_STATE_FILE), { recursive: true });
        const context = await browser.newContext({ baseURL: BASE_URL });
        const page = await context.newPage();
        await signIn(page);
        await context.storageState({ path: SESSION_STATE_FILE });
        await context.close();
      }
      await use(SESSION_STATE_FILE);
    },
    { scope: "worker" },
  ],
  storageState: async ({ typedSession }, use) => {
    await use(typedSession);
  },
});

/**
 * The session, established the only way this gate accepts: typed and
 * submitted.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });

  const form = page.locator("form.auth-form");
  await expect(
    form,
    `/login did not render its form within ${SESSION_TIMEOUT_MS}ms — the gate has nothing to type into.`,
  ).toBeVisible({ timeout: SESSION_TIMEOUT_MS });

  await form.locator('input[name="email"]').fill(EMAIL);
  await form.locator('input[name="login-password"]').fill(PASSWORD);
  await form.locator('button[type="submit"]').click();

  try {
    await page.waitForURL((url) => url.pathname === "/inicio", { timeout: LOGIN_TIMEOUT_MS });
  } catch {
    const rejection = (
      await page.locator(".auth-inline-alert").first().textContent().catch(() => null)
    )?.trim();
    throw new Error(
      `the login form did not establish a session within ${LOGIN_TIMEOUT_MS}ms: it was submitted with `
        + `${EMAIL} and the browser is still at ${page.url()}.`
        + (rejection
          ? ` The screen answered: "${rejection}".`
          : " The screen showed no error, so the request never completed.")
        + " This gate never fabricates a session, so there is nothing to fall back to: without one it"
        + " would be measuring /login while reporting an authenticated screen.",
    );
  }
}

/** The screen's own content marker: a heading, or a class when the heading depends on the tenant. */
function contentLocator(page: Page, route: AuthenticatedRoute): Locator {
  return route.contentMarker.startsWith(".")
    ? page.locator(route.contentMarker)
    : page.getByRole("heading", { level: 1, name: route.contentMarker });
}

/**
 * Proves the screen on the glass is the one that was asked for, that a real
 * session is behind it, and that its data — not its skeleton, not its empty
 * state — has arrived. Only then is anything measured.
 *
 * `ProductRuntime` redirects by phase: an account that did not log in lands
 * on `/login`, one whose onboarding is unfinished lands on `/onboarding`, and
 * both render perfectly measurable pages. Measuring one of those while
 * reporting `/agenda` is exactly the failure this Goal exists to prevent.
 */
async function proveAuthenticatedScreen(page: Page, route: AuthenticatedRoute): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).pathname, {
      message:
        `${route.path} redirected away instead of rendering: ProductRuntime sends an unauthenticated `
        + "phase to /login and an unfinished onboarding to /onboarding. Whatever is on screen now is "
        + "not the route this test claims to measure.",
      timeout: SESSION_TIMEOUT_MS,
    })
    .toBe(route.path);

  // Only the authenticated shell marks a destination as the current page; the
  // "Verificando seu acesso" screen has no navigation at all.
  await expect(
    page.locator(`a[href="${route.path}"][aria-current="page"]`).first(),
    `the authenticated shell did not mark "${route.sessionMarker}" as the current destination within `
      + `${SESSION_TIMEOUT_MS}ms: the session marker is missing, so this is not a logged-in screen.`,
  ).toBeAttached({ timeout: SESSION_TIMEOUT_MS });

  // And the shell is showing THIS tenant: the business name comes from the
  // session payload, so it cannot render without one.
  //
  // `.first()` because the shell prints the tenant twice inside the sidebar —
  // once in `.business-context` and once inside the account menu, where the
  // same class wraps the signed-in e-mail. Both are the same session payload;
  // without it the locator is strict-mode ambiguous and never gets to assert.
  await expect(
    page.locator(".sidebar .business-context .business-name strong").first(),
    `the shell is not showing the seeded business ("${SEED.businessName}") within `
      + `${SESSION_TIMEOUT_MS}ms: the session payload never arrived.`,
  ).toHaveText(SEED.businessName, { timeout: SESSION_TIMEOUT_MS });

  await waitForLoadedContent(page, route);
}

/**
 * Moves the Agenda's day view from wherever it opened (the browser's `today`)
 * to `MEASURED_DATE`, the day the rehearsal actually seeded. A no-op when the
 * two already agree, which is the common case.
 *
 * Every load of the Agenda re-mounts on `new Date()` — the initial `goto`
 * and, later in this spec, the `prefers-reduced-motion` reload alike — so
 * this runs from `waitForLoadedContent` itself instead of once up front.
 */
async function ensureAgendaOnMeasuredDate(page: Page): Promise<void> {
  const todayIso = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  if (todayIso === MEASURED_DATE) return;

  const diffDays = Math.round(
    (new Date(`${MEASURED_DATE}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime())
      / 86_400_000,
  );
  const button = page.getByRole("button", { name: diffDays > 0 ? "Próximo dia" : "Dia anterior" });
  for (let clicked = 0; clicked < Math.abs(diffDays); clicked += 1) {
    // eslint-disable-next-line no-await-in-loop -- each click must settle before the next
    await button.click();
  }

  await expect(
    page.locator('[aria-busy="true"], .skeleton'),
    `/agenda still had a loading placeholder after navigating to ${MEASURED_DATE}.`,
  ).toHaveCount(0, { timeout: CONTENT_TIMEOUT_MS });
}

/** The screen's own content, with the ceiling declared and the failure named. */
async function waitForLoadedContent(page: Page, route: AuthenticatedRoute): Promise<void> {
  await expect(
    contentLocator(page, route).first(),
    `${route.path} did not render its own content marker (${route.contentMarker}) within `
      + `${CONTENT_TIMEOUT_MS}ms. The shell alone is not the screen: measuring here would measure `
      + "chrome around a hole.",
  ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });

  await expect(
    page.locator('[aria-busy="true"], .skeleton'),
    `${route.path} still had a loading placeholder after ${CONTENT_TIMEOUT_MS}ms. A skeleton has its `
      + "own layout and its own contrast; measuring it reports on a screen the tenant never sees.",
  ).toHaveCount(0, { timeout: CONTENT_TIMEOUT_MS });

  if (route.name === "agenda") await ensureAgendaOnMeasuredDate(page);

  const seeded = SEEDED_CONTENT[route.name];
  if (!seeded) return;
  await expect(
    page.getByText(SEED[seeded]).first(),
    `${route.path} rendered without its seeded data ("${SEED[seeded]}") after ${CONTENT_TIMEOUT_MS}ms. `
      + "An empty state has no skeleton either, so without this the gate would call a failed request a "
      + "loaded screen.",
  ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
}

for (const route of AUTHENTICATED_ROUTES) {
  test.describe(route.name, () => {
    /**
     * One test per route and width, not one per measurement: five measurements
     * per test, across seven routes and five widths, is already thirty-five
     * runs of the whole proof. The measurements are soft assertions, so one
     * failure never hides the other four — the test still fails, and it fails
     * naming everything it found.
     *
     * The session arrives through the `typedSession` fixture above, which
     * types it into `/login` once per run; each test still proves it before
     * measuring anything.
     */
    test("measured, logged in", async ({ page }, testInfo) => {
      await page.goto(route.path, { waitUntil: "networkidle" });
      await proveAuthenticatedScreen(page, route);

      // 1. Nothing runs off the side.
      const overflow = await measureOverflow(page);
      expect
        .soft(
          overflow.scrollWidth,
          `horizontal scroll at ${route.name}/${testInfo.project.name}: ${overflow.scrollWidth}px of `
            + `content in ${overflow.clientWidth}px.\nFirst offenders: `
            + JSON.stringify(overflow.offenders, null, 2),
        )
        .toBeLessThanOrEqual(overflow.clientWidth + OVERFLOW_TOLERANCE);

      // 2. The touch targets can be hit — a touch-screen rule, as in the public gate.
      if (testInfo.project.name.startsWith("mobile")) {
        const measured = await measureTouchTargets(page);
        // Every control the selector reaches ends up here, measured or
        // exempted by name — never silently dropped.
        await testInfo.attach(`controls-classified-${route.name}`, {
          body: JSON.stringify(
            { route: route.name, project: testInfo.project.name, classified: measured.length },
            null,
            2,
          ),
          contentType: "application/json",
        });
        expect
          .soft(
            measured.length,
            `no touch-target controls collected at ${route.name}: selector matched nothing`,
          )
          .toBeGreaterThan(0);

        const undersized = measured.filter(
          (c) => c.exempt === null && (c.w < TOUCH_TARGET_AA || c.h < TOUCH_TARGET_AA),
        );
        const baselined = KNOWN_SMALL_TARGETS.filter((k) => k.route === route.name);
        const stale = findStaleExceptions(route.name, undersized, KNOWN_SMALL_TARGETS);
        expect
          .soft(
            stale,
            "these touch-target exceptions no longer reproduce and must be deleted:\n"
              + JSON.stringify(stale, null, 2),
          )
          .toEqual([]);

        const belowAA = undersized.filter((c) => !baselined.some((k) => k.html === c.html));
        const belowComfortable = measured.filter(
          (c) => c.exempt === null
            && !belowAA.includes(c)
            && (c.w < TOUCH_TARGET_COMFORTABLE || c.h < TOUCH_TARGET_COMFORTABLE),
        );
        // Reported, never failed — the same asymmetry the public gate keeps.
        if (belowComfortable.length > 0) {
          await testInfo.attach(`below-${TOUCH_TARGET_COMFORTABLE}px-${route.name}`, {
            body: JSON.stringify(belowComfortable, null, 2),
            contentType: "application/json",
          });
        }

        expect
          .soft(
            belowAA,
            `controls below the WCAG 2.5.8 AA minimum of ${TOUCH_TARGET_AA}px at `
              + `${route.name}/${testInfo.project.name}:\n${JSON.stringify(belowAA, null, 2)}`,
          )
          .toEqual([]);
      }

      // 3. Contrast, computed against the rendered palette.
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const contrastNodes = axe.violations
        .filter((violation) => violation.id === "color-contrast")
        .flatMap((violation) =>
          violation.nodes.map((node) => ({
            html: node.html,
            summary: node.failureSummary ?? violation.help,
          })),
        );
      // Everything else axe found is a finding, reported and not decided here:
      // this gate measures overflow, touch target, contrast, focus and motion.
      // Fixing anything else silently would be a change nobody asked for.
      const otherViolations = axe.violations.filter((violation) => violation.id !== "color-contrast");
      if (otherViolations.length > 0) {
        await testInfo.attach(`axe-outside-the-ruler-${route.name}`, {
          body: JSON.stringify(otherViolations, null, 2),
          contentType: "application/json",
        });
      }

      const staleContrast = findStaleContrastExceptions(route.name, contrastNodes);
      expect
        .soft(
          staleContrast,
          "these contrast exceptions no longer reproduce and must be deleted:\n"
            + JSON.stringify(staleContrast, null, 2),
        )
        .toEqual([]);

      const unbaselinedContrast = contrastNodes.filter(
        (node) => !KNOWN_CONTRAST_FAILURES.some(
          (known) => known.route === route.name && known.html === node.html,
        ),
      );
      expect
        .soft(
          unbaselinedContrast,
          `insufficient contrast at ${route.name}/${testInfo.project.name}:\n`
            + JSON.stringify(unbaselinedContrast, null, 2),
        )
        .toEqual([]);

      // 4. The first Tab reaches something visible, with a focus indicator.
      const focus = await measureFirstTabFocus(page);
      expect
        .soft(focus, `Tab moved focus nowhere at ${route.name}: the screen has no keyboard entry point`)
        .not.toBeNull();
      expect
        .soft(focus?.visible, `focus landed on something with no box at ${route.name}`)
        .toBe(true);
      expect
        .soft(
          hasFocusIndicator(focus),
          `no visible focus indicator on <${focus?.tag}> at ${route.name}/${testInfo.project.name}`,
        )
        .toBe(true);

      // Evidence, never a pass/fail: fidelity to the approved direction is a
      // human call and no gate decides it.
      await testInfo.attach(`${route.name}-${testInfo.project.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });

      // 5. Reduced motion, honoured rather than declared. Last, because it
      // changes how the page renders: the screen is loaded again, and proved
      // loaded again, before anything is read from it.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload({ waitUntil: "networkidle" });
      await waitForLoadedContent(page, route);
      const moving = await measureRunningAnimations(page);
      expect
        .soft(
          moving,
          `animation still running under prefers-reduced-motion at ${route.name}/`
            + `${testInfo.project.name}:\n${moving.join("\n")}`,
        )
        .toEqual([]);
    });
  });
}
