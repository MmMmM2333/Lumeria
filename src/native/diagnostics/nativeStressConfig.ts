export type NativeStressMode = "operations" | "selection" | "surface-copy" | "folders" | "paging" | "recovery" | "mixed" | "recovery-limit" | "background-recovery";
export interface NativeStressConfig {
  mode: NativeStressMode;
  icons: number;
  cycles: number;
  seed: number;
  idleEvery: number;
  idleMs: number;
  settleMs: number;
  screenshotsEvery: number;
  exitOnFailure: boolean;
  windowed: boolean;
  rewarmCheckpoints: boolean;
  gcEvery: number;
  heapSnapshots: boolean;
  motionDiagnosticsOff: boolean;
  warmupCycles: number;
  isolation: "none" | "no-prewarm" | "no-backdrop" | "neither";
}

/** Shared by the launcher and runtime: reject typos before launching a long run. */
export function parseNativeStressOptions(args: readonly string[]): NativeStressConfig {
  const values = new Map<string, string>();
  for (const arg of args.filter(value => value.startsWith("--stress-"))) {
    const [key, ...rest] = arg.slice(9).split("=");
    if (values.has(key!)) throw new Error(`Duplicate stress option: ${key}`);
    values.set(key!, rest.join("="));
  }
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = values.get(key); values.delete(key);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`--stress-${key} must be an integer in [${min}, ${max}]`);
    }
    return value;
  };
  const flag = (key: string) => {
    const value = values.get(key); values.delete(key);
    if (value !== undefined && value !== "") throw new Error(`--stress-${key} does not take a value`);
    return value !== undefined;
  };
  const mode = values.get("mode") ?? "operations"; values.delete("mode");
  const isolation=values.get("isolation")??"none";values.delete("isolation");
  if(!["none","no-prewarm","no-backdrop","neither"].includes(isolation))throw new Error(`Invalid stress isolation: ${isolation}`);
  if(isolation!=="none"&&mode!=="selection")throw new Error("Selection isolation requires selection mode");
  if (!["operations", "selection", "surface-copy", "folders", "paging", "recovery", "mixed", "recovery-limit", "background-recovery"].includes(mode)) throw new Error(`Invalid stress mode: ${mode}`);
  const config: NativeStressConfig = {
    mode: mode as NativeStressMode,
    icons: integer("icons", 800, 200, 5000), cycles: integer("cycles", 100, 1, 100000),
    seed: integer("seed", 20260919, 1, 0xffffffff),
    idleEvery: integer("idle-every", 10, 0, 100000), idleMs: integer("idle-ms", 90000, 0, 600000),
    settleMs: integer("settle-ms", 2000, 0, 60000),
    screenshotsEvery: integer("screenshots-every", 10, 0, 100000),
    exitOnFailure: flag("exit-on-failure"), windowed: flag("windowed"),
    rewarmCheckpoints: flag("rewarm-checkpoints"),
    gcEvery: integer("gc-every", 0, 0, 100000), heapSnapshots: flag("heap-snapshots"),
    motionDiagnosticsOff: flag("motion-diagnostics-off"),
    warmupCycles: integer("warmup-cycles", 0, 0, 100),
    isolation:isolation as NativeStressConfig["isolation"],
  };
  if (config.heapSnapshots && !config.gcEvery) throw new Error("Heap snapshots require --stress-gc-every to isolate diagnostic GC from normal runs");
  if(config.warmupCycles && ["recovery-limit","background-recovery","surface-copy"].includes(config.mode)) throw new Error("One-shot recovery proofs do not support warmup cycles");
  if (values.size) throw new Error(`Unknown stress options: ${[...values.keys()].join(", ")}`);
  return config;
}

export function createStressRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 0x100000000; };
}

export function assertStressInventory(pages: readonly (readonly ({ id: string; type: string; childPages?: readonly (readonly ({ id: string } | null | undefined)[])[] } | null | undefined)[])[], expected: ReadonlySet<string>): void {
  const ids: string[] = [], all = new Set<string>();
  const visit = (item: { id: string }, app: boolean) => {
    if (all.has(item.id)) throw new Error(`Duplicate layout ID: ${item.id}`);
    all.add(item.id); if (app) ids.push(item.id);
  };
  for (const page of pages) for (const item of page) {
    if (!item) continue;
    visit(item, item.type !== "folder");
    if (item.type === "folder") for (const child of item.childPages?.flat() ?? []) if (child) visit(child, true);
  }
  if (ids.length !== expected.size || ids.some(id => !expected.has(id))) throw new Error("Stress layout lost or added application IDs");
}
