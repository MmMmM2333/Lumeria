<template>
  <div :ref="(node) => bindElementRef(frameRefs.shellRef, node)" class="launchpad-shell" @contextmenu="handleShellContextMenu">
    <div
      :key="`launchpad-chrome-${renderKey}`"
      ref="headerMotionRef"
      class="launchpad-chrome-motion launchpad-chrome-motion-header"
      :style="chromeStyle"
    >
      <LaunchpadHeader
        :dom-refs="domRefs"
        :drag-disabled="dragDisabled"
        :is-search-mode="isSearchMode"
        :search-query="searchQuery"
        @search-input="$emit('search-input', $event)"
        @search-focus="$emit('search-focus')"
        @search-blur="$emit('search-blur')"
        @clear-search="$emit('clear-search')"
        @open-settings="$emit('open-settings', $event)"
      />
    </div>
    <slot />
    <div
      :key="`launchpad-chrome-dots-${renderKey}`"
      ref="dotsMotionRef"
      class="launchpad-chrome-motion launchpad-chrome-motion-dots"
      :style="chromeStyle"
    >
      <footer :ref="(node) => bindElementRef(frameRefs.pageDotsRef, node)" class="page-dots">
        <button
          v-for="index in activePages.length"
          :key="`${isSearchMode ? 'search-dot' : 'page-dot'}-${index}`"
          type="button"
          :class="cx('page-dot', index - 1 === activePageIndex && 'page-dot-active', getSelectedPageCount(index - 1) > 0 && 'page-dot-has-selection')"
          :aria-label="getPageAriaLabel(index - 1)"
          @pointerdown.stop
          @click="$emit('page-index', index - 1)"
        />
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { ComponentPublicInstance, Ref } from "vue";
import { useGsapDomMotion } from "../composables/useGsapDomMotion.js";
import type { LaunchpadSearchInputEvent } from "../composables/useLaunchpadSearch.js";
import { cx } from "../domain/launchpadLayout.js";
import type { ReadonlyLaunchpadPages } from "../domain/launchpadLayout.js";
import { useLocalization } from "../i18n/localization.js";
import LaunchpadHeader from "./LaunchpadHeader.vue";

type ChromeMotionTarget = Readonly<{ filter?: string; opacity?: number }>;
type ChromeTransition = Readonly<{ duration?: number }>;
type HeaderDomRefs = Readonly<{
  headerRef: Ref<HTMLElement | null>;
  searchInputRef: Ref<HTMLInputElement | null>;
  searchRef: Ref<HTMLElement | null>;
}>;
type ChromeFrameRefs = Readonly<{
  pageDotsRef: Ref<HTMLElement | null>;
  shellRef: Ref<HTMLElement | null>;
}>;

const props = withDefaults(defineProps<{
  activePageIndex: number;
  activePages: ReadonlyLaunchpadPages;
  chromeAnimate: ChromeMotionTarget;
  chromeInitial: ChromeMotionTarget;
  chromeStyle: Readonly<Record<string, string | number>>;
  chromeTransition: ChromeTransition;
  domRefs: HeaderDomRefs;
  dragDisabled?: boolean;
  frameRefs: ChromeFrameRefs;
  isSearchMode?: boolean;
  renderKey?: string;
  searchQuery?: string;
  selectedPageCounts?: readonly number[];
}>(), {
  dragDisabled: false,
  isSearchMode: false,
  renderKey: "",
  searchQuery: "",
  selectedPageCounts: () => [],
});
const { t } = useLocalization();

const headerMotionRef = ref<HTMLElement | null>(null);
const dotsMotionRef = ref<HTMLElement | null>(null);
const headerMotion = useGsapDomMotion(headerMotionRef, {
  initial: () => normalizeChromeMotion(props.chromeInitial),
  motion: resolveChromeMotion,
});
const dotsMotion = useGsapDomMotion(dotsMotionRef, {
  initial: () => normalizeChromeMotion(props.chromeInitial),
  motion: resolveChromeMotion,
});

const emit = defineEmits<{
  "clear-search": [];
  "context-menu-request": [event: MouseEvent];
  "open-settings": [event: MouseEvent];
  "page-index": [pageIndex: number];
  "search-blur": [];
  "search-focus": [];
  "search-input": [event: LaunchpadSearchInputEvent];
}>();

watch(
  () => props.chromeAnimate,
  () => {
    headerMotion.animate();
    dotsMotion.animate();
  },
  { flush: "post" }
);

function bindElementRef(
  target: Ref<HTMLElement | null>,
  node: Element | ComponentPublicInstance | null,
): void {
  target.value = node instanceof HTMLElement ? node : null;
}

function getSelectedPageCount(pageIndex: number): number {
  return Math.max(0, Number(props.selectedPageCounts?.[pageIndex]) || 0);
}

function getPageAriaLabel(pageIndex: number): string {
  const page = pageIndex + 1;
  const count = getSelectedPageCount(pageIndex);
  if (!count) return t("launchpad.page", { page });
  return t("launchpad.batch.pageWithSelection", { count, page });
}

function handleShellContextMenu(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) {
    throw new TypeError("Launchpad shell contextmenu event target must be an element");
  }
  if (target.closest("input, textarea, [contenteditable]:not([contenteditable='false'])")) {
    return;
  }
  event.preventDefault();
  if (target.closest("button, [role='button']")) return;
  emit("context-menu-request", event);
}

function resolveChromeMotion() {
  return {
    ...normalizeChromeMotion(props.chromeAnimate),
    duration: resolveChromeMotionDuration(props.chromeTransition),
    ease: "power2.out",
  };
}

function normalizeChromeMotion(target: ChromeMotionTarget): ChromeMotionTarget {
  const motion: { filter?: string; opacity?: number } = {};
  if (target.opacity !== undefined) motion.opacity = target.opacity;
  if (target.filter !== undefined) motion.filter = target.filter;
  return motion;
}

function resolveChromeMotionDuration(transition: ChromeTransition): number {
  const duration = Number(transition?.duration);
  return Number.isFinite(duration) && duration >= 0 ? duration : 0.24;
}
</script>
