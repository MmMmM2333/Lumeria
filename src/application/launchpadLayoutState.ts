import type { StateHost } from "./stateHost.js";
import {
  chunkIntoPages,
  clamp,
  createLaunchpadLayoutHelpers,
  makePageSize,
} from "../domain/launchpadLayout.js";
import type {
  LaunchpadApp,
  LaunchpadPages,
  ReadonlyLaunchpadPages,
} from "../domain/launchpadLayout.js";
import { createLaunchpadDataHelpers } from "../domain/launchpadData.js";
import type { AppSeed } from "../mocks/appSeeds.js";
import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
} from "../domain/launchpadGridDefaults.js";
import {
  FOLDER_ICON_SIZE_MODE_GLOBAL,
  clampLaunchpadIconSize,
  normalizeFolderIconSizeMode,
} from "../domain/layoutConfiguration.js";

export type FolderPageTurnPhase = "idle" | "opening" | "open" | "closing";
export type FolderPageTurnContext = Readonly<{
  folderId: string | null;
  maxIndex: number;
  phase: FolderPageTurnPhase;
}>;
export type FolderPageTurnContextInput = Readonly<{
  folderId?: string | null;
  maxIndex?: unknown;
  phase?: unknown;
}>;
export type FolderPageTurnRequestOptions = FolderPageTurnContextInput & Readonly<{
  source?: string | null;
}>;
export type FolderPageTurnRequest = Readonly<{
  token: number;
  folderId: string | null;
  fromIndex: number;
  targetIndex: number;
  source: string | null;
  phaseAtRequest: FolderPageTurnPhase;
}>;
export type LaunchpadLayoutConfiguration = Readonly<{
  rows: number;
  cols: number;
  folderRows: number;
  folderCols: number;
  iconSize: number;
  folderIconSizeMode: "global" | "custom";
  folderIconSize: number;
}>;
export type LaunchpadLayoutConfigurationInput = Partial<{
  rows: unknown;
  cols: unknown;
  folderRows: unknown;
  folderCols: unknown;
  iconSize: unknown;
  folderIconSizeMode: unknown;
  folderIconSize: unknown;
}>;
export type LaunchpadLayoutOptions = Readonly<{
  getNewFolderName: () => unknown;
  seedEnabled?: boolean;
  seeds?: readonly (AppSeed | LaunchpadApp)[];
}>;

const FOLDER_PAGE_TURN_PHASES = new Set<FolderPageTurnPhase>(["idle", "opening", "open", "closing"]);

function normalizeFolderPageTurnPhase(value: unknown): FolderPageTurnPhase {
  return typeof value === "string" && FOLDER_PAGE_TURN_PHASES.has(value as FolderPageTurnPhase)
    ? value as FolderPageTurnPhase
    : "idle";
}

