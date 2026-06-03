import { computed } from "vue";
import { clamp } from "../domain/launchpadLayout.js";

const FOLDER_ROW_GAP = 24;
const FOLDER_MIN_ROW_GAP = 10;
const FOLDER_SELECTION_FRAME_SAFE_AREA = 24;
const FOLDER_MIN_EFFECTIVE_ICON_SIZE = 20;
const FOLDER_SHELL_MAX_HEIGHT_MIN = 420;
const FOLDER_SHELL_VIEWPORT_OFFSET = 168;
const FOLDER_SHELL_VERTICAL_PADDING = 118;
const FOLDER_VIEWPORT_MIN_HEIGHT = 280;

function roundPx(value) {
  return Math.round(value * 100) / 100;
}

function getInitialFolderViewportHeight(shellMinHeight) {
  const viewportHeight = Number(globalThis.window?.innerHeight);
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return Math.max(1, shellMinHeight - FOLDER_SHELL_VERTICAL_PADDING);

  const shellMaxHeight = Math.max(FOLDER_SHELL_MAX_HEIGHT_MIN, viewportHeight - FOLDER_SHELL_VIEWPORT_OFFSET);
  const shellHeight = Math.min(shellMinHeight, shellMaxHeight);
  return Math.max(FOLDER_VIEWPORT_MIN_HEIGHT, shellHeight - FOLDER_SHELL_VERTICAL_PADDING);
}

export function useFolderLayoutStyles(options) {
  const visibleFolderRowCount = computed(() => {
    const columnCount = Math.max(1, options.folderCols.value);
    const maxRowCount = options.folderPages.value.reduce((maxRows, page) => {
      const visibleCount = options.getVisibleFolderPage(page).length;
      return Math.max(maxRows, Math.ceil(visibleCount / columnCount) || 1);
    }, 1);
    return clamp(maxRowCount, 1, options.folderRows.value);
  });

  const effectiveFolderIconSize = computed(() =>
    options.folderIconSizeMode.value === options.customFolderIconSizeMode
      ? options.folderIconSize.value
      : options.iconSize.value
  );

  const folderGridHeight = computed(() => {
    const iconCellHeight = effectiveFolderIconSize.value + 56;
    const selectionFrameSafeArea = FOLDER_SELECTION_FRAME_SAFE_AREA;
    return visibleFolderRowCount.value * iconCellHeight
      + Math.max(0, visibleFolderRowCount.value - 1) * FOLDER_ROW_GAP
      + selectionFrameSafeArea;
  });

  const folderShellMinHeight = computed(() => folderGridHeight.value + 120);

  const folderCompressionMetrics = computed(() => {
    const rowCount = Math.max(1, visibleFolderRowCount.value);
    const baseFolderIconSize = effectiveFolderIconSize.value;
    const idealIconCellHeight = baseFolderIconSize + 56;
    const idealSafeArea = FOLDER_SELECTION_FRAME_SAFE_AREA;
    const idealHeight = Math.max(1, folderGridHeight.value);
    const initialViewportHeight = getInitialFolderViewportHeight(folderShellMinHeight.value);
    const availableHeight = Math.max(1, options.folderViewportHeight.value || initialViewportHeight || idealHeight);
    const coarseScale = clamp(availableHeight / idealHeight, 0, 1);
    const rowGap = roundPx(clamp(FOLDER_ROW_GAP * coarseScale, FOLDER_MIN_ROW_GAP, FOLDER_ROW_GAP));
    const safeArea = roundPx(idealSafeArea * coarseScale);
    const gapTotal = Math.max(0, rowCount - 1) * rowGap;
    const rowHeight = Math.max(0, (availableHeight - gapTotal - safeArea) / rowCount);
    const minIconScale = Math.min(1, FOLDER_MIN_EFFECTIVE_ICON_SIZE / Math.max(1, baseFolderIconSize));
    const contentScale = clamp(rowHeight / Math.max(1, idealIconCellHeight), minIconScale, 1);
    const iconCellHeight = roundPx(idealIconCellHeight * contentScale);
    const effectiveIconSize = roundPx(baseFolderIconSize * contentScale);

    return {
      effectiveIconSize,
      iconCellHeight,
      rowGap,
      safeArea,
      iconNameFontSize: roundPx(clamp(13 * contentScale, 10, 13)),
      iconNameLineClamp: contentScale < 0.78 ? 1 : 2,
      iconNameMarginTop: roundPx(clamp(8 * contentScale, 2, 8)),
      iconNamePaddingX: roundPx(clamp(8 * contentScale, 4, 8)),
      iconNamePaddingY: roundPx(clamp(2 * contentScale, 0, 2)),
      selectionFrameMinWidthExtra: roundPx(clamp(44 * contentScale, 20, 44)),
      selectionFramePaddingX: roundPx(clamp(12 * contentScale, 6, 12)),
      selectionFramePaddingY: roundPx(clamp(10 * contentScale, 4, 10)),
    };
  });

  const folderPanelStyle = computed(() => ({
    "--folder-grid-height": `${folderGridHeight.value}px`,
    "--folder-shell-min-height": `${folderShellMinHeight.value}px`,
    "--folder-icon-name-font-size": `${folderCompressionMetrics.value.iconNameFontSize}px`,
    "--folder-icon-name-line-clamp": folderCompressionMetrics.value.iconNameLineClamp,
    "--folder-icon-name-margin-top": `${folderCompressionMetrics.value.iconNameMarginTop}px`,
    "--folder-icon-name-padding-x": `${folderCompressionMetrics.value.iconNamePaddingX}px`,
    "--folder-icon-name-padding-y": `${folderCompressionMetrics.value.iconNamePaddingY}px`,
    "--folder-icon-size": `${folderCompressionMetrics.value.effectiveIconSize}px`,
    "--folder-icon-cell-height": `${folderCompressionMetrics.value.iconCellHeight}px`,
    "--folder-row-gap": `${folderCompressionMetrics.value.rowGap}px`,
    "--folder-selection-frame-min-width": `calc(var(--folder-icon-size) + ${folderCompressionMetrics.value.selectionFrameMinWidthExtra}px)`,
    "--folder-selection-frame-padding-x": `${folderCompressionMetrics.value.selectionFramePaddingX}px`,
    "--folder-selection-frame-padding-y": `${folderCompressionMetrics.value.selectionFramePaddingY}px`,
    "--folder-selection-frame-safe-area": `${folderCompressionMetrics.value.safeArea}px`,
    transformOrigin: "center center",
    pointerEvents: options.isFolderAppLaunchClosing.value ? "none" : "auto",
  }));

  const folderGridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${options.folderCols.value}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${visibleFolderRowCount.value}, var(--folder-icon-cell-height))`,
  }));

  return {
    effectiveFolderIconSize,
    folderGridStyle,
    folderPanelStyle,
    visibleFolderRowCount,
  };
}
