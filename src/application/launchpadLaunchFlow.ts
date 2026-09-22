import type { StateCell, StateHost } from "./stateHost.js";
import {
  APP_LAUNCH_DURATION,
  DESKTOP_CLOSE_DURATION,
} from "../domain/launchpadConstants.js";


import type { LaunchFailureReport, LaunchResult } from "../platform/launchpadContracts.js";
import type { TranslationPort } from "../i18n/translationPort.js";
import type {
  LaunchpadApp,
  ReadonlyLaunchpadApp,
  Rect,
} from "../domain/launchpadLayout.js";

const PATH_LAUNCH_TARGET_KINDS = new Set(["shortcut", "executable", "url"]);

export type LaunchTargetStatus = "missing" | "ok" | "unknown" | null;

export type LaunchIconFocus = Readonly<{
  area: "desktop" | "folder" | "search";
  folderId?: string | null;
  id: string;
  pageIndex: number;
}>;

export type LaunchSourceInput = LaunchIconFocus | Readonly<{
  folderId?: string | null;
  pageIndex?: number;
  type: "folder" | "page" | "search";
}>;

export type LaunchErrorDialog = Readonly<{
  message: string;
  suggestion: string;
  title: string;
}>;

export type LaunchGhost = Readonly<{
  app: LaunchpadApp;
  rect: Pick<Rect, "height" | "left" | "top" | "width">;
}>;

type FocusableLaunchpadElement = {
  focus?: (options?: FocusOptions) => void;
};

export type LaunchpadLaunchFlowOptions = Readonly<{
  beginNativeWindowClose?: (() => unknown) | undefined;
  cancelInputGesture(): void;
  clearFocusedIcon(): void;
  clearFolderCloseIconGhosts?: (() => unknown) | undefined;
  clearFolderOpenIconGhosts?: (() => unknown) | undefined;
  clearOpeningIcon(): void;
  clearSearch(options: Readonly<{ keepFocus: boolean }>): void;
  cloneItem(app: ReadonlyLaunchpadApp): LaunchpadApp;
  desktopMainRef: Readonly<StateCell<FocusableLaunchpadElement | null>>;
  finishFolderZoomFadeClose?: (() => unknown) | undefined;
  finishHomeRevealSettleWindow?: (() => unknown) | undefined;
  folderZoomFadeCloseReason?: Readonly<StateCell<string | null>> | undefined;
  getLaunchIconRect(source: LaunchIconFocus): LaunchGhost["rect"] | null;
  getLaunchTargetStatus?: ((app: ReadonlyLaunchpadApp) => LaunchTargetStatus) | undefined;
  hasFolderLayer(): boolean;
  hideNativeWindow(): unknown;
  onDesktopCloseComplete?: (()=>unknown) | undefined;
  initialDesktopOpen?: boolean | undefined;
  isDragActive(): boolean;
  isFolderAppLaunchClosing: Readonly<StateCell<boolean>>;
  isFolderZoomFadeClosing?: Readonly<StateCell<boolean>> | undefined;
  isSearchMode(): boolean;
  keyboardFocusArea: StateCell<string>;
  launchNativeAppIfAvailable(app: ReadonlyLaunchpadApp, elevated?: boolean): LaunchResult | Promise<LaunchResult>;
  restoreAfterLaunchCancelled?: () => void;
  shouldWaitForElevation?: ((app: ReadonlyLaunchpadApp, elevated: boolean) => boolean) | undefined;
  waitForAppLaunchAnimation?: (() => Promise<void>) | undefined;
  launchTargetStatusById?: Readonly<StateCell<Readonly<Record<string, Exclude<LaunchTargetStatus, null>>>>> | undefined;
  localizationText?: TranslationPort | undefined;
  normalizeLaunchSource(app: ReadonlyLaunchpadApp, source: LaunchSourceInput | null | undefined): LaunchIconFocus;
  openLaunchErrorDialog?: ((config: LaunchErrorDialog) => unknown) | undefined;
  openingIcon: StateCell<LaunchIconFocus | null>;
  prepareNativeLaunch?: ((app: ReadonlyLaunchpadApp) => boolean | Promise<boolean>) | undefined;
  schedulePageGridMetrics(): void;
  searchInputRef: Readonly<StateCell<{ blur?: () => void } | null>>;
  shouldValidateLaunchTarget?: (() => boolean) | undefined;
  showNativeLaunchError?: ((error: LaunchFailureReport) => unknown) | undefined;
  startFolderZoomFadeClose?: ((options: Readonly<{ reason: "app-launch" }>) => unknown) | undefined;
  startHomeRevealSettleWindow(): void;
}>;

