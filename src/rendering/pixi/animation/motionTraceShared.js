export function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function makeTrackKey(record = {}, options = {}) {
  const laneFallback = options.laneFallback ?? "unknown";
  const laneKeyFallback = options.laneKeyFallback ?? "unknown";
  return [
    record.targetId ?? "unknown",
    record.prop ?? "unknown",
    record.lane ?? laneFallback,
    record.laneKey ?? laneKeyFallback,
  ].join(":");
}

export function expandRange(range, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  range.min = range.min == null ? number : Math.min(range.min, number);
  range.max = range.max == null ? number : Math.max(range.max, number);
}

export function finalizeRange(range) {
  return {
    max: range.max,
    min: range.min,
  };
}

export function makeTargetsById(trace = {}) {
  const targets = new Map();
  for (const target of trace.targets || []) {
    if (target?.targetId != null) targets.set(target.targetId, target);
  }
  return targets;
}

export function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

export function resolveRecordLabel(record = {}, targetsById = null, options = {}) {
  const hasTargets = targetsById && typeof targetsById.get === "function";
  const target = record.targetId != null && hasTargets ? targetsById.get(record.targetId) : null;
  const includeRecordLabel = options.includeRecordLabel ?? !hasTargets;
  return record.sourceLabel
    || record.targetLabel
    || (includeRecordLabel ? record.label : null)
    || target?.sourceLabel
    || target?.label
    || (record.targetId != null ? `target ${record.targetId}` : "unknown");
}

export function collectRecordText(record = {}, targetsById = null, options = {}) {
  const hasTargets = targetsById && typeof targetsById.get === "function";
  const target = record.targetId != null && hasTargets ? targetsById.get(record.targetId) : null;
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
