export type TranslationValues = Readonly<Record<string, string | number>>;

/** Text lookup required by shared business rules, independent of reactive UI state. */
export type TranslationPort = Readonly<{
  t(key: unknown, values?: TranslationValues): string;
}>;
