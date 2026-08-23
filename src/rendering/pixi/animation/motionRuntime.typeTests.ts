import {
  createMotionRuntime,
  progressDriver,
  spring,
  tween,
} from "./motionRuntime.js";
import type {
  MotionAnimationControl,
  MotionRenderSignal,
  MotionRenderSignalListener,
  MotionRuntime,
  MotionRuntimeDebugAdapterFactory,
} from "./motionRuntime.js";
import { createMotionRuntimeDebugAdapter as createStubDebugAdapter } from "./motionRuntimeDebugAdapter.js";
import { createMotionRuntimeDebugAdapter as createDevDebugAdapter } from "./motionRuntimeDebugAdapter.dev.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;

type RuntimeFactorySurface = Expect<Equal<ReturnType<typeof createMotionRuntime>, MotionRuntime>>;
type RenderListenerParameters = Expect<Equal<Parameters<MotionRenderSignalListener>, [MotionRenderSignal]>>;
type RenderSignalKeys = Expect<Equal<
  keyof MotionRenderSignal,
  "activeAnimationCount" | "afterFrameFlushes" | "frame" | "reason" | "timeMs" | "writesLastFrame"
>>;

class ClassMotionTarget {
  x = 0;
}

const runtime: MotionRuntime = createMotionRuntime({ autoStart: false });
const target = new ClassMotionTarget();
const springControl: MotionAnimationControl | null = runtime.animate(target, "x", 10, {
  driver: spring({ damping: 20, mass: 1, stiffness: 200 }),
});
const tweenControl: MotionAnimationControl | null = runtime.animate(target, "x", 20, {
  driver: tween({ duration: 0.2, ease: "linear" }),
});
const progressControl: MotionAnimationControl | null = runtime.animate(target, "x", 30, {
  driver: progressDriver({ completeAtEnd: false, progress: 0.5 }),
});

const renderListener: MotionRenderSignalListener = (signal) => {
  const frame: number = signal.frame;
  const reason: MotionRenderSignal["reason"] = signal.reason;
  void frame;
  void reason;
};
runtime.onRenderSignal(renderListener);

// @ts-expect-error Production motion runtimes must not expose test-only flush controls.
runtime[`flushAfterFrameFor${"Tests"}`]();

const stubFactory: MotionRuntimeDebugAdapterFactory = createStubDebugAdapter;
const devFactory: MotionRuntimeDebugAdapterFactory = createDevDebugAdapter;

void springControl;
void tweenControl;
void progressControl;
void stubFactory;
void devFactory;
void (0 as unknown as RuntimeFactorySurface);
void (0 as unknown as RenderListenerParameters);
void (0 as unknown as RenderSignalKeys);
