import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { createMotionRuntimeDebugAdapter, sanitizeDebugMetadata } from "./motionRuntimeDebugAdapter.js";
import {
  clamp,
  readNumber,
} from "./motionTraceShared.js";

export type MotionEase = (progress: number) => number;
export type MotionEaseInput = MotionEase | string;
export type MotionLane = "additive" | "base" | "factor";
export type MotionInterruptPolicy = "auto" | "blend" | "ignore" | "replace" | "retarget";

export interface MotionSpringConfig {
  arriveDelta?: number;
  damping?: number;
  mass?: number;
  restDelta?: number;
  restSpeed?: number;
  stiffness?: number;
}

export interface MotionTweenDriverOptions {
  arriveDelta?: number | undefined;
  duration?: number | undefined;
  ease?: MotionEaseInput | undefined;
  loop?: boolean | undefined;
  repeat?: number | undefined;
  yoyo?: boolean | undefined;
}

export interface MotionProgressDriverOptions {
  completeAtEnd?: boolean | undefined;
  ease?: MotionEaseInput | undefined;
  progress?: number | undefined;
}

export interface MotionSpringDriver {
  readonly config: Readonly<MotionSpringConfig>;
  readonly type: "spring";
}

export interface MotionTweenDriver {
  readonly options: Readonly<MotionTweenDriverOptions>;
  readonly type: "tween";
}

export interface MotionProgressDriver {
  options: MotionProgressDriverOptions;
  readonly type: "progress";
}

export type MotionDriver = MotionProgressDriver | MotionSpringDriver | MotionTweenDriver;

export interface MotionMilestoneContext {
  readonly progress: number;
  readonly prop: string;
  readonly target: object;
}

export interface MotionMilestone {
  readonly callback: (value: number, context: MotionMilestoneContext) => void;
  readonly progress: number;
}

interface RuntimeMotionMilestone extends MotionMilestone {
  fired: boolean;
}

interface MotionDebugLaneRecord extends MotionDebugRecord {
  lane: MotionLane;
  laneKey: string;
  output: number;
}

interface MotionDebugChannelRecord extends MotionDebugRecord {
  lanes: Record<MotionLane, string[]>;
}

export interface MotionClamp {
  max: number;
  min: number;
}

export interface MotionAnimationOptions {
  blendDuration?: number | undefined;
  blendEase?: MotionEaseInput | undefined;
  clamp?: Partial<MotionClamp> | undefined;
  delay?: number | undefined;
  driver?: MotionDriver | undefined;
  from?: number | undefined;
  interrupt?: MotionInterruptPolicy | undefined;
  lane?: MotionLane | undefined;
  laneKey?: string | undefined;
  milestones?: readonly MotionMilestone[] | undefined;
  onArrive?: ((value: number) => void) | undefined;
  onCancel?: ((reason: string) => void) | undefined;
  onComplete?: (() => void) | undefined;
  onUpdate?: ((value: number) => void) | undefined;
  snap?: boolean | undefined;
  velocity?: number | undefined;
}

export interface MotionStopOptions {
  lane?: MotionLane | undefined;
  laneKey?: string | undefined;
  reason?: string | undefined;
}

export interface MotionCancelTargetOptions extends MotionStopOptions {
  recursive?: boolean;
}

export interface MotionSettleOptions {
  config?: MotionSpringConfig;
  delay?: number;
  driver?: MotionDriver;
  midpoint?: number;
  progress?: number;
  spring?: MotionSpringConfig;
  valueVelocity?: number;
  velocity?: number;
  velocityThreshold?: number;
}

export interface MotionChannel {
  readonly activeBaseKey: string | null;
  readonly additive: ReadonlyMap<string, MotionAnimationState>;
  readonly base: ReadonlyMap<string, MotionAnimationState>;
  readonly baseValue: number;
  readonly clamp?: Readonly<MotionClamp>;
  readonly factor: ReadonlyMap<string, MotionAnimationState>;
  readonly prop: string;
  readonly target: object;
  readonly value: number;
}

export interface MotionAnimationState {
  readonly arrived: boolean;
  readonly blendDuration: number;
  readonly blendEase: MotionEaseInput | undefined;
  readonly blendElapsed: number;
  readonly blendFrom: number | null;
  readonly channel: MotionChannel;
  readonly delay: number;
  readonly done: boolean;
  readonly driver: ReadonlyMotionDriver;
  readonly elapsed: number;
  readonly from: number;
  readonly hasExplicitFrom: boolean;
  readonly interrupt: MotionInterruptPolicy;
  readonly lane: MotionLane;
  readonly laneKey: string;
  readonly milestones: readonly MotionMilestone[];
  readonly onArrive: ((value: number) => void) | null | undefined;
  readonly onCancel: ((reason: string) => void) | null | undefined;
  readonly onComplete: (() => void) | null | undefined;
  readonly onUpdate: ((value: number) => void) | null | undefined;
  readonly prop: string;
  readonly progress?: number;
  readonly released: boolean;
  readonly started: boolean;
  readonly target: object;
  readonly to: number;
  readonly value: number;
  readonly velocity: number;
}

export type ReadonlyMotionDriver =
  | MotionSpringDriver
  | MotionTweenDriver
  | Readonly<{ options: Readonly<MotionProgressDriverOptions>; type: "progress" }>;

interface RuntimeMotionChannel extends MotionChannel {
  activeBaseKey: string | null;
  additive: Map<string, RuntimeMotionAnimationState>;
  base: Map<string, RuntimeMotionAnimationState>;
  baseValue: number;
  clamp?: MotionClamp;
  factor: Map<string, RuntimeMotionAnimationState>;
  value: number;
}

interface RuntimeMotionAnimationState extends MotionAnimationState {
  arrived: boolean;
  blendDuration: number;
  blendEase: MotionEaseInput | undefined;
  blendElapsed: number;
  blendFrom: number | null;
  channel: RuntimeMotionChannel;
  delay: number;
  done: boolean;
  driver: MotionDriver;
  elapsed: number;
  from: number;
  milestones: RuntimeMotionMilestone[];
  onArrive: ((value: number) => void) | null | undefined;
  onCancel: ((reason: string) => void) | null | undefined;
  onComplete: (() => void) | null | undefined;
  onUpdate: ((value: number) => void) | null | undefined;
  progress?: number;
  released: boolean;
  started: boolean;
  to: number;
  value: number;
  velocity: number;
}

