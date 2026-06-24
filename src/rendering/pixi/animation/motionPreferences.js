import { reloadOnPixiHotUpdate } from "../devHmr.js";

let reducedMotionOverride = null;
let reducedMotionQuery = null;
let reducedMotion = false;
let removeReducedMotionListener = null;

function updateReducedMotion(event = null) {
  reducedMotion = Boolean(event?.matches ?? reducedMotionQuery?.matches);
}

function detachReducedMotionListener() {
  removeReducedMotionListener?.();
  removeReducedMotionListener = null;
}

function attachReducedMotionListener(query) {
  if (!query || removeReducedMotionListener) return;
  const listener = (event) => updateReducedMotion(event);
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
    removeReducedMotionListener = () => query.removeEventListener?.("change", listener);
    return;
  }
  if (typeof query.addListener === "function") {
    query.addListener(listener);
    removeReducedMotionListener = () => query.removeListener?.(listener);
  }
}

function readSystemReducedMotion() {
  if (typeof globalThis.matchMedia !== "function") return false;
  reducedMotionQuery = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  updateReducedMotion();
  attachReducedMotionListener(reducedMotionQuery);
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
  detachReducedMotionListener();
  reducedMotionQuery = null;
  reducedMotion = false;
}

readSystemReducedMotion();

reloadOnPixiHotUpdate(import.meta.hot);
