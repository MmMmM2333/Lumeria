import type { StageRect } from "../geometry/stageCoordinates.js";

export const DEFAULT_FOLDER_CLOSING_HANDOFF_RETAIN_CONFIG = Object.freeze({
  postReleaseFrames: 8,
  releaseFallbackMs: 900,
  settleEpsilon: 0.16,
  settleFrames: 3,
});

export interface FolderClosingHandoffRetainConfig {
  postReleaseFrames: number;
  releaseFallbackMs: number;
  settleEpsilon: number;
  settleFrames: number;
}

export interface FolderClosingHandoffMetrics {
  layoutRect?: Partial<StageRect> | null;
  rect?: Partial<StageRect> | null;
}

export interface FolderClosingHandoffResolveOptions {
  now?: unknown;
  timelineDebug?: boolean;
}

export interface FolderClosingHandoffRunOptions {
  propFolderClosingHandoffId?: string | null;
  timelineDebug?: boolean;
}

export type FolderClosingHandoffPhase =
  | "idle"
  | "post-release"
  | "prop-active"
  | "release-commit"
  | "release-wait";

export interface FolderClosingHandoffDecision {
  folderId: string | null;
  phase: FolderClosingHandoffPhase;
  rectMaxDelta: number;
  releaseAge: number;
  reason: "settled" | "timeout" | null;
  settledFrames: number;
}

export interface FolderClosingHandoffResolution {
  decision: FolderClosingHandoffDecision;
  folderClosingHandoffId: string | null;
}

export interface FolderClosingHandoffRetainer {
  consumePostReleaseFrame(folderClosingHandoffId?: string | null): void;
  readonly decision: FolderClosingHandoffDecision | null;
  readonly postReleaseFrames: number;
  readonly retainedFolderId: string | null;
  reset(): void;
  resolve(
    metrics?: FolderClosingHandoffMetrics,
    propFolderId?: string | null,
    options?: FolderClosingHandoffResolveOptions,
  ): FolderClosingHandoffResolution;
  shouldRun(options?: FolderClosingHandoffRunOptions): boolean;
  readonly settledFrameCount: number;
}

function safeNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getRectMaxDelta(
  rect: Partial<StageRect> | null | undefined,
  layoutRect: Partial<StageRect> | null | undefined,
): number {
  if (!rect || !layoutRect) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs((rect.left || 0) - (layoutRect.left || 0)),
    Math.abs((rect.top || 0) - (layoutRect.top || 0)),
    Math.abs((rect.width || 0) - (layoutRect.width || 0)),
    Math.abs((rect.height || 0) - (layoutRect.height || 0))
  );
}

export function createFolderClosingHandoffRetainer(
  config: Partial<FolderClosingHandoffRetainConfig> = {},
): FolderClosingHandoffRetainer {
  const retainConfig: FolderClosingHandoffRetainConfig = {
    ...DEFAULT_FOLDER_CLOSING_HANDOFF_RETAIN_CONFIG,
    ...config,
  };
  let retainedFolderId: string | null = null;
  let releaseStartedAt: number | null = null;
  let settledFrameCount = 0;
  let postReleaseFrameCount = 0;
  let decision: FolderClosingHandoffDecision | null = null;
  let lastReleaseCommitAt = 0;
  let lastReleasedFolderId: string | null = null;

  function reset(): void {
    retainedFolderId = null;
    releaseStartedAt = null;
    settledFrameCount = 0;
    postReleaseFrameCount = 0;
    decision = null;
    lastReleaseCommitAt = 0;
    lastReleasedFolderId = null;
  }

  function resolve(
    metrics: FolderClosingHandoffMetrics = {},
    propFolderId: string | null = null,
    options: FolderClosingHandoffResolveOptions = {},
  ): FolderClosingHandoffResolution {
    const now = safeNumber(options.now);
    const rectMaxDelta = getRectMaxDelta(metrics.rect, metrics.layoutRect);
    if (propFolderId) {
      retainedFolderId = propFolderId;
      releaseStartedAt = null;
      settledFrameCount = 0;
      postReleaseFrameCount = 0;
      decision = {
        folderId: propFolderId,
        phase: "prop-active",
        rectMaxDelta,
        releaseAge: 0,
        reason: null,
        settledFrames: settledFrameCount,
      };
      return { decision, folderClosingHandoffId: propFolderId };
    }

    if (!retainedFolderId) {
      decision = postReleaseFrameCount > 0
        ? {
            folderId: lastReleasedFolderId,
            phase: "post-release",
            rectMaxDelta,
            releaseAge: lastReleaseCommitAt ? now - lastReleaseCommitAt : 0,
            reason: null,
            settledFrames: settledFrameCount,
          }
        : { folderId: null, phase: "idle", rectMaxDelta, releaseAge: 0, reason: null, settledFrames: 0 };
      return { decision, folderClosingHandoffId: null };
    }

    if (releaseStartedAt == null) releaseStartedAt = now;
    const isSettled = rectMaxDelta <= retainConfig.settleEpsilon;
    settledFrameCount = isSettled ? settledFrameCount + 1 : 0;
    const didSettle = settledFrameCount >= retainConfig.settleFrames;
    const releaseAge = now - releaseStartedAt;
    const didTimeout = releaseAge >= retainConfig.releaseFallbackMs;
    if (!didSettle && !didTimeout) {
      decision = {
        folderId: retainedFolderId,
        phase: "release-wait",
        rectMaxDelta,
        releaseAge,
        reason: null,
        settledFrames: settledFrameCount,
      };
      return { decision, folderClosingHandoffId: retainedFolderId };
    }

    const releasedFolderId = retainedFolderId;
    const settledFramesAtDecision = settledFrameCount;
    retainedFolderId = null;
    releaseStartedAt = null;
    settledFrameCount = 0;
    lastReleasedFolderId = releasedFolderId;
    lastReleaseCommitAt = now;
    if (options.timelineDebug) postReleaseFrameCount = retainConfig.postReleaseFrames;
    decision = {
      folderId: releasedFolderId,
      phase: "release-commit",
      rectMaxDelta,
      releaseAge,
      reason: didSettle ? "settled" : "timeout",
      settledFrames: settledFramesAtDecision,
    };
    return { decision, folderClosingHandoffId: null };
  }

  function consumePostReleaseFrame(folderClosingHandoffId: string | null = null): void {
    if (!folderClosingHandoffId && postReleaseFrameCount > 0) postReleaseFrameCount -= 1;
  }

  function shouldRun(options: FolderClosingHandoffRunOptions = {}): boolean {
    return Boolean(
      options.propFolderClosingHandoffId ||
        retainedFolderId ||
        (options.timelineDebug && postReleaseFrameCount > 0)
    );
  }

  return {
    consumePostReleaseFrame,
    reset,
    resolve,
    shouldRun,
    get decision() {
      return decision;
    },
    get postReleaseFrames() {
      return postReleaseFrameCount;
    },
    get retainedFolderId() {
      return retainedFolderId;
    },
    get settledFrameCount() {
      return settledFrameCount;
    },
  };
}
