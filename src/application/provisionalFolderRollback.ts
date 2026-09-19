import type { StateHost } from "./stateHost.js";
import type {
  LaunchpadApp,
  LaunchpadItem,
  LaunchpadPages,
  ReadonlyLaunchpadApp,
  ReadonlyLaunchpadItem,
  Rect,
} from "../domain/launchpadLayout.js";

type RollbackRectInput = Readonly<Pick<Rect, "height" | "left" | "top" | "width"> &
  Partial<Pick<Rect, "bottom" | "right">>>;

export type ProvisionalFolderRollbackRequest = Readonly<{
  folderId: string;
  previewSlotIndex?: number;
  projectedPages: LaunchpadPages;
  reducedMotion?: boolean;
  targetIndex: number;
  targetItem: ReadonlyLaunchpadApp;
  targetPageIndex: number;
  targetRect?: RollbackRectInput | null;
}>;

export type ProvisionalFolderRollbackPresentation = Readonly<{
  folderId: string;
  handoffVelocity: number;
  phase: "closing" | "dissolving";
  previewSlotIndex: number;
  reducedMotion: boolean;
  targetAppId: string;
  targetIndex: number;
  targetItem: LaunchpadApp;
  targetPageIndex: number;
  targetRect: Readonly<Rect> | null;
  token: number;
}>;

export type ProvisionalFolderRollbackOptions = Readonly<{
  cloneItem: (item: ReadonlyLaunchpadItem) => LaunchpadItem;
}>;

function cloneRect(rect: RollbackRectInput | null | undefined): Readonly<Rect> | null {
  if (!rect) return null;
  const left = Number(rect.left) || 0;
  const top = Number(rect.top) || 0;
  const width = Number(rect.width) || 0;
  const height = Number(rect.height) || 0;
  return Object.freeze({
    bottom: Number(rect.bottom) || top + height,
    height,
    left,
    right: Number(rect.right) || left + width,
    top,
    width,
  });
}

function requireId(value: unknown, label: string): string {
  const id = String(value || "").trim();
  if (!id) throw new TypeError(`${label} must be a non-empty id`);
  return id;
}

export function createProvisionalFolderRollback(options: ProvisionalFolderRollbackOptions, host: StateHost) {
  const { cell: shallowRef, derived: computed } = host;
  if (typeof options.cloneItem !== "function") {
    throw new TypeError("useProvisionalFolderRollback requires cloneItem");
  }
  const projectedPages = shallowRef<LaunchpadPages | null>(null);
  const presentation = shallowRef<ProvisionalFolderRollbackPresentation | null>(null);
  const isActive = computed(() => presentation.value !== null);
  let nextToken = 0;

  function begin(request: ProvisionalFolderRollbackRequest): number {
    if (presentation.value) {
      throw new Error(`Provisional folder rollback ${presentation.value.token} is still active`);
    }
    const folderId = requireId(request.folderId, "Provisional folder rollback folderId");
    const targetItem = request.targetItem;
    const targetAppId = requireId(targetItem?.id, "Provisional folder rollback target item");
    const clonedTargetItem = options.cloneItem(targetItem);
    if (clonedTargetItem.type !== "app") {
      throw new TypeError(`Provisional folder rollback cloneItem changed app ${targetAppId} into a folder`);
    }
    if (!Array.isArray(request.projectedPages)) {
      throw new TypeError("Provisional folder rollback requires projectedPages");
    }
    const token = ++nextToken;
    projectedPages.value = request.projectedPages;
    presentation.value = Object.freeze({
      folderId,
      handoffVelocity: 0,
      phase: "closing",
      previewSlotIndex: Math.max(0, Math.trunc(Number(request.previewSlotIndex) || 0)),
      reducedMotion: request.reducedMotion === true,
      targetAppId,
      targetIndex: Math.max(0, Math.trunc(Number(request.targetIndex) || 0)),
      targetItem: Object.freeze(clonedTargetItem),
      targetPageIndex: Math.max(0, Math.trunc(Number(request.targetPageIndex) || 0)),
      targetRect: cloneRect(request.targetRect),
      token,
    });
    return token;
  }

  function beginDissolve(
    folderId: string,
    options: Readonly<{ handoffVelocity?: number }> = {},
  ): boolean {
    const current = presentation.value;
    if (!current || current.folderId !== folderId) return false;
    if (current.phase === "dissolving") return true;
    const velocity = Number(options.handoffVelocity);
    projectedPages.value = null;
    presentation.value = Object.freeze({
      ...current,
      handoffVelocity: Number.isFinite(velocity) ? Math.max(0, velocity) : 0,
      phase: "dissolving",
    });
    return true;
  }

  function complete(token: number): boolean {
    const current = presentation.value;
    if (!current || current.phase !== "dissolving" || current.token !== token) return false;
    projectedPages.value = null;
    presentation.value = null;
    return true;
  }

  function dispose(): void {
    projectedPages.value = null;
    presentation.value = null;
  }

  return {
    begin,
    beginDissolve,
    complete,
    dispose,
    isActive,
    presentation,
    projectedPages,
  };
}
