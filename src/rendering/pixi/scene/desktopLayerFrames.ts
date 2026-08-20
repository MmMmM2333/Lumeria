import type {
  SceneDataRecord,
  SceneFocusedIcon,
  SceneItem,
  ScenePageTrackScrub,
  SceneVisualTransform,
} from "../../sceneFrame.js";
import type { RenderInvalidationSnapshot } from "../renderInvalidation.js";
import type { FolderOverlayFrame } from "../folderLayerState.js";

type RectLike = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

type DesktopLayerStateValues = Readonly<{
  activePageIndex: number;
  activePages: readonly (readonly (SceneItem | null)[])[];
  desktopFrame: RectLike;
  desktopGridDebugOptions: SceneDataRecord | null;
  desktopTrackMotionKey: string;
  desktopVisualAlpha: number;
  desktopVisualTransform: SceneVisualTransform;
  deviceResolution: number;
  dragFolderHoverState: SceneDataRecord | null;
  dragFolderTargetId: string | null;
  dragHitDebugOptions: SceneDataRecord | null;
  dragHitDebugState: SceneDataRecord | null;
  dragMeta: SceneDataRecord | null;
  focusedIcon: SceneFocusedIcon | null;
  folderClosingHandoffId: string | null;
  folderPageSize: number;
  folderSourceGhostedId: string | null;
  folderSourceGhostedIds: ReadonlySet<string>;
  getDesktopPageRenderMode: (pageIndex: number) => unknown;
  getVisibleDesktopPage: (page: readonly (SceneItem | null)[]) => readonly (SceneItem | null)[];
  gridCols: number;
  gridRows: number;
  groupDragState: SceneDataRecord | null;
  height: number;
  iconGesturePresentation: SceneDataRecord | null;
  iconSize: number;
  isBatchSelectionActive: boolean;
  isEditMode: boolean;
  isFolderOpeningPreviewFrameGhosted: (folderId: string) => boolean;
  isFolderOverlayActive: boolean;
  isHomeRevealSettling: boolean;
  isIconOpening: (...args: unknown[]) => boolean;
  isSearchMode: boolean;
  isTextlessMode: boolean;
  launchTargetStatusById: Readonly<Record<string, string>>;
  launchpadVisualAlpha: number;
  launchpadVisualTransform: SceneVisualTransform;
  pageTrackScrub: ScenePageTrackScrub | null;
  selectedAppIds: ReadonlySet<string>;
  setPageRef: (...args: unknown[]) => unknown;
  shouldSnapTrack: boolean;
  showMissingLaunchTargetBadge: boolean;
  singleStageDiagnosticsEnabled: SceneDataRecord | null;
  singleStageFolderState: FolderOverlayFrame | null;
  snapDesktopLayout: boolean;
  stageRect: RectLike;
  width: number;
}>;

const STRUCTURE_FIELDS = Object.freeze([
  "activePageIndex",
  "activePages",
  "desktopFrame",
  "desktopGridDebugOptions",
  "desktopTrackMotionKey",
  "desktopVisualAlpha",
  "desktopVisualTransform",
  "deviceResolution",
  "dragFolderHoverState",
  "dragFolderTargetId",
  "dragHitDebugOptions",
  "dragHitDebugState",
  "dragMeta",
  "focusedIcon",
  "folderClosingHandoffId",
  "folderPageSize",
  "folderSourceGhostedId",
  "folderSourceGhostedIds",
  "getDesktopPageRenderMode",
  "getVisibleDesktopPage",
  "gridCols",
  "gridRows",
  "groupDragState",
  "height",
  "iconGesturePresentation",
  "iconSize",
  "isBatchSelectionActive",
  "isEditMode",
  "isFolderOpeningPreviewFrameGhosted",
  "isHomeRevealSettling",
  "isIconOpening",
  "isSearchMode",
  "isTextlessMode",
  "launchTargetStatusById",
  "launchpadVisualAlpha",
  "launchpadVisualTransform",
  "pageTrackScrub",
  "selectedAppIds",
  "setPageRef",
  "shouldSnapTrack",
  "showMissingLaunchTargetBadge",
  "singleStageDiagnosticsEnabled",
  "singleStageFolderState",
  "snapDesktopLayout",
  "stageRect",
  "width",
] as const);

