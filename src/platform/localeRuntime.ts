import {
  SUPPORTED_LOCALES,
  resolveLocalePreference,
  type LocaleIssue,
  type LocaleMatch,
  type LocaleState,
  type SupportedLocale,
} from "../i18n/locale.js";

export type LocaleRuntimeOutcome =
  | Readonly<{ ok: true; state: LocaleState }>
  | Readonly<{ ok: false; error: Error }>;

export type LocaleRuntimeOptions = Readonly<{
  isNative?: () => boolean;
  getNativeState?: () => Promise<unknown>;
  applyNativePreference?: (preference: string) => Promise<unknown>;
  getSystemLanguages?: () => readonly unknown[];
}>;

const LOCALE_MATCHES = new Set<LocaleMatch>(["default", "exact", "explicit", "language"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function explicitFailure(error: unknown): LocaleRuntimeOutcome {
  return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
}

function validateLocaleState(state: unknown): LocaleState {
  if (!isRecord(state)) {
    throw new TypeError("locale state must be an object");
  }
  if (typeof state.preference !== "string" || !state.preference.trim()) {
    throw new TypeError("locale state preference must be a non-empty string");
  }
  if (typeof state.resolvedLocale !== "string" || !SUPPORTED_LOCALES.includes(state.resolvedLocale as SupportedLocale)) {
    throw new TypeError(`locale state resolvedLocale is unsupported: ${String(state.resolvedLocale)}`);
  }
  if (typeof state.match !== "string" || !LOCALE_MATCHES.has(state.match as LocaleMatch)) {
    throw new TypeError("locale state match must be a supported match kind");
  }
  if (state.issue !== null && !isRecord(state.issue)) {
    throw new TypeError("locale state issue must be null or an object");
  }
  if (state.issue !== null) {
    if (state.issue.code !== "unsupportedPreference" || typeof state.issue.value !== "string") {
      throw new TypeError("locale state issue must describe an unsupported preference");
    }
  }
  return state as LocaleState;
}

function defaultSystemLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

export function createLocaleRuntimePort(options: LocaleRuntimeOptions = {}) {
  const isNative = options.isNative || (() => false);
  const getNativeState = options.getNativeState;
  const applyNativePreference = options.applyNativePreference;
  const getSystemLanguages = options.getSystemLanguages || defaultSystemLanguages;

  async function bootstrap(): Promise<LocaleRuntimeOutcome> {
    if (!isNative()) {
      return { ok: true, state: resolveLocalePreference("system", getSystemLanguages()) };
    }
    if (typeof getNativeState !== "function") {
      return explicitFailure(new TypeError("native locale runtime requires getNativeState"));
    }
    try {
      return { ok: true, state: validateLocaleState(await getNativeState()) };
    } catch (error) {
      return explicitFailure(error);
    }
  }

  async function applyPreference(preference: string): Promise<LocaleRuntimeOutcome> {
    if (!isNative()) {
      return { ok: true, state: resolveLocalePreference(preference, getSystemLanguages()) };
    }
    if (typeof applyNativePreference !== "function") {
      return explicitFailure(new TypeError("native locale runtime requires applyNativePreference"));
    }
    try {
      return { ok: true, state: validateLocaleState(await applyNativePreference(preference)) };
    } catch (error) {
      return explicitFailure(error);
    }
  }

  return Object.freeze({ applyPreference, bootstrap });
}
