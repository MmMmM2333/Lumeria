import { computed, nextTick, ref } from "vue";
import { chunkIntoPages } from "../domain/launchpadLayout.js";

export function useLaunchpadSearch(options) {
  const searchQuery = ref("");
  const isSearchMode = computed(() => searchQuery.value.trim().length > 0);
  const allSearchApps = computed(() => options.collectAppsFromPages(options.pages.value));
  const searchDocuments = computed(() => options.buildAppSearchDocuments(allSearchApps.value));
  const searchApps = computed(() => options.searchAppDocuments(searchDocuments.value, searchQuery.value));
  const searchPages = computed(() => chunkIntoPages(searchApps.value, options.pageSize.value));
  const activePages = computed(() => (isSearchMode.value ? searchPages.value : options.pages.value));
  const activePageIndex = computed(() => (isSearchMode.value ? options.searchPageIndex.value : options.pageIndex.value));

  function selectFirstIconOnNextTick() {
    nextTick(() => options.selectFirstIconInCurrentScope({ force: true }));
  }

  function handleSearchInput(event) {
    const nextQuery = event?.target?.value || "";
    searchQuery.value = nextQuery;
    options.commitSearchPageIndex(0);
    if (nextQuery.trim() && !options.isDragActive() && options.openFolderId.value) options.commitOpenFolder(null);
    if (nextQuery.trim()) selectFirstIconOnNextTick();
    else options.clearSelectedIcon();
    options.schedulePageGridMetrics();
  }

  function clearSearch(clearOptions) {
    searchQuery.value = "";
    options.commitSearchPageIndex(0);
    if (clearOptions?.selectFirst) selectFirstIconOnNextTick();
    else if (!clearOptions?.keepSelection) options.clearSelectedIcon();
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
