import { FolderVisualCommitQueue } from "./folderVisualCommitQueue.js";

export function runFolderVisualCommitQueueTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Folder visual commit queue test failed] ${message}`);
  };

  {
    const scheduled: Array<() => void> = [];
    const queue = new FolderVisualCommitQueue({
      scheduleFrame: (callback) => scheduled.push(callback),
    });
    const order: string[] = [];

    queue.enqueue({
      mutateOwnership: () => {
        order.push("mutate-a");
        return { id: "a" };
      },
      applyVisibility: () => order.push("apply-a"),
      destroyVisual: () => order.push("destroy-a"),
    });
    queue.enqueue({
      mutateOwnership: () => {
        order.push("mutate-b");
        return { id: "b" };
      },
      applyVisibility: () => order.push("apply-b"),
      destroyVisual: () => order.push("destroy-b"),
    });

    assert(order.length === 0, "scheduled transactions should wait for the frame commit");
    assert(scheduled.length === 1, "queued transactions should coalesce into one frame callback");
    const scheduledCommit = scheduled[0];
    assert(scheduledCommit, "frame commit callback should be available");
    scheduledCommit();
    assert(
      order.join(",") === "mutate-a,mutate-b,apply-a,apply-b,destroy-a,destroy-b",
      "commit queue should mutate ownership before applying visibility and destroying visuals"
    );
  }

  {
    const queue = new FolderVisualCommitQueue();
    const order: string[] = [];

    queue.enqueue({
      isStale: () => true,
      mutateOwnership: () => order.push("stale-mutate"),
      applyVisibility: () => order.push("stale-apply"),
      destroyVisual: () => order.push("stale-destroy"),
    }, { immediate: true });
    queue.enqueue({
      mutateOwnership: () => {
        order.push("noop-mutate");
        return false;
      },
      applyVisibility: () => order.push("noop-apply"),
      destroyVisual: () => order.push("noop-destroy"),
    }, { immediate: true });

    assert(order.join(",") === "noop-mutate", "stale and uncommitted transactions should not apply or destroy visuals");
  }

  {
    const scheduled: Array<() => void> = [];
    const queue = new FolderVisualCommitQueue({
      scheduleFrame: (callback) => scheduled.push(callback),
    });

    queue.enqueue(() => true);
    assert(queue.clear() === 1, "clear should drop pending transactions");
    const clearedCommit = scheduled[0];
    assert(clearedCommit, "cleared frame callback should remain callable");
    clearedCommit();
    assert(queue.pending.length === 0, "cleared transactions should not reappear after a scheduled frame");
  }

  {
    const scheduled: Array<() => void> = [];
    const committed: string[] = [];
    const queue = new FolderVisualCommitQueue({
      scheduleFrame: (callback) => scheduled.push(callback),
    });

    queue.enqueue(() => committed.push("old"));
    queue.clear();
    queue.enqueue(() => committed.push("new"));

    assert(scheduled.length === 2, "a new queue epoch should schedule its own frame callback");
    const oldEpochCommit = scheduled[0];
    assert(oldEpochCommit, "old epoch callback should remain callable");
    oldEpochCommit();
    assert(committed.length === 0, "an old epoch callback must not flush the new epoch");
    const currentEpochCommit = scheduled[1];
    assert(currentEpochCommit, "current epoch callback should remain callable");
    currentEpochCommit();
    assert(committed.join(",") === "new", "only the current epoch callback should commit current transactions");
  }
}
