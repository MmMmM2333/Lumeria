import type { PointData } from "pixi.js";
import type {
  GroupTransferActor,
  GroupTransferAlphaPolicy,
  GroupTransferAnchor,
  GroupTransferVisibilityPolicy,
} from "../../../domain/groupTransferPresentation.js";
import type { GroupTransferEffects } from "../../../domain/groupTransferPlanner.js";
import type { GroupTransferItem } from "../../../domain/groupTransferSourceCapture.js";

export const GROUP_TRANSFER_RUNTIME_MODE = Object.freeze({
  CREATED_FOLDER: "created-folder",
  FOLDER_CENTER_ABSORB: "folder-center-absorb",
  FOLDER_PREVIEW_SLOT: "folder-preview-slot",
  POINT_HANDOFF: "point-handoff",
  RETURN: "return",
});

export type GroupTransferRuntimeMode = typeof GROUP_TRANSFER_RUNTIME_MODE[keyof typeof GROUP_TRANSFER_RUNTIME_MODE];
export type GroupTransferRuntimeRole = GroupTransferActor["role"] | "folder-create-target";

export interface GroupTransferRuntimeActor {
  alphaPolicy?: GroupTransferAlphaPolicy;
  bundleCount?: number;
  continuityKey?: string;
  delayGroup?: number;
  endAnchor?: GroupTransferAnchor;
  item?: GroupTransferItem | null;
  key?: string;
  memberIds?: readonly string[];
  representativeId?: string | null;
  role?: GroupTransferRuntimeRole;
  sourceOrder?: number;
  startAnchor?: GroupTransferAnchor;
  visibilityPolicy?: GroupTransferVisibilityPolicy;
  zBand?: number;
}

export interface GroupTransferRuntimeSourceEntry {
  delayMs?: number;
  item: GroupTransferItem;
  memberIds?: readonly string[];
  order?: number;
  origin: PointData;
  originAlpha?: number;
  originKind: string;
  originScale?: number;
}

interface GroupTransferRuntimePresentationPlan {
  actors?: readonly GroupTransferRuntimeActor[];
  phase?: unknown;
  status?: string;
}

interface MakeGroupTransferRuntimeEntriesOptions {
  phase?: unknown;
  presentationPlan?: GroupTransferRuntimePresentationPlan;
  sourceEntries?: readonly GroupTransferRuntimeSourceEntry[];
}

export type GroupTransferReleaseStart =
  | { kind: "current-pose" }
  | {
    alpha: number;
    kind: "source-origin";
    point: PointData;
    scale: number;
  }
  | null;

export interface GroupTransferRuntimeEntry extends GroupTransferRuntimeSourceEntry {
  actorKey: string | undefined;
  alphaPolicy: GroupTransferAlphaPolicy | undefined;
  bundleCount: number;
  continuityKey: string | undefined;
  delayMs: number;
  endAnchor: GroupTransferAnchor | undefined;
  item: GroupTransferItem;
  memberIds: string[];
  order: number;
  originKind: string;
  presentationRole: GroupTransferRuntimeRole | undefined;
  releaseRole: "folder-create-target" | "lead" | "member";
  releaseStart: GroupTransferReleaseStart;
  startAnchor: GroupTransferAnchor | undefined;
  visibilityPolicy: GroupTransferVisibilityPolicy;
  zBand: number;
}

interface GroupTransferTransferPlanLike {
  effects?: Partial<GroupTransferEffects>;
  status?: string;
}

interface MakeGroupTransferRuntimeReleasePlanOptions {
  key?: string;
  phase?: unknown;
  presentationPlan?: GroupTransferRuntimePresentationPlan;
  transferPlan?: GroupTransferTransferPlanLike | null;
  velocity?: PointData | null;
}

export type GroupTransferRuntimeTarget = {
  area?: "desktop" | "folder";
  expectedChildId?: string | null;
  folderId: string | null;
  id?: string | null | undefined;
  index?: number | null;
  pageIndex?: number | undefined;
  semanticAnchor: Partial<GroupTransferAnchor>;
  slotIndex?: number | null;
};

export interface GroupTransferRuntimeReleaseEntry {
  actorKey: string | undefined;
  alphaPolicy: GroupTransferAlphaPolicy | undefined;
  continuityKey: string | undefined;
  delayMs: number;
  id: string;
  item: GroupTransferItem;
  memberIds: string[];
  mode: GroupTransferRuntimeMode;
  order: number;
  originAlpha: 1;
  originScale: 1;
  target: GroupTransferRuntimeTarget;
  velocity: PointData;
  visibilityPolicy: GroupTransferVisibilityPolicy;
  zBand: number;
}

