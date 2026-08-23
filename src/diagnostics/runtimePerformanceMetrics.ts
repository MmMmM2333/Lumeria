export type RuntimeMetricSummary = Readonly<{
  count: number;
  maxMs: number;
  meanMs: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
}>;

export type RuntimePerformanceSnapshot = Readonly<{
  elapsedMs: number;
  marks: Readonly<Record<string, number>>;
  metrics: Readonly<Record<string, RuntimeMetricSummary>>;
  schema: "lumeria-runtime-performance/v1";
}>;

export type RuntimePerformanceMetrics = Readonly<{
  begin: (name: string) => () => number;
  markOnce: (name: string) => number;
  measure: <Result>(name: string, operation: () => Result) => Result;
  measureAsync: <Result>(name: string, operation: () => Promise<Result>) => Promise<Result>;
  record: (name: string, durationMs: number) => void;
  reset: () => void;
  snapshot: () => RuntimePerformanceSnapshot;
}>;

type RuntimePerformanceOptions = Readonly<{
  maxSamples?: number;
  now?: () => number;
}>;

const DEFAULT_MAX_SAMPLES = 240;

function normalizeName(name: string): string {
  const value = String(name || "").trim();
  if (!value) throw new TypeError("Runtime metric names must be non-empty strings");
  return value;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] || 0;
}

export function createRuntimePerformanceMetrics(
  options: RuntimePerformanceOptions = {},
): RuntimePerformanceMetrics {
  const now = options.now || (() => globalThis.performance.now());
  const maxSamples = Math.max(1, Math.floor(Number(options.maxSamples) || DEFAULT_MAX_SAMPLES));
  const samplesByName = new Map<string, number[]>();
  const marks = new Map<string, number>();
  let origin = now();

  function record(name: string, durationMs: number): void {
    const normalized = normalizeName(name);
    const duration = Number(durationMs);
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError(`Runtime metric ${normalized} requires a non-negative finite duration`);
    }
    let samples = samplesByName.get(normalized);
    if (!samples) {
      samples = [];
      samplesByName.set(normalized, samples);
    }
    samples.push(duration);
    if (samples.length > maxSamples) samples.splice(0, samples.length - maxSamples);
  }

  function begin(name: string): () => number {
    const normalized = normalizeName(name);
    const startedAt = now();
    let finished = false;
    return () => {
      if (finished) return 0;
      finished = true;
      const duration = Math.max(0, now() - startedAt);
      record(normalized, duration);
      return duration;
    };
  }

  function measure<Result>(name: string, operation: () => Result): Result {
    if (typeof operation !== "function") throw new TypeError("Runtime performance measure requires an operation");
    const finish = begin(name);
    try {
      return operation();
    } finally {
      finish();
    }
  }

  async function measureAsync<Result>(name: string, operation: () => Promise<Result>): Promise<Result> {
    if (typeof operation !== "function") throw new TypeError("Runtime performance measureAsync requires an operation");
    const finish = begin(name);
    try {
      return await operation();
    } finally {
      finish();
    }
  }

  function markOnce(name: string): number {
    const normalized = normalizeName(name);
    const existing = marks.get(normalized);
    if (existing !== undefined) return existing;
    const elapsed = Math.max(0, now() - origin);
    marks.set(normalized, elapsed);
    return elapsed;
  }

  function snapshot(): RuntimePerformanceSnapshot {
    const metrics: Record<string, RuntimeMetricSummary> = {};
    for (const [name, samples] of samplesByName) {
      const sorted = [...samples].sort((left, right) => left - right);
      const total = samples.reduce((sum, sample) => sum + sample, 0);
      metrics[name] = Object.freeze({
        count: samples.length,
        maxMs: round(sorted[sorted.length - 1] || 0),
        meanMs: round(total / Math.max(1, samples.length)),
        minMs: round(sorted[0] || 0),
        p50Ms: round(percentile(sorted, 0.5)),
        p95Ms: round(percentile(sorted, 0.95)),
      });
    }
    return Object.freeze({
      elapsedMs: round(Math.max(0, now() - origin)),
      marks: Object.freeze(Object.fromEntries(Array.from(marks, ([name, elapsed]) => [name, round(elapsed)]))),
      metrics: Object.freeze(metrics),
      schema: "lumeria-runtime-performance/v1" as const,
    });
  }

  function reset(): void {
    samplesByName.clear();
    marks.clear();
    origin = now();
  }

  return Object.freeze({ begin, markOnce, measure, measureAsync, record, reset, snapshot });
}

export const runtimePerformanceMetrics = createRuntimePerformanceMetrics();
