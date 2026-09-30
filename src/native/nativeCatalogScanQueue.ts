/** One sidecar worker, with identical pending requests sharing its actual IO. */
export function createNativeCatalogScanQueue<T>(now: () => number = () => performance.now()) {
  let tail: Promise<void> = Promise.resolve();
  const pending = new Map<string, { task: Promise<T>; startedAt: number | null }>();
  return {
    run(key: string, work: () => Promise<T>, notBefore = 0): Promise<T> {
      const existing = pending.get(key);
      if (existing && (existing.startedAt === null || existing.startedAt >= notBefore)) return existing.task;
      let entry: { task: Promise<T>; startedAt: number | null };
      const task = tail.then(() => { entry.startedAt = now(); return work(); })
        .finally(() => { if (pending.get(key) === entry) pending.delete(key); });
      entry = { task, startedAt: null }; pending.set(key, entry); tail = task.then(() => {}, () => {}); return task;
    },
    drain(): Promise<void> { return tail; },
    get idle(): boolean { return pending.size === 0; },
  };
}
