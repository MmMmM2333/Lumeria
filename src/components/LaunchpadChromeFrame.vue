<template>
  <div :ref="(node) => bindRef(frameRefs.shellRef, node)" class="launchpad-shell" @contextmenu="handleShellContextMenu">
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
      <footer :ref="(node) => bindRef(frameRefs.pageDotsRef, node)" class="page-dots">
        <button
          v-for="index in activePages.length"
          :key="`${isSearchMode ? 'search-dot' : 'page-dot'}-${index}`"
          type="button"
          :class="cx('page-dot', index - 1 === activePageIndex && 'page-dot-active')"
          :aria-label="t('launchpad.page', { page: index })"
          @pointerdown.stop
          @click="$emit('page-index', index - 1)"
        />
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { useGsapDomMotion } from "../composables/useGsapDomMotion.js";
import { cx } from "../domain/launchpadLayout.js";
import { useLocalization } from "../i18n/localization.js";
import LaunchpadHeader from "./LaunchpadHeader.vue";

const props = defineProps({
  activePageIndex: { type: Number, required: true },
  activePages: { type: Array, required: true },
  chromeAnimate: { type: Object, required: true },
  chromeInitial: { type: Object, required: true },
  chromeStyle: { type: Object, required: true },
  chromeTransition: { type: Object, required: true },
  domRefs: { type: Object, required: true },
  dragDisabled: { type: Boolean, default: false },
  frameRefs: { type: Object, required: true },
  isSearchMode: { type: Boolean, default: false },
  renderKey: { type: String, default: "" },
  searchQuery: { type: String, default: "" },
});
const { t } = useLocalization();

const headerMotionRef = ref(null);
const dotsMotionRef = ref(null);
const headerMotion = useGsapDomMotion(headerMotionRef, {
  initial: () => normalizeChromeMotion(props.chromeInitial),
  motion: resolveChromeMotion,
});
const dotsMotion = useGsapDomMotion(dotsMotionRef, {
  initial: () => normalizeChromeMotion(props.chromeInitial),
  motion: resolveChromeMotion,
});

defineEmits([
  "clear-search",
  "open-settings",
  "page-index",
  "search-blur",
  "search-focus",
  "search-input",
]);

watch(
  () => props.chromeAnimate,
  () => {
    headerMotion.animate();
    dotsMotion.animate();
  },
  { flush: "post" }
);

function bindRef(target, node) {
  if (target && typeof target === "object" && "value" in target) target.value = node;
}

function handleShellContextMenu(event) {
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea"))) return;
  event.preventDefault();
}

function resolveChromeMotion() {
  return {
    ...normalizeChromeMotion(props.chromeAnimate),
    duration: resolveChromeMotionDuration(props.chromeTransition),
    ease: "power2.out",
  };
}

function normalizeChromeMotion(target) {
  const motion = {};
  if (Object.prototype.hasOwnProperty.call(target, "opacity")) motion.opacity = target.opacity;
  if (Object.prototype.hasOwnProperty.call(target, "filter")) motion.filter = target.filter;
  return motion;
}

function resolveChromeMotionDuration(transition) {
  const duration = Number(transition?.duration);
  return Number.isFinite(duration) && duration >= 0 ? duration : 0.24;
}
</script>
