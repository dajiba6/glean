import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHROMIUM ? undefined : "chrome",
    baseURL: "http://127.0.0.1:43137",
    viewport: { width: 1360, height: 960 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx tests/serve-e2e.ts",
    url: "http://127.0.0.1:43137/reader/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
