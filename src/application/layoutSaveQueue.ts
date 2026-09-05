import type { LayoutDocument } from "../domain/layoutDocument.js";

/** One serialized writer; a failed snapshot stays dirty and flush retries it. */
export function createLayoutSaveQueue(write: (document: LayoutDocument) => Promise<void>) {
  let latest: LayoutDocument | null = null;
  let pending: Promise<void> | null = null;
  const flush = (): Promise<void> => {
    if (pending) return pending;
    pending = (async () => {
      while (latest) {
        const document = latest;
        await write(document);
        if(latest === document) latest = null;
      }
    })().finally(() => { pending = null; });
    return pending;
  };
  return { enqueue(document: LayoutDocument): void { latest = document; }, flush, get dirty() { return latest !== null; } };
}
