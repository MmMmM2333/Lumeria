import { motion } from "../animation/motionTween.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { motionSprings } from "../animation/motionPresets.js";

const PAGE_TRACK_REPLACE_REASON = "page-track-replace";
const PAGE_TRACK_SNAP_REASON = "page-track-snap";
const PAGE_TRACK_TARGET_EPSILON = 0.5;

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, readNumber(value, 0)));
}

function readPageSpan(value) {
  return Math.max(1, readNumber(value, 1));
}

function isSameTrackTarget(previousX, nextX) {
  return Math.abs(readNumber(previousX, 0) - readNumber(nextX, 0)) <= PAGE_TRACK_TARGET_EPSILON;
}

function pageIndexToTrackX(index, pageSpan) {
  return -readNumber(index, 0) * readPageSpan(pageSpan);
}

function makeScrubKey(scrub, pageSpan) {
  return [
    readNumber(scrub.fromIndex, 0),
    readNumber(scrub.toIndex, 0),
    readPageSpan(pageSpan),
    scrub.grabToken ?? scrub.gestureToken ?? "",
  ].join(":");
}

function isSettlingScrub(scrub) {
  return scrub?.settle === true || scrub?.settling === true || scrub?.phase === "settle";
}

function makeSettleToken(scrub, key) {
  if (scrub.settleToken != null) return scrub.settleToken;
  if (scrub.token != null) return scrub.token;
  return [
    key,
    readNumber(scrub.velocity, 0),
    scrub.targetProgress ?? scrub.settleProgress ?? "",
  ].join(":");
}

function normalizeScrub(scrub, pageSpan) {
  if (!scrub || typeof scrub !== "object") return null;
  const fromIndex = readNumber(scrub.fromIndex, Number.NaN);
  const toIndex = readNumber(scrub.toIndex, Number.NaN);
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return null;
  return {
    ...scrub,
    fromIndex,
    fromX: pageIndexToTrackX(fromIndex, pageSpan),
    grab: scrub.grab === true,
    grabToken: scrub.grabToken ?? scrub.gestureToken,
    progress: clamp01(scrub.progress),
    progressDelta: readNumber(scrub.progressDelta, 0),
    toIndex,
    toX: pageIndexToTrackX(toIndex, pageSpan),
  };
}

function getTrackProgress(pageTrack, scrub) {
  const distance = scrub.toX - scrub.fromX;
  if (Math.abs(distance) <= 0.0001) return scrub.progress;
  return clamp01((readNumber(pageTrack?.x, scrub.fromX) - scrub.fromX) / distance);
}

function resolveScrubProgress(motionState, pageTrack, scrub, isNewControl) {
  if (!scrub.grab) {
    motionState.grabProgressOffset = 0;
    motionState.grabToken = null;
    return scrub.progress;
  }
  if (isNewControl || motionState.grabToken !== scrub.grabToken) {
    motionState.grabProgressOffset = getTrackProgress(pageTrack, scrub);
    motionState.grabToken = scrub.grabToken;
  }
  return clamp01(readNumber(motionState.grabProgressOffset, 0) + scrub.progressDelta);
}

function describePageTrackTarget(runtime, pageTrack, options = {}) {
  if (typeof runtime?.describeTarget !== "function" || !pageTrack) return;
  const metadata = options.debugMetadata && typeof options.debugMetadata === "object" && !Array.isArray(options.debugMetadata)
    ? { ...options.debugMetadata }
    : {};
  if (metadata.kind == null) metadata.kind = "PageTrack";
  if (metadata.label == null) metadata.label = "Page track";
  if (metadata.pageIndex == null) metadata.pageIndex = readNumber(options.pageIndex, 0);
  if (metadata.pageSpan == null) metadata.pageSpan = readPageSpan(options.pageSpan);
  if (options.sourceLabel != null && metadata.sourceLabel == null) metadata.sourceLabel = options.sourceLabel;
  runtime.describeTarget(pageTrack, metadata);
}

export function createPageTrackMotionState() {
  return {
    control: null,
    grabProgressOffset: 0,
    grabToken: null,
    key: null,
    mode: null,
    settleToken: null,
    targetX: null,
  };
}

export function cancelPageTrackMotion(motionState, reason = "cancel") {
  if (!motionState) return;
  motionState.control?.cancel?.(reason);
  motionState.control = null;
  motionState.grabProgressOffset = 0;
  motionState.grabToken = null;
  motionState.key = null;
  motionState.mode = null;
  motionState.settleToken = null;
  motionState.targetX = null;
}

export function isPageTrackMotionActive(motionState, pageTrack = null) {
  if (!motionState) return false;
  const control = motionState.control;
  if (control && !control.completed && !control.released) return true;
  const targetX = Number(motionState.targetX);
  if (!Number.isFinite(targetX)) return false;
  return !isSameTrackTarget(pageTrack?.x, targetX);
}

