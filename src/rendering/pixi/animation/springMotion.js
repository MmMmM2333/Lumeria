import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const MAX_DELTA_SECONDS = 0.05;
const STEP_SECONDS = 1 / 120;

const activeSprings = new Set();
const springRegistry = new WeakMap();
let tickerActive = false;
let lastTime = 0;

const springRest = Object.freeze({ restDelta: 0.01, restSpeed: 0.01 });
export const pageTrackSpring = Object.freeze({ stiffness: 190, damping: 28, mass: 0.9, ...springRest });

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

function readNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getTargetMap(target, create) {
  let targetMap = springRegistry.get(target);
  if (!targetMap && create) {
    targetMap = new Map();
    springRegistry.set(target, targetMap);
  }
  return targetMap;
}

function ensureTicker() {
  if (tickerActive) return;
  tickerActive = true;
  lastTime = nowMs();
  gsap.ticker.add(tickSprings);
}

function releaseTickerIfIdle() {
  if (!tickerActive || activeSprings.size) return;
  tickerActive = false;
  lastTime = 0;
  gsap.ticker.remove(tickSprings);
}

function removeSpring(state) {
  activeSprings.delete(state);
  const targetMap = springRegistry.get(state.target);
  if (targetMap?.get(state.prop) === state) {
    targetMap.delete(state.prop);
    if (!targetMap.size) springRegistry.delete(state.target);
  }
  releaseTickerIfIdle();
}

function settleSpring(state) {
  state.target[state.prop] = state.to;
  const onComplete = state.onComplete;
  removeSpring(state);
  onComplete?.();
}

function stepSpring(state, dt) {
  const stiffness = Math.max(0, readNumber(state.config.stiffness, 0));
  const damping = Math.max(0, readNumber(state.config.damping, 0));
  const mass = Math.max(0.0001, readNumber(state.config.mass, 1));
  const force = -stiffness * (state.value - state.to);
  const dampingForce = -damping * state.velocity;
  const acceleration = (force + dampingForce) / mass;
  state.velocity += acceleration * dt;
  state.value += state.velocity * dt;
}

function tickSprings() {
  const time = nowMs();
  const elapsed = Math.min(MAX_DELTA_SECONDS, Math.max(0, (time - lastTime) / 1000));
  lastTime = time;
  if (!elapsed) return;

  for (const state of Array.from(activeSprings)) {
    if (state.target?.destroyed) {
      removeSpring(state);
      continue;
    }

    let remaining = elapsed;
    while (remaining > 0) {
      const step = Math.min(STEP_SECONDS, remaining);
      stepSpring(state, step);
      remaining -= step;
    }

    const delta = Math.abs(state.to - state.value);
    const speed = Math.abs(state.velocity);
    const restDelta = Math.max(0, readNumber(state.config.restDelta, springRest.restDelta));
    const restSpeed = Math.max(0, readNumber(state.config.restSpeed, springRest.restSpeed));

    if (delta <= restDelta && speed <= restSpeed) {
      settleSpring(state);
      continue;
    }

    state.target[state.prop] = state.value;
    state.onUpdate?.(state.value);
  }
}

export function springTo(target, prop, to, config, options = {}) {
  if (!target || !prop) return null;
  const current = readNumber(target[prop]);
  const numericTarget = readNumber(to, current);
  const springConfig = config || pageTrackSpring;
  if (options.snap) {
    stopSpring(target, prop);
    target[prop] = numericTarget;
    options.onUpdate?.(numericTarget);
    options.onComplete?.();
    return null;
  }

  const targetMap = getTargetMap(target, true);
  let state = targetMap.get(prop);

  if (state) {
    state.value = readNumber(target[prop], state.value);
    state.to = numericTarget;
    state.config = springConfig;
    state.onUpdate = options.onUpdate;
    state.onComplete = options.onComplete;
    return state;
  }

  state = {
    config: springConfig,
    onComplete: options.onComplete,
    onUpdate: options.onUpdate,
    prop,
    target,
    to: numericTarget,
    value: current,
    velocity: readNumber(options.velocity),
  };

  targetMap.set(prop, state);
  activeSprings.add(state);
  ensureTicker();
  return state;
}

export function stopSpring(target, prop) {
  const state = springRegistry.get(target)?.get(prop);
  if (state) removeSpring(state);
}

export function stopTargetSprings(target) {
  const targetMap = springRegistry.get(target);
  if (!targetMap) return;
  for (const state of Array.from(targetMap.values())) removeSpring(state);
}

function stopAllSprings() {
  for (const state of Array.from(activeSprings)) removeSpring(state);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopAllSprings());
  reloadOnPixiHotUpdate(import.meta.hot);
}
