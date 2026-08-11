import {
  captureGroupTransferSourceEntries,
  indexGroupTransferSources,
} from "./groupTransferSourceCapture.js";

function app(id) {
  return { id, name: id, type: "app" };
}

function folder(id, childIds) {
  const children = childIds.map(app);
  return {
    childPages: [children.slice(0, 6), children.slice(6)],
    children,
    id,
    name: id,
    type: "folder",
  };
}

export function runGroupTransferSourceCaptureTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Group transfer source capture test failed] ${message}`);
  };
  const childIds = Array.from({ length: 12 }, (_, index) => `folder-app-${index}`);
  const pages = [
    [app("lead"), folder("folder-a", childIds)],
    [app("other-page")],
  ];
  const indexed = indexGroupTransferSources(pages);
  assert(indexed.apps.get("folder-app-8").flatIndex === 8, "folder children should keep a stable flattened preview index");
  assert(indexed.apps.get("folder-app-9").flatIndex === 9, "children after the first nine should remain distinguishable");

  const entries = captureGroupTransferSourceEntries({
    activeFolderPageIndex: 0,
    activePageIndex: 0,
    draggedIds: ["lead", "other-page", "folder-app-8", "folder-app-9"],
    getFolderRect: () => ({ left: 300, top: 100, width: 80, height: 80 }),
    getFolderPreviewRect: (location) => location.flatIndex === 8
      ? { left: 340, top: 140, width: 12, height: 12 }
      : null,
    leadId: "lead",
    leadRect: { left: 40, top: 60, width: 64, height: 64 },
    pages,
    pointer: { x: 60, y: 70 },
    viewportRect: { left: 0, top: 0, width: 900, height: 600 },
  });
  const byId = new Map(entries.map((entry) => [entry.item.id, entry]));
  assert(byId.get("lead").originKind === "lead", "the pressed app should remain the gather lead");
  assert(byId.get("other-page").originKind === "desktop-page", "apps on another desktop page should enter from a page edge");
  assert(byId.get("other-page").origin.x > 900, "apps from a later page should enter from the right edge");
  assert(byId.get("folder-app-8").originKind === "folder-preview", "the first nine folder apps should gather from their preview slot");
  assert(byId.get("folder-app-9").originKind === "folder-hidden", "non-preview folder apps should burst from the folder center");
  assert(byId.get("folder-app-9").originScale < byId.get("folder-app-8").originScale, "hidden folder apps should begin at a smaller scale");

  const remoteFolderEntries = captureGroupTransferSourceEntries({
    activeFolderPageIndex: 0,
    activePageIndex: 0,
    draggedIds: ["folder-app-7"],
    folderPanelRect: { height: 420, left: 180, top: 80, width: 540 },
    leadId: "folder-app-7",
    leadRect: { height: 64, left: 40, top: 60, width: 64 },
    openFolderId: "folder-a",
    pages,
    pointer: { x: 60, y: 70 },
  });
  assert(remoteFolderEntries[0].originKind === "lead", "the pressed remote-page child remains the visual lead");
  const remoteFollowerEntries = captureGroupTransferSourceEntries({
    activeFolderPageIndex: 0,
    activePageIndex: 0,
    draggedIds: ["lead", "folder-app-7"],
    folderPanelRect: { height: 420, left: 180, top: 80, width: 540 },
    leadId: "lead",
    leadRect: { height: 64, left: 40, top: 60, width: 64 },
    openFolderId: "folder-a",
    pages,
    pointer: { x: 60, y: 70 },
  });
  const remoteFollower = remoteFollowerEntries.find((entry) => entry.item.id === "folder-app-7");
  assert(remoteFollower.originKind === "folder-page", "children on another open-folder page should enter from the panel edge");
  assert(remoteFollower.origin.x > 720, "a later folder page should enter from the right panel edge");
}
