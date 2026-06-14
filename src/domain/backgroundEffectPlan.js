import {
  BACKGROUND_BLUR_STRENGTH_MAX,
  BACKGROUND_BLUR_STRENGTH_MIN,
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  backgroundEffectUsesPixi,
  backgroundSourceUsesImage,
  clampBackgroundBlurStrength,
  clampBackgroundImageOpacity,
  normalizeBackgroundEffect,
} from "../composables/useLaunchpadSettingsConfig.js";
import { normalizeAcrylicCompositeParams } from "../rendering/pixi/background/acrylicParams.js";

export const ACRYLIC_RENDER_MAX_WIDTH = 960;
export const ACRYLIC_RENDER_MAX_HEIGHT = 540;
export const BLUR_KERNEL_DUAL_KAWASE = "dualKawase";
export const BLUR_KERNEL_GAUSSIAN = "gaussian";
export const BLUR_KERNEL_AUTO = "auto";
export const DUAL_KAWASE_PASS_COUNT = 4;
export const DUAL_KAWASE_PASS_COUNT_MIN = 1;
export const DUAL_KAWASE_MIN_SIZE = 16;
export const DUAL_KAWASE_OFFSET_SCALE_MIN = 0.02;
export const DUAL_KAWASE_OFFSET_SCALE_MAX = 2;
export const DUAL_KAWASE_BLUR_OFFSET_SCALE_MIN = 0.1;
export const DUAL_KAWASE_BLUR_OFFSET_SCALE_MAX = 1.55;
export const GAUSSIAN_BLUR_RADIUS_PX_DEFAULT = 4;
export const GAUSSIAN_BLUR_RADIUS_PX_MIN = 0;
export const GAUSSIAN_BLUR_RADIUS_PX_MAX = 32;
export const BLUR_GAUSSIAN_CUTOFF_DEFAULT = 50;
export const ACRYLIC_GAUSSIAN_CUTOFF_DEFAULT = 50;
export const GAUSSIAN_BLUR_RADIUS_SCALE_DEFAULT = 0.42;
export const GAUSSIAN_BLUR_RADIUS_SCALE_MIN = 0.05;
export const GAUSSIAN_BLUR_RADIUS_SCALE_MAX = 1;
export const GAUSSIAN_BLUR_RADIUS_AUTO_MAX_DEFAULT = 32;

