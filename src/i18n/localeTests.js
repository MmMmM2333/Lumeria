import {
  DEFAULT_LOCALE,
  DEFAULT_LOCALE_PREFERENCE,
  normalizeLocalePreference,
  resolveLocalePreference,
} from "./locale.js";

function assert(condition, message) {
  if (!condition) throw new Error(`[Locale test failed] ${message}`);
}

export function runLocaleTests() {
  assert(DEFAULT_LOCALE === "zh-CN", "the existing Chinese product language should remain the default locale");
  assert(DEFAULT_LOCALE_PREFERENCE === "system", "new and legacy layouts should follow the system by default");
  assert(normalizeLocalePreference(null) === "system", "a missing persisted preference should migrate to system");

  const explicitEnglish = resolveLocalePreference("en-US", ["zh-CN"]);
  assert(explicitEnglish.resolvedLocale === "en-US", "an explicit supported locale should win over system languages");
  assert(explicitEnglish.match === "explicit", "an explicit supported locale should report its match source");
  assert(explicitEnglish.issue === null, "an explicit supported locale should not report an issue");

  const britishEnglishSystem = resolveLocalePreference("system", ["fr-FR", "en-GB"]);
  assert(britishEnglishSystem.resolvedLocale === "en-US", "an English system language should resolve to the bundled English catalog");
  assert(britishEnglishSystem.match === "language", "a regional English alias should report a language match");

  const simplifiedChineseSystem = resolveLocalePreference("system", ["zh-Hans-SG"]);
  assert(simplifiedChineseSystem.resolvedLocale === "zh-CN", "a Simplified Chinese system language should resolve to zh-CN");

  const unsupportedSystem = resolveLocalePreference("system", ["fr-FR"]);
  assert(unsupportedSystem.resolvedLocale === "zh-CN", "an unsupported system language should use the documented product default");
  assert(unsupportedSystem.match === "default", "an unsupported system language should report a default match");
  assert(unsupportedSystem.issue === null, "an unsupported system language is an expected fallback, not corrupt persisted state");

  const unsupportedPreference = resolveLocalePreference("fr-FR", ["en-US"]);
  assert(unsupportedPreference.preference === "fr-FR", "an unsupported persisted preference should remain observable to the user");
  assert(unsupportedPreference.resolvedLocale === "zh-CN", "an unsupported persisted preference should render with the documented default");
  assert(unsupportedPreference.issue?.code === "unsupportedPreference", "an unsupported persisted preference should be explicit");
}
