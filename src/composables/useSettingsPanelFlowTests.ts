import {
  DESKTOP_CLOSE_DURATION,
  DESKTOP_CLOSE_SCALE,
  SETTINGS_PANEL_CLOSE_DURATION,
} from "./launchpadConstants.js";
import { useSettingsPanelFlow } from "./useSettingsPanelFlow.js";

function withMockWindow(run: (timers: Array<() => void>) => void): void {
  const hadWindow = typeof globalThis.window !== "undefined";
  const originalWindow = globalThis.window;
  const timers: Array<() => void> = [];
  const mockWindow = {
    clearTimeout: () => {},
    innerHeight: 900,
    innerWidth: 1200,
    setTimeout: (callback: TimerHandler) => {
      if (typeof callback !== "function") throw new TypeError("settings flow timer callback must be callable");
      timers.push(() => callback());
      return timers.length;
    },
  } as unknown as Window & typeof globalThis;
  globalThis.window = mockWindow;

  try {
    run(timers);
  } finally {
    if (!hadWindow) Reflect.deleteProperty(globalThis, "window");
    else globalThis.window = originalWindow;
  }
}

function createHarness(overrides: Readonly<{ isDragActive?: boolean }> = {}) {
  const calls = {
    beginEdit: 0,
    cancelEdit: 0,
    closeManagedAppEditor: 0,
    closeScanResults: 0,
  };
  const flow = useSettingsPanelFlow({
    beginSettingsEdit: () => { calls.beginEdit += 1; },
    cancelSettingsEdit: () => { calls.cancelEdit += 1; },
    closeManagedAppEditor: () => { calls.closeManagedAppEditor += 1; },
    closeScanResults: () => { calls.closeScanResults += 1; },
    isDragActive: () => Boolean(overrides.isDragActive),
  });
  return { calls, flow };
}

export function runSettingsPanelFlowTests() {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`[Settings panel flow test failed] ${message}`);
  };

  withMockWindow(() => {
    const { calls, flow } = createHarness();
    flow.openSettingsPanel();
    assert(flow.isSettingsPanelOpen.value, "opening settings should show the panel");
    assert(calls.beginEdit === 1, "opening settings should begin one owner-managed edit session");

    flow.closeSettingsPanel();
    assert(!flow.isSettingsPanelOpen.value, "closing settings should hide the panel");
    assert(flow.settingsPanelAnimate.value.scaleX < 1, "panel close should shrink toward the settings button");
    assert(flow.settingsPanelCloseDurationSeconds.value === SETTINGS_PANEL_CLOSE_DURATION / 1000, "panel close should use the settings duration");
    assert(calls.cancelEdit === 1, "closing settings should cancel one owner-managed edit session");
    assert(calls.closeManagedAppEditor === 1, "closing settings should close the managed-app editor");
    assert(calls.closeScanResults === 1, "closing settings should close scan results");
  });

  withMockWindow(() => {
    const { calls, flow } = createHarness({ isDragActive: true });
    flow.openSettingsPanel();
    assert(!flow.isSettingsPanelOpen.value, "drag-active settings should not open");
    assert(calls.beginEdit === 0, "a blocked open should not begin an edit session");
  });

  withMockWindow((timers) => {
    const { flow } = createHarness();
    flow.openSettingsPanel();
    flow.closeSettingsPanel({ mode: "desktop" });
    assert(flow.settingsPanelAnimate.value.opacity === 0, "desktop close should fade the panel");
    assert(flow.settingsPanelAnimate.value.scaleX === DESKTOP_CLOSE_SCALE, "desktop close should match desktop scale");
    assert(flow.settingsPanelCloseDurationSeconds.value === DESKTOP_CLOSE_DURATION / 1000, "desktop close should match desktop duration");
    assert(timers.length === 1, "desktop close should schedule cleanup");
    timers[0]!();
    assert(!flow.shouldRenderSettingsPanel.value, "desktop close cleanup should unmount the panel");
  });
}
