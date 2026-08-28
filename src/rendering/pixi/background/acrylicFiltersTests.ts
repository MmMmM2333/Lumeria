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
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Acrylic filters test failed] ${message}`);
  };
  const {
    ACRYLIC_COMPOSITE_FRAGMENT,
    ACRYLIC_COMPOSITE_WGSL,
    GAUSSIAN_FRAGMENT,
    GAUSSIAN_WGSL,
    KAWASE_FRAGMENT,
    KAWASE_WGSL,
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
  for (const [name, source, uniformGroup] of [
    ["kawase", KAWASE_WGSL, "kawaseUniforms"],
    ["gaussian", GAUSSIAN_WGSL, "gaussianUniforms"],
    ["acrylic composite", ACRYLIC_COMPOSITE_WGSL, "acrylicUniforms"],
  ] as const) {
    assert(source.includes("@vertex\nfn mainVertex"), `${name} should expose a WebGPU vertex entry point`);
    assert(source.includes("@fragment\nfn mainFragment"), `${name} should expose a WebGPU fragment entry point`);
    assert(source.includes(`var<uniform> ${uniformGroup}`), `${name} should bind its existing uniform group in WGSL`);
    assert(source.includes("var uTexture: texture_2d<f32>"), `${name} should bind Pixi's filter input texture`);
    assert(source.includes("var uSampler: sampler"), `${name} should bind Pixi's filter sampler`);
  }
  assert(ACRYLIC_COMPOSITE_WGSL.includes("var uNoiseTexture: texture_2d<f32>"), "acrylic WGSL should bind the cached noise texture");
  assert(ACRYLIC_COMPOSITE_WGSL.includes("var uNoiseSampler: sampler"), "acrylic WGSL should bind the cached noise sampler");
}
