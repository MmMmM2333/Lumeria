import { Container } from "pixi.js";
import { FOLDER_OPEN_DESKTOP_TRANSFORM } from "../desktopVisualTargets.js";
import { NativePageDots } from "./NativePageDots.js";
import { t } from "../../native/nativeLocalization.js";
import {
  assertCompleteDesktopSceneFrame,
  type CompleteDesktopSceneFrame,
  type SceneItem,
  type ScenePageTrackScrub,
  type SceneDataRecord,
} from "../sceneFrame.js";
import {
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
} from "../../domain/launchpadGridDefaults.js";
import { createIconBoundsRegistry } from "../pixi/geometry/iconBoundsRegistry.js";
import { motionRuntime } from "../pixi/animation/motionRuntime.js";
import { DesktopLayer } from "../pixi/scene/DesktopLayer.js";
import type { IconTextureRepository } from "../pixi/assets/iconTextureRepository.js";
import { syncPixiTextResolution } from "../pixi/pixiText.js";
import { createFolderLayerState, type FolderOverlayFrame } from "../pixi/folderLayerState.js";
import { getFolderLayoutMetricsForRows } from "../folderLayoutMetrics.js";
import {
  applyDesktopLayerFrameUpdates,
  makeDesktopStructureFrame,
  type DesktopLayerFrameWork,
} from "../pixi/scene/desktopLayerFrames.js";
import type { NativeFolderPresentation } from "./nativeFolderFlow.js";

export type NativeSceneViewport = Readonly<{
  height: number;
  resolution: number;
  width: number;
}>;

export type NativeSceneAnimationHost = Readonly<{
  animate(update: (deltaMs: number) => void): () => void;
  invalidate(): void;
}>;

export type NativeSceneCommitOptions = Readonly<{
  folderPageTrackScrub?: ScenePageTrackScrub | null;
  folderPresentation?: NativeFolderPresentation | null;
  pageTrackScrub?: ScenePageTrackScrub | null;
  snapDesktopLayout?: boolean;
}>;

export type NativeSceneFolderLayout = Readonly<{
  cols: number;
  iconSize: number;
  rows: number;
}>;

export type NativeDesktopSceneOptions = Readonly<{
  folderLayout?: NativeSceneFolderLayout | undefined;
  iconTextures?: IconTextureRepository | undefined;
  onFolderCloseRequest?: (() => void) | undefined;
  onFolderReopenRequest?: ((folderId: string | null) => void) | undefined;
  onFolderInternalActivityChange?: ((active: boolean, folderId: string | null) => void) | undefined;
  onFolderPageIndexCommit?: ((pageIndex: number) => void) | undefined;
  onFolderRenderRequest?: (() => void) | undefined;
  onIconActivate?: ((item: SceneItem) => void) | undefined;
  onDesktopPageIndexCommit?: ((index: number) => void) | undefined;
  onIconPointerDown?: ((item: SceneItem, source: SceneDataRecord | null, event: unknown) => void) | undefined;
  onGroupReleaseComplete?: ((result: unknown) => void) | undefined;
  onRollbackComplete?: ((token:number)=>void) | undefined;
  onIconEditAction?: ((action:"remove"|"choose-icon"|"reset-icon",item:SceneItem)=>void) | undefined;
}>;

function assertStaticFrame(frame: CompleteDesktopSceneFrame): void {
  const unsupported = [
    [frame.viewport.pageTrackScrub !== null, "viewport.pageTrackScrub"],
    [frame.visual.appLaunchCloseSessionId !== null, "visual.appLaunchCloseSessionId"],
    [frame.interaction.isDesktopClosing, "interaction.isDesktopClosing"],
    [frame.interaction.isHomeRevealSettling, "interaction.isHomeRevealSettling"],
    [frame.folder.folderClosingHandoffId !== null, "folder.folderClosingHandoffId"],
    [frame.folder.folderSourceGhostedId !== null, "folder.folderSourceGhostedId"],
    [frame.folder.folderSourceGhostedIds.size > 0, "folder.folderSourceGhostedIds"],
    [frame.diagnostics.desktopGridDebugOptions !== null, "diagnostics.desktopGridDebugOptions"],
    [frame.diagnostics.dragHitDebugOptions !== null, "diagnostics.dragHitDebugOptions"],
    [frame.diagnostics.dragHitDebugState !== null, "diagnostics.dragHitDebugState"],
    [frame.diagnostics.singleStageDiagnosticsOptions !== null, "diagnostics.singleStageDiagnosticsOptions"],
  ] as const;
  const names = unsupported.filter(([active]) => active).map(([, name]) => name);
  if (names.length > 0) {
    throw new Error(`NativeDesktopScene static slice does not support: ${names.join(", ")}`);
  }
}

