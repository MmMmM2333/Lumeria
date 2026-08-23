import {
  APPEARANCE_DARK,
  APPEARANCE_LIGHT,
  APPEARANCE_SYSTEM,
  normalizeAppearancePreference,
  resolveAppearancePreference,
} from "./appearancePreference.js";

export function runAppearancePreferenceTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Appearance preference test failed] ${message}`);
  };

  assert(normalizeAppearancePreference(APPEARANCE_SYSTEM) === APPEARANCE_SYSTEM, "system should be a valid preference");
  assert(normalizeAppearancePreference(APPEARANCE_LIGHT) === APPEARANCE_LIGHT, "light should be a valid preference");
  assert(normalizeAppearancePreference(APPEARANCE_DARK) === APPEARANCE_DARK, "dark should be a valid preference");
  assert(normalizeAppearancePreference("unexpected") === APPEARANCE_DARK, "dark should be the default fallback");
  assert(
    normalizeAppearancePreference("unexpected", APPEARANCE_SYSTEM) === APPEARANCE_SYSTEM,
    "callers should be able to preserve a system-default setting",
  );
  assert(resolveAppearancePreference(APPEARANCE_LIGHT, APPEARANCE_DARK) === APPEARANCE_LIGHT, "explicit light should win");
  assert(resolveAppearancePreference(APPEARANCE_DARK, APPEARANCE_LIGHT) === APPEARANCE_DARK, "explicit dark should win");
  assert(resolveAppearancePreference(APPEARANCE_SYSTEM, APPEARANCE_LIGHT) === APPEARANCE_LIGHT, "system should resolve to light");
  assert(resolveAppearancePreference(APPEARANCE_SYSTEM, APPEARANCE_DARK) === APPEARANCE_DARK, "system should resolve to dark");
  assert(
    resolveAppearancePreference(APPEARANCE_SYSTEM, "unexpected") === APPEARANCE_DARK,
    "unknown system appearances should resolve safely to dark",
  );
}
