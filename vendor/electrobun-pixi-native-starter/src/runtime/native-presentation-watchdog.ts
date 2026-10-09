/** A frame deadline starts with expected work, independently of the last idle frame. */
export class NativePresentationWatchdog {
  #startedAt: number | null = null;

  beginFrame(time: number): void { this.#startedAt ??= time; }
  reset(): void { this.#startedAt = null; }
  stalled(time: number): boolean {
    return this.#startedAt !== null && time - this.#startedAt > 5000;
  }
}
