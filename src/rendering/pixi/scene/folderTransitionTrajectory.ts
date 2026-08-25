import { reloadOnPixiHotUpdate } from "../devHmr.js";
import type { StageRect } from "../geometry/stageCoordinates.js";

const CENTER_DIRECTION_INNER_RADIUS = 0.2;
const CENTER_DIRECTION_OUTER_RADIUS = 0.55;
const MAX_TERMINAL_ANGLE_RADIANS = Math.PI / 10;
const MIN_PATH_DISTANCE = 0.001;
const MIN_SAMPLE_PROGRESS = -0.08;
const MAX_SAMPLE_PROGRESS = 1.08;

export type FolderTransitionPlacement = Readonly<{
  col: number;
  cols: number;
  row: number;
  rows: number;
}>;

export type FolderTransitionTrajectoryInput = Readonly<{
  desktopRect: StageRect;
  panelRect: StageRect;
  placement?: FolderTransitionPlacement | null | undefined;
}>;

export type FolderTransitionTrajectory = Readonly<{
  desktopClosingDirection: Readonly<{ x: number; y: number }>;
  desktopRect: StageRect;
  panelRect: StageRect;
  placement: FolderTransitionPlacement | null;
  sample(progress: number): StageRect;
}>;

type Point = Readonly<{ x: number; y: number }>;

