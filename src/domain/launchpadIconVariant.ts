export const LAUNCHPAD_ICON_LIGHT = "light";
export const LAUNCHPAD_ICON_DARK = "dark";
export const LAUNCHPAD_ICON_PASTEL_LIGHT = "pastelLight";
export const LAUNCHPAD_ICON_PASTEL_DARK = "pastelDark";
export const DEFAULT_LAUNCHPAD_ICON_VARIANT = LAUNCHPAD_ICON_LIGHT;

export type LaunchpadIconVariant =
  | typeof LAUNCHPAD_ICON_LIGHT
  | typeof LAUNCHPAD_ICON_DARK
  | typeof LAUNCHPAD_ICON_PASTEL_LIGHT
  | typeof LAUNCHPAD_ICON_PASTEL_DARK;

export const LAUNCHPAD_ICON_VARIANTS: readonly LaunchpadIconVariant[] = Object.freeze([
  LAUNCHPAD_ICON_LIGHT,
  LAUNCHPAD_ICON_DARK,
  LAUNCHPAD_ICON_PASTEL_LIGHT,
  LAUNCHPAD_ICON_PASTEL_DARK,
]);

const LAUNCHPAD_ICON_VARIANT_SET = new Set(LAUNCHPAD_ICON_VARIANTS);

export function normalizeLaunchpadIconVariant(value: unknown): LaunchpadIconVariant {
  if (typeof value !== "string") return DEFAULT_LAUNCHPAD_ICON_VARIANT;
  return LAUNCHPAD_ICON_VARIANT_SET.has(value as LaunchpadIconVariant)
    ? value as LaunchpadIconVariant
    : DEFAULT_LAUNCHPAD_ICON_VARIANT;
}
