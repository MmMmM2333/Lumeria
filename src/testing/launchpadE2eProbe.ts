import type { ReadonlyLaunchpadPages } from "../domain/launchpadLayout.js";
import type { IconBoundsRect } from "../rendering/desktopScenePort.js";

export const LAUNCHPAD_E2E_PROBE_NAME = "__LUMERIA_E2E__";

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Element)[]
    ? readonly DeepReadonly<Element>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type FunctionValue = (...args: never[]) => unknown;

type LaunchpadE2EDragState = Readonly<{
  folderTransit?: Readonly<{ folderId?: string | null }> | null;
  outcome?: string | null;
  phase?: string | null;
}>;

type LaunchpadE2EFolderState = Readonly<{
  closing?: boolean;
  layerActive?: boolean;
  openFolderId?: string | null;
  renderedFolderId?: string | null;
}>;

type LaunchpadE2EHoverState = Readonly<{
  phase?: string | null;
  targetId?: string | null;
  targetType?: string | null;
}>;

type LaunchpadE2ERollbackState = Readonly<{
  folderId?: string | null;
  handoffVelocity?: unknown;
  phase?: string | null;
  targetAppId?: string | null;
  token?: unknown;
}>;

export type LaunchpadE2ESnapshotState = Readonly<{
  authoritativePages?: ReadonlyLaunchpadPages | null;
  drag?: LaunchpadE2EDragState | null;
  folder?: LaunchpadE2EFolderState | null;
  hover?: LaunchpadE2EHoverState | null;
  renderedPages?: ReadonlyLaunchpadPages | null;
  rollback?: LaunchpadE2ERollbackState | null;
  visual?: unknown;
}>;

export type LaunchpadE2EProbeOptions = Readonly<{
  getIconBounds: (id: string) => IconBoundsRect | null;
  getSnapshotState: () => LaunchpadE2ESnapshotState;
}>;

type LaunchpadE2EProbe = Readonly<{
  getIconBounds: (id: unknown) => Readonly<IconBoundsRect>;
  snapshot: () => Readonly<Record<string, unknown>>;
  version: 1;
}>;

declare global {
  interface Window {
    __LUMERIA_E2E__?: LaunchpadE2EProbe;
  }
}

function requireFunction<T extends FunctionValue>(value: T | undefined, label: string): T {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
  return value;
}

function cloneBounds(bounds: IconBoundsRect | null, id: string): Readonly<IconBoundsRect> {
  if (!bounds) throw new Error(`Rendered icon bounds are unavailable for ${id}`);
  const left = Number(bounds.left);
  const top = Number(bounds.top);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`Rendered icon bounds are invalid for ${id}`);
  }
  return Object.freeze({
    bottom: Number.isFinite(Number(bounds.bottom)) ? Number(bounds.bottom) : top + height,
    height,
    left,
    right: Number.isFinite(Number(bounds.right)) ? Number(bounds.right) : left + width,
    top,
    width,
  });
}

function deepFreeze<T>(value: T, seen = new Set<object>()): DeepReadonly<T> {
  if (!value || typeof value !== "object" || seen.has(value)) return value as DeepReadonly<T>;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value) as DeepReadonly<T>;
}

function cloneVisualSnapshot<T>(visual: T): DeepReadonly<T> | null {
  if (visual == null) return null;
  try {
    return deepFreeze(structuredClone(visual));
  } catch (error) {
    throw new Error("Launchpad E2E visual snapshot must be structured-cloneable", { cause: error });
  }
}

function makeLayoutSnapshot(pages: ReadonlyLaunchpadPages | null | undefined) {
  return Object.freeze((pages || []).map((page) => Object.freeze((page || []).map((item) => {
    const snapshot: {
      childPages?: readonly (readonly Readonly<{ id: string | null; type: string | null }>[])[];
      id: string | null;
      type: string | null;
    } = {
      id: item?.id || null,
      type: item?.type || null,
    };
    if (item?.type === "folder") {
      snapshot.childPages = Object.freeze((item.childPages || []).map((childPage) => (
        Object.freeze((childPage || []).map((child) => Object.freeze({
          id: child?.id || null,
          type: child?.type || null,
        })))
      )));
    }
    return Object.freeze(snapshot);
  }))));
}

function makeSnapshot(state: LaunchpadE2ESnapshotState): Readonly<Record<string, unknown>> {
  if (!state || typeof state !== "object") {
    throw new TypeError("Launchpad E2E snapshot state must be an object");
  }
  const drag = state.drag;
  const folder = state.folder || {};
  const hover = state.hover;
  const rollback = state.rollback;
  return Object.freeze({
    drag: drag ? Object.freeze({
      folderTransitFolderId: drag.folderTransit?.folderId || null,
      outcome: drag.outcome || null,
      phase: drag.phase || null,
    }) : null,
    folder: Object.freeze({
      closing: folder.closing === true,
      layerActive: folder.layerActive === true,
      openFolderId: folder.openFolderId || null,
      renderedFolderId: folder.renderedFolderId || null,
    }),
    hover: hover ? Object.freeze({
      phase: hover.phase || null,
      targetId: hover.targetId || null,
      targetType: hover.targetType || null,
    }) : null,
    layout: makeLayoutSnapshot(state.authoritativePages),
    renderedLayout: makeLayoutSnapshot(state.renderedPages),
    rollback: rollback ? Object.freeze({
      folderId: rollback.folderId || null,
      handoffVelocity: Number(rollback.handoffVelocity) || 0,
      phase: rollback.phase || null,
      targetAppId: rollback.targetAppId || null,
      token: rollback.token ?? null,
    }) : null,
    visual: cloneVisualSnapshot(state.visual),
  });
}

export function installLaunchpadE2eProbe(
  options: Partial<LaunchpadE2EProbeOptions> = {},
): () => void {
  if (typeof window === "undefined") {
    throw new Error("Launchpad E2E probe requires a browser window");
  }
  const getIconBounds = requireFunction(options.getIconBounds, "Launchpad E2E getIconBounds");
  const getSnapshotState = requireFunction(
    options.getSnapshotState,
    "Launchpad E2E getSnapshotState",
  );
  if (window[LAUNCHPAD_E2E_PROBE_NAME]) {
    throw new Error("Launchpad E2E probe is already installed");
  }
  const probe: LaunchpadE2EProbe = Object.freeze({
    getIconBounds(id: unknown) {
      const iconId = String(id || "").trim();
      if (!iconId) throw new TypeError("Launchpad E2E icon id must be non-empty");
      return cloneBounds(getIconBounds(iconId), iconId);
    },
    snapshot() {
      return makeSnapshot(getSnapshotState());
    },
    version: 1,
  });
  Object.defineProperty(window, LAUNCHPAD_E2E_PROBE_NAME, {
    configurable: true,
    enumerable: false,
    value: probe,
    writable: false,
  });
  return () => {
    if (window[LAUNCHPAD_E2E_PROBE_NAME] === probe) {
      delete window[LAUNCHPAD_E2E_PROBE_NAME];
    }
  };
}
