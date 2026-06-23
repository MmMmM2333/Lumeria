import {
  motionRuntime,
  progressDriver,
  spring as springDriver,
  tween as tweenDriver,
} from "./motionRuntime.js";
import { prefersReducedMotion } from "./motionPreferences.js";
import { getMotionPreset } from "./motionPresets.js";

// Public surface: motion/motionTo/motionAdd/motionSequence/parallel/killMotionOf/lanePreset/motionLanes are production APIs.
const RESERVED_KEYS = new Set([
  "delay",
  "blendDuration",
  "blendEase",
  "debugMetadata",
  "driver",
  "duration",
  "ease",
  "from",
  "interrupt",
  "lane",
  "laneKey",
  "lanePreset",
  "loop",
  "milestones",
  "onArrive",
  "onCancel",
  "onComplete",
  "onUpdate",
  "overwrite",
  "repeat",
  "snap",
  "spring",
  "sourceLabel",
  "target",
  "velocity",
  "yoyo",
]);

let nextAdditiveImpulseId = 1;

export const motionLanes = Object.freeze({
  drag: Object.freeze({ lane: "base", laneKey: "drag" }),
  handoff: Object.freeze({ lane: "base", laneKey: "handoff" }),
  hover: Object.freeze({ lane: "additive", laneKey: "hover" }),
  jiggle: Object.freeze({ lane: "additive", laneKey: "jiggle" }),
  layout: Object.freeze({ lane: "base", laneKey: "layout" }),
  overlay: Object.freeze({ lane: "base", laneKey: "overlay" }),
  press: Object.freeze({ lane: "factor", laneKey: "press" }),
});

export function lanePreset(name, overrides = {}) {
  return { ...(motionLanes[name] || { lane: name }), ...overrides };
}

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getTweenProps(vars = {}) {
  return Object.keys(vars).filter((key) => !RESERVED_KEYS.has(key) && Number.isFinite(Number(vars[key])));
}

function getPropTracks(target, prop, vars = {}) {
  if (!target?.scale) return [{ prop, target, to: vars[prop], from: vars.from?.[prop] }];
  if (prop === "scale") {
    return [
      { prop: "x", target: target.scale, to: vars.scale, from: vars.from?.scale ?? vars.from?.scaleX },
      { prop: "y", target: target.scale, to: vars.scale, from: vars.from?.scale ?? vars.from?.scaleY },
    ];
  }
  if (prop === "scaleX") return [{ prop: "x", target: target.scale, to: vars.scaleX, from: vars.from?.scaleX ?? vars.from?.scale }];
  if (prop === "scaleY") return [{ prop: "y", target: target.scale, to: vars.scaleY, from: vars.from?.scaleY ?? vars.from?.scale }];
  return [{ prop, target, to: vars[prop], from: vars.from?.[prop] }];
}

function getTrackCount(target, props, vars = {}) {
  if (!target) return props.length;
  let count = 0;
  for (const prop of props) count += getPropTracks(target, prop, vars).length;
  return count;
}

function callBoth(first, second, ...args) {
  first?.(...args);
  second?.(...args);
}

function makeMilestone(progress, callback) {
  if (typeof callback !== "function") return null;
  return { callback, progress: readNumber(progress) };
}

function getTrackVelocity(track, vars = {}, sourceProp = track.prop) {
  const velocity = vars.velocity;
  if (velocity == null || Number.isFinite(Number(velocity))) return readNumber(velocity, 0);
  if (sourceProp === "scale") {
    const scaleAxisProp = track.prop === "x" ? "scaleX" : "scaleY";
    return readNumber(velocity[track.prop], readNumber(velocity[scaleAxisProp], readNumber(velocity.scale, 0)));
  }
  return readNumber(velocity[track.prop], readNumber(velocity[sourceProp], 0));
}

function appendMilestone(step, milestone) {
  if (!step || !milestone) return;
  step.milestones = [...(step.milestones || []), milestone];
}

