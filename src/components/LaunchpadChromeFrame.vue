<template>
  <div :ref="(node) => bindRef(frameRefs.shellRef, node)" class="launchpad-shell">
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
          :aria-label="`切换到第 ${index} 页`"
          @pointerdown.stop
          @click="$emit('page-index', index - 1)"
        />
      </footer>
    </div>
  </div>
</template>

<script setup>
import { gsap } from "gsap";
import { onBeforeUnmount, ref, watch } from "vue";
import { cx } from "../domain/launchpadLayout.js";
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

const headerMotionRef = ref(null);
const dotsMotionRef = ref(null);

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
    animateChromeMotion(headerMotionRef.value);
    animateChromeMotion(dotsMotionRef.value);
  },
  { flush: "post" }
);

watchChromeMotionRef(headerMotionRef);
watchChromeMotionRef(dotsMotionRef);

onBeforeUnmount(() => {
  killChromeMotion(headerMotionRef.value);
  killChromeMotion(dotsMotionRef.value);
});

function bindRef(target, node) {
  if (target && typeof target === "object" && "value" in target) target.value = node;
}

function watchChromeMotionRef(target) {
  watch(
    target,
    (node, previousNode) => {
      if (previousNode && previousNode !== node) killChromeMotion(previousNode);
      if (!node) return;
      gsap.set(node, normalizeChromeMotion(props.chromeInitial));
      animateChromeMotion(node);
    },
    { flush: "post" }
  );
}

function animateChromeMotion(node) {
  if (!node) return;
  gsap.killTweensOf(node);
  gsap.to(node, {
    ...normalizeChromeMotion(props.chromeAnimate),
    duration: resolveChromeMotionDuration(props.chromeTransition),
    ease: "power2.out",
    overwrite: "auto",
  });
}

function killChromeMotion(node) {
  if (node) gsap.killTweensOf(node);
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
