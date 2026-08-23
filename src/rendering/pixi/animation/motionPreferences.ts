import { reloadOnPixiHotUpdate } from "../devHmr.js";

let reducedMotionOverride: boolean | null = null;
let reducedMotionQuery: MediaQueryList | null = null;
let reducedMotion = false;
let removeReducedMotionListener: (() => void) | null = null;

function updateReducedMotion(event: MediaQueryListEvent | null = null): void {
  reducedMotion = Boolean(event?.matches ?? reducedMotionQuery?.matches);
}

function detachReducedMotionListener(): void {
  removeReducedMotionListener?.();
  removeReducedMotionListener = null;
}

function attachReducedMotionListener(query: MediaQueryList | null): void {
  if (!query || removeReducedMotionListener) return;
  const listener = (event: MediaQueryListEvent) => updateReducedMotion(event);
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

function readSystemReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  reducedMotionQuery = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  updateReducedMotion();
  attachReducedMotionListener(reducedMotionQuery);
  return reducedMotion;
}

export function prefersReducedMotion(): boolean {
  if (reducedMotionOverride != null) return reducedMotionOverride;
  return reducedMotionQuery ? reducedMotion : readSystemReducedMotion();
}

export function setReducedMotionForTests(value: boolean | null): void {
  reducedMotionOverride = value == null ? null : Boolean(value);
}

export function clearMotionPreferencesForTests(): void {
  reducedMotionOverride = null;
  detachReducedMotionListener();
  reducedMotionQuery = null;
  reducedMotion = false;
}

readSystemReducedMotion();

reloadOnPixiHotUpdate(import.meta.hot);
