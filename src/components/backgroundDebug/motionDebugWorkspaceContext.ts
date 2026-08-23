import { inject } from "vue";
import type { InjectionKey, Ref } from "vue";
import type { MotionReplayAnalysisFinding } from "../../diagnostics/motionReplayAnalyzer.js";
import type {
  MotionCaptureAllowedProp,
  MotionCaptureProfile,
} from "./motionCaptureProfileModel.js";
import type * as MotionDebugPanelModel from "./motionDebugPanelModel.js";
import type { MotionDebugWorkspaceSession } from "./motionDebugWorkspaceModel.js";
import type {
  MotionInspectorEventRow,
  MotionInspectorModel,
  MotionInspectorValueRow,
  MotionInspectorWarningRow,
  MotionInspectorWhyRow,
} from "./motionInspectorModel.js";
import type { MotionReplayBookmark } from "./motionReplayBookmarkModel.js";
import type * as MotionReplayViewerModel from "./motionReplayViewerModel.js";
import type {
  MotionReplayStepDirection,
  MotionReplayTimeRange,
} from "./motionReplayViewerModel.js";
import type {
  MotionTrackChartDisplayMode,
  MotionTrackChartModel,
  MotionTrackChartSeriesKey,
  MotionTrackChartSeriesVisibility,
  MotionTrackChartWindow,
} from "./motionTrackChartModel.js";

export const MOTION_DEBUG_WORKSPACE_REGIONS = Object.freeze(["targets", "timeline", "inspector"] as const);
export type MotionDebugWorkspaceRegionName = (typeof MOTION_DEBUG_WORKSPACE_REGIONS)[number];

export interface MotionDebugWorkspaceStatusRow {
  readonly label: string;
  readonly value: string;
  readonly wide?: boolean;
}

export interface MotionDebugWorkspaceDetailRow {
  readonly detail: string;
  readonly key: string;
  readonly value: string;
}

export interface MotionDebugWorkspaceTrackDisplayInput {
  readonly kind?: string;
  readonly label?: string;
  readonly lane?: string;
  readonly laneKey?: string;
  readonly layer?: string;
  readonly prop?: string;
  readonly sourceLabel?: string;
  readonly targetId?: unknown;
  readonly timeMs?: unknown;
}

export interface MotionDebugWorkspaceTimelineEventInput extends MotionDebugWorkspaceTrackDisplayInput {
  readonly timeMs: unknown;
}

type MotionAnimationRow = ReturnType<typeof MotionDebugPanelModel.buildMotionAnimationRows>[number];
type MotionCurveChartGroup = ReturnType<typeof MotionDebugPanelModel.buildMotionCurveChartGroups>[number];
type MotionFilterSummary = ReturnType<typeof MotionDebugPanelModel.buildMotionFilterSummary>;
type MotionLayerTreeRow = ReturnType<typeof MotionDebugPanelModel.buildMotionLayerTreeRows>[number];
type MotionOverviewRow = ReturnType<typeof MotionDebugPanelModel.buildMotionOverviewRows>[number];
type MotionPropertyRow = ReturnType<typeof MotionDebugPanelModel.buildMotionPropertyRows>[number];
type MotionTimelineGroup = ReturnType<typeof MotionDebugPanelModel.buildMotionTimelineGroups>[number];
type MotionReplayCurveGroup = ReturnType<typeof MotionReplayViewerModel.buildMotionReplayCurveGroups>[number];
type MotionReplayEventRow = ReturnType<typeof MotionReplayViewerModel.buildMotionReplayEventRows>[number];
type MotionReplayFrameRow = ReturnType<typeof MotionReplayViewerModel.buildMotionReplayFrameRows>[number];
type MotionReplayOverlayRow = ReturnType<typeof MotionReplayViewerModel.buildMotionReplayOverlayRows>[number];
type MotionTrackChartTrack = MotionTrackChartModel["tracks"][number];
type MotionTrackChartMarker = MotionTrackChartTrack["eventMarkers"][number];

