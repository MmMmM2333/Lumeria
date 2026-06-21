import { MOTION_LAB_SCENARIOS } from "./motionLabScenarios.js";

export const MOTION_LAB_QUERY_PARAM = "motionLab";
export { MOTION_LAB_SCENARIOS };

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(digits);
}

function formatCount(value) {
  return String(Math.max(0, Math.floor(readNumber(value, 0))));
}

function normalizeSearch(search = "") {
  const text = String(search || "");
  if (!text) return "";
  return text.startsWith("?") ? text : `?${text}`;
}

export function shouldMountMotionLab(search = "", dev = false) {
  if (!dev) return false;
  try {
    const params = new URLSearchParams(normalizeSearch(search));
    if (!params.has(MOTION_LAB_QUERY_PARAM)) return false;
    const value = String(params.get(MOTION_LAB_QUERY_PARAM) || "1").trim().toLowerCase();
    return value !== "0" && value !== "false" && value !== "off";
  } catch {
    return false;
  }
}

export function buildMotionLabScenarioRows(scenarios = MOTION_LAB_SCENARIOS, selectedId = "") {
  return scenarios.map((scenario, index) => ({
    assertionCount: Array.isArray(scenario.assertions) ? scenario.assertions.length : 0,
    description: scenario.description || "",
    id: scenario.id || `scenario-${index}`,
    label: scenario.label || scenario.id || `Scenario ${index + 1}`,
    selected: scenario.id === selectedId || (!selectedId && index === 0),
    stage: scenario.stage || "draft",
  }));
}

export function buildMotionLabOverviewRows(report = {}, trace = null) {
  const summary = report.summary || {};
  const history = report.history || {};
  const config = report.config || {};
  const traceSummary = trace?.summary || {};
  return [
    { label: "runtime", value: config.enabled ? "debug" : "idle" },
    { label: "active", value: formatCount(summary.activeAnimationCount) },
    { label: "warnings", value: formatCount(summary.warningCount) },
    { label: "events/samples", value: `${formatCount(history.events?.length)} / ${formatCount(history.samples?.length)}`, wide: true },
    { label: "trace", value: trace ? "ready" : "none" },
    { label: "trace frames/events", value: `${formatCount(traceSummary.frameCount)} / ${formatCount(traceSummary.eventCount)}`, wide: true },
  ];
}

export function buildMotionLabAssertionRows(assertions = []) {
  return assertions.map((assertion, index) => ({
    detail: assertion.detail || assertion.label || "-",
    id: assertion.id || `assertion-${index}`,
    label: assertion.label || assertion.id || `Assertion ${index + 1}`,
    passed: assertion.passed === true,
    status: assertion.status || (assertion.passed ? "pass" : "fail"),
  }));
}

export function buildMotionLabTimelineRows(report = {}, limit = 10) {
  const events = Array.isArray(report.history?.events) ? report.history.events : [];
  return events
    .slice(-Math.max(0, Math.floor(readNumber(limit, 10))))
    .reverse()
    .map((event, index) => ({
      detail: [
        event.sourceLabel || event.targetLabel || (event.targetId != null ? `target ${event.targetId}` : "unknown"),
        event.prop || "-",
        `${formatNumber(event.value, 2)} -> ${formatNumber(event.to, 2)}`,
        event.reason ? `reason=${event.reason}` : null,
      ].filter(Boolean).join(" / "),
      key: `${event.timeMs ?? index}:${event.type || "event"}:${event.targetId ?? "unknown"}:${event.prop || "-"}`,
      time: `${formatNumber(event.timeMs, 0)}ms`,
      type: event.type || "event",
    }));
}

export function buildMotionLabCurveRows(report = {}, limit = 6) {
  const stats = Array.isArray(report.curveStats) ? report.curveStats : [];
  return stats
    .map((curve) => ({
      driver: curve.driver || "-",
      key: curve.key || `${curve.targetId ?? "unknown"}:${curve.prop || "-"}`,
      label: `${curve.sourceLabel || curve.targetLabel || (curve.targetId != null ? `target ${curve.targetId}` : "unknown")}.${curve.prop || "-"}`,
      lane: [curve.lane, curve.laneKey].filter(Boolean).join("/") || "-",
      maxVelocity: formatNumber(curve.maxVelocity, 2),
      samples: formatCount(curve.sampleCount),
    }))
    .sort((a, b) => (readNumber(b.samples) - readNumber(a.samples)) || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, 6))));
}
