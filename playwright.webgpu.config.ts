import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  outputDir: ".codex-dev/playwright-webgpu-results",
  reporter: "line",
  testDir: "./tests/browser",
  testMatch: "pixi-filter-backends.spec.ts",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4175",
    headless: true,
    launchOptions: {
      args: [
        "--enable-unsafe-webgpu",
        "--use-webgpu-adapter=swiftshader",
        "--use-gpu-in-tests",
        "--enable-unsafe-swiftshader",
      ],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { height: 600, width: 800 },
  },
  projects: [{ name: "chromium-webgpu", use: { browserName: "chromium", channel: "chromium" } }],
  webServer: {
    command: "npm run dev:motion-lab -- --host 127.0.0.1 --port 4175 --strictPort",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:4175/tests/browser/fixtures/pixi-filter-backends.html",
  },
});
