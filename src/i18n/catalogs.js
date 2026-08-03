import { createI18n } from "vue-i18n";
import zhCnCatalog from "../../locales/zh-CN.json" with { type: "json" };
import enUsCatalog from "../../locales/en-US.json" with { type: "json" };

const BUNDLED_CATALOGS = Object.freeze({
  "zh-CN": zhCnCatalog,
  "en-US": enUsCatalog,
});

const translators = new Map();

function catalogError(code, message, details = {}) {
  const error = new Error(message);
  error.name = "I18nCatalogError";
  error.code = code;
  error.details = details;
  return error;
}

function requireCatalog(locale) {
  const normalized = String(locale || "").trim();
  const catalog = BUNDLED_CATALOGS[normalized];
  if (!catalog) {
    throw catalogError("unsupportedLocale", `Unsupported locale: ${normalized || "<empty>"}`, {
      locale: normalized,
      supportedLocales: Object.keys(BUNDLED_CATALOGS),
    });
  }
  return catalog;
}

function flattenMessages(value, prefix = "", output = new Map()) {
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

function namedPlaceholders(message) {
  const placeholders = new Set();
  for (const match of String(message).matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}/g)) {
    placeholders.add(match[1]);
  }
  return [...placeholders].sort();
}

export function validateBundledCatalogs() {
  const issues = [];
  const entries = Object.entries(BUNDLED_CATALOGS);
  const [referenceLocale, referenceCatalog] = entries[0];
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

export function getLocaleMetadata(locale) {
  const catalog = requireCatalog(locale);
  return Object.freeze({
    locale: catalog.locale,
    displayName: catalog.displayName,
    direction: catalog.direction,
  });
}

export function listLocaleMetadata() {
  return Object.keys(BUNDLED_CATALOGS).map(getLocaleMetadata);
}

function getTranslator(locale) {
  if (!translators.has(locale)) {
    const catalog = requireCatalog(locale);
    const i18n = createI18n({
      legacy: false,
      locale,
      fallbackLocale: false,
      missingWarn: false,
      fallbackWarn: false,
      messages: { [locale]: catalog.messages },
    });
    translators.set(locale, i18n.global);
  }
  return translators.get(locale);
}

export function translateMessage(locale, key, values = {}) {
  const normalizedKey = String(key || "").trim();
  const translator = getTranslator(locale);
  if (!normalizedKey || !translator.te(normalizedKey, locale)) {
    throw catalogError("i18nMessageMissing", `Missing i18n message: ${locale}.${normalizedKey || "<empty>"}`, {
      locale,
      key: normalizedKey,
    });
  }
  return translator.t(normalizedKey, values);
}

export function hasMessage(locale, key) {
  const normalizedKey = String(key || "").trim();
  return Boolean(normalizedKey && getTranslator(locale).te(normalizedKey, locale));
}

export function getBundledMessages() {
  return Object.fromEntries(
    Object.entries(BUNDLED_CATALOGS).map(([locale, catalog]) => [locale, catalog.messages])
  );
}
