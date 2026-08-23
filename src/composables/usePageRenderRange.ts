import { nextTick, ref, type Ref } from "vue";
import { clamp } from "../domain/launchpadLayout.js";
import type {
  FolderPageTurnContextInput,
  FolderPageTurnRequest,
  FolderPageTurnRequestOptions,
} from "./useLaunchpadLayout.js";

const PAGE_JUMP_RENDER_RELEASE_DELAY = 900;
const PAGE_RENDER_EMPTY = "empty";
const PAGE_RENDER_INTERACTIVE = "interactive";
const PAGE_RENDER_STATIC_REAL = "static-real";

export type PageRenderMode =
  | typeof PAGE_RENDER_EMPTY
  | typeof PAGE_RENDER_INTERACTIVE
  | typeof PAGE_RENDER_STATIC_REAL;
export type PageRenderScope = "desktop" | "folder" | "search";
export type FolderPageRenderOptions = FolderPageTurnContextInput & Readonly<{
  allowCreate?: boolean;
  folderPageTurnToken?: number;
  source?: string | null;
}>;
export type PageRenderRangeOptions = Readonly<{
  activePageIndex: Readonly<Ref<number>>;
  commitFolderPageIndexState: (next: number, maxIndex: number) => unknown;
  commitFolderPageTurnRequest?: (
    token: number,
    options: FolderPageRenderOptions & Readonly<{ maxIndex: number }>,
  ) => boolean;
  commitPageIndexState: (next: number, maxIndex: number) => unknown;
  commitSearchPageIndexState: (next: number, maxIndex: number) => unknown;
  folderPageIndex: Readonly<Ref<number>>;
  folderPageTurnRequest?: Readonly<Ref<FolderPageTurnRequest | null>>;
  folderPages: Readonly<Ref<readonly (readonly unknown[])[]>>;
  getDragMeta?: () => unknown;
  isDragActive: () => boolean;
  isSearchMode: Readonly<Ref<boolean>>;
  pageIndex: Readonly<Ref<number>>;
  pages: Readonly<Ref<readonly (readonly unknown[])[]>>;
  requestFolderPageTurn?: (
    next: number,
    options: FolderPageTurnRequestOptions & Readonly<{ allowCreate?: boolean; maxIndex: number }>,
  ) => number;
  searchPageIndex: Readonly<Ref<number>>;
  searchPages: Readonly<Ref<readonly (readonly unknown[])[]>>;
  visualFolderPageIndex?: Readonly<Ref<number>>;
}>;

type TransientPageRenderRange = Readonly<{
  from: number;
  mode: PageRenderScope;
  to: number;
}>;

