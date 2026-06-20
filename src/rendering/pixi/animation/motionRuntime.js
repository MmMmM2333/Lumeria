import { reloadOnPixiHotUpdate } from "../devHmr.js";

const DEFAULT_MAX_DELTA_SECONDS = 0.05;
const DEFAULT_STEP_SECONDS = 1 / 120;
const DEFAULT_REST_DELTA = 0.01;
const DEFAULT_REST_SPEED = 0.01;
const DEFAULT_ARRIVE_DELTA = 0.5;
const DEFAULT_BLEND_DURATION = 0.08;
const DEFAULT_SETTLE_SPRING = Object.freeze({
  damping: 31,
  mass: 0.9,
  restDelta: DEFAULT_REST_DELTA,
  restSpeed: DEFAULT_REST_SPEED,
  stiffness: 340,
});
const NEUTRAL_EPSILON = 0.0001;

let nextLaneId = 1;

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(readNumber(value), 0, 1);
}

function linear(t) {
  return t;
}

function normalizeInterrupt(policy) {
  if (policy === "blend" || policy === "ignore" || policy === "replace" || policy === "retarget") return policy;
  return "auto";
}

function normalizeMilestones(milestones) {
  if (!Array.isArray(milestones)) return [];
  return milestones
    .filter((milestone) => typeof milestone?.callback === "function")
    .map((milestone) => ({
      callback: milestone.callback,
      fired: false,
      progress: clamp01(milestone.progress),
    }))
    .sort((a, b) => a.progress - b.progress);
}

