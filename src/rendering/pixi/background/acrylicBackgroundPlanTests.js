import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
} from "../../../composables/useLaunchpadSettingsConfig.js";
import {
  createBackgroundEffectPlan,
  createDualKawaseLevels,
  resolveAcrylicBackgroundAlpha,
  resolveAcrylicRenderSize,
  resolveBlurOffsetScale,
  resolveCoverLayout,
  shouldUsePixiBackgroundEffect,
} from "./acrylicBackgroundPlan.js";

export function runAcrylicBackgroundPlanTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Acrylic background plan test failed] ${message}`);
  };

  const fullHd = resolveAcrylicRenderSize(1920, 1080);
  assert(fullHd.width === 960 && fullHd.height === 540, "full hd backgrounds should downscale to the acrylic render cap");

  const small = resolveAcrylicRenderSize(640, 360);
  assert(small.width === 640 && small.height === 360, "small backgrounds should not be upscaled");

  const levels = createDualKawaseLevels(960, 540);
  assert(levels.map((level) => `${level.width}x${level.height}`).join(",") === "480x270,240x135,120x68,60x34", "dual kawase levels should halve each pass");
  const twoPassLevels = createDualKawaseLevels(960, 540, 2);
  assert(twoPassLevels.map((level) => `${level.width}x${level.height}`).join(",") === "480x270,240x135", "dual kawase levels should honor the configured pass count");
  assert(Math.abs(resolveBlurOffsetScale(0) - 0.1) < 0.0001, "zero blur strength should clamp to the lightest blur offset scale");
  assert(Math.abs(resolveBlurOffsetScale(1) - 0.1) < 0.0001, "minimum blur strength should use the lightest blur offset scale");
  assert(Math.abs(resolveBlurOffsetScale(25) - 0.5408) < 0.0001, "lower blur strength should increase the blur radius linearly");
  assert(Math.abs(resolveBlurOffsetScale(50) - 1) < 0.0001, "default blur strength should preserve the original blur offset scale");
  assert(Math.abs(resolveBlurOffsetScale(75) - 1.275) < 0.0001, "upper blur strength should increase the blur radius linearly");
  assert(Math.abs(resolveBlurOffsetScale(100) - 1.55) < 0.0001, "maximum blur strength should use the strongest blur offset scale");
  assert(Math.abs(resolveBlurOffsetScale("bad") - 1) < 0.0001, "invalid blur strength should fall back to the default blur offset scale");

  const wideCover = resolveCoverLayout(1600, 900, 500, 500);
  assert(Math.round(wideCover.width) === 889 && wideCover.height === 500, "wide images should cover square targets by height");
  assert(Math.round(wideCover.x) === -194 && wideCover.y === 0, "wide cover layout should center crop horizontally");

  assert(resolveAcrylicBackgroundAlpha(72) === 0.72, "background alpha should derive from configured opacity");
  assert(resolveAcrylicBackgroundAlpha(120) === 1, "background alpha should clamp to one");

  const blurPlan = createBackgroundEffectPlan({
    effect: BACKGROUND_EFFECT_BLUR,
    blurStrength: 75,
    opacity: 72,
  });
  assert(blurPlan.effect === BACKGROUND_EFFECT_BLUR, "effect plan should preserve the normalized effect");
  assert(blurPlan.opacity === 0.72, "effect plan should expose normalized opacity");
  assert(Math.abs(blurPlan.blur.offsetScale - 1.275) < 0.0001, "effect plan should expose dual kawase blur offset scale");
  assert(blurPlan.blur.downOffsets.length === 4, "effect plan should include down pass offsets");
  assert(!blurPlan.acrylic.enabled, "blur effect plans should not enable acrylic composite");

  const acrylicPlan = createBackgroundEffectPlan({
    effect: BACKGROUND_EFFECT_ACRYLIC_WEBGL,
    opacity: 37,
    acrylicParams: {
      brightness: 1.2,
      tintColor: "#336699",
      tintStrength: 0.4,
    },
  });
  assert(acrylicPlan.acrylic.enabled, "acrylic effect plans should enable acrylic composite");
  assert(acrylicPlan.acrylic.alpha === 0.37, "acrylic effect plan should carry alpha for composite");
  assert(Math.abs(acrylicPlan.acrylic.tintColor[1] - 0.4) < 0.0001, "acrylic effect plan should normalize tint color");

  const kawaseOverridePlan = createBackgroundEffectPlan({
    effect: BACKGROUND_EFFECT_ACRYLIC_WEBGL,
    dualKawaseParams: {
      offsetScale: 0.53,
      passCount: 3,
    },
  });
  assert(kawaseOverridePlan.blur.passCount === 3, "effect plan should accept a debug dual kawase pass count");
  assert(Math.abs(kawaseOverridePlan.blur.offsetScale - 0.53) < 0.0001, "effect plan should accept a debug dual kawase radius scale");
  assert(Math.abs(kawaseOverridePlan.blur.downOffsets[1] - 0.7155) < 0.0001, "effect plan should scale down pass offsets from the debug radius scale");

  const clampedKawasePlan = createBackgroundEffectPlan({
    effect: BACKGROUND_EFFECT_ACRYLIC_WEBGL,
    dualKawaseParams: {
      offsetScale: 20,
      passCount: 12,
    },
  });
  assert(clampedKawasePlan.blur.passCount === 4, "effect plan should clamp debug dual kawase pass count");
  assert(clampedKawasePlan.blur.offsetScale === 2, "effect plan should clamp debug dual kawase radius scale");

  assert(shouldUsePixiBackgroundEffect({
    effect: BACKGROUND_EFFECT_ACRYLIC_WEBGL,
    source: BACKGROUND_SOURCE_CUSTOM_IMAGE,
    imageUrl: "asset://wallpaper",
  }), "webgl acrylic should be enabled for image backgrounds");
  assert(shouldUsePixiBackgroundEffect({
    effect: BACKGROUND_EFFECT_BLUR,
    source: BACKGROUND_SOURCE_CUSTOM_IMAGE,
    imageUrl: "asset://wallpaper",
  }), "blur should be enabled for image backgrounds");
  assert(!shouldUsePixiBackgroundEffect({
    effect: BACKGROUND_EFFECT_DIMMED,
    source: BACKGROUND_SOURCE_CUSTOM_IMAGE,
    imageUrl: "asset://wallpaper",
  }), "non-pixi effects should not use the pixi background renderer");
  assert(!shouldUsePixiBackgroundEffect({
    effect: BACKGROUND_EFFECT_ACRYLIC_WEBGL,
    source: BACKGROUND_SOURCE_SYSTEM_MATERIAL,
    imageUrl: "asset://wallpaper",
  }), "system material backgrounds should not use the pixi background renderer");
}
