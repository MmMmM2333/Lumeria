import {
  motionRuntime,
  progressDriver,
  spring as springDriver,
  tween as tweenDriver,
} from "./motionRuntime.js";
import type {
  MotionAnimationControl,
  MotionAnimationState,
  MotionDebugMetadata,
  MotionDriver,
  MotionEaseInput,
  MotionInterruptPolicy,
  MotionLane,
  MotionMilestone,
  MotionProgressDriverOptions,
  MotionRuntime,
  MotionSettleOptions,
  MotionSpringConfig,
  MotionTweenDriverOptions,
} from "./motionRuntime.js";
import { prefersReducedMotion } from "./motionPreferences.js";
import { getMotionPreset } from "./motionPresets.js";
import type { MotionPreset } from "./motionPresets.js";
import { readNumber } from "./motionTraceShared.js";

export type MotionTarget = object;
export type MotionTargetInput = MotionTarget | null | undefined | readonly (MotionTarget | null | undefined)[];
export type MotionNumericValues = Readonly<Record<string, number | undefined>>;

export interface MotionDebugMetadataContext {
  readonly prop: string;
  readonly sourceProp: string;
  readonly target: object;
  readonly trackTarget: object;
}

export interface MotionVars {
  [key: string]: unknown;
  blendDuration?: number | undefined;
  blendEase?: MotionEaseInput | undefined;
  debugMetadata?: MotionDebugMetadata | ((context: MotionDebugMetadataContext) => MotionDebugMetadata | null) | undefined;
  delay?: number | undefined;
  driver?: MotionDriver | undefined;
  duration?: number | undefined;
  ease?: MotionEaseInput | undefined;
  from?: MotionNumericValues | undefined;
  interrupt?: MotionInterruptPolicy | undefined;
  lane?: MotionLane | undefined;
  laneKey?: string | undefined;
  lanePreset?: string | undefined;
  loop?: boolean | undefined;
  milestones?: readonly MotionMilestone[] | undefined;
  onArrive?: ((value?: number) => void) | undefined;
  onCancel?: ((reason: string) => void) | undefined;
  onComplete?: (() => void) | undefined;
  onUpdate?: ((value: number) => void) | undefined;
  presetOverrides?: MotionPreset | undefined;
  repeat?: number | undefined;
  snap?: boolean | undefined;
  sourceLabel?: string | undefined;
  spring?: Readonly<MotionSpringConfig> | undefined;
  target?: MotionTargetInput | undefined;
  velocity?: number | MotionNumericValues | undefined;
  yoyo?: boolean | undefined;
}

export interface MotionCallOptions extends MotionVars {
  runtime?: MotionRuntime | undefined;
}

export interface MotionKillOptions {
  lane?: MotionLane | undefined;
  laneKey?: string | undefined;
  reason?: string | undefined;
  runtime?: MotionRuntime | undefined;
}

export interface MotionLanePreset {
  lane: MotionLane;
  laneKey?: string | undefined;
}

export interface MotionControl {
  readonly arrived: boolean;
  cancel(reason?: string): void;
  readonly completed: boolean;
  readonly laneKey?: string | undefined;
  readonly progress?: number | undefined;
  release(): void;
  readonly released: boolean;
  reverse?(): void;
  setProgress?(progress: number): void;
  settle?(options?: MotionSettleOptions): void;
  readonly state?: MotionAnimationState | undefined;
  readonly value?: number | undefined;
  readonly velocity?: number | undefined;
}

export interface MotionBuilder {
  additive(laneKey?: string, overrides?: MotionVars): MotionBuilder;
  at(progress: number, callback: MotionMilestone["callback"]): MotionBuilder;
  blend(duration?: number, ease?: MotionEaseInput): MotionBuilder;
  defaults(overrides?: MotionVars): MotionBuilder;
  delay(value: number): MotionBuilder;
  drag(overrides?: Partial<MotionLanePreset>): MotionBuilder;
  duration(value: number): MotionBuilder;
  ease(value: MotionEaseInput): MotionBuilder;
  factor(laneKey?: string, overrides?: MotionVars): MotionBuilder;
  from(vars?: MotionNumericValues): MotionBuilder;
  handoff(overrides?: Partial<MotionLanePreset>): MotionBuilder;
  hover(overrides?: Partial<MotionLanePreset>): MotionBuilder;
  interrupt(policy: MotionInterruptPolicy): MotionBuilder;
  jiggle(overrides?: Partial<MotionLanePreset>): MotionBuilder;
  lane(lane: MotionLane, laneKey?: string): MotionBuilder;
  lanePreset(name: string, overrides?: Partial<MotionLanePreset>): MotionBuilder;
  layout(overrides?: Partial<MotionLanePreset>): MotionBuilder;
  overlay(overrides?: Partial<MotionLanePreset>): MotionBuilder;
  preset(name: string, overrides?: MotionPreset): MotionBuilder;
  press(overrides?: Partial<MotionLanePreset>): MotionBuilder;
  scrub(progress?: number, options?: MotionProgressDriverOptions): MotionBuilder;
  set(vars?: MotionVars, options?: MotionVars): MotionBuilder;
  spring(config?: Readonly<MotionSpringConfig>): MotionBuilder;
  start(options?: MotionCallOptions): MotionControl;
  to(vars?: MotionVars, options?: MotionVars): MotionBuilder;
  tween(options?: MotionTweenDriverOptions): MotionBuilder;
}

