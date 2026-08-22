export const DEFAULT_LOCALE = "zh-CN";
export const DEFAULT_LOCALE_PREFERENCE = "system";
export const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "en-US"] as const);

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleMatch = "default" | "exact" | "explicit" | "language";
export type LocaleIssue = Readonly<{ code: "unsupportedPreference"; value: string }>;
export type LocaleState = Readonly<{
  preference: string;
  resolvedLocale: SupportedLocale;
  match: LocaleMatch;
  issue: LocaleIssue | null;
}>;

const SUPPORTED_LOCALE_BY_LOWERCASE = new Map(
  SUPPORTED_LOCALES.map((locale) => [locale.toLowerCase(), locale])
);

export function normalizeLocalePreference(value: unknown): string {
  if (value === null || value === undefined) return DEFAULT_LOCALE_PREFERENCE;
  const normalized = String(value).trim();
  if (!normalized) return DEFAULT_LOCALE_PREFERENCE;
  if (normalized.toLowerCase() === DEFAULT_LOCALE_PREFERENCE) return DEFAULT_LOCALE_PREFERENCE;
  return SUPPORTED_LOCALE_BY_LOWERCASE.get(normalized.toLowerCase()) || normalized;
}

function normalizeLanguageTag(value: unknown): string {
  return String(value || "").trim().replaceAll("_", "-");
}

function matchSystemLanguage(value: unknown): Readonly<{
  locale: SupportedLocale;
  match: "exact" | "language";
}> | null {
  const normalized = normalizeLanguageTag(value);
  if (!normalized) return null;
  const exact = SUPPORTED_LOCALE_BY_LOWERCASE.get(normalized.toLowerCase());
  if (exact) return { locale: exact, match: "exact" };

  const parts = normalized.toLowerCase().split("-");
  if (parts[0] === "en") return { locale: "en-US", match: "language" };
  if (parts[0] !== "zh") return null;
  if (parts.length === 1 || parts.includes("hans") || parts.includes("cn") || parts.includes("sg")) {
    return { locale: "zh-CN", match: "language" };
  }
  return null;
}

export function resolveLocalePreference(
  preference: unknown,
  systemLanguages: readonly unknown[] = [],
): LocaleState {
  const normalizedPreference = normalizeLocalePreference(preference);
  if (normalizedPreference !== DEFAULT_LOCALE_PREFERENCE) {
    const supportedPreference = SUPPORTED_LOCALE_BY_LOWERCASE.get(normalizedPreference.toLowerCase());
    if (supportedPreference) {
      return {
        preference: supportedPreference,
        resolvedLocale: supportedPreference,
        match: "explicit",
        issue: null,
      };
    }
    return {
      preference: normalizedPreference,
      resolvedLocale: DEFAULT_LOCALE,
      match: "default",
      issue: { code: "unsupportedPreference", value: normalizedPreference },
    };
  }

  const candidates = Array.isArray(systemLanguages) ? systemLanguages : [];
  for (const candidate of candidates) {
    const match = matchSystemLanguage(candidate);
    if (match) {
      return {
        preference: DEFAULT_LOCALE_PREFERENCE,
        resolvedLocale: match.locale,
        match: match.match,
        issue: null,
      };
    }
  }
  return {
    preference: DEFAULT_LOCALE_PREFERENCE,
    resolvedLocale: DEFAULT_LOCALE,
    match: "default",
    issue: null,
  };
}
