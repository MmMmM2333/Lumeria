import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { GROUP_TRANSFER_RUNTIME_MODE } from "./groupTransferRuntimeAdapter.js";
import type { IconVisualSpec } from "./iconVisualSpec.js";

/**
 * Slot releases must be rasterized at the same logical size as the folder
 * thumbnail child.  Scaling a full-size Text/Sprite down to that slot changes
 * its sampling and is visible as a brightness/sharpness jump at handoff.
 */
export function isFolderSlotReleaseMode(mode: unknown): boolean {
  return mode === GROUP_TRANSFER_RUNTIME_MODE.FOLDER_PREVIEW_SLOT ||
    mode === GROUP_TRANSFER_RUNTIME_MODE.CREATED_FOLDER;
}

export function getFolderSlotReleaseIconSize(folderIconSize: unknown = 64): number {
  const size = Math.max(1, Number(folderIconSize) || 64);
  return getFolderThumbMetrics(size).childSize;
}

export function makeFolderSlotReleaseVisualSpec(
  baseSpec: object = {},
  folderIconSize: unknown = 64,
): IconVisualSpec {
  const iconSize = getFolderSlotReleaseIconSize(folderIconSize);
  return {
    ...baseSpec,
    // These values are deliberately assigned after baseSpec. A release ghost
    // owns the thumbnail visual contract, regardless of the source drag's
    // label/compact presentation.
    cellHeight: iconSize,
    cellWidth: iconSize,
    compact: false,
    iconSize,
    singleLineLabel: false,
    textless: true,
  };
}
