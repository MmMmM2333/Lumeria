import { reloadOnPixiHotUpdate } from "../devHmr.js";

let reducedMotionOverride = null;
let reducedMotionQuery = null;
let reducedMotion = false;

function readSystemReducedMotion() {
  if (typeof globalThis.matchMedia !== "function") return false;
  reducedMotionQuery = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion = Boolean(reducedMotionQuery?.matches);
  return reducedMotion;
}

export function prefersReducedMotion() {
  if (reducedMotionOverride != null) return reducedMotionOverride;
  return reducedMotionQuery ? reducedMotion : readSystemReducedMotion();
}

export function setReducedMotionForTests(value) {
  reducedMotionOverride = value == null ? null : Boolean(value);
}

export function clearMotionPreferencesForTests() {
  reducedMotionOverride = null;
  reducedMotionQuery = null;
  reducedMotion = false;
}

readSystemReducedMotion();

reloadOnPixiHotUpdate(import.meta.hot);
