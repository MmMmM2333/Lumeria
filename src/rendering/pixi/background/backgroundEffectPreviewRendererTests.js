async function importBackgroundEffectPreviewRenderer() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
  }
  return import("./backgroundEffectPreviewRenderer.js");
}

export async function runBackgroundEffectPreviewRendererTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Background effect preview renderer test failed] ${message}`);
  };
  const { resolveBackgroundEffectPreviewSizes } = await importBackgroundEffectPreviewRenderer();

  const previewSizes = resolveBackgroundEffectPreviewSizes({
    layoutHeight: 864,
    layoutWidth: 1536,
    renderHeight: 179,
    renderWidth: 318,
  });
  assert(
    previewSizes.renderSize.width === 318 && previewSizes.renderSize.height === 179,
    "preview GPU output should use the preview element dimensions"
  );
  assert(
    previewSizes.layoutSize.width === 1536 && previewSizes.layoutSize.height === 864,
    "preview image placement should retain the window layout dimensions"
  );

  const legacySizes = resolveBackgroundEffectPreviewSizes({
    renderHeight: 1080,
    renderWidth: 1920,
  });
  assert(
    legacySizes.renderSize.width === 960 && legacySizes.renderSize.height === 540,
    "legacy callers should retain the existing acrylic render cap"
  );
  assert(
    legacySizes.layoutSize.width === 1920 && legacySizes.layoutSize.height === 1080,
    "callers without layout dimensions should fall back to the configured render dimensions"
  );
}
