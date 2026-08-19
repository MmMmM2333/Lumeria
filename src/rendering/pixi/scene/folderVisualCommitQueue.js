import { motionRuntime } from "../animation/motionRuntime.js";

function normalizeTransaction(transaction) {
  if (typeof transaction === "function") {
    return { mutateOwnership: transaction };
  }
  return transaction && typeof transaction === "object" ? transaction : null;
}

function isCommitted(result) {
  if (result === false) return false;
  if (result && typeof result === "object" && result.committed === false) return false;
  return true;
}

export class FolderVisualCommitQueue {
  constructor(options = {}) {
    this.pending = [];
    this.epoch = 0;
    this.flushQueued = false;
    this.flushing = false;
    this.nextFlushTicket = 1;
    this.scheduledFlushTicket = null;
    this.scheduleFrame = options.scheduleFrame || ((callback) => motionRuntime.afterFrame(callback));
  }

  enqueue(transaction, options = {}) {
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

  scheduleFlush() {
    if (this.flushQueued) return;
    const epoch = this.epoch;
    const ticket = this.nextFlushTicket;
    this.nextFlushTicket += 1;
    this.flushQueued = true;
    this.scheduledFlushTicket = ticket;
    this.scheduleFrame(() => this.flush({ epoch, ticket }));
  }

  flush(scheduleGuard = null) {
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
    const committed = [];
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

  clear() {
    const count = this.pending.length;
    this.epoch += 1;
    this.pending.length = 0;
    this.flushQueued = false;
    this.scheduledFlushTicket = null;
    return count;
  }
}
