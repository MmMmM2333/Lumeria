import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadApps } from "../../application/launchpadApps.js";
import type { createLaunchpadLaunchFlow } from "../../application/launchpadLaunchFlow.js";
import { DESKTOP_CLOSE_SCALE } from "../../domain/launchpadConstants.js";
import type { ReadonlyLaunchpadPages } from "../../domain/launchpadLayout.js";
import { snapshotContractValue } from "../../rendering/contractSnapshot.js";
import { collectDesktopPreparationItems } from "../../rendering/native/nativeDesktopPreparation.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { createNativeIconTextureRepository } from "../../rendering/native/nativeIconTextureLoader.js";
import type { NativeLaunchGhost } from "../../rendering/native/NativeLaunchGhost.js";
import { createNativeRecordSnapshot } from "../../rendering/native/nativeSceneSnapshot.js";
import type { createNativeEditing } from "../nativeEditing.js";
import type { createNativeSceneScheduler } from "../nativeSceneScheduler.js";
import { makeNativeStartupFrame } from "../nativeStartup.js";
import type { NativeFolderFlow,NativePageTrackScrub } from "./nativeInputRouter.js";
import { collectTextureItems } from "./nativeTextureItems.js";

type PresentationFrame = ReturnType<typeof makeNativeStartupFrame>;
type NativeEditing = ReturnType<typeof createNativeEditing>;
type GroupState = NonNullable<NativeEditing["drag"]["groupDragState"]["value"]>;

type IconTextureRepository = ReturnType<typeof createNativeIconTextureRepository>;
type TextPrewarm = Readonly<{ setCandidates(candidates: readonly unknown[]): void }>;
type LaunchFlow = ReturnType<typeof createLaunchpadLaunchFlow>;
type NativeAppsPresentation = ReturnType<typeof createLaunchpadApps>;

// Owns the presentation caches and the scene-commit callback: projected page
// snapshots, retained layout/page identity, interaction and diagnostics snapshot
// reuse, icon residency retention, and the synchronous commitScene path. The
// frame itself stays owned by the entry assembly and is replaced through
// `applyFrame`, so there is exactly one owner and no copy of the frame state.
export type NativeSceneControllerPorts = Readonly<{
  afterCommit: (snapDesktopLayout: boolean) => void;
  app: NativePixiApplication;
  applyFrame: (frame: PresentationFrame, refreshActiveItems: boolean) => void;
  chromeInset: () => number;
  folderFlow: NativeFolderFlow;
  getActiveEditing: () => NativeEditing | null;
  getApps: () => NativeAppsPresentation | null;
  getFrame: () => PresentationFrame;
  getIconSize: () => number;
  getLayoutPages: () => ReadonlyLaunchpadPages;
  getLaunchFlow: () => LaunchFlow | null;
  getPageTrackScrub: () => NativePageTrackScrub;
  getSearchQuery: () => string;
  iconTextures: IconTextureRepository;
  launchGhostView: NativeLaunchGhost;
  markSceneCommitted: () => void;
  measureSceneCommit: <T>(name: string, run: () => T) => T;
  scene: NativeDesktopScene;
  sceneUpdates: ReturnType<typeof createNativeSceneScheduler>;
  textPrewarm: TextPrewarm;
}>;

export type NativeSceneController = Readonly<{
  commitScene: (
    viewport: Readonly<{ height: number; resolution: number; width: number }>,
    snapDesktopLayout: boolean,
  ) => ReturnType<NativeDesktopScene["commit"]>;
  readWork: () => ReturnType<NativeDesktopScene["commit"]>;
  adoptWork: (work: ReturnType<NativeDesktopScene["commit"]>) => void;
  resolveProjectedPages: (pages: ReturnType<NativeEditing["projectedPages"]>) => PresentationFrame["viewport"]["activePages"];
}>;

