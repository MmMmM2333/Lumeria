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

/** Layout snapshots may recreate unchanged app/source records. Compare their
 * bounded immutable data, never mutable objects or folder handoff state. */
function sameSnapshot(a:unknown,b:unknown,depth=4):boolean{
  if(Object.is(a,b))return true;
  if(depth===0||!a||!b||typeof a!=="object"||typeof b!=="object"||!Object.isFrozen(a)||!Object.isFrozen(b))return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameSnapshot(value,b[index],depth-1));
  if(Object.getPrototypeOf(a)!==Object.prototype||Object.getPrototypeOf(b)!==Object.prototype)return false;
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.prototype.hasOwnProperty.call(right,key)&&sameSnapshot(left[key],right[key],depth-1));
}

export function canRetainAppVisualState(previous:IconVisualState|undefined,next:IconVisualState):boolean{
  if(!previous||previous.item?.type!=="app"||next.item?.type!=="app"||previous.dragging||next.dragging||previous.ghosted||next.ghosted)return false;
  if(!Object.isFrozen(previous.item)||!Object.isFrozen(next.item))return false;
  return ICON_VISUAL_STATE_FIELDS.every(key=>{
    if(key==="source"){
      const a=previous.source,b=next.source;
      return a===b||Boolean(a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(field=>Object.is(a[field],b[field])));
    }
    if(key==="suppressedFolderPreviewChildIds")return previous[key].length===next[key].length&&previous[key].every((id,index)=>id===next[key][index]);
    return sameSnapshot(previous[key],next[key]);
  });
}
