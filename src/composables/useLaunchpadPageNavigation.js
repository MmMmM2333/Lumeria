import { nextTick } from "vue";

export function useLaunchpadPageNavigation(options) {
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

  function getNextDesktopPageIndex(step) {
    const next = options.pageIndex.value + step;
    if (next < 0 || next > options.pages.value.length - 1) return null;
    return next;
  }

  function getFolderPageTurnPhase() {
    if (!hasFolderInteractionLayer()) return "idle";
    if (
      options.isFolderClosing.value ||
      options.isFolderAppLaunchClosing.value ||
      options.isFolderZoomFadeClosing?.value
    ) {
      return "closing";
    }
    return "open";
  }

  function getNextFolderPageIndex(step) {
    const current = options.visualFolderPageIndex?.value ?? options.folderPageIndex.value;
    const next = current + step;
    if (next < 0 || next > options.folderPages.value.length - 1) return null;
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

  function turnCurrentPage(direction, turnOptions = {}) {
    const step = direction > 0 ? 1 : -1;
    const folderPhase = getFolderPageTurnPhase();
    let didTurn = false;
    let didDeferSelection = false;

    if (folderPhase === "open") {
      const next = getNextFolderPageIndex(step);
      if (next !== null) {
        didTurn = options.requestFolderPageTurn?.(next, {
          phase: folderPhase,
          source: turnOptions.source || "keyboard",
        }) != null;
      }
    } else if (folderPhase === "closing") {
      const next = getNextDesktopPageIndex(step);
      if (next !== null) {
        didDeferSelection = commitDesktopPageIndex(next, turnOptions);
        didTurn = true;
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

    if (didTurn && turnOptions.selectFirst && !didDeferSelection) {
      nextTick(() => options.selectFirstIconInCurrentScope({ force: true }));
    }
    return didTurn;
  }

  return { hasFolderInteractionLayer, turnCurrentPage };
}
