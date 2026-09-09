/** Gates presentation while application-owned resources are being prepared. */
export class NativeFramePreparation {
  readonly #callbacks = new Set<() => void | Promise<void>>();
  #closed = false;
  pending = false;
  constructor(private readonly ready: () => void, private readonly failed: (error: unknown) => void) {}
  add(callback: () => void | Promise<void>): () => void {
    if (this.#closed) return () => {};
    this.#callbacks.add(callback);
    return () => { this.#callbacks.delete(callback); };
  }
  prepare(): boolean {
    if (this.#closed || this.pending) return false;
    const work: Promise<void>[] = [];
    try {
      for (const callback of [...this.#callbacks]) {
        const result = callback();
        if (result) work.push(Promise.resolve(result));
      }
    } catch (error) { work.push(Promise.reject(error)); }
    if (!work.length) return true;
    this.pending = true;
    void Promise.all(work).then(() => {
      this.pending = false;
      if (!this.#closed) this.ready();
    }, error => {
      this.pending = false;
      if (!this.#closed) this.failed(error);
    });
    return false;
  }
  close(): void { this.#closed = true; this.#callbacks.clear(); }
}
