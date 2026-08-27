import { computed, shallowRef } from "vue";
import { cloneLaunchpadApp } from "../domain/launchpadClone.js";
import type {
  LaunchpadApp,
  LaunchpadItem,
  ReadonlyLaunchpadApp,
  ReadonlyLaunchpadFolder,
  ReadonlyLaunchpadItem,
} from "../domain/launchpadLayout.js";

export type FolderIconGhostOptions = Readonly<{
  cloneItem?: (item: ReadonlyLaunchpadItem) => LaunchpadItem;
  folderPreviewSlots?: (folder: ReadonlyLaunchpadFolder) => readonly (ReadonlyLaunchpadApp | null)[];
}>;

export type CapturedFolderIconGhost = Readonly<{
  item: LaunchpadApp;
  previewSlotIndex: number | undefined;
  slotIndex: number;
  synthetic: boolean;
}>;

export type PublishedFolderIconGhost = Readonly<{
  item: LaunchpadApp;
  key: string;
  previewSlotIndex: number | null;
  requestId: number;
  slotIndex: number;
  synthetic: boolean;
}>;

export type FolderOpenIconGhostSession = Readonly<{
  folderId: string | null;
  frameCompleted: boolean;
  requestId: number;
  status: "accepted" | "frame-complete" | "staged";
}>;

export type FolderCloseIconGhostSession = Readonly<{
  folderId: string | null;
  requestId: number;
  status: "presented" | "staged";
}>;

function makeFolderOpenIconGhostedKey(folderId: string | null | undefined, childId: string): string {
  return `${folderId || ""}:${childId || ""}`;
}

function cloneGhostItem(item: ReadonlyLaunchpadApp, options: FolderIconGhostOptions): LaunchpadApp {
  const cloned = typeof options.cloneItem === "function" ? options.cloneItem(item) : cloneLaunchpadApp(item);
  if (cloned.type !== "app") throw new TypeError(`Folder icon ghost clone changed item type for ${item.id}`);
  return cloned;
}

function getPreviewSlotIndexById(folder: ReadonlyLaunchpadFolder, options: FolderIconGhostOptions): Map<string, number> {
  const slots = typeof options.folderPreviewSlots === "function" ? options.folderPreviewSlots(folder) || [] : [];
  const result = new Map<string, number>();
  slots.forEach((child, index) => {
    if (child?.id && !result.has(child.id)) result.set(child.id, index);
  });
  return result;
}

function makeCapturedGhost(
  folderId: string,
  item: ReadonlyLaunchpadApp | null | undefined,
  slotIndex: number,
  previewSlotIndex: number | undefined,
  options: FolderIconGhostOptions,
): CapturedFolderIconGhost | null {
  if (!folderId || !item?.id) return null;
  return {
    item: cloneGhostItem(item, options),
    previewSlotIndex,
    slotIndex,
    synthetic: previewSlotIndex == null,
  };
}

function captureFolderIconGhosts(
  folder: ReadonlyLaunchpadFolder | null | undefined,
  children: readonly (ReadonlyLaunchpadApp | null | undefined)[],
  options: FolderIconGhostOptions,
): CapturedFolderIconGhost[] {
  if (!folder?.id || !Array.isArray(children)) return [];
  const previewSlotById = getPreviewSlotIndexById(folder, options);
  return children
    .map((child, slotIndex) => makeCapturedGhost(folder.id, child, slotIndex, previewSlotById.get(child?.id), options))
    .filter((ghost): ghost is CapturedFolderIconGhost => ghost !== null);
}

function publishFolderIconGhosts(
  folderId: string | null,
  capturedGhosts: readonly CapturedFolderIconGhost[],
  requestId: number,
  kind: "close" | "open",
): PublishedFolderIconGhost[] {
  return capturedGhosts
    .filter((ghost) => ghost?.item?.id)
    .map((ghost) => ({
      item: ghost.item,
      key: `${folderId || ""}-${ghost.item.id}-${ghost.slotIndex}-${kind}-${requestId}`,
      previewSlotIndex: ghost.previewSlotIndex ?? null,
      requestId,
      slotIndex: ghost.slotIndex,
      synthetic: Boolean(ghost.synthetic),
    }));
}

