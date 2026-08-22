import { reactive, readonly, ref } from "vue";
import {
  DEFAULT_ACRYLIC_COMPOSITE_PARAMS,
  hexToRgbArray,
  normalizeAcrylicCompositeParams,
  rgbArrayToHex,
} from "./acrylicParams.js";

export { hexToRgbArray, rgbArrayToHex };

export const isAcrylicDebugEnabled = Boolean(import.meta.env?.DEV);

type AcrylicParameters = ReturnType<typeof normalizeAcrylicCompositeParams>;

function copyParams(params: AcrylicParameters): AcrylicParameters {
  return {
    ...params,
    tintColor: [params.tintColor[0], params.tintColor[1], params.tintColor[2]],
  };
}

const debugParams = reactive<AcrylicParameters>(copyParams(DEFAULT_ACRYLIC_COMPOSITE_PARAMS));
const isDebugOverrideEnabled = ref(false);

export function useAcrylicDebugParams() {
  return readonly(debugParams);
}

export function useAcrylicDebugOverrideEnabled() {
  return readonly(isDebugOverrideEnabled);
}

export function getAcrylicDebugParams(): AcrylicParameters {
  return copyParams(normalizeAcrylicCompositeParams(debugParams));
}

export function setAcrylicDebugOverrideEnabled(enabled: unknown): void {
  if (!isAcrylicDebugEnabled) return;
  isDebugOverrideEnabled.value = Boolean(enabled);
}

export function updateAcrylicDebugParams(patch: unknown): void {
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

export function resetAcrylicDebugParams(): void {
  updateAcrylicDebugParams(DEFAULT_ACRYLIC_COMPOSITE_PARAMS);
}

export function formatAcrylicDebugParams(): string {
  return JSON.stringify(getAcrylicDebugParams(), null, 2);
}
