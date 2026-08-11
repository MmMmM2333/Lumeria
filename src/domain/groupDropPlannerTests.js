import { planGroupDrop } from "./groupDropPlanner.js";

function app(id) {
  return { id, name: id, type: "app" };
}

function folder(id, pages) {
  const childPages = pages.map((page) => page.map((id) => app(id)));
  return {
    childPages,
    children: childPages.flat(),
    id,
    name: id,
    type: "folder",
  };
}

function allIds(pages) {
  const ids = [];
  for (const page of pages) {
    for (const item of page) {
      ids.push(item.id);
      if (item.type === "folder") ids.push(...item.childPages.flat().map((child) => child.id));
    }
  }
  return ids;
}

export function runGroupDropPlannerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Group drop planner test failed] ${message}`);
  };
  const base = [
    [app("a"), app("b"), folder("folder-one", [["c", "d"], ["e"]])],
    [app("f"), app("g")],
  ];
  const common = {
    basePages: base,
    baseRevision: 4,
    currentRevision: 4,
    folderName: "Group",
    folderPageSize: 3,
    makeFolderId: () => "folder-created",
    pageSize: 4,
  };

  const desktop = planGroupDrop({
    ...common,
    draggedIds: ["d", "a"],
    leadId: "d",
    intent: { type: "desktop-slot", pageIndex: 1, index: 1 },
  });
  assert(desktop.status === "accepted", "mixed-source desktop drops should be accepted atomically");
  assert(
    desktop.nextPages[1].map((item) => item.id).join(",") === "f,d,a,g",
    "lead should occupy the requested slot and remaining apps should keep stable order"
  );
  assert(new Set(allIds(desktop.nextPages)).size === allIds(desktop.nextPages).length, "accepted output should not duplicate ids");

  const full = planGroupDrop({
    ...common,
    draggedIds: ["c", "d", "e"],
    leadId: "c",
    intent: { type: "desktop-slot", pageIndex: 1, index: 0 },
  });
  assert(full.status === "accepted", "desktop drops should cascade overflow instead of rejecting a full target page");
  assert(
    full.nextPages[1].map((item) => item.id).join(",") === "c,d,e,f" &&
      full.nextPages[2].map((item) => item.id).join(",") === "g",
    "desktop overflow should preserve row-major order while creating the next page"
  );
  assert(
    full.placements.map((placement) => (
      `${placement.id}:${placement.target.pageIndex}:${placement.target.index}`
    )).join(",") === "c:1:0,d:1:1,e:1:2",
    "desktop placements should describe every dragged item's final committed page and slot"
  );

  const appendedDesktopPage = planGroupDrop({
    ...common,
    draggedIds: ["f"],
    leadId: "f",
    intent: { type: "desktop-slot", pageIndex: 2, index: 0 },
  });
  assert(
    appendedDesktopPage.status === "accepted" &&
      appendedDesktopPage.nextPages[2].map((item) => item.id).join(",") === "f",
    "an edge-created desktop page should be planned without mutating the base layout"
  );

  const emptiedDesktopPredecessor = planGroupDrop({
    ...common,
    draggedIds: ["f", "g"],
    leadId: "f",
    intent: { type: "desktop-slot", pageIndex: 2, index: 0 },
  });
  assert(
    emptiedDesktopPredecessor.status === "rejected" &&
      emptiedDesktopPredecessor.reason === "desktop-page-missing",
    "creating a page must not leave a removed trailing page as an empty gap"
  );

  const closedFolder = planGroupDrop({
    ...common,
    draggedIds: ["a", "f", "g"],
    leadId: "f",
    intent: { type: "closed-folder", folderId: "folder-one" },
  });
  const closedTarget = closedFolder.nextPages.flat().find((item) => item.id === "folder-one");
  assert(closedTarget.childPages.length === 3, "closed folders should grow by creating child pages");
  assert(
    closedTarget.childPages.flat().map((item) => item.id).join(",") === "c,d,e,f,a,g",
    "closed folder insertion should preserve lead-first stable order"
  );

  const strictFolderPage = planGroupDrop({
    ...common,
    draggedIds: ["a", "f"],
    leadId: "a",
    intent: { type: "open-folder-slot", folderId: "folder-one", pageIndex: 0, index: 1 },
  });
  assert(
    strictFolderPage.status === "rejected" && strictFolderPage.reason === "folder-page-capacity",
    "open folder exact pages should use strict page capacity"
  );

  const rebasedFolderPage = planGroupDrop({
    basePages: [[folder("folder-rebase", [["a"], ["b", "c"]])]],
    baseRevision: 1,
    currentRevision: 1,
    draggedIds: ["a"],
    folderName: "Group",
    folderPageSize: 3,
    intent: {
      folderId: "folder-rebase",
      index: 1,
      pageIndex: 1,
      type: "open-folder-slot",
    },
    leadId: "a",
    makeFolderId: () => "unused",
    pageSize: 4,
  });
  const rebasedFolder = rebasedFolderPage.nextPages[0][0];
  assert(
    rebasedFolderPage.status === "accepted" &&
      rebasedFolder.childPages.length === 1 &&
      rebasedFolder.childPages[0].map((item) => item.id).join(",") === "b,a,c",
    "an emptied earlier folder page should rebase the intended target page instead of rejecting or landing elsewhere"
  );
  assert(
    rebasedFolderPage.placements[0].target.pageIndex === 0,
    "folder placements should expose the final compacted page index"
  );

  const appendedFolderPage = planGroupDrop({
    ...common,
    draggedIds: ["a"],
    leadId: "a",
    intent: {
      allowCreate: true,
      folderId: "folder-one",
      index: 0,
      pageIndex: 2,
      type: "open-folder-slot",
    },
  });
  const appendedFolder = appendedFolderPage.nextPages.flat().find((item) => item.id === "folder-one");
  assert(
    appendedFolderPage.status === "accepted" &&
      appendedFolder.childPages[2].map((item) => item.id).join(",") === "a",
    "an explicitly edge-created folder page should accept the whole group atomically"
  );

  const unconfirmedFolderPage = planGroupDrop({
    ...common,
    draggedIds: ["a"],
    leadId: "a",
    intent: {
      folderId: "folder-one",
      index: 0,
      pageIndex: 2,
      type: "open-folder-slot",
    },
  });
  assert(
    unconfirmedFolderPage.status === "rejected" &&
      unconfirmedFolderPage.reason === "folder-page-missing",
    "a missing folder page should only exist after an explicit edge-turn request"
  );

  const emptiedFolderPredecessor = planGroupDrop({
    ...common,
    draggedIds: ["e"],
    leadId: "e",
    intent: {
      allowCreate: true,
      folderId: "folder-one",
      index: 0,
      pageIndex: 2,
      type: "open-folder-slot",
    },
  });
  assert(
    emptiedFolderPredecessor.status === "rejected" &&
      emptiedFolderPredecessor.reason === "folder-page-missing",
    "moving an entire trailing folder page must not leave a blank page before the new target"
  );

  const created = planGroupDrop({
    ...common,
    draggedIds: ["c", "d", "e", "a", "f"],
    leadId: "c",
    intent: { type: "app-folder-create" },
  });
  const createdFolder = created.nextPages.flat().find((item) => item.id === "folder-created");
  assert(created.status === "accepted" && created.createdFolderId === "folder-created", "toolbar creation should return the created folder id");
  assert(
    createdFolder.childPages.flat().map((item) => item.id).join(",") === "c,a,d,e,f",
    "toolbar folder children should be lead-first and paginated"
  );
  assert(!created.nextPages.flat().some((item) => item.id === "folder-one"), "a source folder emptied by creation should be removed");

  const appTarget = planGroupDrop({
    ...common,
    draggedIds: ["c", "d"],
    leadId: "d",
    intent: { type: "app-folder-create", targetAppId: "b" },
  });
  const targetFolder = appTarget.nextPages.flat().find((item) => item.id === "folder-created");
  assert(
    targetFolder.childPages.flat().map((item) => item.id).join(",") === "b,d,c",
    "app-on-app creation should place target first, then lead, then stable remainder"
  );

  const stale = planGroupDrop({
    ...common,
    currentRevision: 5,
    draggedIds: ["a"],
    leadId: "a",
    intent: { type: "desktop-slot", pageIndex: 0, index: 0 },
  });
  assert(stale.status === "rejected" && stale.reason === "revision-stale", "stale revisions should reject before mutation");

  const movedFolder = planGroupDrop({
    ...common,
    draggedIds: ["folder-one"],
    leadId: "folder-one",
    intent: { type: "desktop-slot", pageIndex: 1, index: 1 },
  });
  assert(movedFolder.status === "accepted", "a single top-level folder should use the same atomic desktop planner");
  assert(
    movedFolder.nextPages[1].map((item) => item.id).join(",") === "f,folder-one,g",
    "moving a folder should preserve its children and use the requested desktop slot"
  );
  assert(
    movedFolder.nextPages[1][1].childPages.flat().map((item) => item.id).join(",") === "c,d,e",
    "folder moves must preserve nested page contents"
  );
}
