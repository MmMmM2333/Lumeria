import { reactive, readonly, ref } from "vue";
import {
  DEFAULT_ACRYLIC_COMPOSITE_PARAMS,
  hexToRgbArray,
  normalizeAcrylicCompositeParams,
  rgbArrayToHex,
} from "./acrylicParams.js";

export { hexToRgbArray, rgbArrayToHex };

export const isAcrylicDebugEnabled = Boolean(import.meta.env?.DEV);

const debugParams = reactive({
  ...DEFAULT_ACRYLIC_COMPOSITE_PARAMS,
  tintColor: [...DEFAULT_ACRYLIC_COMPOSITE_PARAMS.tintColor],
});
const isDebugOverrideEnabled = ref(false);

function copyParams(params) {
  return {
    ...params,
    tintColor: [...params.tintColor],
  };
}

export function useAcrylicDebugParams() {
  return readonly(debugParams);
}

export function useAcrylicDebugOverrideEnabled() {
  return readonly(isDebugOverrideEnabled);
}

export function getAcrylicDebugParams() {
  return copyParams(normalizeAcrylicCompositeParams(debugParams));
}

export function setAcrylicDebugOverrideEnabled(enabled) {
  if (!isAcrylicDebugEnabled) return;
  isDebugOverrideEnabled.value = Boolean(enabled);
}

export function updateAcrylicDebugParams(patch) {
  if (!isAcrylicDebugEnabled) return;
  const normalized = normalizeAcrylicCompositeParams(patch, debugParams);
  debugParams.brightness = normalized.brightness;
  debugParams.contrast = normalized.contrast;
  debugParams.noise = normalized.noise;
  debugParams.saturation = normalized.saturation;
  debugParams.seed = normalized.seed;
  debugParams.tintColor = normalized.tintColor;
  debugParams.tintStrength = normalized.tintStrength;
}

export function resetAcrylicDebugParams() {
  updateAcrylicDebugParams(DEFAULT_ACRYLIC_COMPOSITE_PARAMS);
}

export function formatAcrylicDebugParams() {
  return JSON.stringify(getAcrylicDebugParams(), null, 2);
}
