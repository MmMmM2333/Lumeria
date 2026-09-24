import type { LaunchTargetCheckRequest, LaunchTargetCheckResult } from "../platform/launchpadContracts.js";

type Entry = {
  signature: string;
  forced: boolean;
  pending?: Promise<LaunchTargetCheckResult>;
  result?: LaunchTargetCheckResult;
  checkedAt: number;
};

/** Shares in-flight checks and briefly retains successful responses, never failures. */
export class NativeTargetCheckCache {
  readonly #entries = new Map<string, Entry>();
  constructor(
    readonly load: (targets: readonly LaunchTargetCheckRequest[], force: boolean) => Promise<readonly LaunchTargetCheckResult[]>,
    readonly now: () => number = () => performance.now(),
  ) {}

  clear(): void { this.#entries.clear(); }

  retain(targets: readonly LaunchTargetCheckRequest[]): void {
    const ids = new Set(targets.map(target => target.id));
    for (const id of this.#entries.keys()) if (!ids.has(id)) this.#entries.delete(id);
  }

  async check(targets: readonly LaunchTargetCheckRequest[], force = false): Promise<readonly LaunchTargetCheckResult[]> {
    const fresh: { target: LaunchTargetCheckRequest; entry: Entry }[] = [];
    const entries = targets.map(target => {
      const signature = JSON.stringify([target.launchTarget, target.fallbackPaths ?? []]);
      const previous = this.#entries.get(target.id);
      if (previous?.signature === signature) {
        if (previous.pending && (!force || previous.forced)) return previous;
        // UWP's 15 s snapshot lives in the sidecar. A second TTL here would
        // extend stale installation status to almost 30 s for later batches.
        if (!force && target.launchTarget.kind !== "appUserModelId" && previous.result && this.now() - previous.checkedAt < 15_000) return previous;
      }
      const entry: Entry = { signature, forced: force, checkedAt: 0 };
      this.#entries.set(target.id, entry);
      fresh.push({ target, entry });
      return entry;
    });
    if (fresh.length) {
      const request = this.load(fresh.map(({ target }) => target), force);
      for (const { target, entry } of fresh) {
        entry.pending = request.then(results => {
          const result = results.find(result => result.id === target.id);
          if (!result) throw new Error(`Missing launch target check result: ${target.id}`);
          entry.result = result;
          entry.checkedAt = this.now();
          return result;
        }).catch(error => {
          if (this.#entries.get(target.id) === entry) this.#entries.delete(target.id);
          throw error;
        }).finally(() => { delete entry.pending; });
      }
    }
    return Promise.all(entries.map(entry => entry.pending ?? entry.result!));
  }
}
