import { Container, type Text } from "pixi.js";
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
import { IconNode } from "../pixi/nodes/IconNode.js";
import { makeSyntheticPointerEvent } from "../pixi/scene/iconSceneHelpers.js";
import type { IconTextureRepository } from "../pixi/assets/iconTextureRepository.js";
import { syncPixiTextResolution } from "../pixi/pixiText.js";
import { createFolderLayerState, type FolderOverlayFrame } from "../pixi/folderLayerState.js";
import { getFolderLayoutMetricsForRows } from "../folderLayoutMetrics.js";
import {
  applyDesktopLayerFrameUpdates,
  makeDesktopStructureFrame,
  makeDesktopInteractionFrame,
  makeDesktopVisualFrame,
  type DesktopStructureFrame,
  type DesktopLayerFrameWork,
} from "../pixi/scene/desktopLayerFrames.js";
import type { NativeFolderPresentation } from "./nativeFolderFlow.js";

export type NativeSceneViewport = Readonly<{
  height: number;
  resolution: number;
  width: number;
}>;

export type NativeSceneAnimationHost = Readonly<{
  /** Apply pending state before rendering; motion alone must not rebuild state. */
  commit(): void;
  animate(update: (deltaMs: number) => void): () => void;
  invalidate(): void;
}>;