function assertViewport(viewport: NativeSceneViewport): void {
  for (const [name, value] of Object.entries(viewport)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError(`NativeSceneViewport.${name} must be a positive finite number`);
    }
  }
}

function visibleItems(page: readonly (SceneItem | null)[]): readonly SceneItem[] {
  return page.filter((item): item is SceneItem => item !== null);
}

function makeNativeFolderFrame(
  desktopFrame: CompleteDesktopSceneFrame,
  viewport: NativeSceneViewport,
  presentation: NativeFolderPresentation | null | undefined,
  pageTrackScrub: ScenePageTrackScrub | null | undefined,
  layout: NativeSceneFolderLayout,
  setFolderPageRef: (element: unknown, pageIndex: number) => void,
  onFolderPageIndexCommit: (pageIndex: number) => void,
): FolderOverlayFrame | null {
  const folder = presentation?.renderedFolder;
  if (!folder) return null;
  const pages = folder.childPages;
  const visibleRowCount = Math.min(layout.rows, Math.max(1, ...pages.map((page) => (
    Math.ceil(visibleItems(page).length / layout.cols) || 1
  ))));
  const metrics = getFolderLayoutMetricsForRows({
    baseFolderIconSize: layout.iconSize,
    rowCount: visibleRowCount,
    viewportHeight: viewport.height,
  });
  const stageRect = Object.freeze({ height: viewport.height, left: 0, top: 0, width: viewport.width });
  const activeDesktopPage = desktopFrame.viewport.activePages[desktopFrame.viewport.activePageIndex] ?? [];
  return createFolderLayerState({
    callbacks: {
      getFolderPageRenderMode: (pageIndex) => {
        if (pageIndex === presentation.folderPageIndex) return "interactive";
        // ponytail: keep real pages mounted for arbitrary page-dot jumps; optimize only if large folders measure poorly.
        return "static-real";
      },
      getVisibleFolderPage: visibleItems,
      isIconOpening: () => false,
      setFolderPageRef,
    },
    drag: { groupDragState: desktopFrame.interaction.groupDragState, meta: desktopFrame.interaction.dragMeta },
    folder: {
      closeIconGhosts: null,
      desktopClosing: false,
      gridStyle: {
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${visibleRowCount}, var(--folder-icon-cell-height))`,
      },
      isAppLaunchClosing: false,
      isClosing: presentation.isClosing,
      isZoomFadeClosing: false,
      openingCancelRequest: presentation.openingCancelRequest,
      openingOriginBounds: null,
      openIconGhostSession: null,
      openIconGhosts: null,
      openProgress: presentation.openProgress,
      openProgressTarget: presentation.openProgressTarget,
      pageDotsVisible: pages.length > 1,
      pageIndex: presentation.folderPageIndex,
      pageIndexCommit: onFolderPageIndexCommit,
      pageSize: layout.cols * layout.rows,
      pageTrackScrub: pageTrackScrub ?? null,
      pageTurnToken: null,
      pages,
      panelRef: null,
      panelStyle: {
        "--folder-icon-cell-height": `${metrics.iconCellHeight}px`,
        "--folder-icon-size": `${metrics.effectiveIconSize}px`,
        "--folder-row-gap": `${metrics.rowGap}px`,
        "--folder-shell-min-height": `${metrics.folderShellMinHeight}px`,
      },
      renderedFolder: folder,
      viewportRef: null,
      visualPageIndex: presentation.folderPageIndex,
      zoomFadeCloseReason: null,
    },
    geometry: {
      canvasStageRect: stageRect,
      desktopFrame: { ...stageRect, top: 64, height: Math.max(1, viewport.height - 136) },
      desktopGrid: {
        cols: desktopFrame.viewport.gridCols,
        isSearchMode: false,
        rows: desktopFrame.viewport.gridRows,
        visibleCount: visibleItems(activeDesktopPage).length,
      },
      desktopStageRect: stageRect,
      deviceResolution: viewport.resolution,
      singleStageDiagnostics: false,
    },
    stage: { rect: stageRect },
    ui: {
      focusedIcon: desktopFrame.interaction.focusedIcon,
      iconGesturePresentation: desktopFrame.interaction.iconGesturePresentation,
      isBatchSelectionActive: desktopFrame.interaction.isBatchSelectionActive,
      isEditMode: desktopFrame.interaction.isEditMode,
      isTextlessMode: desktopFrame.interaction.isTextlessMode,
      launchTargetStatusById: desktopFrame.diagnostics.launchTargetStatusById,
      selectedAppIds: desktopFrame.interaction.selectedAppIds,
      showMissingLaunchTargetBadge: desktopFrame.diagnostics.showMissingLaunchTargetBadge,
    },
  });
}

export class NativeDesktopScene {
  readonly iconBoundsRegistry = createIconBoundsRegistry();
  readonly #pageDots: NativePageDots;
  readonly #activationNodes = new WeakSet<Container>();
  readonly #folderLayout: NativeSceneFolderLayout;
  readonly #folderPageRefs = new Map<number, unknown>();
  readonly #layer: DesktopLayer;
  readonly #onIconActivate: ((item: SceneItem) => void) | null;
  readonly #onFolderPageIndexCommit: (pageIndex: number) => void;
  readonly #pageRefs = new Map<number, unknown>();
  #destroyed = false;

  constructor(stage: Container, options: NativeDesktopSceneOptions = {}) {
    if (stage.destroyed) throw new Error("NativeDesktopScene requires a live Pixi stage");
    this.#folderLayout = Object.freeze({
      cols: Math.max(1, Math.trunc(options.folderLayout?.cols ?? DEFAULT_FOLDER_COLS)),
      iconSize: Math.max(1, options.folderLayout?.iconSize ?? DEFAULT_ICON_SIZE),
      rows: Math.max(1, Math.trunc(options.folderLayout?.rows ?? DEFAULT_FOLDER_ROWS)),
    });
    this.#onFolderPageIndexCommit = options.onFolderPageIndexCommit ?? (() => {});
    this.#layer = new DesktopLayer({
      iconBoundsRegistry: this.iconBoundsRegistry,
      iconTextures: options.iconTextures,
      renderCopy:{searchEmpty:t("launchpad.search.empty"),newFolderName:t("launchpad.newFolder")},
      onClosingFolderPointerDown: options.onFolderReopenRequest,
      onFolderInternalActivityChange: options.onFolderInternalActivityChange,
      onFolderOutsidePointerDown: options.onFolderCloseRequest,
      onFolderRenderRequest: options.onFolderRenderRequest,
      onGroupReleaseComplete: result => options.onGroupReleaseComplete?.(result),
      onProvisionalFolderRollbackComplete: payload => options.onRollbackComplete?.(payload.token),
      onIconAction: (action, event, item, source) => {
        if (action !== "pointerdown") {
          if(action==="remove" || action==="choose-icon" || action==="reset-icon") {
            if(item)options.onIconEditAction?.(action,item);
            return;
          }
          throw new Error(`NativeDesktopScene received an unexpected icon action: ${action}`);
        }
        if(item) options.onIconPointerDown?.(item, source ?? null, event);
      },
      showFolderTitle: true,
    });
    this.#onIconActivate = options.onIconActivate ?? null;
    this.#layer.label = "launchpad-native-desktop";
    stage.addChild(this.#layer);
    this.#pageDots = new NativePageDots(index => options.onDesktopPageIndexCommit?.(index));
    stage.addChild(this.#pageDots);
  }

  commit(
    frame: CompleteDesktopSceneFrame,
    viewport: NativeSceneViewport,
    options: NativeSceneCommitOptions = {},
  ): DesktopLayerFrameWork {
    if (this.#destroyed) throw new Error("NativeDesktopScene has been destroyed");
    assertCompleteDesktopSceneFrame(frame);
    assertStaticFrame(frame);
    assertViewport(viewport);

    const stageRect = Object.freeze({
      height: viewport.height,
      left: 0,
      top: 0,
      width: viewport.width,
    });
    const folderState = makeNativeFolderFrame(
      frame,
      viewport,
      options.folderPresentation,
      options.folderPageTrackScrub,
      this.#folderLayout,
      (element, pageIndex) => {
        if (element == null) this.#folderPageRefs.delete(pageIndex);
        else this.#folderPageRefs.set(pageIndex, element);
      },
      this.#onFolderPageIndexCommit,
    );
    const folderId = folderState?.renderedFolder?.id ?? null;
    const folderSourceGhostedIds = new Set(frame.folder.folderSourceGhostedIds);
    for (const id of this.#layer.singleStageFolderLayer.getDesktopSourceGhostedIds()) folderSourceGhostedIds.add(id);
    if (folderId) folderSourceGhostedIds.add(folderId);
    const folderOpen = Boolean(folderState && !folderState.isFolderClosing);
    this.#pageDots.update(frame, viewport.width, viewport.height, folderOpen || frame.interaction.isDesktopClosing);
    const structureFrame = makeDesktopStructureFrame({
      activePageIndex: frame.viewport.activePageIndex,
      activePages: frame.viewport.activePages,
      desktopFrame: { ...stageRect, top: 64, height: Math.max(1, viewport.height - 136) },
      desktopGridDebugOptions: null,
      desktopTrackMotionKey: frame.viewport.desktopTrackMotionKey,
      desktopVisualAlpha: folderOpen ? 0 : frame.visual.desktopVisualAlpha,
      desktopVisualTransform: folderOpen ? FOLDER_OPEN_DESKTOP_TRANSFORM : frame.visual.desktopVisualTransform,
      deviceResolution: viewport.resolution,
      dragFolderHoverState: frame.interaction.dragFolderHoverState,
      dragFolderTargetId: frame.interaction.dragFolderTargetId,
      dragHitDebugOptions: null,
      dragHitDebugState: null,
      dragMeta: frame.interaction.dragMeta,
      focusedIcon: frame.interaction.focusedIcon,
      folderClosingHandoffIds: folderId && folderState?.isFolderClosing
        ? new Set([folderId])
        : new Set<string>(),
      folderPageSize: frame.viewport.folderPageSize,
      folderSourceGhostedIds,
      getDesktopPageRenderMode: (pageIndex) => {
        if (pageIndex === frame.viewport.activePageIndex) return "interactive";
        const presentedPage = -this.#layer.pageTrack.x / viewport.width;
        return Math.abs(pageIndex - frame.viewport.activePageIndex) === 1
          || (pageIndex >= Math.floor(presentedPage) && pageIndex <= Math.ceil(presentedPage))
          ? "static-real" : "empty";
      },
      getVisibleDesktopPage: visibleItems,
      gridCols: frame.viewport.gridCols,
      gridRows: frame.viewport.gridRows,
      groupDragState: frame.interaction.groupDragState,
      height: viewport.height,
      iconGesturePresentation: frame.interaction.iconGesturePresentation,
      iconSize: frame.viewport.iconSize,
      isBatchSelectionActive: frame.interaction.isBatchSelectionActive,
      isEditMode: frame.interaction.isEditMode,
      isFolderOpeningPreviewFrameGhosted: () => false,
      isHomeRevealSettling: false,
      isIconOpening: () => false,
      isSearchMode: frame.interaction.isSearchMode,
      isTextlessMode: frame.interaction.isTextlessMode,
      launchTargetStatusById: frame.diagnostics.launchTargetStatusById,
      launchpadVisualAlpha: frame.visual.launchpadVisualAlpha,
      launchpadVisualTransform: frame.visual.launchpadVisualTransform,
      pageTrackScrub: options.pageTrackScrub ?? null,
      provisionalFolderRollback: frame.interaction.provisionalFolderRollback,
      selectedAppIds: frame.interaction.selectedAppIds,
      setPageRef: (element, pageIndex) => {
        if (element == null) this.#pageRefs.delete(pageIndex);
        else this.#pageRefs.set(pageIndex, element);
      },
      shouldSnapTrack: options.snapDesktopLayout !== false,
      showMissingLaunchTargetBadge: frame.diagnostics.showMissingLaunchTargetBadge,
      singleStageDiagnosticsEnabled: null,
      singleStageFolderState: folderState,
      snapDesktopLayout: options.snapDesktopLayout !== false,
      stageRect,
      width: viewport.width,
    });
    const work = applyDesktopLayerFrameUpdates(this.#layer, Object.freeze([
      Object.freeze({ frame: structureFrame, lane: "structure" as const }),
    ]));

    for (const [pageIndex, page] of frame.viewport.activePages.entries()) {
      for (const item of page) {
        if (!item) continue;
        const node = this.#layer.findIconNodeByItemId(item.id);
        if (!node) continue;
        node.label = `launchpad-item:${item.id}`;
        if (pageIndex !== frame.viewport.activePageIndex || this.#activationNodes.has(node)) continue;
        this.#activationNodes.add(node);
        node.on("pointertap", event => {
          if (event.pointerType === "touch" || event.pointerType === "mouse") return;
          const current = node.item;
          if (current) this.#onIconActivate?.(current);
        });
      }
    }
    if (folderState && !folderState.isFolderClosing) {
      for (const node of this.#layer.singleStageFolderLayer.iconNodes.values()) {
        const item = node.item;
        if (!item) continue;
        node.label = `launchpad-item:${item.id}`;
        const sourcePageIndex = Number(node.source?.pageIndex);
        if (sourcePageIndex !== folderState.folderPageIndex || this.#activationNodes.has(node)) continue;
        this.#activationNodes.add(node);
        node.on("pointertap", event => {
          if (event.pointerType === "touch" || event.pointerType === "mouse") return;
          const current = node.item;
          if (current) this.#onIconActivate?.(current);
        });
      }
    }
    syncPixiTextResolution(this.#layer, viewport.resolution);
    return work;
  }

  connectAnimationHost(host: NativeSceneAnimationHost): () => void {
    if (this.#destroyed) throw new Error("NativeDesktopScene has been destroyed");
    let stopFrames: (() => void) | null = null;
    let disconnected = false;
    const ensureFrames = (): void => {
      if (disconnected || stopFrames !== null || !motionRuntime.hasActiveWork()) return;
      stopFrames = host.animate((deltaMs) => {
        motionRuntime.step(deltaMs / 1000);
        if (motionRuntime.hasActiveWork()) return;
        const stop = stopFrames;
        stopFrames = null;
        stop?.();
      });
    };

    motionRuntime.suspendAutoTicker();
    const stopSignals = motionRuntime.onRenderSignal(() => {
      ensureFrames();
      host.invalidate();
    });
    ensureFrames();
    return () => {
      if (disconnected) return;
      disconnected = true;
      stopSignals();
      stopFrames?.();
      stopFrames = null;
      motionRuntime.resumeAutoTicker();
    };
  }

  commitPresentedFrame(): string | null {
    if (this.#destroyed) return null;
    return this.#layer.singleStageFolderLayer.commitFolderVisualPresentation().closingFolderId;
  }

  getPageRefs(): unknown[] { return Array.from({ length: this.#pageRefs.size }, (_, index) => this.#pageRefs.get(index)); }
  getFolderPageRefs(): unknown[] { return Array.from({ length: this.#folderPageRefs.size }, (_, index) => this.#folderPageRefs.get(index)); }
  getFolderPanelRect() { return this.#layer.singleStageFolderLayer.panelGeometry; }
  getDesktopAlpha():number { return this.#layer.visualRoot.alpha; }

  getMotionSnapshot(): Readonly<{
    desktopPageTrackTargetX: number;
    desktopPageTrackX: number;
    folderPageTrackTargetX: number | null;
    folderPageTrackX: number | null;
  }> {
    const folderPageTrackX = this.#layer.singleStageFolderLayer.pageTrack?.x;
    const folderPageTrackTargetX = this.#layer.singleStageFolderLayer.pageTrackMotion?.targetX;
    return Object.freeze({
      desktopPageTrackTargetX: Number(this.#layer.lastDesktopRenderPlan?.targetX ?? this.#layer.pageTrack.x),
      desktopPageTrackX: this.#layer.pageTrack.x,
      folderPageTrackTargetX: typeof folderPageTrackTargetX === "number" && Number.isFinite(folderPageTrackTargetX)
        ? folderPageTrackTargetX
        : null,
      folderPageTrackX: typeof folderPageTrackX === "number" && Number.isFinite(folderPageTrackX)
        ? folderPageTrackX
        : null,
    });
  }

  getPageWidth(scope: string, pageIndex: number, fallback = 1): number {
    const element = scope.startsWith("folder:")
      ? this.#folderPageRefs.get(pageIndex)
      : this.#pageRefs.get(pageIndex);
    const width = Number((element as {
      getBoundingClientRect?: () => Readonly<{ width?: unknown }>;
    } | undefined)?.getBoundingClientRect?.().width);
    return Number.isFinite(width) && width > 0 ? width : Math.max(1, fallback);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#folderPageRefs.clear();
    this.#pageRefs.clear();
    this.#layer.removeFromParent();
    this.#pageDots.removeFromParent();
    this.#pageDots.destroy();
    this.#layer.destroy({ children: true });
  }
}
