import {
  getCenteredLocalRect,
  getTransformedLocalRectBounds,
} from "../geometry/displayObjectBounds.js";
import {
  makeTrackKey,
  readNumber,
  readPositiveNumber,
  resolveRecordLabel,
} from "./motionTraceShared.js";
import type { MotionTraceRecord } from "./motionTraceShared.js";
import type { StagePoint, StageRect } from "../geometry/stageCoordinates.js";

const DEFAULT_MAX_OVERLAY_ITEMS = 18;
const FALLBACK_TARGET_SIZE = 28;
const OVERLAY_COLORS = Object.freeze({
  default: 0x64d8ff,
  target: 0xffffff,
  warning: 0xffc857,
});

interface MotionOverlayTransform {
  apply(point: StagePoint): StagePoint;
}

export interface MotionOverlayTarget {
  destroyed?: boolean;
  getGlobalPosition?: () => StagePoint | null | undefined;
  getGlobalTransform?: () => MotionOverlayTransform | null | undefined;
  iconSize?: unknown;
}

export interface MotionOverlayReport {
  animations?: readonly MotionTraceRecord[];
  targets?: readonly MotionTraceRecord[];
  warnings?: readonly MotionTraceRecord[];
}

export interface MotionOverlayVector {
  from: StagePoint;
  to: StagePoint;
}

export interface MotionOverlayItem {
  animationCount: number;
  area: number;
  color: number;
  hasWarning: boolean;
  key: string;
  label: string;
  laneSummary: string;
  propSummary: string;
  rect: StageRect;
  targetId: number | string;
  vector: MotionOverlayVector | null;
}

export interface BuildMotionOverlayItemsOptions {
  enabled?: boolean;
  maxItems?: number;
  resolveTarget?: (
    targetId: number | string,
    context: Readonly<{ animations: readonly MotionTraceRecord[] }>,
  ) => unknown;
}

function normalizeRect(rect: Partial<StageRect> | null | undefined): StageRect | null {
  if (!rect) return null;
  const width = readPositiveNumber(rect.width);
  const height = readPositiveNumber(rect.height);
  if (width <= 0 || height <= 0) return null;
  return {
    height,
    left: readNumber(rect.left),
    top: readNumber(rect.top),
    width,
  };
}

function hasGlobalTransform(target: unknown): target is MotionOverlayTarget {
  return typeof (target as MotionOverlayTarget | null | undefined)?.getGlobalTransform === "function" ||
    typeof (target as MotionOverlayTarget | null | undefined)?.getGlobalPosition === "function";
}

function resolveIconSize(target: MotionOverlayTarget | null | undefined, metadata: MotionTraceRecord = {}): number {
  return readPositiveNumber(target?.iconSize, readPositiveNumber(metadata.iconSize));
}

export function resolveMotionOverlayLocalRect(
  target: MotionOverlayTarget | null | undefined,
  metadata: MotionTraceRecord = {},
): StageRect {
  const iconSize = resolveIconSize(target, metadata);
  if (iconSize > 0) return getCenteredLocalRect(iconSize);

  const width = readPositiveNumber(metadata.width, readPositiveNumber(metadata.pageSpan));
  const height = readPositiveNumber(metadata.height);
  if (width > 0 && height > 0) {
    const kind = String(metadata.kind || "");
    const targetPart = String(metadata.targetPart || "");
    if (kind === "Desktop" || kind === "FolderOverlay" || targetPart.includes("pageTrack")) {
      return { height, left: 0, top: 0, width };
    }
    return {
      height,
      left: -width / 2,
      top: -height / 2,
      width,
    };
  }

  return getCenteredLocalRect(FALLBACK_TARGET_SIZE);
}

export function mapMotionOverlayTargetRect(
  target: MotionOverlayTarget | null | undefined,
  localRect: Partial<StageRect> | null | undefined,
): StageRect | null {
  if (!target || target.destroyed) return null;
  const rect = normalizeRect(localRect);
  if (!rect) return null;
  const transformed = getTransformedLocalRectBounds(target.getGlobalTransform?.(), rect);
  if (transformed) return normalizeRect(transformed);
  const global = target.getGlobalPosition?.();
  if (!global) return null;
  return normalizeRect({
    height: rect.height,
    left: readNumber(global.x) + rect.left,
    top: readNumber(global.y) + rect.top,
    width: rect.width,
  });
}