function normalizePageIndex(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function normalizeMaxIndex(value: unknown): number {
  return Math.max(0, normalizePageIndex(value, 0));
}

export function createLaunchpadLayoutState(options: LaunchpadLayoutOptions, host: StateHost) {
  const { cell: ref, derived: computed, readonly } = host;
  const shallowRef = ref;
  if (typeof options.getNewFolderName !== "function") {
    throw new TypeError("useLaunchpadLayout requires getNewFolderName");
  }
  const gridRowsState = ref(DEFAULT_ROWS);
  const gridColsState = ref(DEFAULT_COLS);
  const folderRowsState = ref(DEFAULT_FOLDER_ROWS);
  const folderColsState = ref(DEFAULT_FOLDER_COLS);
  const iconSizeState = ref(DEFAULT_ICON_SIZE);
  const folderIconSizeModeState = ref<"global" | "custom">(FOLDER_ICON_SIZE_MODE_GLOBAL);
  const folderIconSizeState = ref(DEFAULT_ICON_SIZE);
  const pageSize = computed(() => makePageSize(gridRowsState.value, gridColsState.value));
  const folderPageSize = computed(() => makePageSize(folderRowsState.value, folderColsState.value));
  const pageIndexState = ref(0);
  const searchPageIndexState = ref(0);
  const folderPageIndexState = ref(0);
  const folderPageTurnRequestState = shallowRef<FolderPageTurnRequest | null>(null);
  const folderPageTurnContextVersion = ref(0);
  let folderPageTurnContextResolver: (() => FolderPageTurnContextInput) | null = null;
  let nextFolderPageTurnToken = 1;

  const layoutHelpers = createLaunchpadLayoutHelpers({
    getFolderPageSize: () => folderPageSize.value,
    getPageSize: () => pageSize.value,
  });
  const dataHelpers = createLaunchpadDataHelpers({
    cloneItem: layoutHelpers.cloneItem,
    clonePages: layoutHelpers.clonePages,
    compactPages: layoutHelpers.compactPages,
    ensurePage: layoutHelpers.ensurePage,
    getFolderChildPages: layoutHelpers.getFolderChildPages,
    getFolderPageSize: () => folderPageSize.value,
    getNewFolderName: options.getNewFolderName,
    getPageSize: () => pageSize.value,
    makeId: layoutHelpers.makeId,
    withFolderPages: layoutHelpers.withFolderPages,
  });
  const seeds: readonly (AppSeed | LaunchpadApp)[] = options.seeds || [];
  const pagesState = shallowRef<LaunchpadPages>(
    options.seedEnabled === false
      ? [[]]
      : chunkIntoPages(seeds.map((seed, index) => {
          if (!("type" in seed)) {
            return layoutHelpers.makeApp(seed as readonly [unknown, unknown?], index);
          }
          if (seed.type === "folder") {
            const childPages = seed.childPages.map((page) => page.map((child) => ({ ...child })));
            return layoutHelpers.makeApp({ ...seed, childPages }, index);
          }
          return layoutHelpers.makeApp(seed, index);
        }), pageSize.value)
  );

  function commitPages(nextPages: LaunchpadPages): LaunchpadPages {
    pagesState.value = Array.isArray(nextPages) && nextPages.length ? nextPages : [[]];
    return pagesState.value;
  }

  function commitPageIndex(next: unknown, maxIndex: unknown = Math.max(0, pagesState.value.length - 1)): number {
    pageIndexState.value = clamp(normalizePageIndex(next, pageIndexState.value), 0, normalizeMaxIndex(maxIndex));
    return pageIndexState.value;
  }

  function commitSearchPageIndex(next: unknown, maxIndex: unknown = Number.MAX_SAFE_INTEGER): number {
    searchPageIndexState.value = clamp(
      normalizePageIndex(next, searchPageIndexState.value),
      0,
      normalizeMaxIndex(maxIndex)
    );
    return searchPageIndexState.value;
  }

  function commitFolderPageIndex(next: unknown, maxIndex: unknown = Number.MAX_SAFE_INTEGER): number {
    folderPageIndexState.value = clamp(
      normalizePageIndex(next, folderPageIndexState.value),
      0,
      normalizeMaxIndex(maxIndex)
    );
    return folderPageIndexState.value;
  }

  function setFolderPageTurnContextResolver(resolver: (() => FolderPageTurnContextInput) | null): void {
    folderPageTurnContextResolver = typeof resolver === "function" ? resolver : null;
    folderPageTurnContextVersion.value += 1;
  }

  function resolveFolderPageTurnContext(overrides: FolderPageTurnContextInput = {}): FolderPageTurnContext {
    folderPageTurnContextVersion.value;
    const resolved = folderPageTurnContextResolver?.() || {};
    const phase = normalizeFolderPageTurnPhase(overrides.phase ?? resolved.phase);
    const folderId = overrides.folderId ?? resolved.folderId ?? null;
    const maxIndex = normalizeMaxIndex(overrides.maxIndex ?? resolved.maxIndex);
    return { folderId, maxIndex, phase };
  }

  function isFolderPageTurnRequestValid(
    request: FolderPageTurnRequest | null,
    context: FolderPageTurnContext = resolveFolderPageTurnContext(),
  ): request is FolderPageTurnRequest {
    if (!request) return false;
    if (context.phase !== "opening" && context.phase !== "open") return false;
    if ((request.folderId ?? null) !== (context.folderId ?? null)) return false;
    return request.targetIndex >= 0 && request.targetIndex <= context.maxIndex;
  }

  function requestFolderPageTurn(targetIndex: unknown, requestOptions: FolderPageTurnRequestOptions = {}): number {
    const context = resolveFolderPageTurnContext(requestOptions);
    const fallback = normalizePageIndex(folderPageIndexState.value, 0);
    const target = clamp(normalizePageIndex(targetIndex, fallback), 0, context.maxIndex);
    const token = nextFolderPageTurnToken;
    nextFolderPageTurnToken += 1;
    folderPageTurnRequestState.value = {
      token,
      folderId: context.folderId,
      fromIndex: clamp(fallback, 0, context.maxIndex),
      targetIndex: target,
      source: requestOptions.source || null,
      phaseAtRequest: context.phase,
    };
    return token;
  }

  function commitFolderPageTurnRequest(token: number, commitOptions: FolderPageTurnContextInput = {}): boolean {
    const request = folderPageTurnRequestState.value;
    if (!request || request.token !== token) return false;
    const context = resolveFolderPageTurnContext(commitOptions);
    if (!isFolderPageTurnRequestValid(request, context)) return false;
    commitFolderPageIndex(request.targetIndex, context.maxIndex);
    folderPageTurnRequestState.value = null;
    return true;
  }

  function clearFolderPageTurnRequest(_reason: unknown = null): boolean {
    if (!folderPageTurnRequestState.value) return false;
    folderPageTurnRequestState.value = null;
    return true;
  }

  const visualFolderPageIndex = computed(() => {
    const request = folderPageTurnRequestState.value;
    const context = resolveFolderPageTurnContext();
    return isFolderPageTurnRequestValid(request, context)
      ? request.targetIndex
      : folderPageIndexState.value;
  });

  function captureConfiguration(): LaunchpadLayoutConfiguration {
    return {
      rows: gridRowsState.value,
      cols: gridColsState.value,
      folderRows: folderRowsState.value,
      folderCols: folderColsState.value,
      iconSize: iconSizeState.value,
      folderIconSizeMode: folderIconSizeModeState.value,
      folderIconSize: folderIconSizeState.value,
    };
  }

  function applyConfiguration(candidate: LaunchpadLayoutConfigurationInput = {}): LaunchpadLayoutConfiguration {
    const rows = clamp(Number(candidate.rows) || DEFAULT_ROWS, 2, 8);
    const cols = clamp(Number(candidate.cols) || DEFAULT_COLS, 3, 10);
    const folderRows = clamp(Number(candidate.folderRows) || DEFAULT_FOLDER_ROWS, 2, 6);
    const folderCols = clamp(Number(candidate.folderCols) || DEFAULT_FOLDER_COLS, 2, 8);
    const iconSize = clampLaunchpadIconSize(candidate.iconSize);
    const folderIconSizeMode = normalizeFolderIconSizeMode(candidate.folderIconSizeMode);
    const folderIconSize = clampLaunchpadIconSize(candidate.folderIconSize);
    const oldPageSize = pageSize.value;
    const oldFolderPageSize = folderPageSize.value;
    const nextPageSize = makePageSize(rows, cols);
    const nextFolderPageSize = makePageSize(folderRows, folderCols);
    let nextPages = layoutHelpers.clonePages(pagesState.value);

    if (nextPageSize < oldPageSize) {
      for (let pageIndex = 0; pageIndex < nextPages.length; pageIndex += 1) {
        const page = nextPages[pageIndex]!;
        while (page.length > nextPageSize) {
          const overflow = page.pop();
          if (!overflow) break;
          layoutHelpers.ensurePage(nextPages, pageIndex + 1);
          nextPages[pageIndex + 1]!.unshift(overflow);
        }
      }
    }

    nextPages = layoutHelpers.repackFoldersForPageSize(
      nextPages,
      oldFolderPageSize,
      nextFolderPageSize
    );
    nextPages = layoutHelpers.compactPages(nextPages, { folderPageSize: nextFolderPageSize });

    gridRowsState.value = rows;
    gridColsState.value = cols;
    folderRowsState.value = folderRows;
    folderColsState.value = folderCols;
    iconSizeState.value = iconSize;
    folderIconSizeModeState.value = folderIconSizeMode;
    folderIconSizeState.value = folderIconSize;
    commitPages(nextPages);
    commitPageIndex(pageIndexState.value);
    const folderContext = resolveFolderPageTurnContext();
    commitFolderPageIndex(folderPageIndexState.value, folderContext.maxIndex);

    return captureConfiguration();
  }

  /** Restores the exact page partition and indices if a settings transaction fails. */
  function createConfigurationRollback(): () => void {
    const configuration = captureConfiguration();
    const pages = layoutHelpers.clonePages(pagesState.value);
    const pageIndex = pageIndexState.value;
    const folderPageIndex = folderPageIndexState.value;
    const searchPageIndex = searchPageIndexState.value;
    const folderRequest = folderPageTurnRequestState.value;
    return () => {
      gridRowsState.value = configuration.rows;
      gridColsState.value = configuration.cols;
      folderRowsState.value = configuration.folderRows;
      folderColsState.value = configuration.folderCols;
      iconSizeState.value = configuration.iconSize;
      folderIconSizeModeState.value = configuration.folderIconSizeMode;
      folderIconSizeState.value = configuration.folderIconSize;
      pagesState.value = layoutHelpers.clonePages(pages);
      pageIndexState.value = pageIndex;
      folderPageIndexState.value = folderPageIndex;
      searchPageIndexState.value = searchPageIndex;
      folderPageTurnRequestState.value = folderRequest;
    };
  }

  function restorePages(sourcePages: ReadonlyLaunchpadPages): LaunchpadPages {
    const next = layoutHelpers.compactPages(
      layoutHelpers.clonePages(Array.isArray(sourcePages) ? sourcePages : [[]]),
      { folderPageSize: folderPageSize.value }
    );
    commitPages(next);
    commitPageIndex(pageIndexState.value);
    clearFolderPageTurnRequest("restore");
    return pagesState.value;
  }

  const presentation = Object.freeze({
    folderCols: readonly(folderColsState),
    folderIconSize: readonly(folderIconSizeState),
    folderIconSizeMode: readonly(folderIconSizeModeState),
    folderPageIndex: readonly(folderPageIndexState),
    folderPageSize,
    folderPageTurnRequest: readonly(folderPageTurnRequestState),
    folderRows: readonly(folderRowsState),
    gridCols: readonly(gridColsState),
    gridRows: readonly(gridRowsState),
    iconSize: readonly(iconSizeState),
    pageIndex: readonly(pageIndexState),
    pageSize,
    pages: readonly(pagesState),
    searchPageIndex: readonly(searchPageIndexState),
    visualFolderPageIndex,
  });

  const operations = Object.freeze({
    chunkIntoPages,
    ...layoutHelpers,
    ...dataHelpers,
  });

  const documentPersistence = Object.freeze({
    capture: () => ({
      configuration: captureConfiguration(),
      pages: layoutHelpers.clonePages(pagesState.value),
    }),
    createSnapshot: dataHelpers.createLayoutSnapshot,
    reconcileDocument: dataHelpers.reconcileDocument,
    restoreConfiguration: applyConfiguration,
    restorePages,
  });

  return {
    applyConfiguration,
    captureConfiguration,
    createConfigurationRollback,
    clearFolderPageTurnRequest,
    commitFolderPageIndex,
    commitFolderPageTurnRequest,
    commitPageIndex,
    commitPages,
    commitSearchPageIndex,
    documentPersistence,
    operations,
    presentation,
    requestFolderPageTurn,
    setFolderPageTurnContextResolver,
  };
}
