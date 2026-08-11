import { nextTick } from "vue";
import { DEV_OPEN_DESKTOP_SHORTCUT_CODE } from "./launchpadConstants.js";
import { getElementFromRef } from "./usePageGridMetrics.js";

function isTextEntryElement(element) {
  if (!element) return false;
  const tagName = element.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || element.isContentEditable;
}

function isDevOpenDesktopShortcut(event) {
  return Boolean(event.ctrlKey && event.shiftKey && event.code === DEV_OPEN_DESKTOP_SHORTCUT_CODE);
}

export function useLaunchpadKeyboard(options) {
  const hasFolderInteractionLayer = () => Boolean(options.hasFolderInteractionLayer?.());

  function isAltSpaceShortcut(event) {
    return Boolean(event.altKey && !event.ctrlKey && !event.metaKey && (event.key === " " || event.code === "Space"));
  }

  function handleAltSpaceKey(event) {
    if (!hasFolderInteractionLayer() || options.isFolderAppLaunchClosing.value || options.isFolderZoomFadeClosing?.value) return false;
    event.preventDefault();
    options.cancelAltEditMode?.();
    options.clearFocusedIcon?.();
    if (!options.startFolderZoomFadeClose?.({ reason: "desktop" })) return true;
    options.closeDesktop?.({ clearSearch: false });
    options.hideNativeWindowAfterCloseAnimation?.();
    return true;
  }

  function appendDesktopSearchText(text) {
    if (!text || hasFolderInteractionLayer()) return;
    options.searchQuery.value = `${options.searchQuery.value}${text}`;
    options.commitSearchPageIndex(0);
    options.keyboardFocusArea.value = "desktop";
    nextTick(() => options.focusFirstIconInCurrentScope({ force: true }));
    options.schedulePageGridMetrics();
  }

  function deleteDesktopSearchText() {
    if (!options.searchQuery.value || hasFolderInteractionLayer()) return;
    options.searchQuery.value = options.searchQuery.value.slice(0, -1);
    options.commitSearchPageIndex(0);
    if (options.searchQuery.value) nextTick(() => options.focusFirstIconInCurrentScope({ force: true }));
    else options.clearFocusedIcon();
    options.schedulePageGridMetrics();
  }

  function handleTabKey(event) {
    event.preventDefault();
    if (hasFolderInteractionLayer()) {
      options.keyboardFocusArea.value = "desktop";
      const panel = getElementFromRef(options.folderPanelRef);
      panel?.focus?.({ preventScroll: true });
      if (!options.focusMatchesScope(options.focusedIcon.value, options.getCurrentIconScope())) {
        options.focusFirstIconInCurrentScope({ force: true });
      }
      return;
    }

    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    const searchInput = getElementFromRef(options.searchInputRef);
    const isSearchFocused = options.keyboardFocusArea.value === "search" || activeElement === searchInput;
    if (isSearchFocused) {
      options.focusDesktopSurface();
      if (!options.focusMatchesScope(options.focusedIcon.value, options.getCurrentIconScope())) {
        options.focusFirstIconInCurrentScope({ force: true });
      }
    } else {
      options.keyboardFocusArea.value = "search";
      searchInput?.focus?.({ preventScroll: true });
    }
  }

  function handleEscapeKey(event) {
    event.preventDefault();
    if (options.closeTopmostModal?.()) return;
    if (options.isBatchSelectionActive?.()) {
      options.clearBatchSelection?.();
      return;
    }
    if (hasFolderInteractionLayer() && !options.isFolderAppLaunchClosing.value) {
      if (options.isFolderClosing.value || options.isFolderZoomFadeClosing?.value) return;
      options.commitOpenFolder(null);
      options.clearFocusedIcon();
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
    if (options.isDragActive()) {
      if (event.key === "Escape" && options.cancelActiveDrag?.()) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Escape") {
      handleEscapeKey(event);
      return;
    }
    if (options.isModalOpen?.()) return;
    if (isAltSpaceShortcut(event) && handleAltSpaceKey(event)) return;
    const isBatchSelectionActive = Boolean(options.isBatchSelectionActive?.());
    if (!isBatchSelectionActive) options.handleAltKeyDown(event);
    if (options.isAltKeyEvent(event)) return;
    const isTypingInInput = isTextEntryElement(event.target);
    if (isBatchSelectionActive && !isTypingInInput) {
      const normalizedKey = String(event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && normalizedKey === "a") {
        event.preventDefault();
        options.selectAllBatchScope?.();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && normalizedKey === "n") {
        event.preventDefault();
        options.createFolderFromBatchSelection?.();
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        options.requestBatchSelectionDelete?.();
        return;
      }
      if (event.key === " " && !event.altKey) {
        event.preventDefault();
        options.toggleFocusedBatchSelection?.(event);
        return;
      }
    }
    if (
      isBatchSelectionActive &&
      (
        event.key === "Backspace" ||
        (!event.ctrlKey && !event.metaKey && !event.altKey && event.key?.length === 1)
      )
    ) {
      event.preventDefault();
      return;
    }
    if (event.key === "Tab") {
      handleTabKey(event);
      return;
    }
    if (event.ctrlKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      options.keyboardFocusArea.value = "desktop";
      options.turnCurrentPage(event.key === "ArrowRight" ? 1 : -1, { focusFirst: true, source: "keyboard" });
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      options.keyboardFocusArea.value = "desktop";
      options.moveFocusByArrow(event.key);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (options.isBatchSelectionActive?.()) return;
      options.openFocusedIcon();
      return;
    }

    if (!isTypingInInput && event.key === "Backspace" && options.searchQuery.value) {
      event.preventDefault();
      deleteDesktopSearchText();
      return;
    }
    if (!isTypingInInput && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === " " && !options.searchQuery.value) {
      event.preventDefault();
      return;
    }
    if (!isTypingInInput && !event.ctrlKey && !event.metaKey && !event.altKey && event.key?.length === 1) {
      event.preventDefault();
      appendDesktopSearchText(event.key);
    }
  }

  return { handleGlobalKeydown, hasFolderInteractionLayer };
}