function makeWarningKeys(warnings: readonly MotionTraceRecord[] = []) {
  const targetIds = new Set<number | string>();
  const trackKeys = new Set<string>();
  for (const warning of warnings || []) {
    if (warning?.targetId != null) targetIds.add(warning.targetId);
    trackKeys.add(makeTrackKey(warning));
  }
  return { targetIds, trackKeys };
}

function collectActiveAnimationGroups(report: MotionOverlayReport = {}) {
  const groups = new Map<number | string, MotionTraceRecord[]>();
  for (const animation of report.animations || []) {
    if (animation?.targetId == null) continue;
    let group = groups.get(animation.targetId);
    if (!group) {
      group = [];
      groups.set(animation.targetId, group);
    }
    group.push(animation);
  }
  return groups;
}

function makeTargetMetadata(report: MotionOverlayReport = {}) {
  const byId = new Map<number | string, MotionTraceRecord>();
  for (const target of report.targets || []) {
    if (target?.targetId != null) byId.set(target.targetId, target);
  }
  return byId;
}

function makeTargetVector(
  rect: StageRect,
  animations: readonly MotionTraceRecord[] = [],
): MotionOverlayVector | null {
  const center = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  let dx = 0;
  let dy = 0;
  for (const animation of animations) {
    const delta = readNumber(animation.to, 0) - readNumber(animation.value, 0);
    if (animation.prop === "x") dx += delta;
    if (animation.prop === "y") dy += delta;
  }
  const length = Math.hypot(dx, dy);
  if (length <= 0.01) return null;
  const clamped = Math.min(90, length);
  return {
    from: center,
    to: {
      x: center.x + (dx / length) * clamped,
      y: center.y + (dy / length) * clamped,
    },
  };
}

function makePropSummary(animations: readonly MotionTraceRecord[] = []): string {
  const props = Array.from(new Set(animations.map((animation) => animation.prop).filter(Boolean)));
  return props.slice(0, 3).join(",") + (props.length > 3 ? `+${props.length - 3}` : "");
}

function makeLaneSummary(animations: readonly MotionTraceRecord[] = []): string {
  const lanes = Array.from(new Set(animations.map((animation) => [animation.lane, animation.laneKey].filter(Boolean).join("/")).filter(Boolean)));
  return lanes.slice(0, 2).join(" ") + (lanes.length > 2 ? ` +${lanes.length - 2}` : "");
}

export function buildMotionOverlayItems(
  report: MotionOverlayReport = {},
  options: BuildMotionOverlayItemsOptions = {},
): MotionOverlayItem[] {
  if (!options.enabled) return [];
  const resolveTarget = typeof options.resolveTarget === "function" ? options.resolveTarget : () => null;
  const maxItems = Math.max(0, Math.floor(readNumber(options.maxItems, DEFAULT_MAX_OVERLAY_ITEMS)));
  if (maxItems <= 0) return [];
  const groups = collectActiveAnimationGroups(report);
  const metadataById = makeTargetMetadata(report);
  const warningKeys = makeWarningKeys(report.warnings);
  const items: MotionOverlayItem[] = [];

  for (const [targetId, animations] of groups) {
    const resolvedTarget = resolveTarget(targetId, { animations });
    if (!hasGlobalTransform(resolvedTarget)) continue;
    const metadata = {
      ...(metadataById.get(targetId) || {}),
      ...(animations[0] as MotionTraceRecord),
    };
    const rect = mapMotionOverlayTargetRect(
      resolvedTarget,
      resolveMotionOverlayLocalRect(resolvedTarget, metadata)
    );
    if (!rect) continue;
    const hasWarning = warningKeys.targetIds.has(targetId) || animations.some((animation) => warningKeys.trackKeys.has(makeTrackKey(animation)));
    const propSummary = makePropSummary(animations);
    const laneSummary = makeLaneSummary(animations);
    const label = resolveRecordLabel(metadata);
    items.push({
      animationCount: animations.length,
      area: rect.width * rect.height,
      color: hasWarning ? OVERLAY_COLORS.warning : OVERLAY_COLORS.default,
      hasWarning,
      key: String(targetId),
      label,
      laneSummary,
      propSummary,
      rect,
      targetId,
      vector: makeTargetVector(rect, animations),
    });
  }

  return items
    .sort((a, b) => (a.area - b.area) || a.label.localeCompare(b.label))
    .slice(0, maxItems);
}
