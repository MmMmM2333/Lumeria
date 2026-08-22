import { computed, nextTick, ref, shallowRef, type CSSProperties, type Ref } from "vue";
import {
  APP_LAUNCH_DURATION,
  DESKTOP_CLOSE_DURATION,
} from "./launchpadConstants.js";
import { getElementFromRef } from "./usePageGridMetrics.js";
import type { DomRefSource, MeasurableElement } from "./usePageGridMetrics.js";
import type { LaunchFailureReport } from "../api/launchpadApi.js";
import type { LocalizationText } from "../i18n/localization.js";
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

type FocusableLaunchpadElement = MeasurableElement & {
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
  desktopMainRef: DomRefSource<FocusableLaunchpadElement>;
  finishFolderZoomFadeClose?: (() => unknown) | undefined;
  finishHomeRevealSettleWindow?: (() => unknown) | undefined;
  folderZoomFadeCloseReason?: Readonly<Ref<string | null>> | undefined;
  getLaunchIconRect(source: LaunchIconFocus): LaunchGhost["rect"] | null;
  getLaunchTargetStatus?: ((app: ReadonlyLaunchpadApp) => LaunchTargetStatus) | undefined;
  hasFolderLayer(): boolean;
  hideNativeWindow(): unknown;
  initialDesktopOpen?: boolean | undefined;
  isDragActive(): boolean;
  isFolderAppLaunchClosing: Readonly<Ref<boolean>>;
  isFolderZoomFadeClosing?: Readonly<Ref<boolean>> | undefined;
  isSearchMode(): boolean;
  keyboardFocusArea: Ref<string>;
  launchNativeAppIfAvailable(app: ReadonlyLaunchpadApp): true | LaunchFailureReport | undefined | Promise<true | LaunchFailureReport | undefined>;
  launchTargetStatusById?: Readonly<Ref<Readonly<Record<string, Exclude<LaunchTargetStatus, null>>>>> | undefined;
  localizationText?: Pick<LocalizationText, "t"> | undefined;
  normalizeLaunchSource(app: ReadonlyLaunchpadApp, source: LaunchSourceInput | null | undefined): LaunchIconFocus;
  openLaunchErrorDialog?: ((config: LaunchErrorDialog) => unknown) | undefined;
  openingIcon: Ref<LaunchIconFocus | null>;
  prepareNativeLaunch?: ((app: ReadonlyLaunchpadApp) => boolean | Promise<boolean>) | undefined;
  schedulePageGridMetrics(): void;
  searchInputRef: Readonly<Ref<{ blur?: () => void } | null>>;
  setNativeWindowEffectsEnabled(enabled: boolean): unknown;
  setNativeWindowFrameEnabled?: ((enabled: boolean) => unknown) | undefined;
  shouldValidateLaunchTarget?: (() => boolean) | undefined;
  showNativeLaunchError?: ((error: LaunchFailureReport) => unknown) | undefined;
  startFolderZoomFadeClose?: ((options: Readonly<{ reason: "app-launch" }>) => unknown) | undefined;
  startHomeRevealSettleWindow(): void;
}>;

type LaunchSession = {
  animationDone: boolean;
  app: LaunchpadApp;
  error: LaunchFailureReport | null;
  id: number;
  nativeLaunchStarted: boolean;
  shown: boolean;
};

export function useLaunchpadLaunchFlow(options: LaunchpadLaunchFlowOptions) {
  const localizationText = options.localizationText;
  if (!localizationText || typeof localizationText.t !== "function") {
    throw new TypeError("useLaunchpadLaunchFlow requires localization text");
  }
  const t: LocalizationText["t"] = localizationText.t;
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

  const launchGhostStyle = computed<CSSProperties>(() => {
    const ghost = launchGhost.value;
    if (!ghost?.rect) return {};
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
    if (desktopCloseTimer) window.clearTimeout(desktopCloseTimer);
    desktopCloseTimer = null;
  }

  function clearAppLaunchTimer() {
    if (appLaunchTimer) window.clearTimeout(appLaunchTimer);
    appLaunchTimer = null;
  }

  function clearLaunchGhostTimer() {
    if (launchGhostTimer) window.clearTimeout(launchGhostTimer);
    launchGhostTimer = null;
  }

  function clearLaunchGhost() {
    clearLaunchGhostTimer();
    launchGhost.value = null;
  }

  function focusDesktopSurface() {
    options.keyboardFocusArea.value = "desktop";
    const element = getElementFromRef(options.desktopMainRef);
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
    launchGhostTimer = window.setTimeout(clearLaunchGhost, APP_LAUNCH_DURATION + 100);
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
    options.setNativeWindowEffectsEnabled(false);
    options.setNativeWindowFrameEnabled?.(false);
    const shouldClearSearchAfterClose = Boolean(closeOptions?.clearSearch && options.isSearchMode());
    options.clearFocusedIcon();
    options.keyboardFocusArea.value = "desktop";
    options.searchInputRef.value?.blur?.();
    isDesktopClosing.value = true;
    isDesktopOpen.value = false;
    clearDesktopCloseTimer();
    desktopCloseTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterClose) options.clearSearch({ keepFocus: false });
      isDesktopClosing.value = false;
      clearDesktopCloseTimer();
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
    nextTick(() => {
      options.schedulePageGridMetrics();
      focusDesktopSurface();
    });
  }

  function startPreparedAppLaunch(
    app: ReadonlyLaunchpadApp,
    source: LaunchSourceInput | null | undefined,
  ): void {
    const launchSource = options.normalizeLaunchSource(app, source);
    const shouldClearSearchAfterLaunch = options.isSearchMode();
    const sessionApp = options.cloneItem(app);
    const launchSession = {
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
    appLaunchTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterLaunch) options.clearSearch({ keepFocus: false });
      options.clearOpeningIcon();
      isAppLaunching.value = false;
      clearAppLaunchTimer();
      launchSession.animationDone = true;
      Promise.resolve(options.hideNativeWindow())
        .finally(() => maybeShowLaunchErrorAfterAnimation(launchSession));
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
    launchSession.nativeLaunchStarted = true;
    appLaunchCloseSessionId.value = null;
    let launchResult;
    try {
      launchResult = options.launchNativeAppIfAvailable(launchSession.app);
    } catch (error) {
      console.error(`Failed to launch ${launchSession.app.name}`, error);
      return true;
    }
    Promise.resolve(launchResult)
      .then((result) => {
        if (result && result !== true) {
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
    if (!launchSession || launchSession.shown || !launchSession.animationDone || !launchSession.error) return;
    launchSession.shown = true;
    options.showNativeLaunchError?.(launchSession.error);
  }

  function openApp(app: ReadonlyLaunchpadApp | null | undefined, source?: LaunchSourceInput): void {
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
      startPreparedAppLaunch(app, source);
      return;
    }

    prepared
      .then((ready) => {
        if (requestId !== launchPrepareRequestId || !ready) return;
        if (!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value || options.isDragActive()) return;
        startPreparedAppLaunch(app, source);
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
