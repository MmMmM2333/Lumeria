import { ref, type Ref } from "vue";
import { clamp } from "../domain/launchpadLayout.js";
import type { Rect } from "../domain/launchpadLayout.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../rendering/desktopScenePort.js";
import type { createIconBoundsRegistry } from "../rendering/desktopScenePort.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;

export type FolderMotionGeometry = Readonly<{
  borderRadius: number;
  id: string | null;
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}>;

type PageRectElement = Readonly<{
  getBoundingClientRect: () => Readonly<Rect>;
}>;

type IconBoundsRegistry = ReturnType<typeof createIconBoundsRegistry>;

export type FolderMotionGeometryOptions = Readonly<{
  folderPages: Readonly<Ref<readonly (readonly unknown[])[]>>;
  gridCols: Readonly<Ref<number>>;
  gridRows: Readonly<Ref<number>>;
  iconBoundsRegistry: IconBoundsRegistry;
  pageRefs: readonly (PageRectElement | null | undefined)[];
}>;

const DEFAULT_FOLDER_MOTION_GEOMETRY: FolderMotionGeometry = {
  id: null,
  x: 0,
  y: 36,
  scaleX: 0.1,
  scaleY: 0.16,
  borderRadius: 26,
};

export function useFolderMotionGeometry(options: FolderMotionGeometryOptions) {
  const folderMotionGeometry = ref(getFallbackFolderMotionGeometry(null));

  function getFolderPanelTargetSize(): Readonly<{ width: number; height: number }> {
    if (typeof window === "undefined") return { width: 760, height: 420 };
    const width = Math.min(760, window.innerWidth * 0.94);
    const hasFolderDots = options.folderPages.value.length > 1;
    const estimatedContentHeight = 28 * 2 + 62 + 18 + 268 + (hasFolderDots ? 26 : 0);
    const height = Math.min(Math.max(360, estimatedContentHeight), Math.max(280, window.innerHeight - 48));
    return { width, height };
  }

  function getFallbackFolderMotionGeometry(folderId: string | null): FolderMotionGeometry {
    return { ...DEFAULT_FOLDER_MOTION_GEOMETRY, id: folderId || null };
  }

  function makeFolderMotionGeometryFromRect(
    folderId: string | null,
    rect: Pick<Rect, "height" | "left" | "top" | "width"> | null,
  ): FolderMotionGeometry {
    if (!rect || typeof window === "undefined") return getFallbackFolderMotionGeometry(folderId);
    const target = getFolderPanelTargetSize();
    return {
      id: folderId || null,
      x: rect.left + rect.width / 2 - window.innerWidth / 2,
      y: rect.top + rect.height / 2 - window.innerHeight / 2,
      scaleX: clamp(rect.width / target.width, 0.06, 0.3),
      scaleY: clamp(rect.height / target.height, 0.08, 0.32),
      borderRadius: Math.min(30, rect.width * 0.38),
    };
  }

  function getTopLevelIconMotionGeometry(
    sourceItemId: string,
    motionId: string | null = null,
  ): FolderMotionGeometry | null {
    const pixiRect = options.iconBoundsRegistry.getBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.RENDERED, sourceItemId);
    if (pixiRect) return makeFolderMotionGeometryFromRect(motionId || sourceItemId, pixiRect);
    return null;
  }

  function getPageSlotMotionGeometry(
    folderId: string,
    targetPageIndex: number,
    targetIndex: number,
  ): FolderMotionGeometry | null {
    if (typeof window === "undefined") return null;
    const page = options.pageRefs[targetPageIndex];
    const rect = page?.getBoundingClientRect?.();
    if (!rect) return null;

    const col = clamp(targetIndex % options.gridCols.value, 0, Math.max(0, options.gridCols.value - 1));
    const row = clamp(Math.floor(targetIndex / options.gridCols.value), 0, Math.max(0, options.gridRows.value - 1));
    const cellWidth = rect.width / Math.max(1, options.gridCols.value);
    const cellHeight = rect.height / Math.max(1, options.gridRows.value);
    const boxSize = Math.min(70, cellWidth, cellHeight);
    const boxRect = {
      left: rect.left + col * cellWidth + (cellWidth - boxSize) / 2,
      top: rect.top + row * cellHeight + (cellHeight - boxSize) / 2,
      width: boxSize,
      height: boxSize,
    };
    return makeFolderMotionGeometryFromRect(folderId, boxRect);
  }

  function getFolderIconMotionGeometry(folderId: string | null): FolderMotionGeometry {
    return (folderId ? getTopLevelIconMotionGeometry(folderId, folderId) : null)
      || getFallbackFolderMotionGeometry(folderId);
  }

  return {
    folderMotionGeometry,
    getFolderIconMotionGeometry,
    getPageSlotMotionGeometry,
    getTopLevelIconMotionGeometry,
  };
}
