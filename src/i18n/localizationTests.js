import { createLocalization } from "./localization.js";

function assert(condition, message) {
  if (!condition) throw new Error(`[Localization test failed] ${message}`);
}

function state(preference, resolvedLocale) {
  return {
    preference,
    resolvedLocale,
    match: preference === "system" ? "default" : "explicit",
    issue: null,
  };
}

export function runLocalizationTests() {
  const localization = createLocalization(state("en-US", "en-US"));
  assert(localization.text.t("common.actions.cancel") === "Cancel", "initial locale should drive translated text");
  assert(localization.text.resolvedLocale.value === "en-US", "initial locale should be observable through a readonly ref");

  localization.activate(state("zh-CN", "zh-CN"));
  assert(localization.text.t("common.actions.cancel") === "取消", "activation should update translations in the current session");
  assert(localization.text.resolvedLocale.value === "zh-CN", "activation should update the observable resolved locale");

  let missingError = null;
  try {
    localization.text.t("missing.ui.key");
  } catch (error) {
    missingError = error;
  }
  assert(missingError?.code === "i18nMessageMissing", "development translation should fail explicitly for missing keys");
}
