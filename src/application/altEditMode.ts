import type { StateHost } from "./stateHost.js";
import { ALT_EDIT_DELAY } from "../domain/launchpadConstants.js";

export type AltKeyEvent = Readonly<{ code?: string; key?: string; repeat?: boolean }>;

export type AltEditEventTarget = Readonly<{
  clearTimeout?: (id: number) => void;
  setTimeout?: (callback: () => void, delay?: number) => number;
}>;

export type AltEditModeOptions = Readonly<{
  eventTarget: AltEditEventTarget | undefined;
  isBatchSelectionActive?: () => boolean;
  isDragActive: () => boolean;
}>;

export function createAltEditMode(options: AltEditModeOptions, host: StateHost) {
  const isEditMode = host.cell(false);
  let altEditTimer: number | null = null;
  let isAltPressed = false;
  let isAltReleasePending = false;

  function getEventTarget(): AltEditEventTarget | undefined {
    return options.eventTarget;
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

  function isAltKeyEvent(event: AltKeyEvent): boolean {
    return event.key === "Alt" || event.key === "Option" || event.code === "AltLeft" || event.code === "AltRight";
  }

  function handleAltKeyDown(event: AltKeyEvent): void {
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

  function handleAltKeyUp(event: AltKeyEvent): void {
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
