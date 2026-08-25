import { motionRuntime } from "../animation/motionRuntime.js";
import { snapshotContractValue } from "../../contractSnapshot.js";
import type { FolderOpeningGeometrySnapshot } from "./folderOpeningGeometrySnapshot.js";

const FRAME_VISUAL_PENDING_KEY = "frame:visual";
const FRAME_COMPLETE_PENDING_KEY = "frame:complete";

export type FolderVisualReportStatus = "accepted" | "duplicate" | "stale";

export type FolderVisualReportResult = Readonly<{
  status: FolderVisualReportStatus;
}>;

type VisualOwner = Readonly<{
  folderId: string;
  kind: "opening" | "closing";
  token: string;
}>;

export type FolderVisualCancelOptions = Readonly<{
  completeControllerKeys?: boolean;
  restorePageTrack?: boolean;
  reveal?: boolean;
}>;

type UnknownRecord = Record<string, unknown>;

export type FolderOpeningVisualPlan<
  State extends object = object,
  Target extends object = object,
  Options extends object = object,
> = Readonly<{
  options?: Options;
  state: State;
  targets: readonly Target[];
}>;

export type FolderClosingVisualPlan<
  State extends object = object,
  Target extends object = object,
  Options extends object = object,
  Rect extends object = object,
> = Readonly<{
  folderRect?: Rect | null;
  options?: Options;
  panelRect?: Rect | null;
  state: State;
  targets: readonly Target[];
}>;

export type FolderOpeningAdapterPreparation = Readonly<{
  ghostIds?: readonly string[];
}>;

export type FolderClosingGhostParticipant = Readonly<{
  controllerKey?: string | null;
  itemId: string;
  visualCritical?: boolean;
}>;

export type FolderClosingAdapterPreparation = Readonly<{
  ghosts?: readonly FolderClosingGhostParticipant[];
}>;

export type FolderOpeningPhaseReporter = Readonly<{
  fail(error: unknown): FolderVisualReportResult;
  ghostsReady(): FolderVisualReportResult;
  owner(): VisualOwner;
}>;

export type FolderClosingPhaseReporter = Readonly<{
  cleanupFinished(): FolderVisualReportResult;
  deleteDetachedGhostMotion(ghost: object): FolderVisualReportResult;
  fail(error: unknown): FolderVisualReportResult;
  frameComplete(): FolderVisualReportResult;
  frameVisualReady(): FolderVisualReportResult;
  ghostComplete(itemId: string, controllerKey?: string | null): FolderVisualReportResult;
  ghostVisualReady(itemId: string): FolderVisualReportResult;
  handoffStarted(): FolderVisualReportResult;
  owner(): VisualOwner;
  previewComplete(key: string): FolderVisualReportResult;
  previewStarted(key: string): FolderVisualReportResult;
  releaseOverlay(): FolderVisualReportResult;
  setDetachedGhostMotion(ghost: object, motion: UnknownRecord): FolderVisualReportResult;
  setGeometry(geometry: FolderCloseGeometry): FolderVisualReportResult;
  snapshot(): FolderCloseSnapshot | null;
  takeOpeningGhost(itemId: string, accept?: (ghost: unknown) => boolean): unknown;
}>;

export type FolderOpeningAdapterScope<
  Plan extends FolderOpeningVisualPlan = FolderOpeningVisualPlan,
> = {
  cancel(options?: FolderVisualCancelOptions): void;
  retarget(plan: Plan): void;
  reveal(): void;
  snapshot?(): UnknownRecord;
  takeGhost?(itemId: string, accept?: (ghost: unknown) => boolean): unknown;
};

export type FolderClosingAdapterScope<
  Plan extends FolderClosingVisualPlan = FolderClosingVisualPlan,
> = {
  cancel(options?: FolderVisualCancelOptions): void;
  onHandoffReady?(event: Readonly<{ controllerKeys: readonly string[] }>): void;
  onOverlaySettled?(): void;
  retarget(plan: Plan): void;
  snapshot?(): UnknownRecord;
};

export type FolderOpeningVisualAdapter<
  Plan extends FolderOpeningVisualPlan = FolderOpeningVisualPlan,
> = Readonly<{
  prepare(plan: Plan): FolderOpeningAdapterPreparation;
  start(plan: Plan, reporter: FolderOpeningPhaseReporter): FolderOpeningAdapterScope<Plan>;
}>;

export type FolderClosingVisualAdapter<
  Plan extends FolderClosingVisualPlan = FolderClosingVisualPlan,
> = Readonly<{
  prepare(plan: Plan): FolderClosingAdapterPreparation;
  start(plan: Plan, reporter: FolderClosingPhaseReporter): FolderClosingAdapterScope<Plan>;
}>;

export type FolderOpenRequest = Readonly<{
  folderId: string;
  forceNew?: boolean;
  targetKey: string;
}>;

export type FolderCloseRequest = Readonly<{
  folderId: string;
}>;

