import { createApp } from "vue";
import { translateMessage } from "../i18n/catalogs.js";
import {
  DEFAULT_LOCALE,
  DEFAULT_LOCALE_PREFERENCE,
  resolveLocalePreference,
} from "../i18n/locale.js";
import { createLocalization } from "../i18n/localization.js";
import MotionLabApp from "./MotionLabApp.vue";

function systemLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
  return [...languages, navigator.language].filter((value): value is string => Boolean(value));
}

function renderEntryFailure(error: unknown, messageKey = "errors.bootstrap.message"): void {
  console.error("[motion-lab-entry-failed]", error);
  const root = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("#app");
  if (!root) return;
  const title = document.createElement("h1");
  title.textContent = translateMessage(DEFAULT_LOCALE, "motionLab.title");
  const message = document.createElement("p");
  message.textContent = translateMessage(DEFAULT_LOCALE, messageKey);
  root.replaceChildren(title, message);
}

function mountMotionLab(): void {
  if (!import.meta.env.DEV) {
    renderEntryFailure(
      new Error("Motion Lab is available only in Vite development mode"),
      "debug.common.devOnly",
    );
    return;
  }
  const localization = createLocalization(resolveLocalePreference(
    DEFAULT_LOCALE_PREFERENCE,
    systemLanguages(),
  ));
  const app = createApp(MotionLabApp);
  app.use(localization.plugin);
  app.mount("#app");
}

try {
  mountMotionLab();
} catch (error) {
  renderEntryFailure(error);
}