function resolveDebugMetadata(target, track, sourceProp, vars = {}, options = {}) {
  const input = vars.debugMetadata ?? options.debugMetadata;
  const sourceLabel = vars.sourceLabel ?? options.sourceLabel;
  if (!input && sourceLabel == null) return null;
  const raw = typeof input === "function"
    ? input({ prop: track.prop, sourceProp, target, trackTarget: track.target })
    : input;
  const metadata = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  if (sourceLabel != null && metadata.sourceLabel == null) metadata.sourceLabel = sourceLabel;
  if (metadata.sourceProp == null && sourceProp !== track.prop) metadata.sourceProp = sourceProp;
  if (metadata.targetPart == null && track.target !== target) {
    metadata.targetPart = track.target === target?.scale ? "scale" : "adapted";
  }
  return metadata;
}

function describeDebugTarget(runtime, target, track, sourceProp, vars = {}, options = {}) {
  if (typeof runtime?.describeTarget !== "function") return;
  const metadata = resolveDebugMetadata(target, track, sourceProp, vars, options);
  if (!metadata) return;
  if (track.target !== target && metadata.overlayTarget == null && metadata.boundsTarget == null) {
    metadata.overlayTarget = target;
  }
  runtime.describeTarget(track.target, metadata);
}

export function motionTo(targetOrTargets, vars = {}, options = {}) {
  const runtime = options.runtime || motionRuntime;
  const shouldSnap = vars.snap || (prefersReducedMotion() && vars.driver?.type !== "progress");
  const laneOptions = vars.lanePreset ? lanePreset(vars.lanePreset) : {};
  const targets = Array.isArray(targetOrTargets) ? targetOrTargets : [targetOrTargets];
  const props = getTweenProps(vars);
  const controls = [];
  const trackCount = targets.reduce((count, target) => count + getTrackCount(target, props, vars), 0);
  let arriveRemaining = trackCount;
  let remaining = trackCount;
  let arrived = false;
  let completed = false;

  const arriveOne = () => {
    arriveRemaining -= 1;
    if (arriveRemaining > 0 || arrived) return;
    arrived = true;
    callBoth(vars.onArrive, options.onArrive);
  };

  const completeOne = () => {
    remaining -= 1;
    if (remaining > 0 || completed) return;
    completed = true;
    callBoth(vars.onComplete, options.onComplete);
  };

  if (!remaining) {
    callBoth(vars.onComplete, options.onComplete);
    return makeGroupControl(controls);
  }

  for (const target of targets) {
      if (!target) {
        for (let index = 0; index < props.length; index += 1) {
          arriveOne();
          completeOne();
        }
        continue;
      }
    for (const prop of props) {
      for (const track of getPropTracks(target, prop, vars)) {
        describeDebugTarget(runtime, target, track, prop, vars, options);
        const velocity = getTrackVelocity(track, vars, prop);
        if (shouldSnap) {
          runtime.animate(track.target, track.prop, track.to, {
            from: track.from,
            lane: vars.lane || laneOptions.lane || "base",
            laneKey: vars.laneKey || laneOptions.laneKey,
            milestones: vars.milestones,
            onArrive: arriveOne,
            onCancel: (reason) => callBoth(vars.onCancel, options.onCancel, reason),
            onComplete: completeOne,
            onUpdate: vars.onUpdate,
            snap: true,
            velocity,
          });
          continue;
        }
        const control = runtime.animate(track.target, track.prop, track.to, {
          delay: vars.delay,
          blendDuration: vars.blendDuration,
          blendEase: vars.blendEase,
          driver: vars.driver || tweenDriver({
            duration: readNumber(vars.duration, 0),
            ease: vars.ease,
            loop: vars.loop,
            repeat: vars.repeat,
            yoyo: vars.yoyo,
          }),
          from: track.from,
          interrupt: vars.interrupt,
          lane: vars.lane || laneOptions.lane || "base",
          laneKey: vars.laneKey || laneOptions.laneKey,
          milestones: vars.milestones,
          onArrive: arriveOne,
          onCancel: (reason) => callBoth(vars.onCancel, options.onCancel, reason),
          onComplete: completeOne,
          onUpdate: vars.onUpdate,
          velocity,
        });
        if (control) controls.push(control);
        else completeOne();
      }
    }
  }

  return makeGroupControl(controls);
}