function clonePoint(
  point: Partial<PointData> | null | undefined,
  fallback: PointData = { x: 0, y: 0 }
): PointData {
  const pointX = point?.x;
  const pointY = point?.y;
  return {
    x: Number.isFinite(Number(pointX)) ? Number(pointX) : Number(fallback.x) || 0,
    y: Number.isFinite(Number(pointY)) ? Number(pointY) : Number(fallback.y) || 0,
  };
}

function indexSourceEntries(
  entries: readonly GroupTransferRuntimeSourceEntry[] | undefined
): Map<string, GroupTransferRuntimeSourceEntry> {
  const byId = new Map<string, GroupTransferRuntimeSourceEntry>();
  for (const entry of entries || []) {
    const directId = entry?.item?.id;
    if (directId && !byId.has(directId)) byId.set(directId, entry);
    for (const id of entry?.memberIds || []) {
      if (id && !byId.has(id)) byId.set(id, entry);
    }
  }
  return byId;
}

function makeReleaseStart(
  actor: GroupTransferRuntimeActor,
  sourceEntry: GroupTransferRuntimeSourceEntry,
  phase: string
): GroupTransferReleaseStart {
  if (phase === "gather") return null;
  if (actor.startAnchor?.kind === "captured-current-pose") {
    return { kind: "current-pose" };
  }
  return {
    alpha: Number.isFinite(Number(sourceEntry.originAlpha))
      ? Math.max(0, Number(sourceEntry.originAlpha))
      : 1,
    kind: "source-origin",
    point: clonePoint(sourceEntry.origin),
    scale: Math.max(0.01, Number(sourceEntry.originScale) || 1),
  };
}

function runtimeOriginKind(
  actor: GroupTransferRuntimeActor,
  sourceEntry: GroupTransferRuntimeSourceEntry
): string {
  if (actor?.role !== "bundle") return sourceEntry.originKind;
  const kind = actor.startAnchor?.kind || "";
  if (kind.startsWith("desktop-page-edge-")) return "desktop-page-bundle";
  if (kind.startsWith("folder-page-edge-")) return "folder-page-bundle";
  if (kind === "folder-center") return "folder-bundle";
  return sourceEntry.originKind;
}

export function makeGroupTransferRuntimeEntries(options: MakeGroupTransferRuntimeEntriesOptions = {}): {
  entries: GroupTransferRuntimeEntry[];
  shellActors: GroupTransferRuntimeActor[];
} {
  const presentationPlan = options.presentationPlan || {};
  const phase = String(options.phase || presentationPlan.phase || "gather");
  const sourceById = indexSourceEntries(options.sourceEntries);
  const entries: GroupTransferRuntimeEntry[] = [];
  const shellActors: GroupTransferRuntimeActor[] = [];
  for (const actor of presentationPlan.actors || []) {
    if (actor?.role === "folder-shell") {
      shellActors.push({ ...actor, memberIds: [...(actor.memberIds || [])] });
      continue;
    }
    const representativeId = actor?.representativeId || actor?.memberIds?.[0] || null;
    if (!representativeId) {
      throw new Error(`Group transfer runtime source missing: ${String(representativeId)}`);
    }
    const sourceEntry = sourceById.get(representativeId);
    if (!sourceEntry) {
      throw new Error(`Group transfer runtime source missing: ${String(representativeId)}`);
    }
    entries.push({
      ...sourceEntry,
      actorKey: actor.key,
      continuityKey: actor.continuityKey || actor.key,
      alphaPolicy: actor.alphaPolicy,
      bundleCount: Math.max(1, Number(actor.bundleCount) || actor.memberIds?.length || 1),
      delayMs: Math.min(72, Math.max(0, Number(actor.delayGroup) || 0) * 12),
      endAnchor: actor.endAnchor,
      item: actor.item ? { ...actor.item } : { ...sourceEntry.item },
      memberIds: [...(actor.memberIds || [representativeId])],
      originKind: runtimeOriginKind(actor, sourceEntry),
      order: Number.isFinite(Number(actor.sourceOrder)) ? Number(actor.sourceOrder) : entries.length,
      presentationRole: actor.role,
      releaseRole: actor.role === "lead"
        ? "lead"
        : actor.role === "folder-create-target"
          ? "folder-create-target"
          : "member",
      releaseStart: makeReleaseStart(actor, sourceEntry, phase),
      startAnchor: actor.startAnchor,
      visibilityPolicy: actor.visibilityPolicy || { kind: "none" },
      zBand: Number(actor.zBand) || 0,
    });
  }
  return { entries, shellActors };
}

