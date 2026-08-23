export function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export interface MotionTraceRecord {
  [key: string]: unknown;
  driver?: string | undefined;
  frame?: number | undefined;
  kind?: string | undefined;
  label?: string | undefined;
  lane?: string | undefined;
  laneKey?: string | undefined;
  layer?: string | undefined;
  prop?: string | undefined;
  reason?: string | undefined;
  sourceLabel?: string | undefined;
  targetId?: number | string | null | undefined;
  targetKind?: string | undefined;
  targetLabel?: string | undefined;
  timeMs?: number | undefined;
  to?: number | undefined;
  type?: string | undefined;
  value?: number | undefined;
  velocity?: number | undefined;
  warningType?: string | undefined;
}

export interface MotionTraceRange {
  max: number | null;
  min: number | null;
}

export interface MotionDebugSummary {
  activeAnimationCount: number;
  activeChannelCount: number;
  activeTargetCount: number;
  byDriver: Record<string, number>;
  byLane: Record<string, number>;
  byLaneKey: Record<string, number>;
  byProp: Record<string, number>;
  byTargetId: Record<string, number>;
  warningCount?: number;
}

interface MotionTraceSample {
  animations?: readonly MotionTraceRecord[];
  frame?: number;
  timeMs?: number;
}

interface MotionTraceHistory {
  events?: readonly MotionTraceRecord[];
  samples?: readonly MotionTraceSample[];
}

interface MotionReplayFrame {
  frame?: number;
  timeMs?: number;
  values?: readonly MotionTraceRecord[];
}

interface MotionTrackStats extends MotionTraceRecord {
  maxDelta?: number | null;
  maxVelocity?: number | null;
  overshootCount?: number;
  retargetCount?: number;
}

interface MotionTrackAggregate extends MotionTraceRecord {
  driver: string;
  eventCount: number;
  key: string;
  lane: string | undefined;
  laneKey: string | undefined;
  layer?: string | undefined;
  prop: string | undefined;
  sampleCount: number;
  sourceLabel: string | undefined;
  targetId: number | string | null | undefined;
  timeRangeMs: MotionTraceRange;
  valueRange: MotionTraceRange;
  velocityRange: MotionTraceRange;
}

export interface MotionTrackRecord extends MotionTrackAggregate {
  maxDelta: number | null;
  maxVelocity: number | null;
  overshootCount: number;
  retargetCount: number;
}

