import type { IconTextureItem } from "./pixi/assets/iconTextureRepository.js";

type UnknownRecord = Record<string, unknown>;

export type DesktopSceneRuntime = Readonly<{
  completeProvisionalFolderRollback: (token: number) => unknown;
  domRefs: UnknownRecord;
  folderOverlayState: UnknownRecord;
  getDesktopPageRenderMode: (pageIndex: number) => unknown;
  getIconTextureItems: () => readonly IconTextureItem[];
  getVisibleDesktopPage: (page: readonly unknown[]) => readonly unknown[];
  iconBoundsRegistry: UnknownRecord;
  isFolderOpeningPreviewFrameGhosted: (folderId: string) => boolean;
  isIconOpening: (...args: unknown[]) => boolean;
  liveDesktopDiagnosticsPort: UnknownRecord | null;
  setPageRef: (...args: unknown[]) => unknown;
}>;

function requireObject(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as UnknownRecord;
}

function requireFunction<FunctionType>(value: unknown, path: string): FunctionType {
  if (typeof value !== "function") throw new TypeError(`${path} must be a function`);
  return value as FunctionType;
}

export function makeDesktopSceneRuntimeAdapter(input: unknown = {}): DesktopSceneRuntime {
  const source = requireObject(input, "DesktopSceneRuntime");
  const runtime: DesktopSceneRuntime = {
    completeProvisionalFolderRollback: requireFunction(
      source.completeProvisionalFolderRollback,
      "DesktopSceneRuntime.completeProvisionalFolderRollback",
    ),
    domRefs: requireObject(source.domRefs, "DesktopSceneRuntime.domRefs"),
    folderOverlayState: requireObject(source.folderOverlayState, "DesktopSceneRuntime.folderOverlayState"),
    getDesktopPageRenderMode: requireFunction(source.getDesktopPageRenderMode, "DesktopSceneRuntime.getDesktopPageRenderMode"),
    getIconTextureItems: requireFunction(source.getIconTextureItems, "DesktopSceneRuntime.getIconTextureItems"),
    getVisibleDesktopPage: requireFunction(source.getVisibleDesktopPage, "DesktopSceneRuntime.getVisibleDesktopPage"),
    iconBoundsRegistry: requireObject(source.iconBoundsRegistry, "DesktopSceneRuntime.iconBoundsRegistry"),
    isFolderOpeningPreviewFrameGhosted: requireFunction(
      source.isFolderOpeningPreviewFrameGhosted,
      "DesktopSceneRuntime.isFolderOpeningPreviewFrameGhosted",
    ),
    isIconOpening: requireFunction(source.isIconOpening, "DesktopSceneRuntime.isIconOpening"),
    setPageRef: requireFunction(source.setPageRef, "DesktopSceneRuntime.setPageRef"),
    liveDesktopDiagnosticsPort: source.liveDesktopDiagnosticsPort == null
      ? null
      : requireObject(source.liveDesktopDiagnosticsPort, "DesktopSceneRuntime.liveDesktopDiagnosticsPort"),
  };
  return Object.freeze(runtime);
}

export function assertDesktopSceneRuntime(runtime: unknown): asserts runtime is DesktopSceneRuntime {
  makeDesktopSceneRuntimeAdapter(runtime);
}
