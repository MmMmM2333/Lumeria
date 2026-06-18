<template>
  <div :ref="(node) => bindRef(frameRefs.shellRef, node)" class="launchpad-shell">
    <Motion
      :key="`launchpad-chrome-${renderKey}`"
      class="launchpad-chrome-motion launchpad-chrome-motion-header"
      :initial="chromeInitial"
      :animate="chromeAnimate"
      :transition="chromeTransition"
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
    </Motion>
    <slot />
    <Motion
      :key="`launchpad-chrome-dots-${renderKey}`"
      class="launchpad-chrome-motion launchpad-chrome-motion-dots"
      :initial="chromeInitial"
      :animate="chromeAnimate"
      :transition="chromeTransition"
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
    </Motion>
  </div>
</template>

<script setup>
import { Motion } from "motion-v";
import { cx } from "../domain/launchpadLayout.js";
import LaunchpadHeader from "./LaunchpadHeader.vue";

defineProps({
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

defineEmits([
  "clear-search",
  "open-settings",
  "page-index",
  "search-blur",
  "search-focus",
  "search-input",
]);

function bindRef(target, node) {
  if (target && typeof target === "object" && "value" in target) target.value = node;
}
</script>
