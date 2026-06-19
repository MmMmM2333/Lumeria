import { nextTick } from "vue";
import {
  DEV_OPEN_DESKTOP_SHORTCUT_CODE,
  WHEEL_PAGE_LOCK_DURATION,
  WHEEL_PAGE_THRESHOLD,
} from "./launchpadConstants.js";
import { getElementFromRef } from "./usePageGridMetrics.js";

function isTextEntryElement(element) {
  if (!element) return false;
  const tagName = element.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    element.isContentEditable
  );
}

function isDevOpenDesktopShortcut(event) {
  return Boolean(event.ctrlKey && event.shiftKey && event.code === DEV_OPEN_DESKTOP_SHORTCUT_CODE);
}

export function useLaunchpadKeyboard(options) {
  let wheelPageLockUntil = 0;
  let pendingDesktopPageTurnId = 0;

  function requestAnimationFrameOnce(callback) {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      callback();
      return;
    }
    window.requestAnimationFrame(callback);
  }

  function hasFolderInteractionLayer() {
    return Boolean(options.renderedFolder.value && (
      options.openFolderId.value ||
      options.isFolderClosing.value ||
      options.isFolderAppLaunchClosing.value ||
      options.isFolderZoomFadeClosing?.value
    ));
  }

  function isAltSpaceShortcut(event) {
    return Boolean(event.altKey && !event.ctrlKey && !event.metaKey && (event.key === " " || event.code === "Space"));
  }

  function handleAltSpaceKey(event) {
    if (!hasFolderInteractionLayer() || options.isFolderAppLaunchClosing.value || options.isFolderZoomFadeClosing?.value) return false;
    event.preventDefault();
    options.cancelAltEditMode?.();
    options.clearSelectedIcon?.();
    if (!options.startFolderZoomFadeClose?.({ reason: "desktop" })) return true;
    options.closeDesktop?.({ clearSearch: false });
    options.hideNativeWindowAfterCloseAnimation?.();
    return true;
  }

  function getNextDesktopPageIndex(step) {
    const next = options.pageIndex.value + step;
    if (next < 0 || next > options.pages.value.length - 1) return null;
    return next;
  }

  function commitDesktopPageIndex(next, turnOptions) {
    if (options.isHomeRevealSettling.value) {
      options.finishHomeRevealSettleWindow();
      nextTick(() => requestAnimationFrameOnce(() => {
        options.commitPageIndex(next);
        if (turnOptions?.selectFirst) nextTick(() => options.selectFirstIconInCurrentScope({ force: true }));
      }));
      return true;
    }

    options.commitPageIndex(next);
    return false;
  }

  function queueDesktopPageTurnAfterFolderClose(step, turnOptions) {
    if (getNextDesktopPageIndex(step) === null) return false;

    const requestId = (pendingDesktopPageTurnId += 1);
    requestAnimationFrameOnce(function waitForFolderClose() {
      if (requestId !== pendingDesktopPageTurnId) return;
      if (hasFolderInteractionLayer()) {
        requestAnimationFrameOnce(waitForFolderClose);
        return;
      }

      const next = getNextDesktopPageIndex(step);
      if (next !== null) commitDesktopPageIndex(next, turnOptions);
    });

    return true;
  }

  function turnCurrentPage(direction, turnOptions) {
    const step = direction > 0 ? 1 : -1;
    let didTurn = false;
    let didDeferSelection = false;

    if (hasFolderInteractionLayer()) {
      if (options.isFolderClosing.value) {
        didTurn = queueDesktopPageTurnAfterFolderClose(step, turnOptions);
        didDeferSelection = didTurn && Boolean(turnOptions?.selectFirst);
      } else {
        const next = options.folderPageIndex.value + step;
        if (next >= 0 && next <= options.folderPages.value.length - 1) {
          options.commitFolderPageIndex(next);
          didTurn = true;
        }
      }
    } else if (options.isSearchMode.value) {
      const next = options.searchPageIndex.value + step;
      if (next >= 0 && next <= options.searchPages.value.length - 1) {
        options.commitSearchPageIndex(next);
        didTurn = true;
      }
    } else {
      const next = getNextDesktopPageIndex(step);
      if (next !== null) {
        didDeferSelection = commitDesktopPageIndex(next, turnOptions);
        didTurn = true;
      }
    }

    if (didTurn && turnOptions?.selectFirst && !didDeferSelection) nextTick(() => options.selectFirstIconInCurrentScope({ force: true }));
    return didTurn;
  }

  function handleLaunchpadWheel(event) {
    if (!options.isDesktopOpen.value || options.isDragActive() || options.isAppLaunching.value) return;
    const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(primaryDelta) < WHEEL_PAGE_THRESHOLD) return;

    const now = Date.now();
    if (now < wheelPageLockUntil) return;
    if (turnCurrentPage(primaryDelta > 0 ? 1 : -1, { selectFirst: false })) {
      event.preventDefault();
      wheelPageLockUntil = now + WHEEL_PAGE_LOCK_DURATION;
    }
  }

  function appendDesktopSearchText(text) {
    if (!text || hasFolderInteractionLayer()) return;
    options.searchQuery.value = `${options.searchQuery.value}${text}`;
    options.commitSearchPageIndex(0);
    options.keyboardFocusArea.value = "desktop";
    nextTick(() => options.selectFirstIconInCurrentScope({ force: true }));
    options.schedulePageGridMetrics();
  }

  function deleteDesktopSearchText() {
    if (!options.searchQuery.value || hasFolderInteractionLayer()) return;
    options.searchQuery.value = options.searchQuery.value.slice(0, -1);
    options.commitSearchPageIndex(0);
    if (options.searchQuery.value) nextTick(() => options.selectFirstIconInCurrentScope({ force: true }));
    else options.clearSelectedIcon();
    options.schedulePageGridMetrics();
  }

  function handleTabKey(event) {
    event.preventDefault();
    if (hasFolderInteractionLayer()) {
      options.keyboardFocusArea.value = "desktop";
      const panel = getElementFromRef(options.folderPanelRef);
      panel?.focus?.({ preventScroll: true });
      if (!options.selectionMatchesScope(options.selectedIcon.value, options.getCurrentIconScope())) options.selectFirstIconInCurrentScope({ force: true });
      return;
    }

    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    const searchInput = getElementFromRef(options.searchInputRef);
    const isSearchFocused = options.keyboardFocusArea.value === "search" || activeElement === searchInput;

    if (isSearchFocused) {
      options.focusDesktopSurface();
      if (!options.selectionMatchesScope(options.selectedIcon.value, options.getCurrentIconScope())) options.selectFirstIconInCurrentScope({ force: true });
    } else {
      options.keyboardFocusArea.value = "search";
      searchInput?.focus?.({ preventScroll: true });
    }
  }

  function handleEscapeKey(event) {
    event.preventDefault();
    if (options.closeTopmostModal?.()) return;

    if (hasFolderInteractionLayer() && !options.isFolderAppLaunchClosing.value) {
      if (options.isFolderClosing.value || options.isFolderZoomFadeClosing?.value) return;
      options.commitOpenFolder(null);
      options.clearSelectedIcon();
      return;
    }

    if (options.isSearchMode.value) {
      options.clearSearch();
      options.focusDesktopSurface();
      return;
    }

    options.closeDesktop({ clearSearch: false });
    options.hideNativeWindowAfterCloseAnimation?.();
  }

  function handleGlobalKeydown(event) {
    if (isDevOpenDesktopShortcut(event)) {
      event.preventDefault();
      if (!options.isDesktopOpen.value) options.openDesktop();
      return;
    }

    if (!options.isDesktopOpen.value || options.isDesktopClosing.value || options.isAppLaunching.value) return;
    if (options.isDragActive()) return;

    if (event.key === "Escape") {
      handleEscapeKey(event);
      return;
    }

    if (options.isModalOpen?.()) return;

    if (isAltSpaceShortcut(event) && handleAltSpaceKey(event)) return;

    options.handleAltKeyDown(event);
    if (options.isAltKeyEvent(event)) return;

    if (event.key === "Tab") {
      handleTabKey(event);
      return;
    }

    if (event.ctrlKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      options.keyboardFocusArea.value = "desktop";
      turnCurrentPage(event.key === "ArrowRight" ? 1 : -1, { selectFirst: true });
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      options.keyboardFocusArea.value = "desktop";
      options.moveSelectionByArrow(event.key);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      options.openSelectedIcon();
      return;
    }

    const isTypingInInput = isTextEntryElement(event.target);
    if (!isTypingInInput && event.key === "Backspace" && options.searchQuery.value) {
      event.preventDefault();
      appendDesktopSearchText("");
      deleteDesktopSearchText();
      return;
    }

    if (!isTypingInInput && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === " " && !options.searchQuery.value) {
      event.preventDefault();
      return;
    }

    if (!isTypingInInput && !event.ctrlKey && !event.metaKey && !event.altKey && event.key && event.key.length === 1) {
      event.preventDefault();
      appendDesktopSearchText(event.key);
    }
  }

  return {
    handleGlobalKeydown,
    handleLaunchpadWheel,
    hasFolderInteractionLayer,
    turnCurrentPage,
  };
}
