import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "legal-registration.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  outputDir: "../../artifacts/legal-documents/playwright",
  use: {
    baseURL: "http://127.0.0.1:3201",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/fake-bff-legal.mjs",
      url: "http://127.0.0.1:18181/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node e2e/start-legal-frontend.mjs",
      url: "http://127.0.0.1:3201/cadastro",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
