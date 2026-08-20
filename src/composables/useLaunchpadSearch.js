import { computed, nextTick, ref } from "vue";
import { chunkIntoPages } from "../domain/launchpadLayout.js";
import { buildAppSearchDocuments, searchAppDocuments } from "../domain/launchpadSearch.js";
import { runtimePerformanceMetrics } from "../diagnostics/runtimePerformanceMetrics.js";

export function useLaunchpadSearch(options) {
  const searchQuery = ref("");
  const isSearchMode = computed(() => searchQuery.value.trim().length > 0);
  const allSearchApps = computed(() => options.collectAppsFromPages(options.pages.value));
  const searchDocuments = computed(() => {
    const documents = runtimePerformanceMetrics.measure(
      "search.index.build",
      () => buildAppSearchDocuments(allSearchApps.value)
    );
    runtimePerformanceMetrics.markOnce("search.index.first-ready");
    return documents;
  });
  const searchApps = computed(() => {
    const query = searchQuery.value;
    if (!query.trim()) return [];
    return runtimePerformanceMetrics.measure(
      "search.query",
      () => searchAppDocuments(searchDocuments.value, query)
    );
  });
  const searchPages = computed(() => chunkIntoPages(searchApps.value, options.pageSize.value));
  const activePages = computed(() => (isSearchMode.value ? searchPages.value : options.pages.value));
  const activePageIndex = computed(() => (isSearchMode.value ? options.searchPageIndex.value : options.pageIndex.value));

  function focusFirstIconOnNextTick() {
    nextTick(() => options.focusFirstIconInCurrentScope({ force: true }));
  }

  function handleSearchInput(event) {
    const nextQuery = event?.target?.value || "";
    searchQuery.value = nextQuery;
    options.commitSearchPageIndex(0);
    if (nextQuery.trim() && !options.isDragActive() && options.openFolderId.value) options.commitOpenFolder(null);
    if (nextQuery.trim()) focusFirstIconOnNextTick();
    else options.clearFocusedIcon();
    options.schedulePageGridMetrics();
  }

  function clearSearch(clearOptions) {
    searchQuery.value = "";
    options.commitSearchPageIndex(0);
    if (clearOptions?.focusFirst) focusFirstIconOnNextTick();
    else if (!clearOptions?.keepFocus) options.clearFocusedIcon();
    options.schedulePageGridMetrics();
  }

  return {
    activePageIndex,
    activePages,
    clearSearch,
    handleSearchInput,
    isSearchMode,
    searchApps,
    searchPages,
    searchQuery,
  };
}
