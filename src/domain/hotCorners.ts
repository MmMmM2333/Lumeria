export const HOT_CORNER_MAX_DELAY_MS = 10_000;
export const HOT_CORNER_DELAY_PRESETS = [0, 80, 100, 200, 500] as const;

export type HotCornerSettings = Readonly<{
  enabled: boolean;
  corners: number;
  delayMs: number;
  modifier: "none" | "alt" | "control" | "shift";
  pauseFullscreen: boolean;
  toggle: boolean;
  allowSeams?: boolean;
}>;

export const DEFAULT_HOT_CORNERS: HotCornerSettings = Object.freeze({
  enabled: false, corners: 1, delayMs: 80, modifier: "none", pauseFullscreen: true, toggle: false, allowSeams: false,
});

export function assertHotCornerSettings(value: unknown): asserts value is HotCornerSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid hot corner settings");
  const v = value as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_HOT_CORNERS).filter(key=>key!=="allowSeams");
  if (Object.keys(v).some(key=>!keys.includes(key)&&key!=="allowSeams") || (Object.hasOwn(v,"allowSeams")&&typeof v.allowSeams!=="boolean") || keys.some(key => !Object.hasOwn(v, key))
    || typeof v.enabled !== "boolean" || typeof v.pauseFullscreen !== "boolean" || typeof v.toggle !== "boolean"
    || !Number.isInteger(v.corners) || Number(v.corners) < 0 || Number(v.corners) > 15 || (v.enabled && v.corners === 0)
    || typeof v.delayMs !== "number" || !Number.isInteger(v.delayMs) || v.delayMs < 0 || v.delayMs > HOT_CORNER_MAX_DELAY_MS
    || typeof v.modifier !== "string" || !["none", "alt", "control", "shift"].includes(v.modifier)) throw new TypeError("Invalid hot corner settings");
}

export function readHotCornerSettings(value: unknown): HotCornerSettings {
  if (value === undefined) return { ...DEFAULT_HOT_CORNERS };
  assertHotCornerSettings(value);
  return { ...value, allowSeams:value.allowSeams??false };
}
