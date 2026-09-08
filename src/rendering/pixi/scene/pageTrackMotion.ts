import type { ScenePageTrackScrub } from "../../sceneFrame.js";
import { motion } from "../animation/motionTween.js";
import type { MotionControl } from "../animation/motionTween.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import type {
  MotionDebugMetadata,
  MotionEaseInput,
  MotionRuntime,
  MotionSettleOptions,
  MotionSpringConfig,
} from "../animation/motionRuntime.js";
import { motionSprings } from "../animation/motionPresets.js";
import { getPageSwipeSpeed } from "../../pageSwipePreview.js";

const PAGE_TRACK_REPLACE_REASON = "page-track-replace";
const PAGE_TRACK_SNAP_REASON = "page-track-snap";
const PAGE_TRACK_TARGET_EPSILON = 0.5;

/** Bound release speed by the distance still visible on this page, not raw input travel.
 * The slow pole of a non-oscillating spring gives a monotonic approach to its target.
 * This is page-local: icon layout, drag and folder springs retain their own behavior.
 */
export function pageSettleVelocity(progress:number,target:number,velocity:number,config:Readonly<MotionSpringConfig>):number{
  const remaining=target-progress;
  if(Math.abs(remaining)<0.000001)return 0;
  const mass=Math.max(0.0001,config.mass??1),stiffness=Math.max(0,config.stiffness??190);
  if(stiffness===0)return 0;
  const damping=Math.max(config.damping??28,2*Math.sqrt(stiffness*mass));
  const rate=(2*stiffness)/(damping+Math.sqrt(Math.max(0,damping*damping-4*mass*stiffness)));
  return Math.sign(remaining)*Math.min(Math.max(0,Math.sign(remaining)*velocity),Math.abs(remaining)*rate);
}

type PageTrackMotionScrubInput = Readonly<
  Pick<ScenePageTrackScrub, "fromIndex" | "progress" | "toIndex"> &
  Partial<Omit<ScenePageTrackScrub, "fromIndex" | "progress" | "toIndex">> & {
    ease?: MotionEaseInput;
    gestureToken?: unknown;
    grab?: boolean;
    grabToken?: unknown;
    midpoint?: number;
    phase?: string;
    progressDelta?: number;
    settleProgress?: number;
    settling?: boolean;
    spring?: Readonly<MotionSpringConfig>;
    token?: unknown;
    valueVelocity?: number;
    velocityThreshold?: number;
  }
>;

type NormalizedPageTrackMotionScrub = Readonly<
  Omit<PageTrackMotionScrubInput, "fromIndex" | "grab" | "grabToken" | "progress" | "progressDelta" | "toIndex"> & {
    fromIndex: number;
    fromX: number;
    grab: boolean;
    grabToken: unknown;
    progress: number;
    progressDelta: number;
    toIndex: number;
    toX: number;
  }
>;

interface PageTrackTarget {
  x: number;
}

export type PageTrackMotionMode = "scrub" | "settle" | "spring" | null;

export interface PageTrackMotionState {
  swipeSample:{time:number;target:number;key:string;limited:boolean;rate:number}|null;
  control: MotionControl | null;
  grabProgressOffset: number;
  grabToken: unknown;
  key: string | null;
  mode: PageTrackMotionMode;
  settleToken: unknown;
  targetX: number | null;
}

interface PageTrackMotionOptions {
  debugMetadata?: MotionDebugMetadata | null | undefined;
  onFrame?: (() => void) | undefined;
  pageIndex?: number | undefined;
  pageSpan?: number | undefined;
  runtime?: MotionRuntime | undefined;
  scrub?: PageTrackMotionScrubInput | null | undefined;
  snap?: boolean | undefined;
  sourceLabel?: string | undefined;
  springConfig?: Readonly<MotionSpringConfig> | undefined;
}

export type PageTrackMotionResult =
  | Readonly<{ mode: "none"; targetX: number }>
  | Readonly<{
    control: MotionControl | null;
    mode: Exclude<PageTrackMotionMode, null>;
    targetX: number;
  }>;

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, readNumber(value, 0)));
}

function readPageSpan(value: unknown): number {
  return Math.max(1, readNumber(value, 1));
}

function isSameTrackTarget(previousX: unknown, nextX: unknown): boolean {
  return Math.abs(readNumber(previousX, 0) - readNumber(nextX, 0)) <= PAGE_TRACK_TARGET_EPSILON;
}

function pageIndexToTrackX(index: unknown, pageSpan: unknown): number {
  return -readNumber(index, 0) * readPageSpan(pageSpan);
}

