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

function makePort(overrides = {}) {
  const calls = [];
  const port = {
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
    hide: async () => calls.push(["hide"]),
    isAvailable: () => overrides.available !== false,
    registerShortcut: async (shortcut) => {
      calls.push(["shortcut", shortcut]);
      if (overrides.shortcutError) throw overrides.shortcutError;
      return shortcut;
    },
    reveal: async (openSequence) => calls.push(["reveal", openSequence]),
    setEffectsEnabled: async (enabled, openSequence, options) => {
      calls.push(["effects", enabled, openSequence, options]);
      if (overrides.effectsError) throw overrides.effectsError;
    },
    setFrameEnabled: async (enabled) => calls.push(["frame", enabled]),
    setMode: async (mode, options) => calls.push(["mode", mode, options]),
    setShortcutCaptureActive: async (active) => calls.push(["capture", active]),
    show: async () => calls.push(["show"]),
    ...overrides.port,
  };
  return { calls, port };
}

export async function runMainWindowRuntimeTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Main window runtime test failed] ${message}`);
  };

  const { calls, port } = makePort();
  const systemAppearance = ref(WINDOW_EFFECT_APPEARANCE_LIGHT);
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
  assert(calls[0][0] === "effects" && calls[1][0] === "frame", "surface updates should retain request order");
  assert(calls[0][3].material === WINDOW_EFFECT_MATERIAL_MICA_ALT, "effect updates should preserve supported materials");
  assert(calls[0][3].appearance === WINDOW_EFFECT_APPEARANCE_LIGHT, "effect updates should normalize appearance");

  systemAppearance.value = WINDOW_EFFECT_APPEARANCE_DARK;
  await runtime.setEffectsEnabled({ enabled: true, appearance: WINDOW_EFFECT_APPEARANCE_SYSTEM });
  assert(calls[2][3].appearance === WINDOW_EFFECT_APPEARANCE_DARK, "system appearance should resolve before reaching the native adapter");

  const modeOutcome = await runtime.setMode({ mode: WINDOW_MODE_WINDOWED, fullscreenOverscanEnabled: false });
  assert(modeOutcome.ok, "window mode updates should report success");
  assert(calls[3][0] === "mode" && calls[3][2].fullscreenOverscanEnabled === false, "window mode should include overscan state");

  const shortcutOutcome = await runtime.registerShortcut("control+alt+KeyL");
  assert(shortcutOutcome.ok && shortcutOutcome.shortcut === "control+alt+KeyL", "shortcut registration should return the normalized registered shortcut");
  await runtime.setShortcutCaptureActive(1);
  await runtime.show();
  await runtime.reveal(17);
  await runtime.hide();
  assert(calls.some(([name, value]) => name === "capture" && value === true), "shortcut capture should normalize boolean state");
  assert(calls.slice(-3).map(([name]) => name).join(",") === "show,reveal,hide", "window visibility commands should preserve caller order");

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
  assert(unavailable.calls.length === 0, "unavailable native windows should not invoke platform commands");
}
