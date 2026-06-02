<template>
  <div
    v-if="state.renderedFolder.value"
    :key="state.renderedFolder.value.id"
    :class="cx('folder-overlay', (state.isFolderClosing.value || state.isFolderAppLaunchClosing.value) && 'folder-overlay-closing')"
    @pointerdown.self="state.handleFolderOverlayPointerDown"
  >
    <Motion
      :ref="(node) => bindRef(state.folderPanelRef, node)"
      :class="cx('folder-panel', state.isFolderAppLaunchClosing.value && 'folder-panel-app-launching')"
      tabindex="-1"
      :initial="state.folderPanelInitial.value"
      :animate="state.folderPanelAnimate.value"
      :transition="state.folderPanelTransition.value"
      :style="state.folderPanelStyle.value"
    >
      <Motion
        class="folder-panel-content"
        :initial="state.folderContentInitial"
        :animate="state.folderContentAnimate.value"
        :transition="state.folderContentTransition"
      >
        <div class="folder-header">
          <input
            class="folder-name-input"
            name="folderName"
            :value="state.renderedFolder.value.name"
            :disabled="state.isFolderClosing.value"
            maxlength="32"
            aria-label="文件夹名称"
            @focus="rememberFolderNameBeforeEdit(state.renderedFolder.value.name)"
            @input="handleFolderNameInput(state.renderedFolder.value.id, $event)"
            @blur="restoreEmptyFolderName(state.renderedFolder.value.id, $event)"
            @keydown.enter.prevent.stop="$event.target.blur()"
            @pointerdown.stop
          />
        </div>

        <div class="folder-pages-shell">
          <div :ref="(node) => bindRef(state.folderViewportRef, node)" class="folder-viewport">
            <Motion class="folder-track" :animate="state.folderTrackAnimate.value" :transition="state.desktopTrackTransition">
              <section
                v-for="(page, pageNumber) in state.folderPages.value"
                :key="pageNumber"
                class="folder-page-section"
                :aria-hidden="pageNumber === state.folderPageIndex.value ? null : 'true'"
                :inert="pageNumber !== state.folderPageIndex.value"
              >
                <component
                  :is="state.folderLayoutEnabled.value ? Motion : 'div'"
                  :ref="(node) => state.setFolderPageRef(node, pageNumber)"
                  :layout="state.folderLayoutEnabled.value ? true : undefined"
                  class="folder-grid"
                  tabindex="-1"
                  :style="state.folderGridStyle.value"
                  :transition="state.folderLayoutEnabled.value ? state.layoutSpring : undefined"
                >
                  <template v-if="state.getFolderPageRenderMode(pageNumber) === 'interactive'">
                    <DesktopIcon
                      v-for="(child, index) in state.getVisibleFolderPage(page)"
                      :key="child.id"
                      :item="child"
                      :source="{ type: 'folder', folderId: state.renderedFolder.value.id, index, pageIndex: pageNumber, slotIndex: index }"
                      :dragging="state.dragMeta.value && state.dragMeta.value.item.id === child.id"
                      :editing="state.isEditMode.value"
                      :textless="state.isTextlessMode.value"
                      :layout-enabled="state.folderLayoutEnabled.value"
                      :removable="child.type === 'app'"
                      :selected="state.isIconSelected('folder', child.id, pageNumber, state.renderedFolder.value.id)"
                      :opening="state.isIconOpening('folder', child.id, pageNumber, state.renderedFolder.value.id)"
                      :launch-target-status="state.showMissingLaunchTargetBadge.value ? state.launchTargetStatusById.value[child.id] : null"
                      @pointerdown-icon="(...args) => forward('pointerdown-icon', args)"
                      @open-app="(...args) => forward('open-app', args)"
                      @context-menu-icon="(...args) => forward('context-menu-icon', args)"
                      @remove-app="state.removeAppById"
                      @choose-app-icon="state.openExistingAppIconChooser"
                      @reset-app-icon="state.resetAppCustomIcon"
                    />
                  </template>
                  <StaticPagePreview
                    v-else-if="state.getFolderPageRenderMode(pageNumber) === 'static-real'"
                    :items="state.getVisibleFolderPage(page)"
                    :folder-preview-page-size="state.folderPageSize.value"
                    :textless="state.isTextlessMode.value"
                  />
                </component>
              </section>
            </Motion>
          </div>

          <footer v-if="state.folderPages.value.length > 1" class="folder-page-dots">
            <button
              v-for="index in state.folderPages.value.length"
              :key="index"
              type="button"
              :class="cx('page-dot', index - 1 === state.folderPageIndex.value && 'page-dot-active')"
              :aria-label="`切换到文件夹第 ${index} 页`"
              @pointerdown.stop
              @click="state.commitFolderPageIndex(index - 1)"
            />
          </footer>
        </div>
      </Motion>
    </Motion>
  </div>
</template>

<script setup>
import { Motion } from "motion-v";
import { ref } from "vue";
import DesktopIcon from "./DesktopIcon.js";
import StaticPagePreview from "./StaticPagePreview.js";
import { cx } from "../domain/launchpadLayout.js";

const props = defineProps({
  state: { type: Object, required: true },
});

const emit = defineEmits(["pointerdown-icon", "open-app", "context-menu-icon"]);
const folderNameBeforeEdit = ref("");

function bindRef(target, node) {
  if (target && typeof target === "object" && "value" in target) target.value = node;
}

function forward(eventName, args) {
  emit(eventName, ...args);
}

function rememberFolderNameBeforeEdit(name) {
  folderNameBeforeEdit.value = String(name || "新文件夹").slice(0, 32);
}

function handleFolderNameInput(folderId, event) {
  const nextName = String(event?.target?.value || "").slice(0, 32);
  if (!nextName) return;
  props.state.renameFolder(folderId, nextName);
}

function restoreEmptyFolderName(folderId, event) {
  const input = event?.target;
  if (input?.value) return;
  const fallbackName = folderNameBeforeEdit.value || props.state.renderedFolder.value?.name || "新文件夹";
  if (input) input.value = fallbackName;
  props.state.renameFolder(folderId, fallbackName);
}
</script>