export interface MotionDebugWorkspaceTargetsRegion {
  readonly MOTION_FILTER_PRESETS: readonly Readonly<{ label: string; labelKey?: string; value: string }>[];
  readonly isMotionWorkspaceLayerSelected: (row: MotionLayerTreeRow) => boolean;
  readonly motionAnimationRows: Ref<MotionAnimationRow[]>;
  readonly motionCaptureAllowedProps: readonly MotionCaptureAllowedProp[];
  readonly motionCaptureEstimateRows: Ref<MotionDebugWorkspaceStatusRow[]>;
  readonly motionCaptureProfile: Ref<MotionCaptureProfile>;
  readonly motionCaptureProfiles: readonly MotionCaptureProfile[];
  readonly motionCaptureSelectedPropCount: Ref<number>;
  readonly motionCaptureTargetFilterText: Ref<Readonly<{ kinds: string; layers: string; sourceLabels: string; sourceQuery: string }>>;
  readonly motionFilterPreset: Ref<string>;
  readonly motionFilterQuery: Ref<string>;
  readonly motionFilterSummary: Ref<MotionFilterSummary>;
  readonly motionLayerTreeRows: Ref<MotionLayerTreeRow[]>;
  readonly motionOverviewRows: Ref<MotionOverviewRow[]>;
  readonly motionReplayCaptureActive: Ref<boolean>;
  readonly motionWorkspaceSession: Ref<MotionDebugWorkspaceSession>;
  readonly selectMotionWorkspaceLayer: (row: MotionLayerTreeRow) => void;
  readonly setMotionFilterPreset: (value: string) => void;
  readonly toggleMotionWorkspaceCaptureProp: (prop: MotionCaptureAllowedProp, event: Event) => void;
  readonly updateMotionFilterQuery: (event: Event) => void;
  readonly updateMotionWorkspaceCaptureProfile: (event: Event) => void;
  readonly updateMotionWorkspaceCaptureTargetFilter: (
    key: "kinds" | "layers" | "sourceLabels" | "sourceQuery",
    event: Event,
  ) => void;
}

