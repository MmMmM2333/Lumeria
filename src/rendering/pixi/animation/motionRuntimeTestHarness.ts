import type { MotionRuntime } from "./motionRuntime.js";

export function flushMotionRuntimeTestFrame(runtime: Pick<MotionRuntime, "step">): void {
  runtime.step(0);
}
