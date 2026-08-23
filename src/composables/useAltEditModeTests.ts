import { ref } from "vue";
import { useAltEditMode } from "./useAltEditMode.js";
import type { AltKeyEvent } from "./useAltEditMode.js";

function createTimerTarget() {
  let nextId = 1;
  const timers = new Map<number, () => void>();
  return {
    clearTimeout(id: number) {
      timers.delete(id);
    },
    flush() {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) callback();
    },
    get size() {
      return timers.size;
    },
    setTimeout(callback: () => void) {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
  };
}

function altEvent(overrides: Partial<AltKeyEvent> = {}): AltKeyEvent {
  return {
    code: "AltLeft",
    key: "Alt",
    repeat: false,
    ...overrides,
  };
}

export function runAltEditModeTests() {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`[Alt edit mode test failed] ${message}`);
  };
  const batchActive = ref(false);
  const target = createTimerTarget();
  const mode = useAltEditMode({
    eventTarget: target,
    isBatchSelectionActive: () => batchActive.value,
    isDragActive: () => false,
  });

  mode.handleAltKeyDown(altEvent());
  assert(target.size === 1, "normal mode should arm the Alt quick-edit delay");
  target.flush();
  assert(mode.isEditMode.value, "holding Alt through the delay should enter quick edit");
  mode.handleAltKeyUp(altEvent());
  assert(!mode.isEditMode.value, "Alt keyup should leave quick edit");

  batchActive.value = true;
  mode.handleAltKeyDown(altEvent());
  assert(target.size === 0 && !mode.isEditMode.value, "batch management should block the Alt timer");
  batchActive.value = false;
  mode.handleAltKeyDown(altEvent());
  assert(target.size === 0, "leaving batch while Alt remains held should wait for keyup");
  mode.handleAltKeyUp(altEvent());
  mode.handleAltKeyDown(altEvent());
  assert(target.size === 1, "a fresh Alt press after keyup should arm quick edit again");
  mode.handleWindowBlur();
  target.flush();
  assert(!mode.isEditMode.value, "window blur should clear pending and active Alt state");

  mode.handleAltKeyDown(altEvent());
  mode.cancelAltEditMode();
  target.flush();
  assert(!mode.isEditMode.value, "entering batch should cancel an already armed Alt timer");
  mode.handleAltKeyDown(altEvent());
  assert(target.size === 0, "canceling while Alt is held should latch until keyup");
  mode.handleAltKeyUp(altEvent());
}