function makeScrubKey(scrub: NormalizedPageTrackMotionScrub, pageSpan: number): string {
  return [
    readNumber(scrub.fromIndex, 0),
    readNumber(scrub.toIndex, 0),
    readPageSpan(pageSpan),
    scrub.grabToken ?? scrub.gestureToken ?? "",
  ].join(":");
}

function isSettlingScrub(scrub: PageTrackMotionScrubInput | null | undefined): boolean {
  return scrub?.settle === true || scrub?.settling === true || scrub?.phase === "settle";
}

function makeSettleToken(scrub: NormalizedPageTrackMotionScrub, key: string): unknown {
  if (scrub.settleToken != null) return scrub.settleToken;
  if (scrub.token != null) return scrub.token;
  return [
    key,
    readNumber(scrub.velocity, 0),
    scrub.targetProgress ?? scrub.settleProgress ?? "",
  ].join(":");
}

function normalizeScrub(
  scrub: PageTrackMotionScrubInput | null | undefined,
  pageSpan: number,
): NormalizedPageTrackMotionScrub | null {
  if (!scrub || typeof scrub !== "object") return null;
  const fromIndex = readNumber(scrub.fromIndex, Number.NaN);
  const toIndex = readNumber(scrub.toIndex, Number.NaN);
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return null;
  return {
    ...scrub,
    fromIndex,
    fromX: pageIndexToTrackX(fromIndex, pageSpan),
    grab: scrub.grab === true,
    grabToken: scrub.grabToken ?? scrub.gestureToken,
    progress: clamp01(scrub.progress),
    progressDelta: readNumber(scrub.progressDelta, 0),
    toIndex,
    toX: pageIndexToTrackX(toIndex, pageSpan),
  };
}

function getTrackProgress(
  pageTrack: PageTrackTarget | null | undefined,
  scrub: NormalizedPageTrackMotionScrub,
): number {
  const distance = scrub.toX - scrub.fromX;
  if (Math.abs(distance) <= 0.0001) return scrub.progress;
  return clamp01((readNumber(pageTrack?.x, scrub.fromX) - scrub.fromX) / distance);
}

function resolveScrubProgress(
  motionState: PageTrackMotionState,
  pageTrack: PageTrackTarget,
  scrub: NormalizedPageTrackMotionScrub,
  isNewControl: boolean,
): number {
  if (!scrub.grab) {
    motionState.grabProgressOffset = 0;
    motionState.grabToken = null;
    return scrub.progress;
  }
  if (isNewControl || motionState.grabToken !== scrub.grabToken) {
    motionState.grabProgressOffset = getTrackProgress(pageTrack, scrub);
    motionState.grabToken = scrub.grabToken;
  }
  return clamp01(readNumber(motionState.grabProgressOffset, 0) + scrub.progressDelta);
}

function describePageTrackTarget(
  runtime: MotionRuntime | null | undefined,
  pageTrack: PageTrackTarget | null | undefined,
  options: PageTrackMotionOptions = {},
): void {
  if (typeof runtime?.describeTarget !== "function" || !pageTrack) return;
  const metadata: Record<string, unknown> = options.debugMetadata &&
    typeof options.debugMetadata === "object" &&
    !Array.isArray(options.debugMetadata)
    ? { ...options.debugMetadata }
    : {};
  if (metadata.kind == null) metadata.kind = "PageTrack";
  if (metadata.label == null) metadata.label = "Page track";
  if (metadata.pageIndex == null) metadata.pageIndex = readNumber(options.pageIndex, 0);
  if (metadata.pageSpan == null) metadata.pageSpan = readPageSpan(options.pageSpan);
  if (options.sourceLabel != null && metadata.sourceLabel == null) metadata.sourceLabel = options.sourceLabel;
  runtime.describeTarget(pageTrack, metadata);
}

export function createPageTrackMotionState(): PageTrackMotionState {
  return {
    swipeSample:null,
    control: null,
    grabProgressOffset: 0,
    grabToken: null,
    key: null,
    mode: null,
    settleToken: null,
    targetX: null,
  };
}

export function cancelPageTrackMotion(
  motionState: PageTrackMotionState | null | undefined,
  reason = "cancel",
): void {
  if (!motionState) return;
  motionState.control?.cancel?.(reason);
  motionState.control = null;
  motionState.swipeSample=null;
  motionState.grabProgressOffset = 0;
  motionState.grabToken = null;
  motionState.key = null;
  motionState.mode = null;
  motionState.settleToken = null;
  motionState.targetX = null;
}

