import {
  DEFAULT_LAUNCHPAD_ICON_VARIANT,
  LAUNCHPAD_ICON_DARK,
  LAUNCHPAD_ICON_LIGHT,
  LAUNCHPAD_ICON_PASTEL_DARK,
  LAUNCHPAD_ICON_PASTEL_LIGHT,
  normalizeLaunchpadIconVariant,
} from "./launchpadIconVariant.js";

export function runLaunchpadIconVariantTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad icon variant test failed] ${message}`);
  };

  for (const variant of [
    LAUNCHPAD_ICON_LIGHT,
    LAUNCHPAD_ICON_DARK,
    LAUNCHPAD_ICON_PASTEL_LIGHT,
    LAUNCHPAD_ICON_PASTEL_DARK,
  ]) {
    assert(normalizeLaunchpadIconVariant(variant) === variant, `should preserve ${variant}`);
  }
  assert(
    normalizeLaunchpadIconVariant("unexpected") === DEFAULT_LAUNCHPAD_ICON_VARIANT,
    "unknown and legacy values should use the documented default"
  );
}