export const easing = Object.freeze({
  linear,
  "power1.out": (t) => 1 - (1 - t) ** 2,
  "power2.in": (t) => t * t * t,
  "power2.out": (t) => 1 - (1 - t) ** 3,
  "power2.inOut": (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  "power3.out": (t) => 1 - (1 - t) ** 4,
  "sine.inOut": (t) => -(Math.cos(Math.PI * t) - 1) / 2,
});

export function cubicBezier(x1, y1, x2, y2) {
  // Newton iteration against x(t), with a bisection fallback for flat curves.
  const sample = (a, b, c, t) => ((a * t + b) * t + c) * t;
  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  return (x) => {
    const target = clamp(readNumber(x), 0, 1);
    let t = target;
    for (let i = 0; i < 6; i += 1) {
      const current = sample(ax, bx, cx, t) - target;
      const derivative = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(current) < 0.000001) break;
      if (Math.abs(derivative) < 0.000001) break;
      t = clamp(t - current / derivative, 0, 1);
    }
    let low = 0;
    let high = 1;
    for (let i = 0; i < 8; i += 1) {
      const current = sample(ax, bx, cx, t);
      if (Math.abs(current - target) < 0.000001) break;
      if (current < target) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return sample(ay, by, cy, t);
  };
}

export function resolveEase(ease) {
  if (typeof ease === "function") return ease;
  if (typeof ease === "string" && easing[ease]) return easing[ease];
  return linear;
}

export function spring(config = {}) {
  return Object.freeze({ config, type: "spring" });
}

export function tween(options = {}) {
  return Object.freeze({ options, type: "tween" });
}

export function decay(options = {}) {
  return Object.freeze({ options, type: "decay" });
}

export function progressDriver(options = {}) {
  return { options: { progress: 0, ...options }, type: "progress" };
}

function makeDebugCounters() {
  return {
    activeChannels: 0,
    activeTargets: 0,
    afterFrameFlushes: 0,
    canceled: 0,
    canceledByReason: {},
    completed: 0,
    frames: 0,
    released: 0,
    writes: 0,
    writesLastFrame: 0,
    started: 0,
  };
}

function incrementDebugCount(counts, key) {
  const normalizedKey = key == null ? "unknown" : String(key);
  counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
}

function makeDebugSummary(animations) {
  const targetIds = new Set();
  const channelKeys = new Set();
  const summary = {
    activeAnimationCount: animations.length,
    activeChannelCount: 0,
    activeTargetCount: 0,
    byDriver: {},
    byLane: {},
    byLaneKey: {},
    byProp: {},
    byTargetId: {},
  };

  for (const animation of animations) {
    incrementDebugCount(summary.byDriver, animation.driver);
    incrementDebugCount(summary.byLane, animation.lane);
    incrementDebugCount(summary.byLaneKey, animation.laneKey);
    incrementDebugCount(summary.byProp, animation.prop);
    incrementDebugCount(summary.byTargetId, animation.targetId);
    if (animation.targetId != null) targetIds.add(animation.targetId);
    channelKeys.add(`${animation.targetId ?? "unknown"}:${animation.prop}`);
  }

  summary.activeTargetCount = targetIds.size;
  summary.activeChannelCount = channelKeys.size;
  return summary;
}

export function createMotionRuntime(options = {}) {
  const scheduler = options.scheduler || globalThis;
  const autoStart = options.autoStart !== false;
  const maxDeltaSeconds = Math.max(0.001, readNumber(options.maxDeltaSeconds, DEFAULT_MAX_DELTA_SECONDS));
  const stepSeconds = Math.max(0.001, readNumber(options.stepSeconds, DEFAULT_STEP_SECONDS));

  const targetChannels = new WeakMap();
  const activeAnimations = new Set();
  const activeTargets = new Set();
  const afterFrameCallbacks = new Set();
  const dirtyChannels = new Set();
  const pendingUpdateAnimations = new Set();
  const targetIds = new WeakMap();
  const debug = makeDebugCounters();
  const activeAnimationScratch = [];
  const afterFrameScratch = [];
  const dirtyChannelScratch = [];
  const pendingUpdateScratch = [];
  let frameHandle = null;
  let lastFrameTime = 0;
  let nextTargetId = 1;

  function getTargetId(target) {
    if (!target) return null;
    let id = targetIds.get(target);
    if (!id) {
      id = nextTargetId;
      nextTargetId += 1;
      targetIds.set(target, id);
    }
    return id;
  }

  function getTargetMap(target, create = false) {
    let targetMap = targetChannels.get(target);
    if (!targetMap && create) {
      targetMap = new Map();
      targetChannels.set(target, targetMap);
    }
    return targetMap;
  }

  function getChannel(target, prop, create = false) {
    const targetMap = getTargetMap(target, create);
    if (!targetMap) return null;
    let channel = targetMap.get(prop);
    if (!channel && create) {
      channel = {
        additive: new Map(),
        activeBaseKey: null,
        base: new Map(),
        baseValue: readNumber(target[prop]),
        factor: new Map(),
        prop,
        target,
        value: readNumber(target[prop]),
      };
      targetMap.set(prop, channel);
    }
    return channel;
  }

  function cleanupChannel(channel) {
    if (!channel || channel.base.size || channel.additive.size || channel.factor.size) return;
    const targetMap = targetChannels.get(channel.target);
    if (targetMap?.get(channel.prop) === channel) {
      targetMap.delete(channel.prop);
      if (!targetMap.size) targetChannels.delete(channel.target);
    }
  }

  function getAnimationOutputValue(animation) {
    if (!animation) return 0;
    const duration = Math.max(0, readNumber(animation.blendDuration));
    if (animation.blendFrom == null || duration <= 0) return animation.value;
    const progress = clamp(readNumber(animation.blendElapsed) / duration, 0, 1);
    if (progress >= 1) return animation.value;
    const eased = resolveEase(animation.blendEase)(progress);
    return animation.blendFrom + (animation.value - animation.blendFrom) * eased;
  }

  function advanceBlend(animation, deltaSeconds) {
    if (animation?.blendFrom == null) return;
    animation.blendElapsed = Math.min(animation.blendDuration, readNumber(animation.blendElapsed) + deltaSeconds);
  }

  function composeChannel(channel) {
    let value = channel.baseValue;
    for (const animation of channel.additive.values()) value += getAnimationOutputValue(animation);
    for (const animation of channel.factor.values()) value *= getAnimationOutputValue(animation);
    if (channel.clamp) value = clamp(value, channel.clamp.min, channel.clamp.max);
    channel.value = value;
    channel.target[channel.prop] = value;
    debug.writes += 1;
    debug.writesLastFrame += 1;
    return value;
  }

  function markChannelDirty(channel) {
    if (channel) dirtyChannels.add(channel);
  }

  function queueAnimationUpdate(animation) {
    if (animation?.onUpdate) pendingUpdateAnimations.add(animation);
  }

  function setChannelLane(channel, animation) {
    if (animation.lane === "base") {
      channel.base.set(animation.laneKey, animation);
      channel.activeBaseKey = animation.laneKey;
      return;
    }
    const collection = animation.lane === "factor" ? channel.factor : channel.additive;
    collection.set(animation.laneKey, animation);
  }

  function chooseFallbackBase(channel) {
    let fallback = null;
    for (const animation of channel.base.values()) fallback = animation;
    return fallback;
  }

  function clearChannelLane(animation) {
    const channel = animation.channel;
    if (!channel) return;
    if (animation.lane === "base") {
      if (channel.base.get(animation.laneKey) === animation) channel.base.delete(animation.laneKey);
      if (channel.activeBaseKey === animation.laneKey) {
        const fallback = chooseFallbackBase(channel);
        channel.activeBaseKey = fallback?.laneKey || null;
        channel.baseValue = fallback ? getAnimationOutputValue(fallback) : getAnimationOutputValue(animation);
      }
    } else if (animation.lane === "factor") {
      if (channel.factor.get(animation.laneKey) === animation) channel.factor.delete(animation.laneKey);
    } else if (channel.additive.get(animation.laneKey) === animation) {
      channel.additive.delete(animation.laneKey);
    }
    composeChannel(channel);
    cleanupChannel(channel);
  }

  function addActiveAnimation(animation) {
    activeAnimations.add(animation);
    activeTargets.add(animation.target);
    getTargetId(animation.target);
    debug.started += 1;
    ensureTicker();
  }

  function removeActiveAnimation(animation) {
    activeAnimations.delete(animation);
    if (!animation?.target) return;
    for (const activeAnimation of activeAnimations) {
      if (activeAnimation.target === animation.target) return;
    }
    activeTargets.delete(animation.target);
  }

  function cancelAnimation(animation, reason = "cancel") {
    if (!animation || animation.done) return;
    animation.done = true;
    removeActiveAnimation(animation);
    pendingUpdateAnimations.delete(animation);
    clearChannelLane(animation);
    debug.canceled += 1;
    debug.canceledByReason[reason] = (debug.canceledByReason[reason] || 0) + 1;
    animation.onCancel?.(reason);
  }

  function completeAnimation(animation, finalValue = animation.to) {
    if (!animation || animation.done) return;
    animation.done = true;
    pendingUpdateAnimations.delete(animation);
    animation.value = finalValue;
    animation.blendElapsed = animation.blendDuration;
    if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
    composeChannel(animation.channel);
    fireMilestones(animation, 1);
    removeActiveAnimation(animation);
    clearChannelLane(animation);
    debug.completed += 1;
    animation.onUpdate?.(finalValue);
    if (!animation.arrived) {
      animation.arrived = true;
      animation.onArrive?.(finalValue);
    }
    animation.onComplete?.();
  }

  function scheduleFrame() {
    if (!autoStart || frameHandle != null || typeof scheduler.requestAnimationFrame !== "function") return;
    frameHandle = scheduler.requestAnimationFrame((time) => {
      frameHandle = null;
      const nextTime = Number.isFinite(Number(time)) ? Number(time) : nowMs();
      if (!lastFrameTime) lastFrameTime = nextTime;
      const deltaSeconds = Math.min(maxDeltaSeconds, Math.max(0, (nextTime - lastFrameTime) / 1000));
      lastFrameTime = nextTime;
      step(deltaSeconds);
      if (activeAnimations.size || afterFrameCallbacks.size) scheduleFrame();
      else lastFrameTime = 0;
    });
  }

  function ensureTicker() {
    if (activeAnimations.size || afterFrameCallbacks.size) scheduleFrame();
  }

  function stopTicker() {
    if (frameHandle == null || typeof scheduler.cancelAnimationFrame !== "function") return;
    scheduler.cancelAnimationFrame(frameHandle);
    frameHandle = null;
    lastFrameTime = 0;
  }

  function makeAnimation(target, prop, to, animationOptions = {}) {
    const lane = animationOptions.lane || "base";
    const channel = getChannel(target, prop, true);
    const current = lane === "base"
      ? readNumber(target[prop], channel.baseValue)
      : lane === "factor"
        ? 1
        : 0;
    const from = readNumber(animationOptions.from, current);
    const driver = animationOptions.driver || spring();
    const animation = {
      arrived: false,
      channel,
      delay: Math.max(0, readNumber(animationOptions.delay)),
      done: false,
      driver,
      elapsed: 0,
      blendDuration: Math.max(0, readNumber(animationOptions.blendDuration, DEFAULT_BLEND_DURATION)),
      blendEase: animationOptions.blendEase,
      blendElapsed: 0,
      blendFrom: null,
      from,
      hasExplicitFrom: animationOptions.from != null,
      interrupt: normalizeInterrupt(animationOptions.interrupt),
      lane,
      laneKey: animationOptions.laneKey || (lane === "base" ? "base" : `${lane}-${nextLaneId++}`),
      onArrive: animationOptions.onArrive,
      onCancel: animationOptions.onCancel,
      onComplete: animationOptions.onComplete,
      onUpdate: animationOptions.onUpdate,
      milestones: normalizeMilestones(animationOptions.milestones),
      prop,
      released: false,
      started: Math.max(0, readNumber(animationOptions.delay)) <= 0,
      target,
      to: readNumber(to, from),
      value: from,
      velocity: readNumber(animationOptions.velocity),
    };
    if (animationOptions.clamp) {
      channel.clamp = {
        max: readNumber(animationOptions.clamp.max, Number.POSITIVE_INFINITY),
        min: readNumber(animationOptions.clamp.min, Number.NEGATIVE_INFINITY),
      };
    }
    return animation;
  }

  function replaceExistingLane(channel, animation) {
    const existing = animation.lane === "base"
      ? channel.base.get(animation.laneKey)
      : animation.lane === "factor"
        ? channel.factor.get(animation.laneKey)
        : channel.additive.get(animation.laneKey);
    if (!existing || existing.done) return null;
    if (animation.interrupt === "auto" &&
      animation.lane === "base" &&
      existing.driver?.type === "spring" &&
      animation.driver?.type === "spring") {
      existing.from = existing.value;
      existing.to = animation.to;
      existing.driver = animation.driver;
      existing.onArrive = animation.onArrive;
      existing.onCancel = animation.onCancel;
      existing.onComplete = animation.onComplete;
      existing.onUpdate = animation.onUpdate;
      existing.milestones = animation.milestones;
      existing.arrived = false;
      existing.released = false;
      if (animation.lane === "base") channel.activeBaseKey = existing.laneKey;
      return existing;
    }
    if (animation.interrupt === "retarget") {
      existing.from = existing.value;
      existing.to = animation.to;
      existing.driver = animation.driver;
      existing.elapsed = 0;
      existing.delay = animation.delay;
      existing.onArrive = animation.onArrive;
      existing.onCancel = animation.onCancel;
      existing.onComplete = animation.onComplete;
      existing.onUpdate = animation.onUpdate;
      existing.milestones = animation.milestones;
      existing.arrived = false;
      existing.released = false;
      if (existing.driver?.type === "progress") existing.driver.options.progress = 0;
      if (animation.lane === "base") channel.activeBaseKey = existing.laneKey;
      return existing;
    }
    if (animation.interrupt === "blend") {
      const previousOutput = getAnimationOutputValue(existing);
      if (!animation.hasExplicitFrom) {
        animation.from = previousOutput;
        animation.value = previousOutput;
      }
      animation.blendFrom = previousOutput;
      animation.blendElapsed = 0;
      cancelAnimation(existing, "blend");
      return null;
    }
    cancelAnimation(existing, "replace");
    return null;
  }

  function animate(target, prop, to, animationOptions = {}) {
    if (!target || !prop) return null;
    const animation = makeAnimation(target, prop, to, animationOptions);
    const existingLaneAnimation = getLaneAnimation(animation.channel, animation);
    if (animation.interrupt === "ignore" && existingLaneAnimation) {
      return makeControl(existingLaneAnimation);
    }
    if (animationOptions.snap) {
      stop(target, prop, { lane: animation.lane, laneKey: animation.laneKey });
      animation.value = animation.to;
      if (animation.lane === "base") {
        setChannelLane(animation.channel, animation);
        animation.channel.baseValue = animation.to;
      } else setChannelLane(animation.channel, animation);
      composeChannel(animation.channel);
      fireMilestones(animation, 1);
      clearChannelLane(animation);
      animation.onUpdate?.(animation.to);
      animation.onArrive?.(animation.to);
      animation.onComplete?.();
      return null;
    }

    const retargeted = replaceExistingLane(animation.channel, animation);
    if (retargeted) return makeControl(retargeted);

    setChannelLane(animation.channel, animation);
    if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
    composeChannel(animation.channel);
    addActiveAnimation(animation);
    return makeControl(animation);
  }

  function set(target, prop, value, setOptions = {}) {
    if (!target || !prop) return;
    stop(target, prop, setOptions);
    const channel = getChannel(target, prop);
    if (channel) {
      if (!setOptions.lane || setOptions.lane === "base") {
        const laneKey = setOptions.laneKey || "base";
        if (!setOptions.laneKey || channel.activeBaseKey === laneKey || !channel.base.size) channel.baseValue = readNumber(value, channel.baseValue);
      }
      composeChannel(channel);
      return;
    }
    target[prop] = readNumber(value, target[prop]);
  }

  function getLaneAnimation(channel, animation) {
    if (!channel || !animation) return null;
    if (animation.lane === "base") return channel.base.get(animation.laneKey);
    if (animation.lane === "factor") return channel.factor.get(animation.laneKey);
    return channel.additive.get(animation.laneKey);
  }

  function stepSpring(animation, dt) {
    const config = animation.driver.config || {};
    const stiffness = Math.max(0, readNumber(config.stiffness, 0));
    const damping = Math.max(0, readNumber(config.damping, 0));
    const mass = Math.max(0.0001, readNumber(config.mass, 1));
    const force = -stiffness * (animation.value - animation.to);
    const dampingForce = -damping * animation.velocity;
    const acceleration = (force + dampingForce) / mass;
    animation.velocity += acceleration * dt;
    animation.value += animation.velocity * dt;
  }

  function tickSpring(animation, deltaSeconds) {
    const config = animation.driver.config || {};
    let remaining = deltaSeconds;
    while (remaining > 0) {
      const dt = Math.min(stepSeconds, remaining);
      stepSpring(animation, dt);
      remaining -= dt;
    }

    const delta = Math.abs(animation.to - animation.value);
    const speed = Math.abs(animation.velocity);
    fireMilestones(animation, getDistanceProgress(animation));
    const arriveDelta = Math.max(0, readNumber(config.arriveDelta, animation.arriveDelta ?? DEFAULT_ARRIVE_DELTA));
    if (!animation.arrived && delta <= arriveDelta) {
      animation.arrived = true;
      animation.onArrive?.(animation.value);
    }
    const restDelta = Math.max(0, readNumber(config.restDelta, DEFAULT_REST_DELTA));
    const restSpeed = Math.max(0, readNumber(config.restSpeed, DEFAULT_REST_SPEED));
    if (delta <= restDelta && speed <= restSpeed) {
      completeAnimation(animation);
      return;
    }
    writeAnimation(animation);
  }

  function tickTween(animation, deltaSeconds) {
    const options = animation.driver.options || {};
    const duration = Math.max(0, readNumber(options.duration, 0));
    if (duration <= 0) {
      completeAnimation(animation);
      return;
    }
    animation.elapsed += deltaSeconds;
    const repeatsForever = options.loop === true || readNumber(options.repeat, 0) < 0;
    const repeat = repeatsForever ? Infinity : Math.max(0, Math.floor(readNumber(options.repeat, 0)));
    const totalCycles = repeatsForever ? Infinity : repeat + 1;
    const totalDuration = duration * totalCycles;
    const clampedElapsed = repeatsForever ? animation.elapsed : Math.min(animation.elapsed, totalDuration);
    const cycle = repeatsForever ? Math.floor(clampedElapsed / duration) : Math.min(totalCycles - 1, Math.floor(clampedElapsed / duration));
    const localElapsed = clampedElapsed - cycle * duration;
    let progress = clamp(localElapsed / duration, 0, 1);
    if (options.yoyo && cycle % 2 === 1) progress = 1 - progress;
    const eased = resolveEase(options.ease)(progress);
    animation.value = animation.from + (animation.to - animation.from) * eased;
    fireMilestones(animation, progress);
    if (!animation.arrived && Math.abs(animation.to - animation.value) <= readNumber(options.arriveDelta, DEFAULT_REST_DELTA)) {
      animation.arrived = true;
      animation.onArrive?.(animation.value);
    }
    writeAnimation(animation);
    if (!repeatsForever && animation.elapsed >= totalDuration) completeAnimation(animation, animation.value);
  }

  function tickDecay(animation, deltaSeconds) {
    const options = animation.driver.options || {};
    const friction = clamp(readNumber(options.friction, 0.92), 0, 1);
    const restSpeed = Math.max(0, readNumber(options.restSpeed, DEFAULT_REST_SPEED));
    animation.velocity *= friction ** (deltaSeconds * 60);
    animation.value += animation.velocity * deltaSeconds;
    if (Math.abs(animation.velocity) <= restSpeed) {
      completeAnimation(animation);
      return;
    }
    writeAnimation(animation);
  }

  function tickAnimation(animation, deltaSeconds) {
    if (animation.done) return;
    if (animation.target?.destroyed) {
      cancelAnimation(animation, "destroyed");
      return;
    }
    if (animation.delay > 0) {
      const consumed = Math.min(animation.delay, deltaSeconds);
      animation.delay -= consumed;
      deltaSeconds -= consumed;
      if (animation.delay > 0 || deltaSeconds <= 0) return;
    }
    if (animation.from == null) animation.from = animation.value;
    animation.started = true;
    advanceBlend(animation, deltaSeconds);
    if (animation.driver.type === "tween") tickTween(animation, deltaSeconds);
    else if (animation.driver.type === "decay") tickDecay(animation, deltaSeconds);
    else if (animation.driver.type === "progress") tickProgress(animation);
    else tickSpring(animation, deltaSeconds);
  }

  function tickProgress(animation) {
    const options = animation.driver.options || {};
    const progress = clamp(readNumber(options.progress, animation.progress ?? 0), 0, 1);
    animation.progress = progress;
    animation.value = animation.from + (animation.to - animation.from) * resolveEase(options.ease)(progress);
    fireMilestones(animation, progress);
    if (!animation.arrived && progress >= 1) {
      animation.arrived = true;
      animation.onArrive?.(animation.value);
    }
    writeAnimation(animation);
    if (options.completeAtEnd !== false && progress >= 1) completeAnimation(animation, animation.value);
  }

  function writeAnimation(animation) {
    if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
    markChannelDirty(animation.channel);
    queueAnimationUpdate(animation);
  }

  function getDistanceProgress(animation) {
    const distance = animation.to - animation.from;
    if (Math.abs(distance) <= NEUTRAL_EPSILON) return 1;
    return clamp((animation.value - animation.from) / distance, 0, 1);
  }

  function fireMilestones(animation, progress) {
    if (!animation?.milestones?.length) return;
    const currentProgress = clamp01(progress);
    for (const milestone of animation.milestones) {
      if (milestone.fired || currentProgress < milestone.progress) continue;
      milestone.fired = true;
      milestone.callback(animation.value, {
        progress: currentProgress,
        prop: animation.prop,
        target: animation.target,
      });
    }
  }

  function flushDirtyChannels() {
    if (!dirtyChannels.size) return;
    dirtyChannelScratch.length = 0;
    for (const channel of dirtyChannels) dirtyChannelScratch.push(channel);
    dirtyChannels.clear();
    for (const channel of dirtyChannelScratch) composeChannel(channel);
    dirtyChannelScratch.length = 0;
  }

  function flushPendingUpdates() {
    if (!pendingUpdateAnimations.size) return;
    pendingUpdateScratch.length = 0;
    for (const animation of pendingUpdateAnimations) pendingUpdateScratch.push(animation);
    pendingUpdateAnimations.clear();
    for (const animation of pendingUpdateScratch) {
      if (!animation.done) animation.onUpdate?.(animation.value);
    }
    pendingUpdateScratch.length = 0;
  }

  function flushAfterFrame() {
    if (!afterFrameCallbacks.size) return;
    debug.afterFrameFlushes += 1;
    afterFrameScratch.length = 0;
    for (const callback of afterFrameCallbacks) afterFrameScratch.push(callback);
    afterFrameCallbacks.clear();
    for (const callback of afterFrameScratch) callback();
    afterFrameScratch.length = 0;
  }

  function step(deltaSeconds = 0) {
    const elapsed = Math.min(maxDeltaSeconds, Math.max(0, readNumber(deltaSeconds)));
    debug.frames += 1;
    debug.writesLastFrame = 0;
    if (elapsed > 0) {
      activeAnimationScratch.length = 0;
      for (const animation of activeAnimations) activeAnimationScratch.push(animation);
      for (const animation of activeAnimationScratch) tickAnimation(animation, elapsed);
      activeAnimationScratch.length = 0;
    }
    flushDirtyChannels();
    flushPendingUpdates();
    flushAfterFrame();
    debug.activeChannels = activeAnimations.size;
    debug.activeTargets = activeTargets.size;
    if (!activeAnimations.size && !afterFrameCallbacks.size) stopTicker();
  }

  function releaseAnimation(animation) {
    if (!animation || animation.done || animation.released) return;
    animation.released = true;
    animation.onArrive = null;
    animation.onCancel = null;
    animation.onComplete = null;
    animation.onUpdate = null;
    animation.milestones = [];
    pendingUpdateAnimations.delete(animation);
    debug.released += 1;
    if (animation.started || animation.delay <= 0) return;
    animation.done = true;
    removeActiveAnimation(animation);
    clearChannelLane(animation);
  }

  function afterFrame(callback) {
    if (typeof callback !== "function") return;
    afterFrameCallbacks.add(callback);
    ensureTicker();
  }

  function stop(target, prop, stopOptions = {}) {
    const channel = getChannel(target, prop);
    if (!channel) return false;
    const reason = stopOptions.reason || "cancel";
    let stopped = false;
    if (!stopOptions.lane || stopOptions.lane === "base") {
      for (const animation of channel.base.values()) {
        if (!stopOptions.laneKey || animation.laneKey === stopOptions.laneKey) {
          stopped = true;
          cancelAnimation(animation, reason);
        }
      }
    }
    if (!stopOptions.lane || stopOptions.lane === "additive") {
      for (const animation of channel.additive.values()) {
        if (!stopOptions.laneKey || animation.laneKey === stopOptions.laneKey) {
          stopped = true;
          cancelAnimation(animation, reason);
        }
      }
    }
    if (!stopOptions.lane || stopOptions.lane === "factor") {
      for (const animation of channel.factor.values()) {
        if (!stopOptions.laneKey || animation.laneKey === stopOptions.laneKey) {
          stopped = true;
          cancelAnimation(animation, reason);
        }
      }
    }
    cleanupChannel(channel);
    return stopped;
  }

  function cancelTarget(target, cancelOptions = {}) {
    const targetMap = getTargetMap(target);
    let stopped = false;
    if (targetMap) {
      for (const prop of Array.from(targetMap.keys())) stopped = stop(target, prop, cancelOptions) || stopped;
    }
    if (!cancelOptions.recursive) return stopped;
    for (const child of target?.children || []) stopped = cancelTarget(child, cancelOptions) || stopped;
    return stopped;
  }

  function makeControl(animation) {
    let controlReleased = false;
    const flushImmediateProgressWrite = () => {
      if (dirtyChannels.has(animation.channel)) {
        dirtyChannels.delete(animation.channel);
        composeChannel(animation.channel);
      }
      if (pendingUpdateAnimations.has(animation)) {
        pendingUpdateAnimations.delete(animation);
        animation.onUpdate?.(animation.value);
      }
    };

    const control = {
      cancel: (reason) => {
        if (controlReleased) return;
        cancelAnimation(animation, reason);
      },
      get arrived() {
        return animation.arrived;
      },
      get completed() {
        return !controlReleased && animation.done && !activeAnimations.has(animation);
      },
      get laneKey() {
        return animation.laneKey;
      },
      get progress() {
        return animation.driver?.type === "progress"
          ? clamp(readNumber(animation.driver.options?.progress, animation.progress ?? 0), 0, 1)
          : animation.progress;
      },
      release: () => {
        if (controlReleased) return;
        controlReleased = true;
        releaseAnimation(animation);
      },
      get released() {
        return controlReleased;
      },
      settle(settleOptions = {}) {
        if (controlReleased || animation.done || animation.driver?.type !== "progress") return;
        const options = settleOptions || {};
        const currentProgress = clamp(readNumber(animation.driver.options?.progress, animation.progress ?? 0), 0, 1);
        animation.driver.options.progress = currentProgress;
        tickProgress(animation);
        flushImmediateProgressWrite();

        const progressVelocity = readNumber(options.velocity, 0);
        const velocityThreshold = Math.max(0, readNumber(options.velocityThreshold, 0.05));
        const targetProgress = options.progress != null
          ? clamp(readNumber(options.progress, currentProgress), 0, 1)
          : progressVelocity > velocityThreshold
            ? 1
            : progressVelocity < -velocityThreshold
              ? 0
              : currentProgress >= readNumber(options.midpoint, 0.5)
                ? 1
                : 0;
        const ease = resolveEase(animation.driver.options?.ease);
        const distance = animation.to - animation.from;
        const finalValue = animation.from + distance * ease(targetProgress);
        animation.from = animation.value;
        animation.to = finalValue;
        animation.elapsed = 0;
        animation.delay = Math.max(0, readNumber(options.delay));
        animation.driver = options.driver || spring(options.spring || options.config || DEFAULT_SETTLE_SPRING);
        animation.velocity = readNumber(options.valueVelocity, progressVelocity * distance);
        animation.arrived = false;
        animation.progress = targetProgress;
        if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
      },
      get state() {
        return animation;
      },
      setProgress(progress) {
        if (controlReleased) return;
        if (animation.driver?.type !== "progress" || animation.done) return;
        animation.driver.options.progress = clamp(readNumber(progress), 0, 1);
        tickProgress(animation);
        flushImmediateProgressWrite();
      },
      reverse() {
        if (controlReleased) return;
        if (animation.done) return;
        if (animation.driver?.type === "progress") {
          this.setProgress(1 - readNumber(animation.driver.options?.progress, animation.progress ?? 0));
          return;
        }
        const nextTo = animation.from;
        animation.from = animation.value;
        animation.to = nextTo;
        animation.elapsed = 0;
        animation.arrived = false;
      },
      get value() {
        return animation.value;
      },
      get velocity() {
        return animation.velocity;
      },
    };
    return control;
  }

  function reset() {
    for (const animation of activeAnimations) cancelAnimation(animation, "reset");
    afterFrameCallbacks.clear();
    dirtyChannels.clear();
    pendingUpdateAnimations.clear();
    stopTicker();
    Object.assign(debug, makeDebugCounters());
  }

  function debugSnapshot() {
    const animations = Array.from(activeAnimations).map((animation) => ({
      delay: animation.delay,
      blendDuration: animation.blendFrom == null ? 0 : animation.blendDuration,
      blendProgress: animation.blendFrom == null || animation.blendDuration <= 0
        ? 1
        : clamp(readNumber(animation.blendElapsed) / animation.blendDuration, 0, 1),
      driver: animation.driver?.type || "spring",
      interrupt: animation.interrupt,
      lane: animation.lane,
      laneKey: animation.laneKey,
      milestones: animation.milestones.filter((milestone) => !milestone.fired).map((milestone) => milestone.progress),
      prop: animation.prop,
      released: animation.released,
      targetId: getTargetId(animation.target),
      to: animation.to,
      value: animation.value,
      velocity: animation.velocity,
    }));

    return {
      counters: {
        ...debug,
        canceledByReason: { ...debug.canceledByReason },
      },
      summary: makeDebugSummary(animations),
      animations,
    };
  }

  return {
    afterFrame,
    animate,
    cancelTarget,
    debugSnapshot,
    flushAfterFrameForTests: flushAfterFrame,
    getChannel: (target, prop) => getChannel(target, prop),
    debug,
    reset,
    set,
    step,
    stop,
  };
}

export const motionRuntime = createMotionRuntime();

export function track(target, prop, from, to, options = {}) {
  return { ...options, from, lane: "base", prop, target, to };
}

export function additiveTrack(target, prop, from, to, options = {}) {
  return { ...options, from, lane: "additive", prop, target, to };
}

export function factorTrack(target, prop, from, to, options = {}) {
  return { ...options, from, lane: "factor", prop, target, to };
}

export function alphaFactor(target, from, to, options = {}) {
  return factorTrack(target, "alpha", from, to, { clamp: { min: 0, max: 1 }, ...options });
}

export function playTrack(spec, options = {}) {
  const runtime = options.runtime || motionRuntime;
  return runtime.animate(spec.target, spec.prop, spec.to, {
    clamp: spec.clamp,
    delay: spec.delay,
    driver: spec.driver || options.driver,
    from: spec.from,
    interrupt: spec.interrupt,
    blendDuration: spec.blendDuration,
    blendEase: spec.blendEase,
    lane: spec.lane,
    laneKey: spec.laneKey,
    onArrive: spec.onArrive,
    onCancel: spec.onCancel,
    onComplete: spec.onComplete,
    onUpdate: spec.onUpdate,
    milestones: spec.milestones,
    snap: spec.snap,
    velocity: spec.velocity,
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => motionRuntime.reset());
  reloadOnPixiHotUpdate(import.meta.hot);
}
