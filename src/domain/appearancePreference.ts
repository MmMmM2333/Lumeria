export const APPEARANCE_SYSTEM = "system";
export const APPEARANCE_LIGHT = "light";
export const APPEARANCE_DARK = "dark";

export type AppearancePreference =
  | typeof APPEARANCE_SYSTEM
  | typeof APPEARANCE_LIGHT
  | typeof APPEARANCE_DARK;

export function normalizeAppearancePreference(
  value: unknown,
  fallback: unknown = APPEARANCE_DARK,
): AppearancePreference {
  if (value === APPEARANCE_SYSTEM || value === APPEARANCE_LIGHT || value === APPEARANCE_DARK) {
    return value;
  }
  if (fallback === APPEARANCE_SYSTEM || fallback === APPEARANCE_LIGHT || fallback === APPEARANCE_DARK) {
    return fallback;
  }
  return APPEARANCE_DARK;
}

export function resolveAppearancePreference(
  preference: unknown,
  systemAppearance: unknown,
  fallback: unknown = APPEARANCE_DARK,
): Exclude<AppearancePreference, typeof APPEARANCE_SYSTEM> {
  const normalizedPreference = normalizeAppearancePreference(preference, fallback);
  if (normalizedPreference !== APPEARANCE_SYSTEM) return normalizedPreference;
  return systemAppearance === APPEARANCE_LIGHT ? APPEARANCE_LIGHT : APPEARANCE_DARK;
}
