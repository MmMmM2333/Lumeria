import { motionRuntime } from "../animation/motionRuntime.js";

export interface FolderVisualTransaction {
  applyVisibility?(result: unknown): unknown;
  destroyVisual?(result: unknown): unknown;
  isStale?(): boolean;
  mutateOwnership?(): unknown;
}

export type FolderVisualTransactionInput = FolderVisualTransaction | (() => unknown);

export interface FolderVisualCommitQueueOptions {
  scheduleFrame?: (callback: () => void) => unknown;
}

export interface FolderVisualEnqueueOptions {
  immediate?: boolean;
}

export interface FolderVisualFlushGuard {
  epoch: number;
  ticket: number;
}

interface CommittedFolderVisualTransaction {
  result: unknown;
  transaction: FolderVisualTransaction;
}

function normalizeTransaction(transaction: unknown): FolderVisualTransaction | null {
  if (typeof transaction === "function") {
    return { mutateOwnership: transaction as () => unknown };
  }
  return transaction && typeof transaction === "object"
    ? transaction as FolderVisualTransaction
    : null;
}

function isCommitted(result: unknown): boolean {
  if (result === false) return false;
  if (
    result &&
    typeof result === "object" &&
    (result as Readonly<{ committed?: unknown }>).committed === false
  ) return false;
  return true;
}

export class FolderVisualCommitQueue {
  declare readonly pending: FolderVisualTransaction[];
  declare epoch: number;
  declare flushQueued: boolean;
  declare flushing: boolean;
  declare nextFlushTicket: number;
  declare scheduledFlushTicket: number | null;
  declare readonly scheduleFrame: (callback: () => void) => unknown;

  constructor(options: FolderVisualCommitQueueOptions = {}) {
    this.pending = [];
    this.epoch = 0;
    this.flushQueued = false;
    this.flushing = false;
    this.nextFlushTicket = 1;
    this.scheduledFlushTicket = null;
    this.scheduleFrame = options.scheduleFrame || ((callback) => motionRuntime.afterFrame(callback));
  }

  enqueue(
    transaction: unknown,
    options: FolderVisualEnqueueOptions = {},
  ): boolean {
    const normalized = normalizeTransaction(transaction);
    if (!normalized) return false;
    this.pending.push(normalized);
    if (options.immediate) {
      this.flush();
      return true;
    }
    this.scheduleFlush();
    return true;
  }

  scheduleFlush(): void {
    if (this.flushQueued) return;
    const epoch = this.epoch;
    const ticket = this.nextFlushTicket;
    this.nextFlushTicket += 1;
    this.flushQueued = true;
    this.scheduledFlushTicket = ticket;
    this.scheduleFrame(() => this.flush({ epoch, ticket }));
  }

  flush(scheduleGuard: FolderVisualFlushGuard | null = null): number {
    if (scheduleGuard && (
      scheduleGuard.epoch !== this.epoch ||
      scheduleGuard.ticket !== this.scheduledFlushTicket
    )) return 0;
    this.scheduledFlushTicket = null;
    if (this.flushing || !this.pending.length) {
      this.flushQueued = false;
      return 0;
    }
    this.flushing = true;
    this.flushQueued = false;
    const transactions = this.pending.splice(0);
    const committed: CommittedFolderVisualTransaction[] = [];
    try {
      for (const transaction of transactions) {
        if (transaction.isStale?.()) continue;
        const result = transaction.mutateOwnership?.();
        if (!isCommitted(result)) continue;
        committed.push({ result, transaction });
      }
      for (const entry of committed) {
        entry.transaction.applyVisibility?.(entry.result);
      }
      for (const entry of committed) {
        entry.transaction.destroyVisual?.(entry.result);
      }
    } finally {
      this.flushing = false;
    }
    if (this.pending.length) this.scheduleFlush();
    return committed.length;
  }

  clear(): number {
    const count = this.pending.length;
    this.epoch += 1;
    this.pending.length = 0;
    this.flushQueued = false;
    this.scheduledFlushTicket = null;
    return count;
  }
}
