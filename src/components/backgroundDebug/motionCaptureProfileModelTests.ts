import {
  estimateMotionCaptureProfileSize,
  filterMotionCaptureRecords,
  formatMotionCaptureEstimateBytes,
  getMotionCaptureProfileDefinition,
  getMotionCaptureProfiles,
  matchesMotionCaptureProfileRecord,
  MOTION_CAPTURE_ALLOWED_PROPS,
  MOTION_CAPTURE_DEFAULT_DURATION_MS,
  MOTION_CAPTURE_DEFAULT_SAMPLE_HZ,
  MOTION_CAPTURE_PROFILE_ALPHA_FOCUS,
  MOTION_CAPTURE_PROFILE_CUSTOM,
  MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL,
  MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS,
  MOTION_CAPTURE_PROFILE_TRANSFORM_FOCUS,
  normalizeMotionCaptureProfile,
  normalizeMotionCapturePropAllowlist,
  normalizeMotionCaptureTargetFilters,
} from "./motionCaptureProfileModel.js";
import type { MotionTraceRecord } from "../../rendering/motionPort.js";

export function runMotionCaptureProfileModelTests() {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Motion capture profile model test failed] ${message}`);
  }

  const profiles = getMotionCaptureProfiles();
  const profileIds = profiles.map((profile) => profile.id);
  assert(profileIds.includes(MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL), "profiles should include Default Visual");
  assert(profileIds.includes(MOTION_CAPTURE_PROFILE_TRANSFORM_FOCUS), "profiles should include Transform Focus");
  assert(profileIds.includes(MOTION_CAPTURE_PROFILE_ALPHA_FOCUS), "profiles should include Alpha Focus");
  assert(profileIds.includes(MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS), "profiles should include Interruptions");
  assert(profileIds.includes(MOTION_CAPTURE_PROFILE_CUSTOM), "profiles should include Custom");

  const defaultProfile = getMotionCaptureProfileDefinition(MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL);
  assert(defaultProfile.propAllowlist.length === MOTION_CAPTURE_ALLOWED_PROPS.length, "default profile should include all allowed visual props");
  assert(defaultProfile.includeSamples && defaultProfile.includeEvents, "default profile should include samples and events");

  const transformProfile = normalizeMotionCaptureProfile(MOTION_CAPTURE_PROFILE_TRANSFORM_FOCUS);
  assert(transformProfile.propAllowlist.includes("x") && transformProfile.propAllowlist.includes("rotation"), "transform profile should include transform props");
  assert(!transformProfile.propAllowlist.includes("alpha"), "transform profile should exclude alpha");

  const alphaProfile = normalizeMotionCaptureProfile(MOTION_CAPTURE_PROFILE_ALPHA_FOCUS);
  assert(alphaProfile.propAllowlist.length === 1 && alphaProfile.propAllowlist[0] === "alpha", "alpha profile should only include alpha");

  const interruptionProfile = normalizeMotionCaptureProfile(MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS);
  assert(!interruptionProfile.includeSamples && interruptionProfile.includeEvents, "interruptions profile should be lifecycle-event only");
  assert(interruptionProfile.eventTypes.includes("cancel") && interruptionProfile.eventTypes.includes("retarget"), "interruptions profile should focus interruption event types");

  const unknownProfile = normalizeMotionCaptureProfile("unknown");
  assert(unknownProfile.id === MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL, "unknown profile ids should fall back to default visual");

  const customProfile = normalizeMotionCaptureProfile({
    eventTypes: [" cancel ", "RETARGET", "cancel"],
    id: MOTION_CAPTURE_PROFILE_CUSTOM,
    includeEvents: true,
    includeSamples: true,
    label: "  Alpha Desktop  ",
    propAllowlist: ["alpha", "x", "z", "x"],
    targetFilters: {
      kinds: [" Icon ", "Icon"],
      layers: ["desktop", "desktop"],
      sourceLabels: ["desktop.icon.node"],
      sourceQuery: " icon ",
    },
  });
  assert(customProfile.id === MOTION_CAPTURE_PROFILE_CUSTOM, "custom profile should preserve the custom id");
  assert(customProfile.label === "Alpha Desktop", "custom profile should trim labels");
  assert(customProfile.propAllowlist.join(",") === "alpha,x", "custom props should dedupe and drop unsupported props");
  assert(customProfile.eventTypes.join(",") === "cancel,retarget", "custom event types should lowercase and dedupe");
  assert(customProfile.targetFilters.layers.length === 1 && customProfile.targetFilters.layers[0] === "desktop", "target filters should dedupe layers");
  assert(customProfile.targetFilters.kinds.length === 1 && customProfile.targetFilters.kinds[0] === "Icon", "target filters should dedupe kinds");
  assert(customProfile.targetFilters.sourceQuery === "icon", "target filters should trim source query");

  assert(normalizeMotionCapturePropAllowlist(["scale", "bad", "scaleY"]).join(",") === "scale,scaleY", "prop allowlist should only keep supported visual props");
  const normalizedFilters = normalizeMotionCaptureTargetFilters({ layer: "folder", kind: "FolderPanel", sourceLabel: "folder.panel" });
  const normalizedLayer = normalizedFilters.layers[0];
  const normalizedKind = normalizedFilters.kinds[0];
  const normalizedSourceLabel = normalizedFilters.sourceLabels[0];
  assert(normalizedLayer === "folder" && normalizedKind === "FolderPanel", "target filter aliases should normalize");
  assert(normalizedSourceLabel === "folder.panel", "sourceLabel alias should normalize");

  const xRecord: MotionTraceRecord = {
    layer: "desktop",
    prop: "x",
    sourceLabel: "desktop.icon.node",
    targetId: 1,
    targetKind: "Icon",
    type: "sample",
  };
  const alphaRecord: MotionTraceRecord = { ...xRecord, prop: "alpha", type: "sample" };
  const unsupportedRecord: MotionTraceRecord = { ...xRecord, prop: "z", type: "sample" };
  assert(matchesMotionCaptureProfileRecord(xRecord, MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL), "default profile should match x samples");
  assert(matchesMotionCaptureProfileRecord(alphaRecord, MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL), "default profile should match alpha samples");
  assert(!matchesMotionCaptureProfileRecord(unsupportedRecord, MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL), "default profile should reject unsupported props");
  assert(!matchesMotionCaptureProfileRecord(alphaRecord, MOTION_CAPTURE_PROFILE_TRANSFORM_FOCUS), "transform profile should reject alpha samples");
  assert(matchesMotionCaptureProfileRecord(alphaRecord, MOTION_CAPTURE_PROFILE_ALPHA_FOCUS), "alpha profile should match alpha samples");
  assert(!matchesMotionCaptureProfileRecord(xRecord, MOTION_CAPTURE_PROFILE_ALPHA_FOCUS), "alpha profile should reject transform samples");

  const cancelRecord: MotionTraceRecord = { ...xRecord, reason: "replace", type: "cancel" };
  const retargetRecord: MotionTraceRecord = { ...xRecord, type: "retarget" };
  const startRecord: MotionTraceRecord = { ...xRecord, type: "start" };
  assert(matchesMotionCaptureProfileRecord(cancelRecord, MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS), "interruptions profile should match cancel events");
  assert(matchesMotionCaptureProfileRecord(retargetRecord, MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS), "interruptions profile should match retarget events");
  assert(!matchesMotionCaptureProfileRecord(startRecord, MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS), "interruptions profile should reject non-interruption events");
  assert(!matchesMotionCaptureProfileRecord(xRecord, MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS), "interruptions profile should reject samples");

  const folderRecord: MotionTraceRecord = {
    layer: "folder",
    prop: "alpha",
    sourceLabel: "folder.panel",
    targetId: 2,
    targetKind: "FolderPanel",
    type: "sample",
  };
  const desktopAlphaProfile = normalizeMotionCaptureProfile({
    id: MOTION_CAPTURE_PROFILE_CUSTOM,
    propAllowlist: ["alpha"],
    targetFilters: { kinds: ["Icon"], layers: ["desktop"], sourceQuery: "icon" },
  });
  assert(matchesMotionCaptureProfileRecord(alphaRecord, desktopAlphaProfile), "target filters should match layer/kind/source query");
  assert(!matchesMotionCaptureProfileRecord(folderRecord, desktopAlphaProfile), "target filters should reject non-matching targets");
  const filteredRecords = filterMotionCaptureRecords([xRecord, alphaRecord, folderRecord], desktopAlphaProfile);
  const filteredRecord = filteredRecords[0];
  assert(filteredRecords.length === 1 && filteredRecord !== undefined && filteredRecord.prop === "alpha", "record filter should return only matching records");

  const report: {
    animations: MotionTraceRecord[];
    config: { recordWindowMs: number; sampleHz: number };
    history: {
      events: MotionTraceRecord[];
      samples: Array<{ animations: MotionTraceRecord[]; frame: number; timeMs: number }>;
    };
  } = {
    animations: [
      { layer: "desktop", lane: "base", laneKey: "icon-x", prop: "x", sourceLabel: "desktop.icon.node", targetId: 1, targetKind: "Icon" },
      { layer: "desktop", lane: "base", laneKey: "icon-alpha", prop: "alpha", sourceLabel: "desktop.icon.node", targetId: 1, targetKind: "Icon" },
      { layer: "folder", lane: "base", laneKey: "panel-y", prop: "y", sourceLabel: "folder.panel", targetId: 2, targetKind: "FolderPanel" },
    ],
    config: {
      recordWindowMs: MOTION_CAPTURE_DEFAULT_DURATION_MS,
      sampleHz: MOTION_CAPTURE_DEFAULT_SAMPLE_HZ,
    },
    history: {
      events: [
        { layer: "desktop", lane: "base", laneKey: "icon-x", prop: "x", sourceLabel: "desktop.icon.node", targetId: 1, targetKind: "Icon", type: "start" },
        { layer: "desktop", lane: "base", laneKey: "icon-alpha", prop: "alpha", reason: "replace", sourceLabel: "desktop.icon.node", targetId: 1, targetKind: "Icon", type: "cancel" },
        { layer: "folder", lane: "base", laneKey: "panel-y", prop: "y", sourceLabel: "folder.panel", targetId: 2, targetKind: "FolderPanel", type: "retarget" },
        { layer: "desktop", lane: "base", laneKey: "bad-z", prop: "z", sourceLabel: "desktop.bad", targetId: 3, targetKind: "Icon", type: "cancel" },
      ],
      samples: [{
        frame: 1,
        timeMs: 0,
        animations: [
          { layer: "desktop", lane: "base", laneKey: "icon-x", prop: "x", sourceLabel: "desktop.icon.node", targetId: 1, targetKind: "Icon" },
          { layer: "desktop", lane: "base", laneKey: "icon-alpha", prop: "alpha", sourceLabel: "desktop.icon.node", targetId: 1, targetKind: "Icon" },
          { layer: "folder", lane: "base", laneKey: "panel-y", prop: "y", sourceLabel: "folder.panel", targetId: 2, targetKind: "FolderPanel" },
        ],
      }],
    },
  };
  const defaultEstimate = estimateMotionCaptureProfileSize(report, MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL, { durationMs: 2000, sampleHz: 10 });
  assert(defaultEstimate.profileId === MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL, "estimate should include profile id");
  assert(defaultEstimate.frameCount === 20, "estimate should derive frame count from duration and sample rate");
  assert(defaultEstimate.trackCount === 3, "default estimate should count supported matching tracks");
  assert(defaultEstimate.targetCount === 2, "default estimate should count matching targets");
  assert(defaultEstimate.eventCount === 3, "default estimate should count matching supported events");
  assert(defaultEstimate.valueCount === 60, "estimate should multiply frames by matching tracks");
  assert(defaultEstimate.jsonBytes > defaultEstimate.valueCount, "estimate should produce a non-trivial JSON byte estimate");
  assert(defaultEstimate.jsonSizeLabel.endsWith("KB"), "estimate should expose a readable size label");

  const alphaEstimate = estimateMotionCaptureProfileSize(report, desktopAlphaProfile, { durationMs: 1000, sampleHz: 5 });
  assert(alphaEstimate.frameCount === 5, "custom estimate should use requested duration/sample rate");
  assert(alphaEstimate.trackCount === 1 && alphaEstimate.targetCount === 1, "custom estimate should apply prop and target filters");
  assert(alphaEstimate.eventCount === 1, "custom estimate should count matching alpha lifecycle events");

  const interruptionEstimate = estimateMotionCaptureProfileSize(report, MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS, { durationMs: 2000, sampleHz: 10 });
  assert(interruptionEstimate.frameCount === 0, "interruptions estimate should not reserve sample frames");
  assert(interruptionEstimate.eventCount === 2, "interruptions estimate should count interruption lifecycle events");
  assert(interruptionEstimate.trackCount === 2, "interruptions estimate should count matching event tracks");
  assert(formatMotionCaptureEstimateBytes(512) === "512 B", "byte formatter should format bytes");
  assert(formatMotionCaptureEstimateBytes(4096) === "4.0 KB", "byte formatter should format kilobytes");
}
