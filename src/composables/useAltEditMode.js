import { ref } from "vue";
import { ALT_EDIT_DELAY } from "./launchpadConstants.js";

export function useAltEditMode(options) {
  const isEditMode = ref(false);
  let altEditTimer = null;
  let isAltPressed = false;
  let isAltReleasePending = false;

  function getEventTarget() {
    return options.eventTarget || globalThis.window;
  }

  function clearAltEditTimer() {
    if (altEditTimer) getEventTarget()?.clearTimeout?.(altEditTimer);
    altEditTimer = null;
  }

  function enterEditModeFromAlt() {
    altEditTimer = null;
    if (isAltPressed && !isAltReleasePending && !options.isBatchSelectionActive?.()) {
      isEditMode.value = true;
    }
  }

  function isAltKeyEvent(event) {
    return event.key === "Alt" || event.key === "Option" || event.code === "AltLeft" || event.code === "AltRight";
  }

  function handleAltKeyDown(event) {
    if (!isAltKeyEvent(event)) return;
    if (options.isBatchSelectionActive?.()) {
      isAltPressed = true;
      isAltReleasePending = true;
      clearAltEditTimer();
      return;
    }
    if (event.repeat || isAltPressed || isAltReleasePending || options.isDragActive()) return;
    isAltPressed = true;
    clearAltEditTimer();
    altEditTimer = getEventTarget()?.setTimeout?.(enterEditModeFromAlt, ALT_EDIT_DELAY) || null;
  }

  function handleAltKeyUp(event) {
    if (!isAltKeyEvent(event)) return;
    isAltPressed = false;
    isAltReleasePending = false;
    clearAltEditTimer();
    isEditMode.value = false;
  }

  function handleWindowBlur() {
    isAltPressed = false;
    isAltReleasePending = false;
    clearAltEditTimer();
    isEditMode.value = false;
  }

  function cancelAltEditMode() {
    isAltReleasePending = isAltReleasePending || isAltPressed;
    clearAltEditTimer();
    isEditMode.value = false;
  }

  return {
    cancelAltEditMode,
    clearAltEditTimer,
    handleAltKeyDown,
    handleAltKeyUp,
    handleWindowBlur,
    isAltKeyEvent,
    isEditMode,
  };
}
