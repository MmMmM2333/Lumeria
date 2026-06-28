import { nextTick, ref } from "vue";
import { clamp } from "../domain/launchpadLayout.js";

const PAGE_JUMP_RENDER_RELEASE_DELAY = 900;
const PAGE_RENDER_EMPTY = "empty";
const PAGE_RENDER_INTERACTIVE = "interactive";
const PAGE_RENDER_STATIC_REAL = "static-real";

export function usePageRenderRange(options) {
  const transientPageRenderRange = ref(null);
  let pageJumpRenderTimer = null;
  let pageJumpRenderRequestId = 0;

  function hasActiveDrag() {
    return Boolean(options.getDragMeta?.());
  }

  function getPageRenderMode(pageNumber, mode, activePageIndex) {
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

  function getDesktopPageRenderMode(pageNumber) {
    const activeMode = options.isSearchMode.value ? "search" : "desktop";
    return getPageRenderMode(pageNumber, activeMode, options.activePageIndex.value);
  }

  function getFolderPageRenderMode(pageNumber) {
    return getPageRenderMode(pageNumber, "folder", options.folderPageIndex.value);
  }

  function clearPageJumpRenderRange() {
    pageJumpRenderRequestId += 1;
    if (pageJumpRenderTimer) window.clearTimeout(pageJumpRenderTimer);
    pageJumpRenderTimer = null;
    transientPageRenderRange.value = null;
  }

  function schedulePageJumpRenderRelease() {
    if (pageJumpRenderTimer) window.clearTimeout(pageJumpRenderTimer);
    pageJumpRenderTimer = window.setTimeout(() => {
      pageJumpRenderTimer = null;
      transientPageRenderRange.value = null;
    }, PAGE_JUMP_RENDER_RELEASE_DELAY);
  }

  function requestAnimationFrameOnce(callback) {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      callback();
      return;
    }
    window.requestAnimationFrame(callback);
  }

  function commitPageIndexNow(next) {
    options.pageIndex.value = clamp(next, 0, Math.max(0, options.pages.value.length - 1));
  }

  function commitSearchPageIndexNow(next) {
    options.searchPageIndex.value = clamp(next, 0, Math.max(0, options.searchPages.value.length - 1));
  }

  function commitFolderPageIndexNow(next, maxIndex) {
    options.folderPageIndex.value = clamp(next, 0, maxIndex);
  }

  function commitPageIndexWithRenderRange(mode, current, requested, maxIndex, commitNow) {
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

  function preparePageIndexRenderRange(mode, current, requested, maxIndex) {
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

  function commitPageIndex(next) {
    commitPageIndexWithRenderRange("desktop", options.pageIndex.value, next, Math.max(0, options.pages.value.length - 1), commitPageIndexNow);
  }

  function commitSearchPageIndex(next) {
    commitPageIndexWithRenderRange("search", options.searchPageIndex.value, next, Math.max(0, options.searchPages.value.length - 1), commitSearchPageIndexNow);
  }

  function commitActivePageIndex(next) {
    if (options.isSearchMode.value) commitSearchPageIndex(next);
    else commitPageIndex(next);
  }

  function commitFolderPageIndex(next, commitOptions) {
    const allowCreate = Boolean(commitOptions?.allowCreate);
    const maxIndex = Math.max(0, options.folderPages.value.length - 1 + (allowCreate ? 1 : 0));
    const folderPageTurnToken = commitOptions?.folderPageTurnToken;
    if (folderPageTurnToken != null) {
      return commitFolderPageTurnRequest(folderPageTurnToken, { ...commitOptions, maxIndex });
    }
    commitPageIndexWithRenderRange("folder", options.folderPageIndex.value, next, maxIndex, (value) => commitFolderPageIndexNow(value, maxIndex));
  }

  function requestFolderPageTurn(next, requestOptions = {}) {
    if (typeof options.requestFolderPageTurn !== "function") return null;
    const allowCreate = Boolean(requestOptions?.allowCreate);
    const maxIndex = Math.max(0, options.folderPages.value.length - 1 + (allowCreate ? 1 : 0));
    const token = options.requestFolderPageTurn(next, { ...requestOptions, maxIndex });
    const request = options.folderPageTurnRequest?.value;
    const target = request?.token === token ? request.targetIndex : clamp(next, 0, maxIndex);
    preparePageIndexRenderRange("folder", options.folderPageIndex.value, target, maxIndex);
    return token;
  }

  function commitFolderPageTurnRequest(token, commitOptions = {}) {
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
    requestFolderPageTurn,
  };
}