export function usePageRenderRange(options: PageRenderRangeOptions) {
  if (
    typeof options.commitPageIndexState !== "function"
    || typeof options.commitSearchPageIndexState !== "function"
    || typeof options.commitFolderPageIndexState !== "function"
  ) {
    throw new TypeError("usePageRenderRange requires layout index commands");
  }
  const transientPageRenderRange = ref<TransientPageRenderRange | null>(null);
  let pageJumpRenderTimer: number | null = null;
  let pageJumpRenderRequestId = 0;

  function hasActiveDrag(): boolean {
    return Boolean(options.getDragMeta?.());
  }

  function getPageRenderMode(
    pageNumber: number,
    mode: PageRenderScope,
    activePageIndex: number,
  ): PageRenderMode {
    const distance = Math.abs(pageNumber - activePageIndex);
    if (hasActiveDrag()) return distance <= 1 ? PAGE_RENDER_INTERACTIVE : PAGE_RENDER_EMPTY;

    const transientRange = transientPageRenderRange.value;
    if (transientRange?.mode === mode) {
      if (pageNumber === transientRange.from || pageNumber === transientRange.to) return PAGE_RENDER_INTERACTIVE;
      if (pageNumber > transientRange.from && pageNumber < transientRange.to) return PAGE_RENDER_STATIC_REAL;
      return PAGE_RENDER_EMPTY;
    }

    return Math.abs(pageNumber - activePageIndex) <= 1 ? PAGE_RENDER_INTERACTIVE : PAGE_RENDER_EMPTY;
  }

  function getDesktopPageRenderMode(pageNumber: number): PageRenderMode {
    const activeMode = options.isSearchMode.value ? "search" : "desktop";
    return getPageRenderMode(pageNumber, activeMode, options.activePageIndex.value);
  }

  function getFolderPageRenderMode(pageNumber: number): PageRenderMode {
    // A deferred page turn moves the track before the committed index changes.
    // Keep culling anchored to that same visual page so starting a drag cannot
    // empty the page currently under the pointer.
    const activePageIndex = options.visualFolderPageIndex?.value ?? options.folderPageIndex.value;
    return getPageRenderMode(pageNumber, "folder", activePageIndex);
  }

  function clearPageJumpRenderRange(): void {
    pageJumpRenderRequestId += 1;
    if (pageJumpRenderTimer) window.clearTimeout(pageJumpRenderTimer);
    pageJumpRenderTimer = null;
    transientPageRenderRange.value = null;
  }

  function schedulePageJumpRenderRelease(): void {
    if (pageJumpRenderTimer) window.clearTimeout(pageJumpRenderTimer);
    pageJumpRenderTimer = window.setTimeout(() => {
      pageJumpRenderTimer = null;
      transientPageRenderRange.value = null;
    }, PAGE_JUMP_RENDER_RELEASE_DELAY);
  }

  function requestAnimationFrameOnce(callback: FrameRequestCallback): void {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      callback(globalThis.performance?.now?.() ?? 0);
      return;
    }
    window.requestAnimationFrame(callback);
  }

  function commitPageIndexNow(next: number): void {
    const maxIndex = Math.max(0, options.pages.value.length - 1);
    options.commitPageIndexState(next, maxIndex);
  }

  function commitSearchPageIndexNow(next: number): void {
    if (!options.isSearchMode.value) {
      options.commitSearchPageIndexState(0, 0);
      return;
    }
    const maxIndex = Math.max(0, options.searchPages.value.length - 1);
    options.commitSearchPageIndexState(next, maxIndex);
  }

  function commitFolderPageIndexNow(next: number, maxIndex: number): void {
    options.commitFolderPageIndexState(next, maxIndex);
  }

  function commitPageIndexWithRenderRange(
    mode: PageRenderScope,
    current: number,
    requested: number,
    maxIndex: number,
    commitNow: (next: number) => unknown,
  ): boolean {
    const next = clamp(requested, 0, maxIndex);
    const distance = Math.abs(next - current);
    if (distance <= 1 || options.isDragActive() || current < 0 || current > maxIndex) {
      clearPageJumpRenderRange();
      return commitNow(next) !== false;
    }

    if (pageJumpRenderTimer) window.clearTimeout(pageJumpRenderTimer);
    pageJumpRenderTimer = null;
    const requestId = (pageJumpRenderRequestId += 1);
    transientPageRenderRange.value = {
      mode,
      from: Math.min(current, next),
      to: Math.max(current, next),
    };

    nextTick(() => {
      if (requestId !== pageJumpRenderRequestId) return;
      if (!transientPageRenderRange.value || transientPageRenderRange.value.mode !== mode) return;
      requestAnimationFrameOnce(() => {
        if (requestId !== pageJumpRenderRequestId) return;
        const range = transientPageRenderRange.value;
        if (!range || range.mode !== mode || next < range.from || next > range.to) return;
        const didCommit = commitNow(next) !== false;
        if (!didCommit) {
          if (requestId === pageJumpRenderRequestId) clearPageJumpRenderRange();
          return;
        }
        schedulePageJumpRenderRelease();
      });
    });
    return true;
  }

  function preparePageIndexRenderRange(
    mode: PageRenderScope,
    current: number,
    requested: number,
    maxIndex: number,
  ): number {
    const next = clamp(requested, 0, maxIndex);
    const distance = Math.abs(next - current);
    if (distance <= 1 || options.isDragActive() || current < 0 || current > maxIndex) {
      clearPageJumpRenderRange();
      return next;
    }

    if (pageJumpRenderTimer) window.clearTimeout(pageJumpRenderTimer);
    pageJumpRenderTimer = null;
    pageJumpRenderRequestId += 1;
    transientPageRenderRange.value = {
      mode,
      from: Math.min(current, next),
      to: Math.max(current, next),
    };
    return next;
  }

  function commitPageIndex(next: number): void {
    commitPageIndexWithRenderRange("desktop", options.pageIndex.value, next, Math.max(0, options.pages.value.length - 1), commitPageIndexNow);
  }

  function commitSearchPageIndex(next: number): void {
    if (!options.isSearchMode.value) {
      clearPageJumpRenderRange();
      commitSearchPageIndexNow(0);
      return;
    }
    commitPageIndexWithRenderRange("search", options.searchPageIndex.value, next, Math.max(0, options.searchPages.value.length - 1), commitSearchPageIndexNow);
  }

  function reclampPageIndices(): void {
    commitPageIndex(options.pageIndex.value);
    commitSearchPageIndex(options.searchPageIndex.value);
  }

  function rebasePageIndices(nextPageIndex: number): void {
    clearPageJumpRenderRange();
    commitPageIndexNow(nextPageIndex);
    commitSearchPageIndexNow(options.searchPageIndex.value);
  }

  function commitActivePageIndex(next: number): void {
    if (options.isSearchMode.value) commitSearchPageIndex(next);
    else commitPageIndex(next);
  }

  function commitFolderPageIndex(
    next: number,
    commitOptions: FolderPageRenderOptions = {},
  ): boolean | void {
    const allowCreate = Boolean(commitOptions?.allowCreate);
    const maxIndex = Math.max(0, options.folderPages.value.length - 1 + (allowCreate ? 1 : 0));
    const folderPageTurnToken = commitOptions?.folderPageTurnToken;
    if (folderPageTurnToken != null) {
      return commitFolderPageTurnRequest(folderPageTurnToken, { ...commitOptions, maxIndex });
    }
    commitPageIndexWithRenderRange("folder", options.folderPageIndex.value, next, maxIndex, (value) => commitFolderPageIndexNow(value, maxIndex));
  }

  function requestFolderPageTurn(
    next: number,
    requestOptions: FolderPageRenderOptions = {},
  ): number | null {
    if (typeof options.requestFolderPageTurn !== "function") return null;
    const allowCreate = Boolean(requestOptions?.allowCreate);
    const maxIndex = Math.max(0, options.folderPages.value.length - 1 + (allowCreate ? 1 : 0));
    const token = options.requestFolderPageTurn(next, { ...requestOptions, maxIndex });
    const request = options.folderPageTurnRequest?.value;
    const target = request?.token === token ? request.targetIndex : clamp(next, 0, maxIndex);
    preparePageIndexRenderRange("folder", options.folderPageIndex.value, target, maxIndex);
    return token;
  }

  function commitFolderPageTurnRequest(
    token: number | null,
    commitOptions: FolderPageRenderOptions = {},
  ): boolean {
    const request = options.folderPageTurnRequest?.value;
    if (!request || request.token !== token) return false;
    const allowCreate = Boolean(commitOptions?.allowCreate);
    const maxIndex = Math.max(0, options.folderPages.value.length - 1 + (allowCreate ? 1 : 0));
    return commitPageIndexWithRenderRange(
      "folder",
      options.folderPageIndex.value,
      request.targetIndex,
      maxIndex,
      () => options.commitFolderPageTurnRequest?.(token, { ...commitOptions, maxIndex })
    );
  }

  return {
    clearPageJumpRenderRange,
    commitActivePageIndex,
    commitFolderPageTurnRequest,
    commitFolderPageIndex,
    commitPageIndex,
    commitSearchPageIndex,
    getDesktopPageRenderMode,
    getFolderPageRenderMode,
    rebasePageIndices,
    reclampPageIndices,
    requestFolderPageTurn,
  };
}