export interface MotionDebugWorkspaceTimelineRegion {
  readonly MOTION_REPLAY_IMPORT_MAX_BYTES: number;
  readonly MOTION_TRACK_CHART_DISPLAY_NORMALIZED: MotionTrackChartDisplayMode;
  readonly MOTION_TRACK_CHART_DISPLAY_RAW: MotionTrackChartDisplayMode;
  readonly applyMotionReplayBookmark: (bookmark: MotionReplayBookmark) => void;
  readonly cancelMotionTrackChartBrush: (event: PointerEvent) => void;
  readonly clearMotionReplayBookmarks: () => void;
  readonly clearMotionReplayViewer: () => void;
  readonly copyMotionFocusedDebugExport: (bookmark?: MotionReplayBookmark | null) => Promise<void>;
  readonly copyMotionReplayInterval: () => Promise<void>;
  readonly deleteMotionReplayBookmark: (bookmark: MotionReplayBookmark) => void;
  readonly endMotionTrackChartBrush: (event: PointerEvent) => void;
  readonly formatMotionChartStat: (value: unknown) => string;
  readonly formatMotionReplayBookmarkMeta: (bookmark: MotionReplayBookmark) => string;
  readonly formatMotionReplayTime: (value: unknown) => string;
  readonly formatMotionTrackChartValue: (value: unknown) => string;
  readonly importMotionReplayFile: (event: Event) => Promise<void>;
  readonly isMotionWorkspaceTimelineEventSelected: (event: MotionDebugWorkspaceTrackDisplayInput) => boolean;
  readonly isMotionWorkspaceTrackSelected: (row: MotionDebugWorkspaceTrackDisplayInput) => boolean;
  readonly jumpMotionReplayFinding: (finding: MotionReplayAnalysisFinding) => void;
  readonly loadCapturedMotionReplayTrace: () => Promise<void>;
  readonly loadMotionReplayImportText: () => void;
  readonly motionCurveChartGroups: Ref<MotionCurveChartGroup[]>;
  readonly motionReplayFindingRows: Ref<readonly MotionReplayAnalysisFinding[]>;
  readonly motionReplayFindingStatusLabel: Ref<string>;
  readonly motionReplayBookmarkCanSave: Ref<boolean>;
  readonly motionReplayBookmarkRows: Ref<MotionReplayBookmark[]>;
  readonly motionReplayBookmarkStatusLabel: Ref<string>;
  readonly motionReplayCaptureActive: Ref<boolean>;
  readonly motionReplayCurrentTimeMs: Ref<number>;
  readonly motionReplayCurveGroups: Ref<MotionReplayCurveGroup[]>;
  readonly motionReplayEventRows: Ref<MotionReplayEventRow[]>;
  readonly motionReplayFilterQuery: Ref<string>;
  readonly motionReplayFilterSummary: Ref<Readonly<{ text: string }>>;
  readonly motionReplayFrameRows: Ref<MotionReplayFrameRow[]>;
  readonly motionReplayImportError: Ref<string>;
  readonly motionReplayImportStatus: Ref<string>;
  readonly motionReplayImportText: Ref<string>;
  readonly motionReplayIntervalCopyButtonLabel: Ref<string>;
  readonly motionReplayIntervalEndMs: Ref<number>;
  readonly motionReplayIntervalStartMs: Ref<number>;
  readonly motionReplayOverlayRows: Ref<MotionReplayOverlayRow[]>;
  readonly motionReplayOverviewRows: Ref<MotionDebugWorkspaceStatusRow[]>;
  readonly motionReplayPlayButtonLabel: Ref<string>;
  readonly motionReplayTimeRange: Ref<MotionReplayTimeRange>;
  readonly motionReplayCaptureAvailable: Ref<boolean>;
  readonly motionReplayViewerLoaded: Ref<boolean>;
  readonly motionTimelineGroups: Ref<MotionTimelineGroup[]>;
  readonly motionTrackChartBrushPointerId: Ref<number | null>;
  readonly motionTrackChartDisplayMode: Ref<MotionTrackChartDisplayMode>;
  readonly motionTrackChartHeaderLabel: Ref<string>;
  readonly motionTrackChartIntervalActive: Ref<boolean>;
  readonly motionTrackChartIntervalOverlay: Ref<Readonly<{ active: boolean; width: number; x: number }>>;
  readonly motionTrackChartModel: Ref<MotionTrackChartModel | null>;
  readonly motionTrackChartSeriesOptions: readonly Readonly<{ key: MotionTrackChartSeriesKey; labelKey: string }>[];
  readonly motionTrackChartSeriesVisibility: Ref<MotionTrackChartSeriesVisibility>;
  readonly motionTrackChartSummaryRows: Ref<MotionDebugWorkspaceStatusRow[]>;
  readonly motionTrackChartZoomActive: Ref<boolean>;
  readonly motionTrackChartZoomWindow: Ref<MotionTrackChartWindow>;
  readonly resetMotionTrackChartZoom: () => void;
  readonly saveMotionReplayBookmark: () => void;
  readonly selectMotionTrackChartEvent: (track: MotionTrackChartTrack, marker: MotionTrackChartMarker) => void;
  readonly selectMotionTrackChartTrack: (track: MotionTrackChartTrack) => void;
  readonly selectMotionWorkspaceCurve: (group: MotionCurveChartGroup) => void;
  readonly selectMotionWorkspaceReplayOverlay: (row: MotionReplayOverlayRow) => void;
  readonly selectMotionWorkspaceTimelineEvent: (event: MotionDebugWorkspaceTimelineEventInput) => void;
  readonly selectMotionWorkspaceTrack: (row: unknown) => void;
  readonly setMotionReplayCurrentTime: (timeMs: unknown, options?: Readonly<{ pause?: boolean }>) => void;
  readonly setMotionTrackChartDisplayMode: (mode: MotionTrackChartDisplayMode) => void;
  readonly startMotionTrackChartBrush: (event: PointerEvent) => void;
  readonly stepMotionReplayEvent: (direction: MotionReplayStepDirection) => void;
  readonly stepMotionReplayFrame: (direction: MotionReplayStepDirection) => void;
  readonly toggleMotionReplayPlayback: () => void;
  readonly toggleMotionTrackChartSeries: (key: MotionTrackChartSeriesKey, event: Event) => void;
  readonly updateMotionReplayCurrentTime: (event: Event) => void;
  readonly updateMotionReplayFilterQuery: (event: Event) => void;
  readonly updateMotionReplayImportText: (event: Event) => void;
  readonly updateMotionReplayIntervalEnd: (event: Event) => void;
  readonly updateMotionReplayIntervalStart: (event: Event) => void;
  readonly updateMotionTrackChartPointer: (event: PointerEvent) => void;
  readonly updateMotionTrackChartZoomEnd: (event: Event) => void;
  readonly updateMotionTrackChartZoomStart: (event: Event) => void;
  readonly zoomMotionTrackChartToInterval: () => void;
}

