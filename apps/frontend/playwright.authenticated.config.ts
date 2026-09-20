import { defineConfig, devices } from "@playwright/test";

import { VIEWPORTS } from "./playwright.config";

/**
 * The rendered gate, with a session (Goal033, A-02).
 *
 * The public gate (`playwright.config.ts`) starts its own `npm run start` and
 * measures seven routes that need nobody logged in. This one measures the
 * screens where the product actually lives, and those need a tenant with real
 * data behind them — so it does NOT start a server: it is pointed at the one
 * `scripts/goal033-authenticated-ui-rehearsal.mjs` already built and served,
 * with `NEXT_PUBLIC_BFF_URL` baked in and the business seeded through the
 * product's own routes.
 *
 * The widths are imported, never redeclared: a second copy of the matrix is a
 * second matrix, and the two would drift.
 */

const BASE_URL = process.env.GOAL033_GATE_BASE_URL?.trim();
if (!BASE_URL) {
  // No default, and no skip: a gate that quietly measures `localhost:3000`
  // would report on whatever happened to be running there.
  throw new Error(
    "GOAL033_GATE_BASE_URL is not set. This configuration measures the AUTHENTICATED screens against a stack that is already up; run `node scripts/goal033-authenticated-ui-rehearsal.mjs`, which boots it and sets this variable.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  // Only the authenticated spec: the public specs in this directory have no
  // session and their own configuration already runs them.
  testMatch: /authenticated-matrix\.spec\.ts$/,
  outputDir: "./e2e-results/authenticated/artifacts",
  // One worker, always: every test signs in through the form against one
  // seeded tenant, and parallel sessions on the same account would measure
  // each other's side effects.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  // A single test signs in, proves the route, waits for the screen's own
  // content and then takes all five measurements — including one reload under
  // `prefers-reduced-motion`. That is a lot for the default 30s.
  timeout: 180_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./e2e-results/authenticated/report", open: "never" }],
    ["json", { outputFile: "./e2e-results/authenticated/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Same reason as the public gate: a fallback font measures differently,
    // and these are layout assertions.
    launchOptions: { args: ["--font-render-hinting=none"] },
  },
  projects: VIEWPORTS.map((viewport) => ({
    name: viewport.name,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: false,
      hasTouch: viewport.mobile,
    },
  })),
});