export type FolderCloseGeometry = Readonly<{
  detachedTarget?: UnknownRecord | null;
  rect?: UnknownRecord | null;
  target?: UnknownRecord | null;
}>;

export type FolderOpenSnapshot = Readonly<{
  error: unknown | null;
  folderId: string;
  geometrySnapshot: FolderOpeningGeometrySnapshot | null;
  ghostIds: readonly string[];
  ghostsReady: boolean;
  panelReady: boolean;
  revealPending: boolean;
  revealed: boolean;
  targetKey: string;
}>;

export type FolderCloseSnapshot = Readonly<{
  activeVisuals: boolean;
  completedControllerKeys: readonly string[];
  detachedFrameTarget: Readonly<UnknownRecord> | null;
  error: unknown | null;
  folderId: string;
  frameComplete: boolean;
  frameVisualComplete: boolean;
  ghostIds: readonly string[];
  handoffActive: boolean;
  handoffReady: boolean;
  handoffRect: Readonly<UnknownRecord> | null;
  handoffTarget: Readonly<UnknownRecord> | null;
  overlaySettled: boolean;
  phase: "closing" | "handoff" | "settled";
  previewKeys: readonly string[];
  visualGhostIds: readonly string[];
  visualReleased: boolean;
}>;

export type FolderVisualSessionSnapshot = Readonly<{
  closing: FolderCloseSnapshot | null;
  disposed: boolean;
  opening: FolderOpenSnapshot | null;
  ownershipRevision: number | null;
}>;

export type FolderOpenLease<
  Plan extends FolderOpeningVisualPlan = FolderOpeningVisualPlan,
> = Readonly<{
  cancel(options?: FolderVisualCancelOptions): FolderVisualReportResult;
  geometrySnapshot(): FolderOpeningGeometrySnapshot | null;
  isCurrent(): boolean;
  panelPending(targetKey?: string): FolderVisualReportResult;
  panelReady(): FolderVisualReportResult;
  present(plan: Plan): FolderVisualReportResult;
  setGeometrySnapshot(snapshot: FolderOpeningGeometrySnapshot): FolderVisualReportResult;
  snapshot(): FolderOpenSnapshot;
}>;

export type FolderCloseLease<
  Plan extends FolderClosingVisualPlan = FolderClosingVisualPlan,
> = Readonly<{
  cancel(options?: FolderVisualCancelOptions): FolderVisualReportResult;
  detachedGhostMotion(ghost: object): Readonly<UnknownRecord> | null;
  isCurrent(): boolean;
  present(plan: Plan): FolderVisualReportResult;
  snapshot(): FolderCloseSnapshot;
}>;

type EventSink = {
  recordCoordinationEvent?(event: UnknownRecord): void;
};

type SessionOptions<
  OpeningPlan extends FolderOpeningVisualPlan,
  ClosingPlan extends FolderClosingVisualPlan,
> = Readonly<{
  closingAdapter?: FolderClosingVisualAdapter<ClosingPlan>;
  eventSink?: EventSink;
  onCloseHandoffChange?(active: boolean, folderId: string | null): void;
  onClosingHandoffReady?(folderId: string): void;
  openingAdapter?: FolderOpeningVisualAdapter<OpeningPlan>;
  ownershipRevision?(): number | null;
}>;

type OpenRecord<Plan extends FolderOpeningVisualPlan> = {
  adapterScope: FolderOpeningAdapterScope<Plan> | null;
  error: unknown | null;
  folderId: string;
  geometryLayoutKey: string | null;
  geometrySnapshot: FolderOpeningGeometrySnapshot | null;
  ghostIds: Set<string>;
  ghostsReady: boolean;
  id: number;
  lease: FolderOpenLease<Plan> | null;
  owner: VisualOwner;
  panelReady: boolean;
  reporter: FolderOpeningPhaseReporter | null;
  revealed: boolean;
  targetKey: string;
};

type CloseEffect = "handoffReady" | "overlaySettled";

type CloseRecord<Plan extends FolderClosingVisualPlan> = {
  adapterScope: FolderClosingAdapterScope<Plan> | null;
  completedControllerKeys: string[];
  detachedFrameTarget: Readonly<UnknownRecord> | null;
  detachedGhostMotions: WeakMap<object, Readonly<UnknownRecord>>;
  effectQueue: CloseEffect[];
  error: unknown | null;
  folderId: string;
  frameComplete: boolean;
  frameVisualComplete: boolean;
  ghostIds: Set<string>;
  handoffActive: boolean;
  handoffReady: boolean;
  handoffRect: Readonly<UnknownRecord> | null;
  handoffTarget: Readonly<UnknownRecord> | null;
  id: number;
  lease: FolderCloseLease<Plan> | null;
  overlayPendingKeys: Set<string>;
  overlaySettled: boolean;
  owner: VisualOwner;
  phase: "closing" | "handoff" | "settled";
  previewKeys: Set<string>;
  reporter: FolderClosingPhaseReporter | null;
  settlementStarted: boolean;
  visualGhostIds: Set<string>;
  visualPendingKeys: Set<string>;
  visualReleased: boolean;
};

