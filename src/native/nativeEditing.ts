import { t } from "./nativeLocalization.js";
import { createAltEditMode } from "../application/altEditMode.js";
import { createLaunchpadDrag, type LaunchpadDragOptions, type LaunchpadDragPointerEvent, type CompleteGroupReleaseResult } from "../application/launchpadDrag.js";
import { createNativeStateHost } from "../application/stateHost.js";
import { createLaunchpadPageCommands, type LaunchpadWarningDialogConfig } from "../application/launchpadPageCommands.js";
import { createLaunchpadSelectionSession } from "../application/launchpadSelectionSession.js";
import { planGroupTransfer } from "../domain/groupTransferPlanner.js";
import { isInteractiveGroupTransferPhase } from "../domain/groupTransferSession.js";
import { createProvisionalFolderRollback } from "../application/provisionalFolderRollback.js";
import type { LaunchpadPages, ReadonlyLaunchpadPages } from "../domain/launchpadLayout.js";
import type { createNativeLayoutState } from "./nativeStartup.js";
import type { NativeDesktopScene } from "../rendering/native/NativeDesktopScene.js";
import type { NativeFolderFlow } from "../rendering/native/nativeFolderFlow.js";

type Options = {
  layout: ReturnType<typeof createNativeLayoutState>;
  scene: NativeDesktopScene;
  folder: NativeFolderFlow;
  size(): { width: number; height: number };
  chromeInset?():number;
  selectionToolbarRect?():{left:number;top:number;width:number;height:number}|null;
  changed(): void;
  frames: {request(callback:()=>void):number;cancel(id:number):void};
  commit(pages: LaunchpadPages): void;
  open(id: string | null): void;
  page(index: number): void;
  dragPage(index: number): void;
  folderPage(index: number, options?: { allowCreate?: boolean }): void;
  confirm(config: LaunchpadWarningDialogConfig): void;
};