export function isPageTrackMotionActive(
  motionState: PageTrackMotionState | null | undefined,
  pageTrack: PageTrackTarget | null = null,
): boolean {
  if (!motionState) return false;
  const control = motionState.control;
  if (control && !control.completed && !control.released) return true;
  const targetX = Number(motionState.targetX);
  if (!Number.isFinite(targetX)) return false;
  return !isSameTrackTarget(pageTrack?.x, targetX);
}

export function getPageTrackX(index: number, pageSpan: number): number {
  return pageIndexToTrackX(index, pageSpan);
}

export function updatePageTrackMotion(
  motionState: PageTrackMotionState,
  pageTrack: PageTrackTarget | null | undefined,
  options: PageTrackMotionOptions = {},
): PageTrackMotionResult {
  const {
    onFrame,
    pageIndex = 0,
    pageSpan = 1,
    runtime,
    scrub,
    snap = false,
    springConfig = motionSprings.layout,
  } = options;
  const targetX = pageIndexToTrackX(pageIndex, pageSpan);
  if (!pageTrack) return { mode: "none", targetX };
  describePageTrackTarget(runtime || motionRuntime, pageTrack, options);

  const normalizedScrub = normalizeScrub(scrub, pageSpan);
  if (normalizedScrub) {
    const key = makeScrubKey(normalizedScrub, pageSpan);
    const settling = isSettlingScrub(normalizedScrub);
    const settleToken = settling ? makeSettleToken(normalizedScrub, key) : null;
    const speed=getPageSwipeSpeed();
    if(speed>0&&normalizedScrub.continuousWheel&&!normalizedScrub.edge&&!normalizedScrub.grab){
      const interruptedSettle=motionState.mode==="settle"&&!settling;
      const prior=interruptedSettle?null:motionState.swipeSample;
      const inputTarget=normalizedScrub.fromX+(normalizedScrub.toX-normalizedScrub.fromX)*normalizedScrub.progress;
      const target=settling?normalizedScrub.fromX+(normalizedScrub.toX-normalizedScrub.fromX)*(normalizedScrub.targetProgress??0):inputTarget;
      const time=readNumber(normalizedScrub.sampleTime,0),rate=readPageSpan(pageSpan)*speed;
      const sameSample=prior?.time===time&&prior.key===key&&prior.target===target&&prior.rate===rate;
      if(sameSample&&motionState.mode===(settling?"settle":"scrub")&&(!settling||motionState.settleToken===settleToken))return {control:motionState.control,mode:settling?"settle":"scrub",targetX:target};
      const elapsed=prior?Math.min(0.08,Math.max(0.001,(time-prior.time)/1000)):1/60;
      const fast=Math.abs(inputTarget-(prior?.target??pageTrack.x))>rate*elapsed;
      // Input and release may arrive in one rendered frame. Compare the input
      // position too, so coalescing cannot bypass the visual limit on release.
      const limited=Boolean(prior?.limited||fast||(interruptedSettle&&motionState.control&&!motionState.control.completed));
      if(limited){
        // Re-target from the actual displayed position. Never replay queued deltas,
        // and never snap to the input target when the fingers leave the trackpad.
        const from=pageTrack.x,distance=Math.abs(target-from);
        motionState.control?.cancel(PAGE_TRACK_REPLACE_REASON);
        const duration=distance/rate*(settling?2:1);
        motionState.control=motion(pageTrack).layout().interrupt("replace")
          .from({x:from}).duration(duration).ease(settling?((p:number)=>1-(1-p)*(1-p)):"linear")
          .to({x:target,onUpdate:onFrame,onComplete:onFrame}).start({runtime});
        motionState.key=key;motionState.mode=settling?"settle":"scrub";motionState.settleToken=settleToken;motionState.targetX=target;
        motionState.swipeSample={time,target,key,limited:true,rate};
        return {control:motionState.control,mode:settling?"settle":"scrub",targetX:target};
      }
      motionState.swipeSample={time,target,key,limited:false,rate};
    }else motionState.swipeSample=null;
    if (settling &&
      motionState.control &&
      motionState.key === key &&
      motionState.mode === "settle" &&
      motionState.settleToken === settleToken) {
      return { control: motionState.control, mode: "settle", targetX: normalizedScrub.toX };
    }
    const needsNewControl = !motionState.control ||
      motionState.key !== key ||
      motionState.control.released ||
      motionState.control.completed ||
      (!settling && motionState.control.state?.driver?.type !== "progress");
    const progress = resolveScrubProgress(motionState, pageTrack, normalizedScrub, needsNewControl);

    if (needsNewControl) {
      motionState.control?.cancel?.(PAGE_TRACK_REPLACE_REASON);
      motionState.control = motion(pageTrack)
        .layout()
        .interrupt("replace")
        .ease(normalizedScrub.ease || "linear")
        .from({ x: normalizedScrub.fromX })
        .scrub(progress)
        .to({
          onComplete: onFrame,
          onUpdate: onFrame,
          x: normalizedScrub.toX,
        })
        .start({ runtime });
      motionState.key = key;
      motionState.mode = "scrub";
      motionState.settleToken = null;
    }

    if (!settling) {
      motionState.control?.setProgress?.(progress);
      motionState.mode = "scrub";
      return { control: motionState.control, mode: "scrub", targetX: normalizedScrub.toX };
    }

    if (motionState.settleToken !== settleToken) {
      motionState.control?.setProgress?.(progress);
      const settleSpring=normalizedScrub.spring||springConfig;
      const targetProgress=normalizedScrub.targetProgress??normalizedScrub.settleProgress;
      const distance=normalizedScrub.toX-normalizedScrub.fromX;
      const rawVelocity=normalizedScrub.valueVelocity===undefined?readNumber(normalizedScrub.velocity,0)
        :Math.abs(distance)<0.001?0:normalizedScrub.valueVelocity/distance;
      const releaseVelocity=targetProgress===undefined?normalizedScrub.velocity
        :pageSettleVelocity(progress,targetProgress,rawVelocity,settleSpring);
      motionState.control?.settle?.({
        midpoint: normalizedScrub.midpoint,
        progress: normalizedScrub.targetProgress ?? normalizedScrub.settleProgress,
        spring: settleSpring,
        valueVelocity: targetProgress===undefined?normalizedScrub.valueVelocity:undefined,
        velocity: releaseVelocity,
        velocityThreshold: normalizedScrub.velocityThreshold,
      } as MotionSettleOptions);
      motionState.settleToken = settleToken;
    }
    motionState.mode = "settle";
    return { control: motionState.control, mode: "settle", targetX: normalizedScrub.toX };
  }

  if(!snap&&motionState.mode==="settle"&&motionState.swipeSample?.limited
    &&motionState.control&&!motionState.control.completed&&!motionState.control.released
    &&isSameTrackTarget(motionState.targetX,targetX)){
    // The input engine can release its presentation before a visually delayed
    // page finishes. Preserve this one destination instead of jumping to a spring.
    return {control:motionState.control,mode:"settle",targetX};
  }
  if (motionState.mode === "scrub" || motionState.mode === "settle") {
    cancelPageTrackMotion(motionState, PAGE_TRACK_REPLACE_REASON);
  }
  if (snap) {
    motionState.control?.cancel?.(PAGE_TRACK_SNAP_REASON);
    if (isSameTrackTarget(pageTrack.x, targetX)) {
      motionState.control = null;
      motionState.key = null;
      motionState.mode = "spring";
      motionState.settleToken = null;
      motionState.targetX = targetX;
      pageTrack.x = targetX;
      return { control: null, mode: "spring", targetX };
    }
    motionState.control = motion(pageTrack)
      .layout()
      .spring(springConfig)
      .interrupt("retarget")
      .to({
        onComplete: onFrame,
        onUpdate: onFrame,
        snap: true,
        x: targetX,
      })
      .start({ runtime });
    motionState.key = null;
    motionState.mode = "spring";
    motionState.settleToken = null;
    motionState.targetX = targetX;
    return { control: motionState.control, mode: "spring", targetX };
  }
  if (motionState.mode === "spring" && isSameTrackTarget(motionState.targetX, targetX)) {
    return { control: motionState.control, mode: "spring", targetX };
  }
  if (!motionState.control && isSameTrackTarget(pageTrack.x, targetX)) {
    motionState.key = null;
    motionState.mode = "spring";
    motionState.settleToken = null;
    motionState.targetX = targetX;
    pageTrack.x = targetX;
    return { control: null, mode: "spring", targetX };
  }
  motionState.control = motion(pageTrack)
    .layout()
    .spring(springConfig)
    .interrupt("retarget")
    .to({
      onComplete: onFrame,
      onUpdate: onFrame,
      snap,
      x: targetX,
    })
    .start({ runtime });
  motionState.key = null;
  motionState.mode = "spring";
  motionState.settleToken = null;
  motionState.targetX = targetX;
  return { control: motionState.control, mode: "spring", targetX };
}
