import type { Container } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { resolveAppearancePreference } from "../../domain/appearancePreference.js";
import type { NativeBackground } from "../../rendering/native/NativeBackground.js";
import type { NativeManagement } from "../../rendering/native/NativeManagement.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import type { NativeWindowChrome } from "../../rendering/native/NativeWindowChrome.js";
import type { createNativeWindowEffects } from "../nativeWindowEffects.js";
import { shouldHideForNativeShortcut } from "../nativeShortcutPolicy.js";

type LaunchFlow = Readonly<{
  closeDesktop(options?: Readonly<{ clearSearch?: boolean }>): void;
  isDesktopOpen: Readonly<{ value: boolean }>;
  isDesktopClosing: Readonly<{ value:boolean }>;
  isAppLaunching: Readonly<{ value:boolean }>;
  isLaunchpadInteractionBlocked(): boolean;
  openDesktop(): void;
}>;
type ResumeTiming = Readonly<{
  begin(info: Readonly<{ minimized: boolean; state: string; visible: boolean }>): void;
  cancel(): void;
  mark(name: string): void;
  measure<T>(name: string, run: () => T): T;
}>;
type Scheduler = Readonly<{
  clearTimeout(id: number): void;
  setTimeout(callback: () => void, delay: number): number;
}>;

// Owns window visibility lifecycle: the generation guard that invalidates stale
// async reveals, the preparing flag, the deferred launch timers, and the
// show/dismiss/toggle entry points. The launch flow and product chrome stay with
// the entry assembly and are reached through explicit ports.
export type NativeVisibilityControllerPorts = Readonly<{
  activateStartupPreparation: () => void;
  app: NativePixiApplication;
  closeSettings: () => void;
  desktopBackground: NativeBackground;
  fadeChrome: (targets: readonly Container[], visible: boolean, material?: boolean) => void;
  flushSaves: () => Promise<void>;
  getLaunchFlow: () => LaunchFlow | null;
  getActivePageIndex: () => number;
  getResumeTiming: () => ResumeTiming | null;
  getSettingsApplying: () => boolean;
  getSettingsMaterial: () => Parameters<ReturnType<typeof createNativeWindowEffects>["set"]>[0];
  getSettingsShell: () => Container | null;
  getSettingsButton: () => Container;
  getAdditionalChrome?: () => readonly Container[];
  getSettingsThemePreference: () => Parameters<typeof resolveAppearancePreference>[0];
  getSystemAppearance: () => Parameters<typeof resolveAppearancePreference>[1];
  isCloseCoordinatorClosing: () => boolean;
  isDragActive: () => boolean;
  isFolderRendered: () => boolean;
  log: (event: string, value?: unknown) => void;
  management: NativeManagement;
  pauseTextPrewarm: () => void;
  present: (description: string) => Promise<void>;
  prioritizeTextPrewarm: (pageIndex: number, targetIndex: number) => void;
  reportError: (error: unknown) => void;
  requestSceneRender: () => void;
  prepareSearchInput: () => void;
  resetFolder: () => void;
  searchBar: NativeSearchBar;
  setTextPrewarmRunning: (start: boolean) => void;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
  windowChrome: NativeWindowChrome;
  windowEffects: ReturnType<typeof createNativeWindowEffects>;
  backgroundVisible: (visible:boolean) => void;
  backgroundDisplayChanged: () => void;
}>;

export type NativeVisibilityController = Readonly<{
  beginCloseAnimation: () => void;
  dismiss: () => void;
  disposeTimers: () => void;
  hideAfterPresented: () => Promise<void>;
  show: () => void;
  hotCorner: (point:Readonly<{x:number;y:number;displayId?:number}>,toggle:boolean) => void;
  preserveViewOnNextShow: () => void;
  timers: Scheduler;
  toggle: () => void;
  shortcut: () => void;
}>;