export function motion(targetOrTargets, defaults = {}) {
  const state = {
    defaults: { ...defaults },
    from: null,
    steps: [],
    targetOrTargets,
  };

  const setDefault = (key, value) => {
    state.defaults[key] = value;
    if (state.steps.length) state.steps[state.steps.length - 1][key] = value;
    return builder;
  };

  const builder = {
    delay(value) {
      return setDefault("delay", value);
    },
    duration(value) {
      return setDefault("duration", value);
    },
    ease(value) {
      return setDefault("ease", value);
    },
    blend(duration = undefined, ease = undefined) {
      state.defaults.interrupt = "blend";
      if (duration !== undefined) state.defaults.blendDuration = duration;
      if (ease !== undefined) state.defaults.blendEase = ease;
      if (state.steps.length) {
        const step = state.steps[state.steps.length - 1];
        step.interrupt = "blend";
        if (duration !== undefined) step.blendDuration = duration;
        if (ease !== undefined) step.blendEase = ease;
      }
      return builder;
    },
    from(vars = {}) {
      state.from = { ...vars };
      if (state.steps.length) state.steps[state.steps.length - 1].from = state.from;
      return builder;
    },
    interrupt(policy) {
      return setDefault("interrupt", policy);
    },
    lane(lane, laneKey = undefined) {
      state.defaults.lane = lane;
      if (laneKey !== undefined) state.defaults.laneKey = laneKey;
      if (state.steps.length) {
        state.steps[state.steps.length - 1].lane = lane;
        if (laneKey !== undefined) state.steps[state.steps.length - 1].laneKey = laneKey;
      }
      return builder;
    },
    lanePreset(name, overrides = {}) {
      const preset = lanePreset(name, overrides);
      return builder.lane(preset.lane, preset.laneKey);
    },
    additive(laneKey = "additive", overrides = {}) {
      return builder.lane("additive", laneKey).defaults(overrides);
    },
    factor(laneKey = "factor", overrides = {}) {
      return builder.lane("factor", laneKey).defaults(overrides);
    },
    defaults(overrides = {}) {
      Object.assign(state.defaults, overrides);
      if (state.steps.length) Object.assign(state.steps[state.steps.length - 1], overrides);
      return builder;
    },
    at(progress, callback) {
      const milestone = makeMilestone(progress, callback);
      if (!milestone) return builder;
      if (state.steps.length) appendMilestone(state.steps[state.steps.length - 1], milestone);
      else appendMilestone(state.defaults, milestone);
      return builder;
    },
    drag(overrides = {}) {
      return builder.lanePreset("drag", overrides);
    },
    handoff(overrides = {}) {
      return builder.lanePreset("handoff", overrides);
    },
    hover(overrides = {}) {
      return builder.lanePreset("hover", overrides);
    },
    jiggle(overrides = {}) {
      return builder.lanePreset("jiggle", overrides);
    },
    layout(overrides = {}) {
      return builder.lanePreset("layout", overrides);
    },
    overlay(overrides = {}) {
      return builder.lanePreset("overlay", overrides);
    },
    press(overrides = {}) {
      return builder.lanePreset("press", overrides);
    },
    preset(name, overrides = {}) {
      const preset = getMotionPreset(name, overrides);
      if (preset.spring) state.defaults.driver = springDriver(preset.spring);
      if (preset.duration != null) state.defaults.duration = preset.duration;
      if (preset.ease != null) state.defaults.ease = preset.ease;
      if (state.steps.length) {
        const step = state.steps[state.steps.length - 1];
        if (preset.spring) step.driver = state.defaults.driver;
        if (preset.duration != null) step.duration = preset.duration;
        if (preset.ease != null) step.ease = preset.ease;
      }
      return builder;
    },
    set(vars = {}, options = {}) {
      state.steps.push({ ...state.defaults, ...options, ...vars, snap: true });
      return builder;
    },
    spring(config = {}) {
      return setDefault("driver", springDriver(config));
    },
    scrub(progress = 0, options = {}) {
      state.defaults.driver = progressDriver({ completeAtEnd: false, ease: state.defaults.ease, progress, ...options });
      if (state.steps.length) state.steps[state.steps.length - 1].driver = state.defaults.driver;
      return builder;
    },
    start(options = {}) {
      const steps = state.steps.length ? state.steps : [{ ...state.defaults }];
      if (steps.length === 1) return motionTo(state.targetOrTargets, steps[0], options);
      return motionSequence(state.targetOrTargets, steps, options);
    },
    to(vars = {}, options = {}) {
      state.steps.push({
        ...state.defaults,
        ...options,
        ...vars,
        from: vars.from || state.from || state.defaults.from,
        milestones: [
          ...(state.defaults.milestones || []),
          ...(options.milestones || []),
          ...(vars.milestones || []),
        ],
      });
      return builder;
    },
    tween(options = {}) {
      return setDefault("driver", tweenDriver(options));
    },
  };

  return builder;
}