export interface MotionDebugWorkspaceInspectorRegion {
  readonly clearMotionDebugHistory: () => Promise<void>;
  readonly copyMotionFocusedDebugExport: (bookmark?: MotionReplayBookmark | null) => Promise<void>;
  readonly copyMotionReport: (mode: "full" | "summary") => Promise<void>;
  readonly formatMotionReplayTime: (value: unknown) => string;
  readonly isMotionWorkspaceTrackSelected: (row: MotionDebugWorkspaceTrackDisplayInput) => boolean;
  readonly motionCancelReasonRows: Ref<MotionDebugWorkspaceDetailRow[]>;
  readonly motionFocusedCopyButtonLabel: Ref<string>;
  readonly motionFocusedDebugExportAvailable: Ref<boolean>;
  readonly motionFocusedDebugScopeRows: Ref<MotionDebugWorkspaceStatusRow[]>;
  readonly motionFullCopyButtonLabel: Ref<string>;
  readonly motionInspectorEventRows: Ref<MotionInspectorEventRow[]>;
  readonly motionInspectorLaneRows: Ref<MotionInspectorValueRow[]>;
  readonly motionInspectorModel: Ref<MotionInspectorModel | null>;
  readonly motionInspectorStatusRows: Ref<MotionDebugWorkspaceStatusRow[]>;
  readonly motionInspectorWarningRows: Ref<MotionInspectorWarningRow[]>;
  readonly motionInspectorWhyRows: Ref<MotionInspectorWhyRow[]>;
  readonly motionPropertyRows: Ref<MotionPropertyRow[]>;
  readonly motionReplayCaptureActive: Ref<boolean>;
  readonly motionSummaryCopyButtonLabel: Ref<string>;
  readonly motionWarningRows: Ref<MotionDebugWorkspaceDetailRow[]>;
  readonly motionWorkspaceFilterLabel: Ref<string>;
  readonly motionWorkspaceSelectedTargetLabel: Ref<string>;
  readonly motionWorkspaceSelectedTimeMs: Ref<number>;
  readonly motionWorkspaceSelectedTrackLabel: Ref<string>;
  readonly selectMotionWorkspacePropertyByEvent: (event: Event) => void;
}

export interface MotionDebugWorkspaceRegionMap {
  readonly inspector: MotionDebugWorkspaceInspectorRegion;
  readonly targets: MotionDebugWorkspaceTargetsRegion;
  readonly timeline: MotionDebugWorkspaceTimelineRegion;
}

export type MotionDebugWorkspaceContext = Readonly<{
  [Name in MotionDebugWorkspaceRegionName]: Readonly<MotionDebugWorkspaceRegionMap[Name]>;
}>;

export const MOTION_DEBUG_WORKSPACE_CONTEXT_KEY: InjectionKey<MotionDebugWorkspaceContext> = Symbol("motion-debug-workspace");

const MOTION_DEBUG_WORKSPACE_REGION_NAMES: ReadonlySet<string> = new Set(MOTION_DEBUG_WORKSPACE_REGIONS);

export function createMotionDebugWorkspaceContext(regions: MotionDebugWorkspaceRegionMap): MotionDebugWorkspaceContext {
  const unknownRegions = Object.keys(regions).filter((name) => !MOTION_DEBUG_WORKSPACE_REGION_NAMES.has(name));
  if (unknownRegions.length) {
    throw new TypeError(`Unknown motion debug workspace regions: ${unknownRegions.join(", ")}`);
  }
  for (const name of MOTION_DEBUG_WORKSPACE_REGIONS) {
    const region = regions[name];
    if (!region || typeof region !== "object" || Array.isArray(region)) {
      throw new TypeError(`Motion debug workspace region ${name} must be an object`);
    }
  }
  return Object.freeze({
    inspector: Object.freeze(regions.inspector),
    targets: Object.freeze(regions.targets),
    timeline: Object.freeze(regions.timeline),
  });
}

function useMotionDebugWorkspaceContext(): MotionDebugWorkspaceContext {
  const context = inject(MOTION_DEBUG_WORKSPACE_CONTEXT_KEY, null);
  if (!context) throw new Error("Motion debug workspace context is not available.");
  return context;
}

export function useMotionDebugWorkspaceRegion<Name extends MotionDebugWorkspaceRegionName>(
  name: Name,
): MotionDebugWorkspaceContext[Name] {
  return useMotionDebugWorkspaceContext()[name];
}
