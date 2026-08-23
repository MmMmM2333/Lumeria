import { defineConfig } from "@playwright/test";

process.env.LUMERIA_WEBVIEW_CDP_ENDPOINT ||= "http://127.0.0.1:9222";

export default defineConfig({
  expect: { timeout: 6_000 },
  forbidOnly: true,
  fullyParallel: false,
  grep: /@webview/,
  outputDir: ".codex-dev/playwright-webview-results",
  reporter: "line",
  retries: 0,
  testDir: "./tests/browser",
  timeout: 45_000,
  workers: 1,
  projects: [
    {
      name: "webview2-9222",
    },
  ],
});
