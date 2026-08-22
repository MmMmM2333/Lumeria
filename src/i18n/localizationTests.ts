import { createLocalization } from "./localization.js";
import type { LocaleState, SupportedLocale } from "./locale.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[Localization test failed] ${message}`);
}

function state(preference: string, resolvedLocale: SupportedLocale): LocaleState {
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
  assert(String(localization.text.resolvedLocale.value) === "en-US", "initial locale should be observable through a readonly ref");

  localization.activate(state("zh-CN", "zh-CN"));
  assert(localization.text.t("common.actions.cancel") === "取消", "activation should update translations in the current session");
  assert(String(localization.text.resolvedLocale.value) === "zh-CN", "activation should update the observable resolved locale");

  let missingError: unknown = null;
  try {
    localization.text.t("missing.ui.key");
  } catch (error) {
    missingError = error;
  }
  assert(
    missingError instanceof Error && "code" in missingError && missingError.code === "i18nMessageMissing",
    "development translation should fail explicitly for missing keys",
  );
}
