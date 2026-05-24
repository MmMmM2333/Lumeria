import {
  isPrimaryPointerMoveEvent,
  isPrimaryPointerStartEvent,
  shouldFinishDragForPointerEvent,
} from "./useLaunchpadDrag.js";

export function runLaunchpadDragTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad drag test failed] ${message}`);
  };

  assert(isPrimaryPointerStartEvent({ button: 0, buttons: 1 }), "left pointerdown should start drag intent");
  assert(!isPrimaryPointerStartEvent({ button: 2, buttons: 2 }), "right pointerdown should not start drag intent");
  assert(!isPrimaryPointerStartEvent({ button: 1, buttons: 4 }), "middle pointerdown should not start drag intent");

  assert(isPrimaryPointerMoveEvent({ buttons: 1 }), "primary pointermove should update drag");
  assert(!isPrimaryPointerMoveEvent({ buttons: 2 }), "right-only pointermove should not update drag");
  assert(!isPrimaryPointerMoveEvent({ buttons: 0 }), "released pointermove should not update drag");

  const activeDrag = { pointerId: 8 };
  assert(shouldFinishDragForPointerEvent(activeDrag, { type: "pointerup", pointerId: 8, button: 0 }), "matching left pointerup should finish drag");
  assert(!shouldFinishDragForPointerEvent(activeDrag, { type: "pointerup", pointerId: 8, button: 2 }), "matching right pointerup should not finish drag");
  assert(!shouldFinishDragForPointerEvent(activeDrag, { type: "pointerup", pointerId: 9, button: 0 }), "different pointer should not finish drag");
  assert(shouldFinishDragForPointerEvent(activeDrag, { type: "pointercancel", pointerId: 8, button: 2 }), "matching pointercancel should always finish drag");
}