export interface MotionAnimationControl {
  readonly arrived: boolean;
  cancel(reason?: string): void;
  readonly completed: boolean;
  readonly laneKey: string;
  readonly progress: number | undefined;
  release(): void;
  readonly released: boolean;
  reverse(): void;
  setProgress(progress: number): void;
  settle(options?: MotionSettleOptions): void;
  readonly state: MotionAnimationState;
  readonly value: number;
  readonly velocity: number;
}

export type MotionRenderSignalReason =
  | "arrive"
  | "cancel"
  | "complete"
  | "debug-config"
  | "frame"
  | "frame-request"
  | "motion"
  | "release"
  | "retarget"
  | "settle"
  | "snap"
  | "start";

export interface MotionRenderSignal {
  readonly activeAnimationCount: number;
  readonly afterFrameFlushes: number;
  readonly frame: number;
  readonly reason: MotionRenderSignalReason;
  readonly timeMs: number;
  readonly writesLastFrame: number;
}

export type MotionRenderSignalListener = (signal: MotionRenderSignal) => void;

export interface MotionRenderSignalObserver {
  handleRenderSignal(signal: MotionRenderSignal): void;
}

export interface MotionDebugRecordFilter {
  eventTypes: string[];
  includeEvents: boolean;
  includeSamples: boolean;
  kinds: string[];
  layers: string[];
  props: string[];
  sourceLabels: string[];
  sourceQuery: string;
}

export type MotionDebugRecordFilterInput = Readonly<Record<string, unknown>>;

export interface MotionDebugConfig {
  enabled: boolean;
  maxEvents: number;
  maxSamples: number;
  overlayEnabled: boolean;
  recordFilter: MotionDebugRecordFilter | null;
  recordHistory: boolean;
  recordWindowMs: number;
  sampleHz: number;
  timeScale: number;
}

export interface MotionDebugConfigPatch {
  enabled?: boolean;
  maxEvents?: number;
  maxSamples?: number;
  overlayEnabled?: boolean;
  recordFilter?: MotionDebugRecordFilterInput | MotionDebugRecordFilter | false | null;
  recordHistory?: boolean;
  recordWindowMs?: number;
  sampleHz?: number;
  timeScale?: number;
}

export type MotionDebugMetadata = Readonly<Record<string, unknown>>;

export interface MotionDebugRecord {
  [key: string]: unknown;
  activeAnimationCount?: number | undefined;
  afterFrameFlushes?: number | undefined;
  animations?: MotionDebugRecord[] | undefined;
  blendDuration?: number | undefined;
  blendProgress?: number | undefined;
  delay?: number | undefined;
  driver?: string | undefined;
  frame?: number | undefined;
  from?: number | undefined;
  interrupt?: string | undefined;
  kind?: string | undefined;
  label?: string | undefined;
  lane?: string | undefined;
  laneKey?: string | undefined;
  layer?: string | undefined;
  prop?: string | undefined;
  reason?: string | undefined;
  released?: boolean | undefined;
  sourceLabel?: string | undefined;
  targetId?: number | null | undefined;
  targetKind?: string | undefined;
  targetLabel?: string | undefined;
  timeMs?: number | undefined;
  to?: number | undefined;
  type?: string | undefined;
  value?: number | undefined;
  velocity?: number | undefined;
  writesLastFrame?: number | undefined;
}

export interface MotionDebugSummary {
  activeAnimationCount: number;
  activeChannelCount: number;
  activeTargetCount: number;
  byDriver: Record<string, number>;
  byLane: Record<string, number>;
  byLaneKey: Record<string, number>;
  byProp: Record<string, number>;
  byTargetId: Record<string, number>;
  warningCount?: number;
}

export interface MotionDebugCounters {
  activeChannels: number;
  activeTargets: number;
  afterFrameFlushes: number;
  canceled: number;
  canceledByReason: Record<string, number>;
  completed: number;
  frames: number;
  released: number;
  started: number;
  writes: number;
  writesLastFrame: number;
}

export interface MotionDebugHistory {
  events: MotionDebugRecord[];
  samples: MotionDebugRecord[];
}

export interface MotionDebugSnapshot {
  animations: MotionDebugRecord[];
  channels?: MotionDebugRecord[];
  counters: MotionDebugCounters;
  history?: MotionDebugHistory;
  summary: MotionDebugSummary;
  targets?: MotionDebugRecord[];
  warnings: MotionDebugRecord[];
}

export interface MotionDebugRuntimeState {
  activeAnimationCount: number;
  frames: number;
  timeMs: number;
}

export interface MotionDebugReport extends MotionDebugSnapshot {
  config: MotionDebugConfig;
  curveStats?: MotionDebugRecord[];
  history?: MotionDebugHistory;
  runtime: MotionDebugRuntimeState;
  version: 1;
}

export interface MotionDebugSnapshotOptions {
  includeChannels?: boolean | undefined;
  includeHistory?: boolean | undefined;
  includeTargets?: boolean | undefined;
}

export interface MotionDebugReportOptions extends MotionDebugSnapshotOptions {
  includeCurveStats?: boolean | undefined;
}

export interface MotionRuntimeDebugState {
  animations: MotionDebugRecord[];
  channels?: MotionDebugRecord[] | undefined;
  runtime: MotionDebugRuntimeState;
}

export interface MotionDebugEvent extends MotionDebugRecord {
  active?: boolean;
  config?: MotionDebugConfig;
  metadata?: MotionDebugMetadata | null;
  record?: MotionDebugRecord;
  target?: object;
  type: string;
}

export type MotionDebugObserverListener = (event: MotionDebugEvent) => void;

export interface MotionDebugObserver {
  handleEvent(event: MotionDebugEvent): void;
}

export interface MotionRuntimeDebugAdapter {
  clearHistory(): void;
  configureDebug(patch?: MotionDebugConfigPatch): MotionDebugConfig;
  readonly debug: MotionDebugCounters;
  getConfig(): MotionDebugConfig;
  isEnabled(): boolean;
  makeReport(options?: MotionDebugReportOptions, currentState?: MotionRuntimeDebugState): MotionDebugReport;
  makeSnapshot(options?: MotionDebugSnapshotOptions, currentState?: MotionRuntimeDebugState): MotionDebugSnapshot;
  makeTargetMetadataRecord(targetId: number, metadata?: MotionDebugMetadata | null): MotionDebugRecord;
  observe(event: MotionDebugEvent): void;
  reset(): void;
  resolveTarget(targetId: number, options?: { bounds?: boolean }): object | null;
  shouldBuildSample(timeMs?: number): boolean;
  shouldObserveSamples(): boolean;
}

