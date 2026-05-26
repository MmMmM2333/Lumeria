import { ref } from "vue";
import { ALT_EDIT_DELAY } from "./launchpadConstants.js";

export function useAltEditMode(options) {
  const isEditMode = ref(false);
  let altEditTimer = null;
  let isAltPressed = false;

  function clearAltEditTimer() {
    if (altEditTimer) window.clearTimeout(altEditTimer);
    altEditTimer = null;
  }

  function enterEditModeFromAlt() {
    altEditTimer = null;
    if (isAltPressed) isEditMode.value = true;
  }

  function isAltKeyEvent(event) {
    return event.key === "Alt" || event.key === "Option" || event.code === "AltLeft" || event.code === "AltRight";
  }

  function handleAltKeyDown(event) {
    if (!isAltKeyEvent(event) || event.repeat || isAltPressed || options.isDragActive()) return;
    isAltPressed = true;
    clearAltEditTimer();
    altEditTimer = window.setTimeout(enterEditModeFromAlt, ALT_EDIT_DELAY);
  }

  function handleAltKeyUp(event) {
    if (!isAltKeyEvent(event)) return;
    isAltPressed = false;
    clearAltEditTimer();
    isEditMode.value = false;
  }

  function handleWindowBlur() {
    isAltPressed = false;
    clearAltEditTimer();
    isEditMode.value = false;
  }

  return {
    clearAltEditTimer,
    handleAltKeyDown,
    handleAltKeyUp,
    handleWindowBlur,
    isAltKeyEvent,
    isEditMode,
  };
}
