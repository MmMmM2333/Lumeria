import type { FederatedPointerEvent,FederatedWheelEvent } from "pixi.js";
import { readNativeTouchpad,type NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { activeTouchpadCapture } from "../../debug/touchpadCapture.js";
import { isInteractiveGroupTransferPhase } from "../../domain/groupTransferSession.js";
import type { LaunchpadIconScope } from "../../domain/iconFocus.js";
import {
createLaunchpadGestureEngine,
type LaunchpadGestureDeadline,
type LaunchpadGestureOutput,
type LaunchpadPagePresentation,
} from "../../domain/input/launchpadGestureEngine.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { NativeManagement } from "../../rendering/native/NativeManagement.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import type { NativeSettingsShell } from "../../rendering/native/NativeSettingsShell.js";
import type { createNativeFolderFlow } from "../../rendering/native/nativeFolderFlow.js";
import { resolveNativePointerTarget, routeNativePointerDown } from "../../rendering/native/nativePointerTarget.js";
import type { SceneItem,ScenePageTrackScrub } from "../../rendering/sceneFrame.js";
import type { createNativeEditing } from "../nativeEditing.js";

export type NativeFolderFlow = ReturnType<typeof createNativeFolderFlow>;
type NativeEditing = ReturnType<typeof createNativeEditing>;

// The router owns every piece of native gesture state: the wheel engine, its
// deadlines, the owned touch pointer id, the page-track scrub pair and the
// touchpad route lease. Product state stays with the entry assembly and is
// reached through explicit readers/commands, so no state is owned twice.
export type NativeInputRouterPorts = Readonly<{
  activateItem: (item: SceneItem, event?: { shiftKey?: boolean }) => void;
  app: NativePixiApplication;
  closeFolder: () => boolean;
  commitDesktopPage: (pageIndex: number) => boolean;
  contextMenu: (item: SceneItem | null, x: number, y: number) => void;
  dismissLaunchpad: () => void;
  folderFlow: NativeFolderFlow;
  getActivePageItems: () => readonly SceneItem[];
  getCurrentIconScope: () => LaunchpadIconScope<SceneItem>;
  getDesktopPageCount: () => number;
  getDesktopPageIndex: () => number;
  getEditing: () => NativeEditing | null;
  getSettingsShell: () => NativeSettingsShell | null;
  isInteractionBlocked: () => boolean;
  management: NativeManagement;
  requestSceneRender: () => void;
  scene: NativeDesktopScene;
  searchBar: NativeSearchBar;
  setFolderPageIndex: (pageIndex: number) => boolean;
}>;

export type NativePageTrackScrub = Readonly<{
  desktop: ScenePageTrackScrub | null;
  folder: ScenePageTrackScrub | null;
}>;

export type NativeInputRouter = Readonly<{
  resetWheelNavigation: () => void;
  isWheelNavigationActive: () => boolean;
  cancelGesture: () => void;
  clearPresentation: () => void;
  dispose: () => void;
  interruptWheel: (event: Readonly<{ timeStamp?: unknown }>) => void;
  readPageTrackScrub: () => NativePageTrackScrub;
  readTouchId: () => number | null;
}>;

export function createNativeInputRouter(ports: NativeInputRouterPorts): NativeInputRouter {
  const {
    activateItem, app, closeFolder, commitDesktopPage, contextMenu, dismissLaunchpad, folderFlow,
    getActivePageItems, getCurrentIconScope, getDesktopPageCount, getDesktopPageIndex, getEditing,
    getSettingsShell, isInteractionBlocked, management, requestSceneRender, scene, searchBar,
    setFolderPageIndex,
  } = ports;

  const wheelGestures = createLaunchpadGestureEngine();
  const wheelDeadlines = new Map<LaunchpadGestureDeadline["kind"], ReturnType<typeof setTimeout>>();
  let touchId: number | null = null;
  let desktopPageTrackScrub: ScenePageTrackScrub | null = null;
  let folderPageTrackScrub: ScenePageTrackScrub | null = null;
  // Single frozen getter view: per-frame readers see live values without a
  // second copy of the scrub state and without allocating.
  const scrubView: NativePageTrackScrub = Object.freeze({
    get desktop(): ScenePageTrackScrub | null { return desktopPageTrackScrub; },
    get folder(): ScenePageTrackScrub | null { return folderPageTrackScrub; },
  });
  let pointerShiftKey = false;
  // A closing residual shares the desktop icon gesture path, but releasing
  // outside the window must not be read as a short tap that reopens the folder.
  let closingFolderGesture = false;
  let lastWheelGestureTime = 0;
  let wheelActive = false;
  let touchpadOwner:{sequence:number;settings:NativeSettingsShell|null;dialog:string|null;folder:string|null}|null=null;

  const releaseGesturePointer = () => {
    const id = touchId;
    touchId = null;
    closingFolderGesture = false;
    if (id !== null) app.nativeInput.releasePointerCapture(id);
  };
  const clearWheelDeadline = (kind: LaunchpadGestureDeadline["kind"]): void => {
    const timer = wheelDeadlines.get(kind);
    if (timer) clearTimeout(timer);
    wheelDeadlines.delete(kind);
  };
  const clearWheelPresentation = (): void => {
    desktopPageTrackScrub = null;
    folderPageTrackScrub = null;
    requestSceneRender();
  };
  const resetWheelNavigation = (): void => {
    wheelGestures.dispatch({type:"resetWheel"});
    clearWheelDeadline("wheelEnd");
    clearWheelDeadline("clearPresentation");
    wheelActive = false;
    touchpadOwner = null;
    clearWheelPresentation();
  };
  const toPageTrackScrub = (
    presentation: LaunchpadPagePresentation,
  ): ScenePageTrackScrub => ({
    ...(presentation.continuousWheel?{continuousWheel:true,sampleTime:presentation.sampleTime}:{}),
    edge: presentation.edge,
    fromIndex: presentation.fromIndex,
    progress: presentation.progress,
    scope: presentation.scope,
    ...(presentation.settle ? {
      settle: true,
      settleToken: presentation.settleToken,
      targetProgress: presentation.targetProgress,
      velocity: presentation.velocity,
    } : {}),
    toIndex: presentation.toIndex,
  });
  let applyWheelOutput: (
    output: LaunchpadGestureOutput,
    event: FederatedWheelEvent | null,
    time: number,
    source?: "pointer" | "wheel",
  ) => void;
  const scheduleWheelDeadline = (
    deadline: LaunchpadGestureDeadline | null | undefined,
    source: "pointer" | "wheel",
  ): void => {
    if (!deadline) {
      clearWheelDeadline(source === "pointer" ? "hold" : "wheelEnd");
      return;
    }
    clearWheelDeadline(deadline.kind);
    const timer = setTimeout(() => {
      if (wheelDeadlines.get(deadline.kind) !== timer) return;
      wheelDeadlines.delete(deadline.kind);
      if (deadline.kind === "clearPresentation") {
        clearWheelPresentation();
        return;
      }
      if (deadline.kind === "wheelEnd") wheelActive = false;
      applyWheelOutput(
        wheelGestures.dispatch({ type: "deadline", kind: deadline.kind, time: deadline.at }),
        null,
        deadline.at,
        deadline.kind === "hold" ? "pointer" : "wheel",
      );
    }, Math.max(0, deadline.at - lastWheelGestureTime));
    wheelDeadlines.set(deadline.kind, timer);
  };
  applyWheelOutput = (output, event, time, source = "wheel"): void => {
    const editing = getEditing();
    // Release before commands: activation can synchronously hide the window or
    // trigger another cancellation, which must not observe a stale pointer.
    if (output.releasesPointer) { resetWheelNavigation(); releaseGesturePointer(); }
    activeTouchpadCapture?.decision(output);
    lastWheelGestureTime = time;
    if (output.presentation) {
      clearWheelDeadline("clearPresentation");
      const scrub = toPageTrackScrub(output.presentation);
      if (editing?.drag.isDragActive() && scrub.settle && !scrub.continuousWheel) {
        // A wheel notch may interrupt an unfinished edge/page spring. Start
        // the new settle at the displayed position, not the logical page edge.
        const folder = scrub.scope.startsWith("folder:");
        const motion = scene.getMotionSnapshot();
        const liveX = folder ? motion.folderPageTrackX : motion.desktopPageTrackX;
        const span = scene.getPageWidth(scrub.scope, scrub.fromIndex, app.contentSize.width);
        if (liveX !== null && span > 0) {
          Object.assign(scrub, {fromIndex: -liveX / span, progress: 0});
        }
      }
      if (scrub.scope.startsWith("folder:")) {
        desktopPageTrackScrub = null;
        folderPageTrackScrub = scrub;
      } else {
        desktopPageTrackScrub = scrub;
        folderPageTrackScrub = null;
      }
      requestSceneRender();
    }
    let rejectedNavigation = false;
    for (const command of output.commands) {
      if(command.type === "startDrag" && command.target.kind === "icon" && command.target.id) {
        editing?.beginDrag(command.target.id, {
          ...scene.createDragPointerEvent(command.target.id,{clientX:Number(command.pointer.x),clientY:Number(command.pointer.y),
            pointerId:command.pointer.pointerId??undefined,pointerType:command.pointer.pointerType,
            button:0,buttons:1,type:"pointermove"}),
          isPrimary:true,pointerType:command.pointer.pointerType??undefined,
          dragAnchor:command.dragAnchor,dragStartedFromThreshold:command.dragStartedFromThreshold,
        });
      }
      if(command.type === "updateDrag") editing?.drag.updateDragPointer({ clientX: Number(command.pointer.x), clientY: Number(command.pointer.y),
        pointerId: command.pointer.pointerId, pointerType: command.pointer.pointerType, buttons: command.pointer.buttons, preventDefault: () => {} });
      if(command.type === "finishDrag") editing?.drag.finishDrag({ clientX: Number(command.pointer.x), clientY: Number(command.pointer.y),
        pointerId: command.pointer.pointerId, pointerType: command.pointer.pointerType, button: 0, type: "pointerup" });
      if(command.type === "cancelDrag") editing?.drag.cancelDrag({ pointerId: command.pointer.pointerId, type: "pointercancel" });
      if(command.type === "openContextMenu" && command.target.kind === "icon") {
        const id=command.target.id;const item=getCurrentIconScope().items.find(item=>item.id===id);
        if(item)contextMenu(item,Number(command.pointer.x),Number(command.pointer.y));
      }
      if (command.type === "activateTarget" && command.target.kind === "icon") {
        const id = command.target.id;
        const item = getCurrentIconScope().items.find(item => item.id === id);
        if (item) void activateItem(item, {shiftKey: pointerShiftKey});
      }
      if(command.type==="surfaceTap"&&command.target.kind==="surface"){
        if(getSettingsShell()||management.modal||editing?.drag.isDragActive()||editing?.selection.isActive.value)continue;
        if(folderFlow.snapshot().renderedFolder){closeFolder();continue;}
        dismissLaunchpad();
      }
      if (command.type !== "commitPage") continue;
      if (editing?.drag.isDragActive()) {
        const accepted = editing.drag.navigateDragPage(command.pageIndex, command.scope.startsWith("folder:") ? command.scope.slice(7) : null, false, "wheel");
        if (!accepted) { resetWheelNavigation(); rejectedNavigation = true; }
        continue;
      }
      if (command.scope.startsWith("folder:")) {
        if (command.scope === `folder:${folderFlow.snapshot().renderedFolder?.id}`) {
          setFolderPageIndex(command.pageIndex);
        }
      } else {
        commitDesktopPage(command.pageIndex);
      }
    }
    if (!rejectedNavigation && Object.prototype.hasOwnProperty.call(output, "deadline")) {
      scheduleWheelDeadline(output.deadline, source);
    }
    if (output.handled) {
      event?.preventDefault();
      event?.stopPropagation();
    }
  };
  const onWheel = (event: FederatedWheelEvent): void => {
    if(isInteractionBlocked())return;
    if(getSettingsShell()||management.modal || searchBar.input.focused)return;
    const group = getEditing()?.drag.groupDragState.value;
    if (group && !isInteractiveGroupTransferPhase(group.phase)) {
      event.preventDefault();
      return;
    }
    const folder = folderFlow.snapshot();
    const dragging = getEditing()?.drag.isDragActive();
    if (folder.renderedFolder && folder.isClosing && !dragging) {
      event.preventDefault();
      return;
    }
    const inFolder = folder.renderedFolder && !folder.isClosing;
    const scope = inFolder ? `folder:${folder.renderedFolder!.id}` : "desktop";
    const pageIndex = inFolder
      ? folder.folderPageIndex
      : getDesktopPageIndex();
    const pageCount = inFolder
      ? Math.max(folder.renderedFolder!.childPages.length, folder.folderPageIndex + 1)
      : getDesktopPageCount();
    const timeStamp = Number(event.timeStamp);
    const time = Number.isFinite(timeStamp) && timeStamp >= 0 ? timeStamp : performance.now();
    const touchpad=readNativeTouchpad(event);
    if (dragging) getEditing()!.drag.refreshEdgeNavigation();
    const output = wheelGestures.dispatch({
      type: "wheel",
      time,
      ctrlKey: event.ctrlKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      metaKey: event.metaKey,
      momentum: touchpad?touchpad.phase==="inertia":null,
      ...(touchpad?{wheelSource:"touchpad" as const,wheelPhase:touchpad.phase}:{}),
      viewport: {
        scope,
        pageIndex,
        pageCount,
        pageWidth: scene.getPageWidth(scope, pageIndex, app.contentSize.width),
      },
    });
    if (!event.ctrlKey && !event.metaKey && output.handled) {
      wheelActive = touchpad ? !["end","cancel","inertia"].includes(touchpad.phase)
        : output.deadline?.kind === "wheelEnd";
    }
    applyWheelOutput(output, event, time);
  };
  const interruptWheel = (event: Readonly<{ timeStamp?: unknown }>): void => {
    if (touchId !== null) return;
    const timestamp = Number(event.timeStamp);
    const time = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : performance.now();
    applyWheelOutput(wheelGestures.dispatch({ type: "cancel", time }), null, time);
  };
  const cancelGesture = (): void => {
    const time = performance.now();
    const output = wheelGestures.dispatch({ type: "cancel", time });
    releaseGesturePointer();
    applyWheelOutput(output, null, time);
    for (const timer of wheelDeadlines.values()) clearTimeout(timer);
    wheelDeadlines.clear();
    wheelActive = false;
    touchpadOwner = null;
    clearWheelPresentation();
  };
  const guardTouchpadRoute=(event:FederatedWheelEvent)=>{
    const meta=readNativeTouchpad(event);
    if(!meta)return;
    if(meta.phase==="begin")touchpadOwner={sequence:meta.sequence,settings:getSettingsShell(),dialog:management.activeId,folder:folderFlow.snapshot().renderedFolder?.id??null};
    const valid=touchpadOwner?.sequence===meta.sequence&&touchpadOwner.settings===getSettingsShell()&&touchpadOwner.dialog===management.activeId&&touchpadOwner.folder===(folderFlow.snapshot().renderedFolder?.id??null);
    if(!valid){event.preventDefault();event.stopPropagation();touchpadOwner=null;interruptWheel(event);}
    if(meta.phase==="end"||meta.phase==="cancel")touchpadOwner=null;
  };
  const touch = (type: string, event: FederatedPointerEvent): void => {
    if(isInteractionBlocked()){
      if(touchId!==null)cancelGesture();
      return;
    }
    if (event.pointerType !== "touch" && event.pointerType !== "mouse") return;
    if (type === "pointerDown" && (touchId !== null || event.isPrimary === false)) return;
    if (type !== "pointerDown" && touchId !== event.pointerId) return;
    const scope = getCurrentIconScope();
    let target = resolveNativePointerTarget(event.target);
    if(target.kind==="surface"){
      const closingId=scene.closingFolderAtPoint(event.global.x,event.global.y);
      if(closingId)target={kind:"closingFolder",id:closingId};
    }
    if (type === "pointerDown" && event.button === 0 && target.kind === "surface"
      && (event.nativeEvent as { activatesWindow?: boolean } | null)?.activatesWindow) {
      // This click already activated the HWND; do not also start a blank-dismiss gesture.
      event.stopPropagation();return;
    }
    // A detached closing residual resolves to its own folder id, so the press
    // enters the shared icon gesture path: pointer down never reopens, a short
    // tap does, and a hold or drag hands off to the normal drag flow. Other
    // deferred targets keep their existing handlers.
    let gestureTarget: Readonly<{ id: string; kind: "icon" }> | Readonly<{ kind: "surface" }> = { kind: "surface" };
    if (type === "pointerDown") {
      const route = routeNativePointerDown({
        hasModal: Boolean(management.modal),
        hasSettingsShell: Boolean(getSettingsShell()),
        isActiveDesktopItem: id => getActivePageItems().some(item => item.id === id),
        isClosing: folderFlow.snapshot().isClosing,
        scopeArea: scope.area,
        target,
      });
      if (route.kind === "defer") return;
      gestureTarget = route.target;
    }
    pointerShiftKey=event.shiftKey;
    const output = wheelGestures.dispatch({ type, pointerId: event.pointerId, pointerType: event.pointerType,
      isPrimary: event.isPrimary, button: event.button, buttons: event.buttons,
      x: event.global.x, y: event.global.y, time: event.timeStamp,
      target: gestureTarget,
      dragOnHold: getEditing()?.selection.isActive.value === true,
      viewport: { scope: scope.area === "folder" ? `folder:${scope.folderId}` : scope.area,
        pageIndex: scope.pageIndex,
        pageCount: scope.area === "folder" ? folderFlow.snapshot().renderedFolder!.childPages.length : getDesktopPageCount(),
        pageWidth: scene.getPageWidth(scope.area === "folder" ? `folder:${scope.folderId}` : scope.area, scope.pageIndex, app.contentSize.width) },
    });
    if (output.ownsPointer) {
      touchId = event.pointerId;
      if(type==="pointerDown")closingFolderGesture = target.kind === "closingFolder";
      clearWheelPresentation();
      app.nativeInput.capturePointer(event.pointerId);
    }
    applyWheelOutput(output, null, event.timeStamp, "pointer");
    event.stopPropagation();
  };
  const touchDown = (event: FederatedPointerEvent) => touch("pointerDown", event);
  const touchMove = (event: FederatedPointerEvent) => touch("pointerMove", event);
  const touchUp = (event: FederatedPointerEvent) => touch("pointerUp", event);
  // Releasing a closing-residual press outside the window keeps its existing
  // desktop-icon semantics for normal icons, but a residual must not reopen.
  const touchUpOutside = (event: FederatedPointerEvent) => touch(closingFolderGesture ? "pointerCancel" : "pointerUp", event);
  const touchCancel = (event: FederatedPointerEvent) => touch("pointerCancel", event);
  const offWheel = () => {app.stage.off("wheel", onWheel);app.stage.off("wheelcapture",guardTouchpadRoute);};
  const offTouch = () => {
    app.stage.off("pointerdowncapture", touchDown);
    app.stage.off("globalpointermove", touchMove);
    app.stage.off("pointerupcapture", touchUp);
    app.stage.off("pointerupoutside", touchUpOutside);
    app.stage.off("pointercancel", touchCancel);
    cancelGesture();
  };
  const offWheelPointerInterrupt = () => app.stage.off("pointerdowncapture", interruptWheel);
  app.stage.on("wheelcapture",guardTouchpadRoute);
  app.stage.on("wheel", onWheel);
  app.stage.on("pointerdowncapture", touchDown);
  app.stage.on("globalpointermove", touchMove);
  app.stage.on("pointerupcapture", touchUp);
  app.stage.on("pointerupoutside", touchUpOutside);
  app.stage.on("pointercancel", touchCancel);
  app.stage.on("pointerdowncapture", interruptWheel);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    offWheel();
    offWheelPointerInterrupt();
    offTouch();
    for (const timer of wheelDeadlines.values()) clearTimeout(timer);
    wheelDeadlines.clear();
  };

  return Object.freeze({
    resetWheelNavigation,
    isWheelNavigationActive: () => wheelActive,
    cancelGesture,
    clearPresentation: clearWheelPresentation,
    dispose,
    interruptWheel,
    readPageTrackScrub: () => scrubView,
    readTouchId: () => touchId,
  });
}
