<template>
  <header :ref="(node) => bindElementRef(domRefs.headerRef, node)" class="launchpad-header">
    <div
      :ref="(node) => bindElementRef(domRefs.searchRef, node)"
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
              :ref="(node) => bindInputRef(domRefs.searchInputRef, node)"
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
              @input="handleSearchInput"
              @focus="handleSearchFocus"
              @blur="handleSearchBlur"
              @pointerdown.stop
            />
          </span>
        </span>
      </label>
      <button v-if="isSearchMode" class="search-clear-button" type="button" :aria-label="t('launchpad.search.clear')" @click="$emit('clear-search')">
        <DismissIcon class="search-clear-icon" />
      </button>
    </div>

    <button class="settings-button" type="button" :disabled="dragDisabled" :aria-label="t('launchpad.openSettings')" @click="$emit('open-settings', $event)">
      <SettingsIcon class="button-icon" />
      <span>{{ t("launchpad.settings") }}</span>
    </button>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ComponentPublicInstance, Ref } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import { SearchIcon, SettingsIcon } from "./Icons.js";
import type { LaunchpadSearchInputEvent } from "../composables/useLaunchpadSearch.js";
import { cx } from "../domain/launchpadLayout.js";
import { useLocalization } from "../i18n/localization.js";

type HeaderDomRefs = Readonly<{
  headerRef: Ref<HTMLElement | null>;
  searchInputRef: Ref<HTMLInputElement | null>;
  searchRef: Ref<HTMLElement | null>;
}>;

const props = withDefaults(defineProps<{
  dragDisabled?: boolean;
  domRefs: HeaderDomRefs;
  isSearchMode?: boolean;
  searchQuery?: string;
}>(), {
  dragDisabled: false,
  isSearchMode: false,
  searchQuery: "",
});

const emit = defineEmits<{
  "clear-search": [];
  "open-settings": [event: MouseEvent];
  "search-blur": [];
  "search-focus": [];
  "search-input": [event: LaunchpadSearchInputEvent];
}>();
const { t } = useLocalization();

const isSearchInputFocused = ref(false);
const hasSearchQuery = computed(() => props.searchQuery.trim().length > 0);
const searchPlaceholder = computed(() => t("launchpad.search.placeholder"));

function bindElementRef(
  target: Ref<HTMLElement | null>,
  node: Element | ComponentPublicInstance | null,
): void {
  target.value = node instanceof HTMLElement ? node : null;
}

function bindInputRef(
  target: Ref<HTMLInputElement | null>,
  node: Element | ComponentPublicInstance | null,
): void {
  target.value = node instanceof HTMLInputElement ? node : null;
}

function handleSearchInput(event: Event): void {
  if (!(event.currentTarget instanceof HTMLInputElement)) {
    throw new TypeError("Launchpad search input event currentTarget must be an input element");
  }
  emit("search-input", { target: event.currentTarget });
}

function handleSearchFocus(): void {
  isSearchInputFocused.value = true;
  emit("search-focus");
}

function handleSearchBlur(): void {
  isSearchInputFocused.value = false;
  emit("search-blur");
}
</script>
