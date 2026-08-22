import { createI18n } from "vue-i18n";
import zhCnCatalog from "../../locales/zh-CN.json" with { type: "json" };
import enUsCatalog from "../../locales/en-US.json" with { type: "json" };
import type { SupportedLocale } from "./locale.js";

type CatalogDirection = "ltr" | "rtl";
type MessageTree = Readonly<{ [key: string]: string | MessageTree }>;
type CatalogSource = Readonly<{
  locale: string;
  displayName: string;
  direction: string;
  messages: MessageTree;
}>;
export type LocaleMetadata = Readonly<{
  locale: SupportedLocale;
  displayName: string;
  direction: CatalogDirection;
}>;
export type TranslationValues = Readonly<Record<string, unknown>>;

class I18nCatalogError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "I18nCatalogError";
    this.code = code;
    this.details = details;
  }
}

const BUNDLED_CATALOGS: Readonly<Record<SupportedLocale, CatalogSource>> = Object.freeze({
  "zh-CN": zhCnCatalog,
  "en-US": enUsCatalog,
});

function createCatalogTranslator(locale: SupportedLocale) {
  const catalog = requireCatalog(locale);
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: { [locale]: catalog.messages },
  }).global;
}

type CatalogTranslator = ReturnType<typeof createCatalogTranslator>;
const translators = new Map<SupportedLocale, CatalogTranslator>();

function catalogError(
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): I18nCatalogError {
  return new I18nCatalogError(code, message, details);
}

function requireCatalog(locale: unknown): CatalogSource & Readonly<{
  locale: SupportedLocale;
  direction: CatalogDirection;
}> {
  const normalized = String(locale || "").trim();
  const catalog = normalized === "zh-CN" || normalized === "en-US"
    ? BUNDLED_CATALOGS[normalized]
    : null;
  if (!catalog) {
    throw catalogError("unsupportedLocale", `Unsupported locale: ${normalized || "<empty>"}`, {
      locale: normalized,
      supportedLocales: Object.keys(BUNDLED_CATALOGS),
    });
  }
  if (catalog.locale !== normalized || (catalog.direction !== "ltr" && catalog.direction !== "rtl")) {
    throw catalogError("invalidCatalogMetadata", `Invalid bundled locale metadata: ${normalized}`, {
      locale: normalized,
    });
  }
  return catalog as CatalogSource & Readonly<{
    locale: SupportedLocale;
    direction: CatalogDirection;
  }>;
}

function flattenMessages(
  value: unknown,
  prefix = "",
  output = new Map<string, unknown>(),
): Map<string, unknown> {
  if (typeof value === "string") {
    output.set(prefix, value);
    return output;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    output.set(prefix, value);
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    flattenMessages(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function namedPlaceholders(message: unknown): string[] {
  const placeholders = new Set<string>();
  for (const match of String(message).matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}/g)) {
    const name = match[1];
    if (name) placeholders.add(name);
  }
  return [...placeholders].sort();
}

export function validateBundledCatalogs() {
  const issues: string[] = [];
  const entries = Object.entries(BUNDLED_CATALOGS) as [SupportedLocale, CatalogSource][];
  const referenceLocale: SupportedLocale = "zh-CN";
  const referenceCatalog = BUNDLED_CATALOGS[referenceLocale];
  const referenceMessages = flattenMessages(referenceCatalog.messages);
  for (const [locale, catalog] of entries) {
    if (catalog.locale !== locale) issues.push(`${locale}: metadata locale must match its file name`);
    if (typeof catalog.displayName !== "string" || !catalog.displayName.trim()) issues.push(`${locale}: displayName is required`);
    if (catalog.direction !== "ltr" && catalog.direction !== "rtl") issues.push(`${locale}: direction must be ltr or rtl`);
    const messages = flattenMessages(catalog.messages);
    for (const [key, referenceMessage] of referenceMessages) {
      if (!messages.has(key)) {
        issues.push(`${locale}: missing ${key}`);
        continue;
      }
      const placeholders = namedPlaceholders(messages.get(key));
      const expectedPlaceholders = namedPlaceholders(referenceMessage);
      if (placeholders.join(",") !== expectedPlaceholders.join(",")) {
        issues.push(`${locale}: placeholders for ${key} differ from ${referenceLocale}`);
      }
    }
    for (const key of messages.keys()) {
      if (!referenceMessages.has(key)) issues.push(`${locale}: unexpected ${key}`);
    }
  }
  return issues;
}

export function getLocaleMetadata(locale: unknown): LocaleMetadata {
  const catalog = requireCatalog(locale);
  return Object.freeze({
    locale: catalog.locale,
    displayName: catalog.displayName,
    direction: catalog.direction,
  });
}

export function listLocaleMetadata() {
  return (Object.keys(BUNDLED_CATALOGS) as SupportedLocale[]).map(getLocaleMetadata);
}

function getTranslator(locale: unknown): CatalogTranslator {
  const catalog = requireCatalog(locale);
  const supportedLocale = catalog.locale;
  if (!translators.has(supportedLocale)) {
    translators.set(supportedLocale, createCatalogTranslator(supportedLocale));
  }
  const translator = translators.get(supportedLocale);
  if (!translator) throw new Error(`Failed to create translator for ${supportedLocale}`);
  return translator;
}

export function translateMessage(locale: unknown, key: unknown, values: TranslationValues = {}): string {
  const normalizedKey = String(key || "").trim();
  const catalog = requireCatalog(locale);
  const translator = getTranslator(catalog.locale);
  if (!normalizedKey || !translator.te(normalizedKey, catalog.locale)) {
    throw catalogError("i18nMessageMissing", `Missing i18n message: ${locale}.${normalizedKey || "<empty>"}`, {
      locale,
      key: normalizedKey,
    });
  }
  return String(translator.t(normalizedKey, values));
}

export function hasMessage(locale: unknown, key: unknown): boolean {
  const normalizedKey = String(key || "").trim();
  const catalog = requireCatalog(locale);
  return Boolean(normalizedKey && getTranslator(catalog.locale).te(normalizedKey, catalog.locale));
}

export function getBundledMessages(): Readonly<Record<SupportedLocale, MessageTree>> {
  return Object.fromEntries(
    Object.entries(BUNDLED_CATALOGS).map(([locale, catalog]) => [locale, catalog.messages])
  ) as Record<SupportedLocale, MessageTree>;
}
