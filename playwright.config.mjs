import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: ".codex-dev/playwright-results",
  reporter: "line",
  retries: 0,
  testDir: "./tests/browser",
  timeout: 20_000,
  use: {
    baseURL: "http://127.0.0.1:4175",
    deviceScaleFactor: 1,
    headless: true,
    viewport: { height: 600, width: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4175 --strictPort",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4175/tests/browser/fixtures/pixi-drag-preview-mask-batch.html",
  },
});
