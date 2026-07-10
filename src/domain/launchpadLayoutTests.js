import {
  chunkIntoPages,
  expandRect,
  isPointInsideRect,
  makePageSize,
  shouldCommitPlacementFromLast,
  shrinkRect,
} from "./launchpadLayout.js";

export function runLaunchpadHelperTests(context) {
  const { helpers, pageSize, folderPageSize } = context;
  const {
    canCreateDesktopPageAfterDrag,
    canCreateFolderPageAfterDrag,
    collectAppsFromPages,
    countItemOccurrences,
    dissolveFolder,
    filterAppsForSearch,
    findFolder,
    flattenTopLevelPages,
    getFolderChildPages,
    getFolderPreviewSlots,
    getVisibleDesktopPage,
    getVisibleFolderPage,
    insertAppIntoFolder,
    insertTopLevelItem,
    previewAppIntoFolderWithoutOverflow,
    previewTopLevelItemWithoutOverflow,
    wouldFolderInsertOverflow,
    wouldTopLevelInsertOverflow,
  } = helpers;

  const a = { id: "a", type: "app", name: "A", emoji: "A" };
  const b = { id: "b", type: "app", name: "B", emoji: "B" };
  const c = { id: "c", type: "app", name: "C", emoji: "C" };
  const d = { id: "d", type: "app", name: "D", emoji: "D" };
  const e = { id: "e", type: "app", name: "E", emoji: "E" };
  const folder = { id: "folder", type: "folder", name: "Folder", children: [b] };
  const assert = (condition, message) => {
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
  assert(overflow.length === 2 && overflow[0].length === 2 && overflow[1].length === 1, "insertTopLevelItem should overflow according to custom page size");
  const previewOverflow = previewTopLevelItemWithoutOverflow([[a, b]], c, 0, 1, 2);
  assert(previewOverflow.length === 1 && previewOverflow[0].map((item) => item.id).join("") === "acb", "desktop preview should reorder a full page without cascading overflow");
  const fullDesktopPreview = previewTopLevelItemWithoutOverflow([Array.from({ length: pageSize.value }, (_, index) => ({ ...a, id: `desktop-full-${index}` }))], c, 0, 1, pageSize.value);
  assert(fullDesktopPreview[0].length === pageSize.value + 1, "desktop preview should keep the temporarily overflowed item in page data");
  assert(getVisibleDesktopPage(fullDesktopPreview[0]).length === pageSize.value, "desktop preview should hide the temporary overflow item from rendering");
  assert(wouldTopLevelInsertOverflow([[a, b]], c, 0, 2), "desktop hover should detect an external insert into a full page");
  assert(!wouldTopLevelInsertOverflow([[a, b]], a, 0, 2), "desktop hover should allow reordering an item already on the full page");
  const folderInsert = insertAppIntoFolder([[a, folder]], "folder", c, 0, 0, 2);
  assert(getFolderChildPages(findFolder(folderInsert, "folder")?.item, 2)[0][0].id === "c", "insertAppIntoFolder should insert app at requested page index");
  assert(countItemOccurrences(folderInsert, "c") === 1, "insertAppIntoFolder should not duplicate app");
  const searchApps = collectAppsFromPages([[a, { ...folder, childPages: [[b]], children: [b] }]]);
  assert(searchApps.length === 2 && searchApps.every((item) => item.type === "app"), "search collection should flatten apps and exclude folders");
  assert(filterAppsForSearch(searchApps, " b ")[0].id === "b", "search should match app names case-insensitively after trimming");
  const folderSlots = insertAppIntoFolder([[{ ...folder, children: [b, null, c] }]], "folder", a, 0, 1, 4);
  assert(getFolderChildPages(findFolder(folderSlots, "folder")?.item, 4)[0].map((item) => item.id).join("") === "bac", "insertAppIntoFolder should compact a folder page before sorting");
  const fullFolder = { id: "full-folder", type: "folder", name: "Full", childPages: [[a, b]], children: [a, b] };
  assert(wouldFolderInsertOverflow([[fullFolder]], "full-folder", c, 0, 2), "folder hover should detect an external insert into a full folder page");
  assert(!wouldFolderInsertOverflow([[fullFolder]], "full-folder", a, 0, 2), "folder hover should allow reordering an item already on the full folder page");
  const folderPreview = previewAppIntoFolderWithoutOverflow([[{ ...folder, childPages: [[b]], children: [b] }]], "folder", a, 0, 0, 1);
  const folderPreviewChildren = getFolderChildPages(folderPreview[0][0], 1)[0];
  assert(folderPreviewChildren.map((item) => item.id).join("") === "ab", "folder preview should keep the temporarily overflowed child in the same page data");
  const fullFolderChildren = Array.from({ length: folderPageSize.value }, (_, index) => ({ ...b, id: `folder-full-${index}` }));
  const fullFolderPreview = previewAppIntoFolderWithoutOverflow([[{ ...folder, childPages: [fullFolderChildren], children: fullFolderChildren }]], "folder", a, 0, 0, folderPageSize.value);
  const fullFolderPreviewChildren = getFolderChildPages(fullFolderPreview[0][0], folderPageSize.value)[0];
  assert(fullFolderPreviewChildren.length === folderPageSize.value + 1, "folder preview should keep the temporarily overflowed child in folder page data");
  assert(getVisibleFolderPage(fullFolderPreviewChildren).length === folderPageSize.value, "folder preview should hide the temporary folder overflow item from rendering");
  const folderLaterPage = insertAppIntoFolder([[{ ...folder, childPages: [[b], []], children: [b] }]], "folder", c, 1, 3, 2);
  const laterPages = getFolderChildPages(findFolder(folderLaterPage, "folder")?.item, 2);
  assert(laterPages.length === 2 && laterPages[0].length === 1 && laterPages[1][0].id === "c", "folder pages should allow trailing empty space before later pages like desktop pages");
  assert(getFolderPreviewSlots({ ...folder, childPages: [[a, b, c]] }, 12).length === 9, "folder preview should always render 3x3 slots");
  const collapsedBlankFolderPages = getFolderChildPages({ ...folder, childPages: [[a], [], [b]] }, 2);
  assert(collapsedBlankFolderPages.length === 2 && collapsedBlankFolderPages[0][0].id === "a" && collapsedBlankFolderPages[1][0].id === "b", "folder pages should remove empty middle pages automatically");

  const dissolved = dissolveFolder([[
    a,
    { id: "folder-dissolve", type: "folder", name: "Dissolve", childPages: [[b], [c]], children: [b, c] },
    d,
  ], [e]], "folder-dissolve", 3);
  assert(dissolved.map((page) => page.map((item) => item.id).join("")).join("|") === "abc|de", "dissolving a folder should replace it with children and cascade overflow in row-major order");
  assert(!findFolder(dissolved, "folder-dissolve"), "dissolving should remove the folder container");
  assert(countItemOccurrences(dissolved, "b") === 1 && countItemOccurrences(dissolved, "c") === 1, "dissolving should preserve each child exactly once");

  assert(!canCreateDesktopPageAfterDrag([[a]], 0, "a"), "desktop should not create a new page when the current page would become empty after dragging");
  assert(canCreateDesktopPageAfterDrag([[a, b]], 0, "a"), "desktop should create a new page when another item remains on the current page");
  assert(!canCreateDesktopPageAfterDrag([[]], 0, "a"), "desktop should not create a new page from an empty current page");
  assert(!canCreateFolderPageAfterDrag({ ...folder, childPages: [[b]] }, 0, "b", 2), "folder should not create a new page when the current folder page would become empty after dragging");
  assert(canCreateFolderPageAfterDrag({ ...folder, childPages: [[b, c]] }, 0, "b", 2), "folder should create a new page when another child remains on the current folder page");

  const rect = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
  assert(isPointInsideRect(shrinkRect(rect, 0.5), 50, 50), "center point should be inside shrunk folder hit zone");
  assert(expandRect(rect, 10).right === 110, "expandRect should add sticky margin around target");
}