const ACCEPTED = Object.freeze({ status: "accepted" }) satisfies FolderVisualReportResult;
const DUPLICATE = Object.freeze({ status: "duplicate" }) satisfies FolderVisualReportResult;
const STALE = Object.freeze({ status: "stale" }) satisfies FolderVisualReportResult;

function result(status: FolderVisualReportStatus): FolderVisualReportResult {
  if (status === "accepted") return ACCEPTED;
  if (status === "duplicate") return DUPLICATE;
  return STALE;
}

function runCleanupSteps(message: string, steps: readonly (() => void)[]): void {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}

function throwAfterCleanup(error: unknown, cleanup: () => void, message: string): never {
  try {
    cleanup();
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], message);
  }
  throw error;
}

function roundGeometryValue(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export function makeFolderPanelTargetKey(
  folderId: string | null | undefined,
  targetX: unknown,
  targetY: unknown,
  panelRect: Readonly<{ height?: unknown; width?: unknown }> | null | undefined,
): string {
  return [
    folderId || "",
    roundGeometryValue(targetX),
    roundGeometryValue(targetY),
    roundGeometryValue(panelRect?.width),
    roundGeometryValue(panelRect?.height),
  ].join(":");
}

function assertObject(value: unknown, label: string): asserts value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertReporterMethods(
  value: unknown,
  label: string,
  methods: readonly string[],
): asserts value is UnknownRecord {
  assertObject(value, label);
  const missing = methods.find((method) => typeof value[method] !== "function");
  if (missing) throw new TypeError(`${label} is missing ${missing}()`);
}

export function assertFolderOpeningPhaseReporter(
  value: unknown,
): asserts value is FolderOpeningPhaseReporter {
  assertReporterMethods(value, "opening phase reporter", ["fail", "ghostsReady", "owner"]);
}

export function assertFolderClosingPhaseReporter(
  value: unknown,
): asserts value is FolderClosingPhaseReporter {
  assertReporterMethods(value, "closing phase reporter", [
    "cleanupFinished",
    "deleteDetachedGhostMotion",
    "fail",
    "frameComplete",
    "frameVisualReady",
    "ghostComplete",
    "ghostVisualReady",
    "handoffStarted",
    "owner",
    "previewComplete",
    "previewStarted",
    "releaseOverlay",
    "setDetachedGhostMotion",
    "setGeometry",
    "snapshot",
    "takeOpeningGhost",
  ]);
}

function assertFolderId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function cloneRecord(value: UnknownRecord | null | undefined): Readonly<UnknownRecord> | null {
  return value
    ? snapshotContractValue(value, "FolderVisualSession contract value") as Readonly<UnknownRecord>
    : null;
}

function freezeAdapterSnapshot(scope: { snapshot?(): UnknownRecord } | null): Readonly<UnknownRecord> | null {
  const snapshot = scope?.snapshot?.();
  return cloneRecord(snapshot);
}

function freezeStrings(values: Iterable<string>): readonly string[] {
  return Object.freeze(Array.from(values));
}

function ghostVisualKey(itemId: string): string {
  return `ghost:visual:${itemId}`;
}

function ghostCompleteKey(itemId: string): string {
  return `ghost:complete:${itemId}`;
}

function previewKey(key: string): string {
  return `preview:${key}`;
}

/**
 * Owns folder-opening and folder-closing lifecycle identity.
 *
 * The public root deliberately exposes only four operations. Phase-specific
 * mutation is available through identity-bound leases; animation adapters get
 * reporters whose closures carry that identity, so callers never pass raw
 * tokens or target generations back into the session.
 */
export class FolderVisualSession<
  OpeningPlan extends FolderOpeningVisualPlan = FolderOpeningVisualPlan,
  ClosingPlan extends FolderClosingVisualPlan = FolderClosingVisualPlan,
> {
  readonly #closingAdapter: FolderClosingVisualAdapter<ClosingPlan> | null;
  readonly #eventSink: EventSink;
  readonly #onCloseHandoffChange: SessionOptions<OpeningPlan, ClosingPlan>["onCloseHandoffChange"];
  readonly #onClosingHandoffReady: SessionOptions<OpeningPlan, ClosingPlan>["onClosingHandoffReady"];
  readonly #openingAdapter: FolderOpeningVisualAdapter<OpeningPlan> | null;
  readonly #ownershipRevision: SessionOptions<OpeningPlan, ClosingPlan>["ownershipRevision"];
  #close: CloseRecord<ClosingPlan> | null = null;
  #disposed = false;
  #nextCloseId = 1;
  #nextOpenId = 1;
  #open: OpenRecord<OpeningPlan> | null = null;

  constructor(options: SessionOptions<OpeningPlan, ClosingPlan> = {}) {
    this.#closingAdapter = options.closingAdapter || null;
    this.#eventSink = options.eventSink || motionRuntime;
    this.#onCloseHandoffChange = options.onCloseHandoffChange;
    this.#onClosingHandoffReady = options.onClosingHandoffReady;
    this.#openingAdapter = options.openingAdapter || null;
    this.#ownershipRevision = options.ownershipRevision;
  }

  open(request: FolderOpenRequest): FolderOpenLease<OpeningPlan> {
    this.#assertUsable();
    assertObject(request, "FolderVisualSession.open request");
    assertFolderId(request.folderId, "FolderVisualSession.open folderId");
    if (typeof request.targetKey !== "string") {
      throw new TypeError("FolderVisualSession.open targetKey must be a string");
    }

    const current = this.#open;
    if (!request.forceNew && current?.folderId === request.folderId) {
      if (current.targetKey !== request.targetKey) {
        current.targetKey = request.targetKey;
        current.geometryLayoutKey = null;
        current.geometrySnapshot = null;
        if (!current.revealed) current.panelReady = false;
        this.#record("phase", "open-retarget", current);
      }
      return current.lease as FolderOpenLease<OpeningPlan>;
    }

    if (current) this.#cancelOpen(current, { restorePageTrack: false, reveal: false });
    const id = this.#nextOpenId++;
    const record: OpenRecord<OpeningPlan> = {
      adapterScope: null,
      error: null,
      folderId: request.folderId,
      geometryLayoutKey: null,
      geometrySnapshot: null,
      ghostIds: new Set(),
      ghostsReady: false,
      id,
      lease: null,
      owner: Object.freeze({
        folderId: request.folderId,
        kind: "opening",
        token: `folder-opening:${request.folderId}:${id}`,
      }),
      panelReady: false,
      reporter: null,
      revealed: false,
      targetKey: request.targetKey,
    };
    record.reporter = this.#makeOpeningReporter(record);
    record.lease = this.#makeOpenLease(record);
    this.#open = record;
    this.#record("phase", "open-begin", record);
    return record.lease;
  }

  close(request: FolderCloseRequest): FolderCloseLease<ClosingPlan> {
    this.#assertUsable();
    assertObject(request, "FolderVisualSession.close request");
    assertFolderId(request.folderId, "FolderVisualSession.close folderId");

    const current = this.#close;
    if (current?.folderId === request.folderId && current.phase !== "settled") {
      return current.lease as FolderCloseLease<ClosingPlan>;
    }
    if (current) this.#cancelClose(current, { restorePageTrack: false, reveal: false });

    const id = this.#nextCloseId++;
    const record: CloseRecord<ClosingPlan> = {
      adapterScope: null,
      completedControllerKeys: [],
      detachedFrameTarget: null,
      detachedGhostMotions: new WeakMap(),
      effectQueue: [],
      error: null,
      folderId: request.folderId,
      frameComplete: false,
      frameVisualComplete: false,
      ghostIds: new Set(),
      handoffActive: false,
      handoffReady: false,
      handoffRect: null,
      handoffTarget: null,
      id,
      lease: null,
      overlayPendingKeys: new Set(),
      overlaySettled: false,
      owner: Object.freeze({
        folderId: request.folderId,
        kind: "closing",
        token: `folder-closing:${request.folderId}:${id}`,
      }),
      phase: "closing",
      previewKeys: new Set(),
      reporter: null,
      settlementStarted: false,
      visualGhostIds: new Set(),
      visualPendingKeys: new Set(),
      visualReleased: false,
    };
    record.reporter = this.#makeClosingReporter(record);
    record.lease = this.#makeCloseLease(record);
    this.#close = record;
    this.#record("phase", "close-begin", record);
    return record.lease;
  }

  snapshot(): FolderVisualSessionSnapshot {
    return Object.freeze({
      closing: this.#close ? this.#closeSnapshot(this.#close) : null,
      disposed: this.#disposed,
      opening: this.#open ? this.#openSnapshot(this.#open) : null,
      ownershipRevision: this.#ownershipRevision?.() ?? null,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    const opening = this.#open;
    const closing = this.#close;
    try {
      runCleanupSteps("FolderVisualSession disposal failed", [
        () => {
          if (opening) this.#cancelOpen(opening, { restorePageTrack: true, reveal: true });
        },
        () => {
          if (closing) this.#cancelClose(closing, { restorePageTrack: true, reveal: true });
        },
      ]);
    } finally {
      this.#disposed = true;
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("FolderVisualSession has been disposed");
  }

  #isCurrentOpen(record: OpenRecord<OpeningPlan>): boolean {
    return !this.#disposed && this.#open === record;
  }

  #isCurrentClose(record: CloseRecord<ClosingPlan>): boolean {
    return !this.#disposed && this.#close === record;
  }

  #makeOpenLease(record: OpenRecord<OpeningPlan>): FolderOpenLease<OpeningPlan> {
    return Object.freeze({
      cancel: (options?: FolderVisualCancelOptions) => {
        if (!this.#isCurrentOpen(record)) return STALE;
        this.#cancelOpen(record, options);
        return ACCEPTED;
      },
      geometrySnapshot: () => record.geometrySnapshot,
      isCurrent: () => this.#isCurrentOpen(record),
      panelPending: (targetKey?: string) => {
        if (!this.#isCurrentOpen(record)) return STALE;
        if (targetKey != null && typeof targetKey !== "string") {
          throw new TypeError("FolderOpenLease.panelPending targetKey must be a string");
        }
        if (targetKey != null && record.targetKey !== targetKey) {
          record.targetKey = targetKey;
          record.geometryLayoutKey = null;
          record.geometrySnapshot = null;
        }
        if (record.revealed || !record.panelReady) return DUPLICATE;
        record.panelReady = false;
        return ACCEPTED;
      },
      panelReady: () => {
        if (!this.#isCurrentOpen(record)) return STALE;
        if (record.panelReady) return DUPLICATE;
        record.panelReady = true;
        this.#record("visibility", "open-panel-ready", record);
        this.#maybeReveal(record);
        return ACCEPTED;
      },
      present: (plan: OpeningPlan) => this.#presentOpen(record, plan),
      setGeometrySnapshot: (snapshot: FolderOpeningGeometrySnapshot) => {
        if (!this.#isCurrentOpen(record)) return STALE;
        assertObject(snapshot, "FolderOpenLease geometry snapshot");
        const layoutKey = snapshot.layoutKey ?? null;
        if (
          record.geometrySnapshot === snapshot
          || (layoutKey != null && record.geometrySnapshot != null && record.geometryLayoutKey === layoutKey)
        ) return DUPLICATE;
        if (record.geometryLayoutKey != null && record.geometryLayoutKey !== layoutKey && !record.revealed) {
          record.panelReady = false;
        }
        record.geometryLayoutKey = layoutKey;
        record.geometrySnapshot = snapshotContractValue(
          snapshot,
          "FolderOpenLease geometry snapshot",
        );
        return ACCEPTED;
      },
      snapshot: () => this.#openSnapshot(record),
    });
  }

  #makeCloseLease(record: CloseRecord<ClosingPlan>): FolderCloseLease<ClosingPlan> {
    return Object.freeze({
      cancel: (options?: FolderVisualCancelOptions) => {
        if (!this.#isCurrentClose(record)) return STALE;
        this.#cancelClose(record, options);
        return ACCEPTED;
      },
      detachedGhostMotion: (ghost: object) => {
        if (!ghost || typeof ghost !== "object") return null;
        const motion = record.detachedGhostMotions.get(ghost);
        return motion || null;
      },
      isCurrent: () => this.#isCurrentClose(record),
      present: (plan: ClosingPlan) => this.#presentClose(record, plan),
      snapshot: () => this.#closeSnapshot(record),
    });
  }

  #makeOpeningReporter(record: OpenRecord<OpeningPlan>): FolderOpeningPhaseReporter {
    return Object.freeze({
      fail: (error: unknown) => {
        if (!this.#isCurrentOpen(record)) return STALE;
        if (record.error != null) return DUPLICATE;
        record.error = error instanceof Error ? error : new Error(String(error));
        this.#cancelOpen(record, { restorePageTrack: true, reveal: true });
        return ACCEPTED;
      },
      ghostsReady: () => {
        if (!this.#isCurrentOpen(record)) return STALE;
        if (record.ghostsReady) return DUPLICATE;
        record.ghostsReady = true;
        this.#record("visibility", "open-ghosts-ready", record);
        this.#maybeReveal(record);
        return ACCEPTED;
      },
      owner: () => record.owner,
    });
  }

  #makeClosingReporter(record: CloseRecord<ClosingPlan>): FolderClosingPhaseReporter {
    const current = (): boolean => this.#isCurrentClose(record);
    return Object.freeze({
      cleanupFinished: () => {
        if (!current()) return STALE;
        if (record.phase === "settled" && !record.handoffActive) return DUPLICATE;
        record.phase = "settled";
        this.#setCloseHandoffActive(record, false);
        this.#record("phase", "close-cleanup-finish", record);
        if (this.#close === record) this.#close = null;
        record.adapterScope = null;
        record.reporter = null;
        record.effectQueue.length = 0;
        return ACCEPTED;
      },
      deleteDetachedGhostMotion: (ghost: object) => {
        if (!current()) return STALE;
        return result(record.detachedGhostMotions.delete(ghost) ? "accepted" : "duplicate");
      },
      fail: (error: unknown) => {
        if (!current()) return STALE;
        if (record.error != null) return DUPLICATE;
        record.error = error instanceof Error ? error : new Error(String(error));
        this.#cancelClose(record, { restorePageTrack: true, reveal: true });
        return ACCEPTED;
      },
      frameComplete: () => {
        if (!current()) return STALE;
        if (record.frameComplete) return DUPLICATE;
        record.frameComplete = true;
        record.frameVisualComplete = true;
        record.visualPendingKeys.delete(FRAME_VISUAL_PENDING_KEY);
        record.overlayPendingKeys.delete(FRAME_COMPLETE_PENDING_KEY);
        this.#collectCloseEffects(record);
        return ACCEPTED;
      },
      frameVisualReady: () => {
        if (!current()) return STALE;
        if (record.frameVisualComplete) return DUPLICATE;
        record.frameVisualComplete = true;
        record.visualPendingKeys.delete(FRAME_VISUAL_PENDING_KEY);
        this.#collectCloseEffects(record);
        return ACCEPTED;
      },
      ghostComplete: (itemId: string, controllerKey: string | null = null) => {
        if (!current()) return STALE;
        assertFolderId(itemId, "FolderClosingPhaseReporter ghost itemId");
        if (!record.ghostIds.has(itemId)) return DUPLICATE;
        record.ghostIds.delete(itemId);
        record.overlayPendingKeys.delete(ghostCompleteKey(itemId));
        if (controllerKey && !record.completedControllerKeys.includes(controllerKey)) {
          record.completedControllerKeys.push(controllerKey);
        }
        this.#collectCloseEffects(record);
        return ACCEPTED;
      },
      ghostVisualReady: (itemId: string) => {
        if (!current()) return STALE;
        assertFolderId(itemId, "FolderClosingPhaseReporter visual ghost itemId");
        if (!record.visualGhostIds.has(itemId)) return DUPLICATE;
        record.visualGhostIds.delete(itemId);
        record.visualPendingKeys.delete(ghostVisualKey(itemId));
        this.#collectCloseEffects(record);
        return ACCEPTED;
      },
      handoffStarted: () => {
        if (!current()) return STALE;
        if (record.handoffActive) return DUPLICATE;
        record.phase = "handoff";
        this.#setCloseHandoffActive(record, true);
        return ACCEPTED;
      },
      owner: () => record.owner,
      previewComplete: (key: string) => {
        if (!current()) return STALE;
        assertFolderId(key, "FolderClosingPhaseReporter preview key");
        if (!record.previewKeys.has(key)) return DUPLICATE;
        record.previewKeys.delete(key);
        record.visualPendingKeys.delete(previewKey(key));
        record.overlayPendingKeys.delete(previewKey(key));
        this.#collectCloseEffects(record);
        return ACCEPTED;
      },
      previewStarted: (key: string) => {
        if (!current()) return STALE;
        assertFolderId(key, "FolderClosingPhaseReporter preview key");
        if (record.previewKeys.has(key)) return DUPLICATE;
        record.previewKeys.add(key);
        record.visualPendingKeys.add(previewKey(key));
        record.overlayPendingKeys.add(previewKey(key));
        return ACCEPTED;
      },
      releaseOverlay: () => {
        if (!current()) return STALE;
        if (record.visualReleased) return DUPLICATE;
        record.visualReleased = true;
        record.frameComplete = true;
        record.frameVisualComplete = true;
        record.ghostIds.clear();
        record.previewKeys.clear();
        record.visualGhostIds.clear();
        record.visualPendingKeys.clear();
        record.overlayPendingKeys.clear();
        this.#record("ownership", "overlay-visual-release", record);
        this.#collectCloseEffects(record);
        return ACCEPTED;
      },
      setDetachedGhostMotion: (ghost: object, motion: UnknownRecord) => {
        if (!current()) return STALE;
        if (!ghost || typeof ghost !== "object") throw new TypeError("detached ghost must be an object");
        assertObject(motion, "detached ghost motion");
        record.detachedGhostMotions.set(ghost, cloneRecord(motion) as Readonly<UnknownRecord>);
        return ACCEPTED;
      },
      setGeometry: (geometry: FolderCloseGeometry) => {
        if (!current()) return STALE;
        assertObject(geometry, "FolderClosingPhaseReporter geometry");
        record.detachedFrameTarget = cloneRecord(geometry.detachedTarget);
        record.handoffRect = cloneRecord(geometry.rect);
        record.handoffTarget = cloneRecord(geometry.target);
        this.#record("ownership", "close-geometry", record, {
          hasDetachedTarget: Boolean(record.detachedFrameTarget),
          hasHandoffRect: Boolean(record.handoffRect),
          hasHandoffTarget: Boolean(record.handoffTarget),
        });
        return ACCEPTED;
      },
      snapshot: () => current() ? this.#closeSnapshot(record) : null,
      takeOpeningGhost: (itemId: string, accept?: (ghost: unknown) => boolean) => {
        if (!current()) return null;
        assertFolderId(itemId, "FolderClosingPhaseReporter opening ghost itemId");
        const opening = this.#open;
        if (!opening?.adapterScope?.takeGhost) return null;
        return opening.adapterScope.takeGhost(itemId, accept);
      },
    });
  }

  #presentOpen(record: OpenRecord<OpeningPlan>, plan: OpeningPlan): FolderVisualReportResult {
    if (!this.#isCurrentOpen(record)) return STALE;
    assertObject(plan, "FolderOpenLease presentation plan");
    if (!this.#openingAdapter) throw new Error("FolderVisualSession requires an opening adapter before presenting an open lease");
    try {
      const prepared = this.#openingAdapter.prepare(plan);
      record.ghostIds = new Set((prepared.ghostIds || []).filter((id): id is string => typeof id === "string" && id.length > 0));
      if (record.adapterScope) {
        record.adapterScope.retarget(plan);
        return ACCEPTED;
      }
      const scope = this.#openingAdapter.start(plan, record.reporter as FolderOpeningPhaseReporter);
      if (!scope || typeof scope.cancel !== "function" || typeof scope.retarget !== "function" || typeof scope.reveal !== "function") {
        throw new TypeError("opening adapter must return cancel, retarget, and reveal operations");
      }
      if (!this.#isCurrentOpen(record)) {
        scope.cancel({ completeControllerKeys: false, restorePageTrack: true, reveal: true });
        return STALE;
      }
      record.adapterScope = scope;
      this.#maybeReveal(record);
      return ACCEPTED;
    } catch (error) {
      record.error = error;
      throwAfterCleanup(error, () => {
        if (this.#isCurrentOpen(record)) {
          this.#cancelOpen(record, { restorePageTrack: true, reveal: true });
        }
      }, "opening presentation and cleanup both failed");
    }
  }

  #presentClose(record: CloseRecord<ClosingPlan>, plan: ClosingPlan): FolderVisualReportResult {
    if (!this.#isCurrentClose(record)) return STALE;
    assertObject(plan, "FolderCloseLease presentation plan");
    if (!this.#closingAdapter) throw new Error("FolderVisualSession requires a closing adapter before presenting a close lease");
    try {
      if (record.adapterScope) {
        record.adapterScope.retarget(plan);
        return ACCEPTED;
      }

      const prepared = this.#closingAdapter.prepare(plan);
      record.settlementStarted = true;
      record.visualPendingKeys.add(FRAME_VISUAL_PENDING_KEY);
      record.overlayPendingKeys.add(FRAME_COMPLETE_PENDING_KEY);
      for (const ghost of prepared.ghosts || []) {
        assertFolderId(ghost.itemId, "closing adapter ghost itemId");
        if (record.ghostIds.has(ghost.itemId)) throw new Error(`duplicate closing ghost participant: ${ghost.itemId}`);
        record.ghostIds.add(ghost.itemId);
        record.overlayPendingKeys.add(ghostCompleteKey(ghost.itemId));
        if (ghost.visualCritical) {
          record.visualGhostIds.add(ghost.itemId);
          record.visualPendingKeys.add(ghostVisualKey(ghost.itemId));
        }
        if (ghost.controllerKey && !record.completedControllerKeys.includes(ghost.controllerKey)) {
          record.completedControllerKeys.push(ghost.controllerKey);
        }
      }
      const scope = this.#closingAdapter.start(plan, record.reporter as FolderClosingPhaseReporter);
      if (!scope || typeof scope.cancel !== "function" || typeof scope.retarget !== "function") {
        throw new TypeError("closing adapter must return cancel and retarget operations");
      }
      if (!this.#isCurrentClose(record)) {
        scope.cancel({ restorePageTrack: true, reveal: true });
        return STALE;
      }
      record.adapterScope = scope;
      this.#retireOpeningForClose(record);
      this.#flushCloseEffects(record);
      return ACCEPTED;
    } catch (error) {
      record.error = error;
      throwAfterCleanup(error, () => {
        if (this.#isCurrentClose(record)) {
          this.#cancelClose(record, { restorePageTrack: true, reveal: true });
        }
      }, "closing presentation and cleanup both failed");
    }
  }

  #maybeReveal(record: OpenRecord<OpeningPlan>): void {
    if (!this.#isCurrentOpen(record) || record.revealed || record.error != null) return;
    if (!record.panelReady || !record.ghostsReady || !record.adapterScope) return;
    record.revealed = true;
    this.#record("visibility", "open-reveal", record);
    try {
      record.adapterScope.reveal();
    } catch (error) {
      record.error = error;
      throwAfterCleanup(error, () => {
        if (this.#isCurrentOpen(record)) {
          this.#cancelOpen(record, { restorePageTrack: true, reveal: true });
        }
      }, "opening reveal and cleanup both failed");
    }
  }

  #collectCloseEffects(record: CloseRecord<ClosingPlan>): void {
    if (!this.#isCurrentClose(record) || !record.settlementStarted) return;
    if (!record.handoffReady && record.visualPendingKeys.size === 0) {
      record.handoffReady = true;
      record.effectQueue.push("handoffReady");
      this.#record("settlement", "handoff-ready", record, {
        pendingOverlayCount: record.overlayPendingKeys.size,
        pendingVisualCount: record.visualPendingKeys.size,
      });
    }
    if (!record.overlaySettled && record.overlayPendingKeys.size === 0) {
      record.overlaySettled = true;
      record.phase = "settled";
      record.effectQueue.push("overlaySettled");
      this.#record("settlement", "overlay-settled", record, {
        pendingOverlayCount: record.overlayPendingKeys.size,
        pendingVisualCount: record.visualPendingKeys.size,
      });
    }
    this.#flushCloseEffects(record);
  }

  #flushCloseEffects(record: CloseRecord<ClosingPlan>): void {
    const scope = record.adapterScope;
    if (!scope || !this.#isCurrentClose(record)) return;
    try {
      while (record.effectQueue.length && this.#isCurrentClose(record)) {
        const effect = record.effectQueue.shift();
        if (effect === "handoffReady") {
          scope.onHandoffReady?.({ controllerKeys: freezeStrings(record.completedControllerKeys) });
        } else if (effect === "overlaySettled") {
          scope.onOverlaySettled?.();
        }
      }
    } catch (error) {
      record.error = error;
      throwAfterCleanup(error, () => {
        if (this.#isCurrentClose(record)) {
          this.#cancelClose(record, { restorePageTrack: true, reveal: true });
        }
      }, "closing effect and cleanup both failed");
    }
  }

  #setCloseHandoffActive(record: CloseRecord<ClosingPlan>, active: boolean): void {
    if (record.handoffActive === active) return;
    record.handoffActive = active;
    const folderId = active ? record.folderId : null;
    this.#record("visibility", "close-handoff-active", record, { active });
    if (active) this.#onClosingHandoffReady?.(record.folderId);
    this.#onCloseHandoffChange?.(active, folderId);
  }

  #retireOpeningForClose(record: CloseRecord<ClosingPlan>): FolderVisualReportResult {
    const opening = this.#open;
    if (!opening || opening.folderId !== record.folderId) return DUPLICATE;
    this.#cancelOpen(opening, {
      completeControllerKeys: false,
      restorePageTrack: false,
      reveal: false,
    });
    return ACCEPTED;
  }

  #cancelOpen(record: OpenRecord<OpeningPlan>, options: FolderVisualCancelOptions = {}): void {
    if (this.#open === record) this.#open = null;
    const scope = record.adapterScope;
    record.adapterScope = null;
    record.reporter = null;
    runCleanupSteps("opening cancellation failed", [
      () => scope?.cancel(options),
      () => this.#record("phase", "open-cancel", record),
    ]);
  }

  #cancelClose(record: CloseRecord<ClosingPlan>, options: FolderVisualCancelOptions = {}): void {
    if (this.#close === record) this.#close = null;
    const scope = record.adapterScope;
    record.adapterScope = null;
    record.reporter = null;
    record.effectQueue.length = 0;
    runCleanupSteps("closing cancellation failed", [
      () => this.#setCloseHandoffActive(record, false),
      () => scope?.cancel(options),
      () => this.#record("phase", "close-cancel", record),
    ]);
  }

  #openSnapshot(record: OpenRecord<OpeningPlan>): FolderOpenSnapshot {
    const adapter = freezeAdapterSnapshot(record.adapterScope);
    const adapterGhostIds = Array.isArray(adapter?.ghostIds)
      ? adapter.ghostIds.filter((id): id is string => typeof id === "string")
      : null;
    return Object.freeze({
      error: record.error,
      folderId: record.folderId,
      geometrySnapshot: record.geometrySnapshot,
      ghostIds: Object.freeze(adapterGhostIds || Array.from(record.ghostIds)),
      ghostsReady: record.ghostsReady,
      panelReady: record.panelReady,
      revealPending: !record.revealed,
      revealed: record.revealed,
      targetKey: record.targetKey,
    });
  }

  #closeSnapshot(record: CloseRecord<ClosingPlan>): FolderCloseSnapshot {
    const adapter = freezeAdapterSnapshot(record.adapterScope);
    return Object.freeze({
      activeVisuals: adapter?.activeVisuals === true,
      completedControllerKeys: freezeStrings(record.completedControllerKeys),
      detachedFrameTarget: record.detachedFrameTarget,
      error: record.error,
      folderId: record.folderId,
      frameComplete: record.frameComplete,
      frameVisualComplete: record.frameVisualComplete,
      ghostIds: freezeStrings(record.ghostIds),
      handoffActive: record.handoffActive,
      handoffReady: record.handoffReady,
      handoffRect: record.handoffRect,
      handoffTarget: record.handoffTarget,
      overlaySettled: record.overlaySettled,
      phase: record.phase,
      previewKeys: freezeStrings(record.previewKeys),
      visualGhostIds: freezeStrings(record.visualGhostIds),
      visualReleased: record.visualReleased,
    });
  }

  #record(
    action: string,
    event: string,
    record: OpenRecord<OpeningPlan> | CloseRecord<ClosingPlan>,
    details: UnknownRecord = {},
  ): void {
    this.#eventSink.recordCoordinationEvent?.({
      action,
      domain: "folderHandoff",
      event,
      folderId: record.folderId,
      phase: "phase" in record ? record.phase : record.revealed ? "open" : "opening",
      ...details,
    });
  }
}