export type MotionRuntimeDebugAdapterFactory = () => MotionRuntimeDebugAdapter;

export interface MotionFrameScheduler {
  cancelAnimationFrame(handle: number): void;
  requestAnimationFrame(callback: (timeMs: number) => void): number;
}

export interface MotionRuntimeOptions {
  autoStart?: boolean;
  maxDeltaSeconds?: number;
  scheduler?: Partial<MotionFrameScheduler>;
  stepSeconds?: number;
}

export interface MotionRuntime {
  addObserver(observer: MotionDebugObserver | MotionDebugObserverListener): () => void;
  afterFrame(callback: () => void): void;
  animate(target: object, prop: string, to: number, options?: MotionAnimationOptions): MotionAnimationControl | null;
  cancelTarget(target: object, options?: MotionCancelTargetOptions): boolean;
  clearDebugHistory(): void;
  configureDebug(config?: MotionDebugConfigPatch): MotionDebugConfig;
  readonly debug: MotionDebugCounters;
  debugReport(options?: MotionDebugReportOptions): MotionDebugReport;
  debugSnapshot(options?: MotionDebugSnapshotOptions): MotionDebugSnapshot;
  describeTarget(target: object, metadata?: MotionDebugMetadata): MotionDebugRecord | null;
  getChannel(target: object, prop: string): MotionChannel | null;
  hasActiveWork(): boolean;
  onRenderSignal(observer: MotionRenderSignalListener | MotionRenderSignalObserver): () => void;
  recordCoordinationEvent(payload?: MotionDebugMetadata): void;
  reset(): void;
  resolveDebugTarget(targetId: number, options?: { bounds?: boolean }): object | null;
  resumeAutoTicker(): void;
  step(deltaSeconds?: number): void;
  stop(target: object, prop: string, options?: MotionStopOptions): boolean;
  suspendAutoTicker(): void;
}

interface MotionRuntimeTestControls {
  flushAfterFrameForTests(): void;
}

let motionRuntimeDebugAdapterFactory: MotionRuntimeDebugAdapterFactory = createMotionRuntimeDebugAdapter;
const motionRuntimeDebugAdapterInstallers = new Set<(factory: MotionRuntimeDebugAdapterFactory) => boolean>();

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

