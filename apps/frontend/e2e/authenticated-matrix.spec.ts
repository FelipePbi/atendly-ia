import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  BAR_CLEARANCE_TOLERANCE,
  BOTTOM_NAV_ITEMS,
  findStaleExceptions,
  hasFocusIndicator,
  type KnownSmallTarget,
  measureBarClearance,
  measureComposition,
  measureFirstTabFocus,
  measureNativeBorderControls,
  measureOverflow,
  measureRunningAnimations,
  measureShellBands,
  measureSidebarSpan,
  measureTouchTargets,
  OVERFLOW_TOLERANCE,
  SIDEBAR_BREAKPOINT,
  SIDEBAR_SPAN_TOLERANCE,
  SIDEBAR_WIDTH,
  TOUCH_TARGET_AA,
  TOUCH_TARGET_COMFORTABLE,
} from "./measure";
import { AUTHENTICATED_ROUTES, ONBOARDING_ROUTES } from "./routes";

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
type OnboardingRoute = (typeof ONBOARDING_ROUTES)[number];

/** What the rehearsal seeded, by name — used to prove the screen has data. */
type SeedContent = {
  businessName: string;
  customerName: string;
  serviceName: string;
  contactName: string;
  /**
   * The contact's inbound message. The inbox row previews the LAST message,
   * which is the owner's reply, so this text only renders once the thread
   * itself has opened — the proof a click reached the conversation.
   */
  inboundText: string;
  /**
   * The service the rehearsal seeds only for the duration case (Goal058,
   * QA SV-01): 60 minutes, like the one onboarding creates. No other
   * measurement names it, and the case puts it back to 60 before it ends.
   */
  durationServiceName: string;
  durationServiceMinutes: number;
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
 * A SEGUNDA conta (Goal065/WU-05): para no meio do onboarding, de propósito,
 * para este gate medir as etapas que só uma sessão sem onboarding concluído
 * alcança. `scripts/goal033-authenticated-ui-rehearsal.mjs` a registra e
 * grava só o bloco de negócio — nunca completa o onboarding dela, e nunca
 * toca a conta e as 75 medidas de `EMAIL`/`SEED` acima.
 */
const ONBOARDING_EMAIL = requireEnv("GOAL033_ONBOARDING_EMAIL");
const ONBOARDING_PASSWORD = requireEnv("GOAL033_ONBOARDING_PASSWORD");
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
 * `/inicio`, `/configuracoes`, `/configuracoes/ia`, `/configuracoes/whatsapp`
 * and `/notificacoes` are absent on purpose: the first three are proven by the
 * heading their loaded branch renders (their loading and error branches
 * render different headings) — `/configuracoes/ia` also holds `aria-busy` on
 * its activation panel until the test and WhatsApp reads arrive —,
 * `/configuracoes/whatsapp` by `LOADED_STATE` below, and the notification
 * texts are produced by the platform, not by the rehearsal's fixture, so
 * there is no seeded string to name.
 */
type SeededText = { [K in keyof SeedContent]: SeedContent[K] extends string ? K : never }[keyof SeedContent];

const SEEDED_CONTENT: Partial<Record<AuthenticatedRoute["name"], SeededText>> = {
  agenda: "customerName",
  clientes: "customerName",
  conversas: "contactName",
  servicos: "serviceName",
};

/**
 * The state a screen must be in before it is measured, when its h1 does not
 * tell (Goal071).
 *
 * `/configuracoes/whatsapp` renders the settings page's "WhatsApp" h1 in
 * every state, and its panel holds `aria-busy` only until the first status
 * read. The rehearsal tenant's number is connected, so the gate names the
 * connected heading and refuses the consent form: without this, a failed or
 * wrong status read would be measured as if it were the connected screen.
 */
const LOADED_STATE: Partial<Record<AuthenticatedRoute["name"], { heading: string; absentRole: "checkbox" }>> = {
  "configuracoes-whatsapp": { heading: "WhatsApp conectado", absentRole: "checkbox" },
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
/**
 * The SECOND account's typed session (Goal065, WU-05) — same contract as
 * `SESSION_STATE_FILE`, a separate file because it is a separate account,
 * stopped mid-onboarding on purpose.
 */
const ONBOARDING_SESSION_STATE_FILE = path.join(
  process.cwd(),
  "e2e-results",
  "authenticated",
  `typed-onboarding-session-${requireEnv("GOAL033_RUN_ID")}.json`,
);
const SESSION_STATE_MAX_AGE_MS = 10 * 60 * 1_000;

function freshSessionState(file: string): boolean {
  if (!existsSync(file)) return false;
  return Date.now() - statSync(file).mtimeMs < SESSION_STATE_MAX_AGE_MS;
}

/**
 * The product's OTHER throttle — the one this gate was racing without looking
 * at it (Goal037, WU-05).
 *
 * `apps/bff/src/app.ts` registers `@fastify/rate-limit` globally with
 * `max: 300, timeWindow: "1 minute"`, keyed by IP, with no allow list. Every
 * test here comes from the same IP. One test is two full page loads — the
 * `goto` and the `prefers-reduced-motion` reload — and each load asks the BFF
 * for the session, the system status, the notification summary and the
 * screen's own data. Measured on this tree from the BFF's own request log: the
 * thirty-five tests peak at 285 requests inside a sixty-second window, and a
 * run that repeats one width peaks at 294. That is 95% to 98% of a budget the
 * product enforces, and the margin is five to fifteen requests.
 *
 * Crossing it does not look like a throttle on screen, which is why it read as
 * flakiness. `GET /v1/auth/session` answering `429` is not `401`, so
 * `ProductRuntime` takes its `error` branch and renders "Não foi possível
 * verificar seu acesso" — a page with no navigation at all, so
 * `aria-current="page"` never appears and the test dies at the session marker.
 * A `429` on the screen's own list call renders that screen's error state, so
 * the seeded row never arrives. Either way the first attempt fails, the minute
 * rolls over while it fails, and the retry passes: a failure block inside an
 * `exit 0` run, which is exactly what `[notebook-1024] › servicos` left behind.
 *
 * Relaxing the limit is not on the table, for the same reason the login
 * throttle above is not: it is a product rule, and this gate measures the
 * product as it is. What the gate can do is stop racing it — and it does not
 * have to guess, because the BFF declares on EVERY response how much of the
 * budget is left and how long the window still has to run. This waits on that,
 * not on a clock somebody picked. No assertion is relaxed, no tolerance moves
 * and no measurement is skipped: the test that would have measured the error
 * screen now measures the screen.
 */
const RATE_LIMIT_REMAINING_HEADER = "x-ratelimit-remaining";
const RATE_LIMIT_RESET_HEADER = "x-ratelimit-reset";
/**
 * The budget one test needs before it is safe to start it.
 *
 * A test costs about ten requests (285 in a window that holds roughly thirty
 * of them). Thirty is three times that, so a test that starts above this line
 * finishes well clear of zero even with the shell's 45s status poll landing
 * inside it.
 */
const RATE_LIMIT_TEST_BUDGET = 30;

/** The last budget the BFF declared, and how long its window still has. */
let rateLimitRemaining: number | null = null;
let rateLimitResetSeconds = 0;

/**
 * Reads the budget off the responses the page is already making. Nothing is
 * requested for the sake of measuring: the header rides on every BFF answer
 * the screen was going to receive anyway.
 */
function watchRateLimitBudget(page: Page): void {
  page.on("response", (response) => {
    const headers = response.headers();
    const remaining = Number(headers[RATE_LIMIT_REMAINING_HEADER]);
    if (!Number.isFinite(remaining)) return;
    rateLimitRemaining = remaining;
    rateLimitResetSeconds = Number(headers[RATE_LIMIT_RESET_HEADER] ?? 0);
  });
}

/**
 * Holds the next test until the product's window has room for it, and says so
 * in the run's own output. A wait that nobody can see is a wait that becomes a
 * mystery the next time the gate is slow.
 */
async function waitForRateLimitBudget(testInfo: TestInfo): Promise<void> {
  if (rateLimitRemaining === null || rateLimitRemaining >= RATE_LIMIT_TEST_BUDGET) return;

  const waitedMs = (Math.max(rateLimitResetSeconds, 0) + 1) * 1_000;
  await testInfo.attach("rate-limit-window-waited", {
    body: JSON.stringify(
      {
        remaining: rateLimitRemaining,
        budget: RATE_LIMIT_TEST_BUDGET,
        resetSeconds: rateLimitResetSeconds,
        waitedMs,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  // Cleared before waiting, not after: the next window's first response is
  // what re-establishes the budget, and a stale number here would let a second
  // test through on the strength of the window that just closed.
  rateLimitRemaining = null;
  await new Promise((resolve) => {
    setTimeout(resolve, waitedMs);
  });
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
      if (!freshSessionState(SESSION_STATE_FILE)) {
        mkdirSync(path.dirname(SESSION_STATE_FILE), { recursive: true });
        const context = await browser.newContext({ baseURL: BASE_URL });
        const page = await context.newPage();
        // The login itself spends from the same per-IP budget, so the first
        // test starts knowing what it left behind.
        watchRateLimitBudget(page);
        await signIn(page, EMAIL, PASSWORD, (pathname) => pathname === "/inicio", "/inicio");
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
 * The SECOND account's worker session (Goal065, WU-05): typed and submitted
 * the same way, reused across the onboarding-step tests of one worker. Its
 * onboarding never completes, so a successful login lands somewhere under
 * `/onboarding/*` — never `/inicio` — and that is what this waits for.
 */
const onboardingTest = base.extend<object, { typedOnboardingSession: string }>({
  typedOnboardingSession: [
    async ({ browser }, use) => {
      if (!freshSessionState(ONBOARDING_SESSION_STATE_FILE)) {
        mkdirSync(path.dirname(ONBOARDING_SESSION_STATE_FILE), { recursive: true });
        const context = await browser.newContext({ baseURL: BASE_URL });
        const page = await context.newPage();
        watchRateLimitBudget(page);
        await signIn(
          page,
          ONBOARDING_EMAIL,
          ONBOARDING_PASSWORD,
          (pathname) => pathname.startsWith("/onboarding/"),
          "/onboarding/*",
        );
        await context.storageState({ path: ONBOARDING_SESSION_STATE_FILE });
        await context.close();
      }
      await use(ONBOARDING_SESSION_STATE_FILE);
    },
    { scope: "worker" },
  ],
  storageState: async ({ typedOnboardingSession }, use) => {
    await use(typedOnboardingSession);
  },
});

/**
 * The session, established the only way this gate accepts: typed and
 * submitted. `isExpectedDestination` names where a successful login must
 * land — `/inicio` for a completed onboarding, somewhere under
 * `/onboarding/*` for the account WU-05 stops mid-onboarding.
 */
async function signIn(
  page: Page,
  email: string,
  password: string,
  isExpectedDestination: (pathname: string) => boolean,
  destinationDescription: string,
): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });

  const form = page.locator("form.auth-form");
  await expect(
    form,
    `/login did not render its form within ${SESSION_TIMEOUT_MS}ms — the gate has nothing to type into.`,
  ).toBeVisible({ timeout: SESSION_TIMEOUT_MS });

  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="login-password"]').fill(password);
  await form.locator('button[type="submit"]').click();

  try {
    await page.waitForURL((url) => isExpectedDestination(url.pathname), { timeout: LOGIN_TIMEOUT_MS });
  } catch {
    const rejection = (
      await page.locator(".auth-inline-alert").first().textContent().catch(() => null)
    )?.trim();
    throw new Error(
      `the login form did not reach ${destinationDescription} within ${LOGIN_TIMEOUT_MS}ms: it was `
        + `submitted with ${email} and the browser is still at ${page.url()}.`
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

/** The onboarding step's own content marker: always its h1 (Goal065, WU-05). */
function onboardingContentLocator(page: Page, route: OnboardingRoute): Locator {
  return page.getByRole("heading", { level: 1, name: route.contentMarker });
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
  // "Verificando seu acesso" screen has no navigation at all. The destination
  // is the route's `sessionMarker`, which a nested screen shares with its
  // module (`/configuracoes/ia` marks Configurações).
  await expect(
    page.locator(`a[href="/${route.sessionMarker}"][aria-current="page"]`).first(),
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
 * Proves an onboarding step screen (Goal065, WU-05): the URL is the one
 * asked for, and the step's own h1 rendered — the same two proofs
 * `proveAuthenticatedScreen` makes for `AppShell`, adapted to a screen that
 * has neither a sidebar nor a session marker.
 *
 * There is no forward guard to prove against: `OnboardingScreen` renders
 * whichever step the URL names regardless of how far the account's own
 * state has progressed (`ProductRuntime` only redirects `/onboarding/*`
 * away for an unauthenticated or a completed session). The URL check still
 * catches the one redirect that DOES apply — a session that finished
 * onboarding between the login and this navigation would land on `/inicio`.
 */
async function proveOnboardingScreen(page: Page, route: OnboardingRoute): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).pathname, {
      message:
        `${route.path} redirected away instead of rendering: ProductRuntime sends an unauthenticated `
        + "phase to /login and a completed onboarding to /inicio. Whatever is on screen now is not the "
        + "step this test claims to measure.",
      timeout: SESSION_TIMEOUT_MS,
    })
    .toBe(route.path);

  await expect(
    onboardingContentLocator(page, route),
    `${route.path} did not render its own heading ("${route.contentMarker}") within `
      + `${CONTENT_TIMEOUT_MS}ms.`,
  ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });

  await expect(
    page.locator('[aria-busy="true"], .skeleton'),
    `${route.path} still had a loading placeholder after ${CONTENT_TIMEOUT_MS}ms.`,
  ).toHaveCount(0, { timeout: CONTENT_TIMEOUT_MS });
}

/** Monday (YYYY-MM-DD) of the week containing `iso`, mirroring the frontend's own `startOfWeek`. */
function mondayOfWeek(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  const weekday = date.getDay();
  date.setDate(date.getDate() - ((weekday + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Moves the Agenda from wherever it opened (the browser's `today`) to
 * `MEASURED_DATE`, the day the rehearsal actually seeded, in whichever view
 * (Dia, Semana or Mês) is open — Goal069 §5. A no-op when the two already
 * agree, which is the common case.
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

  let button: Locator | null = null;
  let steps = 0;

  if (
    (await page.getByRole("button", { name: "Próximo dia" }).count()) > 0
    || (await page.getByRole("button", { name: "Dia anterior" }).count()) > 0
  ) {
    const diffDays = Math.round(
      (new Date(`${MEASURED_DATE}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime())
        / 86_400_000,
    );
    steps = Math.abs(diffDays);
    button = page.getByRole("button", { name: diffDays > 0 ? "Próximo dia" : "Dia anterior" });
  } else if (
    (await page.getByRole("button", { name: "Próxima semana" }).count()) > 0
    || (await page.getByRole("button", { name: "Semana anterior" }).count()) > 0
  ) {
    const todayWeekStart = mondayOfWeek(todayIso);
    const measuredWeekStart = mondayOfWeek(MEASURED_DATE);
    const diffWeeks = Math.round(
      (new Date(`${measuredWeekStart}T00:00:00`).getTime() - new Date(`${todayWeekStart}T00:00:00`).getTime())
        / (7 * 86_400_000),
    );
    steps = Math.abs(diffWeeks);
    button = page.getByRole("button", { name: diffWeeks > 0 ? "Próxima semana" : "Semana anterior" });
  } else if (
    (await page.getByRole("button", { name: "Próximo mês" }).count()) > 0
    || (await page.getByRole("button", { name: "Mês anterior" }).count()) > 0
  ) {
    const [todayYear, todayMonth] = todayIso.split("-").map(Number);
    const [measuredYear, measuredMonth] = MEASURED_DATE.split("-").map(Number);
    const diffMonths = (measuredYear - todayYear) * 12 + (measuredMonth - todayMonth);
    steps = Math.abs(diffMonths);
    button = page.getByRole("button", { name: diffMonths > 0 ? "Próximo mês" : "Mês anterior" });
  }

  // Nenhum dos três pares de botão existe: nada a clicar (não deveria
  // acontecer com a barra superior do Goal069, mas não há o que fazer aqui).
  if (!button || steps === 0) return;
  for (let clicked = 0; clicked < steps; clicked += 1) {
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

  const state = LOADED_STATE[route.name];
  if (state) {
    await expect(
      page.getByRole("heading", { name: state.heading, exact: true }),
      `${route.path} did not reach the state it must be measured in ("${state.heading}") within `
        + `${CONTENT_TIMEOUT_MS}ms. Its h1 renders in every state, so measuring now could measure another one.`,
    ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
    await expect(
      page.getByRole(state.absentRole),
      `${route.path} shows a ${state.absentRole} in the "${state.heading}" state: that is the consent form, `
        + "which a connected number never sees.",
    ).toHaveCount(0);
  }

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
     * One test per route and width, not one per measurement: six measurements
     * per test (the composition joined in Goal058), across nine routes and
     * five widths, is already forty-five runs of the whole proof. The measurements are soft assertions, so one
     * failure never hides the other four — the test still fails, and it fails
     * naming everything it found.
     *
     * What a click reaches is measured apart, below, because a click moves the
     * browser off this route and nothing measured after it would be this
     * screen.
     *
     * The session arrives through the `typedSession` fixture above, which
     * types it into `/login` once per run; each test still proves it before
     * measuring anything.
     */
    test("measured, logged in", async ({ page }, testInfo) => {
      // Before the first request of the test, never after: a test that starts
      // with an exhausted budget measures the "Não foi possível verificar seu
      // acesso" screen and blames the product for it.
      await waitForRateLimitBudget(testInfo);
      watchRateLimitBudget(page);

      await page.goto(route.path, { waitUntil: "networkidle" });
      await proveAuthenticatedScreen(page, route);

      // 1. Nothing runs off the side.
      const overflow = await measureOverflow(page);
      // The reading itself, pass or fail: it is what answered why the shell
      // without a grid never overflowed at 390 (Goal058 §5.1).
      await testInfo.attach(`overflow-${route.name}`, {
        body: JSON.stringify(overflow, null, 2),
        contentType: "application/json",
      });
      expect
        .soft(
          overflow.scrollWidth,
          `horizontal scroll at ${route.name}/${testInfo.project.name}: ${overflow.scrollWidth}px of `
            + `content in ${overflow.clientWidth}px.\nFirst offenders: `
            + JSON.stringify(overflow.offenders, null, 2),
        )
        .toBeLessThanOrEqual(overflow.clientWidth + OVERFLOW_TOLERANCE);

      // 1b. The composition (Goal058): the screen's own content is on the
      // first screen, it is what a pointer lands on, and the sidebar sits
      // beside `main` instead of over it. Every other measurement here passed
      // on a shell whose sidebar took the whole width and covered the list.
      const composition = await measureComposition(contentLocator(page, route).first());
      const where = `${route.path} at ${testInfo.project.name}`;
      await testInfo.attach(`composition-${route.name}`, {
        body: JSON.stringify(composition, null, 2),
        contentType: "application/json",
      });
      expect
        .soft(
          composition.marker.top,
          `${where}: the content marker (${route.contentMarker}) starts at y=${composition.marker.top}, `
            + `below the first screen (${composition.viewport.height}px). Found at the top instead: `
            + `sidebar ${JSON.stringify(composition.sidebar)}, main ${JSON.stringify(composition.main)}.`,
        )
        .toBeLessThan(composition.viewport.height);
      expect
        .soft(
          composition.hit.insideMarker && composition.hit.navigation === null,
          `${where}: elementFromPoint at the centre of the content marker (${route.contentMarker}, `
            + `point ${JSON.stringify(composition.point)}) found ${composition.hit.element ?? "nothing"}`
            + (composition.hit.navigation ? `, inside the navigation ${composition.hit.navigation}` : "")
            + `, not the marker. ${composition.hit.html ?? ""}`,
        )
        .toBe(true);
      expect
        .soft(
          composition.sidebarMainOverlap,
          `${where}: aside.sidebar ${JSON.stringify(composition.sidebar)} overlaps main `
            + `${JSON.stringify(composition.main)} by ${composition.sidebarMainOverlap}px horizontally; `
            + `the element at the content marker's centre is ${composition.hit.element ?? "nothing"}.`,
        )
        .toBe(0);
      const chromeOffGlass = composition.chrome.filter((box) => !box.inside);
      expect
        .soft(
          chromeOffGlass,
          `${where}: the shell's mobile header or bottom bar runs off the viewport `
            + `(${composition.viewport.width}x${composition.viewport.height}): `
            + JSON.stringify(chromeOffGlass),
        )
        .toEqual([]);

      // 1c. No visible control wears the browser's own border (Goal083).
      const nativeBorders = await measureNativeBorderControls(page);
      const viewportWidth = page.viewportSize()?.width ?? composition.viewport.width;
      expect
        .soft(
          nativeBorders,
          `${route.path} at ${testInfo.project.name} (${viewportWidth}px): visible controls with the `
            + "browser's native border (inset/outset or 0px radius) — no product style reached them:\n"
            + nativeBorders
              .map((control) => `${control.selector} (${control.borderWidth} ${control.borderStyle}, radius ${control.radius})`)
              .join("\n"),
        )
        .toEqual([]);

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
      // this gate measures overflow, composition, touch target, contrast, focus
      // and motion.
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

/**
 * The onboarding steps the vault describes (Goal065, WU-05), measured with
 * the SECOND account's session — the one that stops mid-onboarding on
 * purpose (`scripts/goal033-authenticated-ui-rehearsal.mjs`).
 *
 * Same ruler as `AUTHENTICATED_ROUTES` above (overflow, touch target,
 * contrast, focus, reduced motion), minus the shell-specific composition and
 * click-reach checks that assume `AppShell`'s sidebar and `main#main-content`
 * — the onboarding shell has neither.
 */
for (const route of ONBOARDING_ROUTES) {
  onboardingTest.describe(route.name, () => {
    onboardingTest("measured, logged in", async ({ page }, testInfo) => {
      await waitForRateLimitBudget(testInfo);
      watchRateLimitBudget(page);

      await page.goto(route.path, { waitUntil: "networkidle" });
      await proveOnboardingScreen(page, route);

      // "Horários" only shows its per-day fields once "Personalizar dias
      // diferentes" is opened (WU-05's acceptance criteria names this state
      // explicitly): the button starts collapsed, and opening it is a real
      // click, not a seeded state — nothing about the account's onboarding
      // progress can pre-open it.
      if (route.name === "onboarding-horarios") {
        const toggle = page.getByRole("button", { name: "Personalizar dias diferentes" });
        await toggle.click();
        await expect(
          toggle,
          `${route.path}: "Personalizar dias diferentes" did not open within ${CONTENT_TIMEOUT_MS}ms.`,
        ).toHaveAttribute("aria-expanded", "true", { timeout: CONTENT_TIMEOUT_MS });
      }

      // 1. Nothing runs off the side.
      const overflow = await measureOverflow(page);
      await testInfo.attach(`overflow-${route.name}`, {
        body: JSON.stringify(overflow, null, 2),
        contentType: "application/json",
      });
      expect
        .soft(
          overflow.scrollWidth,
          `horizontal scroll at ${route.name}/${testInfo.project.name}: ${overflow.scrollWidth}px of `
            + `content in ${overflow.clientWidth}px.\nFirst offenders: `
            + JSON.stringify(overflow.offenders, null, 2),
        )
        .toBeLessThanOrEqual(overflow.clientWidth + OVERFLOW_TOLERANCE);

      // 1b. The eight segment chips (Cabelo…Personal trainer, plus "Outro")
      // stay whole inside the width, at every width — the WU-05 acceptance
      // criterion the generic overflow check above does not, by itself,
      // name: a row with its own `overflow-x` would never show up as
      // document-level scroll.
      if (route.name === "onboarding-segmento-e-nome") {
        const chipRow = page.locator(".segment-chip-row");
        const chips = chipRow.locator(".chip");
        await expect(
          chips,
          `${route.path}: expected the eight segment chips (seven frequent segments plus "Outro").`,
        ).toHaveCount(8);
        const rowBox = await chipRow.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
        await testInfo.attach(`segment-chips-${testInfo.project.name}`, {
          body: JSON.stringify(rowBox, null, 2),
          contentType: "application/json",
        });
        expect
          .soft(
            rowBox.scrollWidth,
            `${route.path} at ${testInfo.project.name}: the segment chip row scrolls `
              + `(${rowBox.scrollWidth}px of content in ${rowBox.clientWidth}px) — the eight chips do not `
              + "stay whole inside the width.",
          )
          .toBeLessThanOrEqual(rowBox.clientWidth + OVERFLOW_TOLERANCE);
      }

      // 1c. WhatsApp intro on a phone (QA O-41): "Conectar meu WhatsApp" and
      // "Fazer isso depois" are stacked, each as wide as the action bar, with
      // the primary one on top — never squeezed side by side in one row.
      if (route.name === "onboarding-whatsapp" && testInfo.project.name.startsWith("mobile")) {
        const bar = await page.locator(".onboarding-actions").boundingBox();
        const connect = await page.getByRole("button", { name: "Conectar meu WhatsApp" }).boundingBox();
        const later = await page.getByRole("button", { name: "Fazer isso depois" }).boundingBox();
        await testInfo.attach(`whatsapp-intro-actions-${testInfo.project.name}`, {
          body: JSON.stringify({ bar, connect, later }, null, 2),
          contentType: "application/json",
        });
        expect(bar && connect && later, `${route.path}: the intro actions did not render.`).toBeTruthy();
        if (bar && connect && later) {
          for (const [label, box] of [["Conectar meu WhatsApp", connect], ["Fazer isso depois", later]] as const) {
            expect
              .soft(
                box.width,
                `${route.path} at ${testInfo.project.name}: "${label}" is ${box.width}px wide in a `
                  + `${bar.width}px action bar — it is not full width.`,
              )
              .toBeGreaterThanOrEqual(bar.width - OVERFLOW_TOLERANCE);
          }
          expect
            .soft(
              connect.y + connect.height,
              `${route.path} at ${testInfo.project.name}: "Conectar meu WhatsApp" is not stacked above `
                + '"Fazer isso depois".',
            )
            .toBeLessThanOrEqual(later.y + OVERFLOW_TOLERANCE);
        }
      }

      // 2. The touch targets can be hit — a touch-screen rule, as in the public gate.
      if (testInfo.project.name.startsWith("mobile")) {
        const measured = await measureTouchTargets(page);
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

      // 5. Reduced motion, honoured rather than declared.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload({ waitUntil: "networkidle" });
      await proveOnboardingScreen(page, route);
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

/**
 * What a click reaches (Goal058, QA CV-02).
 *
 * The composition above reads the layout; this proves the consequence a person
 * meets. On the shell that shipped without a grid, `aside.sidebar` sat over the
 * lists and "intercepts pointer events" was the answer to every click: the
 * owner could not open a conversation, a customer or a service, and "Criar
 * serviço" only submitted from the keyboard.
 *
 * Every click here is `locator.click()` with Playwright's own actionability
 * checks: no `force`, no `dispatchEvent`, no keyboard. When something else is
 * on top, the click retries until the ceiling below and then fails naming the
 * element that took the pointer.
 *
 * All five widths, not only 390 and 1440: the product's per-IP budget is
 * respected the same way the measurements respect it (`waitForRateLimitBudget`
 * before each test), which costs time and nothing else.
 */
const CLICK_TIMEOUT_MS = 15_000;
const SAVE_TIMEOUT_MS = 20_000;

function routeNamed(name: AuthenticatedRoute["name"]): AuthenticatedRoute {
  const route = AUTHENTICATED_ROUTES.find((candidate) => candidate.name === name);
  if (!route) throw new Error(`${name} is not in AUTHENTICATED_ROUTES`);
  return route;
}

/**
 * A real click, with the failure named: route, width, what was aimed at and —
 * when Playwright saw one — the element that intercepted the pointer.
 */
async function clickForReal(target: Locator, what: string, testInfo: TestInfo): Promise<void> {
  try {
    await target.click({ timeout: CLICK_TIMEOUT_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const interceptor = /(<[^\n]*?>[^\n]*?intercepts pointer events)/u.exec(message)?.[1];
    throw new Error(
      `${what} at ${testInfo.project.name} could not be reached by a real click within `
        + `${CLICK_TIMEOUT_MS}ms`
        + (interceptor ? `: ${interceptor}` : "")
        + `.\n${message}`,
    );
  }
}

async function expectPath(page: Page, pathname: RegExp, what: string): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).pathname, {
      message: `${what}: the click did not open ${pathname}; the browser is at ${page.url()}.`,
      timeout: CONTENT_TIMEOUT_MS,
    })
    .toMatch(pathname);
}

type ReachedByClick = {
  route: AuthenticatedRoute["name"];
  label: string;
  row: (page: Page) => Locator;
  detailPath: RegExp;
  /** Content only the detail renders, so a URL change alone is not the proof. */
  detailLoaded: (page: Page, what: string) => Promise<void>;
};

const REACHED_BY_CLICK: ReachedByClick[] = [
  {
    route: "conversas",
    label: `the conversation with ${SEED.contactName}`,
    row: (page) => page.locator("a.conversation-row", { hasText: SEED.contactName }).first(),
    detailPath: /^\/conversas\/[^/]+$/u,
    detailLoaded: async (page, what) => {
      const timeline = page.locator(".message-timeline");
      await expect(
        timeline.getByText(SEED.inboundText).first(),
        `${what}: the thread did not show the contact's inbound message within ${CONTENT_TIMEOUT_MS}ms.`,
      ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });

      // Goal070 §5: the three ledger-derived event lines, seeded straight
      // into the AI's disposable database
      // (scripts/goal033-authenticated-ui-rehearsal.mjs) — a hold not yet
      // expired, the appointment the confirm created, and a hold that
      // expired without confirmation.
      await expect(
        timeline.getByText("Horário reservado até", { exact: false }).first(),
        `${what}: no HOLD_PLACED line ("Horário reservado até…") within ${CONTENT_TIMEOUT_MS}ms.`,
      ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
      await expect(
        timeline.getByText("Agendamento criado", { exact: false }).first(),
        `${what}: no APPOINTMENT_CREATED line ("Agendamento criado…") within ${CONTENT_TIMEOUT_MS}ms.`,
      ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
      await expect(
        timeline.getByText("venceu sem confirmação", { exact: false }).first(),
        `${what}: no HOLD_EXPIRED line ("…venceu sem confirmação") within ${CONTENT_TIMEOUT_MS}ms.`,
      ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
    },
  },
  {
    route: "clientes",
    label: `the customer ${SEED.customerName}`,
    row: (page) => page
      .locator('a[href^="/clientes/detalhes"]', { hasText: SEED.customerName })
      .first(),
    detailPath: /^\/clientes\/detalhes$/u,
    detailLoaded: async (page, what) => {
      await expect(
        page.getByRole("heading", { level: 1, name: SEED.customerName }),
        `${what}: the customer profile did not render its heading within ${CONTENT_TIMEOUT_MS}ms.`,
      ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
    },
  },
  {
    route: "servicos",
    label: `the service ${SEED.serviceName}`,
    row: (page) => page.getByRole("link", { name: `Editar ${SEED.serviceName}` }),
    detailPath: /^\/servicos\/editar$/u,
    detailLoaded: async (page, what) => {
      await expect(
        page.locator('form input[name="name"]'),
        `${what}: the edit form did not load the service within ${CONTENT_TIMEOUT_MS}ms.`,
      ).toHaveValue(SEED.serviceName, { timeout: CONTENT_TIMEOUT_MS });
    },
  },
];

/**
 * The list's own duration text (Goal076): hours and minutes, not raw
 * minutes — `formatServiceDuration` in
 * `src/features/services/serviceFormatting.ts` is the source of this, and a
 * literal `${minutes} min` here would drift the moment that source changes.
 * Mirrored instead of imported: this spec keeps its own expectations, the
 * same way it keeps its own `routes.ts` and `measure.ts` rather than
 * reaching into `src/**`.
 */
function expectedDurationText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} min`;
  if (remainder === 0) return `${hours} h`;
  return `${hours} h ${remainder}`;
}

/**
 * Opens the seeded duration service by click, types `minutes`, saves by
 * click, and proves the BFF's answer and the list. Returns on the list.
 */
async function saveDurationByForm(page: Page, minutes: number, testInfo: TestInfo): Promise<void> {
  const what = `${SEED.durationServiceName} at ${minutes} min, ${testInfo.project.name}`;
  await clickForReal(
    page.getByRole("link", { name: `Editar ${SEED.durationServiceName}` }),
    `/servicos: ${SEED.durationServiceName}`,
    testInfo,
  );
  await expectPath(page, /^\/servicos\/editar$/u, what);
  await expect(
    page.locator('form input[name="name"]'),
    `${what}: the edit form did not load the service within ${CONTENT_TIMEOUT_MS}ms.`,
  ).toHaveValue(SEED.durationServiceName, { timeout: CONTENT_TIMEOUT_MS });

  const duration = page.locator('form input[name="duration"]');
  await duration.fill(String(minutes));

  // Armed before the click, so the answer cannot slip past; the `catch` keeps
  // a click that never happens from leaving a rejection nobody awaits.
  const saved = page
    .waitForResponse(
      (response) => response.request().method() === "PATCH"
        && new URL(response.url()).pathname.startsWith("/v1/services/"),
      { timeout: SAVE_TIMEOUT_MS },
    )
    .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))));
  await clickForReal(
    page.getByRole("button", { name: "Salvar alterações" }),
    "/servicos/editar: Salvar alterações",
    testInfo,
  );
  const response = await saved;
  if (response instanceof Error) {
    const refusal = await duration.evaluate(
      (input) => (input as HTMLInputElement).validationMessage,
    );
    throw new Error(
      `${what}: "Salvar alterações" was clicked and no PATCH /v1/services/:id left the browser within `
        + `${SAVE_TIMEOUT_MS}ms. The duration field's own validation says: "${refusal || "(valid)"}".`,
    );
  }
  const status = response.status();
  expect(
    status >= 200 && status < 300,
    `${what}: PATCH ${new URL(response.url()).pathname} answered ${status}, expected 2xx.`,
  ).toBe(true);

  await expectPath(page, /^\/servicos$/u, what);
  await expect(
    page.locator(".directory-row", { hasText: SEED.durationServiceName }),
    `${what}: the list does not show the saved duration.`,
  ).toContainText(expectedDurationText(minutes), { timeout: CONTENT_TIMEOUT_MS });
}

test.describe("reached by real click", () => {
  for (const reach of REACHED_BY_CLICK) {
    test(`${reach.route}: the seeded row opens its detail`, async ({ page }, testInfo) => {
      await waitForRateLimitBudget(testInfo);
      watchRateLimitBudget(page);

      const route = routeNamed(reach.route);
      await page.goto(route.path, { waitUntil: "networkidle" });
      await proveAuthenticatedScreen(page, route);

      const what = `${route.path}: ${reach.label}`;
      await clickForReal(reach.row(page), what, testInfo);
      await expectPath(page, reach.detailPath, `${what} at ${testInfo.project.name}`);
      await reach.detailLoaded(page, `${what} at ${testInfo.project.name}`);
    });
  }

  /**
   * "Criar serviço" receives the click. Nothing is created: the form is sent
   * with a name and no price, and the price rule the form enforces before any
   * request answers on screen. That answer can only exist if the submit ran,
   * so it is the proof the button was reached — and the seed stays as the
   * other measurements found it.
   */
  test("servicos: Criar serviço is reached by a real click", async ({ page }, testInfo) => {
    await waitForRateLimitBudget(testInfo);
    watchRateLimitBudget(page);

    const created: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/v1/services") {
        created.push(request.url());
      }
    });

    const route = routeNamed("servicos");
    await page.goto(route.path, { waitUntil: "networkidle" });
    await proveAuthenticatedScreen(page, route);

    await clickForReal(
      page.getByRole("link", { name: "Novo serviço" }).first(),
      "/servicos: Novo serviço",
      testInfo,
    );
    await expectPath(page, /^\/servicos\/novo$/u, `/servicos/novo at ${testInfo.project.name}`);
    const name = page.locator('form input[name="name"]');
    await expect(
      name,
      `/servicos/novo did not render its form within ${CONTENT_TIMEOUT_MS}ms.`,
    ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
    await name.fill("Serviço que o gate não grava");

    await clickForReal(
      page.getByRole("button", { name: "Criar serviço" }),
      "/servicos/novo: Criar serviço",
      testInfo,
    );
    await expect(
      page.getByRole("alert").filter({ hasText: "Informe o valor" }),
      `/servicos/novo at ${testInfo.project.name}: "Criar serviço" was clicked and the form did not `
        + "answer: the submit never ran.",
    ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
    expect(
      created,
      "the gate must not create a service: the seed is shared by every measurement",
    ).toEqual([]);
  });

  /**
   * The "Ver" link of the APPOINTMENT_CREATED event row (Goal070 §5): a real
   * click, without `force`, from the conversation's own timeline to the
   * agenda detail the confirm's ledger entry names.
   */
  test('conversas: the appointment-created event\'s "Ver" opens the agenda detail', async ({ page }, testInfo) => {
    await waitForRateLimitBudget(testInfo);
    watchRateLimitBudget(page);

    const route = routeNamed("conversas");
    await page.goto(route.path, { waitUntil: "networkidle" });
    await proveAuthenticatedScreen(page, route);

    const what = `${route.path}: ${SEED.contactName}`;
    await clickForReal(
      page.locator("a.conversation-row", { hasText: SEED.contactName }).first(),
      what,
      testInfo,
    );
    await expectPath(page, /^\/conversas\/[^/]+$/u, `${what} at ${testInfo.project.name}`);

    const ver = page.locator(".message-timeline").getByRole("link", { name: "Ver" });
    await clickForReal(ver, `${what}: Ver`, testInfo);
    // `expectPath` polls `URL.pathname`, which never carries the query string —
    // the id lives in `?id=`, so this checks the full URL instead.
    await expect
      .poll(() => page.url(), {
        message: `${what}: Ver at ${testInfo.project.name}: the click did not open `
          + `/agenda/agendamento?id=; the browser is at ${page.url()}.`,
        timeout: CONTENT_TIMEOUT_MS,
      })
      .toMatch(/\/agenda\/agendamento\?id=/u);
  });

  /**
   * A 45-minute service saves through the form (Goal058, QA SV-01): the
   * duration field accepted only 1, 6, 11…, so 45 was refused by the browser
   * with nothing on screen and no request.
   *
   * On the service the rehearsal seeds for this case alone. Then put back to
   * its seeded 60 minutes the same way — which is also the onboarding case the
   * review could not save again — so every later test finds the seed as it
   * was.
   */
  test("servicos: a 45-minute service saves through the form", async ({ page }, testInfo) => {
    await waitForRateLimitBudget(testInfo);
    watchRateLimitBudget(page);

    const route = routeNamed("servicos");
    await page.goto(route.path, { waitUntil: "networkidle" });
    await proveAuthenticatedScreen(page, route);

    await saveDurationByForm(page, 45, testInfo);
    await saveDurationByForm(page, SEED.durationServiceMinutes, testInfo);
  });

  /**
   * The Home bell (Goal077 §5, NT-01). On a phone it still leads to the
   * central on its own screen. From 768px on it opens the notifications
   * drawer over the Home, without navigating: measured open for overflow and
   * for the touch targets inside it (and the bell), then closed by Escape,
   * with focus back on the bell.
   */
  test("inicio: the bell opens the notifications", async ({ page }, testInfo) => {
    await waitForRateLimitBudget(testInfo);
    watchRateLimitBudget(page);

    const route = routeNamed("inicio");
    await page.goto(route.path, { waitUntil: "networkidle" });
    await proveAuthenticatedScreen(page, route);

    const where = `/inicio at ${testInfo.project.name}`;
    const width = page.viewportSize()?.width ?? 0;
    if (width < 768) {
      await clickForReal(page.locator("a.home-bell"), `${where}: the bell`, testInfo);
      await expectPath(page, /^\/notificacoes$/u, `${where}: the bell`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Central de notificações" }),
        `${where}: the bell did not open the central on its own screen.`,
      ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
      return;
    }

    const bell = page.locator("button.home-bell");
    await clickForReal(bell, `${where}: the bell`, testInfo);
    const drawer = page.getByRole("dialog", { name: "Notificações" });
    await expect(
      drawer,
      `${where}: the bell did not open the notifications drawer.`,
    ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
    await expect(
      drawer.getByRole("link", { name: "Preferências de notificação" }),
      `${where}: the drawer has no way to the preferences.`,
    ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
    expect(new URL(page.url()).pathname, `${where}: opening the drawer navigated.`).toBe("/inicio");

    const overflow = await measureOverflow(page);
    await testInfo.attach("overflow-notifications-drawer", {
      body: JSON.stringify(overflow, null, 2),
      contentType: "application/json",
    });
    expect
      .soft(
        overflow.scrollWidth,
        `horizontal scroll with the drawer open at ${testInfo.project.name}: `
          + `${overflow.scrollWidth}px of content in ${overflow.clientWidth}px.\nFirst offenders: `
          + JSON.stringify(overflow.offenders, null, 2),
      )
      .toBeLessThanOrEqual(overflow.clientWidth + OVERFLOW_TOLERANCE);

    // The drawer's own controls and the bell: the rest of the Home is measured
    // by the route's own test, at the widths where it applies.
    const drawerControls = await drawer.evaluate((panel) =>
      Array.from(
        panel.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea'),
      ).map((element) => element.outerHTML.slice(0, 160)),
    );
    const bellHtml = await bell.evaluate((element) => element.outerHTML.slice(0, 160));
    const measured = (await measureTouchTargets(page)).filter(
      (control) => drawerControls.includes(control.html) || control.html === bellHtml,
    );
    await testInfo.attach("controls-notifications-drawer", {
      body: JSON.stringify(measured, null, 2),
      contentType: "application/json",
    });
    expect
      .soft(
        measured.filter((control) => control.exempt === null).length,
        `${where}: no touch-target controls measured in the drawer`,
      )
      .toBeGreaterThan(1);
    const belowAA = measured.filter(
      (control) => control.exempt === null
        && (control.w < TOUCH_TARGET_AA || control.h < TOUCH_TARGET_AA),
    );
    expect
      .soft(
        belowAA,
        `controls below the WCAG 2.5.8 AA minimum of ${TOUCH_TARGET_AA}px in the drawer at `
          + `${testInfo.project.name}:\n${JSON.stringify(belowAA, null, 2)}`,
      )
      .toEqual([]);

    await page.keyboard.press("Escape");
    await expect(drawer, `${where}: Escape did not close the drawer.`).toBeHidden({
      timeout: CONTENT_TIMEOUT_MS,
    });
    await expect(bell, `${where}: focus did not return to the bell.`).toBeFocused();
    expect(new URL(page.url()).pathname, `${where}: closing the drawer navigated.`).toBe("/inicio");
  });
});

/**
 * The three navigation bands of the logged-in shell (Goal087, G-1) and what
 * the tablet's fixed bottom bar must not hide (G-2).
 *
 * The prototype has no sidebar on a tablet: below 1100px the shell shows the
 * bottom bar, from 1100px the 232px sidebar. Nothing above reads which of the
 * two is on the glass, so a tablet that kept a rail, or a desktop that kept the
 * bar, passed every other measurement. These do not weaken or replace any of
 * them: they are separate tests, run at the same five widths, with the same
 * session, and the thresholds live in `./measure.ts`.
 */
for (const routeName of ["inicio", "clientes"] as const) {
  test(`G-1 navigation band: ${routeName} shows the bar below ${SIDEBAR_BREAKPOINT}px and the sidebar from it`, async ({ page }, testInfo) => {
    await waitForRateLimitBudget(testInfo);
    watchRateLimitBudget(page);

    const route = routeNamed(routeName);
    await page.goto(route.path, { waitUntil: "networkidle" });
    await proveAuthenticatedScreen(page, route);

    const bands = await measureShellBands(page);
    await testInfo.attach(`shell-bands-${route.name}`, {
      body: JSON.stringify(bands, null, 2),
      contentType: "application/json",
    });
    const where = `${route.path} at ${testInfo.project.name} (${bands.viewportWidth}px)`;

    if (bands.viewportWidth < SIDEBAR_BREAKPOINT) {
      expect
        .soft(bands.sidebar, `${where}: aside.sidebar is rendered; below ${SIDEBAR_BREAKPOINT}px the bottom bar is the navigation.`)
        .toBeNull();
      expect
        .soft(bands.bottomNav, `${where}: the bottom bar is not rendered.`)
        .not.toBeNull();
      expect
        .soft(
          bands.bottomNav?.items,
          `${where}: the bottom bar has ${bands.bottomNav?.items ?? 0} rendered items, expected ${BOTTOM_NAV_ITEMS}.`,
        )
        .toBe(BOTTOM_NAV_ITEMS);
      expect
        .soft(bands.mobileHeaders, `${where}: a mobile brand header is rendered.`)
        .toBe(0);
    } else {
      expect
        .soft(bands.sidebar, `${where}: aside.sidebar is not rendered; from ${SIDEBAR_BREAKPOINT}px it is the navigation.`)
        .not.toBeNull();
      expect
        .soft(
          bands.sidebar?.width ?? 0,
          `${where}: aside.sidebar is ${bands.sidebar?.width ?? 0}px wide, expected ${SIDEBAR_WIDTH}px.`,
        )
        .toBeGreaterThanOrEqual(SIDEBAR_WIDTH - 1);
      expect
        .soft(
          bands.sidebar?.width ?? 0,
          `${where}: aside.sidebar is ${bands.sidebar?.width ?? 0}px wide, expected ${SIDEBAR_WIDTH}px.`,
        )
        .toBeLessThanOrEqual(SIDEBAR_WIDTH + 1);
      expect
        .soft(bands.bottomNav, `${where}: the bottom bar is rendered next to the sidebar.`)
        .toBeNull();
    }
  });
}

/**
 * Nothing behind the bar: after scrolling to the end, the last focusable
 * element inside `main` and the floating action button sit wholly above the
 * bar's top edge. At 1100px and over there is no bar, so there is nothing to
 * hide behind; the test says so instead of skipping.
 */
for (const routeName of ["clientes", "servicos"] as const) {
  test(`G-2 nothing behind the bar: ${routeName}`, async ({ page }, testInfo) => {
    await waitForRateLimitBudget(testInfo);
    watchRateLimitBudget(page);

    const route = routeNamed(routeName);
    await page.goto(route.path, { waitUntil: "networkidle" });
    await proveAuthenticatedScreen(page, route);

    const width = page.viewportSize()?.width ?? 0;
    const clearance = await measureBarClearance(page);
    await testInfo.attach(`bar-clearance-${route.name}`, {
      body: JSON.stringify(clearance, null, 2),
      contentType: "application/json",
    });
    const where = `${route.path} at ${testInfo.project.name} (${width}px)`;

    if (width >= SIDEBAR_BREAKPOINT) {
      expect(clearance.barTop, `${where}: a bottom bar is rendered next to the sidebar.`).toBeNull();
      return;
    }

    expect(clearance.barTop, `${where}: the bottom bar is not rendered, so there is nothing to measure against.`)
      .not.toBeNull();
    const barTop = clearance.barTop ?? 0;
    expect(clearance.lastFocusable, `${where}: no focusable element found inside main.`).not.toBeNull();
    const last = clearance.lastFocusable;
    if (last) {
      expect
        .soft(
          last.bottom,
          `${where}: the last focusable element in main (${last.element}) ends at y=${last.bottom}, `
            + `behind the bottom bar that starts at y=${barTop}.`,
        )
        .toBeLessThanOrEqual(barTop + BAR_CLEARANCE_TOLERANCE);
    }
    if (clearance.fab) {
      expect
        .soft(
          clearance.fab.bottom,
          `${where}: the floating action button (${clearance.fab.element}) ends at y=${clearance.fab.bottom}, `
            + `behind the bottom bar that starts at y=${barTop}.`,
        )
        .toBeLessThanOrEqual(barTop + BAR_CLEARANCE_TOLERANCE);
    }
  });
}

/**
 * The sidebar covers the whole window (Goal085, G-3): its top edge is 0 and its
 * bottom edge is `window.innerHeight`, right after the load, after the window
 * grows taller without a reload, and after the content is scrolled to the end.
 * Below 1100px there is no sidebar, so there is nothing to measure; the test
 * says so instead of skipping.
 */
for (const routeName of ["servicos", "clientes"] as const) {
  test(`G-3 sidebar covers the window: ${routeName}`, async ({ page }, testInfo) => {
    await waitForRateLimitBudget(testInfo);
    watchRateLimitBudget(page);

    const route = routeNamed(routeName);
    await page.goto(route.path, { waitUntil: "networkidle" });
    await proveAuthenticatedScreen(page, route);

    const viewport = page.viewportSize();
    const width = viewport?.width ?? 0;
    const where = `${route.path} at ${testInfo.project.name} (${width}px)`;

    if (width < SIDEBAR_BREAKPOINT || !viewport) {
      const span = await measureSidebarSpan(page);
      expect(span.top, `${where}: aside.sidebar is rendered below ${SIDEBAR_BREAKPOINT}px.`).toBeNull();
      return;
    }

    const readings: Record<string, Awaited<ReturnType<typeof measureSidebarSpan>>> = {};
    const prove = async (moment: string) => {
      const span = await measureSidebarSpan(page);
      readings[moment] = span;
      expect(span.top, `${where}, ${moment}: aside.sidebar is not rendered.`).not.toBeNull();
      expect
        .soft(
          Math.abs(span.top ?? Number.POSITIVE_INFINITY),
          `${where}, ${moment}: aside.sidebar starts at y=${span.top}, expected 0.`,
        )
        .toBeLessThanOrEqual(SIDEBAR_SPAN_TOLERANCE);
      expect
        .soft(
          Math.abs((span.bottom ?? Number.POSITIVE_INFINITY) - span.innerHeight),
          `${where}, ${moment}: aside.sidebar ends at y=${span.bottom}, window height is ${span.innerHeight}.`,
        )
        .toBeLessThanOrEqual(SIDEBAR_SPAN_TOLERANCE);
    };

    await prove("after load");

    await page.setViewportSize({ width: viewport.width, height: viewport.height + 400 });
    await prove("after the window grew taller");

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await prove("after scrolling to the end");

    await testInfo.attach(`sidebar-span-${route.name}`, {
      body: JSON.stringify(readings, null, 2),
      contentType: "application/json",
    });
  });
}

/**
 * List and detail (Goal088, D-103). The three detail routes and their lists:
 * G-4 below 1024px, where the detail is a pushed screen; G-5 from 1024px, where
 * the list and the detail share the window. Each test reaches the detail the
 * way a person does: a real click on the seeded row. Each says what the other
 * band must not show instead of skipping, and costs no request beyond the two
 * screens it walks through.
 */
const WIDE_LAYOUT_BREAKPOINT = 1024;
const LIST_COLUMN_WIDTH = 380;
const LIST_COLUMN_TOLERANCE = 1;

type ListDetailCase = {
  /** The list route the test starts from and the detail it must reach. */
  list: AuthenticatedRoute["name"];
  detailPath: RegExp;
  row: (page: Page) => Locator;
  /** The text the open item in the list carries (visible text or accessible name). */
  openItem: string;
  backHref: string;
  /** A rendered proof that the detail, not only its URL, arrived. */
  detailLoaded: (page: Page, what: string) => Promise<void>;
};

const LIST_DETAIL_CASES: ListDetailCase[] = [
  {
    list: "clientes",
    detailPath: /^\/clientes\/detalhes$/u,
    row: (page) => page
      .locator('a[href^="/clientes/detalhes"]', { hasText: SEED.customerName })
      .first(),
    openItem: SEED.customerName,
    backHref: "/clientes",
    detailLoaded: async (page, what) => {
      await expect(
        page.getByRole("heading", { level: 1, name: SEED.customerName }),
        `${what}: the customer profile did not render its heading within ${CONTENT_TIMEOUT_MS}ms.`,
      ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
    },
  },
  {
    list: "servicos",
    detailPath: /^\/servicos\/editar$/u,
    row: (page) => page.getByRole("link", { name: `Editar ${SEED.serviceName}` }),
    openItem: SEED.serviceName,
    backHref: "/servicos",
    detailLoaded: async (page, what) => {
      await expect(
        page.locator('form input[name="name"]'),
        `${what}: the edit form did not load the service within ${CONTENT_TIMEOUT_MS}ms.`,
      ).toHaveValue(SEED.serviceName, { timeout: CONTENT_TIMEOUT_MS });
    },
  },
  {
    list: "configuracoes",
    detailPath: /^\/configuracoes\/negocio$/u,
    row: (page) => page.locator('a[href="/configuracoes/negocio"]').first(),
    openItem: "Negócio",
    backHref: "/configuracoes",
    detailLoaded: async (page, what) => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Negócio", exact: true }),
        `${what}: the business screen did not render its heading within ${CONTENT_TIMEOUT_MS}ms.`,
      ).toBeVisible({ timeout: CONTENT_TIMEOUT_MS });
    },
  },
];

type PushedScreenMeasure = {
  bottomNavRendered: boolean;
  fabRendered: boolean;
  frameIsPushed: boolean;
  listDetailRendered: boolean;
  innerHeight: number;
  /** The "Voltar para …" link of the pushed bar, with its box. */
  back: { href: string | null; width: number; height: number } | null;
  /** A sticky or fixed block in the lower half of `main` (S4's save bar), when there is one. */
  stickyCta: { element: string; top: number; bottom: number } | null;
  /** The last focusable element of `main` outside the sticky block, after scrolling to the end. */
  lastFocusable: { element: string; bottom: number } | null;
};

async function measurePushedScreen(page: Page): Promise<PushedScreenMeasure> {
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

    const main = document.querySelector<HTMLElement>("main#main-content");
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    if (main) main.scrollTo({ top: main.scrollHeight, behavior: "instant" });

    const sticky = main
      ? Array.from(main.querySelectorAll("*")).find((el) => {
        const position = getComputedStyle(el).position;
        return (position === "sticky" || position === "fixed")
          && isRendered(el)
          && el.getBoundingClientRect().top > window.innerHeight / 2
          && el.querySelector("button, a[href]") !== null;
      })
      : undefined;
    const focusable = main
      ? Array.from(
        main.querySelectorAll(
          'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), '
            + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => isRendered(el) && !(sticky && sticky.contains(el)))
      : [];
    const last = focusable.at(-1);
    const back = Array.from(document.querySelectorAll("a[href]")).find(
      (el) => isRendered(el) && /^Voltar para /u.test(el.getAttribute("aria-label") ?? ""),
    );
    const backBox = back?.getBoundingClientRect();
    const stickyBox = sticky?.getBoundingClientRect();
    return {
      bottomNavRendered: Array.from(document.querySelectorAll('nav[class$="-bottom-nav"]')).some(isRendered),
      fabRendered: Array.from(document.querySelectorAll("a.fab")).some(isRendered),
      frameIsPushed: document.querySelector(".app-frame.is-pushed") !== null,
      listDetailRendered: document.querySelector(".list-detail") !== null,
      innerHeight: window.innerHeight,
      back: back && backBox
        ? { href: back.getAttribute("href"), width: backBox.width, height: backBox.height }
        : null,
      stickyCta: sticky && stickyBox
        ? { element: describe(sticky), top: stickyBox.top, bottom: stickyBox.bottom }
        : null,
      lastFocusable: last ? { element: describe(last), bottom: last.getBoundingClientRect().bottom } : null,
    };
  });
}

type ColumnBox = { left: number; right: number; top: number; bottom: number; width: number };

type ListDetailBoxes = {
  list: ColumnBox | null;
  panel: ColumnBox | null;
  openItems: string[];
};

async function measureListDetail(page: Page): Promise<ListDetailBoxes> {
  return page.evaluate(() => {
    const read = (el: Element | null) => {
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
    };
    const list = document.querySelector(".list-detail > .list-detail-list");
    const panel = document.querySelector(".list-detail > .list-detail-panel");
    return {
      list: read(list),
      panel: read(panel),
      openItems: list
        ? Array.from(list.querySelectorAll('[aria-current="page"]')).map(
          (el) => `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.trim(),
        )
        : [],
    };
  });
}

async function openListDetail(
  page: Page,
  testInfo: TestInfo,
  scenario: ListDetailCase,
): Promise<{ where: string }> {
  await waitForRateLimitBudget(testInfo);
  watchRateLimitBudget(page);

  const route = routeNamed(scenario.list);
  await page.goto(route.path, { waitUntil: "networkidle" });
  await proveAuthenticatedScreen(page, route);

  const width = page.viewportSize()?.width ?? 0;
  const what = `${route.path}: the seeded row`;
  await clickForReal(scenario.row(page), what, testInfo);
  await expectPath(page, scenario.detailPath, `${what} at ${testInfo.project.name}`);
  await scenario.detailLoaded(page, `${what} at ${testInfo.project.name}`);
  return { where: `${route.path} to ${scenario.detailPath.source} at ${testInfo.project.name} (${width}px)` };
}

for (const scenario of LIST_DETAIL_CASES) {
  test(`G-4 pushed screen below ${WIDE_LAYOUT_BREAKPOINT}px: ${scenario.list} detail`, async ({ page }, testInfo) => {
    const { where } = await openListDetail(page, testInfo, scenario);
    const width = page.viewportSize()?.width ?? 0;
    const screen = await measurePushedScreen(page);
    await testInfo.attach(`pushed-screen-${scenario.list}`, {
      body: JSON.stringify(screen, null, 2),
      contentType: "application/json",
    });

    if (width >= WIDE_LAYOUT_BREAKPOINT) {
      expect(screen.frameIsPushed, `${where}: the shell hides its bars from ${WIDE_LAYOUT_BREAKPOINT}px, where the list sits beside the detail.`)
        .toBe(false);
      return;
    }

    expect.soft(screen.listDetailRendered, `${where}: a list is mounted beside the detail below ${WIDE_LAYOUT_BREAKPOINT}px.`)
      .toBe(false);
    expect.soft(screen.frameIsPushed, `${where}: the shell did not mark the pushed screen.`).toBe(true);
    expect.soft(screen.bottomNavRendered, `${where}: the bottom bar is rendered on a pushed screen.`).toBe(false);
    expect.soft(screen.fabRendered, `${where}: the floating action button is rendered on a pushed screen.`).toBe(false);

    expect(screen.back, `${where}: the pushed bar has no "Voltar para …" link.`).not.toBeNull();
    if (screen.back) {
      expect.soft(screen.back.href, `${where}: the back link goes to ${screen.back.href}.`).toBe(scenario.backHref);
      expect
        .soft(
          Math.min(screen.back.width, screen.back.height),
          `${where}: the back link is ${screen.back.width}x${screen.back.height}px, below the WCAG 2.5.8 AA minimum of ${TOUCH_TARGET_AA}px.`,
        )
        .toBeGreaterThanOrEqual(TOUCH_TARGET_AA);
    }

    // The last control outside the sticky save bar must end above it; with no
    // sticky bar it must end inside the window, since no bar hides it.
    expect(screen.lastFocusable, `${where}: no focusable element found inside main.`).not.toBeNull();
    if (screen.lastFocusable) {
      const limit = screen.stickyCta?.top ?? screen.innerHeight;
      const against = screen.stickyCta
        ? `behind the fixed save bar (${screen.stickyCta.element}) that starts at y=${screen.stickyCta.top}`
        : `past the window's ${screen.innerHeight}px`;
      expect
        .soft(
          screen.lastFocusable.bottom,
          `${where}: the last focusable element in main (${screen.lastFocusable.element}) ends at y=${screen.lastFocusable.bottom}, ${against}.`,
        )
        .toBeLessThanOrEqual(limit + BAR_CLEARANCE_TOLERANCE);
    }
    if (screen.stickyCta) {
      expect
        .soft(
          screen.stickyCta.bottom,
          `${where}: the save bar (${screen.stickyCta.element}) ends at y=${screen.stickyCta.bottom}, below the window's ${screen.innerHeight}px.`,
        )
        .toBeLessThanOrEqual(screen.innerHeight + BAR_CLEARANCE_TOLERANCE);
    }
  });

  test(`G-5 list beside detail from ${WIDE_LAYOUT_BREAKPOINT}px: ${scenario.list} detail`, async ({ page }, testInfo) => {
    const { where } = await openListDetail(page, testInfo, scenario);
    const width = page.viewportSize()?.width ?? 0;
    const boxes = await measureListDetail(page);
    await testInfo.attach(`list-detail-${scenario.list}`, {
      body: JSON.stringify(boxes, null, 2),
      contentType: "application/json",
    });

    if (width < WIDE_LAYOUT_BREAKPOINT) {
      expect(boxes.list, `${where}: a list is mounted beside the detail below ${WIDE_LAYOUT_BREAKPOINT}px.`).toBeNull();
      return;
    }

    expect(boxes.list, `${where}: the list column is not rendered.`).not.toBeNull();
    expect(boxes.panel, `${where}: the detail panel is not rendered.`).not.toBeNull();
    if (!boxes.list || !boxes.panel) return;

    expect
      .soft(
        Math.abs(boxes.list.width - LIST_COLUMN_WIDTH),
        `${where}: the list column is ${boxes.list.width}px wide, expected ${LIST_COLUMN_WIDTH}px.`,
      )
      .toBeLessThanOrEqual(LIST_COLUMN_TOLERANCE);
    expect
      .soft(
        boxes.panel.left,
        `${where}: the detail starts at x=${boxes.panel.left}, over the list that ends at x=${boxes.list.right}.`,
      )
      .toBeGreaterThanOrEqual(boxes.list.right - LIST_COLUMN_TOLERANCE);
    expect
      .soft(
        Math.min(boxes.list.bottom, boxes.panel.bottom) - Math.max(boxes.list.top, boxes.panel.top),
        `${where}: the list and the detail do not share a row of the window.`,
      )
      .toBeGreaterThan(0);

    expect
      .soft(boxes.openItems, `${where}: expected exactly one open item (aria-current="page") in the list.`)
      .toHaveLength(1);
    expect
      .soft(
        boxes.openItems[0] ?? "",
        `${where}: the open item is "${boxes.openItems[0] ?? ""}", expected one carrying "${scenario.openItem}".`,
      )
      .toContain(scenario.openItem);
  });
}

/**
 * The onboarding frame (Goal089, G-6). Below 1024px there is no sidebar: the
 * column has the progress bar and "Sair" on top, and its primary action is
 * anchored at the bottom of the window. From 1024px there is no top bar: the
 * sidebar is as tall as the window (340px, 420px from 1366px) and the column
 * beside it is 560px (600px from 1366px). Nothing above reads which of the two
 * is on the glass. Separate tests, same five widths, same second account
 * (`onboardingTest`), no change to any other measurement or to `./routes`.
 */
const ONBOARDING_FRAME_BREAKPOINT = 1024;
const ONBOARDING_FRAME_WIDE_BREAKPOINT = 1366;
const ONBOARDING_FRAME_TOLERANCE = 1;
const ONBOARDING_FRAME_PATHS = ["/onboarding/segmento-e-nome", "/onboarding/tom-da-ia"] as const;

type OnboardingFrameMeasure = {
  innerWidth: number;
  innerHeight: number;
  sidebar: { top: number; bottom: number; width: number } | null;
  column: { width: number } | null;
  progressRendered: boolean;
  exit: { width: number; height: number } | null;
  primary: { top: number; bottom: number } | null;
  /** Rendered `header` elements flush with the top of the window and as wide as it. */
  topBars: string[];
  visibleBrands: number;
  brandsInSidebar: number;
};

async function measureOnboardingFrame(page: Page): Promise<OnboardingFrameMeasure> {
  return page.evaluate(() => {
    const isRendered = (el: Element): boolean => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && box.width > 0
        && box.height > 0;
    };
    const rendered = (selector: string): HTMLElement | null =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isRendered) ?? null;

    const sidebar = rendered('nav[aria-label="Configuração inicial"]');
    const sidebarBox = sidebar?.getBoundingClientRect() ?? null;
    const column = rendered(".onboarding-column");
    const exit = Array.from(document.querySelectorAll<HTMLElement>("button"))
      .filter(isRendered)
      .find((button) => button.textContent?.trim() === "Sair") ?? null;
    const exitBox = exit?.getBoundingClientRect() ?? null;
    const primary = rendered(".onboarding-actions .btn-primary");
    const primaryBox = primary?.getBoundingClientRect() ?? null;
    const brands = Array.from(document.querySelectorAll<HTMLElement>("a.brand")).filter(isRendered);

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      sidebar: sidebarBox ? { top: sidebarBox.top, bottom: sidebarBox.bottom, width: sidebarBox.width } : null,
      column: column ? { width: column.getBoundingClientRect().width } : null,
      progressRendered: rendered('[role="group"][aria-label="Progresso da configuração inicial"]') !== null,
      exit: exitBox ? { width: exitBox.width, height: exitBox.height } : null,
      primary: primaryBox ? { top: primaryBox.top, bottom: primaryBox.bottom } : null,
      topBars: Array.from(document.querySelectorAll("header"))
        .filter(isRendered)
        .filter((header) => {
          const box = header.getBoundingClientRect();
          return box.top <= 1 && box.width >= window.innerWidth - 1;
        })
        .map((header) => `header.${header.className}`),
      visibleBrands: brands.length,
      brandsInSidebar: sidebar ? brands.filter((brand) => sidebar.contains(brand)).length : 0,
    };
  });
}

type OnboardingScrollEnd = {
  actionsTop: number | null;
  lastFocusable: { element: string; top: number; bottom: number } | null;
};

/** Scrolls the step's content to its end, then reads its last focusable element against the actions. */
async function measureOnboardingScrollEnd(page: Page): Promise<OnboardingScrollEnd> {
  return page.evaluate(() => {
    const isRendered = (el: Element): boolean => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && box.width > 0
        && box.height > 0;
    };
    const content = document.querySelector<HTMLElement>(".onboarding-content");
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    if (content) content.scrollTo({ top: content.scrollHeight, behavior: "instant" });
    const actions = Array.from(document.querySelectorAll<HTMLElement>(".onboarding-actions")).find(isRendered);
    const focusable = content
      ? Array.from(
        content.querySelectorAll(
          'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), '
            + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(isRendered)
      : [];
    const last = focusable.at(-1);
    const lastBox = last?.getBoundingClientRect() ?? null;
    const classes = last && typeof last.className === "string" && last.className.trim() !== ""
      ? `.${last.className.trim().split(/\s+/u).join(".")}`
      : "";
    return {
      actionsTop: actions ? actions.getBoundingClientRect().top : null,
      lastFocusable: last && lastBox
        ? { element: `${last.tagName.toLowerCase()}${classes}`, top: lastBox.top, bottom: lastBox.bottom }
        : null,
    };
  });
}

for (const stepPath of ONBOARDING_FRAME_PATHS) {
  const route = ONBOARDING_ROUTES.find((candidate) => candidate.path === stepPath);
  if (!route) throw new Error(`${stepPath} is not in ONBOARDING_ROUTES; G-6 measures the frame on it.`);

  onboardingTest(`G-6 onboarding frame: ${route.name}`, async ({ page }, testInfo) => {
    await waitForRateLimitBudget(testInfo);
    watchRateLimitBudget(page);

    await page.goto(route.path, { waitUntil: "networkidle" });
    await proveOnboardingScreen(page, route);

    const frame = await measureOnboardingFrame(page);
    await testInfo.attach(`onboarding-frame-${route.name}`, {
      body: JSON.stringify(frame, null, 2),
      contentType: "application/json",
    });
    const where = `${route.path} at ${testInfo.project.name} (${frame.innerWidth}px)`;

    if (frame.innerWidth < ONBOARDING_FRAME_BREAKPOINT) {
      expect
        .soft(frame.sidebar, `${where}: the "Configuração inicial" sidebar is rendered below ${ONBOARDING_FRAME_BREAKPOINT}px.`)
        .toBeNull();
      expect
        .soft(frame.progressRendered, `${where}: the progress bar is not rendered below ${ONBOARDING_FRAME_BREAKPOINT}px.`)
        .toBe(true);
      expect(frame.exit, `${where}: "Sair" is not rendered.`).not.toBeNull();
      if (frame.exit) {
        expect
          .soft(
            Math.min(frame.exit.width, frame.exit.height),
            `${where}: "Sair" is ${frame.exit.width}x${frame.exit.height}px, below the WCAG 2.5.8 AA minimum of ${TOUCH_TARGET_AA}px.`,
          )
          .toBeGreaterThanOrEqual(TOUCH_TARGET_AA);
      }

      expect(frame.primary, `${where}: the primary action is not rendered.`).not.toBeNull();
      if (frame.primary) {
        expect
          .soft(
            frame.primary.top,
            `${where}: the primary action starts at y=${frame.primary.top}, above the window.`,
          )
          .toBeGreaterThanOrEqual(0);
        expect
          .soft(
            frame.primary.bottom,
            `${where}: the primary action ends at y=${frame.primary.bottom}, past the window's ${frame.innerHeight}px on opening.`,
          )
          .toBeLessThanOrEqual(frame.innerHeight + ONBOARDING_FRAME_TOLERANCE);
      }

      const end = await measureOnboardingScrollEnd(page);
      await testInfo.attach(`onboarding-scroll-end-${route.name}`, {
        body: JSON.stringify(end, null, 2),
        contentType: "application/json",
      });
      expect(end.actionsTop, `${where}: the actions are not rendered.`).not.toBeNull();
      expect(end.lastFocusable, `${where}: no focusable element found in the step's content.`).not.toBeNull();
      if (end.actionsTop !== null && end.lastFocusable) {
        expect
          .soft(
            end.lastFocusable.bottom,
            `${where}: after scrolling to the end, the last focusable element (${end.lastFocusable.element}) `
              + `ends at y=${end.lastFocusable.bottom}, behind the actions that start at y=${end.actionsTop}.`,
          )
          .toBeLessThanOrEqual(end.actionsTop + BAR_CLEARANCE_TOLERANCE);
      }
      return;
    }

    const wide = frame.innerWidth >= ONBOARDING_FRAME_WIDE_BREAKPOINT;
    const sidebarWidth = wide ? 420 : 340;
    const columnWidth = wide ? 600 : 560;

    expect
      .soft(frame.progressRendered, `${where}: the progress bar is rendered from ${ONBOARDING_FRAME_BREAKPOINT}px.`)
      .toBe(false);
    expect
      .soft(frame.topBars, `${where}: a top bar is rendered from ${ONBOARDING_FRAME_BREAKPOINT}px.`)
      .toEqual([]);
    expect
      .soft(frame.visibleBrands, `${where}: the brand is rendered ${frame.visibleBrands} times, expected once, inside the sidebar.`)
      .toBe(1);
    expect
      .soft(frame.brandsInSidebar, `${where}: the brand is not inside the sidebar.`)
      .toBe(1);

    expect(frame.sidebar, `${where}: the "Configuração inicial" sidebar is not rendered.`).not.toBeNull();
    if (frame.sidebar) {
      expect
        .soft(
          Math.abs(frame.sidebar.top),
          `${where}: the sidebar starts at y=${frame.sidebar.top}, expected 0.`,
        )
        .toBeLessThanOrEqual(ONBOARDING_FRAME_TOLERANCE);
      expect
        .soft(
          Math.abs(frame.sidebar.bottom - frame.innerHeight),
          `${where}: the sidebar ends at y=${frame.sidebar.bottom}, window height is ${frame.innerHeight}.`,
        )
        .toBeLessThanOrEqual(ONBOARDING_FRAME_TOLERANCE);
      expect
        .soft(
          Math.abs(frame.sidebar.width - sidebarWidth),
          `${where}: the sidebar is ${frame.sidebar.width}px wide, expected ${sidebarWidth}px.`,
        )
        .toBeLessThanOrEqual(ONBOARDING_FRAME_TOLERANCE);
    }

    expect(frame.column, `${where}: the step's column is not rendered.`).not.toBeNull();
    if (frame.column) {
      expect
        .soft(
          Math.abs(frame.column.width - columnWidth),
          `${where}: the column is ${frame.column.width}px wide, expected ${columnWidth}px.`,
        )
        .toBeLessThanOrEqual(ONBOARDING_FRAME_TOLERANCE);
    }
  });
}
