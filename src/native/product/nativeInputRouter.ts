import type { FederatedPointerEvent,FederatedWheelEvent } from "pixi.js";
import { readNativeTouchpad,type NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { activeTouchpadCapture } from "../../debug/touchpadCapture.js";
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
import { resolveNativePointerTarget } from "../../rendering/native/nativePointerTarget.js";
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
  let lastWheelGestureTime = 0;
  let touchpadOwner:{sequence:number;settings:NativeSettingsShell|null;dialog:string|null;folder:string|null}|null=null;

  const releaseGesturePointer = () => {
    const id = touchId;
    touchId = null;
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
  ) => void;
  const scheduleWheelDeadline = (
    deadline: LaunchpadGestureDeadline | null | undefined,
  ): void => {
    if (!deadline) {
      clearWheelDeadline("wheelEnd");
      clearWheelDeadline("hold");
      return;
    }
    clearWheelDeadline(deadline.kind);
    const timer = setTimeout(() => {
      wheelDeadlines.delete(deadline.kind);
      if (deadline.kind === "clearPresentation") {
        clearWheelPresentation();
        return;
      }
      applyWheelOutput(
        wheelGestures.dispatch({ type: "deadline", kind: deadline.kind, time: deadline.at }),
        null,
        deadline.at,
      );
    }, Math.max(0, deadline.at - lastWheelGestureTime));
    wheelDeadlines.set(deadline.kind, timer);
  };
  applyWheelOutput = (output, event, time): void => {
    const editing = getEditing();
    // Release before commands: activation can synchronously hide the window or
    // trigger another cancellation, which must not observe a stale pointer.
    if (output.releasesPointer) releaseGesturePointer();
    activeTouchpadCapture?.decision(output);
    lastWheelGestureTime = time;
    if (output.presentation) {
      clearWheelDeadline("clearPresentation");
      const scrub = toPageTrackScrub(output.presentation);
      if (scrub.scope.startsWith("folder:")) {
        desktopPageTrackScrub = null;
        folderPageTrackScrub = scrub;
      } else {
        desktopPageTrackScrub = scrub;
        folderPageTrackScrub = null;
      }
      requestSceneRender();
    }
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
      if (command.scope.startsWith("folder:")) {
        if (command.scope === `folder:${folderFlow.snapshot().renderedFolder?.id}`) {
          setFolderPageIndex(command.pageIndex);
        }
      } else {
        commitDesktopPage(command.pageIndex);
      }
    }
    if (Object.prototype.hasOwnProperty.call(output, "deadline")) {
      scheduleWheelDeadline(output.deadline);
    }
    if (output.handled) {
      event?.preventDefault();
      event?.stopPropagation();
    }
  };
  const onWheel = (event: FederatedWheelEvent): void => {
    if(isInteractionBlocked())return;
    if(getSettingsShell()||management.modal || searchBar.input.focused || getEditing()?.drag.isDragActive())return;
    const folder = folderFlow.snapshot();
    if (folder.renderedFolder && folder.isClosing) {
      event.preventDefault();
      return;
    }
    const scope = folder.renderedFolder ? `folder:${folder.renderedFolder.id}` : "desktop";
    const pageIndex = folder.renderedFolder
      ? folder.folderPageIndex
      : getDesktopPageIndex();
    const pageCount = folder.renderedFolder
      ? folder.renderedFolder.childPages.length
      : getDesktopPageCount();
    const timeStamp = Number(event.timeStamp);
    const time = Number.isFinite(timeStamp) && timeStamp >= 0 ? timeStamp : performance.now();
    const touchpad=readNativeTouchpad(event);
    applyWheelOutput(wheelGestures.dispatch({
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
    }), event, time);
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
    const target = resolveNativePointerTarget(event.target);
    if (type === "pointerDown" && event.button === 0 && target.kind === "surface"
      && (event.nativeEvent as { activatesWindow?: boolean } | null)?.activatesWindow) {
      // This click already activated the HWND; do not also start a blank-dismiss gesture.
      event.stopPropagation();return;
    }
    const itemId = target.kind === "icon" ? target.id : undefined;
    if(type === "pointerDown" && target.kind === "control") return;
    // Closing residuals keep their original reopen handler; desktop icons use the desktop scope.
    if(type === "pointerDown" && folderFlow.snapshot().isClosing && (!itemId || !getActivePageItems().some(item=>item.id===itemId))) return;
    if(type === "pointerDown" && !itemId && scope.area === "folder") return;
    if(type === "pointerDown" && management.modal) return;
    if(type === "pointerDown" && getSettingsShell()) return;
    pointerShiftKey=event.shiftKey;
    const output = wheelGestures.dispatch({ type, pointerId: event.pointerId, pointerType: event.pointerType,
      isPrimary: event.isPrimary, button: event.button, buttons: event.buttons,
      x: event.global.x, y: event.global.y, time: event.timeStamp,
      target: itemId ? { kind: "icon", id: itemId } : { kind: "surface" },
      dragOnHold: getEditing()?.selection.isActive.value === true,
      viewport: { scope: scope.area === "folder" ? `folder:${scope.folderId}` : scope.area,
        pageIndex: scope.pageIndex,
        pageCount: scope.area === "folder" ? folderFlow.snapshot().renderedFolder!.childPages.length : getDesktopPageCount(),
        pageWidth: scene.getPageWidth(scope.area === "folder" ? `folder:${scope.folderId}` : scope.area, scope.pageIndex, app.contentSize.width) },
    });
    if (output.ownsPointer) {
      touchId = event.pointerId;
      clearWheelPresentation();
      app.nativeInput.capturePointer(event.pointerId);
    }
    applyWheelOutput(output, null, event.timeStamp);
    event.stopPropagation();
  };
  const touchDown = (event: FederatedPointerEvent) => touch("pointerDown", event);
  const touchMove = (event: FederatedPointerEvent) => touch("pointerMove", event);
  const touchUp = (event: FederatedPointerEvent) => touch("pointerUp", event);
  const touchCancel = (event: FederatedPointerEvent) => touch("pointerCancel", event);
  const offWheel = () => {app.stage.off("wheel", onWheel);app.stage.off("wheelcapture",guardTouchpadRoute);};
  const offTouch = () => {
    app.stage.off("pointerdowncapture", touchDown);
    app.stage.off("globalpointermove", touchMove);
    app.stage.off("pointerupcapture", touchUp);
    app.stage.off("pointerupoutside", touchUp);
    app.stage.off("pointercancel", touchCancel);
    cancelGesture();
  };
  const offWheelPointerInterrupt = () => app.stage.off("pointerdowncapture", interruptWheel);
  app.stage.on("wheelcapture",guardTouchpadRoute);
  app.stage.on("wheel", onWheel);
  app.stage.on("pointerdowncapture", touchDown);
  app.stage.on("globalpointermove", touchMove);
  app.stage.on("pointerupcapture", touchUp);
  app.stage.on("pointerupoutside", touchUp);
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
    cancelGesture,
    clearPresentation: clearWheelPresentation,
    dispose,
    interruptWheel,
    readPageTrackScrub: () => scrubView,
    readTouchId: () => touchId,
  });
}
