import { getFolderPreviewSlots } from "../../../domain/launchpadLayout.js";
import { stageLayoutRecordToClientRect, STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";
import type { StageVisualRect } from "../geometry/stageCoordinates.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import type {
  IconBoundsRecord,
  IconBoundsRegistry,
  IconBoundsRect,
} from "../geometry/iconBoundsRegistry.js";
import { makeStableFolderCloseTarget } from "./folderOverlayTargets.js";
import type {
  FolderOverlayItem,
  FolderOverlayRect,
  StableFolderCloseTarget,
} from "./folderOverlayTargets.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;

export interface CapturedFolderOriginBounds {
  folderId: string;
  iconRect: FolderOverlayRect;
  previewChildRects: readonly {
    childId: string;
    rect: FolderOverlayRect;
    slotIndex: number;
  }[];
  thumbRect: FolderOverlayRect;
}

export interface FolderOverlayTargetFolder {
  childPages?: readonly (readonly (FolderOverlayItem | null | undefined)[])[];
  id?: string | null;
}

export interface FolderOpeningOriginFolder {
  childPages?: readonly (readonly (
    Readonly<{ id?: string | null }> | null | undefined
  )[])[];
  id?: string | null;
}

interface ResolveFolderOverlayTargetsOptions {
  folder?: FolderOverlayTargetFolder | null | undefined;
  folderOpeningOriginBounds?: CapturedFolderOriginBounds | null | undefined;
  folderPageSize?: number | undefined;
  iconBoundsRegistry?: IconBoundsRegistry | null | undefined;
  isClosing?: boolean | undefined;
  previousStableFolderCloseTarget?: StableFolderCloseTarget | null | undefined;
  wasClosing?: boolean | undefined;
}

export interface CaptureFolderOpeningOriginBoundsOptions {
  fallbackIconRect?: FolderOverlayRect | null | undefined;
  folder?: FolderOpeningOriginFolder | null | undefined;
  folderPageSize?: number | undefined;
  iconBoundsRegistry: IconBoundsRegistry;
}

export interface ResolvedFolderOverlayTargets {
  capturedOriginBounds: CapturedFolderOriginBounds | null;
  closeTargetSource: string | null;
  coordinateSpace: typeof STAGE_COORDINATE_SPACES.CLIENT_VISUAL;
  desktopIconSize: number | null;
  desktopSlot: Readonly<{
    area: string | null;
    index: number;
    pageIndex: number;
  }> | null;
  folderClientRect: FolderOverlayRect | null;
  folderId: string | null;
  folderThumbClientRect: FolderOverlayRect | null;
  getOpeningPreviewChildClientRect: (
    item: FolderOverlayItem | null | undefined,
    previewSlotIndex: number
  ) => IconBoundsRect | FolderOverlayRect | null;
  previewSlots: readonly (FolderOverlayItem | null)[];
  stableFolderCloseTarget: StableFolderCloseTarget | null;
}

interface RenderedCloseTargetTrackingOptions {
  folderId?: string | null;
  iconRect?: FolderOverlayRect | null;
  previewChildRects?: readonly Readonly<{
    childId: string;
    rect: FolderOverlayRect | null;
    slotIndex: number;
  }>[];
  thumbRect?: FolderOverlayRect | null;
}

export function getCapturedPreviewChildRect(
  originBounds: CapturedFolderOriginBounds | null | undefined,
  childId: string | null | undefined,
  slotIndex: number
): FolderOverlayRect | null {
  if (!originBounds?.previewChildRects?.length || !childId) return null;
  const exact = originBounds.previewChildRects.find((entry) => entry?.childId === childId && entry.slotIndex === slotIndex);
  return exact?.rect || originBounds.previewChildRects.find((entry) => entry?.childId === childId)?.rect || null;
}

function projectStableRecordToClient(record: IconBoundsRecord | null): StageVisualRect | null {
  return stageLayoutRecordToClientRect(record);
}

