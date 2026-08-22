import { expect, test as base } from "@playwright/test";

const WEBVIEW_CDP_ENDPOINT = process.env.LUMERIA_WEBVIEW_CDP_ENDPOINT || "";
const WEBVIEW_BASE_URL = process.env.LUMERIA_WEBVIEW_BASE_URL || "";
const isWebViewRun = Boolean(WEBVIEW_CDP_ENDPOINT);

function describeError(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

async function usePageWithDiagnostics(page, use, testInfo, options = {}) {
  const consoleProblems = [];
  const teardownProblems = [];
  const onConsole = (message) => {
    if (message.type() === "error") consoleProblems.push(`console.error: ${message.text()}`);
  };
  const onPageError = (error) => consoleProblems.push(`pageerror: ${error.stack || error.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    await use(page);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    if (isWebViewRun && testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
      try {
        await testInfo.attach("webview2-failure", {
          body: await page.screenshot({ type: "png" }),
          contentType: "image/png",
        });
      } catch (error) {
        testInfo.annotations.push({
          description: describeError(error),
          type: "webview2-screenshot-failed",
        });
      }
    }
    if (options.restoreUrl) {
      if (page.isClosed()) {
        teardownProblems.push(`WebView2 page closed before ${options.restoreUrl} could be restored`);
      } else {
        try {
          await page.mouse.up();
        } catch (error) {
          teardownProblems.push(`Unable to release the WebView2 mouse: ${describeError(error)}`);
        }
        try {
          await page.goto(options.restoreUrl, {
            timeout: 10_000,
            waitUntil: "domcontentloaded",
          });
          if (page.url() !== options.restoreUrl) {
            throw new Error(`restored URL is ${page.url()}`);
          }
        } catch (error) {
          teardownProblems.push(`Unable to restore ${options.restoreUrl}: ${describeError(error)}`);
        }
      }
    }
    const problems = [...consoleProblems, ...teardownProblems];
    if (problems.length) {
      if (testInfo.status === testInfo.expectedStatus) {
        throw new Error(`Unexpected browser diagnostics:\n${problems.join("\n")}`);
      }
      testInfo.annotations.push({
        description: problems.join("\n"),
        type: "browser-cleanup-diagnostics",
      });
    }
  }
}

const appPageFixture = isWebViewRun
  ? async ({ webviewBrowser }, use, testInfo) => {
    const pages = webviewBrowser.contexts().flatMap((context) => context.pages());
    const preferredOrigin = WEBVIEW_BASE_URL ? new URL(WEBVIEW_BASE_URL).origin : null;
    const page = pages.find((candidate) => (
      preferredOrigin && candidate.url().startsWith(preferredOrigin)
    )) || pages.find((candidate) => /^https?:\/\//.test(candidate.url()));
    if (!page) {
      throw new Error(`No HTTP page is exposed by ${WEBVIEW_CDP_ENDPOINT}: ${pages.map((entry) => entry.url()).join(", ")}`);
    }
    const restoreUrl = page.url();
    await page.bringToFront();
    await usePageWithDiagnostics(page, use, testInfo, { restoreUrl });
  }
  : async ({ page }, use, testInfo) => {
    await usePageWithDiagnostics(page, use, testInfo);
  };

export const test = base.extend({
  webviewBrowser: [async ({ playwright }, use) => {
    if (!isWebViewRun) {
      await use(null);
      return;
    }
    const browser = await playwright.chromium.connectOverCDP(WEBVIEW_CDP_ENDPOINT);
    await use(browser);
    // The browser belongs to the already-running Tauri process. Let this test
    // worker exit to disconnect instead of closing the user's WebView2.
  }, { scope: "worker" }],
  appPage: appPageFixture,
});

export { expect };
