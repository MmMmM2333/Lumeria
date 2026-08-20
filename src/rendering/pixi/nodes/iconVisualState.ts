import type { SceneDataRecord, SceneItem } from "../../sceneFrame.js";

export type IconVisualState = Readonly<{
  area: string | null;
  batchSelected: boolean;
  cellHeight: number;
  cellWidth: number;
  compact: boolean;
  dragging: boolean;
  draggable: boolean;
  dropTarget: boolean;
  editing: boolean;
  focused: boolean;
  folderHoverState: SceneDataRecord | null;
  folderPreviewPageSize: number;
  folderPreviewRelease: boolean;
  ghosted: boolean;
  hasCustomIcon: boolean;
  iconSize: number;
  interactionPhase: string | null;
  interactive: boolean;
  item: SceneItem | null;
  jiggleSeed: number;
  launchTargetStatus: string | null;
  opening: boolean;
  preserveNodeScale: boolean;
  removable: boolean;
  revealLabelAfterVisualHandoff: boolean;
  selectedChildCount: number;
  singleLineLabel: boolean;
  source: SceneDataRecord | null;
  stageHeight: number;
  stageWidth: number;
  suppressFolderThumbFrame: boolean;
  suppressedFolderPreviewChildIds: readonly string[];
  suppressLabelRevealAfterGhost: boolean;
  textless: boolean;
  visualSpecTransition: SceneDataRecord | null;
}>;

const ICON_VISUAL_STATE_FIELDS = Object.freeze([
  "area",
  "batchSelected",
  "cellHeight",
  "cellWidth",
  "compact",
  "dragging",
  "draggable",
  "dropTarget",
  "editing",
  "focused",
  "folderHoverState",
  "folderPreviewPageSize",
  "folderPreviewRelease",
  "ghosted",
  "hasCustomIcon",
  "iconSize",
  "interactionPhase",
  "interactive",
  "item",
  "jiggleSeed",
  "launchTargetStatus",
  "opening",
  "preserveNodeScale",
  "removable",
  "revealLabelAfterVisualHandoff",
  "selectedChildCount",
  "singleLineLabel",
  "source",
  "stageHeight",
  "stageWidth",
  "suppressFolderThumbFrame",
  "suppressedFolderPreviewChildIds",
  "suppressLabelRevealAfterGhost",
  "textless",
  "visualSpecTransition",
] as const satisfies readonly (keyof IconVisualState)[]);

export function makeIconVisualState(input: IconVisualState): IconVisualState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("IconVisualState must be an object");
  }
  const keys = Object.keys(input);
  if (
    keys.length !== ICON_VISUAL_STATE_FIELDS.length ||
    keys.some((key) => !ICON_VISUAL_STATE_FIELDS.includes(key as typeof ICON_VISUAL_STATE_FIELDS[number]))
  ) {
    throw new TypeError(`IconVisualState must contain exactly: ${ICON_VISUAL_STATE_FIELDS.join(", ")}`);
  }
  return Object.freeze(input);
}

export function getIconVisualStateFields(): readonly string[] {
  return ICON_VISUAL_STATE_FIELDS;
}