function remapRenderedBoundsToStableFrame(
  rendered: FolderOverlayRect,
  liveTarget: FolderOverlayRect,
  stableTarget: FolderOverlayRect,
): FolderOverlayRect | null {
  if (liveTarget.width <= 0 || liveTarget.height <= 0) return null;
  const scaleX = stableTarget.width / liveTarget.width;
  const scaleY = stableTarget.height / liveTarget.height;
  if (![scaleX, scaleY].every(Number.isFinite)) return null;
  return {
    height: rendered.height * scaleY,
    left: stableTarget.left + (rendered.left - liveTarget.left) * scaleX,
    top: stableTarget.top + (rendered.top - liveTarget.top) * scaleY,
    width: rendered.width * scaleX,
  };
}

function getCanonicalClientBounds(
  iconBoundsRegistry: IconBoundsRegistry,
  kind: typeof BOUNDS_KIND.TOP_LEVEL | typeof BOUNDS_KIND.FOLDER_THUMB | typeof BOUNDS_KIND.PREVIEW_CHILD,
  key: Parameters<IconBoundsRegistry["getBounds"]>[2],
): FolderOverlayRect | null {
  const stableTarget = projectStableRecordToClient(
    iconBoundsRegistry.getRecord(kind, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, key),
  );
  const liveTarget = iconBoundsRegistry.getBounds(kind, BOUNDS_VARIANT.LIVE_TARGET, key);
  const rendered = iconBoundsRegistry.getBounds(kind, BOUNDS_VARIANT.RENDERED, key);
  if (stableTarget && liveTarget && rendered) {
    return remapRenderedBoundsToStableFrame(rendered, liveTarget, stableTarget) || stableTarget;
  }
  return stableTarget || liveTarget || rendered;
}

export function captureFolderOpeningOriginBounds(
  options: CaptureFolderOpeningOriginBoundsOptions,
): CapturedFolderOriginBounds | null {
  const {
    fallbackIconRect = null,
    folder,
    folderPageSize,
    iconBoundsRegistry,
  } = options;
  const folderId = folder?.id || null;
  if (!folderId) return null;
  const iconRect = getCanonicalClientBounds(
    iconBoundsRegistry,
    BOUNDS_KIND.TOP_LEVEL,
    folderId,
  ) || fallbackIconRect;
  if (!iconRect) return null;
  const thumbRect = getCanonicalClientBounds(
    iconBoundsRegistry,
    BOUNDS_KIND.FOLDER_THUMB,
    folderId,
  ) || iconRect;
  const previewSlots = getFolderPreviewSlots<Readonly<{ id?: string | null }>>(
    folder ?? [],
    folderPageSize,
  );
  const previewChildRects = previewSlots.flatMap((item, slotIndex) => {
    if (!item?.id) return [];
    const rect = getCanonicalClientBounds(
      iconBoundsRegistry,
      BOUNDS_KIND.PREVIEW_CHILD,
      { childId: item.id, folderId, slotIndex },
    );
    return rect ? [{ childId: item.id, rect, slotIndex }] : [];
  });
  return {
    folderId,
    iconRect,
    previewChildRects,
    thumbRect,
  };
}

function rectTrackingKey(rect: FolderOverlayRect | null | undefined): string {
  if (!rect) return "null";
  return [
    rect.left,
    rect.top,
    rect.width,
    rect.height,
  ].map((value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : "null";
  }).join(",");
}

function makeRenderedCloseTargetTrackingKey(options: RenderedCloseTargetTrackingOptions = {}): string {
  const {
    folderId = null,
    iconRect = null,
    previewChildRects = [],
    thumbRect = null,
  } = options;
  return [
    "rendered-close-target",
    folderId || "",
    `icon:${rectTrackingKey(iconRect)}`,
    `thumb:${rectTrackingKey(thumbRect)}`,
    ...previewChildRects.map(({ childId, rect, slotIndex }) =>
      `child:${childId}:${slotIndex}:${rectTrackingKey(rect)}`),
  ].join("|");
}