export type NativeSceneCommitOptions = Readonly<{
  openingIconId?:string|null;
  chromeInset?: number;
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
  onFolderTitleFrameChange?: ((frame: unknown) => void) | undefined;
  onFolderCloseRequest?: (() => void) | undefined;
  onFolderReopenRequest?: ((folderId: string | null) => void) | undefined;
  onFolderInternalActivityChange?: ((active: boolean, folderId: string | null) => void) | undefined;
  onFolderPageIndexCommit?: ((pageIndex: number) => void) | undefined;
  onFolderRenderRequest?: ((reason:string) => void) | undefined;
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
  chromeInset: number,
  openingIconId:string|null,
): FolderOverlayFrame | null {
  if (!presentation) return null;
  const sourceFolder = presentation.renderedFolder;
  const folder = sourceFolder && !presentation.isClosing
    ? (desktopFrame.viewport.activePages.flat().find(item => item?.id === sourceFolder.id && item.type === "folder") as typeof sourceFolder | undefined) ?? sourceFolder
    : sourceFolder;
  if (!folder) return null;
  const pages = presentation.folderPageIndex === folder.childPages.length
    ? [...folder.childPages, []] : folder.childPages;
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
      isIconOpening: (_area,itemId) => itemId===openingIconId,
      setFolderPageRef,
    },
    drag: { groupDragState: desktopFrame.interaction.groupDragState, meta: desktopFrame.interaction.dragMeta },
    folder: {
      closeIconGhosts: null,
      desktopClosing: desktopFrame.interaction.isDesktopClosing,
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
      desktopFrame: { ...stageRect, top: 64+chromeInset, height: Math.max(1, viewport.height - 136-chromeInset) },
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
      iconBadgesById: desktopFrame.diagnostics.iconBadgesById,
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
  #committed: {frame:CompleteDesktopSceneFrame;viewport:NativeSceneViewport;options:NativeSceneCommitOptions}|null=null;
  #pageRange="";
  #dependencies:readonly unknown[]|null=null;
  #desktopDependencies:readonly unknown[]|null=null;
  #visualValues:readonly unknown[]=[];
  #structureInvalidated=false;
  #interactionInvalidated=false;
  #textResolution:number|null=null;
  readonly #textNodes=new WeakMap<IconNode,number>();
  #updates={structure:0,visual:0,motion:0};
  #structureFrame:DesktopStructureFrame|null=null;
  invalidateStructure():void {this.#structureInvalidated=true;}
  requestLayerUpdate(reason:string):void {
    // Ownership/actor notifications do not change grid geometry. Other folder
    // lifecycle requests still require the full handoff reconciliation path.
    if(reason==="group-release-pool-prewarm"||reason.startsWith("group-transfer-")
      ||(reason==="visual-ownership-committed"&&!this.#committed?.options.folderPresentation?.renderedFolder&&!this.#layer.getFolderHandoffNodes().size)){
      this.#interactionInvalidated=true;
    }else this.invalidateStructure();
  }
  getUpdateStatistics():Readonly<{structure:number;visual:number;motion:number}>{return {...this.#updates};}

  #visiblePageRange(frame:CompleteDesktopSceneFrame,width:number):string {
    if(this.#retainsPages(frame))return "retained";
    const presented=-this.#layer.pageTrack.x/width;
    const target=frame.viewport.activePageIndex;
    // Include the moving source, including interrupted multi-page jumps.
    let result="";
    for(let index=0;index<frame.viewport.activePages.length;index++){
      if(Math.abs(index-target)<=1||this.#isTravelPage(index,presented,target))result+=`${index},`;
    }
    return result;
  }

  #retainedSource:CompleteDesktopSceneFrame["viewport"]["activePages"]|null=null;
  #retainedEligible=false;
  #retainsPages(frame:CompleteDesktopSceneFrame):boolean {
    // Search projections change on each query. Realize visible neighbours only;
    // the separate desktop cache keeps the original layout ready for return.
    if(frame.interaction.isSearchMode)return false;
    const pages=frame.viewport.activePages;
    if(pages!==this.#retainedSource){
      this.#retainedSource=pages;
      // Bound desktop shells separately from thumbnail resources. Expanded folder
      // contents remain owned by the folder layer and do not count as desktop nodes.
      this.#retainedEligible=pages.length>=4&&pages.reduce((n,page)=>n+page.length,0)<=800
        &&pages.reduce((n,page)=>n+page.reduce((count,item)=>{
          const first=item?.type==="folder"&&Array.isArray(item.childPages)?item.childPages[0]:null;
          return count+(item?1:0)+(Array.isArray(first)?Math.min(9,first.filter(Boolean).length):0);
        },0),0)<=1600;
    }
    return this.#retainedEligible;
  }

  #isTravelPage(index:number,presented:number,target:number):boolean {
    if(Math.abs(target-presented)<=2)return Math.abs(index-presented)<=1.25;
    // Overlapping four-page bands avoid rebuilding the entire plan at each edge.
    const start=Math.floor(presented/4)*4;
    return index>=start-1&&index<=start+5;
  }

  /** Reconcile only page-realization boundary changes, not every motion sample. */
  presentMotion():void {
    const committed=this.#committed;
    if(!committed||this.#destroyed)return;
    this.#updates.motion++;
    if(this.#retainsPages(committed.frame))this.#layer.cullRetainedPages(committed.viewport.width);
    if(this.#visiblePageRange(committed.frame,committed.viewport.width)!==this.#pageRange){
      this.commit(committed.frame,committed.viewport,{...committed.options,snapDesktopLayout:false});
    }
    this.#layer.flushInteractiveBounds();
    if(committed.options.folderPresentation?.isClosing&&this.#structureFrame){
      // Closing targets track the restoring desktop transform, even without a
      // structural change. Reconcile the overlay geometry, not desktop nodes.
      this.#layer.updateSingleStageFolderLayer(this.#structureFrame);
    }
    if(committed.options.folderPresentation?.renderedFolder||this.#layer.getFolderHandoffNodes().size)this.#layer.commitFolderSourceGhosting();
  }

  presentFolderProgress(progress:number):void {
    if(this.#destroyed)return;
    this.#layer.singleStageFolderLayer.presentOpenProgress(progress);
    const saved=this.#committed;
    if(saved?.options.folderPresentation){saved.options={...saved.options,folderPresentation:{...saved.options.folderPresentation,openProgress:progress}};}
  }

  constructor(stage: Container, options: NativeDesktopSceneOptions = {}) {
    if (stage.destroyed) throw new Error("NativeDesktopScene requires a live Pixi stage");
    this.#folderLayout = options.folderLayout ?? Object.freeze({
      cols: DEFAULT_FOLDER_COLS, iconSize: DEFAULT_ICON_SIZE, rows: DEFAULT_FOLDER_ROWS,
    });
    this.#onFolderPageIndexCommit = options.onFolderPageIndexCommit ?? (() => {});
    this.#layer = new DesktopLayer({
      reuseSearchNodes:true,
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
      showFolderTitle: false,
      onFolderTitleFrameChange: options.onFolderTitleFrameChange,
    });
    this.#onIconActivate = options.onIconActivate ?? null;
    this.#layer.label = "launchpad-native-desktop";
    stage.addChild(this.#layer);
    this.#pageDots = new NativePageDots(index => options.onDesktopPageIndexCommit?.(index));
    stage.addChild(this.#pageDots);
  }

  isFolderOverlayVisible():boolean {return this.#layer.singleStageFolderLayer.visible;}
  getNodeRetentionStatistics(){return this.#layer.getNodeRetentionStatistics();}
  getIconArtworkCenter(id:string):{x:number;y:number}|null {
    const node=this.#layer.getChildByLabel(`launchpad-item:${id}`,true) as import("../pixi/nodes/IconNode.js").IconNode|null;
    if(!node)return null;
    return node.visualWrap.toGlobal({x:0,y:0});
  }
  clearSearchNodeCache():void {this.#layer.clearSearchNodeCache();}
  closingFolderAtPoint(x:number,y:number):string|null {return this.#layer.singleStageFolderLayer.closingFolderAtStagePoint(x,y);}

  getTextPrewarmCandidates():readonly {text:Text;page:number}[]{
    if(!this.#committed||!this.#retainsPages(this.#committed.frame))return [];
    return [...this.#layer.iconNodes.values()].filter(node=>node.labelText.visible&&Boolean(node.labelText.text))
      .map(node=>({text:node.labelText,page:Number(node.source?.pageIndex)||0}));
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
    const folder=options.folderPresentation;
    // Open/close is a presentation change. It does not alter desktop node state,
    // grid layout or hit bounds; native input gating is owned by the launch flow.
    // Group presentation (pointer/trail and release motion) owns an interaction
    // lane. Layout projections, hover targets and ownership source changes are
    // still structural dependencies, just as in PixiDesktopSurface.
    const localSelection=!folder?.renderedFolder&&!this.#layer.getFolderHandoffNodes().size
      &&!frame.interaction.dragMeta&&!frame.interaction.groupDragState&&!frame.interaction.provisionalFolderRollback;
    const interactionStructure:unknown[]=Object.entries(frame.interaction).filter(([key])=>key!=="isDesktopClosing"&&key!=="groupDragState"
      &&!(localSelection&&["selectedAppIds","focusedIcon","isBatchSelectionActive"].includes(key))).flat();
    interactionStructure.push(frame.interaction.groupDragState?.key,frame.interaction.groupDragState?.phase,
      frame.interaction.groupDragState?.runtimePlan?.key);
    const dependencies=[...Object.values(frame.viewport),...interactionStructure,frame.folder,frame.diagnostics,
      viewport.width,viewport.height,viewport.resolution,options.chromeInset,options.openingIconId,
      this.#folderLayout.cols,this.#folderLayout.rows,this.#folderLayout.iconSize,
      folder?.renderedFolder,folder?.folderPageIndex,folder?.isClosing,folder?.openProgressTarget,folder?.openingCancelRequest,
      options.folderPageTrackScrub];
    const desktopDependencies=[...Object.values(frame.viewport),...Object.entries(frame.interaction)
      .filter(([key])=>key!=="isDesktopClosing"&&key!=="groupDragState").flat(),
      frame.interaction.groupDragState?.key,frame.interaction.groupDragState?.phase,frame.interaction.groupDragState?.runtimePlan?.key,
      frame.folder,frame.diagnostics,
      viewport.width,viewport.height,viewport.resolution,options.chromeInset,options.openingIconId,
      this.#folderLayout.cols,this.#folderLayout.rows,this.#folderLayout.iconSize];
    const folderOnly=this.#committed&&this.#retainsPages(frame)&&options.snapDesktopLayout===false
      &&!frame.interaction.dragMeta&&!frame.interaction.groupDragState&&!frame.interaction.provisionalFolderRollback
      &&(folder?.renderedFolder||this.#committed.options.folderPresentation?.renderedFolder||this.#layer.getFolderHandoffNodes().size)
      &&this.#desktopDependencies?.length===desktopDependencies.length
      &&desktopDependencies.every((value,index)=>Object.is(value,this.#desktopDependencies![index]));
    const range=this.#visiblePageRange(frame,viewport.width);
    const folderOpen=Boolean(folder?.renderedFolder&&!folder.isClosing);
    const visualValues=[frame.visual.desktopVisualAlpha,frame.visual.desktopVisualTransform.scale,frame.visual.desktopVisualTransform.y,
      frame.visual.launchpadVisualAlpha,frame.visual.launchpadVisualTransform.scale,frame.visual.launchpadVisualTransform.y,folderOpen];
    const previous=this.#committed;
    const pageOnly=previous&&frame.viewport.activePageIndex!==previous.frame.viewport.activePageIndex
      &&this.#retainsPages(frame)&&!this.#structureInvalidated&&options.snapDesktopLayout===false
      &&!folderOpen&&!frame.interaction.isEditMode&&!frame.interaction.isBatchSelectionActive&&!frame.interaction.dragMeta&&!frame.interaction.groupDragState
      &&Object.entries(frame.viewport).every(([key,value])=>["activePageIndex","desktopProjectionEpoch","desktopTrackMotionKey"].includes(key)||Object.is(value,previous.frame.viewport[key as keyof typeof frame.viewport]))
      &&Object.entries(frame.interaction).every(([key,value])=>key==="focusedIcon"||Object.is(value,previous.frame.interaction[key as keyof typeof frame.interaction]))
      &&frame.folder===previous.frame.folder&&frame.diagnostics===previous.frame.diagnostics
      &&viewport.width===previous.viewport.width&&viewport.height===previous.viewport.height&&viewport.resolution===previous.viewport.resolution
      &&!previous.options.folderPresentation?.renderedFolder&&!options.folderPresentation?.renderedFolder
      &&options.chromeInset===previous.options.chromeInset&&options.openingIconId===previous.options.openingIconId
      &&options.folderPageTrackScrub===previous.options.folderPageTrackScrub
      &&visualValues.every((value,index)=>Object.is(value,this.#visualValues[index]));
    if(pageOnly&&this.#structureFrame){
      this.#structureFrame={...this.#structureFrame,activePageIndex:frame.viewport.activePageIndex,
        desktopTrackMotionKey:frame.viewport.desktopTrackMotionKey,focusedIcon:frame.interaction.focusedIcon,pageTrackScrub:options.pageTrackScrub??null};
      this.#layer.updateRetainedPage(this.#structureFrame);
      this.#layer.cullRetainedPages(viewport.width);
      this.#pageDots.update(frame,viewport.width,viewport.height,false);
      this.#dependencies=dependencies;this.#desktopDependencies=desktopDependencies;this.#visualValues=visualValues;this.#committed={frame,viewport,options};
      return applyDesktopLayerFrameUpdates(this.#layer,[]);
    }
    if(options.snapDesktopLayout===false&&!this.#structureInvalidated&&this.#dependencies
      &&dependencies.length===this.#dependencies.length&&dependencies.every((value,index)=>Object.is(value,this.#dependencies![index]))
      &&range===this.#pageRange){
      let visualWork:DesktopLayerFrameWork|null=null;
      let interactionWork:DesktopLayerFrameWork|null=null;
      if(localSelection&&this.#structureFrame&&(frame.interaction.selectedAppIds!==previous?.frame.interaction.selectedAppIds
        ||frame.interaction.focusedIcon!==previous?.frame.interaction.focusedIcon
        ||frame.interaction.isBatchSelectionActive!==previous?.frame.interaction.isBatchSelectionActive)){
        this.#structureFrame={...this.#structureFrame,selectedAppIds:frame.interaction.selectedAppIds,
          focusedIcon:frame.interaction.focusedIcon,isBatchSelectionActive:frame.interaction.isBatchSelectionActive};
        this.#layer.updateSelectionPresentation(this.#structureFrame);
      }
      if(this.#structureFrame&&(this.#interactionInvalidated||frame.interaction.groupDragState!==this.#committed?.frame.interaction.groupDragState)){
        this.#interactionInvalidated=false;
        const state=this.#structureFrame={...this.#structureFrame,groupDragState:frame.interaction.groupDragState,
          singleStageFolderState:this.#structureFrame.singleStageFolderState?{...this.#structureFrame.singleStageFolderState,
            groupDragState:frame.interaction.groupDragState}:null};
        interactionWork=applyDesktopLayerFrameUpdates(this.#layer,[{lane:"interaction",frame:makeDesktopInteractionFrame({
          deviceResolution:state.deviceResolution,dragFolderHoverState:state.dragFolderHoverState,
          folderClosingHandoffIds:state.folderClosingHandoffIds,folderPageSize:state.folderPageSize,
          folderSourceGhostedIds:state.folderSourceGhostedIds,gridCols:state.gridCols,gridRows:state.gridRows,
          groupDragState:state.groupDragState,height:state.height,iconSize:state.iconSize,
          isBatchSelectionActive:state.isBatchSelectionActive,isFolderOpeningPreviewFrameGhosted:state.isFolderOpeningPreviewFrameGhosted,
          isTextlessMode:state.isTextlessMode,provisionalFolderRollback:state.provisionalFolderRollback,
          launchTargetStatusById:state.launchTargetStatusById,showMissingLaunchTargetBadge:state.showMissingLaunchTargetBadge,
          iconBadgesById:state.iconBadgesById,
          singleStageFolderState:state.singleStageFolderState,stageRect:state.stageRect,width:state.width,
        })}]);
      }
      if(frame.interaction.isDesktopClosing!==this.#committed?.frame.interaction.isDesktopClosing){
        this.#pageDots.update(frame,viewport.width,viewport.height,folderOpen||frame.interaction.isDesktopClosing);
      }
      if(options.pageTrackScrub!==this.#committed?.options.pageTrackScrub)this.#layer.updatePagePresentation(options.pageTrackScrub??null);
      if(visualValues.some((value,index)=>value!==this.#visualValues[index])){
        visualWork=applyDesktopLayerFrameUpdates(this.#layer,[{lane:"visual",frame:makeDesktopVisualFrame({
          desktopVisualAlpha:folderOpen?0:frame.visual.desktopVisualAlpha,
          desktopVisualTransform:folderOpen&&!frame.interaction.isDesktopClosing?FOLDER_OPEN_DESKTOP_TRANSFORM:frame.visual.desktopVisualTransform,
          height:viewport.height,isFolderOverlayActive:folderOpen,
          launchpadVisualAlpha:frame.visual.launchpadVisualAlpha,launchpadVisualTransform:frame.visual.launchpadVisualTransform,
          snapDesktopLayout:false,stageRect:{left:0,top:0,width:viewport.width,height:viewport.height},width:viewport.width,
        })}]);this.#updates.visual++;
      }
      this.#visualValues=visualValues;
      this.#desktopDependencies=desktopDependencies;
      this.#committed={frame,viewport,options};
      if(interactionWork)return {...interactionWork,visualFrames:visualWork?.visualFrames??0};
      return visualWork??applyDesktopLayerFrameUpdates(this.#layer,[]);
    }
    this.#structureInvalidated=false;
    this.#interactionInvalidated=false;
    this.#dependencies=dependencies;
    this.#desktopDependencies=desktopDependencies;
    this.#visualValues=visualValues;
    this.#updates.structure++;

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
      options.chromeInset??0,
      options.openingIconId??null,
    );
    const folderId = folderState?.renderedFolder?.id ?? null;
    const folderSourceGhostedIds = new Set(frame.folder.folderSourceGhostedIds);
    for (const id of this.#layer.singleStageFolderLayer.getDesktopSourceGhostedIds()) folderSourceGhostedIds.add(id);
    if (folderId) folderSourceGhostedIds.add(folderId);
    const folderIsOpen = Boolean(folderState && !folderState.isFolderClosing);
    this.#pageDots.update(frame, viewport.width, viewport.height, folderIsOpen || frame.interaction.isDesktopClosing);
    const structureFrame = makeDesktopStructureFrame({
      activePageIndex: frame.viewport.activePageIndex,
      activePages: frame.viewport.activePages,
      desktopFrame: { ...stageRect, top: 64+(options.chromeInset??0), height: Math.max(1, viewport.height - 136-(options.chromeInset??0)) },
      desktopGridDebugOptions: null,
      desktopTrackMotionKey: frame.viewport.desktopTrackMotionKey,
      desktopVisualAlpha: folderIsOpen ? 0 : frame.visual.desktopVisualAlpha,
      desktopVisualTransform: folderIsOpen && !frame.interaction.isDesktopClosing ? FOLDER_OPEN_DESKTOP_TRANSFORM : frame.visual.desktopVisualTransform,
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
        if(this.#retainsPages(frame))return "static-real";
        const presentedPage = -this.#layer.pageTrack.x / viewport.width;
        return Math.abs(pageIndex - frame.viewport.activePageIndex) === 1
          || this.#isTravelPage(pageIndex,presentedPage,frame.viewport.activePageIndex)
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
      isIconOpening: (_area,itemId) => itemId===options.openingIconId,
      isSearchMode: frame.interaction.isSearchMode,
      isTextlessMode: frame.interaction.isTextlessMode,
      launchTargetStatusById: frame.diagnostics.launchTargetStatusById,
      iconBadgesById: frame.diagnostics.iconBadgesById,
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
    const work = folderOnly?{...applyDesktopLayerFrameUpdates(this.#layer,[]),structureFrames:1,
      ...this.#layer.updateRetainedFolderStructure(structureFrame)}:applyDesktopLayerFrameUpdates(this.#layer, Object.freeze([
      Object.freeze({ frame: structureFrame, lane: "structure" as const }),
    ]));
    this.#structureFrame=structureFrame;
    if(this.#retainsPages(frame))this.#layer.cullRetainedPages(viewport.width);
    else if(this.#pageRange==="retained")for(const node of this.#layer.iconNodes.values())node.renderable=true;

    const resolutionChanged=this.#textResolution!==viewport.resolution;
    const prepareText=(node:IconNode)=>{
      // App labels use a stable subtree; folder previews can realize children.
      if(!resolutionChanged&&(this.#textNodes.get(node)!==viewport.resolution||node.item?.type==="folder"))syncPixiTextResolution(node,viewport.resolution);
      this.#textNodes.set(node,viewport.resolution);
    };
    for (const node of this.#layer.iconNodes.values()) {
        prepareText(node);
        if(folderOnly&&Number(node.source?.pageIndex)!==frame.viewport.activePageIndex)continue;
        const item=node.item;if(!item)continue;
        node.label = `launchpad-item:${item.id}`;
        if (this.#activationNodes.has(node)) continue;
        this.#activationNodes.add(node);
        node.on("pointertap", event => {
          if (event.pointerType === "touch" || event.pointerType === "mouse") return;
          const current = node.item;
          if (current) this.#onIconActivate?.(current);
        });
    }
    if (folderState && !folderState.isFolderClosing) {
      for (const node of this.#layer.singleStageFolderLayer.iconNodes.values()) {
        prepareText(node);
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
    if(resolutionChanged){syncPixiTextResolution(this.#layer,viewport.resolution);this.#textResolution=viewport.resolution;}
    else syncPixiTextResolution(this.#layer.groupDragLayer,viewport.resolution);
    this.#committed={frame,viewport,options};
    this.#pageRange=this.#visiblePageRange(frame,viewport.width);
    return work;
  }

  createDragPointerEvent(id:string,pointer:Parameters<typeof makeSyntheticPointerEvent>[0]) {
    const node=this.#layer.getChildByLabel(`launchpad-item:${id}`,true);
    if(!(node instanceof IconNode))throw new Error("Drag target is not a rendered icon");
    const event=makeSyntheticPointerEvent(pointer,node as Parameters<typeof makeSyntheticPointerEvent>[1]);
    if(!event.currentTarget.getBoundingClientRect())throw new Error("Drag target has no rendered bounds");
    return event;
  }

  connectAnimationHost(host: NativeSceneAnimationHost): () => void {
    if (this.#destroyed) throw new Error("NativeDesktopScene has been destroyed");
    let stopFrames: (() => void) | null = null;
    let disconnected = false;
    const ensureFrames = (): void => {
      if (disconnected || stopFrames !== null || !motionRuntime.hasActiveWork()) return;
      stopFrames = host.animate((deltaMs) => {
        motionRuntime.step(deltaMs / 1000);
        // Match the Web presentation loop: update geometry/handoffs after motion, before rendering.
        host.commit();
        this.presentMotion();
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

  captureClosingSourcePoses(folderId: string, ids: readonly string[]) {
    const overlay=this.#layer.singleStageFolderLayer;
    const result=new Map<string,{rect:{left:number;top:number;width:number;height:number;right:number;bottom:number};alpha:number}>();
    if(overlay.folderVisualSession.snapshot().closing?.folderId!==folderId)return result;
    for(const id of ids){
      const active=overlay.closingGhosts.activeGhostsByItemId.get(id);
      const ghost=active?.ghost;
      const rect=ghost?.getIconBounds(overlay.stageRect ?? {left:0,top:0});
      if(ghost&&!ghost.destroyed&&rect)result.set(id,{rect:{...rect,right:rect.left+rect.width,bottom:rect.top+rect.height},alpha:ghost.alpha});
    }
    return result;
  }
  getDesktopAlpha():number { return this.#layer.visualRoot.alpha; }

  getMotionSnapshot(): Readonly<{
    active: boolean;
    desktopPageTrackTargetX: number;
    desktopPageTrackX: number;
    folderPageTrackTargetX: number | null;
    folderPageTrackX: number | null;
  }> {
    const folderPageTrackX = this.#layer.singleStageFolderLayer.pageTrack?.x;
    const folderPageTrackTargetX = this.#layer.singleStageFolderLayer.pageTrackMotion?.targetX;
    return Object.freeze({
      active: motionRuntime.hasActiveWork(),
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
    // Folder pages translate by the panel span, not the inset grid width.
    if (scope.startsWith("folder:")) {
      const span = this.getFolderPanelRect()?.width;
      if (span && span > 0) return span;
    } else if (this.#committed) {
      return this.#committed.viewport.width;
    }
    const element = scope.startsWith("folder:")
      ? this.#folderPageRefs.get(pageIndex)
      : this.#pageRefs.get(pageIndex);
    const width = Number((element as {
      getBoundingClientRect?: () => Readonly<{ width?: unknown }>;
    } | undefined)?.getBoundingClientRect?.().width);
    return Number.isFinite(width) && width > 0 ? width : Math.max(1, fallback);
  }

  destroy(): void {
    this.#committed=null;
    this.#structureFrame=null;
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
