import {
  planGroupTransfer,
  type GroupTransferPlanOptions,
} from "./groupTransferPlanner.js";
import type {
  GroupTransferAppItem,
  GroupTransferFolderItem,
  GroupTransferItem,
} from "./groupTransferSourceCapture.js";

type Assert = (condition: unknown, message: string) => asserts condition;

function app(id: string): GroupTransferAppItem {
  return { id, name: id, type: "app" };
}

function folder(
  id: string,
  pages: readonly (readonly (string | null | undefined)[])[],
): GroupTransferFolderItem {
  const childPages = pages.map((page) => page.flatMap((childId) => (
    childId ? [app(childId)] : []
  )));
  return {
    childPages,
    id,
    name: id,
    type: "folder",
  };
}

function ids(
  items: readonly (GroupTransferItem | null | undefined)[] | null | undefined,
): string {
  return (items || []).flatMap((item) => item ? [item.id] : []).join(",");
}

function folderById(
  pages: readonly (readonly GroupTransferItem[])[],
  folderId: string,
): GroupTransferFolderItem | null {
  const item = pages.flat().find((candidate) => candidate.id === folderId);
  return item?.type === "folder" ? item : null;
}

function allItemIds(pages: readonly (readonly GroupTransferItem[])[]): string[] {
  return pages.flatMap((page) => page.flatMap((item) => (
    item.type === "folder"
      ? [
          item.id,
          ...item.childPages.flat().flatMap((child) => child ? [child.id] : []),
        ]
      : [item.id]
  )));
}

function assertValidLayout(
  assert: Assert,
  pages: readonly (readonly GroupTransferItem[])[],
  pageSize: number,
  folderPageSize: number,
  message: string,
): void {
  const allIds = allItemIds(pages);
  assert(new Set(allIds).size === allIds.length, `${message}: ids must remain unique`);
  assert(pages.length >= 1, `${message}: desktop must retain one page`);
  assert(
    pages.every((page, index) => page.length > 0 || pages.length === 1 || index === pages.length - 1),
    `${message}: desktop must not contain empty internal pages`
  );
  assert(pages.every((page) => page.length <= pageSize), `${message}: desktop page capacity must hold`);
  for (const item of pages.flat()) {
    if (item.type !== "folder") continue;
    assert(item.childPages.length >= 1, `${message}: folders must retain one child page`);
    assert(
      item.childPages.every((page, index) => (
        page.length > 0 || item.childPages.length === 1 || index === item.childPages.length - 1
      )),
      `${message}: folders must not contain empty internal pages`
    );
    assert(
      item.childPages.every((page) => page.length <= folderPageSize),
      `${message}: folder page capacity must hold`
    );
    assert(!("children" in item), `${message}: folder output must not persist duplicate flat children`);
  }
}

function sixSourceFixture(): GroupTransferItem[][] {
  return [
    [app("desktop-0"), folder("source-folder", [
      ["folder-0", "folder-keep-0"],
      ["folder-1", "folder-keep-1"],
      ["folder-2", "folder-keep-2"],
    ]), app("desktop-keep-0")],
    [app("desktop-1"), app("desktop-keep-1")],
    [app("desktop-2"), app("desktop-keep-2")],
  ];
}

function commonRequest(overrides: Partial<GroupTransferPlanOptions> = {}): GroupTransferPlanOptions {
  return {
    basePages: sixSourceFixture(),
    baseRevision: 7,
    currentRevision: 7,
    folderName: "Group",
    folderPageSize: 3,
    intent: { type: "desktop-slot", pageIndex: 2, index: 1 },
    leadId: "desktop-0",
    makeFolderId: () => "folder-created",
    pageSize: 4,
    selectedIds: [
      "folder-2",
      "desktop-2",
      "folder-0",
      "desktop-0",
      "folder-1",
      "desktop-1",
    ],
    ...overrides,
  };
}

