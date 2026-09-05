import type { MotionControl } from "../pixi/animation/motionTween.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import { motionRuntime } from "../pixi/animation/motionRuntime.js";
import { motionSprings } from "../pixi/animation/motionPresets.js";
import type { SceneFocusedIcon, SceneItem } from "../sceneFrame.js";

const FOLDER_PROGRESS_LANE_KEY = "native-folder-open-progress";

export type NativeFolderItem = SceneItem & Readonly<{
  childPages: readonly (readonly (SceneItem | null)[])[];
  name?: string;
  type: "folder";
}>;

export type NativeFolderPresentation = Readonly<{
  focusedIcon: SceneFocusedIcon | null;
  folderPageIndex: number;
  isClosing: boolean;
  openProgress: number;
  openProgressTarget: number;
  renderedFolder: NativeFolderItem | null;
}>;

export type NativeFolderFlow = Readonly<{
  close(): boolean;
  destroy(): void;
  notifyInternalActivity(active: boolean, folderId: string | null): void;
  open(item: SceneItem): boolean;
  setPageIndex(pageIndex: number): boolean;
  snapshot(): NativeFolderPresentation;
  turnPage(direction: -1 | 1): boolean;
}>;

function requireFolder(item: SceneItem): NativeFolderItem {
  if (item.type !== "folder" || !Array.isArray(item.childPages)) {
    throw new TypeError(`Native folder ${item.id} must contain childPages`);
  }
  item.childPages.forEach((page, pageIndex) => {
    if (!Array.isArray(page)) throw new TypeError(`Native folder ${item.id} childPages[${pageIndex}] must be an array`);
  });
  return item as NativeFolderItem;
}

function firstItem(folder: NativeFolderItem | null, pageIndex: number): SceneItem | null {
  return folder?.childPages[pageIndex]?.find((item): item is SceneItem => item !== null) ?? null;
}

export function createNativeFolderFlow(
  onChange: (presentation: NativeFolderPresentation) => void,
): NativeFolderFlow {
  if (typeof onChange !== "function") throw new TypeError("createNativeFolderFlow requires onChange");
  const progress = { value: 0 };
  let control: MotionControl | null = null;
  let destroyed = false;
  let epoch = 0;
  let renderedFolder: NativeFolderItem | null = null;
  let folderPageIndex = 0;
  let openProgressTarget = 0;
  let isClosing = false;
  let closeProgressArrived = false;
  let internalActivity = false;
  let closingHandoffStarted = false;
  let closingHandoffFinished = false;
  let closeFinishScheduled = false;

  const snapshot = (): NativeFolderPresentation => {
    const focusedItem = firstItem(renderedFolder, folderPageIndex);
    return Object.freeze({
      focusedIcon: focusedItem && renderedFolder
        ? Object.freeze({
          area: "folder",
          folderId: renderedFolder.id,
          id: focusedItem.id,
          pageIndex: folderPageIndex,
        })
        : null,
      folderPageIndex,
      isClosing,
      openProgress: progress.value,
      openProgressTarget,
      renderedFolder,
    });
  };
  const publish = (): void => {
    if (!destroyed) onChange(snapshot());
  };
  const clearAfterClosingFrame = (motionEpoch: number): void => {
    if (
      closeFinishScheduled
      || !closeProgressArrived
      || internalActivity
      || !closingHandoffStarted
      || !closingHandoffFinished
    ) return;
    closeFinishScheduled = true;
    motionRuntime.afterFrame(() => {
      closeFinishScheduled = false;
      if (
        destroyed
        || motionEpoch !== epoch
        || openProgressTarget !== 0
        || !closeProgressArrived
        || internalActivity
        || !closingHandoffStarted
        || !closingHandoffFinished
      ) return;
      renderedFolder = null;
      folderPageIndex = 0;
      isClosing = false;
      closeProgressArrived = false;
      publish();
    });
  };
  const animateProgress = (target: 0 | 1): void => {
    const motionEpoch = ++epoch;
    control?.cancel("native-folder-retarget");
    openProgressTarget = target;
    control = motion(progress)
      .spring({ ...motionSprings.folderPanelOpen, arriveDelta: 0.01 })
      .lane("base", FOLDER_PROGRESS_LANE_KEY)
      .interrupt("retarget")
      .to({
        onArrive: () => {
          if (destroyed || motionEpoch !== epoch || openProgressTarget !== target) return;
          control = null;
          if (target === 0) {
            closeProgressArrived = true;
            clearAfterClosingFrame(motionEpoch);
          }
        },
        onUpdate: publish,
        value: target,
      })
      .start();
  };

  const close = (): boolean => {
    if (destroyed || !renderedFolder || isClosing || openProgressTarget !== 1 || progress.value < 0.999) return false;
    isClosing = true;
    closeProgressArrived = false;
    closingHandoffStarted = false;
    closingHandoffFinished = false;
    closeFinishScheduled = false;
    openProgressTarget = 0;
    publish();
    animateProgress(0);
    return true;
  };
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    epoch += 1;
    control?.cancel("destroyed");
    control = null;
    killMotionOf(progress, "value", {
      lane: "base",
      laneKey: FOLDER_PROGRESS_LANE_KEY,
      reason: "destroyed",
    });
  };
  const open = (item: SceneItem): boolean => {
    if (destroyed) throw new Error("Native folder flow has been destroyed");
    const folder = requireFolder(item);
    if (renderedFolder) return false;
    renderedFolder = folder;
    folderPageIndex = 0;
    isClosing = false;
    closeProgressArrived = false;
    closingHandoffStarted = false;
    closingHandoffFinished = false;
    closeFinishScheduled = false;
    internalActivity = false;
    progress.value = 0;
    openProgressTarget = 1;
    publish();
    animateProgress(1);
    return true;
  };
  const setPageIndex = (pageIndex: number): boolean => {
    if (destroyed || !renderedFolder || isClosing) return false;
    if (!Number.isInteger(pageIndex)) return false;
    const next = Math.max(0, Math.min(renderedFolder.childPages.length - 1, pageIndex));
    if (next === folderPageIndex) return false;
    folderPageIndex = next;
    publish();
    return true;
  };
  const notifyInternalActivity = (active: boolean, folderId: string | null): void => {
    if (destroyed || !renderedFolder || (folderId && folderId !== renderedFolder.id)) return;
    internalActivity = active;
    if (isClosing && active) closingHandoffStarted = true;
    if (isClosing && !active && closingHandoffStarted) closingHandoffFinished = true;
    if (!active && isClosing) clearAfterClosingFrame(epoch);
  };

  return Object.freeze({
    close,
    destroy,
    notifyInternalActivity,
    open,
    setPageIndex,
    snapshot,
    turnPage(direction: -1 | 1): boolean {
      return setPageIndex(folderPageIndex + direction);
    },
  });
}
