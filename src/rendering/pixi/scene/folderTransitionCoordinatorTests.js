import {
  FolderTransitionCoordinator,
  makeFolderPanelTargetKey,
} from "./folderTransitionCoordinator.js";

export function runFolderTransitionCoordinatorTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder transition coordinator test failed] ${message}`);
  };

  {
    const key = makeFolderPanelTargetKey("folder-1", 10.123, 20.456, { height: 300.333, width: 400.777 });
    assert(key === "folder-1:10.12:20.46:400.78:300.33", "target key should normalize folder panel geometry");
  }

  {
    const coordinator = new FolderTransitionCoordinator();
    const first = coordinator.beginOpen("folder-1", "target-a");
    const second = coordinator.beginOpen("folder-1", "target-a");

    assert(first.started, "first open should create a session");
    assert(!second.started, "same folder target should reuse the current session");
    assert(first.session.token === second.session.token, "same target reuse should preserve the token");
  }

  {
    const coordinator = new FolderTransitionCoordinator();
    const first = coordinator.beginOpen("folder-1", "target-a");
    coordinator.markPanelReady(first.session.token);
    const second = coordinator.beginOpen("folder-1", "target-b");

    assert(first.session.token === second.session.token, "same folder retarget should preserve the open token");
    assert(!second.session.panelReady, "unrevealed retarget should make panel readiness pending again");
  }

  {
    const coordinator = new FolderTransitionCoordinator();
    const session = coordinator.beginOpen("folder-1", "target-a").session;
    const snapshot = { folderId: "folder-1", layoutKey: "layout-a" };

    assert(coordinator.setOpenGeometrySnapshot(session.token, snapshot), "current open token should attach a geometry snapshot");
    assert(coordinator.getOpenGeometrySnapshot(session.token) === snapshot, "current open token should read its geometry snapshot");
    assert(coordinator.getOpenGeometrySnapshot("stale") === null, "stale open token should not read the current geometry snapshot");
    assert(!coordinator.setOpenGeometrySnapshot("stale", { layoutKey: "layout-b" }), "stale open token should not replace the geometry snapshot");
    assert(coordinator.getOpenGeometrySnapshot(session.token) === snapshot, "stale geometry writes should leave the current snapshot intact");

    coordinator.markPanelReady(session.token);
    assert(coordinator.setOpenGeometrySnapshot(session.token, { folderId: "folder-1", layoutKey: "layout-b" }), "layout changes should replace the geometry snapshot");
    assert(!coordinator.activeOpenSession.panelReady, "unrevealed layout changes should make panel readiness pending");
  }

  {
    const coordinator = new FolderTransitionCoordinator();
    const first = coordinator.beginOpen("folder-1", "target-a").session;
    const snapshot = { folderId: "folder-1", layoutKey: "layout-a" };
    coordinator.setOpenGeometrySnapshot(first.token, snapshot);
    const second = coordinator.beginOpen("folder-1", "target-b").session;

    assert(first.token === second.token, "same folder target changes should keep the open token");
    assert(coordinator.getOpenGeometrySnapshot(second.token) === null, "same folder retarget should invalidate stale geometry");
  }

  {
    const coordinator = new FolderTransitionCoordinator();
    const first = coordinator.beginOpen("folder-1", "target-a").session;
    const second = coordinator.beginOpen("folder-2", "target-b", { forceNew: true }).session;

    assert(first.token !== second.token, "new folder should get a new token");
    assert(!coordinator.markPanelReady(first.token), "stale token should not mark panel ready");
    assert(coordinator.markPanelReady(second.token), "current token should mark panel ready");
    assert(!coordinator.canReveal(second.token), "panel ready alone should not reveal");
    assert(coordinator.markGhostsReady(second.token), "current token should mark ghosts ready");
    assert(coordinator.canReveal(second.token), "panel and ghosts ready should allow reveal");
    assert(coordinator.finishReveal(second.token), "finishReveal should mark the current session revealed");
    assert(!coordinator.isRevealPending(), "revealed session should not block pageTrack visibility");
  }
}