export function createNativeEditing(options: Options) {
  const state = createNativeStateHost(options.changed);
  const selection = createLaunchpadSelectionSession(state);
  let revision = 0;
  const layout = options.layout;
  const cells = layout.presentation;
  const rollback=createProvisionalFolderRollback({cloneItem:layout.operations.cloneItem},state);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let timerId = 0;
  const schedule = (callback: () => void, delay = 0): number => {
    const id = ++timerId;
    timers.set(id, setTimeout(() => { timers.delete(id); callback(); }, delay));
    return id;
  };
  const clear = (id: number) => { clearTimeout(timers.get(id)); timers.delete(id); };
  const alt = createAltEditMode({
    eventTarget: { setTimeout: schedule, clearTimeout: clear },
    isBatchSelectionActive: () => selection.isActive.value,
    isDragActive: () => drag.isDragActive(),
  }, state);
  const mode = alt.isEditMode;
  const rect = () => { const { width, height } = options.size(),inset=options.chromeInset?.()??0; return { left: 0, top: 64+inset, width, height: height - 136-inset, right: width, bottom: height - 72 }; };
  const folderRect = () => {
    const value = options.scene.getFolderPanelRect();
    return value ? { ...value, right: value.left + value.width, bottom: value.top + value.height } : rect();
  };
  const commit = (pages: LaunchpadPages) => { revision += 1; options.commit(pages); selection.reconcile(pages); };
  const drag = createLaunchpadDrag({
    ...layout.operations,
    pages: cells.pages,
    gridCols: cells.gridCols, gridRows: cells.gridRows, iconSize: cells.iconSize,
    folderCols: cells.folderCols, folderPageSize: cells.folderPageSize,
    folderPageIndex: state.derived(() => options.folder.snapshot().folderPageIndex),
    folderPages: state.derived(() => options.folder.snapshot().renderedFolder?.childPages ?? []) as LaunchpadDragOptions["folderPages"],
    openFolderId: state.derived(() => options.folder.snapshot().isClosing ? null : options.folder.snapshot().renderedFolder?.id ?? null),
    pageIndex: cells.pageIndex,
    get pageRefs() { return options.scene.getPageRefs() as LaunchpadDragOptions["pageRefs"]; },
    get folderPageRefs() { return options.scene.getFolderPageRefs() as LaunchpadDragOptions["folderPageRefs"]; },
    desktopMainRef: state.derived(() => ({ getBoundingClientRect: rect })),
    folderPanelRef: state.derived(() => ({ getBoundingClientRect: folderRect })),
    folderViewportRef: state.derived(() => ({ getBoundingClientRect: folderRect })),
    visibleFolderRowCount: cells.folderRows,
    iconBoundsRegistry: options.scene.iconBoundsRegistry,
    getBatchCancelZoneRect:()=>selection.isActive.value?options.selectionToolbarRect?.()??null:null,
    isHomeRevealSettling: state.derived(() => false),
    isLaunchpadInteractionBlocked: () => false,
    finishHomeRevealSettleWindow: () => {},
    getGroupLayoutRevision: () => revision,
    getNewFolderName: () => t("launchpad.newFolder"),
    commitPageIndex: options.dragPage,
    commitFolderPageIndex: options.folderPage,
    commitOpenFolder: options.open,
    planGroupTransfer: request => planGroupTransfer({ basePages: request.basePages,
      baseRevision: request.baseRevision, currentRevision: revision,
      selectedIds: request.draggedIds, leadId: request.leadId, intent: request.intent,
      makeFolderId: () => request.createdFolderId, folderName: t("launchpad.newFolder"),
      pageSize: cells.pageSize.value, folderPageSize: cells.folderPageSize.value }),
    commitGroupDrop: (plan, operation) => {
      if(operation.baseRevision !== revision || (!operation.standalone && operation.selectionRevision !== selection.revision.value)) return false;
      const openId = options.folder.snapshot().renderedFolder?.id;
      if(openId && !(operation.intent?.type === "folder-slot" && operation.intent.folderId === openId)) options.open(null);
      commit(plan.nextPages);
      return true;
    },
    discardProvisionalFolder: (id,request) => {
      if(layout.operations.findFolder(cells.pages.value, id)) return false;
      rollback.begin({...request,folderId:id});
      options.open(null);
      return true;
    },
    onGroupDragStart: payload => { if(!payload.standalone) selection.freeze("drag"); },
    onGroupDragEnd: () => selection.unfreeze("drag"),
  }, state, {
    setTimeout: schedule, clearTimeout: clear,
    requestAnimationFrame: options.frames.request, cancelAnimationFrame: options.frames.cancel,
    // Native Pixi has no automatic browser context menu to suppress.
    addEventListener: () => {}, removeEventListener: () => {}, afterCommit: queueMicrotask,
  });
  const projectedPages = (): ReadonlyLaunchpadPages => rollback.projectedPages.value ?? drag.projectedPages.value ?? cells.pages.value;
  const pageCommands=createLaunchpadPageCommands({
    ...layout.operations,...cells,
    localizationText:{t},isDragActive:()=>drag.isDragActive(),
    cancelInputGesture:()=>options.page(cells.pageIndex.value),
    commitPagesState:commit,commitPageIndex:options.page,
    commitSearchPageIndex:layout.commitSearchPageIndex,
    commitFolderPageIndex:options.folderPage,commitOpenFolder:options.open,
    rebasePageIndices:index=>{layout.commitPageIndex(index);layout.commitSearchPageIndex(index);options.page(index);},
    openFolderId:state.derived(()=>options.folder.snapshot().isClosing?null:options.folder.snapshot().renderedFolder?.id??null),
    renderedFolder:state.derived(()=>{
      const id=options.folder.snapshot().renderedFolder?.id;
      return id?layout.operations.findFolder(cells.pages.value,id)?.item??null:null;
    }),
    openWarningDialog:options.confirm,schedulePageGridMetrics:options.changed,
  });
  return {
    drag, selection, mode, alt, projectedPages,rollback,pageCommands,
    presentationPageIndex: () => {
      const group = drag.groupDragState.value;
      return group && isInteractiveGroupTransferPhase(group.phase) ? group.desktopPageIndex : cells.pageIndex.value;
    },
    commit,
    beginDrag(id: string, event: LaunchpadDragPointerEvent): boolean {
      const pages = cells.pages.value;
      const top = layout.operations.findTopLevel(pages, id);
      const nested = top ? null : pages.flat().filter(item => item.type === "folder")
        .map(folder => layout.operations.findInFolder(pages, folder.id, id)).find(Boolean);
      const item = top?.item ?? nested?.item;
      if(!item) return false;
      const source = top ? { type: "page" as const, pageIndex: top.pageIndex, index: top.index }
        : { type: "folder" as const, folderId: nested!.folder.id, pageIndex: nested!.pageIndex, index: nested!.index };
      return drag.startDrag(event, item, source, selection.isActive.value ? {
        draggedIds: selection.isSelected(id) ? [...selection.selectedIds.value] : [id],
        leadId: id, layoutRevision: revision, selectionRevision: selection.revision.value,
      } : undefined);
    },
    complete(result: unknown): void { drag.completeGroupRelease(result as CompleteGroupReleaseResult); },
    remove(ids: readonly string[]): void {
      let pages = layout.operations.clonePages(cells.pages.value);
      for(const id of ids) pages = layout.operations.removeEverywhere(pages, id);
      commit(pages);
    },
    renameFolder(id: string, name: string): void {
      const pages = layout.operations.clonePages(cells.pages.value);
      const folder = layout.operations.findFolder(pages, id);
      if (!folder) return;
      folder.item.name = String(name || "").slice(0, 32) || t("launchpad.newFolder");
      commit(pages);
    },
    rename(id: string, name: string): void {
      if(!name.trim()) throw new Error("Name is required");
      const pages = layout.operations.clonePages(cells.pages.value);
      const item = pages.flatMap(itemPage => itemPage.flatMap(item => item.type === "folder" ? [item, ...item.childPages.flat()] : [item]))
        .find(item => item?.id === id);
      if(!item) throw new Error("Item no longer exists");
      item.name = name.trim();
      if(item.type === "app" && item.origin === "catalog") item.presentationOverrides = { ...item.presentationOverrides, name: item.name };
      commit(pages);
    },
    createFolder(): boolean {
      const ids = [...selection.selectedIds.value];
      const sourceFolder = options.folder.snapshot();
      const sourcePoses = sourceFolder.isClosing && sourceFolder.renderedFolder
        ? options.scene.captureClosingSourcePoses(sourceFolder.renderedFolder.id, ids) : undefined;
      const openFolder = !sourceFolder.isClosing && sourceFolder.renderedFolder
        ? layout.operations.findFolder(cells.pages.value, sourceFolder.renderedFolder.id) : null;
      const pageIndex = openFolder?.pageIndex ?? cells.pageIndex.value;
      const page = cells.pages.value[pageIndex] ?? [];
      const selected = new Set(ids);
      const anchorIndex = page.findIndex(item => item.type === "app" && selected.has(item.id));
      const visibleChild = openFolder?.item.childPages[sourceFolder.folderPageIndex]?.find(item => item && selected.has(item.id));
      const lead = visibleChild?.id ?? (anchorIndex >= 0 ? page[anchorIndex]!.id : ids[0]);
      if(ids.length < 2 || !lead) return false;
      const destination = { pageIndex, index: openFolder ? openFolder.index + 1 : anchorIndex >= 0 ? anchorIndex : page.length };
      const plan = planGroupTransfer({ basePages: cells.pages.value, baseRevision: revision, currentRevision: revision,
        selectedIds: ids, leadId: lead, intent: { type: "toolbar-folder-create", anchorId: lead, destination },
        makeFolderId: () => layout.operations.makeId("folder"), folderName: t("launchpad.newFolder"), pageSize: cells.pageSize.value, folderPageSize: cells.folderPageSize.value });
      if(plan.status !== "accepted") return false;
      return drag.startCommittedGroupTransfer({ baseRevision: revision, draggedIds: ids, leadId: lead,
        ...(sourcePoses ? {sourcePoses} : {}),
        selectionRevision: selection.revision.value, plan, commit: accepted => {
          // Source poses were captured by startCommittedGroupTransfer before
          // closing. Keep the old panel out of the new desktop presentation.
          if (openFolder) options.open(null);
          commit(accepted.nextPages); selection.clear(); return true;
        } });
    },
    dispose(): void { drag.disposeDrag(); rollback.dispose(); for(const timer of timers.values()) clearTimeout(timer); timers.clear(); },
  };
}
