import { reactive, readonly, ref } from "vue";
import {
  BLUR_KERNEL_DUAL_KAWASE,
  DUAL_KAWASE_OFFSET_SCALE_MAX,
  DUAL_KAWASE_OFFSET_SCALE_MIN,
  DUAL_KAWASE_PASS_COUNT,
  DUAL_KAWASE_PASS_COUNT_MIN,
  GAUSSIAN_BLUR_RADIUS_PX_DEFAULT,
  GAUSSIAN_BLUR_RADIUS_PX_MAX,
  GAUSSIAN_BLUR_RADIUS_PX_MIN,
  normalizeBlurEffectParams,
} from "../../../domain/backgroundEffectPlan.js";

export const isKawaseDebugEnabled = Boolean(import.meta.env?.DEV);

export const DEFAULT_KAWASE_DEBUG_PARAMS = Object.freeze({
  gaussianRadiusPx: GAUSSIAN_BLUR_RADIUS_PX_DEFAULT,
  kernel: BLUR_KERNEL_DUAL_KAWASE,
  offsetScale: 1,
  passCount: DUAL_KAWASE_PASS_COUNT,
});

const debugParams = reactive({ ...DEFAULT_KAWASE_DEBUG_PARAMS });
const isDebugOverrideEnabled = ref(false);

function copyParams(params) {
  return { ...params };
}

export function useKawaseDebugParams() {
  return readonly(debugParams);
}

export function useKawaseDebugOverrideEnabled() {
  return readonly(isDebugOverrideEnabled);
}

export function getKawaseDebugParams() {
  return copyParams(normalizeBlurEffectParams(debugParams, DEFAULT_KAWASE_DEBUG_PARAMS));
}

export function getKawaseDebugEffectPlanParams() {
  if (!isKawaseDebugEnabled || !isDebugOverrideEnabled.value) return null;
  return getKawaseDebugParams();
}

export function setKawaseDebugOverrideEnabled(enabled) {
  if (!isKawaseDebugEnabled) return;
  isDebugOverrideEnabled.value = Boolean(enabled);
}

export function updateKawaseDebugParams(patch) {
  if (!isKawaseDebugEnabled) return;
  const normalized = normalizeBlurEffectParams(patch, debugParams);
  debugParams.gaussianRadiusPx = normalized.gaussianRadiusPx;
  debugParams.kernel = normalized.kernel;
  debugParams.offsetScale = normalized.offsetScale;
  debugParams.passCount = normalized.passCount;
}

export function resetKawaseDebugParams() {
  updateKawaseDebugParams(DEFAULT_KAWASE_DEBUG_PARAMS);
}

export function formatKawaseDebugParams() {
  return JSON.stringify(getKawaseDebugParams(), null, 2);
}

export const KAWASE_DEBUG_OFFSET_SCALE_MIN = DUAL_KAWASE_OFFSET_SCALE_MIN;
export const KAWASE_DEBUG_OFFSET_SCALE_MAX = DUAL_KAWASE_OFFSET_SCALE_MAX;
export const KAWASE_DEBUG_PASS_COUNT_MIN = DUAL_KAWASE_PASS_COUNT_MIN;
export const KAWASE_DEBUG_PASS_COUNT_MAX = DUAL_KAWASE_PASS_COUNT;
export const KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MIN = GAUSSIAN_BLUR_RADIUS_PX_MIN;
export const KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MAX = GAUSSIAN_BLUR_RADIUS_PX_MAX;
