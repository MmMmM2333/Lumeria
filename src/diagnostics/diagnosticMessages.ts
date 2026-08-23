import { hasMessage, translateMessage } from "../i18n/catalogs.js";
import { SUPPORTED_LOCALES } from "../i18n/locale.js";
import type { TranslationValues } from "../i18n/catalogs.js";
import type { SupportedLocale } from "../i18n/locale.js";
import { DiagnosticError } from "./diagnosticError.js";
import type { DiagnosticOperationDescriptor, DiagnosticToolDescriptor } from "./diagnosticProtocol.js";

export const DEFAULT_DIAGNOSTIC_LOCALE = "zh-CN" as const;

type UnknownRecord = Record<string, unknown>;
type DiagnosticLocaleOptions = Readonly<{ locale?: unknown }>;
type LoosePartial<Value> = { [Key in keyof Value]?: Value[Key] | undefined };
type LocalizableOperation = LoosePartial<DiagnosticOperationDescriptor>;
type LocalizableDescriptor = LoosePartial<Omit<DiagnosticToolDescriptor, "operations">> & Readonly<{
  operations?: readonly LocalizableOperation[];
}>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requireLocale(locale: unknown): SupportedLocale {
  const normalized = String(locale || DEFAULT_DIAGNOSTIC_LOCALE).trim();
  const supportedLocale = SUPPORTED_LOCALES.find((candidate) => candidate === normalized);
  if (!supportedLocale) {
    throw new DiagnosticError(
      "diagnostic-locale-not-supported",
      `Diagnostic output does not support locale ${normalized || "(empty)"}`,
      {
        details: { locale: normalized, supportedLocales: [...SUPPORTED_LOCALES] },
        nextActions: [`Use one of these locales: ${SUPPORTED_LOCALES.join(", ")}`],
      },
    );
  }
  return supportedLocale;
}

export function hasDiagnosticMessage(key: unknown, options: DiagnosticLocaleOptions = {}): boolean {
  return hasMessage(requireLocale(options.locale), String(key || ""));
}

export function translateDiagnosticMessage(
  key: unknown,
  values: unknown = {},
  options: DiagnosticLocaleOptions = {},
): string {
  const normalizedKey = String(key || "");
  const locale = requireLocale(options.locale);
  try {
    return translateMessage(
      locale,
      normalizedKey,
      asRecord(values) as TranslationValues | null || {},
    );
  } catch (error) {
    if (asRecord(error)?.code !== "i18nMessageMissing") throw error;
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

export function localizeDiagnosticDescriptor(
  descriptor: LocalizableDescriptor = {},
  options: DiagnosticLocaleOptions = {},
) {
  const locale = requireLocale(options.locale);
  const titleKey = String(descriptor.titleKey || "");
  const descriptionKey = String(descriptor.descriptionKey || "");
  return {
    ...descriptor,
    description: descriptionKey ? translateDiagnosticMessage(descriptionKey, {}, { locale }) : undefined,
    locale,
    operations: (descriptor.operations || []).map((operation: LocalizableOperation) => {
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