const INTERACTION_FIELDS = Object.freeze([
  "deviceResolution",
  "dragFolderHoverState",
  "folderClosingHandoffId",
  "folderPageSize",
  "folderSourceGhostedId",
  "folderSourceGhostedIds",
  "gridCols",
  "gridRows",
  "groupDragState",
  "height",
  "iconSize",
  "isBatchSelectionActive",
  "isFolderOpeningPreviewFrameGhosted",
  "isTextlessMode",
  "launchTargetStatusById",
  "showMissingLaunchTargetBadge",
  "singleStageFolderState",
  "stageRect",
  "width",
] as const);

const VISUAL_FIELDS = Object.freeze([
  "desktopVisualAlpha",
  "desktopVisualTransform",
  "height",
  "isFolderOverlayActive",
  "launchpadVisualAlpha",
  "launchpadVisualTransform",
  "snapDesktopLayout",
  "stageRect",
  "width",
] as const);

const DIAGNOSTICS_FIELDS = Object.freeze([
  "dragHitDebugOptions",
  "dragHitDebugState",
  "singleStageDiagnosticsEnabled",
  "singleStageFolderState",
  "stageRect",
] as const);

const HANDOFF_FIELDS = Object.freeze([
  "folderClosingHandoffId",
  "folderSourceGhostedId",
  "folderSourceGhostedIds",
  "isFolderOpeningPreviewFrameGhosted",
] as const);

type FrameFromFields<Fields extends readonly (keyof DesktopLayerStateValues)[]> = Readonly<{
  [Field in Fields[number]]: DesktopLayerStateValues[Field];
}>;

export type DesktopStructureFrame = FrameFromFields<typeof STRUCTURE_FIELDS>;
export type DesktopInteractionFrame = FrameFromFields<typeof INTERACTION_FIELDS>;
export type DesktopVisualFrame = FrameFromFields<typeof VISUAL_FIELDS>;
export type DesktopDiagnosticsFrame = FrameFromFields<typeof DIAGNOSTICS_FIELDS>;
export type DesktopHandoffFrame = FrameFromFields<typeof HANDOFF_FIELDS>;

type DesktopLayerLane = "structure" | "interaction" | "visual" | "diagnostics" | "handoff";

export type DesktopLayerFrameUpdate =
  | Readonly<{ frame: DesktopStructureFrame; lane: "structure" }>
  | Readonly<{ frame: DesktopInteractionFrame; lane: "interaction" }>
  | Readonly<{ frame: DesktopVisualFrame; lane: "visual" }>
  | Readonly<{ frame: DesktopDiagnosticsFrame; lane: "diagnostics" }>
  | Readonly<{ frame: DesktopHandoffFrame; lane: "handoff" }>;

export type DesktopLayerFrameBuilders = Readonly<{
  diagnostics: () => DesktopDiagnosticsFrame;
  handoff: () => DesktopHandoffFrame;
  interaction: () => DesktopInteractionFrame;
  structure: () => DesktopStructureFrame;
  visual: () => DesktopVisualFrame;
}>;

export type DesktopLayerFrameWork = Readonly<{
  diagnosticsFrames: number;
  fullPlanBuilds: number;
  handoffFrames: number;
  handoffReconciliations: number;
  interactionFrames: number;
  reconciledNodes: number;
  structureFrames: number;
  visualFrames: number;
}>;

type DesktopLayerPort = Readonly<{
  tickFolderHandoff: (frame: DesktopHandoffFrame) => Partial<DesktopLayerFrameWork> | null | undefined;
  updateDiagnostics: (frame: DesktopDiagnosticsFrame) => Partial<DesktopLayerFrameWork> | null | undefined;
  updateInteraction: (frame: DesktopInteractionFrame) => Partial<DesktopLayerFrameWork> | null | undefined;
  updateStructure: (frame: DesktopStructureFrame) => Partial<DesktopLayerFrameWork> | null | undefined;
  updateVisual: (frame: DesktopVisualFrame) => Partial<DesktopLayerFrameWork> | null | undefined;
}>;

function makeExactFrame<Fields extends readonly (keyof DesktopLayerStateValues)[]>(
  input: FrameFromFields<Fields>,
  fields: Fields,
  label: string,
): FrameFromFields<Fields> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`${label} must be an object`);
  }
  const keys = Object.keys(input);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key as Fields[number]))) {
    throw new TypeError(`${label} must contain exactly: ${fields.join(", ")}`);
  }
  return Object.freeze(input);
}

