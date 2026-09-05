export function createNumericControlModel(range:Readonly<{min:number;max:number;step:number}>) {
function normalizeValue(value: unknown): number {
  const fallback = Number.isFinite(range.min) ? range.min : 0;
  const number = Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamped = clamp(number, range.min, range.max);
  const step = getSafeStep();
  const base = Number.isFinite(range.min) ? range.min : 0;
  const precision = getStepPrecision(step);
  const stepped = base + Math.round((clamped - base) / step) * step;
  return clamp(Number(stepped.toFixed(precision)), range.min, range.max);
}

function formatValue(value: unknown): string {
  const precision = getStepPrecision(getSafeStep());
  const normalized = normalizeValue(value);
  if (precision <= 0) return String(Math.round(normalized));
  return normalized.toFixed(precision).replace(/\.?0+$/, "");
}

function parseNumber(value: string | number): number {
  if (typeof value !== "string") return Number(value);
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return Number.NaN;
  return Number(normalized);
}

function getSafeStep(): number {
  return Number.isFinite(range.step) && range.step > 0 ? range.step : 1;
}

function getStepPrecision(step: number): number {
  const value = String(step);
  if (value.includes("e-")) {
    return Number(value.split("e-")[1]) || 0;
  }
  return value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
}

function clamp(value: number, min: number, max: number): number {
  const minValue = Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY;
  const maxValue = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
  return Math.min(maxValue, Math.max(minValue, value));
}
  return {normalizeValue,formatValue,parseNumber,getSafeStep,getStepPrecision};
}

