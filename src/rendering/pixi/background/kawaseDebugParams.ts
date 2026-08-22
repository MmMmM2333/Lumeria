import { reactive, readonly, ref } from "vue";
import {
  BACKGROUND_BLUR_STRENGTH_MAX,
  BACKGROUND_BLUR_STRENGTH_MIN,
  DEFAULT_BACKGROUND_BLUR_STRENGTH,
} from "../../../domain/backgroundSettings.js";
import {
  ACRYLIC_GAUSSIAN_CUTOFF_DEFAULT,
  AUTO_DUAL_KAWASE_OFFSET_SCALE_DEFAULT,
  BLUR_GAUSSIAN_CUTOFF_DEFAULT,
  BLUR_KERNEL_AUTO,
  GAUSSIAN_BLUR_RADIUS_AUTO_MAX_DEFAULT,
  DUAL_KAWASE_OFFSET_SCALE_MAX,
  DUAL_KAWASE_OFFSET_SCALE_MIN,
  DUAL_KAWASE_PASS_COUNT,
  DUAL_KAWASE_PASS_COUNT_MIN,
  GAUSSIAN_BLUR_RADIUS_PX_DEFAULT,
  GAUSSIAN_BLUR_RADIUS_PX_MAX,
  GAUSSIAN_BLUR_RADIUS_PX_MIN,
  GAUSSIAN_BLUR_RADIUS_SCALE_DEFAULT,
  GAUSSIAN_BLUR_RADIUS_SCALE_MAX,
  GAUSSIAN_BLUR_RADIUS_SCALE_MIN,
  normalizeBlurEffectParams,
} from "../../../domain/backgroundEffectPlan.js";
import type { BlurEffectParams } from "../../../domain/backgroundEffectPlan.js";

export const isKawaseDebugEnabled = Boolean(import.meta.env?.DEV);

export const DEFAULT_KAWASE_DEBUG_PARAMS: Readonly<BlurEffectParams> = Object.freeze({
  acrylicGaussianCutoff: ACRYLIC_GAUSSIAN_CUTOFF_DEFAULT,
  gaussianCutoff: BLUR_GAUSSIAN_CUTOFF_DEFAULT,
  gaussianMaxRadiusPx: GAUSSIAN_BLUR_RADIUS_AUTO_MAX_DEFAULT,
  gaussianRadiusPx: GAUSSIAN_BLUR_RADIUS_PX_DEFAULT,
  gaussianRadiusScale: GAUSSIAN_BLUR_RADIUS_SCALE_DEFAULT,
  kernel: BLUR_KERNEL_AUTO,
  offsetScale: AUTO_DUAL_KAWASE_OFFSET_SCALE_DEFAULT,
  passCount: DUAL_KAWASE_PASS_COUNT,
  testStrength: DEFAULT_BACKGROUND_BLUR_STRENGTH,
});

const debugParams = reactive<BlurEffectParams>({ ...DEFAULT_KAWASE_DEBUG_PARAMS });
const isDebugOverrideEnabled = ref(false);

function copyParams(params: BlurEffectParams): BlurEffectParams {
  return { ...params };
}

export function useKawaseDebugParams() {
  return readonly(debugParams);
}

export function useKawaseDebugOverrideEnabled() {
  return readonly(isDebugOverrideEnabled);
}

export function getKawaseDebugParams(): BlurEffectParams {
  return copyParams(normalizeBlurEffectParams(debugParams, DEFAULT_KAWASE_DEBUG_PARAMS));
}

export function getKawaseDebugEffectPlanParams(): BlurEffectParams | null {
  if (!isKawaseDebugEnabled || !isDebugOverrideEnabled.value) return null;
  return getKawaseDebugParams();
}

export function setKawaseDebugOverrideEnabled(enabled: unknown): void {
  if (!isKawaseDebugEnabled) return;
  isDebugOverrideEnabled.value = Boolean(enabled);
}

export function updateKawaseDebugParams(patch: unknown): void {
  if (!isKawaseDebugEnabled) return;
  const normalized = normalizeBlurEffectParams(patch, debugParams);
  debugParams.acrylicGaussianCutoff = normalized.acrylicGaussianCutoff;
  debugParams.gaussianCutoff = normalized.gaussianCutoff;
  debugParams.gaussianMaxRadiusPx = normalized.gaussianMaxRadiusPx;
  debugParams.gaussianRadiusPx = normalized.gaussianRadiusPx;
  debugParams.gaussianRadiusScale = normalized.gaussianRadiusScale;
  debugParams.kernel = normalized.kernel;
  debugParams.offsetScale = normalized.offsetScale;
  debugParams.passCount = normalized.passCount;
  debugParams.testStrength = normalized.testStrength;
}

export function resetKawaseDebugParams(): void {
  updateKawaseDebugParams(DEFAULT_KAWASE_DEBUG_PARAMS);
}

export function formatKawaseDebugParams(): string {
  return JSON.stringify(getKawaseDebugParams(), null, 2);
}

export const KAWASE_DEBUG_OFFSET_SCALE_MIN = DUAL_KAWASE_OFFSET_SCALE_MIN;
export const KAWASE_DEBUG_OFFSET_SCALE_MAX = DUAL_KAWASE_OFFSET_SCALE_MAX;
export const KAWASE_DEBUG_PASS_COUNT_MIN = DUAL_KAWASE_PASS_COUNT_MIN;
export const KAWASE_DEBUG_PASS_COUNT_MAX = DUAL_KAWASE_PASS_COUNT;
export const KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MIN = GAUSSIAN_BLUR_RADIUS_PX_MIN;
export const KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MAX = GAUSSIAN_BLUR_RADIUS_PX_MAX;
export const KAWASE_DEBUG_GAUSSIAN_CUTOFF_MIN = BACKGROUND_BLUR_STRENGTH_MIN;
export const KAWASE_DEBUG_GAUSSIAN_CUTOFF_MAX = BACKGROUND_BLUR_STRENGTH_MAX;
export const KAWASE_DEBUG_TEST_STRENGTH_MIN = BACKGROUND_BLUR_STRENGTH_MIN;
export const KAWASE_DEBUG_TEST_STRENGTH_MAX = BACKGROUND_BLUR_STRENGTH_MAX;
export const KAWASE_DEBUG_GAUSSIAN_RADIUS_SCALE_MIN = GAUSSIAN_BLUR_RADIUS_SCALE_MIN;
export const KAWASE_DEBUG_GAUSSIAN_RADIUS_SCALE_MAX = GAUSSIAN_BLUR_RADIUS_SCALE_MAX;
export const KAWASE_DEBUG_BLUR_KERNEL_AUTO = BLUR_KERNEL_AUTO;
