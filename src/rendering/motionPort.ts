/** Explicit diagnostics and Motion Lab capability boundary. */
export {
  createMotionDebugAIReport,
  formatMotionDebugMarkdown,
} from "./pixi/animation/motionDebugReport.js";
export {
  MOTION_REPLAY_CAPTURE_DEFAULT_SECONDS,
  MOTION_REPLAY_CAPTURE_MAX_SECONDS,
  MOTION_REPLAY_CAPTURE_MIN_SECONDS,
  MOTION_REPLAY_CAPTURE_SAMPLE_HZ,
  buildMotionReplayCaptureDebugConfig,
  createMotionReplayCaptureController,
  createMotionReplayTrace,
  createMotionReplayTraceFromRuntime,
  normalizeMotionReplayCaptureSeconds,
} from "./pixi/animation/motionReplayTrace.js";
export {
  MOTION_REPLAY_TRACE_SCHEMA,
  MOTION_REPLAY_TRACE_VERSION,
} from "./pixi/animation/motionReplayTraceSchema.js";
export {
  createMotionRuntime,
  cubicBezier,
  easing,
  installMotionRuntimeDebugAdapterFactory,
  motionRuntime,
  progressDriver,
  resolveEase,
  spring,
  tween,
} from "./pixi/animation/motionRuntime.js";
export type {
  MotionDebugConfig,
  MotionDebugCounters,
  MotionDebugReport,
  MotionRuntime,
} from "./pixi/animation/motionRuntime.js";
export {
  killMotionOf,
  lanePreset,
  motion,
  motionAdd,
  motionLanes,
  motionSequence,
  motionTo,
  parallel,
} from "./pixi/animation/motionTween.js";
export {
  createMotionRuntimeDebugAdapter,
  sanitizeDebugMetadata,
} from "./pixi/animation/motionRuntimeDebugAdapter.dev.js";
export {
  aggregateMotionTracks,
  clamp,
  collectMotionTrackRecordsFromHistory,
  collectMotionTrackRecordsFromReplay,
  collectRecordText,
  expandRange,
  finalizeRange,
  makeMotionDebugSummary,
  makeTargetsById,
  makeTrackKey,
  normalizeQuery,
  readNumber,
  readPositiveNumber,
  resolveRecordLabel,
} from "./pixi/animation/motionTraceShared.js";
export type {
  MotionDebugSummary,
  MotionTraceRange,
  MotionTraceRecord,
  MotionTrackRecord,
} from "./pixi/animation/motionTraceShared.js";