export function makeDesktopStructureFrame(input: DesktopStructureFrame): DesktopStructureFrame {
  return makeExactFrame(input, STRUCTURE_FIELDS, "DesktopStructureFrame");
}

export function makeDesktopInteractionFrame(input: DesktopInteractionFrame): DesktopInteractionFrame {
  return makeExactFrame(input, INTERACTION_FIELDS, "DesktopInteractionFrame");
}

export function makeDesktopVisualFrame(input: DesktopVisualFrame): DesktopVisualFrame {
  return makeExactFrame(input, VISUAL_FIELDS, "DesktopVisualFrame");
}

export function makeDesktopDiagnosticsFrame(input: DesktopDiagnosticsFrame): DesktopDiagnosticsFrame {
  return makeExactFrame(input, DIAGNOSTICS_FIELDS, "DesktopDiagnosticsFrame");
}

export function makeDesktopHandoffFrame(input: DesktopHandoffFrame): DesktopHandoffFrame {
  return makeExactFrame(input, HANDOFF_FIELDS, "DesktopHandoffFrame");
}

export function makeDesktopLayerFrameUpdates(
  invalidation: RenderInvalidationSnapshot,
  builders: DesktopLayerFrameBuilders,
): readonly DesktopLayerFrameUpdate[] {
  if (invalidation.requiresStructureUpdate) {
    return Object.freeze([Object.freeze({ lane: "structure", frame: builders.structure() })]);
  }
  const updates: DesktopLayerFrameUpdate[] = [];
  if (invalidation.requiresInteractionUpdate) updates.push(Object.freeze({ lane: "interaction", frame: builders.interaction() }));
  if (invalidation.requiresVisualUpdate) updates.push(Object.freeze({ lane: "visual", frame: builders.visual() }));
  if (invalidation.requiresDiagnosticsUpdate) updates.push(Object.freeze({ lane: "diagnostics", frame: builders.diagnostics() }));
  if (invalidation.requiresHandoffUpdate) updates.push(Object.freeze({ lane: "handoff", frame: builders.handoff() }));
  return Object.freeze(updates);
}

function emptyFrameWork(): Record<keyof DesktopLayerFrameWork, number> {
  return {
    diagnosticsFrames: 0,
    fullPlanBuilds: 0,
    handoffFrames: 0,
    handoffReconciliations: 0,
    interactionFrames: 0,
    reconciledNodes: 0,
    structureFrames: 0,
    visualFrames: 0,
  };
}

function mergeFrameWork(
  target: Record<keyof DesktopLayerFrameWork, number>,
  next: Partial<DesktopLayerFrameWork> | null | undefined,
): void {
  if (!next) return;
  for (const key of ["fullPlanBuilds", "handoffReconciliations", "reconciledNodes"] as const) {
    target[key] += Number(next[key]) || 0;
  }
}

const FRAME_COUNT_KEYS = Object.freeze({
  diagnostics: "diagnosticsFrames",
  handoff: "handoffFrames",
  interaction: "interactionFrames",
  structure: "structureFrames",
  visual: "visualFrames",
} as const satisfies Record<DesktopLayerLane, keyof DesktopLayerFrameWork>);

export function applyDesktopLayerFrameUpdates(
  layer: DesktopLayerPort,
  updates: readonly DesktopLayerFrameUpdate[],
): DesktopLayerFrameWork {
  const work = emptyFrameWork();
  for (const update of updates) {
    work[FRAME_COUNT_KEYS[update.lane]] += 1;
    let result: Partial<DesktopLayerFrameWork> | null | undefined;
    switch (update.lane) {
      case "structure": result = layer.updateStructure(update.frame); break;
      case "interaction": result = layer.updateInteraction(update.frame); break;
      case "visual": result = layer.updateVisual(update.frame); break;
      case "diagnostics": result = layer.updateDiagnostics(update.frame); break;
      case "handoff": result = layer.tickFolderHandoff(update.frame); break;
    }
    mergeFrameWork(work, result);
  }
  return Object.freeze(work);
}

export function getDesktopLayerFrameFields(lane: DesktopLayerLane): readonly string[] {
  switch (lane) {
    case "structure": return STRUCTURE_FIELDS;
    case "interaction": return INTERACTION_FIELDS;
    case "visual": return VISUAL_FIELDS;
    case "diagnostics": return DIAGNOSTICS_FIELDS;
    case "handoff": return HANDOFF_FIELDS;
  }
}