function finiteNumber(value: unknown, path: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${path} must be a finite number`);
  return number;
}

function requireRect(rect: StageRect, path: string): StageRect {
  if (!rect || typeof rect !== "object") throw new TypeError(`${path} must be an object`);
  const result = {
    height: finiteNumber(rect.height, `${path}.height`),
    left: finiteNumber(rect.left, `${path}.left`),
    top: finiteNumber(rect.top, `${path}.top`),
    width: finiteNumber(rect.width, `${path}.width`),
  };
  if (!(result.width > 0) || !(result.height > 0)) {
    throw new RangeError(`${path} must have positive width and height`);
  }
  return result;
}

function normalizePlacement(
  placement: FolderTransitionPlacement | null | undefined,
): FolderTransitionPlacement | null {
  if (!placement) return null;
  const rows = Math.max(1, Math.trunc(finiteNumber(placement.rows, "placement.rows")));
  const cols = Math.max(1, Math.trunc(finiteNumber(placement.cols, "placement.cols")));
  const row = Math.max(0, Math.min(rows - 1, Math.trunc(finiteNumber(placement.row, "placement.row"))));
  const col = Math.max(0, Math.min(cols - 1, Math.trunc(finiteNumber(placement.col, "placement.col"))));
  return { col, cols, row, rows };
}

function center(rect: StageRect): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const progress = clamp01((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

function normalize(point: Point): Point | null {
  const length = Math.hypot(point.x, point.y);
  if (!(length > MIN_PATH_DISTANCE)) return null;
  return { x: point.x / length, y: point.y / length };
}

function rotate(point: Point, radians: number): Point {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function getPlacementDirection(placement: FolderTransitionPlacement | null): Point | null {
  if (!placement) return null;
  const normalizedX = placement.cols > 1
    ? (placement.col / (placement.cols - 1)) * 2 - 1
    : 0;
  const normalizedY = placement.rows > 1
    ? (placement.row / (placement.rows - 1)) * 2 - 1
    : 0;
  return normalize({ x: normalizedX, y: normalizedY });
}

function getPlacementDirectionWeight(placement: FolderTransitionPlacement | null): number {
  if (!placement) return 0;
  const normalizedX = placement.cols > 1
    ? (placement.col / (placement.cols - 1)) * 2 - 1
    : 0;
  const normalizedY = placement.rows > 1
    ? (placement.row / (placement.rows - 1)) * 2 - 1
    : 0;
  const radius = Math.min(1, Math.hypot(normalizedX, normalizedY));
  return smoothstep(CENTER_DIRECTION_INNER_RADIUS, CENTER_DIRECTION_OUTER_RADIUS, radius);
}

function getDesktopOpeningTangent(
  desktopCenter: Point,
  panelCenter: Point,
  placement: FolderTransitionPlacement | null,
): Point {
  const delta = {
    x: panelCenter.x - desktopCenter.x,
    y: panelCenter.y - desktopCenter.y,
  };
  const distance = Math.hypot(delta.x, delta.y);
  const naturalOpeningDirection = normalize(delta) || { x: 0, y: -1 };
  const desktopClosingDirection = getPlacementDirection(placement);
  if (!desktopClosingDirection) return delta;

  const desiredOpeningDirection = {
    x: -desktopClosingDirection.x,
    y: -desktopClosingDirection.y,
  };
  const cross = naturalOpeningDirection.x * desiredOpeningDirection.y -
    naturalOpeningDirection.y * desiredOpeningDirection.x;
  const dot = naturalOpeningDirection.x * desiredOpeningDirection.x +
    naturalOpeningDirection.y * desiredOpeningDirection.y;
  const angularDelta = Math.atan2(cross, dot);
  const weightedDelta = clamp(
    angularDelta * getPlacementDirectionWeight(placement),
    -MAX_TERMINAL_ANGLE_RADIANS,
    MAX_TERMINAL_ANGLE_RADIANS,
  );
  const direction = rotate(naturalOpeningDirection, weightedDelta);
  return {
    x: direction.x * distance,
    y: direction.y * distance,
  };
}

function sampleHermite(
  from: number,
  to: number,
  fromTangent: number,
  toTangent: number,
  progress: number,
): number {
  const squared = progress * progress;
  const cubed = squared * progress;
  const h00 = 2 * cubed - 3 * squared + 1;
  const h10 = cubed - 2 * squared + progress;
  const h01 = -2 * cubed + 3 * squared;
  const h11 = cubed - squared;
  return h00 * from + h10 * fromTangent + h01 * to + h11 * toTangent;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

export function makeFolderTransitionPlacement(
  slotIndex: unknown,
  options: Readonly<{
    cols: unknown;
    isSearchMode?: boolean | undefined;
    rows: unknown;
    visibleCount?: unknown;
  }>,
): FolderTransitionPlacement {
  const configuredCols = Math.max(1, Math.trunc(finiteNumber(options.cols, "options.cols")));
  const rows = Math.max(1, Math.trunc(finiteNumber(options.rows, "options.rows")));
  const visibleCount = Math.max(0, Math.trunc(Number(options.visibleCount) || 0));
  const cols = options.isSearchMode && visibleCount > 0 && visibleCount < configuredCols
    ? visibleCount
    : configuredCols;
  const index = Math.max(0, Math.trunc(finiteNumber(slotIndex, "slotIndex")));
  return normalizePlacement({
    col: index % cols,
    cols,
    row: Math.floor(index / cols),
    rows,
  })!;
}

export function createFolderTransitionTrajectory(
  input: FolderTransitionTrajectoryInput,
): FolderTransitionTrajectory {
  const desktopRect = requireRect(input.desktopRect, "desktopRect");
  const panelRect = requireRect(input.panelRect, "panelRect");
  const placement = normalizePlacement(input.placement);
  const desktopCenter = center(desktopRect);
  const panelCenter = center(panelRect);
  const naturalDelta = {
    x: panelCenter.x - desktopCenter.x,
    y: panelCenter.y - desktopCenter.y,
  };
  const desktopOpeningTangent = getDesktopOpeningTangent(desktopCenter, panelCenter, placement);
  const placementClosingDirection = getPlacementDirection(placement);
  const naturalClosingDirection = normalize({ x: -naturalDelta.x, y: -naturalDelta.y }) || { x: 0, y: 1 };
  const desktopClosingDirection = normalize({
    x: -desktopOpeningTangent.x,
    y: -desktopOpeningTangent.y,
  }) || placementClosingDirection || naturalClosingDirection;

  return Object.freeze({
    desktopClosingDirection: Object.freeze(desktopClosingDirection),
    desktopRect: Object.freeze({ ...desktopRect }),
    panelRect: Object.freeze({ ...panelRect }),
    placement: placement ? Object.freeze({ ...placement }) : null,
    sample(progress: number): StageRect {
      const positionProgress = clamp(
        finiteNumber(progress, "progress"),
        MIN_SAMPLE_PROGRESS,
        MAX_SAMPLE_PROGRESS,
      );
      const sizeProgress = clamp01(positionProgress);
      const centerX = sampleHermite(
        desktopCenter.x,
        panelCenter.x,
        desktopOpeningTangent.x,
        naturalDelta.x,
        positionProgress,
      );
      const centerY = sampleHermite(
        desktopCenter.y,
        panelCenter.y,
        desktopOpeningTangent.y,
        naturalDelta.y,
        positionProgress,
      );
      const width = lerp(desktopRect.width, panelRect.width, sizeProgress);
      const height = lerp(desktopRect.height, panelRect.height, sizeProgress);
      return {
        height,
        left: centerX - width / 2,
        top: centerY - height / 2,
        width,
      };
    },
  });
}

reloadOnPixiHotUpdate(import.meta.hot);
