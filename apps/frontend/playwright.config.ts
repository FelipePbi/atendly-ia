import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  outputDir: "../../artifacts/whatsapp-pairing/playwright",
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: "node e2e/fake-evolution.mjs",
      url: "http://127.0.0.1:18080/health",
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: "node e2e/start-service.mjs bff",
      url: "http://127.0.0.1:3102/health",
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: "node e2e/start-service.mjs frontend",
      url: "http://127.0.0.1:3101/login",
      reuseExistingServer: false,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: "mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } }
    },
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } }
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } }
    },
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
    }
  ]
});
