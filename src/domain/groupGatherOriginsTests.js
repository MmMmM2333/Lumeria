import {
  indexGroupDragSources,
  resolveGroupGatherEntries,
  selectGroupGatherRepresentatives,
} from "./groupGatherOrigins.js";

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

export function runGroupGatherOriginsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Group gather origins test failed] ${message}`);
  };
  const childIds = Array.from({ length: 12 }, (_, index) => `folder-app-${index}`);
  const pages = [
    [app("lead"), folder("folder-a", childIds)],
    [app("other-page")],
  ];
  const indexed = indexGroupDragSources(pages);
  assert(indexed.apps.get("folder-app-8").flatIndex === 8, "folder children should keep a stable flattened preview index");
  assert(indexed.apps.get("folder-app-9").flatIndex === 9, "children after the first nine should remain distinguishable");

  const entries = resolveGroupGatherEntries({
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

  const many = Array.from({ length: 30 }, (_, index) => ({
    ...entries[index % entries.length],
    item: app(`representative-${index}`),
    order: index,
    originKind: index === 0 ? "lead" : index === 20 ? "folder-hidden" : "visible-desktop",
  }));
  const representatives = selectGroupGatherRepresentatives(many, 8);
  assert(representatives.length === 8, "representative rendering should enforce its visual cap");
  assert(representatives.some((entry) => entry.originKind === "folder-bundle"), "the cap should preserve a hidden-folder bundle");

  const bundled = selectGroupGatherRepresentatives([
    ...entries,
    ...["hidden-a", "hidden-b", "hidden-c"].map((id, offset) => ({
      ...byId.get("folder-app-9"),
      item: app(id),
      order: 10 + offset,
      source: { ...byId.get("folder-app-9").source, folderId: "folder-a" },
    })),
    ...["remote-a", "remote-b"].map((id, offset) => ({
      ...byId.get("other-page"),
      item: app(id),
      order: 20 + offset,
      source: { kind: "desktop", pageIndex: 1 },
    })),
  ], 12);
  const folderBundle = bundled.find((entry) => entry.originKind === "folder-bundle");
  const pageBundle = bundled.find((entry) => entry.originKind === "desktop-page-bundle");
  assert(folderBundle.bundleCount === 4 && folderBundle.memberIds.length === 4, "hidden children from one folder should share one counted proxy");
  assert(pageBundle.bundleCount === 3 && pageBundle.memberIds.length === 3, "apps from one remote desktop page should share one counted proxy");

  const manyRemotePages = selectGroupGatherRepresentatives([
    makeEntryForRemotePage("left-1", -1, 0),
    makeEntryForRemotePage("left-2", -2, 1),
    makeEntryForRemotePage("right-1", 1, 2),
    makeEntryForRemotePage("right-2", 2, 3),
  ], 12, { maxBundles: 3 });
  assert(manyRemotePages.length === 2, "more than three remote page sources should collapse by direction");
  assert(
    manyRemotePages.find((entry) => entry.direction === "left")?.bundleCount === 2 &&
      manyRemotePages.find((entry) => entry.direction === "right")?.bundleCount === 2,
    "collapsed page-edge proxies should preserve the total count on each side"
  );

  const remoteFolderEntries = resolveGroupGatherEntries({
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
  const remoteFollowerEntries = resolveGroupGatherEntries({
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

function makeEntryForRemotePage(id, relativePageIndex, order) {
  return {
    bundleCount: 1,
    delayMs: 20 + order,
    direction: relativePageIndex < 0 ? "left" : "right",
    item: app(id),
    memberIds: [id],
    order,
    origin: { x: relativePageIndex < 0 ? -20 : 920, y: 200 },
    originKind: "desktop-page",
    originScale: 0.7,
    source: { kind: "desktop", pageIndex: relativePageIndex },
  };
}