export function readPositiveNumber(value: unknown, fallback = 0): number {
  return Math.max(0, readNumber(value, fallback));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function makeTrackKey(
  record: MotionTraceRecord = {},
  options: { laneFallback?: string; laneKeyFallback?: string } = {},
): string {
  const laneFallback = options.laneFallback ?? "unknown";
  const laneKeyFallback = options.laneKeyFallback ?? "unknown";
  return [
    record.targetId ?? "unknown",
    record.prop ?? "unknown",
    record.lane ?? laneFallback,
    record.laneKey ?? laneKeyFallback,
  ].join(":");
}

function incrementCount(counts: Record<string, number>, key: unknown): void {
  const normalized = key == null ? "unknown" : String(key);
  counts[normalized] = (counts[normalized] || 0) + 1;
}

export function makeMotionDebugSummary(animations: readonly MotionTraceRecord[] = []): MotionDebugSummary {
  const targetIds = new Set<number | string>();
  const channelKeys = new Set<string>();
  const summary: MotionDebugSummary = {
    activeAnimationCount: animations.length,
    activeChannelCount: 0,
    activeTargetCount: 0,
    byDriver: {},
    byLane: {},
    byLaneKey: {},
    byProp: {},
    byTargetId: {},
  };

  for (const animation of animations) {
    incrementCount(summary.byDriver, animation.driver);
    incrementCount(summary.byLane, animation.lane);
    incrementCount(summary.byLaneKey, animation.laneKey);
    incrementCount(summary.byProp, animation.prop);
    incrementCount(summary.byTargetId, animation.targetId);
    if (animation.targetId != null) targetIds.add(animation.targetId);
    channelKeys.add(`${animation.targetId ?? "unknown"}:${animation.prop ?? "unknown"}`);
  }

  summary.activeTargetCount = targetIds.size;
  summary.activeChannelCount = channelKeys.size;
  return summary;
}

export function expandRange(range: MotionTraceRange, value: unknown): void {
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  range.min = range.min == null ? number : Math.min(range.min, number);
  range.max = range.max == null ? number : Math.max(range.max, number);
}

export function finalizeRange(range: MotionTraceRange): MotionTraceRange {
  return {
    max: range.max,
    min: range.min,
  };
}

export function collectMotionTrackRecordsFromHistory(history: MotionTraceHistory = {}): MotionTraceRecord[] {
  const records: MotionTraceRecord[] = [];
  for (const sample of history.samples || []) {
    for (const animation of sample.animations || []) {
      records.push({
        ...animation,
        frame: sample.frame,
        timeMs: sample.timeMs,
        type: "sample",
      });
    }
  }
  for (const event of history.events || []) records.push(event);
  return records;
}

export function collectMotionTrackRecordsFromReplay(
  frames: readonly MotionReplayFrame[] = [],
  events: readonly MotionTraceRecord[] = [],
): MotionTraceRecord[] {
  const records: MotionTraceRecord[] = [];
  for (const frame of frames) {
    for (const value of frame.values || []) {
      records.push({
        ...value,
        frame: frame.frame,
        timeMs: frame.timeMs,
        type: "sample",
      });
    }
  }
  for (const event of events) records.push(event);
  return records;
}

export function aggregateMotionTracks(
  records: readonly MotionTraceRecord[] = [],
  curveStats: readonly MotionTrackStats[] = [],
  options: { includeLayer?: boolean; sortMode?: "key" | "sampleCount" } = {},
): MotionTrackRecord[] {
  const includeLayer = options.includeLayer === true;
  const sortMode = options.sortMode || "sampleCount";
  const statsByKey = new Map((curveStats || []).map((stats) => [makeTrackKey(stats), stats]));
  const tracksByKey = new Map<string, MotionTrackAggregate>();

  for (const record of records) {
    const key = makeTrackKey(record);
    let track = tracksByKey.get(key);
    if (!track) {
      track = {
        driver: record.driver || "unknown",
        eventCount: 0,
        key,
        lane: record.lane,
        laneKey: record.laneKey,
        prop: record.prop,
        sampleCount: 0,
        sourceLabel: record.sourceLabel,
        targetId: record.targetId,
        timeRangeMs: { max: null, min: null },
        valueRange: { max: null, min: null },
        velocityRange: { max: null, min: null },
      };
      if (includeLayer) track.layer = record.layer;
      tracksByKey.set(key, track);
    }
    if (record.driver) track.driver = record.driver;
    if (includeLayer && record.layer !== undefined) track.layer = record.layer;
    if (record.sourceLabel) track.sourceLabel = record.sourceLabel;
    if (record.type === "sample") track.sampleCount += 1;
    else track.eventCount += 1;
    expandRange(track.timeRangeMs, record.timeMs);
    expandRange(track.valueRange, record.value);
    expandRange(track.valueRange, record.to);
    expandRange(track.velocityRange, record.velocity);
  }

  const tracks = Array.from(tracksByKey.values()).map((track) => {
    const stats = statsByKey.get(track.key);
    const result: MotionTrackRecord = {
      driver: track.driver,
      eventCount: track.eventCount,
      key: track.key,
      lane: track.lane,
      laneKey: track.laneKey,
      maxDelta: stats?.maxDelta ?? null,
      maxVelocity: stats?.maxVelocity ?? null,
      overshootCount: stats?.overshootCount ?? 0,
      prop: track.prop,
      retargetCount: stats?.retargetCount ?? 0,
      sampleCount: track.sampleCount,
      sourceLabel: track.sourceLabel,
      targetId: track.targetId,
      timeRangeMs: finalizeRange(track.timeRangeMs),
      valueRange: finalizeRange(track.valueRange),
      velocityRange: finalizeRange(track.velocityRange),
    };
    if (includeLayer && track.layer !== undefined) result.layer = track.layer;
    return result;
  });

  if (sortMode === "key") {
    return tracks.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }
  return tracks.sort((a, b) => (b.sampleCount - a.sampleCount) || String(a.key).localeCompare(String(b.key)));
}

export function makeTargetsById(
  trace: { targets?: readonly MotionTraceRecord[] } = {},
): Map<number | string, MotionTraceRecord> {
  const targets = new Map<number | string, MotionTraceRecord>();
  for (const target of trace.targets || []) {
    if (target?.targetId != null) targets.set(target.targetId, target);
  }
  return targets;
}

export function normalizeQuery(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function resolveRecordLabel(
  record: MotionTraceRecord = {},
  targetsById: ReadonlyMap<number | string, MotionTraceRecord> | null = null,
  options: { includeRecordLabel?: boolean } = {},
): string {
  const hasTargets = targetsById != null;
  const target = record.targetId != null && targetsById ? targetsById.get(record.targetId) : undefined;
  const includeRecordLabel = options.includeRecordLabel ?? !hasTargets;
  return record.sourceLabel
    || record.targetLabel
    || (includeRecordLabel ? record.label : undefined)
    || target?.sourceLabel
    || target?.label
    || (record.targetId != null ? `target ${record.targetId}` : "unknown");
}

export function collectRecordText(
  record: MotionTraceRecord = {},
  targetsById: ReadonlyMap<number | string, MotionTraceRecord> | null = null,
  options: {
    includeLayer?: boolean;
    includeRecordKind?: boolean;
    includeTargetLayer?: boolean;
    includeWarningType?: boolean;
  } = {},
): string {
  const target = record.targetId != null && targetsById ? targetsById.get(record.targetId) : undefined;
  return [
    record.type,
    record.reason,
    options.includeWarningType ? record.warningType : null,
    record.targetId,
    record.targetKind,
    record.targetLabel,
    record.sourceLabel,
    record.label,
    options.includeLayer ? record.layer : null,
    options.includeRecordKind ? record.kind : null,
    record.prop,
    record.driver,
    record.lane,
    record.laneKey,
    target?.kind,
    target?.label,
    options.includeTargetLayer ? target?.layer : null,
    target?.sourceLabel,
  ].filter((value) => value != null).join(" ").toLowerCase();
}
