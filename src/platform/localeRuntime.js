import { SUPPORTED_LOCALES, resolveLocalePreference } from "../i18n/locale.js";

function explicitFailure(error) {
  return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
}

function validateLocaleState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("locale state must be an object");
  }
  if (typeof state.preference !== "string" || !state.preference.trim()) {
    throw new TypeError("locale state preference must be a non-empty string");
  }
  if (!SUPPORTED_LOCALES.includes(state.resolvedLocale)) {
    throw new TypeError(`locale state resolvedLocale is unsupported: ${String(state.resolvedLocale)}`);
  }
  if (typeof state.match !== "string" || !state.match) {
    throw new TypeError("locale state match must be a non-empty string");
  }
  if (state.issue !== null && (typeof state.issue !== "object" || Array.isArray(state.issue))) {
    throw new TypeError("locale state issue must be null or an object");
  }
  return state;
}

function defaultSystemLanguages() {
  if (typeof navigator === "undefined") return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

export function createLocaleRuntimePort(options = {}) {
  const isNative = options.isNative || (() => false);
  const getNativeState = options.getNativeState;
  const applyNativePreference = options.applyNativePreference;
  const getSystemLanguages = options.getSystemLanguages || defaultSystemLanguages;

  async function bootstrap() {
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

  async function applyPreference(preference) {
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
