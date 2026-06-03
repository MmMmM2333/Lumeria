<template>
  <main :ref="(node) => bindRef(domRefs.desktopMainRef, node)" class="desktop-main" tabindex="-1" @focus="$emit('desktop-focus')">
    <div class="desktop-viewport">
      <div class="desktop-track-clip">
        <Motion
          :key="desktopTrackMotionKey"
          class="desktop-track"
          :initial="activeDesktopTrackAnimate"
          :animate="activeDesktopTrackAnimate"
          :transition="activeDesktopTrackTransition"
        >
          <section
            v-for="(page, pageNumber) in activePages"
            :key="`${isSearchMode ? 'search' : 'desktop'}-${pageNumber}`"
            class="page-section"
            :aria-hidden="pageNumber === activePageIndex ? null : 'true'"
            :inert="pageNumber !== activePageIndex"
            tabindex="-1"
          >
            <component
              :is="desktopLayoutEnabled ? Motion : 'div'"
              :key="getDesktopGridProjectionKey(pageNumber)"
              :ref="(node) => setPageRef(node, pageNumber)"
              :layout="desktopLayoutEnabled ? true : undefined"
              :class="cx('page-grid', isSearchMode && 'search-page-grid')"
              :style="[getActivePageGridStyle(page), pageGridMeasureStyle]"
              :transition="desktopLayoutEnabled ? layoutSpring : undefined"
              tabindex="-1"
            >
              <template v-if="getDesktopPageRenderMode(pageNumber) === 'interactive'">
                <template v-if="isSearchMode && page.length === 0">
                  <div class="search-empty-state">没有找到匹配的应用</div>
                </template>
                <DesktopIcon
                  v-for="(item, index) in getVisibleDesktopPage(page)"
                  :key="item.id"
                  :item="item"
                  :source="{ type: isSearchMode ? 'search' : 'page', pageIndex: pageNumber, index }"
                  :dragging="!isSearchMode && dragMeta && dragMeta.item.id === item.id"
                  :folder-preview-page-size="folderPageSize"
                  :draggable="!isSearchMode"
                  :editing="isEditMode"
                  :textless="isTextlessMode"
                  :layout-enabled="desktopLayoutEnabled"
                  :removable="item.type === 'app'"
                  :selected="isIconSelected(isSearchMode ? 'search' : 'desktop', item.id, pageNumber)"
                  :drop-target="!isSearchMode && dragFolderTargetId === item.id"
                  :opening="isIconOpening(isSearchMode ? 'search' : 'desktop', item.id, pageNumber)"
                  :is-folder-preview-child-ghosted="isFolderOpeningPreviewGhosted"
                  :is-folder-preview-frame-ghosted="isFolderOpeningPreviewFrameGhosted"
                  :launch-target-status="showMissingLaunchTargetBadge ? launchTargetStatusById[item.id] : null"
                  @pointerdown-icon="(...args) => forward('pointerdown-icon', args)"
                  @open-app="(...args) => forward('open-app', args)"
                  @context-menu-icon="(...args) => forward('context-menu-icon', args)"
                  @remove-app="$emit('remove-app', $event)"
                  @choose-app-icon="$emit('choose-app-icon', $event)"
                  @reset-app-icon="$emit('reset-app-icon', $event)"
                />
              </template>
              <StaticPagePreview
                v-else-if="getDesktopPageRenderMode(pageNumber) === 'static-real'"
                :items="getVisibleDesktopPage(page)"
                :folder-preview-page-size="folderPageSize"
                :textless="isTextlessMode"
              />
            </component>
          </section>
        </Motion>
      </div>
    </div>
  </main>
</template>

<script setup>
import { Motion } from "motion-v";
import DesktopIcon from "./DesktopIcon.js";
import StaticPagePreview from "./StaticPagePreview.js";
import { cx } from "../domain/launchpadLayout.js";

defineProps({
  activeDesktopTrackAnimate: { type: Object, required: true },
  activeDesktopTrackTransition: { type: Object, required: true },
  activePageIndex: { type: Number, required: true },
  activePages: { type: Array, required: true },
  desktopLayoutEnabled: { type: Boolean, default: true },
  desktopTrackMotionKey: { type: String, required: true },
  domRefs: { type: Object, required: true },
  dragFolderTargetId: { type: String, default: null },
  dragMeta: { type: Object, default: null },
  folderPageSize: { type: Number, required: true },
  getActivePageGridStyle: { type: Function, required: true },
  getDesktopGridProjectionKey: { type: Function, required: true },
  getDesktopPageRenderMode: { type: Function, required: true },
  getVisibleDesktopPage: { type: Function, required: true },
  isEditMode: { type: Boolean, default: false },
  isFolderOpeningPreviewFrameGhosted: { type: Function, default: () => false },
  isFolderOpeningPreviewGhosted: { type: Function, default: () => false },
  isIconOpening: { type: Function, required: true },
  isIconSelected: { type: Function, required: true },
  isSearchMode: { type: Boolean, default: false },
  isTextlessMode: { type: Boolean, default: false },
  launchTargetStatusById: { type: Object, default: () => ({}) },
  layoutSpring: { type: Object, required: true },
  pageGridMeasureStyle: { type: Object, required: true },
  setPageRef: { type: Function, required: true },
  showMissingLaunchTargetBadge: { type: Boolean, default: true },
});

const emit = defineEmits([
  "desktop-focus",
  "pointerdown-icon",
  "open-app",
  "context-menu-icon",
  "remove-app",
  "choose-app-icon",
  "reset-app-icon",
]);

function bindRef(target, node) {
  if (target && typeof target === "object" && "value" in target) target.value = node;
}

function forward(eventName, args) {
  emit(eventName, ...args);
}
</script>