export function motionAdd(targetOrTargets, vars = {}, options = {}) {
  const props = getTweenProps(vars);
  if (!props.length) return makeGroupControl([]);
  const from = { ...(vars.from || {}) };
  const toVars = { ...vars };
  for (const prop of props) {
    from[prop] = vars.from?.[prop] ?? vars[prop];
    toVars[prop] = 0;
  }
  const preset = getMotionPreset("settle", vars.presetOverrides || options.presetOverrides || {});
  const driver = vars.driver || options.driver || springDriver(vars.spring || options.spring || preset.spring);
  const laneKey = vars.laneKey || options.laneKey || `impulse:${nextAdditiveImpulseId++}`;
  return motionTo(targetOrTargets, {
    ...toVars,
    driver,
    from,
    interrupt: vars.interrupt || options.interrupt || "replace",
    lane: "additive",
    laneKey,
  }, options);
}

export function motionSequence(targetOrTargets, steps = [], options = {}) {
  let current = null;
  let arrived = false;
  let completed = false;
  let canceled = false;
  let released = false;
  let index = 0;

  const playNext = () => {
    if (canceled || released) return;
    if (index >= steps.length) {
      completed = true;
      options.onComplete?.();
      return;
    }

    const step = steps[index] || {};
    index += 1;
    const stepTarget = step.target || targetOrTargets;
    const childOptions = { ...options, onArrive: undefined, onComplete: undefined };
    current = motionTo(stepTarget, {
      ...step,
      onArrive: () => {
        step.onArrive?.();
        if (index >= steps.length && !arrived) {
          arrived = true;
          options.onArrive?.();
        }
      },
      onComplete: () => {
        step.onComplete?.();
        playNext();
      },
    }, childOptions);
  };

  playNext();

  return {
    cancel(reason = "cancel") {
      if (completed || canceled || released) return;
      canceled = true;
      current?.cancel?.(reason);
      options.onCancel?.(reason);
    },
    get completed() {
      return completed;
    },
    get arrived() {
      return arrived;
    },
    release() {
      if (completed || canceled || released) return;
      released = true;
      current?.release?.();
    },
    get released() {
      return released;
    },
  };
}

