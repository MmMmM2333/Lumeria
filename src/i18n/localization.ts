import {
  computed,
  inject,
  readonly,
  ref,
  type App,
  type ComputedRef,
  type DeepReadonly,
  type InjectionKey,
  type Ref,
} from "vue";
import { createI18n } from "vue-i18n";
import { datetimeFormats } from "./dateTimeFormats.js";
import {
  getBundledMessages,
  getLocaleMetadata,
  listLocaleMetadata,
  type LocaleMetadata,
} from "./catalogs.js";
import {
  SUPPORTED_LOCALES,
  type LocaleIssue,
  type LocaleState,
  type SupportedLocale,
} from "./locale.js";

type TranslationPrimitive = string | number;
type TranslationValues = Readonly<Record<string, TranslationPrimitive>>;
type DateTimeFormatKey = "scanTimestamp";
type NumberFormatKey = "decimal";

export type LocalizationText = Readonly<{
  availableLocales: readonly LocaleMetadata[];
  d(value: number | Date, formatKey?: DateTimeFormatKey): string;
  direction: ComputedRef<"ltr" | "rtl">;
  localeIssue: DeepReadonly<Ref<LocaleIssue | null>>;
  localePreference: DeepReadonly<Ref<string>>;
  n(value: number, formatKey?: NumberFormatKey): string;
  resolvedLocale: DeepReadonly<Ref<SupportedLocale>>;
  t(key: unknown, values?: TranslationValues): string;
}>;

export type LocalizationRuntime = Readonly<{
  activate(nextState: unknown): void;
}>;

const LOCALIZATION_KEY: InjectionKey<LocalizationText> = Symbol("lumeria-localization");
const LOCALIZATION_RUNTIME_KEY: InjectionKey<LocalizationRuntime> = Symbol("lumeria-localization-runtime");


const numberFormats = Object.freeze({
  "zh-CN": { decimal: { maximumFractionDigits: 2 } },
  "en-US": { decimal: { maximumFractionDigits: 2 } },
} as const);

class LocalizationMessageError extends Error {
  readonly code = "i18nMessageMissing";
  readonly details: Readonly<{ key: string; locale: SupportedLocale }>;

  constructor(locale: SupportedLocale, key: string) {
    super(`Missing i18n message: ${locale}.${key}`);
    this.name = "I18nCatalogError";
    this.details = { key, locale };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateLocaleState(state: unknown): LocaleState {
  if (!isRecord(state)) {
    throw new TypeError("localization requires a locale state object");
  }
  if (typeof state.resolvedLocale !== "string" || !SUPPORTED_LOCALES.includes(state.resolvedLocale as SupportedLocale)) {
    throw new TypeError(`localization resolvedLocale is unsupported: ${String(state.resolvedLocale)}`);
  }
  if (typeof state.preference !== "string" || typeof state.match !== "string") {
    throw new TypeError("localization requires string preference and match fields");
  }
  if (state.issue !== null && !isRecord(state.issue)) {
    throw new TypeError("localization locale issue must be null or an object");
  }
  const issue = state.issue === null
    ? null
    : state.issue.code === "unsupportedPreference" && typeof state.issue.value === "string"
      ? { code: state.issue.code, value: state.issue.value } as const
      : null;
  if (state.issue !== null && issue === null) {
    throw new TypeError("localization locale issue must describe an unsupported preference");
  }
  if (state.match !== "default" && state.match !== "exact" && state.match !== "explicit" && state.match !== "language") {
    throw new TypeError("localization locale match is unsupported");
  }
  return {
    preference: state.preference,
    resolvedLocale: state.resolvedLocale as SupportedLocale,
    match: state.match,
    issue,
  };
}

function missingMessageError(locale: SupportedLocale, key: string): LocalizationMessageError {
  return new LocalizationMessageError(locale, key);
}

function updateDocumentLanguage(locale: SupportedLocale): void {
  if (typeof document === "undefined") return;
  const metadata = getLocaleMetadata(locale);
  document.documentElement.lang = metadata.locale;
  document.documentElement.dir = metadata.direction;
}

export function createLocalization(initialState: unknown) {
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

  function t(key: unknown, values: TranslationValues = {}): string {
    const normalizedKey = String(key || "").trim();
    const locale = resolvedLocaleState.value;
    if (!normalizedKey || !composer.te(normalizedKey, locale)) {
      const error = missingMessageError(locale, normalizedKey || "<empty>");
      if (!import.meta.env?.PROD) throw error;
      console.error("[i18n-message-missing]", error.details);
      return `⟦${normalizedKey || "missing"}⟧`;
    }
    return String(composer.t(normalizedKey, values));
  }

  function d(value: number | Date, formatKey?: DateTimeFormatKey): string {
    return formatKey ? composer.d(value, formatKey) : composer.d(value);
  }

  function n(value: number, formatKey?: NumberFormatKey): string {
    return formatKey ? composer.n(value, formatKey) : composer.n(value);
  }

  const text: LocalizationText = Object.freeze({
    availableLocales: Object.freeze(listLocaleMetadata()),
    d,
    direction: computed(() => getLocaleMetadata(resolvedLocaleState.value).direction),
    localeIssue: readonly(localeIssueState),
    localePreference: readonly(localePreferenceState),
    n,
    resolvedLocale: readonly(resolvedLocaleState),
    t,
  });

  function activate(nextState: unknown): void {
    const validated = validateLocaleState(nextState);
    composer.locale.value = validated.resolvedLocale;
    resolvedLocaleState.value = validated.resolvedLocale;
    localePreferenceState.value = validated.preference;
    localeIssueState.value = validated.issue || null;
    updateDocumentLanguage(validated.resolvedLocale);
  }

  const runtime: LocalizationRuntime = Object.freeze({ activate });
  const plugin = Object.freeze({
    install(app: App): void {
      app.use(i18n);
      app.provide(LOCALIZATION_KEY, text);
      app.provide(LOCALIZATION_RUNTIME_KEY, runtime);
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