interface MotionTrack {
  from: number | undefined;
  prop: string;
  target: object;
  to: number;
}

interface MotionBuilderState {
  defaults: MotionVars;
  from: MotionNumericValues | null;
  steps: MotionVars[];
  targetOrTargets: MotionTargetInput;
}

export interface MotionSequenceStep extends MotionVars {
  target?: MotionTargetInput | undefined;
}

export type MotionItem =
  | MotionBuilder
  | MotionControl
  | ((options: MotionCallOptions) => MotionControl | null)
  | { target: MotionTargetInput; to: MotionVars };

function isObjectTarget(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function readObjectValue(target: object, prop: string): unknown {
  return Reflect.get(target, prop);
}

function writeObjectValue(target: object, prop: string, value: unknown): void {
  if (!Reflect.set(target, prop, value)) throw new TypeError(`Unable to write motion option "${prop}".`);
}

function readNumericValue(values: MotionNumericValues | undefined, prop: string): number | undefined {
  const value = values ? Reflect.get(values, prop) : undefined;
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function lastMotionStep(steps: MotionVars[]): MotionVars | undefined {
  return steps.length ? steps[steps.length - 1] : undefined;
}

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

export const motionLanes: Readonly<Record<string, Readonly<MotionLanePreset>>> = Object.freeze({
  drag: Object.freeze({ lane: "base", laneKey: "drag" }),
  handoff: Object.freeze({ lane: "base", laneKey: "handoff" }),
  hover: Object.freeze({ lane: "additive", laneKey: "hover" }),
  jiggle: Object.freeze({ lane: "additive", laneKey: "jiggle" }),
  layout: Object.freeze({ lane: "base", laneKey: "layout" }),
  overlay: Object.freeze({ lane: "base", laneKey: "overlay" }),
  press: Object.freeze({ lane: "factor", laneKey: "press" }),
});

export function lanePreset(name: string, overrides: Partial<MotionLanePreset> = {}): MotionLanePreset {
  return { ...(motionLanes[name] || { lane: name as MotionLane }), ...overrides };
}

function getTweenProps(vars: MotionVars = {}): string[] {
  return Object.keys(vars).filter((key) => !RESERVED_KEYS.has(key) && Number.isFinite(Number(Reflect.get(vars, key))));
}

function getPropTracks(target: object, prop: string, vars: MotionVars = {}): MotionTrack[] {
  const scaleValue = readObjectValue(target, "scale");
  const scaleTarget = isObjectTarget(scaleValue) ? scaleValue : null;
  if (!scaleTarget) {
    return [{ from: readNumericValue(vars.from, prop), prop, target, to: readNumber(Reflect.get(vars, prop)) }];
  }
  if (prop === "scale") {
    return [
      { prop: "x", target: scaleTarget, to: readNumber(Reflect.get(vars, "scale")), from: readNumericValue(vars.from, "scale") ?? readNumericValue(vars.from, "scaleX") },
      { prop: "y", target: scaleTarget, to: readNumber(Reflect.get(vars, "scale")), from: readNumericValue(vars.from, "scale") ?? readNumericValue(vars.from, "scaleY") },
    ];
  }
  if (prop === "scaleX") return [{ prop: "x", target: scaleTarget, to: readNumber(Reflect.get(vars, "scaleX")), from: readNumericValue(vars.from, "scaleX") ?? readNumericValue(vars.from, "scale") }];
  if (prop === "scaleY") return [{ prop: "y", target: scaleTarget, to: readNumber(Reflect.get(vars, "scaleY")), from: readNumericValue(vars.from, "scaleY") ?? readNumericValue(vars.from, "scale") }];
  return [{ from: readNumericValue(vars.from, prop), prop, target, to: readNumber(Reflect.get(vars, prop)) }];
}

function getTrackCount(target: object | null | undefined, props: readonly string[], vars: MotionVars = {}): number {
  if (!target) return props.length;
  let count = 0;
  for (const prop of props) count += getPropTracks(target, prop, vars).length;
  return count;
}

function callBoth<Args extends unknown[]>(
  first: ((...args: Args) => unknown) | null | undefined,
  second: ((...args: Args) => unknown) | null | undefined,
  ...args: Args
): void {
  first?.(...args);
  second?.(...args);
}

function makeMilestone(progress: number, callback: MotionMilestone["callback"] | undefined): MotionMilestone | null {
  if (typeof callback !== "function") return null;
  return { callback, progress: readNumber(progress) };
}

function getTrackVelocity(track: MotionTrack, vars: MotionVars = {}, sourceProp = track.prop): number {
  const velocity = vars.velocity;
  if (velocity == null || typeof velocity === "number") return readNumber(velocity, 0);
  if (sourceProp === "scale") {
    const scaleAxisProp = track.prop === "x" ? "scaleX" : "scaleY";
    return readNumber(
      Reflect.get(velocity, track.prop),
      readNumber(Reflect.get(velocity, scaleAxisProp), readNumber(Reflect.get(velocity, "scale"), 0)),
    );
  }
  return readNumber(Reflect.get(velocity, track.prop), readNumber(Reflect.get(velocity, sourceProp), 0));
}

function appendMilestone(step: MotionVars | undefined, milestone: MotionMilestone | null): void {
  if (!step || !milestone) return;
  step.milestones = [...(step.milestones || []), milestone];
}

function resolveDebugMetadata(
  target: object,
  track: MotionTrack,
  sourceProp: string,
  vars: MotionVars = {},
  options: MotionCallOptions = {},
): Record<string, unknown> | null {
  const input = vars.debugMetadata ?? options.debugMetadata;
  const sourceLabel = vars.sourceLabel ?? options.sourceLabel;
  if (!input && sourceLabel == null) return null;
  const raw = typeof input === "function"
    ? input({ prop: track.prop, sourceProp, target, trackTarget: track.target })
    : input;
  const metadata: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  if (sourceLabel != null && metadata.sourceLabel == null) metadata.sourceLabel = sourceLabel;
  if (metadata.sourceProp == null && sourceProp !== track.prop) metadata.sourceProp = sourceProp;
  if (metadata.targetPart == null && track.target !== target) {
    metadata.targetPart = track.target === readObjectValue(target, "scale") ? "scale" : "adapted";
  }
  return metadata;
}

function describeDebugTarget(
  runtime: MotionRuntime,
  target: object,
  track: MotionTrack,
  sourceProp: string,
  vars: MotionVars = {},
  options: MotionCallOptions = {},
): void {
  const metadata = resolveDebugMetadata(target, track, sourceProp, vars, options);
  if (!metadata) return;
  if (track.target !== target && metadata.overlayTarget == null && metadata.boundsTarget == null) {
    writeObjectValue(metadata, "overlayTarget", target);
  }
  runtime.describeTarget(track.target, metadata);
}

export function motionTo(
  targetOrTargets: MotionTargetInput,
  vars: MotionVars = {},
  options: MotionCallOptions = {},
): MotionControl {
  const runtime = options.runtime || motionRuntime;
  const shouldSnap = vars.snap || (prefersReducedMotion() && vars.driver?.type !== "progress");
  const laneOptions: Partial<MotionLanePreset> = vars.lanePreset ? lanePreset(vars.lanePreset) : {};
  const targets = Array.isArray(targetOrTargets) ? targetOrTargets : [targetOrTargets];
  const props = getTweenProps(vars);
  const controls: MotionAnimationControl[] = [];
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
          runtime.animate(track.target, track.prop, readNumber(track.to), {
            from: track.from,
            lane: vars.lane || laneOptions.lane || "base",
            laneKey: vars.laneKey || laneOptions.laneKey,
            milestones: vars.milestones,
            onArrive: arriveOne,
            onCancel: (reason: string) => callBoth(vars.onCancel, options.onCancel, reason),
            onComplete: completeOne,
            onUpdate: vars.onUpdate,
            snap: true,
            velocity,
          });
          continue;
        }
        const remainingBeforeStart = remaining;
        const control = runtime.animate(track.target, track.prop, readNumber(track.to), {
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
          onCancel: (reason: string) => callBoth(vars.onCancel, options.onCancel, reason),
          onComplete: completeOne,
          onUpdate: vars.onUpdate,
          velocity,
        });
        if (control) controls.push(control);
        else if (remaining === remainingBeforeStart) completeOne();
      }
    }
  }

  return makeGroupControl(controls);
}

