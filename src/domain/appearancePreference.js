export const APPEARANCE_SYSTEM = "system";
export const APPEARANCE_LIGHT = "light";
export const APPEARANCE_DARK = "dark";

export function normalizeAppearancePreference(value, fallback = APPEARANCE_DARK) {
  if (value === APPEARANCE_SYSTEM || value === APPEARANCE_LIGHT || value === APPEARANCE_DARK) {
    return value;
  }
  if (fallback === APPEARANCE_SYSTEM || fallback === APPEARANCE_LIGHT || fallback === APPEARANCE_DARK) {
    return fallback;
  }
  return APPEARANCE_DARK;
}

export function resolveAppearancePreference(preference, systemAppearance, fallback = APPEARANCE_DARK) {
  const normalizedPreference = normalizeAppearancePreference(preference, fallback);
  if (normalizedPreference !== APPEARANCE_SYSTEM) return normalizedPreference;
  return systemAppearance === APPEARANCE_LIGHT ? APPEARANCE_LIGHT : APPEARANCE_DARK;
}
