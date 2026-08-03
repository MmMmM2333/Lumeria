import { computed, inject, readonly, ref } from "vue";
import { createI18n } from "vue-i18n";
import {
  getBundledMessages,
  getLocaleMetadata,
  listLocaleMetadata,
} from "./catalogs.js";
import { SUPPORTED_LOCALES } from "./locale.js";

const LOCALIZATION_KEY = Symbol("lumeria-localization");
const LOCALIZATION_RUNTIME_KEY = Symbol("lumeria-localization-runtime");

const datetimeFormats = Object.freeze({
  "zh-CN": {
    scanTimestamp: {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
  },
  "en-US": {
    scanTimestamp: {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
  },
});

const numberFormats = Object.freeze({
  "zh-CN": { decimal: { maximumFractionDigits: 2 } },
  "en-US": { decimal: { maximumFractionDigits: 2 } },
});

function validateLocaleState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("localization requires a locale state object");
  }
  if (!SUPPORTED_LOCALES.includes(state.resolvedLocale)) {
    throw new TypeError(`localization resolvedLocale is unsupported: ${String(state.resolvedLocale)}`);
  }
  return state;
}

function missingMessageError(locale, key) {
  const error = new Error(`Missing i18n message: ${locale}.${key}`);
  error.name = "I18nCatalogError";
  error.code = "i18nMessageMissing";
  error.details = { key, locale };
  return error;
}

function updateDocumentLanguage(locale) {
  if (typeof document === "undefined") return;
  const metadata = getLocaleMetadata(locale);
  document.documentElement.lang = metadata.locale;
  document.documentElement.dir = metadata.direction;
}

export function createLocalization(initialState) {
  const validatedInitialState = validateLocaleState(initialState);
  const resolvedLocaleState = ref(validatedInitialState.resolvedLocale);
  const localePreferenceState = ref(validatedInitialState.preference);
  const localeIssueState = ref(validatedInitialState.issue || null);
  const i18n = createI18n({
    legacy: false,
    globalInjection: false,
    locale: validatedInitialState.resolvedLocale,
    fallbackLocale: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: getBundledMessages(),
    datetimeFormats,
    numberFormats,
  });
  const composer = i18n.global;

  function t(key, values = {}) {
    const normalizedKey = String(key || "").trim();
    const locale = resolvedLocaleState.value;
    if (!normalizedKey || !composer.te(normalizedKey, locale)) {
      const error = missingMessageError(locale, normalizedKey || "<empty>");
      if (!import.meta.env?.PROD) throw error;
      console.error("[i18n-message-missing]", error.details);
      return `⟦${normalizedKey || "missing"}⟧`;
    }
    return composer.t(normalizedKey, values);
  }

  function d(value, formatKey) {
    return formatKey ? composer.d(value, formatKey) : composer.d(value);
  }

  function n(value, formatKey) {
    return formatKey ? composer.n(value, formatKey) : composer.n(value);
  }

  const text = Object.freeze({
    availableLocales: Object.freeze(listLocaleMetadata()),
    d,
    direction: computed(() => getLocaleMetadata(resolvedLocaleState.value).direction),
    localeIssue: readonly(localeIssueState),
    localePreference: readonly(localePreferenceState),
    n,
    resolvedLocale: readonly(resolvedLocaleState),
    t,
  });

  function activate(nextState) {
    const validated = validateLocaleState(nextState);
    composer.locale.value = validated.resolvedLocale;
    resolvedLocaleState.value = validated.resolvedLocale;
    localePreferenceState.value = validated.preference;
    localeIssueState.value = validated.issue || null;
    updateDocumentLanguage(validated.resolvedLocale);
  }

  const plugin = Object.freeze({
    install(app) {
      app.use(i18n);
      app.provide(LOCALIZATION_KEY, text);
      app.provide(LOCALIZATION_RUNTIME_KEY, Object.freeze({ activate }));
    },
  });

  activate(validatedInitialState);
  return Object.freeze({ activate, plugin, text });
}

export function useLocalization() {
  const localization = inject(LOCALIZATION_KEY, null);
  if (!localization) throw new Error("Lumeria localization was used before installation");
  return localization;
}

export function useLocalizationRuntime() {
  const runtime = inject(LOCALIZATION_RUNTIME_KEY, null);
  if (!runtime) throw new Error("Lumeria localization runtime was used before installation");
  return runtime;
}