export function createNativeVisibilityController(
  ports: NativeVisibilityControllerPorts,
): NativeVisibilityController {
  const launchTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextLaunchTimer = 0;
  let visibilityGeneration = 0;
  let visibilityPreparing = false;
  let preserveViewOnNextShow=false;

  const timers: Scheduler = {
    setTimeout: (callback, delay) => {
      const id = ++nextLaunchTimer;
      launchTimers.set(id, setTimeout(() => { launchTimers.delete(id); callback(); }, delay));
      return id;
    },
    clearTimeout: id => { clearTimeout(launchTimers.get(id)); launchTimers.delete(id); },
  };
  const disposeTimers = () => { for (const timer of launchTimers.values()) clearTimeout(timer); launchTimers.clear(); };
  const hideAfterPresented = async () => {
    if (ports.isCloseCoordinatorClosing()) return;
    const generation = visibilityGeneration;
    if (!ports.app.window.isMinimized() && ports.app.state === "running") {
      await ports.present("desktop close animation final frame");
    }
    if (generation !== visibilityGeneration || ports.getLaunchFlow()!.isDesktopOpen.value) return;
    ports.backgroundVisible(false);ports.app.window.hide(); ports.log("hidden");
  };
  const beginCloseAnimation = () => {
    visibilityGeneration++;
    ports.windowEffects.set("none", resolveAppearancePreference(ports.getSettingsThemePreference(), ports.getSystemAppearance()));
    ports.fadeChrome([ports.desktopBackground], false, true);
    const settingsShell = ports.getSettingsShell();
    ports.fadeChrome([
      ports.searchBar, ports.getSettingsButton(), ports.windowChrome, ports.management,...(ports.getAdditionalChrome?.()??[]),
      ...(settingsShell ? [settingsShell] : []),
    ], false);
  };
  const show = () => {
    ports.activateStartupPreparation();
    const framePage = ports.getActivePageIndex();
    ports.prioritizeTextPrewarm(framePage, framePage);
    ports.getResumeTiming()?.begin({ state: ports.app.state, minimized: ports.app.window.isMinimized(), visible: ports.app.window.isVisible() });
    const timing = ports.getResumeTiming();
    const measure = <T>(name: string, run: () => T): T => (timing ? timing.measure(name, run) : run());
    visibilityGeneration++; visibilityPreparing = false;
    const generation = visibilityGeneration;
    ports.log("show-request", { state: ports.app.state, minimized: ports.app.window.isMinimized() });
    if (ports.app.state === "failed") { ports.log("show-failed", "Renderer failed; use tray restart to recover"); return; }
    if (!preserveViewOnNextShow && ports.isFolderRendered()) ports.resetFolder();
    preserveViewOnNextShow=false;
    if (ports.app.window.isMinimized()) measure("unminimize", () => ports.app.window.unminimize());
    measure("materialSet", () => ports.windowEffects.set(ports.getSettingsMaterial(), resolveAppearancePreference(ports.getSettingsThemePreference(), ports.getSystemAppearance())));
    measure("show", () => ports.app.window.show()); measure("activate", () => ports.app.window.activate());
    ports.backgroundVisible(true);
    const reveal = () => {
      if (generation !== visibilityGeneration || ports.isCloseCoordinatorClosing()) return;
      measure("materialRefresh", () => ports.windowEffects.refresh());
      measure("openDesktop", () => ports.getLaunchFlow()!.openDesktop());
      ports.prepareSearchInput();
      ports.fadeChrome([ports.desktopBackground, ports.searchBar, ports.windowChrome, ports.management,...(ports.getAdditionalChrome?.()??[])], true);
      timing?.mark("revealRequested"); ports.setTextPrewarmRunning(true);
      ports.requestSceneRender(); ports.log("shown", { state: ports.app.state });
    };
    if (ports.app.state === "running") reveal();
    else void ports.waitFor("window restored before reveal", () => ports.app.state === "running" && !ports.app.window.isMinimized()).then(reveal)
      .catch(error => ports.log("show-timeout", error));
  };
  const dismiss = () => {
    if (visibilityPreparing || ports.getLaunchFlow()!.isLaunchpadInteractionBlocked() || ports.isDragActive() || ports.getSettingsApplying()) return;
    ports.activateStartupPreparation(); ports.pauseTextPrewarm(); ports.getResumeTiming()?.cancel();
    const generation = ++visibilityGeneration; visibilityPreparing = true;
    void ports.flushSaves().then(() => {
      if (generation !== visibilityGeneration) return;
      visibilityPreparing = false; ports.closeSettings(); ports.getLaunchFlow()!.closeDesktop({ clearSearch: true });
    }).catch(error => { visibilityPreparing = false; ports.reportError(error); });
  };
  const shortcut = () => {
    if (ports.isCloseCoordinatorClosing()) return;
    const visible=ports.app.window.isVisible(),minimized=ports.app.window.isMinimized();
    const target=ports.app.prepareWindowActivation();
    if(target.displayChanged)ports.backgroundDisplayChanged();
    ports.log("shortcut-target",target);
    if (ports.app.state === "running" && ports.getLaunchFlow()!.isDesktopOpen.value && !visibilityPreparing
      && shouldHideForNativeShortcut({visible,minimized,...target})) dismiss();
    else show();
  };
  const hotCorner = (point:Readonly<{x:number;y:number;displayId?:number}>,toggle:boolean) => {
    if(ports.isCloseCoordinatorClosing()||visibilityPreparing||ports.isDragActive()||ports.getSettingsApplying()
      ||ports.getSettingsShell()||ports.management.modal||ports.getLaunchFlow()?.isDesktopClosing.value||ports.getLaunchFlow()?.isAppLaunching.value)return;
    const target=ports.app.prepareWindowActivation(point,true);
    if(target.displayChanged)ports.backgroundDisplayChanged();
    const open=ports.app.window.isVisible()&&!ports.app.window.isMinimized()&&ports.getLaunchFlow()!.isDesktopOpen.value;
    if(open&&target.foreground){if(toggle)dismiss();return;}
    preserveViewOnNextShow=true;
    show();
    ports.log("hot-corner-reveal",{...point,...target});
  };
  const toggle = () => {
    if(ports.isCloseCoordinatorClosing())return;
    if(ports.app.window.isMinimized()||ports.app.state!=="running"||!ports.app.window.isVisible()
      ||!ports.getLaunchFlow()!.isDesktopOpen.value||visibilityPreparing)show();else dismiss();
  };

  return Object.freeze({
    beginCloseAnimation,
    hotCorner,
    dismiss,
    disposeTimers,
    hideAfterPresented,
    show,
    preserveViewOnNextShow:()=>{preserveViewOnNextShow=true;},
    timers,
    toggle,
    shortcut,
  });
}
