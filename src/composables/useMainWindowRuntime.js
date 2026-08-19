import { readonly, ref } from "vue";
import { mainWindowPort } from "../platform/launchpadPorts.js";
import { MainWindowTransition } from "./mainWindowTransition.js";
import { normalizeMainWindowShortcut } from "../domain/mainWindowShortcut.js";
import { resolveAppearancePreference } from "../domain/appearancePreference.js";
import {
  DEFAULT_WINDOW_EFFECTS_SUPPORT,
  normalizeFullscreenOverscanEnabled,
  normalizeWindowEffectAppearance,
  normalizeWindowEffectsSupport,
  normalizeWindowMode,
  resolveWindowEffectMaterialForSupport,
} from "./useLaunchpadSettingsConfig.js";

function success(extra = {}) {
  return { ok: true, ...extra };
}

function failure(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function useMainWindowRuntime(options = {}) {
  const port = options.port || mainWindowPort;
  if (!port || typeof port.isAvailable !== "function") {
    throw new TypeError("useMainWindowRuntime requires a window port");
  }
  const systemAppearance = options.systemAppearance;
  if (!systemAppearance || !("value" in systemAppearance)) {
    throw new TypeError("useMainWindowRuntime requires systemAppearance");
  }

  const supportState = ref({ ...DEFAULT_WINDOW_EFFECTS_SUPPORT });
  const support = readonly(supportState);
  const transitionState = ref(null);

  function isAvailable() {
    return Boolean(port.isAvailable());
  }

  async function invoke(method, args = []) {
    if (!isAvailable()) return success({ skipped: true });
    try {
      const value = await method(...args);
      return success({ value });
    } catch (error) {
      return failure(error);
    }
  }

  const transition = new MainWindowTransition({
    invoke,
    port,
    publish: (snapshot) => { transitionState.value = snapshot; },
  });

  async function refreshSupport() {
    if (!isAvailable()) {
      supportState.value = { ...DEFAULT_WINDOW_EFFECTS_SUPPORT };
      return success({ skipped: true, support: supportState.value });
    }
    try {
      supportState.value = normalizeWindowEffectsSupport(await port.getEffectsSupport());
      return success({ support: supportState.value });
    } catch (error) {
      supportState.value = { ...DEFAULT_WINDOW_EFFECTS_SUPPORT };
      return failure(error, { support: supportState.value });
    }
  }

  function setEffectsEnabled(request = {}) {
    const enabled = Boolean(request.enabled);
    const openSequence = Number.isSafeInteger(request.openSequence) && request.openSequence > 0
      ? request.openSequence
      : null;
    const material = resolveWindowEffectMaterialForSupport(request.material, supportState.value);
    const appearance = resolveAppearancePreference(
      normalizeWindowEffectAppearance(request.appearance),
      systemAppearance.value,
    );
    return transition.apply(
      "effects",
      Object.freeze({ appearance, enabled, material, openSequence }),
      port.setEffectsEnabled,
      [enabled, openSequence, { material, appearance }],
    );
  }

  function setFrameEnabled(enabled) {
    const requested = Boolean(enabled);
    return transition.apply("frame", requested, port.setFrameEnabled, [requested]);
  }

  function setMode(request = {}) {
    const mode = normalizeWindowMode(request.mode);
    const fullscreenOverscanEnabled = normalizeFullscreenOverscanEnabled(request.fullscreenOverscanEnabled);
    return transition.apply(
      "mode",
      mode,
      port.setMode,
      [mode, { fullscreenOverscanEnabled }],
      (applied) => normalizeWindowMode(applied),
    );
  }

  async function registerShortcut(shortcut) {
    const requested = normalizeMainWindowShortcut(shortcut);
    const outcome = await invoke(port.registerShortcut, [requested]);
    if (!outcome.ok) return outcome;
    const registered = outcome.value === undefined ? requested : outcome.value;
    return success({ skipped: outcome.skipped, shortcut: normalizeMainWindowShortcut(registered) });
  }

  function setShortcutCaptureActive(active) {
    return invoke(port.setShortcutCaptureActive, [Boolean(active)]);
  }

  function acceptOpen(openSequence) {
    return transition.acceptOpen(openSequence);
  }

  function beginClose(openSequence) {
    return transition.beginClose(openSequence);
  }

  function reveal(openSequence) {
    return transition.reveal(openSequence);
  }

  function hide(generation) {
    return transition.hide(generation);
  }

  return {
    acceptOpen,
    beginClose,
    hide,
    isAvailable,
    refreshSupport,
    registerShortcut,
    reveal,
    setEffectsEnabled,
    setFrameEnabled,
    setMode,
    setShortcutCaptureActive,
    support,
    transition: readonly(transitionState),
  };
}
