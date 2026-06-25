import { FolderVisualCommitQueue } from "./folderVisualCommitQueue.js";

export function runFolderVisualCommitQueueTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder visual commit queue test failed] ${message}`);
  };

  {
    const scheduled = [];
    const queue = new FolderVisualCommitQueue({
      scheduleFrame: (callback) => scheduled.push(callback),
    });
    const order = [];

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
    scheduled[0]();
    assert(
      order.join(",") === "mutate-a,mutate-b,apply-a,apply-b,destroy-a,destroy-b",
      "commit queue should mutate ownership before applying visibility and destroying visuals"
    );
  }

  {
    const queue = new FolderVisualCommitQueue();
    const order = [];

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
    const scheduled = [];
    const queue = new FolderVisualCommitQueue({
      scheduleFrame: (callback) => scheduled.push(callback),
    });

    queue.enqueue(() => true);
    assert(queue.clear() === 1, "clear should drop pending transactions");
    scheduled[0]();
    assert(queue.pending.length === 0, "cleared transactions should not reappear after a scheduled frame");
  }
}
