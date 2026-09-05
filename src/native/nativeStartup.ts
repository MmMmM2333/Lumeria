import { t } from "./nativeLocalization.js";
import type { CatalogScanFilters, CatalogScanRoot, ScannedCatalogApp } from "../domain/applicationCatalog.js";
import { createLaunchpadLayoutState } from "../application/launchpadLayoutState.js";
import { createNativeStateHost } from "../application/stateHost.js";
import {
  DEFAULT_SCAN_KEYWORD_BLACKLIST,
  normalizeNativeApp,
  type NormalizedScanRoot,
} from "../domain/launchpadData.js";
import type { ReadonlyLaunchpadPages } from "../domain/launchpadLayout.js";
import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
} from "../domain/launchpadGridDefaults.js";
import type { LayoutDocument, LayoutSettings } from "../domain/layoutDocument.js";
import { DEFAULT_SCAN_ROOTS } from "../platform/applicationCatalogDefaults.js";
import {
  assertCompleteDesktopSceneFrame,
  makeDesktopSceneFrame,
  type CompleteDesktopSceneFrame,
  type SceneItem,
} from "../rendering/sceneFrame.js";

const DEFAULT_SETTINGS = Object.freeze({
  gridRows: DEFAULT_ROWS,
  gridCols: DEFAULT_COLS,
  folderRows: DEFAULT_FOLDER_ROWS,
  folderCols: DEFAULT_FOLDER_COLS,
  iconSize: DEFAULT_ICON_SIZE,
  textless: false,
  hiddenAppIds: [] as string[],
  scanRoots: [] as NormalizedScanRoot[],
  scanKeywordBlacklist: [...DEFAULT_SCAN_KEYWORD_BLACKLIST],
  scanKeywordAllowlist: [] as string[],
  scanAppBlacklist: [] as { catalogId: string }[],
  showMissingLaunchTargetBadge: true,
});

export type NativeStartupScanRequest = Readonly<{
  roots: readonly CatalogScanRoot[];
  filters: CatalogScanFilters;
}>;

export type NativePageTurn = -1 | 0 | 1;

export type NativeNavigationKey = Readonly<{
  altKey?: boolean;
  code?: string;
  ctrlKey?: boolean;
  key?: string;
  metaKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  type?: string;
}>;

export function getNativeActivePageItems(
  frame: CompleteDesktopSceneFrame,
): readonly SceneItem[] {
  return (frame.viewport.activePages[frame.viewport.activePageIndex] ?? [])
    .filter((item): item is SceneItem => item !== null);
}

export function getNativePageTurnFromKey(event: NativeNavigationKey): NativePageTurn {
  if (
    event.type !== "down"
    || event.isComposing
    || event.altKey
    || !event.ctrlKey
    || event.metaKey
  ) return 0;
  const key = event.key || event.code;
  if (key === "ArrowRight") return 1;
  if (key === "ArrowLeft") return -1;
  return 0;
}

export function setNativeDesktopPage(
  frame: CompleteDesktopSceneFrame,
  pageIndex: number,
): CompleteDesktopSceneFrame {
  if (!Number.isInteger(pageIndex)) throw new TypeError("Native desktop page index must be an integer");
  const pageCount = frame.viewport.activePages.length;
  const activePageIndex = Math.max(
    0,
    Math.min(pageCount - 1, pageIndex),
  );
  if (activePageIndex === frame.viewport.activePageIndex) return frame;
  const next = Object.freeze({
    ...frame,
    viewport: Object.freeze({
      ...frame.viewport,
      activePageIndex,
      desktopProjectionEpoch: frame.viewport.desktopProjectionEpoch + 1,
      desktopTrackMotionKey: `native-page-${activePageIndex}`,
    }),
    interaction: Object.freeze({
      ...frame.interaction,
      focusedIcon: null,
    }),
  });
  assertCompleteDesktopSceneFrame(next);
  return next;
}

function settingsFor(layout: LayoutDocument | null): Pick<
  LayoutSettings,
  | "gridRows"
  | "gridCols"
  | "folderRows"
  | "folderCols"
  | "iconSize"
  | "textless"
  | "hiddenAppIds"
  | "scanRoots"
  | "scanKeywordBlacklist"
  | "scanKeywordAllowlist"
  | "scanAppBlacklist"
  | "showMissingLaunchTargetBadge"
