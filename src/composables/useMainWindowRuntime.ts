import { readonly, ref, type Ref } from "vue";
import { mainWindowPort, type MainWindowPort } from "../platform/launchpadPorts.js";
import {
  MainWindowTransition,
  type MainWindowNativeMethod,
  type MainWindowTransitionFailure,
  type MainWindowTransitionOutcome,
  type MainWindowTransitionSnapshot,
} from "./mainWindowTransition.js";
import { normalizeMainWindowShortcut } from "../domain/mainWindowShortcut.js";
import { resolveAppearancePreference } from "../domain/appearancePreference.js";
import type { AppearancePreference } from "../domain/appearancePreference.js";
import type { MainWindowEffectsSupport } from "../api/launchpadApi.js";
import type { LayoutSettings } from "../domain/layoutDocument.js";
import {
  DEFAULT_WINDOW_EFFECTS_SUPPORT,
  normalizeFullscreenOverscanEnabled,
  normalizeWindowEffectAppearance,
  normalizeWindowEffectsSupport,
  normalizeWindowMode,
  resolveWindowEffectMaterialForSupport,
} from "./useLaunchpadSettingsConfig.js";

export type MainWindowRuntimeOptions = Readonly<{
  port?: MainWindowPort;
  systemAppearance?: Readonly<Ref<AppearancePreference>>;
}>;

export type MainWindowEffectsRequest = Readonly<{
  appearance?: unknown;
  enabled?: unknown;
  material?: unknown;
  openSequence?: unknown;
}>;

export type MainWindowModeRequest = Readonly<{
  fullscreenOverscanEnabled?: unknown;
  mode?: unknown;
}>;

export type MainWindowCloseSuccess = Readonly<{
  accepted: boolean;
  generation?: number;
  ok: true;
  skipped?: boolean;
  stale?: boolean;
  value?: unknown;
}>;

export type MainWindowCloseOutcome = MainWindowCloseSuccess | MainWindowTransitionFailure;

function success<Extra extends object>(extra: Extra): Readonly<{ ok: true }> & Extra {
  return { ok: true, ...extra };
}

function failure<Extra extends object>(error: unknown, extra: Extra): Readonly<{ error: unknown; ok: false }> & Extra {
  return { ok: false, error, ...extra };
}

export function useMainWindowRuntime(options: MainWindowRuntimeOptions = {}) {
  const port = options.port || mainWindowPort;
  if (!port || typeof port.isAvailable !== "function") {
    throw new TypeError("useMainWindowRuntime requires a window port");
  }
  const systemAppearance = options.systemAppearance;
  if (!systemAppearance || !("value" in systemAppearance)) {
    throw new TypeError("useMainWindowRuntime requires systemAppearance");
  }
  const appearanceState: Readonly<Ref<AppearancePreference>> = systemAppearance;

  const supportState = ref<MainWindowEffectsSupport>({ ...DEFAULT_WINDOW_EFFECTS_SUPPORT });
  const support = readonly(supportState);
  const transitionState = ref<MainWindowTransitionSnapshot | null>(null);

  function isAvailable() {
    return Boolean(port.isAvailable());
  }

  async function invoke(
    method: MainWindowNativeMethod,
    args: readonly unknown[] = [],
  ): Promise<MainWindowTransitionOutcome> {
    if (!isAvailable()) return success({ skipped: true });
    try {
      const callable = method as (...methodArgs: unknown[]) => unknown;
      const value = await callable(...args);
      return success({ value });
    } catch (error) {
      return failure(error, {});
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

  function setEffectsEnabled(request: MainWindowEffectsRequest = {}) {
    const enabled = Boolean(request.enabled);
    const openSequence = typeof request.openSequence === "number"
      && Number.isSafeInteger(request.openSequence)
      && request.openSequence > 0
      ? request.openSequence
      : null;
    const material = resolveWindowEffectMaterialForSupport(request.material, supportState.value);
    const appearance = resolveAppearancePreference(
      normalizeWindowEffectAppearance(request.appearance),
      appearanceState.value,
    );
    return transition.apply(
      "effects",
      Object.freeze({ appearance, enabled, material, openSequence }),
      port.setEffectsEnabled,
      [enabled, openSequence, { material, appearance }],
    );
  }

  function setFrameEnabled(enabled: unknown) {
    const requested = Boolean(enabled);
    return transition.apply("frame", requested, port.setFrameEnabled, [requested]);
  }

  function setMode(request: MainWindowModeRequest = {}) {
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

  async function registerShortcut(shortcut: unknown) {
    const requested = normalizeMainWindowShortcut(shortcut);
    const outcome = await invoke(port.registerShortcut, [requested]);
    if (!outcome.ok) return outcome;
    const registered = outcome.value === undefined ? requested : outcome.value;
    return success({
      ...(outcome.skipped ? { skipped: true } : {}),
      shortcut: normalizeMainWindowShortcut(registered),
    });
  }

  function setShortcutCaptureActive(active: unknown) {
    return invoke(port.setShortcutCaptureActive, [Boolean(active)]);
  }

  function acceptOpen(openSequence: number) {
    return transition.acceptOpen(openSequence);
  }

  async function beginClose(openSequence: unknown): Promise<MainWindowCloseOutcome> {
    const sequence = typeof openSequence === "number" ? openSequence : Number.NaN;
    const outcome = await transition.beginClose(sequence);
    if (!outcome.ok) return outcome;
    const accepted = outcome.accepted === true;
    const generation = typeof outcome.generation === "number" ? outcome.generation : undefined;
    if (accepted && generation === undefined) {
      throw new TypeError("Accepted main-window close outcome requires a generation");
    }
    return {
      accepted,
      ...(generation === undefined ? {} : { generation }),
      ok: true,
      ...(outcome.skipped === true ? { skipped: true } : {}),
      ...(outcome.stale === true ? { stale: true } : {}),
      ...(Object.hasOwn(outcome, "value") ? { value: outcome.value } : {}),
    };
  }

  function reveal(openSequence: number) {
    return transition.reveal(openSequence);
  }

  function hide(generation: number) {
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