export function parallel(items = [], options = {}) {
  const controls = [];
  let canceled = false;
  let completed = false;
  let arrived = false;
  let released = false;
  let arriveRemaining = items.length;
  let remaining = items.length;

  const arriveItem = () => {
    arriveRemaining -= 1;
    if (arriveRemaining > 0 || arrived || canceled || released) return;
    arrived = true;
    options.onArrive?.();
  };

  const completeItem = () => {
    remaining -= 1;
    if (remaining > 0 || completed || canceled || released) return;
    completed = true;
    options.onComplete?.();
  };

  if (!remaining) {
    completed = true;
    options.onComplete?.();
    return makeGroupControl(controls);
  }

  for (const item of items) {
    let itemCompleted = false;
    let itemArrived = false;
    const arriveOnce = () => {
      if (itemArrived) return;
      itemArrived = true;
      arriveItem();
    };
    const completeOnce = () => {
      if (itemCompleted) return;
      itemCompleted = true;
      completeItem();
    };
    const control = startMotionItem(item, { ...options, onArrive: arriveOnce, onComplete: completeOnce });
    if (control) controls.push(control);
    if (!control || control.arrived) arriveOnce();
    if (!control || control.completed) completeOnce();
  }

  return {
    cancel(reason = "cancel") {
      if (completed || canceled || released) return;
      canceled = true;
      for (const control of controls) control.cancel?.(reason);
      options.onCancel?.(reason);
    },
    get completed() {
      return !released && (completed || controls.every((control) => control.completed));
    },
    get arrived() {
      return !released && (arrived || controls.every((control) => control.arrived));
    },
    release() {
      if (completed || canceled || released) return;
      released = true;
      for (const control of controls) control.release?.();
    },
    get released() {
      return released;
    },
  };
}

export function killMotionOf(targetOrTargets, props = null, options = {}) {
  const runtime = options.runtime || motionRuntime;
  const targets = Array.isArray(targetOrTargets) ? targetOrTargets : [targetOrTargets];
  const propNames = typeof props === "string"
    ? props.split(",").map((prop) => prop.trim()).filter(Boolean)
    : Array.isArray(props)
      ? props
      : null;
  for (const target of targets) {
    if (!target) continue;
    if (!propNames) {
      runtime.cancelTarget(target, { lane: options.lane, reason: options.reason });
      continue;
    }
    for (const prop of propNames) {
      for (const track of getPropTracks(target, prop, { [prop]: 0 })) {
        runtime.stop(track.target, track.prop, { lane: options.lane, laneKey: options.laneKey, reason: options.reason });
      }
    }
  }
}

function startMotionItem(item, options = {}) {
  if (!item) return null;
  if (typeof item === "function") return item(options);
  if (typeof item.start === "function") return item.start(options);
  if (typeof item.cancel === "function") return item;
  if (item.target && item.to) return motionTo(item.target, item.to, options);
  return null;
}

function makeGroupControl(controls) {
  let canceled = false;
  let released = false;
  return {
    cancel(reason = "cancel") {
      if (released || canceled) return;
      canceled = true;
      for (const control of controls) control.cancel?.(reason);
    },
    get completed() {
      return !released && controls.every((control) => control.completed);
    },
    get arrived() {
      return controls.length > 0 && controls.every((control) => control.arrived);
    },
    release() {
      if (released || canceled || controls.every((control) => control.completed)) return;
      released = true;
      for (const control of controls) control.release?.();
    },
    get released() {
      return released;
    },
    get laneKey() {
      return controls.length === 1 ? controls[0].laneKey : undefined;
    },
    get progress() {
      return controls.length === 1 ? controls[0].progress : undefined;
    },
    setProgress(progress) {
      if (released || canceled) return;
      for (const control of controls) control.setProgress?.(progress);
    },
    settle(options = {}) {
      if (released || canceled) return;
      for (const control of controls) control.settle?.(options);
    },
    reverse() {
      if (released || canceled) return;
      for (const control of controls) control.reverse?.();
    },
    get state() {
      return controls.length === 1 ? controls[0].state : undefined;
    },
    get value() {
      return controls.length === 1 ? controls[0].value : undefined;
    },
    get velocity() {
      return controls.length === 1 ? controls[0].velocity : undefined;
    },
  };
}
