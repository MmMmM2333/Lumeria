import { createApp } from "vue";
import "../../../src/fluent/registerFluentComponents.js";
import { DEFAULT_LOCALE } from "../../../src/i18n/locale.js";
import { translateMessage } from "../../../src/i18n/catalogs.js";
import { createLocalization } from "../../../src/i18n/localization.js";
import { normalizeLaunchContext } from "../../../src/domain/launchContext.js";
import { localeRuntimePort, nativeStartupPort } from "../../../src/platform/launchpadPorts.js";

const search = typeof window === "undefined" ? "" : window.location.search;

function renderBootstrapFailure(error: unknown): void {
  console.error("[app-bootstrap-failed]", error);
  const root = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("#app");
  if (!root) return;
  const title = document.createElement("h1");
  title.textContent = translateMessage(DEFAULT_LOCALE, "errors.bootstrap.title");
  const message = document.createElement("p");
  message.textContent = translateMessage(DEFAULT_LOCALE, "errors.bootstrap.message");
  root.replaceChildren(title, message);
}

// The browser reference host only exists to exercise shared animation and
// gesture code under Vite. It is not a product entry point and never runs in a
// production build: refuse to mount outside the dev server.
function renderReferenceHostUnavailable(): void {
  const root = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("#app");
  if (!root) return;
  const title = document.createElement("h1");
  title.textContent = "Browser reference host (development only)";
  const message = document.createElement("p");
  message.textContent = [
    "This page is a browser-only reference test host for shared Launchpad",
    "animation and gesture regressions. Start it with the Vite dev server",
    "(npm run dev) and open /tests/browser/reference/index.html.",
  ].join(" ");
  root.replaceChildren(title, message);
}

async function mountApp(): Promise<void> {
  const localeOutcome = await localeRuntimePort.bootstrap();
  if (!localeOutcome.ok) throw localeOutcome.error;
  const localization = createLocalization(localeOutcome.state);
  const appModule = await import("./ReferenceApp.vue");
  const startupContext = normalizeLaunchContext(
    nativeStartupPort.isAvailable() ? await nativeStartupPort.getLaunchContext() : null,
  );
  const app = createApp(appModule.default, { startupContext });
  app.use(localization.plugin);
  app.mount("#app");
  if(import.meta.env.DEV&&new URLSearchParams(search).get("touchpadCapture")==="1"){
    const {installWebTouchpadCapture}=await import("../../../src/debug/touchpadCaptureWeb.js");installWebTouchpadCapture();
  }
}

if (import.meta.env.DEV) {
  mountApp().catch(renderBootstrapFailure);
} else {
  renderReferenceHostUnavailable();
}