type LaunchSession = {
  waitForElevation: boolean;
  elevated: boolean;
  cancelled: boolean;
  animationDone: boolean;
  app: LaunchpadApp;
  error: LaunchFailureReport | null;
  id: number;
  nativeLaunchStarted: boolean;
  shown: boolean;
};

export type LaunchFlowScheduler = {
  setTimeout(callback:()=>void, delay:number):number;
  clearTimeout(id:number):void;
  afterCommit(callback:()=>void):void;
};

export function createLaunchpadLaunchFlow(options: LaunchpadLaunchFlowOptions, host:StateHost, scheduler:LaunchFlowScheduler) {
  const ref=host.cell, shallowRef=host.cell, computed=host.derived;
  const localizationText = options.localizationText;
  if (!localizationText || typeof localizationText.t !== "function") {
    throw new TypeError("useLaunchpadLaunchFlow requires localization text");
  }
  const t: TranslationPort["t"] = localizationText.t;
  const isDesktopOpen = ref(options.initialDesktopOpen !== false);
  const isDesktopClosing = ref(false);
  const isAppLaunching = ref(false);
  const appLaunchCloseSessionId = ref<number | null>(null);
  const launchGhost = shallowRef<LaunchGhost | null>(null);
  let desktopCloseTimer: number | null = null;
  let appLaunchTimer: number | null = null;
  let launchGhostTimer: number | null = null;
  let launchPrepareRequestId = 0;
  let nextAppLaunchCloseSessionId = 0;
  let activeAppLaunchSession: LaunchSession | null = null;

  const launchGhostStyle = computed<Record<string,string>>(() => {
    const ghost = launchGhost.value;
    if (!ghost?.rect) return {} as Record<string,string>;
    return {
      left: `${ghost.rect.left}px`,
      top: `${ghost.rect.top}px`,
      width: `${ghost.rect.width}px`,
      height: `${ghost.rect.height}px`,
    };
  });

  function isLaunchpadInteractionBlocked() {
    return Boolean(
      !isDesktopOpen.value ||
      isDesktopClosing.value ||
      isAppLaunching.value ||
      options.isFolderAppLaunchClosing.value ||
      options.isFolderZoomFadeClosing?.value
    );
  }

  function clearDesktopCloseTimer() {
    if (desktopCloseTimer) scheduler.clearTimeout(desktopCloseTimer);
    desktopCloseTimer = null;
  }

  function clearAppLaunchTimer() {
    if (appLaunchTimer) scheduler.clearTimeout(appLaunchTimer);
    appLaunchTimer = null;
  }

  function clearLaunchGhostTimer() {
    if (launchGhostTimer) scheduler.clearTimeout(launchGhostTimer);
    launchGhostTimer = null;
  }

  function clearLaunchGhost() {
    clearLaunchGhostTimer();
    launchGhost.value = null;
  }

  function focusDesktopSurface() {
    options.keyboardFocusArea.value = "desktop";
    const element = options.desktopMainRef.value;
    element?.focus?.({ preventScroll: true });
  }

  function startAppLaunchGhost(app: ReadonlyLaunchpadApp, launchSource: LaunchIconFocus): void {
    const rect = options.getLaunchIconRect(launchSource);
    if (!rect) {
      clearLaunchGhost();
      return;
    }
    clearLaunchGhostTimer();
    launchGhost.value = { app: options.cloneItem(app), rect };
    if (!options.waitForAppLaunchAnimation) launchGhostTimer = scheduler.setTimeout(clearLaunchGhost, APP_LAUNCH_DURATION + 100);
  }

  function getLaunchPreflightError(app: ReadonlyLaunchpadApp): LaunchErrorDialog | null {
    if (!options.shouldValidateLaunchTarget?.()) return null;
    const name = String(app?.name || t("errors.launch.appFallback"));
    if (!app?.id) {
      return {
        title: t("errors.launch.genericTitle"),
        message: t("errors.launch.missingId", { appName: name }),
        suggestion: t("errors.launch.suggestion.readd"),
      };
    }

    const target = app.launchTarget;
    if (!target) {
      return {
        title: t("errors.launch.genericTitle"),
        message: t("errors.launch.missingTarget", { appName: name }),
        suggestion: t("errors.launch.suggestion.chooseTarget"),
      };
    }

    const kind = String(target.kind || "");
    if (kind === "appUserModelId") {
      if (!String(target.appUserModelId || "").trim()) {
        return {
          title: t("errors.launch.genericTitle"),
          message: t("errors.launch.missingWindowsId", { appName: name }),
          suggestion: t("errors.launch.suggestion.rescan"),
        };
      }
      if (currentLaunchTargetStatus(app) === "missing") {
        return {
          title: t("errors.launch.genericTitle"),
          message: t("errors.launch.windowsNotFound", { appName: name }),
          suggestion: t("errors.launch.suggestion.rescanOrRemove"),
        };
      }
      return null;
    }
    if (!PATH_LAUNCH_TARGET_KINDS.has(kind)) {
      return {
        title: t("errors.launch.genericTitle"),
        message: t("errors.launch.invalidKind", { appName: name }),
        suggestion: t("errors.launch.suggestion.chooseTarget"),
      };
    }
    if (!String(target.path || "").trim()) {
      return {
        title: t("errors.launch.genericTitle"),
        message: t("errors.launch.emptyPath", { appName: name }),
        suggestion: t("errors.launch.suggestion.chooseTarget"),
      };
    }
    if (currentLaunchTargetStatus(app) === "missing") {
      return {
        title: t("errors.launch.genericTitle"),
        message: t("errors.launch.pathMissing", { appName: name }),
        suggestion: t("errors.launch.suggestion.editTarget"),
      };
    }
    return null;
  }

  function isPromiseLike<Value>(value: Value | PromiseLike<Value>): value is PromiseLike<Value> {
    return Boolean(value && typeof (value as { then?: unknown }).then === "function");
  }

  function currentLaunchTargetStatus(app: ReadonlyLaunchpadApp): LaunchTargetStatus {
    if (typeof options.getLaunchTargetStatus === "function") return options.getLaunchTargetStatus(app);
    return options.launchTargetStatusById?.value?.[app.id] || null;
  }

  function closeDesktop(closeOptions?: Readonly<{ clearSearch?: boolean }>): void {
    if (options.isDragActive()) return;
    options.cancelInputGesture();
    options.beginNativeWindowClose?.();
    const shouldClearSearchAfterClose = Boolean(closeOptions?.clearSearch && options.isSearchMode());
    options.clearFocusedIcon();
    options.keyboardFocusArea.value = "desktop";
    options.searchInputRef.value?.blur?.();
    isDesktopClosing.value = true;
    isDesktopOpen.value = false;
    clearDesktopCloseTimer();
    desktopCloseTimer = scheduler.setTimeout(() => {
      if (shouldClearSearchAfterClose) options.clearSearch({ keepFocus: false });
      isDesktopClosing.value = false;
      clearDesktopCloseTimer();
      if(!isAppLaunching.value)options.onDesktopCloseComplete?.();
    }, DESKTOP_CLOSE_DURATION);
  }

  function openDesktop() {
    activeAppLaunchSession = null;
    appLaunchCloseSessionId.value = null;
    clearDesktopCloseTimer();
    clearAppLaunchTimer();
    clearLaunchGhost();
    options.clearOpeningIcon();
    const didClearFolderZoomFadeClose = Boolean(options.folderZoomFadeCloseReason?.value);
    if (options.folderZoomFadeCloseReason?.value) {
      options.finishFolderZoomFadeClose?.();
      options.clearFolderOpenIconGhosts?.();
      options.clearFolderCloseIconGhosts?.();
      options.finishHomeRevealSettleWindow?.();
    }
    if (!didClearFolderZoomFadeClose) options.startHomeRevealSettleWindow();
    isDesktopClosing.value = false;
    isAppLaunching.value = false;
    isDesktopOpen.value = true;
    options.keyboardFocusArea.value = "desktop";
    scheduler.afterCommit(() => {
      options.schedulePageGridMetrics();
      focusDesktopSurface();
    });
  }

  function startPreparedAppLaunch(
    app: ReadonlyLaunchpadApp,
    source: LaunchSourceInput | null | undefined,
    elevated = false,
  ): void {
    const launchSource = options.normalizeLaunchSource(app, source);
    const shouldClearSearchAfterLaunch = options.isSearchMode();
    const sessionApp = options.cloneItem(app);
    const launchSession = {
      waitForElevation: options.shouldWaitForElevation?.(sessionApp,elevated) === true,
      elevated,
      cancelled: false,
      animationDone: false,
      app: sessionApp,
      error: null,
      id: (nextAppLaunchCloseSessionId += 1),
      nativeLaunchStarted: false,
      shown: false,
    };
    activeAppLaunchSession = launchSession;
    appLaunchCloseSessionId.value = launchSession.id;
    startAppLaunchGhost(sessionApp, launchSource);
    options.openingIcon.value = launchSource;
    isAppLaunching.value = true;

    if (options.hasFolderLayer()) options.startFolderZoomFadeClose?.({ reason: "app-launch" });
    closeDesktop({ clearSearch: false });

    clearAppLaunchTimer();
    const finishLaunchAnimation = () => {
      if (activeAppLaunchSession !== launchSession) return;
      if (shouldClearSearchAfterLaunch) options.clearSearch({ keepFocus: false });
      options.clearOpeningIcon();
      isAppLaunching.value = false;
      clearAppLaunchTimer();
      Promise.resolve(options.hideNativeWindow())
        .then(() => {
          if (activeAppLaunchSession !== launchSession) return;
          launchSession.animationDone = true;
          if(launchSession.waitForElevation)commitAppLaunchCloseFrame(launchSession.id);
          if (options.waitForAppLaunchAnimation) clearLaunchGhost();
          maybeShowLaunchErrorAfterAnimation(launchSession);
        }).catch(error=>{
          console.error("Unable to hide launcher before launch",error);
          if(activeAppLaunchSession===launchSession)options.restoreAfterLaunchCancelled?.();
        });
    };
    appLaunchTimer = scheduler.setTimeout(() => {
      if (options.waitForAppLaunchAnimation) {
        void options.waitForAppLaunchAnimation().then(finishLaunchAnimation).catch(error => {
          console.error("Launch animation could not complete", error);
          finishLaunchAnimation();
        });
      } else finishLaunchAnimation();
    }, APP_LAUNCH_DURATION);
  }

  function commitAppLaunchCloseFrame(sessionId: unknown): boolean {
    const launchSession = activeAppLaunchSession;
    if (
      !Number.isInteger(sessionId) ||
      !launchSession ||
      launchSession.id !== sessionId ||
      launchSession.nativeLaunchStarted
    ) {
      return false;
    }
    if(launchSession.waitForElevation&&!launchSession.animationDone)return false;
    launchSession.nativeLaunchStarted = true;
    appLaunchCloseSessionId.value = null;
    let launchResult;
    try {
      launchResult = options.launchNativeAppIfAvailable(launchSession.app, launchSession.elevated);
    } catch (error) {
      console.error(`Failed to launch ${launchSession.app.name}`, error);
      return true;
    }
    Promise.resolve(launchResult)
      .then((result) => {
        if (result && result !== true && result.kind === "cancelled") {
          launchSession.cancelled = true;
          maybeShowLaunchErrorAfterAnimation(launchSession);
          return;
        }
        if (result && result !== true && result.kind !== "cancelled" && "message" in result) {
          launchSession.error = result;
          maybeShowLaunchErrorAfterAnimation(launchSession);
        }
      })
      .catch((error) => {
        console.error(`Failed to launch ${launchSession.app.name}`, error);
      });
    return true;
  }

  function maybeShowLaunchErrorAfterAnimation(launchSession: LaunchSession | null): void {
    if (launchSession && activeAppLaunchSession === launchSession && launchSession.animationDone && launchSession.cancelled && !launchSession.shown) {
      launchSession.shown = true; options.restoreAfterLaunchCancelled?.(); return;
    }
    if (!launchSession || launchSession.shown || !launchSession.animationDone || !launchSession.error) return;
    launchSession.shown = true;
    options.showNativeLaunchError?.(launchSession.error);
  }

  function openApp(app: ReadonlyLaunchpadApp | null | undefined, source?: LaunchSourceInput, elevated = false): void {
    if (!app || app.type !== "app" || options.isDragActive() || isLaunchpadInteractionBlocked()) return;
    const launchError = getLaunchPreflightError(app);
    if (launchError) {
      options.openLaunchErrorDialog?.(launchError);
      return;
    }

    const requestId = (launchPrepareRequestId += 1);
    const prepared = options.prepareNativeLaunch?.(app);
    if (!isPromiseLike(prepared)) {
      if (prepared === false) return;
      startPreparedAppLaunch(app, source, elevated);
      return;
    }

    prepared
      .then((ready) => {
        if (requestId !== launchPrepareRequestId || !ready) return;
        if (!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value || options.isDragActive()) return;
        startPreparedAppLaunch(app, source, elevated);
      })
      .catch((error) => {
        console.error(`Failed to prepare ${app.name} for launch`, error);
      });
  }

  return {
    appLaunchCloseSessionId,
    clearAppLaunchTimer,
    clearDesktopCloseTimer,
    clearLaunchGhost,
    clearLaunchGhostTimer,
    closeDesktop,
    commitAppLaunchCloseFrame,
    focusDesktopSurface,
    isAppLaunching,
    isDesktopClosing,
    isDesktopOpen,
    isLaunchpadInteractionBlocked,
    launchGhost,
    launchGhostStyle,
    openApp,
    openDesktop,
  };
}
