import { Container } from "pixi.js";
import {
  assertCompleteDesktopSceneFrame,
  type CompleteDesktopSceneFrame,
  type SceneItem,
} from "../sceneFrame.js";
import { createIconBoundsRegistry } from "../pixi/geometry/iconBoundsRegistry.js";
import { motionRuntime } from "../pixi/animation/motionRuntime.js";
import { DesktopLayer } from "../pixi/scene/DesktopLayer.js";
import type { IconTextureRepository } from "../pixi/assets/iconTextureRepository.js";
import { syncPixiTextResolution } from "../pixi/pixiText.js";
import {
  applyDesktopLayerFrameUpdates,
  makeDesktopStructureFrame,
  type DesktopLayerFrameWork,
} from "../pixi/scene/desktopLayerFrames.js";

export type NativeSceneViewport = Readonly<{
  height: number;
  resolution: number;
  width: number;
}>;

export type NativeSceneAnimationHost = Readonly<{
  animate(update: (deltaMs: number) => void): () => void;
  invalidate(): void;
}>;

function assertStaticFrame(frame: CompleteDesktopSceneFrame): void {
  const unsupported = [
    [frame.viewport.pageTrackScrub !== null, "viewport.pageTrackScrub"],
    [frame.visual.appLaunchCloseSessionId !== null, "visual.appLaunchCloseSessionId"],
    [frame.interaction.dragFolderHoverState !== null, "interaction.dragFolderHoverState"],
    [frame.interaction.dragFolderTargetId !== null, "interaction.dragFolderTargetId"],
    [frame.interaction.dragMeta !== null, "interaction.dragMeta"],
    [frame.interaction.groupDragState !== null, "interaction.groupDragState"],
    [frame.interaction.iconGesturePresentation !== null, "interaction.iconGesturePresentation"],
    [frame.interaction.isDesktopClosing, "interaction.isDesktopClosing"],
    [frame.interaction.isEditMode, "interaction.isEditMode"],
    [frame.interaction.isHomeRevealSettling, "interaction.isHomeRevealSettling"],
    [frame.interaction.provisionalFolderRollback !== null, "interaction.provisionalFolderRollback"],
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

export class NativeDesktopScene {
  readonly #activationNodes = new WeakSet<Container>();
  readonly #layer: DesktopLayer;
  readonly #onIconActivate: ((item: SceneItem) => void) | null;
  readonly #pageRefs = new Map<number, unknown>();
  #destroyed = false;

  constructor(stage: Container, options: Readonly<{
    iconTextures?: IconTextureRepository | undefined;
    onIconActivate?: ((item: SceneItem) => void) | undefined;
  }> = {}) {
    if (stage.destroyed) throw new Error("NativeDesktopScene requires a live Pixi stage");
    this.#layer = new DesktopLayer({
      iconBoundsRegistry: createIconBoundsRegistry(),
      iconTextures: options.iconTextures,
      onIconAction: (action) => {
        if (action !== "pointerdown") {
          throw new Error(`NativeDesktopScene received an unexpected icon action: ${action}`);
        }
      },
    });
    this.#onIconActivate = options.onIconActivate ?? null;
    this.#layer.label = "launchpad-native-desktop";
    stage.addChild(this.#layer);
  }

  commit(frame: CompleteDesktopSceneFrame, viewport: NativeSceneViewport): DesktopLayerFrameWork {
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
    const structureFrame = makeDesktopStructureFrame({
      activePageIndex: frame.viewport.activePageIndex,
      activePages: frame.viewport.activePages,
      desktopFrame: stageRect,
      desktopGridDebugOptions: null,
      desktopTrackMotionKey: frame.viewport.desktopTrackMotionKey,
      desktopVisualAlpha: frame.visual.desktopVisualAlpha,
      desktopVisualTransform: frame.visual.desktopVisualTransform,
      deviceResolution: viewport.resolution,
      dragFolderHoverState: null,
      dragFolderTargetId: null,
      dragHitDebugOptions: null,
      dragHitDebugState: null,
      dragMeta: null,
      focusedIcon: frame.interaction.focusedIcon,
      folderClosingHandoffIds: new Set<string>(),
      folderPageSize: frame.viewport.folderPageSize,
      folderSourceGhostedIds: frame.folder.folderSourceGhostedIds,
      getDesktopPageRenderMode: (pageIndex) => (
        pageIndex === frame.viewport.activePageIndex ? "interactive" : "empty"
      ),
      getVisibleDesktopPage: visibleItems,
      gridCols: frame.viewport.gridCols,
      gridRows: frame.viewport.gridRows,
      groupDragState: null,
      height: viewport.height,
      iconGesturePresentation: null,
      iconSize: frame.viewport.iconSize,
      isBatchSelectionActive: frame.interaction.isBatchSelectionActive,
      isEditMode: false,
      isFolderOpeningPreviewFrameGhosted: () => false,
      isHomeRevealSettling: false,
      isIconOpening: () => false,
      isSearchMode: frame.interaction.isSearchMode,
      isTextlessMode: frame.interaction.isTextlessMode,
      launchTargetStatusById: frame.diagnostics.launchTargetStatusById,
      launchpadVisualAlpha: frame.visual.launchpadVisualAlpha,
      launchpadVisualTransform: frame.visual.launchpadVisualTransform,
      pageTrackScrub: null,
      provisionalFolderRollback: null,
      selectedAppIds: frame.interaction.selectedAppIds,
      setPageRef: (element, pageIndex) => {
        if (element == null) this.#pageRefs.delete(pageIndex);
        else this.#pageRefs.set(pageIndex, element);
      },
      shouldSnapTrack: true,
      showMissingLaunchTargetBadge: frame.diagnostics.showMissingLaunchTargetBadge,
      singleStageDiagnosticsEnabled: null,
      singleStageFolderState: null,
      snapDesktopLayout: true,
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
        node.on("pointertap", () => {
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

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#pageRefs.clear();
    this.#layer.removeFromParent();
    this.#layer.destroy({ children: true });
  }
}
