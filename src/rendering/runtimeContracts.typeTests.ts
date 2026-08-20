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

declare const invalidation: RenderInvalidationSnapshot;
void invalidation.reasons.motion;

// @ts-expect-error Invalidation lanes are a closed renderer work classification.
const invalidLane: RenderInvalidationLane = "everything";
void invalidLane;

void autostartPort.setEnabled(true);
void mainWindowPort.setMode("windowed", { fullscreenOverscanEnabled: false });

// @ts-expect-error Port arguments are part of the stable application/platform contract.
void autostartPort.setEnabled("yes");

// @ts-expect-error Window modes are a closed persisted/runtime union.
void mainWindowPort.setMode("floating");
