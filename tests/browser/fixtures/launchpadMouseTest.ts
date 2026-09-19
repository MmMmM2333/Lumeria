import { expect, test as base } from "@playwright/test";
import type {
  ConsoleMessage,
  Page,
  PlaywrightTestArgs,
  TestFixture,
  TestInfo,
} from "@playwright/test";

// Browser-only Launchpad test fixture for the retained reference host.
//
// The Playwright WebView2 CDP entry (`LUMERIA_WEBVIEW_CDP_ENDPOINT` plus
// `playwright.webview.config.ts`) was retired together with the product entry:
// these specs now always drive the Chromium page served by the Vite dev server
// at /tests/browser/reference/index.html. Failed-run evidence (console output
// and a screenshot) is kept so browser runs stay diagnosable.

interface LaunchpadTestFixtures {
  appPage: Page;
}

interface PageDiagnosticsOptions {
  readonly restoreUrl?: string;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}

async function usePageWithDiagnostics(
  page: Page,
  use: (page: Page) => Promise<void>,
  testInfo: TestInfo,
  options: PageDiagnosticsOptions = {},
): Promise<void> {
  const consoleProblems: string[] = [];
  const teardownProblems: string[] = [];
  const onConsole = (message: ConsoleMessage): void => {
    if (message.type() === "error") consoleProblems.push(`console.error: ${message.text()}`);
  };
  const onPageError = (error: Error): void => {
    consoleProblems.push(`pageerror: ${error.stack || error.message}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    await use(page);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
      try {
        await testInfo.attach("browser-failure", {
          body: await page.screenshot({ type: "png" }),
          contentType: "image/png",
        });
      } catch (error: unknown) {
        testInfo.annotations.push({
          description: describeError(error),
          type: "browser-screenshot-failed",
        });
      }
    }
    if (options.restoreUrl) {
      if (page.isClosed()) {
        teardownProblems.push(`Browser page closed before ${options.restoreUrl} could be restored`);
      } else {
        try {
          await page.mouse.up();
        } catch (error: unknown) {
          teardownProblems.push(`Unable to release the browser mouse: ${describeError(error)}`);
        }
        try {
          await page.goto(options.restoreUrl, {
            timeout: 10_000,
            waitUntil: "domcontentloaded",
          });
          if (page.url() !== options.restoreUrl) {
            throw new Error(`restored URL is ${page.url()}`);
          }
        } catch (error: unknown) {
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

const browserAppPageFixture: TestFixture<Page, Pick<PlaywrightTestArgs, "page">> = async (
  { page },
  use,
  testInfo,
): Promise<void> => {
  await usePageWithDiagnostics(page, use, testInfo);
};

export const test = base.extend<LaunchpadTestFixtures>({
  appPage: browserAppPageFixture,
});

export { expect };