export function resolveAcrylicRenderSize(width, height, maxWidth = ACRYLIC_RENDER_MAX_WIDTH, maxHeight = ACRYLIC_RENDER_MAX_HEIGHT) {
  const sourceWidth = Math.max(1, Number(width) || 1);
  const sourceHeight = Math.max(1, Number(height) || 1);
  const widthLimit = Math.max(1, Number(maxWidth) || ACRYLIC_RENDER_MAX_WIDTH);
  const heightLimit = Math.max(1, Number(maxHeight) || ACRYLIC_RENDER_MAX_HEIGHT);
  const scale = Math.min(1, widthLimit / sourceWidth, heightLimit / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function createDualKawaseLevels(width, height, passCount = DUAL_KAWASE_PASS_COUNT, minSize = DUAL_KAWASE_MIN_SIZE) {
  const levels = [];
  let currentWidth = Math.max(1, Math.round(Number(width) || 1));
  let currentHeight = Math.max(1, Math.round(Number(height) || 1));
  const count = clampDualKawasePassCount(passCount);
  const minimumSize = Math.max(1, Math.floor(Number(minSize) || DUAL_KAWASE_MIN_SIZE));
  for (let index = 0; index < count; index += 1) {
    currentWidth = Math.max(minimumSize, Math.round(currentWidth / 2));
    currentHeight = Math.max(minimumSize, Math.round(currentHeight / 2));
    levels.push({ width: currentWidth, height: currentHeight });
    if (currentWidth === minimumSize && currentHeight === minimumSize) break;
  }
  return levels;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function clampDualKawasePassCount(value, fallback = DUAL_KAWASE_PASS_COUNT) {
  const count = Number(value);
  if (!Number.isFinite(count)) return clampDualKawasePassCount(fallback, DUAL_KAWASE_PASS_COUNT);
  return Math.min(DUAL_KAWASE_PASS_COUNT, Math.max(DUAL_KAWASE_PASS_COUNT_MIN, Math.floor(count)));
}

export function clampDualKawaseOffsetScale(value, fallback = 1) {
  return clampNumber(value, DUAL_KAWASE_OFFSET_SCALE_MIN, DUAL_KAWASE_OFFSET_SCALE_MAX, fallback);
}

export function normalizeBlurKernel(value, fallback = BLUR_KERNEL_DUAL_KAWASE) {
  if (value === BLUR_KERNEL_AUTO) return BLUR_KERNEL_AUTO;
  if (value === BLUR_KERNEL_GAUSSIAN) return BLUR_KERNEL_GAUSSIAN;
  if (value === BLUR_KERNEL_DUAL_KAWASE) return BLUR_KERNEL_DUAL_KAWASE;
  if (fallback === BLUR_KERNEL_AUTO) return BLUR_KERNEL_AUTO;
  return fallback === BLUR_KERNEL_GAUSSIAN ? BLUR_KERNEL_GAUSSIAN : BLUR_KERNEL_DUAL_KAWASE;
}

export function clampGaussianBlurRadiusPx(value, fallback = GAUSSIAN_BLUR_RADIUS_PX_DEFAULT) {
  return clampNumber(value, GAUSSIAN_BLUR_RADIUS_PX_MIN, GAUSSIAN_BLUR_RADIUS_PX_MAX, fallback);
}

export function clampGaussianBlurCutoff(value, fallback = BLUR_GAUSSIAN_CUTOFF_DEFAULT) {
  return clampNumber(value, BACKGROUND_BLUR_STRENGTH_MIN, BACKGROUND_BLUR_STRENGTH_MAX, fallback);
}

export function clampGaussianBlurRadiusScale(value, fallback = GAUSSIAN_BLUR_RADIUS_SCALE_DEFAULT) {
  return clampNumber(value, GAUSSIAN_BLUR_RADIUS_SCALE_MIN, GAUSSIAN_BLUR_RADIUS_SCALE_MAX, fallback);
}

function normalizeOptionalBlurStrength(value, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback == null ? null : clampBackgroundBlurStrength(fallback);
  }
  return clampBackgroundBlurStrength(number);
}

export function resolveAutoBlurKernel(effect, strength, blur) {
  const normalizedEffect = normalizeBackgroundEffect(effect);
  const normalizedStrength = clampBackgroundBlurStrength(strength);
  const cutoff = normalizedEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL
    ? clampGaussianBlurCutoff(blur?.acrylicGaussianCutoff, ACRYLIC_GAUSSIAN_CUTOFF_DEFAULT)
    : clampGaussianBlurCutoff(blur?.gaussianCutoff, BLUR_GAUSSIAN_CUTOFF_DEFAULT);
  return normalizedStrength <= cutoff ? BLUR_KERNEL_GAUSSIAN : BLUR_KERNEL_DUAL_KAWASE;
}

export function resolveAutoGaussianRadiusPx(strength, blur) {
  const radiusScale = clampGaussianBlurRadiusScale(blur?.gaussianRadiusScale);
  const maxRadius = clampGaussianBlurRadiusPx(
    blur?.gaussianMaxRadiusPx,
    GAUSSIAN_BLUR_RADIUS_AUTO_MAX_DEFAULT
  );
  return Math.min(
    maxRadius,
    clampGaussianBlurRadiusPx(clampBackgroundBlurStrength(strength) * radiusScale)
  );
}

export function resolveAutoDualKawaseOffsetScale(effect, strength, blur) {
  const normalizedEffect = normalizeBackgroundEffect(effect);
  const normalizedStrength = clampBackgroundBlurStrength(strength);
  const cutoff = normalizedEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL
    ? clampGaussianBlurCutoff(blur?.acrylicGaussianCutoff, ACRYLIC_GAUSSIAN_CUTOFF_DEFAULT)
    : clampGaussianBlurCutoff(blur?.gaussianCutoff, BLUR_GAUSSIAN_CUTOFF_DEFAULT);
  const baseScale = clampDualKawaseOffsetScale(blur?.offsetScale, DUAL_KAWASE_BLUR_OFFSET_SCALE_MIN);
  const maxScale = Math.max(baseScale, DUAL_KAWASE_BLUR_OFFSET_SCALE_MAX);
  if (cutoff >= BACKGROUND_BLUR_STRENGTH_MAX || normalizedStrength <= cutoff) return baseScale;
  const progress = (normalizedStrength - cutoff) / (BACKGROUND_BLUR_STRENGTH_MAX - cutoff);
  return clampDualKawaseOffsetScale(baseScale + progress * (maxScale - baseScale));
}

export function normalizeDualKawaseParams(params = {}, fallback = {}) {
  const source = params && typeof params === "object" ? params : {};
  return {
    offsetScale: clampDualKawaseOffsetScale(
      source.offsetScale,
      clampDualKawaseOffsetScale(fallback.offsetScale, 1)
    ),
    passCount: clampDualKawasePassCount(
      source.passCount,
      clampDualKawasePassCount(fallback.passCount, DUAL_KAWASE_PASS_COUNT)
    ),
  };
}

export function normalizeBlurEffectParams(params = {}, fallback = {}) {
  const source = params && typeof params === "object" ? params : {};
  const dualKawase = normalizeDualKawaseParams(source, fallback);
  return {
    ...dualKawase,
    gaussianRadiusPx: clampGaussianBlurRadiusPx(
      source.gaussianRadiusPx,
      clampGaussianBlurRadiusPx(fallback.gaussianRadiusPx, GAUSSIAN_BLUR_RADIUS_PX_DEFAULT)
    ),
    gaussianCutoff: clampGaussianBlurCutoff(
      source.gaussianCutoff,
      clampGaussianBlurCutoff(fallback.gaussianCutoff, BLUR_GAUSSIAN_CUTOFF_DEFAULT)
    ),
    acrylicGaussianCutoff: clampGaussianBlurCutoff(
      source.acrylicGaussianCutoff,
      clampGaussianBlurCutoff(fallback.acrylicGaussianCutoff, ACRYLIC_GAUSSIAN_CUTOFF_DEFAULT)
    ),
    gaussianRadiusScale: clampGaussianBlurRadiusScale(
      source.gaussianRadiusScale,
      clampGaussianBlurRadiusScale(fallback.gaussianRadiusScale, GAUSSIAN_BLUR_RADIUS_SCALE_DEFAULT)
    ),
    gaussianMaxRadiusPx: clampGaussianBlurRadiusPx(
      source.gaussianMaxRadiusPx,
      clampGaussianBlurRadiusPx(fallback.gaussianMaxRadiusPx, GAUSSIAN_BLUR_RADIUS_AUTO_MAX_DEFAULT)
    ),
    testStrength: normalizeOptionalBlurStrength(source.testStrength, fallback.testStrength),
    kernel: normalizeBlurKernel(source.kernel, normalizeBlurKernel(fallback.kernel)),
  };
}

export function resolveBlurOffsetScale(strength) {
  const normalizedStrength = clampBackgroundBlurStrength(strength);
  if (normalizedStrength <= 50) {
    return DUAL_KAWASE_BLUR_OFFSET_SCALE_MIN
      + ((normalizedStrength - 1) / 49) * (1 - DUAL_KAWASE_BLUR_OFFSET_SCALE_MIN);
  }
  return 1 + ((normalizedStrength - 50) / 50) * (DUAL_KAWASE_BLUR_OFFSET_SCALE_MAX - 1);
}

export function resolveCoverLayout(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const safeSourceWidth = Math.max(1, Number(sourceWidth) || 1);
  const safeSourceHeight = Math.max(1, Number(sourceHeight) || 1);
  const safeTargetWidth = Math.max(1, Number(targetWidth) || 1);
  const safeTargetHeight = Math.max(1, Number(targetHeight) || 1);
  const scale = Math.max(safeTargetWidth / safeSourceWidth, safeTargetHeight / safeSourceHeight);
  const width = safeSourceWidth * scale;
  const height = safeSourceHeight * scale;
  return {
    height,
    width,
    x: (safeTargetWidth - width) / 2,
    y: (safeTargetHeight - height) / 2,
  };
}

export function resolveAcrylicBackgroundAlpha(opacity) {
  return clampBackgroundImageOpacity(opacity) / 100;
}

export function createBackgroundEffectPlan(config = {}) {
  const effect = normalizeBackgroundEffect(config.effect ?? config.backgroundEffect);
  const opacity = resolveAcrylicBackgroundAlpha(config.opacity ?? config.backgroundImageOpacity);
  const blurStrength = clampBackgroundBlurStrength(config.blurStrength ?? config.backgroundBlurStrength);
  const defaultBlurOffsetScale = effect === BACKGROUND_EFFECT_BLUR
    ? resolveBlurOffsetScale(blurStrength)
    : 1;
  const blurParams = normalizeBlurEffectParams(
    config.dualKawaseParams ?? config.dualKawase,
    {
      gaussianRadiusPx: GAUSSIAN_BLUR_RADIUS_PX_DEFAULT,
      gaussianCutoff: BLUR_GAUSSIAN_CUTOFF_DEFAULT,
      acrylicGaussianCutoff: ACRYLIC_GAUSSIAN_CUTOFF_DEFAULT,
      gaussianRadiusScale: GAUSSIAN_BLUR_RADIUS_SCALE_DEFAULT,
      gaussianMaxRadiusPx: GAUSSIAN_BLUR_RADIUS_AUTO_MAX_DEFAULT,
      kernel: BLUR_KERNEL_DUAL_KAWASE,
      offsetScale: defaultBlurOffsetScale,
      passCount: DUAL_KAWASE_PASS_COUNT,
      testStrength: null,
    }
  );
  const autoStrength = blurParams.testStrength == null ? blurStrength : blurParams.testStrength;
  const effectiveKernel = blurParams.kernel === BLUR_KERNEL_AUTO
    ? resolveAutoBlurKernel(effect, autoStrength, blurParams)
    : blurParams.kernel;
  const gaussianRadiusPx = blurParams.kernel === BLUR_KERNEL_AUTO
    ? resolveAutoGaussianRadiusPx(autoStrength, blurParams)
    : blurParams.gaussianRadiusPx;
  const offsetScale = blurParams.kernel === BLUR_KERNEL_AUTO && effectiveKernel === BLUR_KERNEL_DUAL_KAWASE
    ? resolveAutoDualKawaseOffsetScale(effect, autoStrength, blurParams)
    : blurParams.offsetScale;
  const acrylic = normalizeAcrylicCompositeParams(config.acrylicParams ?? config.backgroundAcrylicParams);

  return {
    effect,
    opacity,
    blur: {
      strength: blurStrength,
      renderMaxWidth: ACRYLIC_RENDER_MAX_WIDTH,
      renderMaxHeight: ACRYLIC_RENDER_MAX_HEIGHT,
      kernel: effectiveKernel,
      requestedKernel: blurParams.kernel,
      gaussianRadiusPx,
      gaussianCutoff: blurParams.gaussianCutoff,
      acrylicGaussianCutoff: blurParams.acrylicGaussianCutoff,
      gaussianRadiusScale: blurParams.gaussianRadiusScale,
      gaussianMaxRadiusPx: blurParams.gaussianMaxRadiusPx,
      testStrength: blurParams.testStrength,
      autoStrength,
      passCount: blurParams.passCount,
      minSize: DUAL_KAWASE_MIN_SIZE,
      offsetScale,
      downOffsets: [1, 1.35, 1.7, 2.05].map((offset) => offset * offsetScale),
      upOffsets: [1.1, 1.35, 1.6].map((offset) => offset * offsetScale),
      finalUpOffset: 1.25 * offsetScale,
    },
    acrylic: {
      ...acrylic,
      alpha: opacity,
      enabled: effect === BACKGROUND_EFFECT_ACRYLIC_WEBGL,
    },
  };
}

export function shouldUsePixiBackgroundEffect(config) {
  return Boolean(
    backgroundEffectUsesPixi(config?.effect)
    && backgroundSourceUsesImage(config?.source)
    && config?.imageUrl
  );
}
