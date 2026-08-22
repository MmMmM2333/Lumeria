import {
  chunkIntoPages,
  type createLaunchpadLayoutHelpers,
  expandRect,
  isPointInsideRect,
  makePageSize,
  shouldCommitPlacementFromLast,
  shrinkRect,
  type LaunchpadApp,
  type LaunchpadFolder,
} from "./launchpadLayout.js";

export function runLaunchpadHelperTests(
  context: { helpers: ReturnType<typeof createLaunchpadLayoutHelpers> },
): void {
  const { helpers } = context;
  const {
    collectAppsFromPages,
    countItemOccurrences,
    dissolveFolder,
    findFolder,
    flattenTopLevelPages,
    getFolderChildPages,
    getFolderPreviewSlots,
    getVisibleFolderPage,
    insertAppIntoFolder,
    insertTopLevelItem,
  } = helpers;

  const a: LaunchpadApp = { id: "a", type: "app", name: "A", emoji: "A" };
  const b: LaunchpadApp = { id: "b", type: "app", name: "B", emoji: "B" };
  const c: LaunchpadApp = { id: "c", type: "app", name: "C", emoji: "C" };
  const d: LaunchpadApp = { id: "d", type: "app", name: "D", emoji: "D" };
  const e: LaunchpadApp = { id: "e", type: "app", name: "E", emoji: "E" };
  const folder: LaunchpadFolder = { id: "folder", type: "folder", name: "Folder", childPages: [[b]] };
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad Vue helper test failed] ${message}`);
  };

  assert(makePageSize(4, 6) === 24, "page size should equal rows * cols");
  assert(chunkIntoPages([a, b, c], 2).length === 2, "custom page size should repack into more pages when capacity shrinks");
  assert(chunkIntoPages([a, b, c], 9).length === 1, "custom page size should merge pages when capacity grows");
  assert(flattenTopLevelPages([[a], [b, c]]).map((item) => item.id).join("") === "abc", "flattenTopLevelPages should preserve row-major order");
  assert(shouldCommitPlacementFromLast(null, "page:0:0", 0, 0, 18, false), "placement should commit when no previous point exists");
  assert(!shouldCommitPlacementFromLast({ key: "page:0:0", x: 0, y: 0 }, "page:0:0", 6, 6, 18, false), "placement should not commit under distance threshold");
  assert(shouldCommitPlacementFromLast({ key: "page:0:0", x: 0, y: 0 }, "page:0:1", 6, 6, 18, false), "placement should commit when the placement key changes");

  const overflow = insertTopLevelItem([[...Array.from({ length: 2 }, (_, index) => ({ ...a, id: `full-${index}` }))]], c, 0, 0, 2);
  assert(overflow.length === 2 && overflow[0]!.length === 2 && overflow[1]!.length === 1, "insertTopLevelItem should overflow according to custom page size");
  const folderInsert = insertAppIntoFolder([[a, folder]], "folder", c, 0, 0, 2);
  assert(getFolderChildPages(findFolder(folderInsert, "folder")!.item, 2)[0]![0]!.id === "c", "insertAppIntoFolder should insert app at requested page index");
  assert(countItemOccurrences(folderInsert, "c") === 1, "insertAppIntoFolder should not duplicate app");
  const searchApps = collectAppsFromPages([[a, { ...folder, childPages: [[b]] }]]);
  assert(searchApps.length === 2 && searchApps.every((item) => item.type === "app"), "search collection should flatten apps and exclude folders");
  const folderSlots = insertAppIntoFolder([[{ ...folder, childPages: [[b, null, c]] }]], "folder", a, 0, 1, 4);
  assert(getFolderChildPages(findFolder(folderSlots, "folder")!.item, 4)[0]!.map((item) => item.id).join("") === "bac", "insertAppIntoFolder should compact a folder page before sorting");
  const fullFolder: LaunchpadFolder = { id: "full-folder", type: "folder", name: "Full", childPages: [[a, b]] };
  assert(getVisibleFolderPage(getFolderChildPages(fullFolder, 2)[0]!).length === 2, "folder page visibility should honor the configured page size");
  const folderLaterPage = insertAppIntoFolder([[{ ...folder, childPages: [[b], []] }]], "folder", c, 1, 3, 2);
  const laterPages = getFolderChildPages(findFolder(folderLaterPage, "folder")!.item, 2);
  assert(laterPages.length === 2 && laterPages[0]!.length === 1 && laterPages[1]![0]!.id === "c", "folder pages should allow trailing empty space before later pages like desktop pages");
  assert(getFolderPreviewSlots({ ...folder, childPages: [[a, b, c]] }, 12).length === 9, "folder preview should always render 3x3 slots");
  const collapsedBlankFolderPages = getFolderChildPages({ ...folder, childPages: [[a], [], [b]] }, 2);
  assert(collapsedBlankFolderPages.length === 2 && collapsedBlankFolderPages[0]![0]!.id === "a" && collapsedBlankFolderPages[1]![0]!.id === "b", "folder pages should remove empty middle pages automatically");

  const dissolved = dissolveFolder([[
    a,
    { id: "folder-dissolve", type: "folder", name: "Dissolve", childPages: [[b], [c]] },
    d,
  ], [e]], "folder-dissolve", 3);
  assert(dissolved.map((page) => page.map((item) => item.id).join("")).join("|") === "abc|de", "dissolving a folder should replace it with children and cascade overflow in row-major order");
  assert(!findFolder(dissolved, "folder-dissolve"), "dissolving should remove the folder container");
  assert(countItemOccurrences(dissolved, "b") === 1 && countItemOccurrences(dissolved, "c") === 1, "dissolving should preserve each child exactly once");

  const rect = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
  assert(isPointInsideRect(shrinkRect(rect, 0.5), 50, 50), "center point should be inside shrunk folder hit zone");
  assert(expandRect(rect, 10).right === 110, "expandRect should add sticky margin around target");
}
