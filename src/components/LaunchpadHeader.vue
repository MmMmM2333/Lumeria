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
      <label class="search-pill-label" for="launchpad-search" @pointerdown.stop>
        <span class="search-pill-content">
          <SearchIcon class="hint-icon" @mousedown.prevent />
          <span class="search-pill-input-slot">
            <span class="search-pill-placeholder" aria-hidden="true">{{ searchPlaceholder }}</span>
            <input
              :ref="(node) => bindRef(domRefs.searchInputRef, node)"
              id="launchpad-search"
              class="search-input"
              :value="searchQuery"
              type="search"
              autocomplete="off"
              autocapitalize="none"
              autocorrect="off"
              :placeholder="searchPlaceholder"
              :aria-label="t('launchpad.search.label')"
              spellcheck="false"
              @input="$emit('search-input', $event)"
              @focus="handleSearchFocus"
              @blur="handleSearchBlur"
              @pointerdown.stop
            />
          </span>
        </span>
      </label>
      <button v-if="isSearchMode" class="search-clear-button" type="button" :aria-label="t('launchpad.search.clear')" @click="$emit('clear-search')">×</button>
    </div>

    <button class="settings-button" type="button" :disabled="dragDisabled" :aria-label="t('launchpad.openSettings')" @click="$emit('open-settings', $event)">
      <SettingsIcon class="button-icon" />
      <span>{{ t("launchpad.settings") }}</span>
    </button>
  </header>
</template>

<script setup>
import { computed, ref } from "vue";
import { SearchIcon, SettingsIcon } from "./Icons.js";
import { cx } from "../domain/launchpadLayout.js";
import { useLocalization } from "../i18n/localization.js";

const props = defineProps({
  dragDisabled: { type: Boolean, default: false },
  domRefs: { type: Object, required: true },
  isSearchMode: { type: Boolean, default: false },
  searchQuery: { type: String, default: "" },
});

const emit = defineEmits(["search-input", "search-focus", "search-blur", "clear-search", "open-settings"]);
const { t } = useLocalization();

const isSearchInputFocused = ref(false);
const hasSearchQuery = computed(() => props.searchQuery.trim().length > 0);
const searchPlaceholder = computed(() => t("launchpad.search.placeholder"));

function bindRef(target, node) {
  if (target && typeof target === "object" && "value" in target) target.value = node;
}

function handleSearchFocus() {
  isSearchInputFocused.value = true;
  emit("search-focus");
}

function handleSearchBlur() {
  isSearchInputFocused.value = false;
  emit("search-blur");
}
</script>
