<template>
  <header :ref="(node) => bindRef(domRefs.headerRef, node)" class="launchpad-header">
    <div
      :ref="(node) => bindRef(domRefs.searchRef, node)"
      :class="cx(
        'search-pill',
        isSearchMode && 'search-pill-active',
        hasSearchQuery && 'search-pill-has-query',
        isSearchInputFocused && 'search-pill-focused',
        !hasSearchQuery && !isSearchInputFocused && 'search-pill-centered',
        (hasSearchQuery || isSearchInputFocused) && 'search-pill-left'
      )"
    >
      <div class="search-pill-content">
        <SearchIcon class="hint-icon" />
        <input
          :ref="(node) => bindRef(domRefs.searchInputRef, node)"
          class="search-input"
          :value="searchQuery"
          type="search"
          placeholder="搜索"
          aria-label="搜索应用"
          @input="$emit('search-input', $event)"
          @focus="$emit('search-focus')"
          @blur="$emit('search-blur')"
          @pointerdown.stop
        />
      </div>
      <button v-if="isSearchMode" class="search-clear-button" type="button" aria-label="清除搜索" @click="$emit('clear-search')">×</button>
    </div>

    <button class="settings-button" type="button" :disabled="dragDisabled" aria-label="打开设置" @click="$emit('open-settings', $event)">
      <SettingsIcon class="button-icon" />
      <span>设置</span>
    </button>
  </header>
</template>

<script setup>
import { SearchIcon, SettingsIcon } from "./Icons.js";
import { cx } from "../domain/launchpadLayout.js";

defineProps({
  dragDisabled: { type: Boolean, default: false },
  domRefs: { type: Object, required: true },
  hasSearchQuery: { type: Boolean, default: false },
  isSearchInputFocused: { type: Boolean, default: false },
  isSearchMode: { type: Boolean, default: false },
  searchQuery: { type: String, default: "" },
});

defineEmits(["search-input", "search-focus", "search-blur", "clear-search", "open-settings"]);

function bindRef(target, node) {
  if (target && typeof target === "object" && "value" in target) target.value = node;
}
</script>
