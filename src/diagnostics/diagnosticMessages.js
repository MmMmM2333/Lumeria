import { hasMessage, translateMessage } from "../i18n/catalogs.js";
import { SUPPORTED_LOCALES } from "../i18n/locale.js";
import { DiagnosticError } from "./diagnosticError.js";

export const DEFAULT_DIAGNOSTIC_LOCALE = "zh-CN";

function requireLocale(locale) {
  const normalized = String(locale || DEFAULT_DIAGNOSTIC_LOCALE).trim();
  if (!SUPPORTED_LOCALES.includes(normalized)) {
    throw new DiagnosticError(
      "diagnostic-locale-not-supported",
      `Diagnostic output does not support locale ${normalized || "(empty)"}`,
      {
        details: { locale: normalized, supportedLocales: [...SUPPORTED_LOCALES] },
        nextActions: [`Use one of these locales: ${SUPPORTED_LOCALES.join(", ")}`],
      },
    );
  }
  return normalized;
}

export function hasDiagnosticMessage(key, options = {}) {
  return hasMessage(requireLocale(options.locale), String(key || ""));
}

export function translateDiagnosticMessage(key, values = {}, options = {}) {
  const normalizedKey = String(key || "");
  const locale = requireLocale(options.locale);
  try {
    return translateMessage(
      locale,
      normalizedKey,
      values && typeof values === "object" ? values : {},
    );
  } catch (error) {
    if (error?.code !== "i18nMessageMissing") throw error;
    throw new DiagnosticError(
      "diagnostic-message-not-found",
      `Diagnostic message catalog is missing ${normalizedKey || "(empty)"}`,
      {
        cause: error,
        details: { key: normalizedKey || null, locale },
        nextActions: ["Add the catalog entry or correct the diagnostic message key"],
      },
    );
  }
}

export function localizeDiagnosticDescriptor(descriptor = {}, options = {}) {
  const locale = requireLocale(options.locale);
  const titleKey = String(descriptor.titleKey || "");
  const descriptionKey = String(descriptor.descriptionKey || "");
  return {
    ...descriptor,
    description: descriptionKey ? translateDiagnosticMessage(descriptionKey, {}, { locale }) : undefined,
    locale,
    operations: (descriptor.operations || []).map((operation) => {
      const operationTitleKey = String(
        operation.titleKey
        || `diagnostics.tools.${descriptor.id}.operations.${operation.id}.title`,
      );
      return {
        ...operation,
        ...(hasDiagnosticMessage(operationTitleKey, { locale })
          ? { title: translateDiagnosticMessage(operationTitleKey, {}, { locale }) }
          : {}),
      };
    }),
    title: titleKey ? translateDiagnosticMessage(titleKey, {}, { locale }) : undefined,
  };
}
