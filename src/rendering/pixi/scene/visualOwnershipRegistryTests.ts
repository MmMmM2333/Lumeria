import {
  VisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
  makeFolderShellVisualKey,
  makeItemVisualKey,
} from "./visualOwnershipRegistry.js";
import type {
  VisualOwnershipChange,
  VisualOwnershipSnapshotEntry,
} from "./visualOwnershipRegistry.js";

export function runVisualOwnershipRegistryTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Visual ownership registry test failed] ${message}`);
  };

  {
    const registry = new VisualOwnershipRegistry();
    const key = makeDesktopSourceVisualKey("folder-a");
    registry.acquire(key, { folderId: "folder-a", kind: "opening", token: 1 });

    assert(registry.hasOwner(key), "acquire should register an owner");
    assert(registry.isOwnedBy(key, 1), "isOwnedBy should match the owner token");
    assert(!registry.release(key, 2), "stale release should be ignored");
    assert(registry.hasOwner(key), "stale release should keep the owner");
    assert(registry.release(key, 1), "matching release should clear the owner");
    assert(!registry.hasOwner(key), "matching release should remove ownership");
  }

  {
    const registry = new VisualOwnershipRegistry();
    const token = "transfer-1";
    const keys = [
      makeItemVisualKey("app-a"),
      makeItemVisualKey("app-b"),
      makeFolderShellVisualKey("folder-created"),
    ];
    assert(
      registry.acquireMany(keys, { actorKey: "group-release", kind: "group-transfer", token }) === 3,
      "a transfer session should acquire every item and shell before committing data"
    );
    assert(
      keys.every((key) => registry.isOwnedBy(key, token)),
      "item and folder-shell keys should share the transfer token"
    );
    registry.acquire(makeItemVisualKey("app-a"), {
      actorKey: "replacement",
      kind: "group-transfer",
      token: "transfer-2",
    });
    assert(
      registry.isOwnedBy(makeItemVisualKey("app-a"), "transfer-2") && registry.snapshot().length === 3,
      "ownership transfer should replace one key atomically without duplicating its visual owner"
    );
    assert(registry.releaseByToken(token) === 2, "releaseByToken should preserve transferred keys");
    assert(registry.snapshot().length === 1, "only the replacement owner should remain");
  }

  {
    const registry = new VisualOwnershipRegistry();
    registry.acquire(makeDesktopSourceVisualKey("folder-a"), { folderId: "folder-a", kind: "detached", token: "a" });
    registry.acquire(makeDesktopSourceVisualKey("folder-b"), { folderId: "folder-b", kind: "opening", token: "b" });
    registry.acquire(makeFolderIconVisualKey("folder-a", "app-a"), { folderId: "folder-a", kind: "detached", token: "a" });

    assert(registry.releaseByToken("a") === 2, "releaseByToken should clear every matching owner");
    assert(!registry.hasOwner(makeDesktopSourceVisualKey("folder-a")), "releaseByToken should clear matching desktop source ownership");
    assert(registry.hasOwner(makeDesktopSourceVisualKey("folder-b")), "releaseByToken should preserve other owners");
  }

  {
    const scheduled: Array<() => void> = [];
    const registry = new VisualOwnershipRegistry({
      scheduleFrame: (callback) => scheduled.push(callback),
    });
    const key = makeDesktopSourceVisualKey("folder-a");
    const changes: Array<{
      change: VisualOwnershipChange;
      snapshot: VisualOwnershipSnapshotEntry[];
    }> = [];
    const unsubscribe = registry.subscribe((
      change: VisualOwnershipChange,
      snapshot: VisualOwnershipSnapshotEntry[],
    ) => {
      changes.push({ change, snapshot });
    });

    registry.acquire(key, { folderId: "folder-a", kind: "detached", token: "a" });
    registry.acquire(key, { folderId: "folder-a", kind: "detached", token: "a" });
    registry.release(key, "stale");
    assert(changes.length === 0, "ownership subscribers must not re-enter the active mutation frame");
    assert(scheduled.length === 1, "ownership notifications should coalesce onto one frame commit");
    const acquireNotification = scheduled.shift();
    assert(acquireNotification, "acquire notification should remain scheduled");
    acquireNotification();
    registry.release(key, "a");
    const releaseNotification = scheduled.shift();
    assert(releaseNotification, "release notification should remain scheduled");
    releaseNotification();
    unsubscribe();
    registry.acquire(key, { folderId: "folder-a", kind: "opening", token: "b" });

    assert((changes.length as number) === 2, "subscribe should notify only actual ownership changes");
    const firstChange = changes[0];
    const secondChange = changes[1];
    assert(firstChange && secondChange, "both ownership notifications should be captured");
    assert(firstChange.change.type === "acquire", "first change should be an acquire notification");
    assert(firstChange.snapshot.length === 1, "acquire notification should include the new snapshot");
    assert(secondChange.change.type === "release", "matching release should notify subscribers");
    assert(secondChange.snapshot.length === 0, "release notification should include the cleared snapshot");
  }
}
