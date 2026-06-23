import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { motionRuntime, spring } from "./motionRuntime.js";
import { prefersReducedMotion } from "./motionPreferences.js";
import { motionSprings } from "./motionPresets.js";

export const pageTrackSpring = motionSprings.layout;
export const panelSpring = motionSprings.handoff;
export const folderPanelOpenSpring = motionSprings.folderPanelOpen;
export const desktopVisualSpring = motionSprings.settle;

const springStates = new WeakMap();

function readNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function makeSpringState(control) {
  if (!control?.state) return null;
  const state = control.state;
  const existing = springStates.get(state);
  if (existing) return existing;
  const springState = {
    cancel: control.cancel,
    control,
    get config() {
      return state.driver?.config;
    },
    get prop() {
      return state.prop;
    },
    get target() {
      return state.target;
    },
    get to() {
      return state.to;
    },
    set to(value) {
      state.to = readNumber(value, state.to);
    },
    get value() {
      return state.value;
    },
    get velocity() {
      return state.velocity;
    },
    set velocity(value) {
      state.velocity = readNumber(value, state.velocity);
    },
  };
  springStates.set(state, springState);
  return springState;
}

export function springTo(target, prop, to, config, options = {}) {
  if (!target || !prop) return null;
  const runtime = options.runtime || motionRuntime;
  const numericTarget = readNumber(to, readNumber(target[prop]));
  if (typeof runtime.describeTarget === "function") {
    const metadata = options.debugMetadata && typeof options.debugMetadata === "object" && !Array.isArray(options.debugMetadata)
      ? { ...options.debugMetadata }
      : {};
    if (options.sourceLabel != null && metadata.sourceLabel == null) metadata.sourceLabel = options.sourceLabel;
    if (Object.keys(metadata).length) runtime.describeTarget(target, metadata);
  }
  if (options.snap || prefersReducedMotion()) {
    stopSpring(target, prop, { reason: options.reason || "snap", runtime });
    target[prop] = numericTarget;
    options.onUpdate?.(numericTarget);
    options.onArrive?.(numericTarget);
    options.onComplete?.();
    return null;
  }

  const control = runtime.animate(target, prop, numericTarget, {
    driver: spring(config || pageTrackSpring),
    lane: "base",
    onArrive: options.onArrive,
    onCancel: options.onCancel,
    onComplete: options.onComplete,
    onUpdate: options.onUpdate,
    velocity: options.velocity,
  });
  return makeSpringState(control);
}

export function stopSpring(target, prop, options = {}) {
  const runtime = options.runtime || motionRuntime;
  return runtime.stop(target, prop, { lane: "base", reason: options.reason });
}

export function stopTargetSprings(target, options = {}) {
  const runtime = options.runtime || motionRuntime;
  return runtime.cancelTarget(target, { lane: "base", reason: options.reason });
}

function stopAllSprings() {
  motionRuntime.reset();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopAllSprings());
  reloadOnPixiHotUpdate(import.meta.hot);
}
