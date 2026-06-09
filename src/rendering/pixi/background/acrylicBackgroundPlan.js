import {
  backgroundEffectUsesPixi,
  backgroundSourceUsesImage,
  clampBackgroundImageOpacity,
} from "../../../composables/useLaunchpadSettingsConfig.js";

export const ACRYLIC_RENDER_MAX_WIDTH = 960;
export const ACRYLIC_RENDER_MAX_HEIGHT = 540;
export const DUAL_KAWASE_PASS_COUNT = 4;
export const DUAL_KAWASE_MIN_SIZE = 16;

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

export function createDualKawaseLevels(width, height, passCount = DUAL_KAWASE_PASS_COUNT) {
  const levels = [];
  let currentWidth = Math.max(1, Math.round(Number(width) || 1));
  let currentHeight = Math.max(1, Math.round(Number(height) || 1));
  const count = Math.max(1, Math.floor(Number(passCount) || DUAL_KAWASE_PASS_COUNT));
  for (let index = 0; index < count; index += 1) {
    currentWidth = Math.max(DUAL_KAWASE_MIN_SIZE, Math.round(currentWidth / 2));
    currentHeight = Math.max(DUAL_KAWASE_MIN_SIZE, Math.round(currentHeight / 2));
    levels.push({ width: currentWidth, height: currentHeight });
    if (currentWidth === DUAL_KAWASE_MIN_SIZE && currentHeight === DUAL_KAWASE_MIN_SIZE) break;
  }
  return levels;
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

export function shouldUsePixiBackgroundEffect(config) {
  return Boolean(
    backgroundEffectUsesPixi(config?.effect)
    && backgroundSourceUsesImage(config?.source)
    && config?.imageUrl
  );
}