export function createNativeSceneController(ports: NativeSceneControllerPorts): NativeSceneController {
  const frameAt = () => ports.getFrame();
  let projectedPagesSource: ReturnType<NativeEditing["projectedPages"]> | null = null;
  let projectedPagesSnapshot = frameAt().viewport.activePages;
  let retainedPages: typeof projectedPagesSnapshot | null = null;
  let retainedLayout: ReadonlyLaunchpadPages | null = null;
  const captureInteraction = createNativeRecordSnapshot<Record<string, unknown>>();
  let captureGroup:((input:GroupState)=>GroupState)|null=null;
  const captureDiagnostics = createNativeRecordSnapshot<PresentationFrame["diagnostics"]>();

  const commitScene = (
    viewport: Readonly<{ height: number; resolution: number; width: number }>,
    snapDesktopLayout: boolean,
  ) => {
    const launchFlow = ports.getLaunchFlow();
    const scrub = ports.getPageTrackScrub();
    const commit = () => ports.scene.commit(frameAt(), viewport, {
      openingIconId: launchFlow?.launchGhost.value?.app.id ?? null,
      chromeInset: ports.chromeInset(),
      folderPageTrackScrub: scrub.folder,
      folderPresentation: ports.folderFlow.snapshot(),
      pageTrackScrub: scrub.desktop,
      snapDesktopLayout,
    });
    const work = ports.measureSceneCommit("sceneCommit", commit);
    ports.markSceneCommitted();
    if (work.fullPlanBuilds) ports.textPrewarm.setCandidates(ports.scene.getTextPrewarmCandidates());
    return work;
  };
  let work = commitScene({
    height: ports.app.contentSize.height,
    resolution: ports.app.resolution,
    width: ports.app.contentSize.width,
  }, true);

  // Disconnection is owned by the scene scheduler, which the entry assembly
  // disposes during teardown.
  ports.sceneUpdates.connect((snapDesktopLayout = false) => {
    const launchFlow = ports.getLaunchFlow();
    if (launchFlow) {
      const closed = !launchFlow.isDesktopOpen.value;
      const currentFrame = frameAt();
      ports.applyFrame(Object.freeze({ ...currentFrame,
        interaction: Object.freeze({ ...currentFrame.interaction, isDesktopClosing: closed }),
        visual: Object.freeze({ ...currentFrame.visual, desktopVisualAlpha: closed ? 0 : 1,
          desktopVisualTransform: Object.freeze({ scale: closed ? DESKTOP_CLOSE_SCALE : 1, y: 0 }),
          launchpadVisualAlpha: closed ? 0 : 1, launchpadVisualTransform: Object.freeze({ scale: closed ? DESKTOP_CLOSE_SCALE : 1, y: 0 }),
          appLaunchCloseSessionId: launchFlow.appLaunchCloseSessionId.value }) }), false);
      const ghost = launchFlow.launchGhost.value;
      ports.launchGhostView.update(
        ghost,
        ghost ? ports.app.stage.getChildByLabel(`launchpad-item:${ghost.app.id}`, true) : null,
        ports.getIconSize(),
        ports.app.resolution,
      );
    }
    const editing = ports.getActiveEditing();
    if (editing) {
      const currentFrame = frameAt();
      const interaction = captureInteraction({ ...currentFrame.interaction,
        dragMeta: editing.drag.dragMeta.value, groupDragState: null,
        dragFolderHoverState: editing.drag.dragFolderHoverState.value, dragFolderTargetId: editing.drag.dragFolderTargetId.value,
        isEditMode: editing.mode.value, isBatchSelectionActive: editing.selection.isActive.value,
        selectedAppIds: editing.selection.selectedIds.value,
        provisionalFolderRollback: editing.rollback.presentation.value,
      }) as typeof currentFrame.interaction;
      const source = editing.projectedPages();
      if (!ports.getSearchQuery().trim() && source !== projectedPagesSource) {
        projectedPagesSource = source;
        projectedPagesSnapshot = snapshotContractValue(source) as typeof currentFrame.viewport.activePages;
      }
      const pages = ports.getSearchQuery().trim() ? currentFrame.viewport.activePages : projectedPagesSnapshot;
      const apps = ports.getApps();
      // Group publications replace pointer/trail every frame. Preserve their
      // unchanged entries and projected layout instead of cloning the entire
      // application collection through the parent interaction record again.
      const group=editing.drag.groupDragState.value;
      if(!group)captureGroup=null;
      const groupSnapshot=(group?(captureGroup??=createNativeRecordSnapshot<GroupState>())(group):null) as unknown as typeof currentFrame.interaction.groupDragState;
      ports.applyFrame(Object.freeze({ ...currentFrame, interaction:Object.freeze({...interaction,groupDragState:groupSnapshot}),
        diagnostics: captureDiagnostics({ ...currentFrame.diagnostics,
          showMissingLaunchTargetBadge: apps?.presentation.showMissingLaunchTargetBadge.value ?? currentFrame.diagnostics.showMissingLaunchTargetBadge,
          launchTargetStatusById: apps?.presentation.launchTargetStatusById.value ?? currentFrame.diagnostics.launchTargetStatusById }),
        viewport: Object.freeze({ ...currentFrame.viewport, activePages: pages }) }), true);
    }
    const currentFrame = frameAt();
    const layoutPages = ports.getLayoutPages();
    if (retainedLayout !== layoutPages || retainedPages !== currentFrame.viewport.activePages) {
      if (retainedLayout !== layoutPages) ports.scene.clearSearchNodeCache();
      ports.iconTextures.retainLayout(
        collectTextureItems(currentFrame, layoutPages),
        collectDesktopPreparationItems(currentFrame.viewport.activePages, currentFrame.viewport.folderPageSize),
      );
      retainedPages = currentFrame.viewport.activePages; retainedLayout = layoutPages;
    }
    work = commitScene({
      height: ports.app.contentSize.height,
      resolution: ports.app.resolution,
      width: ports.app.contentSize.width,
    }, snapDesktopLayout);
    ports.afterCommit(snapDesktopLayout);
  });

  return Object.freeze({
    commitScene,
    adoptWork: next => { work = next; },
    readWork: () => work,
    // Reuse the retained projection snapshot for the edit path exactly like the
    // previous inline callback did, without exposing the cache itself.
    resolveProjectedPages: pages => (pages === projectedPagesSource
      ? projectedPagesSnapshot
      : snapshotContractValue(pages)) as PresentationFrame["viewport"]["activePages"],
  });
}
