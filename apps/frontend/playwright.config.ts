import { defineConfig, devices } from "@playwright/test";

/**
 * The rendered gate.
 *
 * jsdom answers what the accessibility tree says; it has no layout and no
 * cascade, so it cannot answer whether the bottom nav is actually on screen at
 * 360px, whether anything overflows sideways, or what colour a token resolves
 * to. Those are the questions this file exists for, and they are the ones the
 * vault's mobile-first and accessibility rules are actually made of.
 *
 * Deliberately a DETERMINISTIC gate, not a tool the reviewer drives: the
 * orchestrator runs it, so it costs no model tokens, and the reviewer reads a
 * reproducible result instead of operating a browser inside an Opus call.
 * Screenshots are attached as evidence for a person, never as a pass/fail.
 */

const PORT = Number(process.env.UI_GATE_PORT ?? 3210);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * The widths the vault names, in the order it names them: mobile first, then
 * context added. Every spec runs at every width — a rule that only holds on a
 * notebook is not a rule this product keeps.
 */
export const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 740, mobile: true },
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: false },
  { name: "notebook-1024", width: 1024, height: 768, mobile: false },
  { name: "desktop-1440", width: 1440, height: 900, mobile: false },
] as const;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results/artifacts",
  // Serial by default: a shared Next server and five viewports are enough
  // concurrency. Flakiness here is expensive in a way unit flakiness is not —
  // a spurious failure costs a whole review round.
  workers: process.env.CI ? 1 : undefined,
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./e2e-results/report", open: "never" }],
    ["json", { outputFile: "./e2e-results/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Layout assertions must not race the fonts: a fallback face measures
    // differently, and a target that is 44px with Hanken Grotesk may not be
    // with whatever the OS substitutes.
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
  webServer: {
    command: "npm run start",
    env: { PORT: String(PORT) },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