function runtimeMode(
  actor: GroupTransferRuntimeActor,
  phase: string,
  effects: Partial<GroupTransferEffects>
): GroupTransferRuntimeMode {
  if (phase === "return") return GROUP_TRANSFER_RUNTIME_MODE.RETURN;
  const anchor: Partial<GroupTransferAnchor> = actor?.endAnchor || {};
  if (anchor.kind === "folder-preview-slot") {
    return effects?.createdFolderId === anchor.folderId
      ? GROUP_TRANSFER_RUNTIME_MODE.CREATED_FOLDER
      : GROUP_TRANSFER_RUNTIME_MODE.FOLDER_PREVIEW_SLOT;
  }
  if (anchor.kind === "folder-center") return GROUP_TRANSFER_RUNTIME_MODE.FOLDER_CENTER_ABSORB;
  return GROUP_TRANSFER_RUNTIME_MODE.POINT_HANDOFF;
}

function runtimeTarget(actor: GroupTransferRuntimeActor): GroupTransferRuntimeTarget {
  const anchor: Partial<GroupTransferAnchor> = actor?.endAnchor || {};
  const representativeId = actor?.representativeId || actor?.memberIds?.[0] || null;
  if (anchor.kind === "folder-preview-slot") {
    return {
      expectedChildId: representativeId,
      folderId: anchor.folderId || null,
      semanticAnchor: { ...anchor },
      slotIndex: Number.isFinite(Number(anchor.slotIndex)) ? Number(anchor.slotIndex) : null,
    };
  }
  if (anchor.kind === "folder-center") {
    return {
      folderId: anchor.folderId || null,
      semanticAnchor: { ...anchor },
    };
  }
  return {
    area: anchor.kind === "folder-open-slot" ? "folder" : "desktop",
    folderId: anchor.folderId || null,
    id: anchor.itemId || representativeId,
    index: Number.isFinite(Number(anchor.index)) ? Number(anchor.index) : null,
    pageIndex: anchor.kind === "folder-open-slot"
      ? anchor.folderPageIndex
      : anchor.pageIndex,
    semanticAnchor: { ...anchor },
  };
}

export function makeGroupTransferRuntimeReleasePlan(options: MakeGroupTransferRuntimeReleasePlanOptions = {}): {
  entries: GroupTransferRuntimeReleaseEntry[];
  key: string;
  phase: string;
  shellActors: GroupTransferRuntimeActor[];
  status: "pending";
} {
  const presentationPlan = options.presentationPlan || {};
  const phase = String(options.phase || presentationPlan.phase || "release");
  const effects = options.transferPlan?.effects || {};
  const velocity = clonePoint(options.velocity);
  const entries: GroupTransferRuntimeReleaseEntry[] = [];
  const shellActors: GroupTransferRuntimeActor[] = [];
  for (const actor of presentationPlan.actors || []) {
    if (actor?.role === "folder-shell") {
      shellActors.push({ ...actor, memberIds: [...(actor.memberIds || [])] });
      continue;
    }
    const id = actor?.representativeId || actor?.memberIds?.[0] || null;
    if (!id) throw new Error(`Group transfer release actor has no representative: ${String(actor?.key)}`);
    entries.push({
      actorKey: actor.key,
      continuityKey: actor.continuityKey || actor.key,
      alphaPolicy: actor.alphaPolicy,
      delayMs: Math.min(72, Math.max(0, Number(actor.delayGroup) || 0) * 12),
      id,
      item: actor.item ? { ...actor.item } : { id, name: id, type: "app" },
      memberIds: [...(actor.memberIds || [id])],
      mode: runtimeMode(actor, phase, effects),
      order: Number.isFinite(Number(actor.sourceOrder)) ? Number(actor.sourceOrder) : entries.length,
      originAlpha: actor.alphaPolicy?.kind === "fade-out" ? 1 : 1,
      originScale: 1,
      target: runtimeTarget(actor),
      velocity: { ...velocity },
      visibilityPolicy: actor.visibilityPolicy || { kind: "none" },
      zBand: Number(actor.zBand) || 0,
    });
  }
  return {
    entries,
    key: String(options.key || "group-transfer-release"),
    phase,
    shellActors,
    status: "pending",
  };
}