export function getPageTrackX(index, pageSpan) {
  return pageIndexToTrackX(index, pageSpan);
}

export function updatePageTrackMotion(motionState, pageTrack, options = {}) {
  const {
    onFrame,
    pageIndex = 0,
    pageSpan = 1,
    runtime,
    scrub,
    snap = false,
    springConfig = motionSprings.layout,
  } = options;
  const targetX = pageIndexToTrackX(pageIndex, pageSpan);
  if (!pageTrack) return { mode: "none", targetX };
  describePageTrackTarget(runtime || motionRuntime, pageTrack, options);

  const normalizedScrub = normalizeScrub(scrub, pageSpan);
  if (normalizedScrub) {
    const key = makeScrubKey(normalizedScrub, pageSpan);
    const settling = isSettlingScrub(normalizedScrub);
    const settleToken = settling ? makeSettleToken(normalizedScrub, key) : null;
    if (settling &&
      motionState.control &&
      motionState.key === key &&
      motionState.mode === "settle" &&
      motionState.settleToken === settleToken) {
      return { control: motionState.control, mode: "settle", targetX: normalizedScrub.toX };
    }
    const needsNewControl = !motionState.control ||
      motionState.key !== key ||
      motionState.control.released ||
      motionState.control.completed ||
      (!settling && motionState.control.state?.driver?.type !== "progress");
    const progress = resolveScrubProgress(motionState, pageTrack, normalizedScrub, needsNewControl);

    if (needsNewControl) {
      motionState.control?.cancel?.(PAGE_TRACK_REPLACE_REASON);
      motionState.control = motion(pageTrack)
        .layout()
        .interrupt("replace")
        .ease(normalizedScrub.ease || "linear")
        .from({ x: normalizedScrub.fromX })
        .scrub(progress)
        .to({
          onComplete: onFrame,
          onUpdate: onFrame,
          x: normalizedScrub.toX,
        })
        .start({ runtime });
      motionState.key = key;
      motionState.mode = "scrub";
      motionState.settleToken = null;
    }

    if (!settling) {
      motionState.control?.setProgress?.(progress);
      motionState.mode = "scrub";
      return { control: motionState.control, mode: "scrub", targetX: normalizedScrub.toX };
    }

    if (motionState.settleToken !== settleToken) {
      motionState.control?.setProgress?.(progress);
      motionState.control?.settle?.({
        midpoint: normalizedScrub.midpoint,
        progress: normalizedScrub.targetProgress ?? normalizedScrub.settleProgress,
        spring: normalizedScrub.spring || springConfig,
        valueVelocity: normalizedScrub.valueVelocity,
        velocity: normalizedScrub.velocity,
        velocityThreshold: normalizedScrub.velocityThreshold,
      });
      motionState.settleToken = settleToken;
    }
    motionState.mode = "settle";
    return { control: motionState.control, mode: "settle", targetX: normalizedScrub.toX };
  }

  if (motionState.mode === "scrub" || motionState.mode === "settle") {
    cancelPageTrackMotion(motionState, PAGE_TRACK_REPLACE_REASON);
  }
  if (snap) {
    motionState.control?.cancel?.(PAGE_TRACK_SNAP_REASON);
    if (isSameTrackTarget(pageTrack.x, targetX)) {
      motionState.control = null;
      motionState.key = null;
      motionState.mode = "spring";
      motionState.settleToken = null;
      motionState.targetX = targetX;
      pageTrack.x = targetX;
      return { control: null, mode: "spring", targetX };
    }
    motionState.control = motion(pageTrack)
      .layout()
      .spring(springConfig)
      .interrupt("retarget")
      .to({
        onComplete: onFrame,
        onUpdate: onFrame,
        snap: true,
        x: targetX,
      })
      .start({ runtime });
    motionState.key = null;
    motionState.mode = "spring";
    motionState.settleToken = null;
    motionState.targetX = targetX;
    return { control: motionState.control, mode: "spring", targetX };
  }
  if (motionState.mode === "spring" && isSameTrackTarget(motionState.targetX, targetX)) {
    return { control: motionState.control, mode: "spring", targetX };
  }
  if (!motionState.control && isSameTrackTarget(pageTrack.x, targetX)) {
    motionState.key = null;
    motionState.mode = "spring";
    motionState.settleToken = null;
    motionState.targetX = targetX;
    pageTrack.x = targetX;
    return { control: null, mode: "spring", targetX };
  }
  motionState.control = motion(pageTrack)
    .layout()
    .spring(springConfig)
    .interrupt("retarget")
    .to({
      onComplete: onFrame,
      onUpdate: onFrame,
      snap,
      x: targetX,
    })
    .start({ runtime });
  motionState.key = null;
  motionState.mode = "spring";
  motionState.settleToken = null;
  motionState.targetX = targetX;
  return { control: motionState.control, mode: "spring", targetX };
}
