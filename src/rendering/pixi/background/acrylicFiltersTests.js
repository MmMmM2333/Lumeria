async function importAcrylicFilters() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
  }
  return import("./acrylicFilters.js");
}

export async function runAcrylicFiltersTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Acrylic filters test failed] ${message}`);
  };
  const {
    ACRYLIC_COMPOSITE_FRAGMENT,
    KAWASE_FRAGMENT,
  } = await importAcrylicFilters();

  assert(KAWASE_FRAGMENT.includes("uniform vec4 uInputClamp;"), "kawase filter should receive Pixi's input clamp");
  assert(KAWASE_FRAGMENT.includes("clamp(uv, uInputClamp.xy, uInputClamp.zw)"), "kawase samples should clamp to the valid input frame");
  assert(ACRYLIC_COMPOSITE_FRAGMENT.includes("uniform vec4 uInputClamp;"), "acrylic composite should receive Pixi's input clamp");
  assert(ACRYLIC_COMPOSITE_FRAGMENT.includes("clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw)"), "acrylic composite should clamp to the valid input frame");
}
