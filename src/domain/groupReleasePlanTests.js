import { GROUP_RELEASE_MODE, makeGroupReleasePlan } from "./groupReleasePlan.js";

function app(id) {
  return { id, name: id, type: "app" };
}

function entry(id, order = 0, memberIds = [id]) {
  return {
    item: app(id),
    memberIds,
    order,
  };
}

function folder(id, count, pages = null) {
  const children = Array.from({ length: count }, (_, index) => app(`${id}-child-${index}`));
  return {
    children,
    childPages: pages || [children],
    id,
    name: id,
    type: "folder",
  };
}

function placement(id, target) {
  return { id, order: 0, target };
}

export function runGroupReleasePlanTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Group release plan test failed] ${message}`);
  };

  const firstPageWithEight = [[folder("target", 8)]];
  const previewPlan = makeGroupReleasePlan({
    basePages: firstPageWithEight,
    entries: [entry("dragged")],
    folderPageSize: 9,
    key: "release-eight",
    placements: [placement("dragged", { folderId: "target", index: 8, kind: "closed-folder" })],
  });
  assert(
    previewPlan.entries[0].mode === GROUP_RELEASE_MODE.FOLDER_PREVIEW_SLOT,
    "the ninth child of a one-page eight-child folder should use the preview slot release"
  );
  assert(previewPlan.entries[0].target.slotIndex === 8, "preview release should preserve the target slot index");

  const centerPlan = makeGroupReleasePlan({
    basePages: [[folder("target", 9)]],
    entries: [entry("dragged")],
    folderPageSize: 9,
    key: "release-nine",
    placements: [placement("dragged", { folderId: "target", index: 9, kind: "closed-folder" })],
  });
  assert(
    centerPlan.entries[0].mode === GROUP_RELEASE_MODE.FOLDER_CENTER_ABSORB,
    "a child beyond the first nine should use center absorb"
  );

  const multiPagePlan = makeGroupReleasePlan({
    basePages: [[folder("target", 9, [Array.from({ length: 8 }, (_, index) => app(`a-${index}`)), [app("a-8")]])]],
    entries: [entry("dragged")],
    folderPageSize: 9,
    key: "release-multi-page",
    placements: [placement("dragged", { folderId: "target", index: 9, kind: "closed-folder" })],
  });
  assert(
    multiPagePlan.entries[0].mode === GROUP_RELEASE_MODE.FOLDER_CENTER_ABSORB,
    "a multi-page folder should not pretend that an appended child is a preview slot"
  );

  const groupedPlan = makeGroupReleasePlan({
    basePages: [[folder("target", 8)]],
    entries: [entry("representative", 0, ["representative", "hidden-member"])],
    folderPageSize: 9,
    key: "release-group",
    placements: [
      placement("representative", { folderId: "target", index: 8, kind: "closed-folder" }),
      placement("hidden-member", { folderId: "target", index: 9, kind: "closed-folder" }),
    ],
    pointer: { x: 100, y: 120 },
    velocity: { x: 240, y: -30 },
  });
  assert(groupedPlan.entries[0].memberIds.length === 2, "representative release should retain hidden member identity");
  assert(groupedPlan.entries[0].velocity.x === 240, "release plan should carry sampled pointer velocity");

  const desktopPlan = makeGroupReleasePlan({
    basePages: [[app("source")]],
    entries: [entry("source")],
    folderPageSize: 9,
    key: "release-desktop",
    placements: [placement("source", { index: 1, kind: "desktop", pageIndex: 0 })],
  });
  assert(desktopPlan.entries[0].mode === GROUP_RELEASE_MODE.POINT_HANDOFF, "desktop placement should use point handoff");

  const returnPlan = makeGroupReleasePlan({
    entries: [{
      ...entry("source"),
      originAlpha: 0.7,
      originScale: 0.62,
    }],
    fallbackById: { source: { x: 40, y: 60 } },
    key: "release-return",
    returnToOrigin: true,
  });
  assert(
    returnPlan.entries[0].mode === GROUP_RELEASE_MODE.RETURN_TO_ORIGIN,
    "an explicit return should preserve the source-origin release mode"
  );
  assert(
    returnPlan.entries[0].originAlpha === 0.7 && returnPlan.entries[0].originScale === 0.62,
    "origin returns should preserve their gather source opacity and scale"
  );

  const createdPlan = makeGroupReleasePlan({
    basePages: [[app("source")]],
    entries: [entry("source")],
    folderPageSize: 9,
    key: "release-created-folder",
    placements: [placement("source", { folderId: "new-folder", index: 0, kind: "created-folder" })],
  });
  assert(createdPlan.entries[0].mode === GROUP_RELEASE_MODE.CREATED_FOLDER, "created folder placement should retain its dedicated mode");
  assert(
    createdPlan.entries[0].target.kind === "created-folder" &&
      createdPlan.entries[0].target.slotIndex === 0 &&
      createdPlan.entries[0].target.expectedChildId === "source",
    "created-folder release should preserve the committed child slot and identity for the visual handoff"
  );

  const createdOverflowPlan = makeGroupReleasePlan({
    basePages: [[app("source")]],
    entries: [entry("source")],
    folderPageSize: 36,
    key: "release-created-folder-overflow",
    placements: [placement("source", { folderId: "new-folder", index: 9, kind: "created-folder" })],
  });
  assert(
    createdOverflowPlan.entries[0].mode === GROUP_RELEASE_MODE.FOLDER_CENTER_ABSORB,
    "created-folder children beyond the visible 3x3 thumbnail should absorb into the folder center"
  );
  assert(
    createdOverflowPlan.entries[0].target.kind === "created-folder" &&
      createdOverflowPlan.entries[0].target.folderId === "new-folder" &&
      createdOverflowPlan.entries[0].target.slotIndex == null,
    "created-folder overflow should retain folder identity without publishing an out-of-frame slot"
  );
}
