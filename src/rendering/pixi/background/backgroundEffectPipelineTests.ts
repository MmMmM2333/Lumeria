async function importBackgroundEffectPipeline() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
  }
  return import("./backgroundEffectPipeline.js");
}

export async function runBackgroundEffectPipelineTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Background effect pipeline test failed] ${message}`);
  };
  const {
    createBackgroundEffectTexturePlan,
    resolveGaussianAxis,
  } = await importBackgroundEffectPipeline();

  const texturePlan = createBackgroundEffectTexturePlan(
    { height: 540, width: 960 },
    { minSize: 16, passCount: 2 }
  );
  assert(texturePlan.renderSize.width === 960 && texturePlan.renderSize.height === 540, "texture plan should preserve render size");
  assert(texturePlan.levels.map((level) => `${level.width}x${level.height}`).join(",") === "480x270,240x135", "texture plan should include dual kawase levels");
  assert(texturePlan.key === "960|540|2|16|480x270|240x135", "texture plan key should include render and level dimensions");

  const halfScaleGaussian = resolveGaussianAxis(20, 960, 1920);
  assert(Math.abs(halfScaleGaussian.sigma - 10) < 0.0001, "gaussian sigma should scale from target pixels into render pixels");
  assert(halfScaleGaussian.radius === 30, "gaussian radius should cover three sigma when below the shader cap");

  const clampedGaussian = resolveGaussianAxis(20, 960, 960);
  assert(Math.abs(clampedGaussian.sigma - 20) < 0.0001, "gaussian sigma should preserve one-to-one render scale");
  assert(clampedGaussian.radius === 32, "gaussian radius should clamp to the shader cap");
}
