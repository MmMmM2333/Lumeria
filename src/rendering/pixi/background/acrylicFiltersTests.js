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
    GAUSSIAN_FRAGMENT,
    KAWASE_FRAGMENT,
  } = await importAcrylicFilters();

  assert(KAWASE_FRAGMENT.includes("uniform vec4 uInputClamp;"), "kawase filter should receive Pixi's input clamp");
  assert(KAWASE_FRAGMENT.includes("clamp(uv, uInputClamp.xy, uInputClamp.zw)"), "kawase samples should clamp to the valid input frame");
  assert(GAUSSIAN_FRAGMENT.includes("uniform vec4 uInputClamp;"), "gaussian filter should receive Pixi's input clamp");
  assert(GAUSSIAN_FRAGMENT.includes("MAX_GAUSSIAN_RADIUS"), "gaussian filter should cap the sample radius");
  assert(GAUSSIAN_FRAGMENT.includes("exp(-(sampleIndex * sampleIndex)"), "gaussian filter should weight samples with a gaussian curve");
  assert(ACRYLIC_COMPOSITE_FRAGMENT.includes("uniform vec4 uInputClamp;"), "acrylic composite should receive Pixi's input clamp");
  assert(ACRYLIC_COMPOSITE_FRAGMENT.includes("clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw)"), "acrylic composite should clamp to the valid input frame");
  assert(ACRYLIC_COMPOSITE_FRAGMENT.includes("uniform sampler2D uNoiseTexture;"), "acrylic composite should sample a cached noise texture");
  assert(ACRYLIC_COMPOSITE_FRAGMENT.includes("vec3 acrylicSoftLight"), "acrylic composite should use soft light for noise blending");
  assert(ACRYLIC_COMPOSITE_FRAGMENT.includes("fract((gl_FragCoord.xy + noiseOffset) / uNoiseTextureSize)"), "acrylic composite should tile noise in shader space");
  assert(!ACRYLIC_COMPOSITE_FRAGMENT.includes("float acrylicNoise"), "acrylic composite should not use the old hash noise helper");
  assert(!ACRYLIC_COMPOSITE_FRAGMENT.includes("sin(dot"), "acrylic composite should not calculate hash noise per pixel");
}