export function runGroupTransferPlannerTests() {
  const assert: Assert = (condition, message) => {
    if (!condition) throw new Error(`[Group transfer planner test failed] ${message}`);
  };

  const desktop = planGroupTransfer(commonRequest());
  assert(desktop.status === "accepted", "a six-source desktop transfer should be accepted");
  assert(
    desktop.members.filter((member) => member.selected !== false).map((member) => member.id).join(",") ===
      "desktop-0,folder-0,folder-1,folder-2,desktop-1,desktop-2",
    "selected members should use stable layout order instead of selection or lead order"
  );
  assert(
    ids(desktop.nextPages[2]) === "desktop-keep-2,desktop-0,folder-0,folder-1" &&
      ids(desktop.nextPages[3]) === "folder-2,desktop-1,desktop-2",
    "desktop insertion should treat the pointer slot as the block start and cascade overflow"
  );
  assert(
    desktop.effects.finalDesktopPageIndex === 2 &&
      desktop.effects.finalOpenFolderId === null &&
      desktop.effects.finalFolderPageIndex === null,
    "desktop effects should keep the final view on the release page"
  );
  assertValidLayout(assert, desktop.nextPages, 4, 3, "six-source desktop transfer");

  const alternateLead = planGroupTransfer(commonRequest({ leadId: "folder-2" }));
  assert(
    JSON.stringify(alternateLead.nextPages) === JSON.stringify(desktop.nextPages),
    "changing only the lead must not change semantic member order or nextPages"
  );

  const folderTargetBase = [
    ...sixSourceFixture(),
    [folder("target-folder", [["target-0", "target-1"], ["target-2", "target-3"]])],
  ];
  const intoOpenFolder = planGroupTransfer(commonRequest({
    basePages: folderTargetBase,
    intent: {
      folderId: "target-folder",
      folderPageIndex: 0,
      index: 1,
      type: "folder-slot",
    },
  }));
  assert(intoOpenFolder.status === "accepted", "open-folder insertion should accept a multi-page group");
  const openTarget = folderById(intoOpenFolder.nextPages, "target-folder");
  assert(openTarget, "the open-folder destination should remain in the accepted layout");
  assert(
    openTarget.childPages.map((page) => ids(page)).join("|") ===
      "target-0,desktop-0,folder-0|folder-1,folder-2,desktop-1|desktop-2,target-1,target-2|target-3",
    "folder insertion should cascade the selected block and existing tail across as many pages as needed"
  );
  assert(
    intoOpenFolder.effects.finalOpenFolderId === "target-folder" &&
      intoOpenFolder.effects.finalFolderPageIndex === 0,
    "open-folder effects should preserve the release folder and release page"
  );
  assertValidLayout(assert, intoOpenFolder.nextPages, 4, 3, "six-source folder transfer");

  const intoClosedFolder = planGroupTransfer(commonRequest({
    basePages: [
      ...sixSourceFixture(),
      [folder("closed-target", [[
        "preview-0",
        "preview-1",
        "preview-2",
      ], [
        "preview-3",
        "preview-4",
        "preview-5",
      ], [
        "preview-6",
        "preview-7",
      ]])],
    ],
    intent: { folderId: "closed-target", type: "folder-thumbnail" },
  }));
  assert(intoClosedFolder.status === "accepted", "closed folders should accept a six-source group");
  const closedTarget = folderById(intoClosedFolder.nextPages, "closed-target");
  assert(closedTarget, "the closed-folder destination should remain in the accepted layout");
  assert(
    ids(closedTarget.childPages.flat()) ===
      "preview-0,preview-1,preview-2,preview-3,preview-4,preview-5,preview-6,preview-7," +
      "desktop-0,folder-0,folder-1,folder-2,desktop-1,desktop-2",
    "closed-folder insertion should retain all existing members and append selected members in stable order"
  );
  assert(
    closedTarget.childPages.length === 5 && closedTarget.childPages.every((page) => page.length <= 3),
    "closed-folder insertion should create as many child pages as required"
  );
  assertValidLayout(assert, intoClosedFolder.nextPages, 4, 3, "closed-folder transfer");

  const appCreateFixture = sixSourceFixture();
  const appCreate = planGroupTransfer(commonRequest({
    basePages: [[app("target-app"), ...appCreateFixture[0]!], ...appCreateFixture.slice(1)],
    intent: { targetAppId: "target-app", type: "application" },
  }));
  assert(
    appCreate.status === "accepted" && appCreate.effects.createdFolderId === "folder-created",
    "application intent should create a folder atomically"
  );
  const appCreatedFolder = folderById(appCreate.nextPages, "folder-created");
  assert(appCreatedFolder, "application intent should materialize the created folder");
  assert(
    ids(appCreatedFolder.childPages.flat()) ===
      "target-app,desktop-0,folder-0,folder-1,folder-2,desktop-1,desktop-2",
    "application intent should put the target first and stable selected members after it"
  );
  const appTargetMember = appCreate.members[0];
  assert(
    appTargetMember?.id === "target-app" &&
      appTargetMember.role === "folder-create-target" &&
      appTargetMember.selected === false &&
      appTargetMember.destination.kind === "folder" &&
      appTargetMember.destination.flatIndex === 0,
    "the application target should be an explicit semantic member rather than a visual-only special case"
  );
  assertValidLayout(assert, appCreate.nextPages, 4, 3, "application folder creation");

  const toolbarBase = [
    [folder("emptied-source", [["anchor", "folder-selected"]]), app("keep-0")],
    [app("desktop-selected")],
    [app("keep-2")],
  ];
  const toolbarRequest = {
    basePages: toolbarBase,
    baseRevision: 2,
    currentRevision: 2,
    folderName: "Toolbar group",
    folderPageSize: 2,
    intent: { anchorId: "anchor", type: "toolbar-folder-create" },
    leadId: "desktop-selected",
    makeFolderId: () => "toolbar-folder",
    pageSize: 2,
    selectedIds: ["desktop-selected", "folder-selected", "anchor"],
  };
  const toolbarCreate = planGroupTransfer(toolbarRequest);
  assert(
    toolbarCreate.status === "accepted" &&
      toolbarCreate.effects.emptiedFolderIds.includes("emptied-source") &&
      ids(toolbarCreate.nextPages[0]) === "toolbar-folder,keep-0",
    "toolbar creation should replace an emptied source folder at the primary anchor shell"
  );
  const toolbarFolder = folderById(toolbarCreate.nextPages, "toolbar-folder");
  assert(toolbarFolder, "toolbar creation should materialize the destination folder");
  assert(
    ids(toolbarFolder.childPages.flat()) === "anchor,folder-selected,desktop-selected",
    "toolbar creation should ignore lead order and retain stable source order"
  );
  const toolbarAlternateLead = planGroupTransfer({ ...toolbarRequest, leadId: "anchor" });
  assert(
    JSON.stringify(toolbarAlternateLead.nextPages) === JSON.stringify(toolbarCreate.nextPages),
    "toolbar creation should use intent.anchorId for shell placement and not overload leadId"
  );
  assertValidLayout(assert, toolbarCreate.nextPages, 2, 2, "toolbar folder creation");

  const compactedSourcePages = planGroupTransfer({
    basePages: [[app("keep-left")], [app("move-a"), app("move-b")], [app("keep-right")]],
    baseRevision: 1,
    currentRevision: 1,
    folderPageSize: 3,
    intent: { index: 1, pageIndex: 0, type: "desktop-slot" },
    leadId: "move-b",
    makeFolderId: () => "unused",
    pageSize: 4,
    selectedIds: ["move-b", "move-a"],
  });
  assert(
    compactedSourcePages.status === "accepted" &&
      compactedSourcePages.nextPages.length === 2 &&
      ids(compactedSourcePages.nextPages[0]) === "keep-left,move-a,move-b" &&
      ids(compactedSourcePages.nextPages[1]) === "keep-right",
    "a fully emptied middle desktop page should be removed without pulling unrelated items across partial pages"
  );

  const noop = planGroupTransfer({
    basePages: [[app("a"), app("b"), app("c")]],
    baseRevision: 1,
    currentRevision: 1,
    folderPageSize: 3,
    intent: { index: 1, pageIndex: 0, type: "desktop-slot" },
    leadId: "b",
    makeFolderId: () => "unused",
    pageSize: 4,
    selectedIds: ["b"],
  });
  assert(
    noop.status === "noop" && noop.reason === "same-placement" && ids(noop.nextPages[0]) === "a,b,c",
    "the planner should derive same-placement from layout equality instead of accepting a caller hint"
  );

  for (let count = 1; count <= 25; count += 1) {
    const selected = Array.from({ length: count }, (_, index) => `selected-${index}`);
    const propertyBase: GroupTransferItem[][] = [];
    for (let index = 0; index < selected.length; index += 4) {
      propertyBase.push(selected.slice(index, index + 4).map((id) => app(id)));
    }
    propertyBase.push([app("destination-keep")]);
    const propertyPlan = planGroupTransfer({
      basePages: propertyBase,
      baseRevision: count,
      currentRevision: count,
      folderPageSize: 3,
      intent: { index: 1, pageIndex: propertyBase.length - 1, type: "desktop-slot" },
      leadId: selected.at(-1),
      makeFolderId: () => "unused",
      pageSize: 4,
      selectedIds: [...selected].reverse(),
    });
    assert(propertyPlan.status === "accepted", `count ${count} should produce an accepted transfer`);
    assert(
      allItemIds(propertyPlan.nextPages).sort().join(",") === [...selected, "destination-keep"].sort().join(","),
      `count ${count} should conserve every id exactly once`
    );
    assert(
      propertyPlan.members.map((member) => member.id).join(",") === selected.join(","),
      `count ${count} should retain stable layout order regardless of selection input order`
    );
    assertValidLayout(assert, propertyPlan.nextPages, 4, 3, `property transfer ${count}`);
  }

  const stale = planGroupTransfer(commonRequest({ currentRevision: 8 }));
  assert(
    stale.status === "rejected" && stale.reason === "revision-stale" && stale.nextPages === null,
    "revision changes must reject before producing a mutated layout"
  );
}