export function motion(targetOrTargets: MotionTargetInput, defaults: MotionVars = {}): MotionBuilder {
  const state: MotionBuilderState = {
    defaults: { ...defaults },
    from: null,
    steps: [],
    targetOrTargets,
  };

  const setDefault = (key: string, value: unknown): MotionBuilder => {
    writeObjectValue(state.defaults, key, value);
    const step = lastMotionStep(state.steps);
    if (step) writeObjectValue(step, key, value);
    return builder;
  };

  const builder: MotionBuilder = {
    delay(value: number) {
      return setDefault("delay", value);
    },
    duration(value: number) {
      return setDefault("duration", value);
    },
    ease(value: MotionEaseInput) {
      return setDefault("ease", value);
    },
    blend(duration: number | undefined = undefined, ease: MotionEaseInput | undefined = undefined) {
      state.defaults.interrupt = "blend";
      if (duration !== undefined) state.defaults.blendDuration = duration;
      if (ease !== undefined) state.defaults.blendEase = ease;
      if (state.steps.length) {
        const step = lastMotionStep(state.steps);
        if (!step) return builder;
        step.interrupt = "blend";
        if (duration !== undefined) step.blendDuration = duration;
        if (ease !== undefined) step.blendEase = ease;
      }
      return builder;
    },
    from(vars: MotionNumericValues = {}) {
      state.from = { ...vars };
      const step = lastMotionStep(state.steps);
      if (step) step.from = state.from;
      return builder;
    },
    interrupt(policy: MotionInterruptPolicy) {
      return setDefault("interrupt", policy);
    },
    lane(lane: MotionLane, laneKey: string | undefined = undefined) {
      state.defaults.lane = lane;
      if (laneKey !== undefined) state.defaults.laneKey = laneKey;
      if (state.steps.length) {
        const step = lastMotionStep(state.steps);
        if (!step) return builder;
        step.lane = lane;
        if (laneKey !== undefined) step.laneKey = laneKey;
      }
      return builder;
    },
    lanePreset(name: string, overrides: Partial<MotionLanePreset> = {}) {
      const preset = lanePreset(name, overrides);
      return builder.lane(preset.lane, preset.laneKey);
    },
    additive(laneKey = "additive", overrides: MotionVars = {}) {
      return builder.lane("additive", laneKey).defaults(overrides);
    },
    factor(laneKey = "factor", overrides: MotionVars = {}) {
      return builder.lane("factor", laneKey).defaults(overrides);
    },
    defaults(overrides: MotionVars = {}) {
      Object.assign(state.defaults, overrides);
      const step = lastMotionStep(state.steps);
      if (step) Object.assign(step, overrides);
      return builder;
    },
    at(progress: number, callback: MotionMilestone["callback"]) {
      const milestone = makeMilestone(progress, callback);
      if (!milestone) return builder;
      if (state.steps.length) appendMilestone(lastMotionStep(state.steps), milestone);
      else appendMilestone(state.defaults, milestone);
      return builder;
    },
    drag(overrides: Partial<MotionLanePreset> = {}) {
      return builder.lanePreset("drag", overrides);
    },
    handoff(overrides: Partial<MotionLanePreset> = {}) {
      return builder.lanePreset("handoff", overrides);
    },
    hover(overrides: Partial<MotionLanePreset> = {}) {
      return builder.lanePreset("hover", overrides);
    },
    jiggle(overrides: Partial<MotionLanePreset> = {}) {
      return builder.lanePreset("jiggle", overrides);
    },
    layout(overrides: Partial<MotionLanePreset> = {}) {
      return builder.lanePreset("layout", overrides);
    },
    overlay(overrides: Partial<MotionLanePreset> = {}) {
      return builder.lanePreset("overlay", overrides);
    },
    press(overrides: Partial<MotionLanePreset> = {}) {
      return builder.lanePreset("press", overrides);
    },
    preset(name: string, overrides: MotionPreset = {}) {
      const preset = getMotionPreset(name, overrides);
      if (preset.spring) state.defaults.driver = springDriver(preset.spring);
      if (preset.duration != null) state.defaults.duration = preset.duration;
      if (preset.ease != null) state.defaults.ease = preset.ease;
      if (state.steps.length) {
        const step = lastMotionStep(state.steps);
        if (!step) return builder;
        if (preset.spring) step.driver = state.defaults.driver;
        if (preset.duration != null) step.duration = preset.duration;
        if (preset.ease != null) step.ease = preset.ease;
      }
      return builder;
    },
    set(vars: MotionVars = {}, options: MotionVars = {}) {
      state.steps.push({ ...state.defaults, ...options, ...vars, snap: true });
      return builder;
    },
    spring(config: Readonly<MotionSpringConfig> = {}) {
      return setDefault("driver", springDriver(config));
    },
    scrub(progress = 0, options: MotionProgressDriverOptions = {}) {
      state.defaults.driver = progressDriver({ completeAtEnd: false, ease: state.defaults.ease, progress, ...options });
      const step = lastMotionStep(state.steps);
      if (step) step.driver = state.defaults.driver;
      return builder;
    },
    start(options: MotionCallOptions = {}) {
      const steps = state.steps.length ? state.steps : [{ ...state.defaults }];
      if (steps.length === 1) return motionTo(state.targetOrTargets, steps[0] ?? {}, options);
      return motionSequence(state.targetOrTargets, steps, options);
    },
    to(vars: MotionVars = {}, options: MotionVars = {}) {
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
    tween(options: MotionTweenDriverOptions = {}) {
      return setDefault("driver", tweenDriver(options));
    },
  };

  return builder;
}

export function motionAdd(
  targetOrTargets: MotionTargetInput,
  vars: MotionVars = {},
  options: MotionCallOptions = {},
): MotionControl {
  const props = getTweenProps(vars);
  if (!props.length) return makeGroupControl([]);
  const from: Record<string, number | undefined> = { ...(vars.from || {}) };
  const toVars: MotionVars = { ...vars };
  for (const prop of props) {
    from[prop] = readNumericValue(vars.from, prop) ?? readNumber(Reflect.get(vars, prop));
    writeObjectValue(toVars, prop, 0);
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

export function motionSequence(
  targetOrTargets: MotionTargetInput,
  steps: readonly MotionSequenceStep[] = [],
  options: MotionCallOptions = {},
): MotionControl {
  let current: MotionControl | null = null;
  let arrived = false;
  let completed = false;
  let canceled = false;
  let released = false;
  let index = 0;

  const playNext = (): void => {
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

export function parallel(items: readonly MotionItem[] = [], options: MotionCallOptions = {}): MotionControl {
  const controls: MotionControl[] = [];
  let canceled = false;
  let completed = false;
  let arrived = false;
  let released = false;
  let arriveRemaining = items.length;
  let remaining = items.length;

  const arriveItem = (): void => {
    arriveRemaining -= 1;
    if (arriveRemaining > 0 || arrived || canceled || released) return;
    arrived = true;
    options.onArrive?.();
  };

  const completeItem = (): void => {
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

export function killMotionOf(
  targetOrTargets: MotionTargetInput,
  props: string | readonly string[] | null = null,
  options: MotionKillOptions = {},
): void {
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

function isMotionControl(value: unknown): value is MotionControl {
  if (!isObjectTarget(value)) return false;
  return typeof Reflect.get(value, "cancel") === "function"
    && typeof Reflect.get(value, "release") === "function";
}

function startMotionItem(item: MotionItem | null | undefined, options: MotionCallOptions = {}): MotionControl | null {
  if (!item) return null;
  if (typeof item === "function") return item(options);
  const start = Reflect.get(item, "start");
  if (typeof start === "function") {
    const result: unknown = Reflect.apply(start, item, [options]);
    return isMotionControl(result) ? result : null;
  }
  if (isMotionControl(item)) return item;
  const target = Reflect.get(item, "target");
  const to = Reflect.get(item, "to");
  if (target && to && typeof to === "object") return motionTo(target as MotionTargetInput, to as MotionVars, options);
  return null;
}

function makeGroupControl(controls: readonly MotionControl[]): MotionControl {
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
      return controls.length === 1 ? controls[0]?.laneKey : undefined;
    },
    get progress() {
      return controls.length === 1 ? controls[0]?.progress : undefined;
    },
    setProgress(progress: number) {
      if (released || canceled) return;
      for (const control of controls) control.setProgress?.(progress);
    },
    settle(options: MotionSettleOptions = {}) {
      if (released || canceled) return;
      for (const control of controls) control.settle?.(options);
    },
    reverse() {
      if (released || canceled) return;
      for (const control of controls) control.reverse?.();
    },
    get state() {
      return controls.length === 1 ? controls[0]?.state : undefined;
    },
    get value() {
      return controls.length === 1 ? controls[0]?.value : undefined;
    },
    get velocity() {
      return controls.length === 1 ? controls[0]?.velocity : undefined;
    },
  };
}
