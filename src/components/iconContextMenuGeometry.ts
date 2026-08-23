import type { Ref } from "vue";
import type { ReadonlyLaunchpadItem } from "../domain/launchpadLayout.js";
import type { LaunchSource } from "../domain/input/launchpadPointerTarget.js";

export const ICON_CONTEXT_MENU_VIEWPORT_MARGIN = 8;

export type IconContextMenuPointerEvent = Readonly<{
  clientX?: number | undefined;
  clientY?: number | undefined;
  preventDefault?: (() => void) | undefined;
  stopPropagation?: (() => void) | undefined;
}>;

export type IconContextMenuSurfaceCapabilities = Readonly<{
  canScan?: boolean | Readonly<Ref<boolean>>;
  isScanning?: boolean | Readonly<Ref<boolean>>;
}>;

export type IconContextMenuActionName =
  | "batch-manage"
  | "compact-pages"
  | "dissolve"
  | "edit"
  | "exclude-from-scan"
  | "open"
  | "open-settings"
  | "remove-from-launchpad"
  | "rename"
  | "scan-apps";

export type IconContextMenuActionPayload =
  | Readonly<{
      action: IconContextMenuActionName;
      folderId: null;
      item: ReadonlyLaunchpadItem;
      kind: "icon";
      source: LaunchSource;
    }>
  | Readonly<{
      action: IconContextMenuActionName;
      folderId: null;
      item: null;
      kind: "surface";
      source: null;
    }>
  | Readonly<{
      action: IconContextMenuActionName;
      folderId: string;
      item: null;
      kind: "folder-surface";
      source: null;
    }>;

export type LaunchpadOverlaysExpose = Readonly<{
  closeContextMenu: () => boolean;
  openFolderSurfaceContextMenu: (
    event: IconContextMenuPointerEvent,
    folderId: string,
  ) => boolean;
  openIconContextMenu: (
    event: IconContextMenuPointerEvent,
    item: ReadonlyLaunchpadItem,
    source: LaunchSource,
  ) => boolean;
  openSurfaceContextMenu: (
    event: IconContextMenuPointerEvent,
    capabilities?: IconContextMenuSurfaceCapabilities,
  ) => boolean;
}>;

export type IconContextMenuPositionOptions = Readonly<{
  anchorX?: unknown;
  anchorY?: unknown;
  margin?: unknown;
  menuHeight?: unknown;
  menuWidth?: unknown;
  viewportHeight?: unknown;
  viewportWidth?: unknown;
}>;

export type IconContextMenuPosition = Readonly<{ x: number; y: number }>;

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampIconContextMenuPosition(
  options: IconContextMenuPositionOptions = {},
): IconContextMenuPosition {
  const margin = Math.max(0, finiteNumber(options.margin, ICON_CONTEXT_MENU_VIEWPORT_MARGIN));
  const menuWidth = Math.max(0, finiteNumber(options.menuWidth));
  const menuHeight = Math.max(0, finiteNumber(options.menuHeight));
  const viewportWidth = Math.max(0, finiteNumber(options.viewportWidth));
  const viewportHeight = Math.max(0, finiteNumber(options.viewportHeight));
  const maxX = Math.max(margin, viewportWidth - menuWidth - margin);
  const maxY = Math.max(margin, viewportHeight - menuHeight - margin);
  return {
    x: Math.min(Math.max(finiteNumber(options.anchorX), margin), maxX),
    y: Math.min(Math.max(finiteNumber(options.anchorY), margin), maxY),
  };
}
