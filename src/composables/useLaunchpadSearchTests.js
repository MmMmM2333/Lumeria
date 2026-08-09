import { nextTick, ref } from "vue";
import { useLaunchpadSearch } from "./useLaunchpadSearch.js";

const testApps = [
  { id: "mail", type: "app", name: "Mail" },
  { id: "calendar", type: "app", name: "Calendar" },
  { id: "mail-plus", type: "app", name: "Mail Plus" },
];

function createSearchFlow(overrides = {}) {
  const calls = {
    clearFocusedIcon: 0,
    commitOpenFolder: [],
    commitSearchPageIndex: [],
    schedulePageGridMetrics: 0,
    focusFirstIconInCurrentScope: [],
  };
  const pages = ref(overrides.pages ?? [[testApps[0], testApps[1]], [testApps[2]]]);
  const pageIndex = ref(overrides.pageIndex ?? 1);
  const searchPageIndex = ref(overrides.searchPageIndex ?? 2);
  const openFolderId = ref(overrides.openFolderId ?? "folder-1");
  const pageSize = ref(overrides.pageSize ?? 1);
  const search = useLaunchpadSearch({
    clearFocusedIcon: () => {
      calls.clearFocusedIcon += 1;
    },
    collectAppsFromPages: (sourcePages) => sourcePages.flatMap((page) => page.filter((item) => item.type === "app")),
    commitOpenFolder: (value) => {
      calls.commitOpenFolder.push(value);
      openFolderId.value = value;
    },
    commitSearchPageIndex: (value) => {
      calls.commitSearchPageIndex.push(value);
      searchPageIndex.value = value;
    },
    isDragActive: () => Boolean(overrides.isDragActive),
    openFolderId,
    pageIndex,
    pages,
    pageSize,
    schedulePageGridMetrics: () => {
      calls.schedulePageGridMetrics += 1;
    },
    searchPageIndex,
    focusFirstIconInCurrentScope: (options) => calls.focusFirstIconInCurrentScope.push(options),
  });

  return {
    calls,
    openFolderId,
    pageIndex,
    pages,
    search,
    searchPageIndex,
  };
}

export async function runLaunchpadSearchTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad search test failed] ${message}`);
  };

  const initial = createSearchFlow();
  assert(!initial.search.isSearchMode.value, "empty search should not enter search mode");
  assert(initial.search.activePages.value === initial.pages.value, "empty search should use desktop pages as active pages");
  assert(initial.search.activePageIndex.value === initial.pageIndex.value, "empty search should use the desktop page index");

  const input = createSearchFlow();
  input.search.handleSearchInput({ target: { value: " mail " } });
  assert(input.search.searchQuery.value === " mail ", "search input should preserve the raw query value");
  assert(input.search.isSearchMode.value, "non-empty search should enter search mode");
  assert(input.search.searchPages.value.length === 2, "search results should be chunked by page size");
  assert(input.search.activePages.value === input.search.searchPages.value, "search mode should use search pages as active pages");
  assert(input.search.activePageIndex.value === 0, "search input should reset the active search page index");
  assert(input.openFolderId.value === null, "typing a search should close an open folder when not dragging");
  assert(input.calls.commitSearchPageIndex.join(",") === "0", "typing a search should reset search pagination");
  assert(input.calls.commitOpenFolder.length === 1 && input.calls.commitOpenFolder[0] === null, "typing a search should request folder close with null");
  assert(input.calls.schedulePageGridMetrics === 1, "typing a search should schedule page metrics");
  await nextTick();
  assert(input.calls.focusFirstIconInCurrentScope.length === 1, "typing a search should select the first result on next tick");
  assert(input.calls.focusFirstIconInCurrentScope[0].force === true, "search result selection should force focus");
  assert(input.calls.clearFocusedIcon === 0, "typing a non-empty search should not clear selection immediately");

  const chinese = createSearchFlow({
    pages: [[{ id: "settings", type: "app", name: "设置" }]],
    pageSize: 6,
  });
  chinese.search.handleSearchInput({ target: { value: "sz" } });
  assert(chinese.search.searchApps.value[0]?.id === "settings", "search flow should expose pinyin-initial matches");
  chinese.pages.value[0][0].name = "帮助";
  assert(chinese.search.searchApps.value.length === 0, "renaming an app should invalidate its previous pinyin document");
  chinese.search.handleSearchInput({ target: { value: "bz" } });
  assert(chinese.search.searchApps.value[0]?.id === "settings", "renaming an app should expose its rebuilt pinyin document");

  input.search.clearSearch();
  assert(input.search.searchQuery.value === "", "clearSearch should clear the query");
  assert(input.calls.commitSearchPageIndex.join(",") === "0,0", "clearSearch should reset search pagination");
  assert(input.calls.clearFocusedIcon === 1, "clearSearch should clear selection by default");
  assert(input.calls.schedulePageGridMetrics === 2, "clearSearch should schedule metrics");

  const focusFirst = createSearchFlow();
  focusFirst.search.clearSearch({ focusFirst: true });
  await nextTick();
  assert(focusFirst.calls.focusFirstIconInCurrentScope.length === 1, "clearSearch can select the first icon on request");
  assert(focusFirst.calls.clearFocusedIcon === 0, "clearSearch should not clear selection when selecting the first icon");

  const keepFocus = createSearchFlow();
  keepFocus.search.clearSearch({ keepFocus: true });
  assert(keepFocus.calls.clearFocusedIcon === 0, "clearSearch should preserve selection when requested");
  await nextTick();
  assert(keepFocus.calls.focusFirstIconInCurrentScope.length === 0, "keepFocus should not schedule first-icon selection");

  const dragActive = createSearchFlow({ isDragActive: true });
  dragActive.search.handleSearchInput({ target: { value: "mail" } });
  assert(dragActive.openFolderId.value === "folder-1", "drag-active search input should not close the open folder");
  assert(dragActive.calls.commitOpenFolder.length === 0, "drag-active search input should not request folder close");

  const blankInput = createSearchFlow();
  blankInput.search.handleSearchInput({ target: { value: "" } });
  assert(blankInput.calls.clearFocusedIcon === 1, "blank search input should clear selection");
  assert(blankInput.calls.focusFirstIconInCurrentScope.length === 0, "blank search input should not select the first result");
}
