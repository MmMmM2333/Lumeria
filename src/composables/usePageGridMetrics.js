import { computed, nextTick, ref } from "vue";

function readCssPx(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getDomRefElement(node) {
  if (!node) return null;
  return node.$el || node;
}

export function getElementFromRef(nodeRef) {
  if (nodeRef && typeof nodeRef === "object" && "value" in nodeRef) return getDomRefElement(nodeRef.value);
  return getDomRefElement(nodeRef);
}

function getElementHeight(nodeRef) {
  const element = getElementFromRef(nodeRef);
  if (!element) return 0;
  return element.offsetHeight || element.clientHeight || element.getBoundingClientRect().height;
}

function getVerticalPadding(element) {
  if (!element || typeof window === "undefined") return 0;
  const styles = window.getComputedStyle(element);
  return readCssPx(styles.paddingTop) + readCssPx(styles.paddingBottom);
}

export function usePageGridMetrics(options) {
  const {
    desktopMainRef,
    headerRef,
    pageDotsRef,
    rootRef,
    searchRef,
  } = options;

  const pageGridHeight = ref(0);
  const pageGridMeasureStyle = computed(() =>
    pageGridHeight.value > 0
      ? { height: `${pageGridHeight.value}px`, minHeight: `${pageGridHeight.value}px` }
      : {}
  );

  function updatePageGridMetrics() {
    if (typeof window === "undefined") return;
    const root = getElementFromRef(rootRef);
    const main = getElementFromRef(desktopMainRef);
    const header = getElementFromRef(headerRef);
    const search = getElementFromRef(searchRef);
    const rootPadding = getVerticalPadding(root);
    const mainPadding = getVerticalPadding(main);
    const headerHeight = header ? getElementHeight(header) : 0;
    const searchHeight = search && !header?.contains(search) ? getElementHeight(search) : 0;
    const dotsHeight = getElementHeight(pageDotsRef);
    const chromeHeight = rootPadding + headerHeight + searchHeight + dotsHeight + mainPadding;
    const nextHeight = Math.max(280, Math.floor(window.innerHeight - chromeHeight));
    pageGridHeight.value = nextHeight;
  }

  function schedulePageGridMetrics() {
    nextTick(updatePageGridMetrics);
  }

  return {
    pageGridHeight,
    pageGridMeasureStyle,
    schedulePageGridMetrics,
    updatePageGridMetrics,
  };
}
