import { computed, type Ref } from "vue";
import { clamp } from "../domain/launchpadLayout.js";
import { getFolderLayoutMetricsForRows } from "../rendering/folderLayoutMetrics.js";

export type FolderLayoutStylesOptions<TItem> = Readonly<{
  customFolderIconSizeMode: string;
  folderCols: Readonly<Ref<number>>;
  folderIconSize: Readonly<Ref<number>>;
  folderIconSizeMode: Readonly<Ref<string>>;
  folderPages: Readonly<Ref<readonly (readonly (TItem | null | undefined)[])[]>>;
  folderPagesForLayout?: Readonly<Ref<readonly (readonly (TItem | null | undefined)[])[] | null>>;
  folderRows: Readonly<Ref<number>>;
  folderViewportHeight: Readonly<Ref<number>>;
  getVisibleFolderPage: (page: readonly (TItem | null | undefined)[]) => readonly TItem[];
  iconSize: Readonly<Ref<number>>;
}>;

export function useFolderLayoutStyles<TItem>(options: FolderLayoutStylesOptions<TItem>) {
  const visibleFolderRowCount = computed(() => {
    const columnCount = Math.max(1, options.folderCols.value);
    const pagesForLayout = options.folderPagesForLayout?.value || options.folderPages.value;
    const maxRowCount = pagesForLayout.reduce((maxRows, page) => {
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

  const folderLayoutMetrics = computed(() => getFolderLayoutMetricsForRows({
    baseFolderIconSize: effectiveFolderIconSize.value,
    folderViewportHeight: options.folderViewportHeight.value,
    rowCount: visibleFolderRowCount.value,
  }));

  const folderGridHeight = computed(() => folderLayoutMetrics.value.folderGridHeight);

  const folderShellMinHeight = computed(() => folderLayoutMetrics.value.folderShellMinHeight);

  const folderCompressionMetrics = computed(() => folderLayoutMetrics.value);

  const folderPanelStyle = computed(() => ({
    "--folder-shell-min-height": `${folderShellMinHeight.value}px`,
    "--folder-icon-size": `${folderCompressionMetrics.value.effectiveIconSize}px`,
    "--folder-icon-cell-height": `${folderCompressionMetrics.value.iconCellHeight}px`,
    "--folder-row-gap": `${folderCompressionMetrics.value.rowGap}px`,
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
