import {
  DEFAULT_ACRYLIC_COMPOSITE_PARAMS,
  hexToRgbArray,
  normalizeAcrylicCompositeParams,
  rgbArrayToHex,
} from "./acrylicParams.js";

type AcrylicParameters = ReturnType<typeof normalizeAcrylicCompositeParams>;

export function runAcrylicParamsTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Acrylic params test failed] ${message}`);
  };

  assert(DEFAULT_ACRYLIC_COMPOSITE_PARAMS.brightness === 0.8, "dark acrylic brightness should be the default");
  assert(DEFAULT_ACRYLIC_COMPOSITE_PARAMS.contrast === 0.85, "dark acrylic contrast should be the default");
  assert(DEFAULT_ACRYLIC_COMPOSITE_PARAMS.noise === 0.005, "dark acrylic noise should be the default");
  assert(DEFAULT_ACRYLIC_COMPOSITE_PARAMS.saturation === 1.5, "dark acrylic saturation should be the default");
  assert(rgbArrayToHex(DEFAULT_ACRYLIC_COMPOSITE_PARAMS.tintColor) === "#3c3c3c", "dark acrylic tint should be the default");

  const normalized = normalizeAcrylicCompositeParams({
    brightness: 4,
    contrast: -1,
    noise: 2,
    saturation: 0,
    seed: -12,
    tintColor: [2, -1, 0.5],
    tintStrength: 2,
  });

  assert(normalized.brightness === 1.4, "brightness should clamp to the maximum");
  assert(normalized.contrast === 0.6, "contrast should clamp to the minimum");
  assert(normalized.noise === 0.08, "noise should clamp to the maximum");
  assert(normalized.saturation === 0.4, "saturation should clamp to the minimum");
  assert(normalized.seed === 0, "seed should clamp to the minimum");
  assert(normalized.tintStrength === 0.8, "tint strength should clamp to the maximum");
  assert(normalized.tintColor[0] === 1 && normalized.tintColor[1] === 0 && normalized.tintColor[2] === 0.5, "tint color channels should clamp independently");

  const fallback: AcrylicParameters = {
    ...DEFAULT_ACRYLIC_COMPOSITE_PARAMS,
    brightness: 0.77,
    tintColor: [0.2, 0.3, 0.4],
  };
  const fallbackResult = normalizeAcrylicCompositeParams({
    brightness: Number.NaN,
    tintColor: "invalid",
  }, fallback);

  assert(fallbackResult.brightness === 0.77, "invalid brightness should use fallback");
  assert(fallbackResult.tintColor[0] === 0.2 && fallbackResult.tintColor[1] === 0.3 && fallbackResult.tintColor[2] === 0.4, "invalid tint color should use fallback");
  assert(fallbackResult.tintColor !== fallback.tintColor, "fallback tint color should be copied");
  assert(normalizeAcrylicCompositeParams(null).brightness === DEFAULT_ACRYLIC_COMPOSITE_PARAMS.brightness, "null params should use defaults");
  assert(normalizeAcrylicCompositeParams({ tintColor: "#123456" }).tintColor[0] === 0x12 / 255, "hex tint colors should be accepted by normalization");

  assert(rgbArrayToHex([1, 0.5, 0]) === "#ff8000", "rgb array should format as hex");
  const rgb = hexToRgbArray("#336699");
  assert(rgb[0] === 0.2 && rgb[1] === 0.4 && rgb[2] === 0.6, "hex should parse to normalized rgb channels");

  const invalidHexFallback: [number, number, number] = [0.1, 0.2, 0.3];
  const invalidHex = hexToRgbArray("not-a-color", invalidHexFallback);
  assert(invalidHex[0] === 0.1 && invalidHex[1] === 0.2 && invalidHex[2] === 0.3, "invalid hex should use fallback");
  assert(invalidHex !== invalidHexFallback, "hex fallback should be copied");
}