export function useFolderOpenIconGhosts(options: FolderIconGhostOptions = {}) {
  const folderOpenIconGhosts = shallowRef<PublishedFolderIconGhost[]>([]);
  const folderOpenIconGhostSession = shallowRef<FolderOpenIconGhostSession | null>(null);
  const folderOpenIconGhostedKeys = shallowRef<Set<string>>(new Set());
  const folderOpenPreviewFrameGhostedIds = shallowRef<Set<string>>(new Set());
  const folderCloseIconGhosts = shallowRef<PublishedFolderIconGhost[]>([]);
  const folderCloseIconGhostSession = shallowRef<FolderCloseIconGhostSession | null>(null);
  const folderCloseIconGhostedKeys = shallowRef<Set<string>>(new Set());
  const isFolderOpenFrameGhostPending = shallowRef(false);
  const isFolderOpenIconAnimationActive = computed(() => folderOpenIconGhostedKeys.value.size > 0);
  const isFolderCloseIconAnimationActive = computed(() => folderCloseIconGhostedKeys.value.size > 0);
  const completedFolderOpenIconGhostKeys = new Set<string>();
  const completedFolderCloseIconGhostKeys = new Set<string>();
  let folderOpenIconGhostRequestId = 0;
  let folderCloseIconGhostRequestId = 0;

  function clearFolderOpenIconGhosts(): void {
    folderOpenIconGhostRequestId += 1;
    completedFolderOpenIconGhostKeys.clear();
    folderOpenIconGhosts.value = [];
    folderOpenIconGhostSession.value = null;
    folderOpenIconGhostedKeys.value = new Set();
    folderOpenPreviewFrameGhostedIds.value = new Set();
    isFolderOpenFrameGhostPending.value = false;
  }

  function finishFolderOpenIconGhosts(): void {
    completedFolderOpenIconGhostKeys.clear();
    folderOpenIconGhosts.value = [];
    folderOpenIconGhostedKeys.value = new Set();
    if (folderOpenIconGhostSession.value?.frameCompleted === true) {
      folderOpenIconGhostSession.value = null;
    }
  }

  function clearFolderCloseIconGhosts(): void {
    folderCloseIconGhostRequestId += 1;
    completedFolderCloseIconGhostKeys.clear();
    folderCloseIconGhosts.value = [];
    folderCloseIconGhostSession.value = null;
    folderCloseIconGhostedKeys.value = new Set();
  }

  function completeFolderOpenIconGhost(key: string): void {
    const ghost = folderOpenIconGhosts.value.find((candidate) => candidate.key === key);
    if (!ghost || ghost.requestId !== folderOpenIconGhostRequestId) return;

    completedFolderOpenIconGhostKeys.add(key);
    if (completedFolderOpenIconGhostKeys.size < folderOpenIconGhosts.value.length) return;

    finishFolderOpenIconGhosts();
  }

  function completeFolderOpenFrameGhost(folderId: string, requestId: number): boolean {
    if (requestId !== folderOpenIconGhostRequestId) return false;
    const session = folderOpenIconGhostSession.value;
    if (!session || session.status !== "accepted" || session.folderId !== folderId) return false;
    if (session.requestId !== requestId) return false;
    if (folderId && !folderOpenPreviewFrameGhostedIds.value.has(folderId)) return false;
    folderOpenIconGhostSession.value = {
      ...session,
      frameCompleted: true,
      status: "frame-complete",
    };
    folderOpenPreviewFrameGhostedIds.value = new Set();
    isFolderOpenFrameGhostPending.value = false;
    if (folderOpenIconGhosts.value.length === 0) folderOpenIconGhostSession.value = null;
    return true;
  }

  function completeFolderCloseIconGhost(key: string): boolean {
    const ghost = folderCloseIconGhosts.value.find((candidate) => candidate.key === key);
    if (!ghost || ghost.requestId !== folderCloseIconGhostRequestId) return false;

    completedFolderCloseIconGhostKeys.add(key);
    if (completedFolderCloseIconGhostKeys.size < folderCloseIconGhosts.value.length) return false;

    clearFolderCloseIconGhosts();
    return true;
  }

  function commitFolderCloseIconGhostPresentation(folderId: string | null, requestId: number): boolean {
    const session = folderCloseIconGhostSession.value;
    if (!session || session.status !== "staged") return false;
    if (session.folderId !== (folderId || null) || session.requestId !== requestId) return false;
    folderCloseIconGhostSession.value = {
      ...session,
      status: "presented",
    };
    return true;
  }

  function captureFolderPreviewIconGhosts(
    folder: ReadonlyLaunchpadFolder | null | undefined,
    openingChildren: readonly (ReadonlyLaunchpadApp | null | undefined)[],
  ): CapturedFolderIconGhost[] {
    return captureFolderIconGhosts(folder, openingChildren, options);
  }

  function captureFolderCloseIconGhosts(
    folder: ReadonlyLaunchpadFolder | null | undefined,
    closingChildren: readonly (ReadonlyLaunchpadApp | null | undefined)[],
  ): CapturedFolderIconGhost[] {
    return captureFolderIconGhosts(folder, closingChildren, options);
  }

  function playFolderOpenIconGhosts(folderId: string, capturedGhosts: readonly CapturedFolderIconGhost[]): void {
    const requestId = (folderOpenIconGhostRequestId += 1);
    completedFolderOpenIconGhostKeys.clear();
    const ghosts = publishFolderIconGhosts(folderId, capturedGhosts, requestId, "open");
    folderOpenIconGhostSession.value = ghosts.length
      ? {
        folderId: folderId || null,
        frameCompleted: false,
        requestId,
        status: "staged",
      }
      : null;
    folderOpenIconGhosts.value = ghosts;
    folderOpenIconGhostedKeys.value = new Set(ghosts.map((ghost) => makeFolderOpenIconGhostedKey(folderId, ghost.item.id)));
    folderOpenPreviewFrameGhostedIds.value = new Set();
    isFolderOpenFrameGhostPending.value = ghosts.length > 0;
  }

  function acceptFolderOpenIconGhostSession(folderId: string, requestId: number): boolean {
    const session = folderOpenIconGhostSession.value;
    if (!session || session.status !== "staged") return false;
    if (session.folderId !== (folderId || null) || session.requestId !== requestId) return false;
    folderOpenIconGhostSession.value = {
      ...session,
      status: "accepted",
    };
    if (folderId) folderOpenPreviewFrameGhostedIds.value = new Set([folderId]);
    return true;
  }

  function playFolderCloseIconGhosts(
    folderId: string | null | undefined,
    capturedGhosts: readonly CapturedFolderIconGhost[],
  ): void {
    const requestId = (folderCloseIconGhostRequestId += 1);
    completedFolderCloseIconGhostKeys.clear();
    const normalizedFolderId = folderId || null;
    const ghosts = publishFolderIconGhosts(normalizedFolderId, capturedGhosts, requestId, "close");
    folderCloseIconGhostSession.value = ghosts.length
      ? {
        folderId: normalizedFolderId,
        requestId,
        status: "staged",
      }
      : null;
    folderCloseIconGhosts.value = ghosts;
    folderCloseIconGhostedKeys.value = new Set(ghosts.map((ghost) => makeFolderOpenIconGhostedKey(normalizedFolderId, ghost.item.id)));
  }

  function isFolderOpeningIconGhosted(folderId: string, childId: string): boolean {
    return folderOpenIconGhostedKeys.value.has(makeFolderOpenIconGhostedKey(folderId, childId));
  }

  function isFolderClosingIconGhosted(folderId: string, childId: string): boolean {
    return folderCloseIconGhostedKeys.value.has(makeFolderOpenIconGhostedKey(folderId, childId));
  }

  function isFolderOpeningPreviewFrameGhosted(folderId: string): boolean {
    return folderOpenPreviewFrameGhostedIds.value.has(folderId);
  }

  return {
    captureFolderCloseIconGhosts,
    captureFolderPreviewIconGhosts,
    acceptFolderOpenIconGhostSession,
    clearFolderCloseIconGhosts,
    clearFolderOpenIconGhosts,
    commitFolderCloseIconGhostPresentation,
    completeFolderOpenFrameGhost,
    completeFolderCloseIconGhost,
    completeFolderOpenIconGhost,
    folderCloseIconGhosts,
    folderCloseIconGhostSession,
    folderOpenIconGhosts,
    folderOpenIconGhostSession,
    folderOpenPreviewFrameGhostedIds,
    isFolderCloseIconAnimationActive,
    isFolderClosingIconGhosted,
    isFolderOpenFrameGhostPending,
    isFolderOpenIconAnimationActive,
    isFolderOpeningIconGhosted,
    isFolderOpeningPreviewFrameGhosted,
    playFolderCloseIconGhosts,
    playFolderOpenIconGhosts,
  };
}
