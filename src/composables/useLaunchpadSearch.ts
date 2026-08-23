import { computed, nextTick, ref } from "vue";
import type { Ref } from "vue";
import { chunkIntoPages } from "../domain/launchpadLayout.js";
import type {
  LaunchpadApp,
  ReadonlyLaunchpadPages,
} from "../domain/launchpadLayout.js";
import { buildAppSearchDocuments, searchAppDocuments } from "../domain/launchpadSearch.js";
import { runtimePerformanceMetrics } from "../diagnostics/runtimePerformanceMetrics.js";

export type LaunchpadSearchOptions = Readonly<{
  clearFocusedIcon: () => void;
  collectAppsFromPages: (pages: ReadonlyLaunchpadPages) => LaunchpadApp[];
  commitOpenFolder: (folderId: string | null) => unknown;
  commitSearchPageIndex: (pageIndex: number) => unknown;
  focusFirstIconInCurrentScope: (options: Readonly<{ force: true }>) => unknown;
  isDragActive: () => boolean;
  openFolderId: Readonly<Ref<string | null>>;
  pageIndex: Readonly<Ref<number>>;
  pages: Readonly<{ readonly value: ReadonlyLaunchpadPages }>;
  pageSize: Readonly<Ref<number>>;
  schedulePageGridMetrics: () => void;
  searchPageIndex: Readonly<Ref<number>>;
}>;

export type LaunchpadSearchInputEvent = Readonly<{
  target?: Readonly<{ value?: string | null }> | null;
}> | null | undefined;

export type ClearLaunchpadSearchOptions = Readonly<{
  focusFirst?: boolean;
  keepFocus?: boolean;
}>;

export function useLaunchpadSearch(options: LaunchpadSearchOptions) {
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

  function handleSearchInput(event: LaunchpadSearchInputEvent): void {
    const nextQuery = event?.target?.value || "";
    searchQuery.value = nextQuery;
    options.commitSearchPageIndex(0);
    if (nextQuery.trim() && !options.isDragActive() && options.openFolderId.value) options.commitOpenFolder(null);
    if (nextQuery.trim()) focusFirstIconOnNextTick();
    else options.clearFocusedIcon();
    options.schedulePageGridMetrics();
  }

  function clearSearch(clearOptions?: ClearLaunchpadSearchOptions): void {
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