export function resolveFolderOverlayTargets(
  options: ResolveFolderOverlayTargetsOptions = {}
): ResolvedFolderOverlayTargets {
  const {
    folder,
    folderOpeningOriginBounds = null,
    folderPageSize,
    iconBoundsRegistry,
    isClosing = false,
    previousStableFolderCloseTarget = null,
    wasClosing = false,
  } = options;
  const folderId = folder?.id || null;
  const previewSlots = getFolderPreviewSlots<FolderOverlayItem>(folder ?? [], folderPageSize);
  if (!folderId) {
    return {
      capturedOriginBounds: null,
      closeTargetSource: null,
      coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      desktopIconSize: null,
      desktopSlot: null,
      folderClientRect: null,
      folderId: null,
      folderThumbClientRect: null,
      getOpeningPreviewChildClientRect: () => null,
      previewSlots,
      stableFolderCloseTarget: previousStableFolderCloseTarget,
    };
  }
  if (!iconBoundsRegistry) throw new Error("resolveFolderOverlayTargets requires iconBoundsRegistry");

  const capturedOriginBounds = folderOpeningOriginBounds?.folderId === folderId
    ? folderOpeningOriginBounds
    : null;
  const liveFolderRecord = iconBoundsRegistry.getRecord(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.RENDERED, folderId, {
    owner: "FolderOverlayLayer.open.folderRect",
    warnIfMissing: true,
  });
  const liveFolderClientRect = liveFolderRecord;
  const liveFolderThumbClientRect = iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, folderId) || liveFolderClientRect;
  const folderClientRect = capturedOriginBounds?.iconRect || liveFolderClientRect;
  const folderThumbClientRect = capturedOriginBounds?.thumbRect || liveFolderThumbClientRect || folderClientRect;
  const getOpeningPreviewChildClientRect = (
    item: FolderOverlayItem | null | undefined,
    previewSlotIndex: number,
  ) => getCapturedPreviewChildRect(capturedOriginBounds, item?.id, previewSlotIndex) ||
    iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, {
      childId: item?.id,
      folderId,
      slotIndex: previewSlotIndex,
    });
  const stableFolderStageLayoutRecord = iconBoundsRegistry.getBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folderId);
  const stableFolderThumbStageLayoutRecord = iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folderId);
  const renderedFolderTargetRect = isClosing ? liveFolderClientRect : null;
  const renderedFolderThumbTargetRect = isClosing
    ? liveFolderThumbClientRect || renderedFolderTargetRect
    : null;
  const renderedPreviewChildRects = isClosing
    ? previewSlots.flatMap((item, slotIndex) => item?.id
      ? [{
        childId: item.id,
        rect: iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, {
          childId: item.id,
          folderId,
          slotIndex,
        }),
        slotIndex,
      }]
      : [])
    : [];
  const renderedCloseTrackingKey = renderedFolderTargetRect
    ? makeRenderedCloseTargetTrackingKey({
      folderId,
      iconRect: renderedFolderTargetRect,
      previewChildRects: renderedPreviewChildRects,
      thumbRect: renderedFolderThumbTargetRect,
    })
    : null;
  const shouldUseRenderedCloseTarget = Boolean(isClosing && renderedFolderTargetRect);
  const shouldRefreshRenderedCloseTarget = Boolean(
    shouldUseRenderedCloseTarget &&
    (!previousStableFolderCloseTarget ||
      previousStableFolderCloseTarget.folderId !== folderId ||
      previousStableFolderCloseTarget.coordinateSpace !== STAGE_COORDINATE_SPACES.CLIENT_VISUAL ||
      previousStableFolderCloseTarget.trackingKey !== renderedCloseTrackingKey)
  );
  const shouldRefreshStableCloseTarget = Boolean(
    !shouldUseRenderedCloseTarget &&
    stableFolderStageLayoutRecord &&
    (!previousStableFolderCloseTarget ||
      previousStableFolderCloseTarget.folderId !== folderId ||
      previousStableFolderCloseTarget.coordinateSpace !== STAGE_COORDINATE_SPACES.STAGE_LAYOUT ||
      (isClosing && !wasClosing))
  );
  const slotRecord = liveFolderRecord || stableFolderStageLayoutRecord;
  const slotVisualSpec = slotRecord?.meta && typeof slotRecord.meta === "object"
    ? Reflect.get(slotRecord.meta, "visualSpec")
    : null;
  const slotIconSize = slotVisualSpec && typeof slotVisualSpec === "object"
    ? Number(Reflect.get(slotVisualSpec, "iconSize"))
    : Number.NaN;
  const desktopIconSize = Number.isFinite(slotIconSize) && slotIconSize > 0
    ? slotIconSize
    : null;
  const slotIndex = Number(slotRecord?.meta?.index);
  const slotPageIndex = Number(slotRecord?.meta?.pageIndex);
  const desktopSlot = Number.isFinite(slotIndex)
    ? {
      area: slotRecord?.meta?.area || null,
      index: Math.max(0, Math.trunc(slotIndex)),
      pageIndex: Number.isFinite(slotPageIndex) ? Math.max(0, Math.trunc(slotPageIndex)) : 0,
    }
    : null;
  if (!shouldRefreshRenderedCloseTarget && !shouldRefreshStableCloseTarget) {
    return {
      capturedOriginBounds,
      closeTargetSource: previousStableFolderCloseTarget?.source || null,
      coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      desktopIconSize,
      desktopSlot,
      folderClientRect,
      folderId,
      folderThumbClientRect,
      getOpeningPreviewChildClientRect,
      previewSlots,
      stableFolderCloseTarget: previousStableFolderCloseTarget,
    };
  }

  const stableProjection = stableFolderStageLayoutRecord?.meta
    ? {
      stageHeight: stableFolderStageLayoutRecord.meta.stageHeight,
      stageRect: stableFolderStageLayoutRecord.meta.stageRect,
      stageWidth: stableFolderStageLayoutRecord.meta.stageWidth,
    }
    : null;
  const stableFolderCloseTarget = shouldRefreshRenderedCloseTarget
    ? makeStableFolderCloseTarget({
      coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      folderId,
      getStageLayoutPreviewChildRect: (item, previewSlotIndex) =>
        iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, { childId: item.id, folderId, slotIndex: previewSlotIndex }),
      iconRect: renderedFolderTargetRect,
      previewSlots,
      projection: null,
      source: isClosing && !wasClosing ? "rendered-final-close" : "rendered-target",
      thumbRect: renderedFolderThumbTargetRect || renderedFolderTargetRect,
      trackingKey: renderedCloseTrackingKey,
    })
    : makeStableFolderCloseTarget({
      folderId,
      getStageLayoutPreviewChildRect: (item, previewSlotIndex) => {
        const stablePreviewRecord = iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, { childId: item.id, folderId, slotIndex: previewSlotIndex });
        const stablePreviewClientRect = projectStableRecordToClient(stablePreviewRecord);
        return stablePreviewClientRect ? stablePreviewRecord : null;
      },
      iconRect: stableFolderStageLayoutRecord,
      previewSlots,
      projection: stableProjection,
      source: isClosing && !wasClosing ? "stable-final-close" : "stable-target",
      thumbRect: stableFolderThumbStageLayoutRecord || stableFolderStageLayoutRecord,
    });

  return {
    capturedOriginBounds,
    closeTargetSource: stableFolderCloseTarget?.source || null,
    coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    desktopIconSize,
    desktopSlot,
    folderClientRect,
    folderId,
    folderThumbClientRect,
    getOpeningPreviewChildClientRect,
    previewSlots,
    stableFolderCloseTarget,
  };
}
