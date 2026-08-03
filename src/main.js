import { createApp } from "vue";
import "./fluent/registerFluentComponents.js";
import { DEFAULT_LOCALE } from "./i18n/locale.js";
import { translateMessage } from "./i18n/catalogs.js";
import { createLocalization } from "./i18n/localization.js";
import { shouldMountMotionLab } from "./motionLab/motionLabGate.js";
import { localeRuntimePort } from "./platform/launchpadPorts.js";

const search = typeof window === "undefined" ? "" : window.location.search;
const loadApp = import.meta.env.DEV && shouldMountMotionLab(search, true)
  ? () => import("./motionLab/MotionLabApp.vue")
  : () => import("./App.vue");

function renderBootstrapFailure(error) {
  console.error("[i18n-bootstrap-failed]", error);
  const root = typeof document === "undefined" ? null : document.querySelector("#app");
  if (!root) return;
  const title = document.createElement("h1");
  title.textContent = translateMessage(DEFAULT_LOCALE, "errors.bootstrap.title");
  const message = document.createElement("p");
  message.textContent = translateMessage(DEFAULT_LOCALE, "errors.bootstrap.message");
  root.replaceChildren(title, message);
}

async function mountApp() {
  const localeOutcome = await localeRuntimePort.bootstrap();
  if (!localeOutcome.ok) throw localeOutcome.error;
  const localization = createLocalization(localeOutcome.state);
  const appModule = await loadApp();
  const app = createApp(appModule.default);
  app.use(localization.plugin);
  app.mount("#app");
}

mountApp().catch(renderBootstrapFailure);
