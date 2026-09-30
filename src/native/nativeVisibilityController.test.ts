import assert from "node:assert/strict";
import { createNativeVisibilityController, type NativeVisibilityControllerPorts } from "./product/nativeVisibilityController.js";

function fixture(initial: { visible?: boolean; minimized?: boolean; state?: string } = {}) {
  let visible = initial.visible ?? false, minimized = initial.minimized ?? false;
  let state = initial.state ?? "running", desktopVisible = false, closing = false;
  const calls: string[] = [], errors: unknown[] = [];
  const presents: { resolve(): void; reject(error: Error): void }[] = [];
  const waits: (() => void)[] = [];
  const background = { alpha: 0 };
  const flow = {
    isDesktopOpen: { value: false }, isDesktopClosing: { value: false }, isAppLaunching: { value: false },
    isLaunchpadInteractionBlocked: () => false,
    openDesktop() { flow.isDesktopOpen.value = true; calls.push("openDesktop"); },
    closeDesktop() { flow.isDesktopOpen.value = false; calls.push("closeDesktop"); },
  };
  const ports = {
    app: { get state() { return state; }, window: {
      isVisible: () => visible, isMinimized: () => minimized,
      show() { visible = true; calls.push("show"); }, hide() { visible = false; calls.push("hide"); },
      activate() { calls.push("activate"); }, unminimize() { minimized = false; calls.push("unminimize"); },
    } },
    activateStartupPreparation() {}, prioritizeTextPrewarm() {}, getActivePageIndex: () => 0,
    getResumeTiming: () => null, isFolderRendered: () => false, isCloseCoordinatorClosing: () => closing,
    isDesktopFrameVisible: () => desktopVisible, getSettingsMaterial: () => "acrylic",
    getSettingsThemePreference: () => "dark", getSystemAppearance: () => "dark",
    windowEffects: { set() { calls.push("material"); }, refresh() { calls.push("refresh"); } },
    backgroundVisible() {}, getLaunchFlow: () => flow, prepareSearchInput() {}, setTextPrewarmRunning() {},
    desktopBackground: background, searchBar: {}, windowChrome: {}, management: {},
    fadeChrome(targets: unknown[], reveal: boolean, immediate: boolean) {
      if (targets.includes(background)) { assert.equal(immediate, true); background.alpha = reveal ? 1 : 0; }
    },
    requestSceneRender() { calls.push("renderRequested"); },
    present() { calls.push("presentRequested"); return new Promise<void>((resolve, reject) => presents.push({ resolve, reject })); },
    waitFor(_description: string, predicate: () => boolean) {
      return new Promise<void>(resolve => waits.push(() => { assert.ok(predicate()); resolve(); }));
    },
    flushSaves: () => Promise.resolve(), pauseTextPrewarm() {}, closeSettings() {},
    isDragActive: () => false, getSettingsApplying: () => false, getSettingsShell: () => null,
    getSettingsButton: () => ({}), log() {}, reportError: (error: unknown) => errors.push(error),
  } as unknown as NativeVisibilityControllerPorts;
  return { controller: createNativeVisibilityController(ports), calls, presents, waits, errors, flow, background,
    visible: () => visible, setFrameVisible: () => { desktopVisible = true; },
    setRunning: () => { state = "running"; }, close: () => { closing = true; } };
}
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

{
  const f = fixture(); f.controller.show();
  assert.equal(f.visible(), false, "a hidden window stays hidden while its old transparent frame is retained");
  assert.equal(f.background.alpha, 1, "the prepared frame contains the configured background");
  assert.equal(f.calls.includes("material"), false, "do not expose the backdrop before preparing content");
  f.presents[0]!.resolve(); await flush();
  assert.equal(f.visible(), false, "the entrance motion's alpha-zero first frame must not reveal the window");
  assert.equal(f.presents.length, 2);
  f.setFrameVisible(); f.presents[1]!.resolve(); await flush();
  assert.equal(f.visible(), true); assert.equal(f.calls.filter(x => x === "show").length, 1);
  assert.equal(f.calls.includes("activate"), false, "show already activates the native window");
  assert.equal(f.calls.includes("refresh"), false, "avoid a duplicate synchronous backdrop refresh");
}
{
  const f = fixture(); f.controller.show(); f.controller.show(); f.setFrameVisible();
  f.presents[0]!.resolve(); await flush(); assert.equal(f.visible(), false, "a newer request supersedes an old prepared frame");
  f.presents[1]!.resolve(); await flush(); assert.equal(f.visible(), true);
}
{
  const f = fixture(); f.controller.show(); f.controller.dismiss(); await flush();
  f.setFrameVisible(); f.presents[0]!.resolve(); await flush();
  assert.equal(f.visible(), false, "dismiss invalidates a pending asynchronous reveal"); assert.equal(f.flow.isDesktopOpen.value, false);
}
{
  const f = fixture(); f.controller.show(); f.close(); f.setFrameVisible(); f.presents[0]!.resolve(); await flush();
  assert.equal(f.visible(), false, "shutdown cannot revive a prepared window");
}
{
  const f = fixture(); f.controller.show(); f.presents[0]!.reject(new Error("GPU preparation failed")); await flush();
  assert.equal(f.visible(), false); assert.equal(f.errors.length, 1, "a failed presentation remains observable");
}
{
  const f = fixture({ visible: true, minimized: true, state: "suspended" }); f.controller.show();
  assert.ok(f.calls.includes("unminimize")); assert.equal(f.calls.includes("show"), false);
  f.setRunning(); f.waits[0]!(); await flush(); assert.ok(f.calls.includes("show"));
  assert.equal(f.presents.length, 0, "restoring an already visible window does not wait on a hidden surface");
}
{
  const f = fixture({ state: "failed" }); f.controller.show(); assert.deepEqual(f.calls, []);
}
console.log("Native reveal: visible-frame gate, background preparation, supersession, cancellation, failures and minimized restore passed");
