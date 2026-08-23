import { computed, nextTick, ref, type CSSProperties } from "vue";

export type MeasurableElement = {
  readonly clientHeight?: number;
  readonly offsetHeight?: number;
  contains?: (other: Node | null) => boolean;
  focus?: (options?: FocusOptions) => void;
  getBoundingClientRect: () => Pick<DOMRect, "height">;
};

export type DomRefNode<TElement extends MeasurableElement = HTMLElement> =
  | TElement
  | Readonly<{ $el: TElement | null | undefined }>
  | null
  | undefined;

export type DomRefSource<TElement extends MeasurableElement = HTMLElement> =
  | DomRefNode<TElement>
  | Readonly<{ value: DomRefNode<TElement> }>;

export type PageGridMetricsOptions = Readonly<{
  desktopMainRef: DomRefSource<HTMLElement>;
  headerRef: DomRefSource<HTMLElement>;
  pageDotsRef: DomRefSource<HTMLElement>;
  rootRef: DomRefSource<HTMLElement>;
  searchRef: DomRefSource<HTMLElement>;
}>;

function readCssPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getDomRefElement<TElement extends MeasurableElement>(
  node: DomRefNode<TElement>,
): TElement | null {
  if (!node) return null;
  return "$el" in node ? node.$el ?? null : node;
}

export function getElementFromRef<TElement extends MeasurableElement>(
  nodeRef: DomRefSource<TElement>,
): TElement | null {
  if (nodeRef && typeof nodeRef === "object" && "value" in nodeRef) {
    return getDomRefElement(nodeRef.value);
  }
  return getDomRefElement(nodeRef);
}

function getElementHeight(nodeRef: DomRefSource<HTMLElement>): number {
  const element = getElementFromRef(nodeRef);
  if (!element) return 0;
  return element.offsetHeight || element.clientHeight || element.getBoundingClientRect().height;
}

function getVerticalPadding(element: HTMLElement | null): number {
  if (!element || typeof window === "undefined") return 0;
  const styles = window.getComputedStyle(element);
  return readCssPx(styles.paddingTop) + readCssPx(styles.paddingBottom);
}

export function usePageGridMetrics(options: PageGridMetricsOptions) {
  const {
    desktopMainRef,
    headerRef,
    pageDotsRef,
    rootRef,
    searchRef,
  } = options;

  const pageGridHeight = ref(0);
  const pageGridMeasureStyle = computed<CSSProperties>(() =>
    pageGridHeight.value > 0
      ? { height: `${pageGridHeight.value}px`, minHeight: `${pageGridHeight.value}px` }
      : {}
  );

  function updatePageGridMetrics(): void {
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

  function schedulePageGridMetrics(): void {
    void nextTick(updatePageGridMetrics);
  }

  return {
    pageGridHeight,
    pageGridMeasureStyle,
    schedulePageGridMetrics,
    updatePageGridMetrics,
  };
}