> {
  return layout?.settings ?? DEFAULT_SETTINGS;
}

function scanRoot(root: NormalizedScanRoot): CatalogScanRoot {
  const result: CatalogScanRoot = {
    id: root.id,
    type: root.type,
    label: root.label,
    path: root.path,
    enabled: root.enabled,
    ...(root.maxDepth === undefined ? {} : { maxDepth: root.maxDepth }),
    ...(root.maxEntries === undefined ? {} : { maxEntries: root.maxEntries }),
  };
  return result;
}

export function makeNativeStartupScanRequest(layout: LayoutDocument | null): NativeStartupScanRequest {
  const settings = settingsFor(layout);
  const roots = layout
    ? settings.scanRoots
    : DEFAULT_SCAN_ROOTS.map(({ labelKey, ...root }) => ({ ...root, label: labelKey }));
  return {
    roots: roots.filter((root) => root.enabled).map((root) => scanRoot(root)),
    filters: {
      keywordBlacklist: settings.scanKeywordBlacklist,
      keywordAllowlist: settings.scanKeywordAllowlist,
      appBlacklist: settings.scanAppBlacklist.map(({ catalogId }) => ({ catalogId })),
    },
  };
}

export function createNativeLayoutState(
  layout: LayoutDocument | null,
  catalog: readonly ScannedCatalogApp[],
  onChange: () => void = () => {},
) {
  const settings = settingsFor(layout);
  const state = createLaunchpadLayoutState({ getNewFolderName: () => t("launchpad.newFolder"), seedEnabled: false }, createNativeStateHost(onChange));
  state.applyConfiguration({ rows: settings.gridRows, cols: settings.gridCols,
    folderRows: settings.folderRows, folderCols: settings.folderCols, iconSize: settings.iconSize,
    folderIconSizeMode: layout?.settings.folderIconSizeMode, folderIconSize: layout?.settings.folderIconSize });
  state.commitPages(state.operations.reconcileDocument(
    catalog.map(normalizeNativeApp),
    layout ?? { pages: [] },
    settings.hiddenAppIds,
  ).pages);
  return state;
}

export function makeNativeStartupFrame(
  layout: LayoutDocument | null,
  catalog: readonly ScannedCatalogApp[],
  pages: ReadonlyLaunchpadPages = createNativeLayoutState(layout, catalog).presentation.pages.value,
): CompleteDesktopSceneFrame {
  const settings = settingsFor(layout);
  const activePages = pages;
  const frame = makeDesktopSceneFrame({
    activePageIndex: 0,
    activePages,
    appLaunchCloseSessionId: null,
    desktopGridDebugOptions: null,
    desktopProjectionEpoch: 0,
    desktopTrackMotionKey: "native-static-snap",
    desktopVisualAlpha: 1,
    desktopVisualTransform: { scale: 1, y: 0 },
    dragFolderHoverState: null,
    dragFolderTargetId: null,
    dragHitDebugOptions: null,
    dragHitDebugState: null,
    dragMeta: null,
    focusedIcon: null,
    folderClosingHandoffId: null,
    folderPageSize: settings.folderRows * settings.folderCols,
    folderSourceGhostedId: null,
    folderSourceGhostedIds: new Set<string>(),
    gridCols: settings.gridCols,
    gridRows: settings.gridRows,
    groupDragState: null,
    iconGesturePresentation: null,
    iconSize: settings.iconSize,
    isBatchSelectionActive: false,
    isDesktopClosing: false,
    isEditMode: false,
    isHomeRevealSettling: false,
    isSearchMode: false,
    isTextlessMode: settings.textless,
    launchTargetStatusById: {},
    launchpadVisualAlpha: 1,
    launchpadVisualTransform: { scale: 1, y: 0 },
    pageGridMeasureStyle: {},
    pageTrackScrub: null,
    provisionalFolderRollback: null,
    selectedAppIds: new Set<string>(),
    showMissingLaunchTargetBadge: settings.showMissingLaunchTargetBadge,
    singleStageDiagnosticsOptions: null,
  });
  assertCompleteDesktopSceneFrame(frame);
  return frame;
}
