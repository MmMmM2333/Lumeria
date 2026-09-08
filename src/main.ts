import { createApp } from "vue";
import "./fluent/registerFluentComponents.js";
import { DEFAULT_LOCALE } from "./i18n/locale.js";
import { translateMessage } from "./i18n/catalogs.js";
import { createLocalization } from "./i18n/localization.js";
import { shouldMountMotionLab } from "./motionLab/motionLabGate.js";
import { normalizeLaunchContext } from "./domain/launchContext.js";
import { localeRuntimePort, nativeStartupPort } from "./platform/launchpadPorts.js";

const search = typeof window === "undefined" ? "" : window.location.search;
const loadApp = import.meta.env.DEV && shouldMountMotionLab(search, true)
  ? () => import("./motionLab/MotionLabApp.vue")
  : () => import("./App.vue");

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

async function mountApp(): Promise<void> {
  const localeOutcome = await localeRuntimePort.bootstrap();
  if (!localeOutcome.ok) throw localeOutcome.error;
  const localization = createLocalization(localeOutcome.state);
  const appModule = await loadApp();
  const startupContext = normalizeLaunchContext(
    nativeStartupPort.isAvailable() ? await nativeStartupPort.getLaunchContext() : null,
  );
  const app = createApp(appModule.default, { startupContext });
  app.use(localization.plugin);
  app.mount("#app");
  if(import.meta.env.DEV&&new URLSearchParams(search).get("touchpadCapture")==="1"){
    const {installWebTouchpadCapture}=await import("./debug/touchpadCaptureWeb.js");installWebTouchpadCapture();
  }
}

mountApp().catch(renderBootstrapFailure);
