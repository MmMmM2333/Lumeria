/** Keeps window changes pending until the viewport, backing and observers are updated. */
export class NativeWindowSync {
  #pending = true;
  #backing = true;
  #notify = false;
  #syncing = false;

  get pending(): boolean { return this.#pending || this.#syncing; }

  request(backing = true): void {
    this.#pending = true;
    this.#backing ||= backing;
  }

  afterRecovery(): void {
    this.request(true);
    this.#notify = true;
  }

  sync(apply: (backing: boolean, notify: boolean) => boolean): boolean {
    if (!this.#pending || this.#syncing) return false;
    const backing = this.#backing, notify = this.#notify;
    this.#pending = false; this.#backing = false; this.#notify = false;
    this.#syncing = true;
    const defer = () => {
      this.request(backing);
      this.#notify ||= notify;
    };
    try {
      if (!apply(backing, notify)) { defer(); return false; }
      return true;
    } catch (error) {
      defer();
      // A partial resize may already have updated the public dimensions.
      this.#notify = true;
      throw error;
    } finally {
      this.#syncing = false;
    }
  }
}
