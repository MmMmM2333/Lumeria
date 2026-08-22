import { nextTick, type Ref } from "vue";

export type FolderPageTurnToken = number;
export type LaunchpadPageTurnOptions = Readonly<{
  focusFirst?: boolean;
  source?: string;
}>;

export type LaunchpadPageNavigationOptions = Readonly<{
  commitPageIndex: (pageIndex: number) => unknown;
  commitSearchPageIndex: (pageIndex: number) => unknown;
  finishHomeRevealSettleWindow: () => void;
  focusFirstIconInCurrentScope: (options: Readonly<{ force?: boolean }>) => unknown;
  folderPageIndex: Readonly<Ref<number>>;
  folderPages: Readonly<Ref<readonly (readonly unknown[])[]>>;
  isFolderAppLaunchClosing: Readonly<Ref<boolean>>;
  isFolderClosing: Readonly<Ref<boolean>>;
  isFolderZoomFadeClosing?: Readonly<Ref<boolean>>;
  isHomeRevealSettling: Readonly<Ref<boolean>>;
  isSearchMode: Readonly<Ref<boolean>>;
  openFolderId: Readonly<Ref<string | null>>;
  pageIndex: Readonly<Ref<number>>;
  pages: Readonly<Ref<readonly (readonly unknown[])[]>>;
  renderedFolder: Readonly<Ref<Readonly<{ id: string }> | null>>;
  requestFolderPageTurn?: (
    pageIndex: number,
    options: Readonly<{ phase: "open"; source: string }>,
  ) => FolderPageTurnToken | null;
  searchPageIndex: Readonly<Ref<number>>;
  searchPages: Readonly<Ref<readonly (readonly unknown[])[]>>;
  visualFolderPageIndex?: Readonly<Ref<number>>;
}>;

export function useLaunchpadPageNavigation(options: LaunchpadPageNavigationOptions) {
  function requestAnimationFrameOnce(callback: FrameRequestCallback): void {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      callback(globalThis.performance?.now?.() ?? 0);
      return;
    }
    window.requestAnimationFrame(callback);
  }

  function hasFolderInteractionLayer(): boolean {
    return Boolean(options.renderedFolder.value && (
      options.openFolderId.value ||
      options.isFolderClosing.value ||
      options.isFolderAppLaunchClosing.value ||
      options.isFolderZoomFadeClosing?.value
    ));
  }

  function getNextDesktopPageIndex(step: -1 | 1): number | null {
    const next = options.pageIndex.value + step;
    if (next < 0 || next > options.pages.value.length - 1) return null;
    return next;
  }

  function getFolderPageTurnPhase(): "closing" | "idle" | "open" {
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

  function getNextFolderPageIndex(step: -1 | 1): number | null {
    const current = options.visualFolderPageIndex?.value ?? options.folderPageIndex.value;
    const next = current + step;
    if (next < 0 || next > options.folderPages.value.length - 1) return null;
    return next;
  }

  function commitDesktopPageIndex(next: number, turnOptions: LaunchpadPageTurnOptions): boolean {
    if (options.isHomeRevealSettling.value) {
      options.finishHomeRevealSettleWindow();
      nextTick(() => requestAnimationFrameOnce(() => {
        options.commitPageIndex(next);
        if (turnOptions?.focusFirst) nextTick(() => options.focusFirstIconInCurrentScope({ force: true }));
      }));
      return true;
    }
    options.commitPageIndex(next);
    return false;
  }

  function turnCurrentPage(direction: number, turnOptions: LaunchpadPageTurnOptions = {}): boolean {
    const step = direction > 0 ? 1 : -1;
    const folderPhase = getFolderPageTurnPhase();
    let didTurn = false;
    let didDeferFocus = false;

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
        didDeferFocus = commitDesktopPageIndex(next, turnOptions);
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
        didDeferFocus = commitDesktopPageIndex(next, turnOptions);
        didTurn = true;
      }
    }

    if (didTurn && turnOptions.focusFirst && !didDeferFocus) {
      nextTick(() => options.focusFirstIconInCurrentScope({ force: true }));
    }
    return didTurn;
  }

  return { hasFolderInteractionLayer, turnCurrentPage };
}