export function installMotionRuntimeDebugAdapterFactory(factory: MotionRuntimeDebugAdapterFactory): boolean {
  if (typeof factory !== "function") return false;
  if (motionRuntimeDebugAdapterFactory === factory) return true;
  motionRuntimeDebugAdapterFactory = factory;
  for (const installAdapter of motionRuntimeDebugAdapterInstallers) installAdapter(factory);
  return true;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

function clamp01(value: unknown): number {
  return clamp(readNumber(value), 0, 1);
}

function linear(t: number): number {
  return t;
}

function normalizeInterrupt(policy: MotionInterruptPolicy | undefined): MotionInterruptPolicy {
  if (policy === "blend" || policy === "ignore" || policy === "replace" || policy === "retarget") return policy;
  return "auto";
}

function normalizeMilestones(milestones: readonly MotionMilestone[] | undefined): RuntimeMotionMilestone[] {
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

export const easing: Readonly<Record<string, MotionEase>> = Object.freeze({
  linear,
  "power1.out": (t) => 1 - (1 - t) ** 2,
  "power2.in": (t) => t * t * t,
  "power2.out": (t) => 1 - (1 - t) ** 3,
  "power2.inOut": (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  "power3.out": (t) => 1 - (1 - t) ** 4,
  "sine.inOut": (t) => -(Math.cos(Math.PI * t) - 1) / 2,
});

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): MotionEase {
  // Newton iteration against x(t), with a bisection fallback for flat curves.
  const sample = (a: number, b: number, c: number, t: number): number => ((a * t + b) * t + c) * t;
  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  return (x: number): number => {
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

export function resolveEase(ease: MotionEaseInput | undefined): MotionEase {
  if (typeof ease === "function") return ease;
  if (typeof ease === "string" && easing[ease]) return easing[ease];
  return linear;
}

export function spring(config: Readonly<MotionSpringConfig> = {}): MotionSpringDriver {
  return Object.freeze({ config, type: "spring" });
}

export function tween(options: MotionTweenDriverOptions = {}): MotionTweenDriver {
  return Object.freeze({ options, type: "tween" });
}

export function progressDriver(options: MotionProgressDriverOptions = {}): MotionProgressDriver {
  return { options: { progress: 0, ...options }, type: "progress" };
}

function isMotionTarget(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function assertMotionTarget(value: unknown): asserts value is object {
  if (!isMotionTarget(value)) throw new TypeError("Motion target must be a non-null object.");
}

function readTargetNumber(target: object, prop: string, fallback = 0): number {
  return readNumber(Reflect.get(target, prop), fallback);
}

function writeTargetNumber(target: object, prop: string, value: number): void {
  if (!Reflect.set(target, prop, value)) {
    throw new TypeError(`Unable to write motion target property "${prop}".`);
  }
}

function isDestroyedTarget(target: object): boolean {
  return Boolean(Reflect.get(target, "destroyed"));
}

function readTargetChildren(target: object): object[] {
  const children = Reflect.get(target, "children");
  if (!Array.isArray(children)) return [];
  return children.filter(isMotionTarget);
}

export function createMotionRuntime(options: MotionRuntimeOptions = {}): MotionRuntime {
  const scheduler = options.scheduler || globalThis;
  const autoStart = options.autoStart !== false;
  const maxDeltaSeconds = Math.max(0.001, readNumber(options.maxDeltaSeconds, DEFAULT_MAX_DELTA_SECONDS));
  const stepSeconds = Math.max(0.001, readNumber(options.stepSeconds, DEFAULT_STEP_SECONDS));

  const targetChannels = new WeakMap<object, Map<string, RuntimeMotionChannel>>();
  const activeAnimations = new Set<RuntimeMotionAnimationState>();
  const afterFrameCallbacks = new Set<() => void>();
  const dirtyChannels = new Set<RuntimeMotionChannel>();
  const pendingUpdateAnimations = new Set<RuntimeMotionAnimationState>();
  const targetIds = new WeakMap<object, number>();
  let debugAdapter: MotionRuntimeDebugAdapter = motionRuntimeDebugAdapterFactory();
  const observers = new Set<MotionDebugObserver | MotionDebugObserverListener>();
  const renderSignalObservers = new Set<MotionRenderSignalListener | MotionRenderSignalObserver>();
  const activeAnimationScratch: RuntimeMotionAnimationState[] = [];
  const afterFrameScratch: Array<() => void> = [];
  const dirtyChannelScratch: RuntimeMotionChannel[] = [];
  const pendingUpdateScratch: RuntimeMotionAnimationState[] = [];
  let frameHandle: number | null = null;
  let frameCount = 0;
  let frameAfterFrameFlushes = 0;
  let lastFrameTime = 0;
  let nextTargetId = 1;
  let runtimeTimeMs = 0;
  let autoTickerSuspended = 0;
  let writesLastFrame = 0;

  function installDebugAdapter(factory: MotionRuntimeDebugAdapterFactory = motionRuntimeDebugAdapterFactory): boolean {
    if (typeof factory !== "function") return false;
    const previousConfig = debugAdapter.getConfig?.() || {};
    const nextAdapter = factory();
    nextAdapter.configureDebug?.(previousConfig);
    debugAdapter = nextAdapter;
    return true;
  }

  motionRuntimeDebugAdapterInstallers.add(installDebugAdapter);

  function getTargetId(target: object): number {
    let id = targetIds.get(target);
    if (!id) {
      id = nextTargetId;
      nextTargetId += 1;
      targetIds.set(target, id);
    }
    return id;
  }

  function emitMotionEvent(type: string, payload: Omit<MotionDebugEvent, "type"> = {}): void {
    if (!debugAdapter.isEnabled()) return;
    const event = { ...payload, type };
    debugAdapter.observe(event);
    for (const observer of observers) {
      if (typeof observer === "function") observer(event);
      else observer?.handleEvent?.(event);
    }
  }

  function addObserver(observer: MotionDebugObserver | MotionDebugObserverListener): () => void {
    if (!observer || (typeof observer !== "function" && typeof observer.handleEvent !== "function")) {
      throw new TypeError("Motion debug observer must be a function or implement handleEvent(event).");
    }
    observers.add(observer);
    return () => {
      observers.delete(observer);
    };
  }

  function onRenderSignal(observer: MotionRenderSignalListener | MotionRenderSignalObserver): () => void {
    if (!observer || (typeof observer !== "function" && typeof observer.handleRenderSignal !== "function")) {
      throw new TypeError(
        "Motion render-signal observer must be a function or implement handleRenderSignal(signal).",
      );
    }
    renderSignalObservers.add(observer);
    return () => {
      renderSignalObservers.delete(observer);
    };
  }

  function emitRenderSignal(reason: MotionRenderSignalReason = "motion", options: Partial<MotionRenderSignal> = {}): void {
    if (!renderSignalObservers.size) return;
    const activeAnimationCount = Math.max(0, Math.floor(readNumber(options.activeAnimationCount, activeAnimations.size)));
    const afterFrameFlushes = Math.max(0, Math.floor(readNumber(options.afterFrameFlushes, frameAfterFrameFlushes)));
    const frame = Math.max(0, Math.floor(readNumber(options.frame, frameCount)));
    const timeMs = readNumber(options.timeMs, runtimeTimeMs);
    const writes = Math.max(0, Math.floor(readNumber(options.writesLastFrame, writesLastFrame)));
    const signal: MotionRenderSignal = Object.freeze({
      activeAnimationCount,
      afterFrameFlushes,
      frame,
      reason,
      timeMs,
      writesLastFrame: writes,
    });
    for (const observer of renderSignalObservers) {
      if (typeof observer === "function") observer(signal);
      else observer.handleRenderSignal(signal);
    }
  }

  function rememberTarget(target: object, metadata: MotionDebugMetadata | null = null): number {
    const targetId = getTargetId(target);
    emitMotionEvent("targetMetadata", {
      metadata,
      record: debugAdapter.makeTargetMetadataRecord(targetId, metadata),
      target,
      targetId,
    });
    return targetId;
  }

  function makeDebugAnimationRecord(
    animation: RuntimeMotionAnimationState,
    options: { emitTargetMetadata?: boolean } = {},
  ): MotionDebugRecord {
    const targetId = options.emitTargetMetadata === false
      ? getTargetId(animation.target)
      : rememberTarget(animation.target);
    return {
      delay: animation.delay,
      blendDuration: animation.blendFrom == null ? 0 : animation.blendDuration,
      blendProgress: animation.blendFrom == null || animation.blendDuration <= 0
        ? 1
        : clamp(readNumber(animation.blendElapsed) / animation.blendDuration, 0, 1),
      driver: animation.driver?.type || "spring",
      from: animation.from,
      interrupt: animation.interrupt,
      lane: animation.lane,
      laneKey: animation.laneKey,
      milestones: animation.milestones.filter((milestone) => !milestone.fired).map((milestone) => milestone.progress),
      prop: animation.prop,
      released: animation.released,
      targetId,
      to: animation.to,
      value: animation.value,
      velocity: animation.velocity,
    };
  }

  function makeDebugEvent(
    type: string,
    animation: RuntimeMotionAnimationState,
    extra: { reason?: string; value?: number } = {},
  ): MotionDebugRecord {
    const record = makeDebugAnimationRecord(animation);
    const event = {
      frame: frameCount,
      timeMs: runtimeTimeMs,
      type,
      ...record,
    };
    if (extra.reason != null) event.reason = String(extra.reason);
    if (extra.value != null) event.value = readNumber(extra.value);
    return event;
  }

  function recordDebugEvent(
    type: string,
    animation: RuntimeMotionAnimationState,
    extra?: { reason?: string; value?: number },
  ): void {
    if (!debugAdapter.isEnabled()) return;
    const event = makeDebugEvent(type, animation, extra);
    emitMotionEvent(type, {
      active: activeAnimations.has(animation),
      frame: event.frame,
      record: event,
      timeMs: event.timeMs,
    });
  }

  function recordCoordinationEvent(payload: MotionDebugMetadata = {}): void {
    if (!debugAdapter.isEnabled()) return;
    const sanitized = sanitizeDebugMetadata(payload);
    const action = String(sanitized.action || "coordination");
    const event = {
      ...sanitized,
      action,
      category: "coordination",
      domain: sanitized.domain || "coordination",
      driver: "coordination",
      frame: frameCount,
      lane: "coordination",
      laneKey: action,
      layer: sanitized.layer || "handoff",
      phase: sanitized.phase || null,
      prop: sanitized.prop || "handoff",
      sourceLabel: sanitized.sourceLabel || "folder.handoff.coordination",
      targetId: null,
      targetKind: sanitized.targetKind || "FolderHandoff",
      targetLabel: sanitized.targetLabel || (sanitized.folderId ? `Folder handoff ${sanitized.folderId}` : "Folder handoff"),
      timeMs: runtimeTimeMs,
      to: readNumber(sanitized.to, 0),
      type: "coordination",
      value: readNumber(sanitized.value, 0),
      velocity: readNumber(sanitized.velocity, 0),
    };
    emitMotionEvent("coordination", {
      frame: event.frame,
      record: event,
      timeMs: event.timeMs,
    });
  }

  function recordMotionLifecycle(
    type: MotionRenderSignalReason,
    animation: RuntimeMotionAnimationState,
    extra?: { reason?: string; value?: number },
  ): void {
    emitRenderSignal(type);
    recordDebugEvent(type, animation, extra);
  }

  function makeDebugLaneRecord(
    animation: RuntimeMotionAnimationState,
    options: { emitTargetMetadata?: boolean } = {},
  ): MotionDebugLaneRecord {
    const record: MotionDebugLaneRecord = {
      driver: animation.driver?.type || "spring",
      from: animation.from,
      interrupt: animation.interrupt,
      lane: animation.lane,
      laneKey: animation.laneKey,
      output: getAnimationOutputValue(animation),
      released: animation.released,
      to: animation.to,
      value: animation.value,
      velocity: animation.velocity,
    };
    const targetId = options.emitTargetMetadata === false
      ? getTargetId(animation.target)
      : rememberTarget(animation.target);
    record.targetId = targetId;
    return record;
  }

  function makeChannelBreakdown(
    channel: RuntimeMotionChannel,
    options: { emitTargetMetadata?: boolean } = {},
  ): Record<string, unknown> {
    const baseLanes = Array.from(channel.base.values()).map((animation) => makeDebugLaneRecord(animation, options));
    const additiveLanes = Array.from(channel.additive.values()).map((animation) => makeDebugLaneRecord(animation, options));
    const factorLanes = Array.from(channel.factor.values()).map((animation) => makeDebugLaneRecord(animation, options));
    const additiveValue = additiveLanes.reduce((total, lane) => total + lane.output, 0);
    const factorValue = factorLanes.reduce((total, lane) => total * lane.output, 1);
    const unclampedValue = (channel.baseValue + additiveValue) * factorValue;
    const composed: Record<string, unknown> = {
      formula: "(base + additive) * factor",
      unclampedValue,
      value: channel.value,
    };
    const breakdown = {
      additive: {
        lanes: additiveLanes,
        value: additiveValue,
      },
      base: {
        activeKey: channel.activeBaseKey,
        lanes: baseLanes,
        value: channel.baseValue,
      },
      composed,
      factor: {
        lanes: factorLanes,
        value: factorValue,
      },
    };
    if (channel.clamp) breakdown.composed.clamp = { ...channel.clamp };
    return breakdown;
  }

  function makeDebugChannelRecords(
    options: { emitTargetMetadata?: boolean } = {},
  ): MotionDebugChannelRecord[] {
    const channels = new Map<string, MotionDebugChannelRecord>();
    for (const animation of activeAnimations) {
      const targetId = options.emitTargetMetadata === false
        ? getTargetId(animation.target)
        : rememberTarget(animation.target);
      const key = `${targetId ?? "unknown"}:${animation.prop}`;
      let record = channels.get(key);
      if (!record) {
        const breakdown = makeChannelBreakdown(animation.channel, options);
        record = {
          activeBaseKey: animation.channel.activeBaseKey,
          ...breakdown,
          baseValue: animation.channel.baseValue,
          lanes: { additive: [], base: [], factor: [] },
          prop: animation.prop,
          targetId,
          value: animation.channel.value,
        };
        channels.set(key, record);
      }
      record.lanes[animation.lane].push(animation.laneKey);
    }
    return Array.from(channels.values());
  }

  function recordDebugSample(): void {
    emitRenderSignal("frame", {
      activeAnimationCount: activeAnimations.size,
      afterFrameFlushes: frameAfterFrameFlushes,
      frame: frameCount,
      timeMs: runtimeTimeMs,
      writesLastFrame,
    });
    if (!debugAdapter.isEnabled()) return;
    emitMotionEvent("frame", {
      activeAnimationCount: activeAnimations.size,
      afterFrameFlushes: frameAfterFrameFlushes,
      frame: frameCount,
      timeMs: runtimeTimeMs,
      writesLastFrame,
    });
    if (!debugAdapter.shouldBuildSample(runtimeTimeMs)) return;
    const sampleRecordOptions = { emitTargetMetadata: false };
    const animations = Array.from(activeAnimations)
      .map((animation) => makeDebugAnimationRecord(animation, sampleRecordOptions));
    emitMotionEvent("sample", {
      afterFrameFlushes: frameAfterFrameFlushes,
      animations,
      channels: makeDebugChannelRecords(sampleRecordOptions),
      frame: frameCount,
      timeMs: runtimeTimeMs,
      writesLastFrame,
    });
  }

  function clearDebugHistory(): void {
    debugAdapter.clearHistory();
  }

  function configureDebug(config: MotionDebugConfigPatch = {}): MotionDebugConfig {
    const hasPatch = Boolean(config && typeof config === "object" && Object.keys(config).length);
    const nextConfig = debugAdapter.configureDebug(config);
    if (hasPatch) {
      emitRenderSignal("debug-config");
      emitMotionEvent("debugConfig", { config: nextConfig });
    }
    return nextConfig;
  }

  function describeTarget(target: object, metadata: MotionDebugMetadata = {}): MotionDebugRecord {
    const targetId = getTargetId(target);
    const record = { targetId, ...sanitizeDebugMetadata(metadata) };
    emitMotionEvent("targetMetadata", { metadata, record, target, targetId });
    return { ...record };
  }

  function resolveDebugTarget(targetId: number, options: { bounds?: boolean } = {}): object | null {
    return debugAdapter.resolveTarget(targetId, options);
  }

  function getTargetMap(target: object, create = false): Map<string, RuntimeMotionChannel> | undefined {
    let targetMap = targetChannels.get(target);
    if (!targetMap && create) {
      targetMap = new Map();
      targetChannels.set(target, targetMap);
    }
    return targetMap;
  }

  function getChannel(target: object, prop: string, create = false): RuntimeMotionChannel | null {
    const targetMap = getTargetMap(target, create);
    if (!targetMap) return null;
    let channel = targetMap.get(prop);
    if (!channel && create) {
      channel = {
        additive: new Map(),
        activeBaseKey: null,
        base: new Map(),
        baseValue: readTargetNumber(target, prop),
        factor: new Map(),
        prop,
        target,
        value: readTargetNumber(target, prop),
      };
      targetMap.set(prop, channel);
    }
    return channel ?? null;
  }

  function cleanupChannel(channel: RuntimeMotionChannel | null): void {
    if (!channel || channel.base.size || channel.additive.size || channel.factor.size) return;
    const targetMap = targetChannels.get(channel.target);
    if (targetMap?.get(channel.prop) === channel) {
      targetMap.delete(channel.prop);
      if (!targetMap.size) targetChannels.delete(channel.target);
    }
  }

  function getAnimationOutputValue(animation: RuntimeMotionAnimationState): number {
    if (!animation) return 0;
    const duration = Math.max(0, readNumber(animation.blendDuration));
    if (animation.blendFrom == null || duration <= 0) return animation.value;
    const progress = clamp(readNumber(animation.blendElapsed) / duration, 0, 1);
    if (progress >= 1) return animation.value;
    const eased = resolveEase(animation.blendEase)(progress);
    return animation.blendFrom + (animation.value - animation.blendFrom) * eased;
  }

  function advanceBlend(animation: RuntimeMotionAnimationState, deltaSeconds: number): void {
    if (animation.blendFrom == null) return;
    animation.blendElapsed = Math.min(animation.blendDuration, readNumber(animation.blendElapsed) + deltaSeconds);
  }

  function composeChannel(channel: RuntimeMotionChannel): number {
    dirtyChannels.delete(channel);
    if (isDestroyedTarget(channel.target)) {
      cleanupChannel(channel);
      return channel.value;
    }
    let value = channel.baseValue;
    for (const animation of channel.additive.values()) value += getAnimationOutputValue(animation);
    for (const animation of channel.factor.values()) value *= getAnimationOutputValue(animation);
    if (channel.clamp) value = clamp(value, channel.clamp.min, channel.clamp.max);
    channel.value = value;
    writeTargetNumber(channel.target, channel.prop, value);
    writesLastFrame += 1;
    return value;
  }

  function markChannelDirty(channel: RuntimeMotionChannel): void {
    dirtyChannels.add(channel);
  }

  function queueAnimationUpdate(animation: RuntimeMotionAnimationState): void {
    if (animation.onUpdate) pendingUpdateAnimations.add(animation);
  }

  function setChannelLane(channel: RuntimeMotionChannel, animation: RuntimeMotionAnimationState): void {
    if (animation.lane === "base") {
      channel.base.set(animation.laneKey, animation);
      channel.activeBaseKey = animation.laneKey;
      return;
    }
    const collection = animation.lane === "factor" ? channel.factor : channel.additive;
    collection.set(animation.laneKey, animation);
  }

  function chooseFallbackBase(channel: RuntimeMotionChannel): RuntimeMotionAnimationState | null {
    let fallback: RuntimeMotionAnimationState | null = null;
    for (const animation of channel.base.values()) fallback = animation;
    return fallback;
  }

  function clearChannelLane(animation: RuntimeMotionAnimationState, options: { compose?: boolean } = {}): void {
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
    if (options.compose !== false) composeChannel(channel);
    cleanupChannel(channel);
  }

  function addActiveAnimation(animation: RuntimeMotionAnimationState): void {
    activeAnimations.add(animation);
    recordMotionLifecycle("start", animation);
    ensureTicker();
  }

  function removeActiveAnimation(animation: RuntimeMotionAnimationState): void {
    activeAnimations.delete(animation);
  }

  function cancelAnimation(animation: RuntimeMotionAnimationState, reason = "cancel"): void {
    if (animation.done) return;
    animation.done = true;
    removeActiveAnimation(animation);
    pendingUpdateAnimations.delete(animation);
    clearChannelLane(animation);
    recordMotionLifecycle("cancel", animation, { reason });
    animation.onCancel?.(reason);
  }

  function completeAnimation(animation: RuntimeMotionAnimationState, finalValue = animation.to): void {
    if (animation.done) return;
    animation.done = true;
    pendingUpdateAnimations.delete(animation);
    animation.value = finalValue;
    animation.blendElapsed = animation.blendDuration;
    if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
    fireMilestones(animation, 1);
    removeActiveAnimation(animation);
    clearChannelLane(animation);
    const shouldFireArrive = !animation.arrived;
    if (shouldFireArrive) recordMotionLifecycle("arrive", animation, { value: finalValue });
    recordMotionLifecycle("complete", animation, { value: finalValue });
    animation.onUpdate?.(finalValue);
    if (shouldFireArrive) {
      animation.arrived = true;
      animation.onArrive?.(finalValue);
    }
    animation.onComplete?.();
  }

  function scheduleFrame(): void {
    if (
      !autoStart ||
      autoTickerSuspended > 0 ||
      frameHandle != null ||
      typeof scheduler.requestAnimationFrame !== "function"
    ) return;
    frameHandle = scheduler.requestAnimationFrame((time: number) => {
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

  function ensureTicker(): void {
    if (activeAnimations.size || afterFrameCallbacks.size) scheduleFrame();
  }

  function stopTicker(): void {
    if (frameHandle == null || typeof scheduler.cancelAnimationFrame !== "function") return;
    scheduler.cancelAnimationFrame(frameHandle);
    frameHandle = null;
    lastFrameTime = 0;
  }

  function makeAnimation(
    target: object,
    prop: string,
    to: number,
    animationOptions: MotionAnimationOptions = {},
  ): RuntimeMotionAnimationState {
    const lane = animationOptions.lane || "base";
    const channel = getChannel(target, prop, true);
    if (!channel) throw new Error("Motion channel creation failed.");
    const current = lane === "base"
      ? readTargetNumber(target, prop, channel.baseValue)
      : lane === "factor"
        ? 1
        : 0;
    const from = readNumber(animationOptions.from, current);
    const driver = animationOptions.driver || spring();
    const animation: RuntimeMotionAnimationState = {
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

  function isEmptySpringAnimation(animation: RuntimeMotionAnimationState): boolean {
    if (animation.driver?.type !== "spring") return false;
    if (animation.delay > 0) return false;
    if (animation.onUpdate || animation.milestones.length) return false;
    const current = readTargetNumber(animation.target, animation.prop, animation.from);
    return Math.abs(animation.from - animation.to) <= NEUTRAL_EPSILON &&
      Math.abs(current - animation.to) <= NEUTRAL_EPSILON &&
      Math.abs(animation.velocity) <= NEUTRAL_EPSILON;
  }

  function finishEmptySpringAnimation(animation: RuntimeMotionAnimationState): null {
    animation.done = true;
    animation.value = animation.to;
    animation.arrived = true;
    cleanupChannel(animation.channel);
    recordMotionLifecycle("snap", animation, { value: animation.to });
    animation.onArrive?.(animation.to);
    animation.onComplete?.();
    return null;
  }

  function replaceExistingLane(
    channel: RuntimeMotionChannel,
    animation: RuntimeMotionAnimationState,
  ): RuntimeMotionAnimationState | null {
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
      recordMotionLifecycle("retarget", existing, { value: existing.value });
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
      recordMotionLifecycle("retarget", existing, { value: existing.value });
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

  function animate(
    target: object,
    prop: string,
    to: number,
    animationOptions: MotionAnimationOptions = {},
  ): MotionAnimationControl | null {
    assertMotionTarget(target);
    if (!prop) throw new TypeError("Motion property name must be non-empty.");
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
      recordMotionLifecycle("snap", animation, { value: animation.to });
      animation.onUpdate?.(animation.to);
      animation.onArrive?.(animation.to);
      animation.onComplete?.();
      return null;
    }
    if (!existingLaneAnimation && isEmptySpringAnimation(animation)) {
      return finishEmptySpringAnimation(animation);
    }

    const retargeted = replaceExistingLane(animation.channel, animation);
    if (retargeted) return makeControl(retargeted);

    setChannelLane(animation.channel, animation);
    if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
    composeChannel(animation.channel);
    addActiveAnimation(animation);
    return makeControl(animation);
  }

  function getLaneAnimation(
    channel: RuntimeMotionChannel,
    animation: RuntimeMotionAnimationState,
  ): RuntimeMotionAnimationState | undefined {
    if (animation.lane === "base") return channel.base.get(animation.laneKey);
    if (animation.lane === "factor") return channel.factor.get(animation.laneKey);
    return channel.additive.get(animation.laneKey);
  }

  function stepSpring(animation: RuntimeMotionAnimationState, dt: number): void {
    if (animation.driver.type !== "spring") throw new Error("Spring step received a non-spring driver.");
    const config = animation.driver.config;
    const stiffness = Math.max(0, readNumber(config.stiffness, 0));
    const damping = Math.max(0, readNumber(config.damping, 0));
    const mass = Math.max(0.0001, readNumber(config.mass, 1));
    const force = -stiffness * (animation.value - animation.to);
    const dampingForce = -damping * animation.velocity;
    const acceleration = (force + dampingForce) / mass;
    animation.velocity += acceleration * dt;
    animation.value += animation.velocity * dt;
  }

  function tickSpring(animation: RuntimeMotionAnimationState, deltaSeconds: number): void {
    if (animation.driver.type !== "spring") throw new Error("Spring tick received a non-spring driver.");
    const config = animation.driver.config;
    let remaining = deltaSeconds;
    while (remaining > 0) {
      const dt = Math.min(stepSeconds, remaining);
      stepSpring(animation, dt);
      remaining -= dt;
    }

    const delta = Math.abs(animation.to - animation.value);
    const speed = Math.abs(animation.velocity);
    fireMilestones(animation, getDistanceProgress(animation));
    const arriveDelta = Math.max(0, readNumber(config.arriveDelta, DEFAULT_ARRIVE_DELTA));
    if (!animation.arrived && delta <= arriveDelta) {
      animation.arrived = true;
      recordMotionLifecycle("arrive", animation, { value: animation.value });
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

  function tickTween(animation: RuntimeMotionAnimationState, deltaSeconds: number): void {
    if (animation.driver.type !== "tween") throw new Error("Tween tick received a non-tween driver.");
    const options = animation.driver.options;
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
      recordMotionLifecycle("arrive", animation, { value: animation.value });
      animation.onArrive?.(animation.value);
    }
    writeAnimation(animation);
    if (!repeatsForever && animation.elapsed >= totalDuration) completeAnimation(animation, animation.value);
  }

  function tickAnimation(animation: RuntimeMotionAnimationState, deltaSeconds: number): void {
    if (animation.done) return;
    if (isDestroyedTarget(animation.target)) {
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
    else if (animation.driver.type === "progress") tickProgress(animation);
    else tickSpring(animation, deltaSeconds);
  }

  function tickProgress(animation: RuntimeMotionAnimationState): void {
    if (animation.driver.type !== "progress") throw new Error("Progress tick received a non-progress driver.");
    const options = animation.driver.options;
    const progress = clamp(readNumber(options.progress, animation.progress ?? 0), 0, 1);
    animation.progress = progress;
    animation.value = animation.from + (animation.to - animation.from) * resolveEase(options.ease)(progress);
    fireMilestones(animation, progress);
    if (!animation.arrived && progress >= 1) {
      animation.arrived = true;
      recordMotionLifecycle("arrive", animation, { value: animation.value });
      animation.onArrive?.(animation.value);
    }
    writeAnimation(animation);
    if (options.completeAtEnd !== false && progress >= 1) completeAnimation(animation, animation.value);
  }

  function writeAnimation(animation: RuntimeMotionAnimationState): void {
    if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
    markChannelDirty(animation.channel);
    queueAnimationUpdate(animation);
  }

  function getDistanceProgress(animation: RuntimeMotionAnimationState): number {
    const distance = animation.to - animation.from;
    if (Math.abs(distance) <= NEUTRAL_EPSILON) return 1;
    return clamp((animation.value - animation.from) / distance, 0, 1);
  }

  function fireMilestones(animation: RuntimeMotionAnimationState, progress: number): void {
    if (!animation.milestones.length) return;
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

  function flushDirtyChannels(): void {
    if (!dirtyChannels.size) return;
    dirtyChannelScratch.length = 0;
    for (const channel of dirtyChannels) dirtyChannelScratch.push(channel);
    dirtyChannels.clear();
    for (const channel of dirtyChannelScratch) composeChannel(channel);
    dirtyChannelScratch.length = 0;
  }

  function flushPendingUpdates(): void {
    if (!pendingUpdateAnimations.size) return;
    pendingUpdateScratch.length = 0;
    for (const animation of pendingUpdateAnimations) pendingUpdateScratch.push(animation);
    pendingUpdateAnimations.clear();
    for (const animation of pendingUpdateScratch) {
      if (!animation.done) animation.onUpdate?.(animation.value);
    }
    pendingUpdateScratch.length = 0;
  }

  function flushAfterFrame(): void {
    if (!afterFrameCallbacks.size) return;
    frameAfterFrameFlushes += 1;
    afterFrameScratch.length = 0;
    for (const callback of afterFrameCallbacks) afterFrameScratch.push(callback);
    afterFrameCallbacks.clear();
    for (const callback of afterFrameScratch) callback();
    afterFrameScratch.length = 0;
  }

  function step(deltaSeconds = 0): void {
    const elapsed = Math.min(maxDeltaSeconds, Math.max(0, readNumber(deltaSeconds))) * debugAdapter.getConfig().timeScale;
    frameCount += 1;
    frameAfterFrameFlushes = 0;
    writesLastFrame = 0;
    runtimeTimeMs += elapsed * 1000;
    if (elapsed > 0) {
      activeAnimationScratch.length = 0;
      for (const animation of activeAnimations) activeAnimationScratch.push(animation);
      for (const animation of activeAnimationScratch) tickAnimation(animation, elapsed);
      activeAnimationScratch.length = 0;
    }
    flushDirtyChannels();
    flushPendingUpdates();
    flushAfterFrame();
    recordDebugSample();
    if (!activeAnimations.size && !afterFrameCallbacks.size) stopTicker();
  }

  function releaseAnimation(animation: RuntimeMotionAnimationState): void {
    if (animation.done || animation.released) return;
    animation.released = true;
    animation.onArrive = null;
    animation.onCancel = null;
    animation.onComplete = null;
    animation.onUpdate = null;
    animation.milestones = [];
    pendingUpdateAnimations.delete(animation);
    recordMotionLifecycle("release", animation);
    if (animation.started || animation.delay <= 0) return;
    animation.done = true;
    removeActiveAnimation(animation);
    clearChannelLane(animation);
  }

  function afterFrame(callback: () => void): void {
    if (typeof callback !== "function") {
      throw new TypeError("Motion after-frame callback must be a function.");
    }
    afterFrameCallbacks.add(callback);
    if (autoTickerSuspended > 0) {
      emitRenderSignal("frame-request", {
        activeAnimationCount: activeAnimations.size,
        frame: frameCount,
        timeMs: runtimeTimeMs,
      });
    }
    ensureTicker();
  }

  function hasActiveWork(): boolean {
    return Boolean(activeAnimations.size || afterFrameCallbacks.size);
  }

  function suspendAutoTicker(): void {
    autoTickerSuspended += 1;
    stopTicker();
  }

  function resumeAutoTicker(): void {
    autoTickerSuspended = Math.max(0, autoTickerSuspended - 1);
    ensureTicker();
  }

  function stop(target: object, prop: string, stopOptions: MotionStopOptions = {}): boolean {
    assertMotionTarget(target);
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

  function cancelTarget(target: object, cancelOptions: MotionCancelTargetOptions = {}): boolean {
    assertMotionTarget(target);
    const targetMap = getTargetMap(target);
    let stopped = false;
    if (targetMap) {
      for (const prop of Array.from(targetMap.keys())) stopped = stop(target, prop, cancelOptions) || stopped;
    }
    if (!cancelOptions.recursive) return stopped;
    for (const child of readTargetChildren(target)) stopped = cancelTarget(child, cancelOptions) || stopped;
    return stopped;
  }

  function makeControl(animation: RuntimeMotionAnimationState): MotionAnimationControl {
    let controlReleased = false;
    const flushImmediateProgressWrite = (): void => {
      if (dirtyChannels.has(animation.channel)) {
        dirtyChannels.delete(animation.channel);
        composeChannel(animation.channel);
      }
      if (pendingUpdateAnimations.has(animation)) {
        pendingUpdateAnimations.delete(animation);
        animation.onUpdate?.(animation.value);
      }
    };

    const control: MotionAnimationControl = {
      cancel: (reason = "cancel") => {
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
      settle(settleOptions: MotionSettleOptions = {}) {
        if (controlReleased || animation.done || animation.driver?.type !== "progress") return;
        const options = settleOptions;
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
        recordMotionLifecycle("settle", animation, { value: animation.value });
      },
      get state() {
        return animation;
      },
      setProgress(progress: number) {
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

  function reset(): void {
    for (const animation of activeAnimations) cancelAnimation(animation, "reset");
    afterFrameCallbacks.clear();
    dirtyChannels.clear();
    pendingUpdateAnimations.clear();
    stopTicker();
    debugAdapter.reset();
    clearDebugHistory();
    frameCount = 0;
    frameAfterFrameFlushes = 0;
    runtimeTimeMs = 0;
    autoTickerSuspended = 0;
    writesLastFrame = 0;
  }

  function debugSnapshot(snapshotOptions: MotionDebugSnapshotOptions = {}): MotionDebugSnapshot {
    return debugAdapter.makeSnapshot(snapshotOptions, {
      animations: Array.from(activeAnimations).map((animation) => makeDebugAnimationRecord(animation)),
      channels: snapshotOptions.includeChannels ? makeDebugChannelRecords() : undefined,
      runtime: {
        activeAnimationCount: activeAnimations.size,
        frames: frameCount,
        timeMs: runtimeTimeMs,
      },
    });
  }

  function debugReport(reportOptions: MotionDebugReportOptions = {}): MotionDebugReport {
    return debugAdapter.makeReport(reportOptions, {
      animations: Array.from(activeAnimations).map((animation) => makeDebugAnimationRecord(animation)),
      channels: reportOptions.includeChannels ? makeDebugChannelRecords() : undefined,
      runtime: {
        activeAnimationCount: activeAnimations.size,
        frames: frameCount,
        timeMs: runtimeTimeMs,
      },
    });
  }

  const runtime = {
    addObserver,
    afterFrame,
    animate,
    cancelTarget,
    clearDebugHistory,
    configureDebug,
    debugReport,
    debugSnapshot,
    describeTarget,
    flushAfterFrameForTests: flushAfterFrame,
    getChannel: (target, prop) => getChannel(target, prop),
    get debug() {
      return debugAdapter.debug;
    },
    hasActiveWork,
    onRenderSignal,
    recordCoordinationEvent,
    reset,
    resolveDebugTarget,
    resumeAutoTicker,
    step,
    stop,
    suspendAutoTicker,
  } satisfies MotionRuntime & MotionRuntimeTestControls;
  return runtime;
}

export const motionRuntime = createMotionRuntime();

if (import.meta.hot) {
  import.meta.hot.dispose(() => motionRuntime.reset());
  reloadOnPixiHotUpdate(import.meta.hot);
}
