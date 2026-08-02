import { useLaunchpadLayout } from "./useLaunchpadLayout.js";
import { useLaunchpadSettings } from "./useLaunchpadSettings.js";
import {
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  WINDOW_MODE_WINDOWED,
} from "./useLaunchpadSettingsConfig.js";

function makeMainWindowRuntime(options = {}) {
  const calls = [];
  return {
    calls,
    registerShortcut: async (shortcut) => {
      calls.push(["shortcut", shortcut]);
      if (options.shortcutError) return { ok: false, error: options.shortcutError };
      return { ok: true, shortcut };
    },
    setEffectsEnabled: async (request) => {
      calls.push(["effects", request]);
      return { ok: true };
    },
    setMode: async (request) => {
      calls.push(["mode", request]);
      return { ok: true };
    },
    support: {
      value: {
        platform: "windows",
        supportsAcrylic: true,
        supportsMica: true,
        supportsMicaAlt: true,
      },
    },
  };
}

export async function runLaunchpadSettingsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad settings owner test failed] ${message}`);
  };

  const layout = useLaunchpadLayout({ seedEnabled: false });
  const mainWindow = makeMainWindowRuntime();
  let liveDesktopSyncs = 0;
  const settings = useLaunchpadSettings({
    layout,
    liveDesktopSupport: {
      value: {
        platform: "windows",
        supportsLiveDesktopBackground: true,
        supportsLiveDesktopBackgroundEffects: true,
      },
    },
    mainWindow,
  });
  const initialLayout = layout.captureConfiguration();
  const initialWindowMode = settings.presentation.windowMode.value;

  settings.beginEdit();
  settings.draft.rows.value = 2;
  settings.draft.cols.value = 3;
  settings.actions.setDraftWindowMode(WINDOW_MODE_WINDOWED);
  settings.actions.setDraftBackgroundSource(BACKGROUND_SOURCE_CUSTOM_IMAGE);
  settings.draft.backgroundImagePath.value = "C:/Images/test.png";
  settings.draft.backgroundImageUrl.value = "asset://test";
  settings.actions.setDraftBackgroundEffect(BACKGROUND_EFFECT_BLUR);
  settings.cancelEdit();
  assert(
    settings.draft.rows.value === initialLayout.rows
      && settings.draft.cols.value === initialLayout.cols
      && settings.draft.windowMode.value === initialWindowMode
      && settings.presentation.windowMode.value === initialWindowMode,
    "cancel should discard the entire edit draft"
  );

  const shortcutError = new Error("occupied");
  const failedLayout = useLaunchpadLayout({ seedEnabled: false });
  const failed = useLaunchpadSettings({
    layout: failedLayout,
    liveDesktopSupport: { value: { supportsLiveDesktopBackground: false } },
    mainWindow: makeMainWindowRuntime({ shortcutError }),
  });
  const failedInitialLayout = failedLayout.captureConfiguration();
  const failedInitialWindowMode = failed.presentation.windowMode.value;
  failed.beginEdit();
  failed.draft.rows.value = 2;
  failed.draft.cols.value = 3;
  failed.actions.setDraftWindowMode(WINDOW_MODE_WINDOWED);
  failed.actions.setDraftMainWindowShortcut("control+alt+KeyL");
  const failedOutcome = await failed.applyEdit();
  assert(!failedOutcome.ok && failedOutcome.error === shortcutError, "shortcut failures should remain explicit");
  assert(
    failedLayout.presentation.gridRows.value === failedInitialLayout.rows
      && failedLayout.presentation.gridCols.value === failedInitialLayout.cols
      && failed.presentation.windowMode.value === failedInitialWindowMode,
    "shortcut failures should commit no domain"
  );
  assert(failed.presentation.mainWindowShortcutError.value.length > 0, "shortcut failures should remain visible in the edit session");

  settings.beginEdit();
  settings.draft.rows.value = 2;
  settings.draft.cols.value = 3;
  settings.actions.setDraftWindowMode(WINDOW_MODE_WINDOWED);
  settings.actions.setDraftMainWindowShortcut("control+alt+KeyL");
  const outcome = await settings.applyEdit({
    reclampPageIndices: () => {},
    schedulePageGridMetrics: () => {},
    syncLiveDesktop: () => { liveDesktopSyncs += 1; },
  });
  assert(outcome.ok, "valid settings should commit successfully");
  assert(layout.presentation.gridRows.value === 2 && layout.presentation.gridCols.value === 3, "successful apply should commit layout configuration once");
  assert(settings.presentation.windowMode.value === WINDOW_MODE_WINDOWED, "successful apply should commit settings values");
  assert(mainWindow.calls.map(([name]) => name).join(",") === "shortcut,mode,effects", "successful apply should register shortcuts before platform presentation");
  assert(liveDesktopSyncs === 1, "successful apply should request one live desktop synchronization");

  settings.persistence.restore({
    textless: true,
    backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
    backgroundEffect: BACKGROUND_EFFECT_BLUR,
    backgroundImagePath: "C:/Images/restored.png",
    windowMode: WINDOW_MODE_WINDOWED,
  });
  const captured = settings.persistence.capture();
  assert(captured.textless && captured.backgroundImagePath === "C:/Images/restored.png", "settings persistence should round-trip committed values");
}
