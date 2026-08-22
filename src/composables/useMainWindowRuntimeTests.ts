import { ref } from "vue";
import {
  DEFAULT_WINDOW_EFFECTS_SUPPORT,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_APPEARANCE_SYSTEM,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
  WINDOW_MODE_WINDOWED,
} from "./useLaunchpadSettingsConfig.js";
import { useMainWindowRuntime } from "./useMainWindowRuntime.js";
import type { MainWindowPort } from "../platform/launchpadPorts.js";
import type { AppearancePreference } from "../domain/appearancePreference.js";

type RuntimeCall = [name: string, ...args: unknown[]];
type RuntimeOptions = Readonly<{
  appearance?: string;
  fullscreenOverscanEnabled?: boolean;
  material?: string;
}>;

function isRuntimeOptions(value: unknown): value is RuntimeOptions {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type PortOverrides = Readonly<{
  available?: boolean;
  effectsError?: unknown;
  port?: Partial<MainWindowPort>;
  shortcutError?: unknown;
  supportError?: unknown;
}>;

function makePort(overrides: PortOverrides = {}) {
  const calls: RuntimeCall[] = [];
  const port: MainWindowPort = {
    getEffectsSupport: async () => {
      if (overrides.supportError) throw overrides.supportError;
      return {
        platform: "windows",
        build: 22621,
        supportsAcrylic: true,
        supportsMica: true,
        supportsMicaAlt: true,
      };
    },
    beginClose: async (openSequence: number) => {
      calls.push(["beginClose", openSequence]);
      return { accepted: true, generation: openSequence + 1 };
    },
    hide: async (generation: number) => {
      calls.push(["hide", generation]);
      return true;
    },
    isAvailable: () => overrides.available !== false,
    registerShortcut: async (shortcut: string | null) => {
      calls.push(["shortcut", shortcut]);
      if (overrides.shortcutError) throw overrides.shortcutError;
      return shortcut;
    },
    reveal: async (openSequence: number) => {
      calls.push(["reveal", openSequence]);
      return true;
    },
    setEffectsEnabled: async (enabled, openSequence, options) => {
      calls.push(["effects", enabled, openSequence, options]);
      if (overrides.effectsError) throw overrides.effectsError;
      return true;
    },
    setFrameEnabled: async (enabled) => {
      calls.push(["frame", enabled]);
      return true;
    },
    setMode: async (mode, options) => {
      calls.push(["mode", mode, options]);
      return mode;
    },
    setShortcutCaptureActive: async (active) => {
      calls.push(["capture", active]);
      return true;
    },
    ...overrides.port,
  };
  return { calls, port };
}

export async function runMainWindowRuntimeTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Main window runtime test failed] ${message}`);
  };

  const { calls, port } = makePort();
  const systemAppearance = ref<AppearancePreference>(WINDOW_EFFECT_APPEARANCE_LIGHT);
  const runtime = useMainWindowRuntime({ port, systemAppearance });
  assert(
    runtime.support.value.platform === DEFAULT_WINDOW_EFFECTS_SUPPORT.platform,
    "window support should start from the explicit unknown capability state"
  );

  const supportOutcome = await runtime.refreshSupport();
  assert(supportOutcome.ok, "window support refresh should report success");
  assert(runtime.support.value.supportsMicaAlt, "window support refresh should publish normalized capabilities");

  await Promise.all([
    runtime.setEffectsEnabled({
      enabled: false,
      openSequence: 17,
      material: WINDOW_EFFECT_MATERIAL_MICA_ALT,
      appearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
    }),
    runtime.setFrameEnabled(true),
  ]);
  assert(calls[0]?.[0] === "effects" && calls[1]?.[0] === "frame", "surface updates should retain request order");
  const initialEffectOptions = calls[0]?.[3];
  assert(isRuntimeOptions(initialEffectOptions), "effect updates should include native options");
  assert(initialEffectOptions.material === WINDOW_EFFECT_MATERIAL_MICA_ALT, "effect updates should preserve supported materials");
  assert(initialEffectOptions.appearance === WINDOW_EFFECT_APPEARANCE_LIGHT, "effect updates should normalize appearance");

  systemAppearance.value = WINDOW_EFFECT_APPEARANCE_DARK;
  await runtime.setEffectsEnabled({ enabled: true, appearance: WINDOW_EFFECT_APPEARANCE_SYSTEM });
  const systemEffectOptions = calls[2]?.[3];
  assert(isRuntimeOptions(systemEffectOptions), "system effect updates should include native options");
  assert(systemEffectOptions.appearance === WINDOW_EFFECT_APPEARANCE_DARK, "system appearance should resolve before reaching the native adapter");

  const modeOutcome = await runtime.setMode({ mode: WINDOW_MODE_WINDOWED, fullscreenOverscanEnabled: false });
  assert(modeOutcome.ok && modeOutcome.value === WINDOW_MODE_WINDOWED, "window mode updates should expose the applied native mode");
  assert(calls[3]?.[0] === "mode" && (calls[3]?.[2] as { fullscreenOverscanEnabled?: boolean } | undefined)?.fullscreenOverscanEnabled === false, "window mode should include overscan state");

  const shortcutOutcome = await runtime.registerShortcut("control+alt+KeyL");
  assert(shortcutOutcome.ok && shortcutOutcome.shortcut === "control+alt+KeyL", "shortcut registration should return the normalized registered shortcut");
  await runtime.setShortcutCaptureActive(1);
  runtime.acceptOpen(17);
  await runtime.reveal(17);
  const closeOutcome = await runtime.beginClose(17);
  assert(closeOutcome.ok && closeOutcome.accepted && closeOutcome.generation === 18, "close should return the accepted native transition generation");
  await runtime.hide(closeOutcome.generation);
  assert(calls.some(([name, value]) => name === "capture" && value === true), "shortcut capture should normalize boolean state");
  assert(calls.slice(-3).map(([name]) => name).join(",") === "reveal,beginClose,hide", "window visibility commands should preserve transition order");
  assert(calls.at(-1)?.[1] === 18, "hide should carry the accepted close generation to the native boundary");

  let releaseFirstOperation: (() => void) | undefined;
  const serialized = makePort({
    port: {
      setEffectsEnabled: async (...args) => {
        serialized.calls.push(["effects", ...args]);
        await new Promise<void>((resolve) => { releaseFirstOperation = resolve; });
        return true;
      },
    },
  });
  const serializedRuntime = useMainWindowRuntime({ port: serialized.port, systemAppearance });
  const effectsUpdate = serializedRuntime.setEffectsEnabled({ enabled: true });
  const serializedModeUpdate = serializedRuntime.setMode({ mode: WINDOW_MODE_WINDOWED });
  const frameUpdate = serializedRuntime.setFrameEnabled(true);
  await Promise.resolve();
  assert(serialized.calls.map(([name]) => name).join(",") === "effects", "all native surface, mode, and visibility work should share one queue");
  releaseFirstOperation?.();
  await Promise.all([effectsUpdate, serializedModeUpdate, frameUpdate]);
  assert(serialized.calls.map(([name]) => name).join(",") === "effects,mode,frame", "the unified transition queue should retain cross-capability request order");

  let releaseReveal: (() => void) | undefined;
  const racing = makePort({
    port: {
      reveal: async (openSequence) => {
        racing.calls.push(["reveal", openSequence]);
        await new Promise<void>((resolve) => { releaseReveal = resolve; });
        return true;
      },
    },
  });
  const racingRuntime = useMainWindowRuntime({ port: racing.port, systemAppearance });
  racingRuntime.acceptOpen(41);
  const staleRevealPromise = racingRuntime.reveal(41);
  await Promise.resolve();
  const closingPromise = racingRuntime.beginClose(41);
  releaseReveal?.();
  const staleReveal = await staleRevealPromise;
  const closing = await closingPromise;
  assert(staleReveal.ok && staleReveal.stale, "begin-close should invalidate an earlier reveal even when its adapter resolves later");
  assert(closing.ok && closing.generation === 42, "the current close should retain its native generation after a stale reveal settles");
  racingRuntime.acceptOpen(43);
  const staleHide = await racingRuntime.hide(closing.generation);
  assert(staleHide.ok && staleHide.stale, "a reopened generation should reject the previous close hide before invoking the adapter");
  assert(!racing.calls.some(([name]) => name === "hide"), "a stale close must not cross the native hide boundary");

  const shortcutError = new Error("occupied");
  const failed = useMainWindowRuntime({ port: makePort({ shortcutError }).port, systemAppearance });
  const failedShortcut = await failed.registerShortcut("control+alt+KeyL");
  assert(!failedShortcut.ok && failedShortcut.error === shortcutError, "shortcut failures should remain explicit outcomes");

  const supportError = new Error("support unavailable");
  const failedSupportRuntime = useMainWindowRuntime({ port: makePort({ supportError }).port, systemAppearance });
  const failedSupport = await failedSupportRuntime.refreshSupport();
  assert(!failedSupport.ok && failedSupport.error === supportError, "window support failures should remain explicit outcomes");
  assert(!failedSupportRuntime.support.value.supportsAcrylic, "window support failures should restore the explicit unknown state");

  const unavailable = makePort({ available: false });
  const unavailableRuntime = useMainWindowRuntime({ port: unavailable.port, systemAppearance });
  const skipped = await unavailableRuntime.setFrameEnabled(true);
  assert(skipped.ok && skipped.skipped, "unavailable native windows should return an explicit skipped outcome");
  unavailableRuntime.acceptOpen(1);
  const skippedClose = await unavailableRuntime.beginClose(1);
  assert(skippedClose.ok && skippedClose.skipped && !skippedClose.accepted, "unavailable native windows should skip close without fabricating a native generation");
  assert(unavailable.calls.length === 0, "unavailable native windows should not invoke platform commands");
}
