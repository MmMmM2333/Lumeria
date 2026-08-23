import type {
  MainWindowTransitionOptions,
  MainWindowTransitionSnapshot,
} from "../composables/mainWindowTransition.js";
import {
  RENDER_INVALIDATION_LANES,
} from "./pixi/renderInvalidation.js";
import {
  autostartPort,
  mainWindowPort,
} from "../platform/launchpadPorts.js";
import { backgroundEffectUsesPixi } from "./backgroundPort.js";
import { resolveFolderClosingHandoffId } from "./desktopScenePort.js";

type IsAny<Value> = 0 extends (1 & Value) ? true : false;
type ExpectFalse<Value extends false> = Value;

type BackgroundCapabilityInputIsTyped = ExpectFalse<
  IsAny<Parameters<typeof backgroundEffectUsesPixi>[0]>
>;
type FolderHandoffInputIsTyped = ExpectFalse<
  IsAny<Parameters<typeof resolveFolderClosingHandoffId>[0]>
>;
void (null as unknown as BackgroundCapabilityInputIsTyped);
void (null as unknown as FolderHandoffInputIsTyped);
import type {
  RenderInvalidationLane,
  RenderInvalidationLedger,
  RenderInvalidationSnapshot,
} from "./pixi/renderInvalidation.js";
import type {
  DesktopMotionRenderSignalListener,
  DesktopPresentationCommitMode,
  DesktopPresentationFrameClock,
  DesktopPresentationLoop,
  DesktopPresentationLoopOptions,
  DesktopPresentationMotionRuntime,
} from "./pixi/desktopPresentationLoop.js";

declare const transitionOptions: MainWindowTransitionOptions;
void transitionOptions;

declare const transitionSnapshot: MainWindowTransitionSnapshot;
void transitionSnapshot.phase;
void transitionSnapshot.requested.visibility;

// @ts-expect-error Window transition phases are closed.
const invalidPhase: MainWindowTransitionSnapshot["phase"] = "minimized";
void invalidPhase;

const motionLane: RenderInvalidationLane = RENDER_INVALIDATION_LANES.MOTION;
void motionLane;

declare const ledger: RenderInvalidationLedger;
const mark = ledger.mark("motion-frame");
void mark.revision;

// @ts-expect-error The retired scheduler-only emptiness flag is not part of the invalidation contract.
void mark.wasEmpty;

declare const invalidation: RenderInvalidationSnapshot;
void invalidation.reasons.motion;

// @ts-expect-error Invalidation lanes are a closed renderer work classification.
const invalidLane: RenderInvalidationLane = "everything";
void invalidLane;

declare const presentationLoop: DesktopPresentationLoop;
presentationLoop.invalidate({ reason: "motion-frame" });
presentationLoop.requestResizeSettle({ frames: 3, reason: "resize" });
presentationLoop.flushBeforeComposite({ reason: "folder-close-commit" });

declare const presentationOptions: DesktopPresentationLoopOptions;
void presentationOptions.frameClock.request;
void presentationOptions.motionRuntime.step;

declare const presentationClock: DesktopPresentationFrameClock;
declare const presentationMotion: DesktopPresentationMotionRuntime;
declare const motionSignalListener: DesktopMotionRenderSignalListener;
presentationClock.cancel(presentationClock.request(() => {}));
presentationMotion.onRenderSignal(motionSignalListener);

const presentationMode: DesktopPresentationCommitMode = "before-composite";
void presentationMode;

// @ts-expect-error Resize reasons are a closed presentation-loop contract.
presentationLoop.requestResizeSettle({ frames: 3, reason: "resize-settle" });

// @ts-expect-error Pre-composite commits are restricted to the folder-close handoff.
presentationLoop.flushBeforeComposite({ reason: "manual-flush" });

// @ts-expect-error Presentation commit modes are closed.
const invalidPresentationMode: DesktopPresentationCommitMode = "synchronous";
void invalidPresentationMode;

void autostartPort.setEnabled(true);
void mainWindowPort.setMode("windowed", { fullscreenOverscanEnabled: false });

// @ts-expect-error Port arguments are part of the stable application/platform contract.
void autostartPort.setEnabled("yes");

// @ts-expect-error Window modes are a closed persisted/runtime union.
void mainWindowPort.setMode("floating");
