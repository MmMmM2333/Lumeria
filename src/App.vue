<template>
  <div
    ref="rootRef"
    :class="cx('launchpad-root', isTextlessMode && 'launchpad-root-textless', !isDesktopOpen && 'launchpad-root-closed', isHomeInteractionDisabled && 'launchpad-root-interaction-disabled', isAppLaunching && 'launchpad-root-app-launching')"
    :style="rootStyle"
    @wheel="handleLaunchpadWheel"
  >
    <div class="launchpad-bg" />

    <Motion
      ref="shellRef"
      class="launchpad-shell"
      :initial="homeShellInitial"
      :animate="homeShellAnimate"
      :transition="homeShellTransition"
      :style="homeShellStyle"
    >
      <header ref="headerRef" class="launchpad-header">
        <div
          ref="searchRef"
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
              ref="searchInputRef"
              class="search-input"
              :value="searchQuery"
              type="search"
              placeholder="搜索应用"
              aria-label="搜索应用"
              @input="handleSearchInput"
              @focus="handleSearchFocus"
              @blur="handleSearchBlur"
              @pointerdown.stop
            />
          </div>
          <button v-if="isSearchMode" class="search-clear-button" type="button" aria-label="清除搜索" @click="clearSearch">×</button>
        </div>

        <button class="settings-button" type="button" :disabled="!!dragMeta" aria-label="打开设置" @click="openSettingsPanel">
          <SettingsIcon class="button-icon" />
          <span>设置</span>
        </button>
      </header>

      <main ref="desktopMainRef" class="desktop-main" tabindex="-1" @focus="keyboardFocusArea = 'desktop'" @pointerdown="handleDesktopSurfacePointerDown">
        <button class="page-button page-button-left" type="button" :disabled="activePageIndex === 0" aria-label="上一页" @pointerdown.stop @click="commitActivePageIndex(activePageIndex - 1)">
          <ChevronLeftIcon class="button-icon" />
        </button>

        <div class="desktop-viewport">
          <div class="desktop-track-clip">
            <Motion
              :key="desktopTrackMotionKey"
              class="desktop-track"
              :initial="activeDesktopTrackAnimate"
              :animate="activeDesktopTrackAnimate"
              :transition="activeDesktopTrackTransition"
            >
              <section v-for="(page, pageNumber) in activePages" :key="`${isSearchMode ? 'search' : 'desktop'}-${pageNumber}`" class="page-section" tabindex="-1">
                <Motion
                  :key="getDesktopGridProjectionKey(pageNumber)"
                  :ref="(node) => setPageRef(node, pageNumber)"
                  :layout="desktopLayoutEnabled"
                  :class="cx('page-grid', isSearchMode && 'search-page-grid')"
                  :style="[getActivePageGridStyle(page), pageGridMeasureStyle]"
                  :transition="layoutSpring"
                  tabindex="-1"
                >
                  <template v-if="shouldRenderActivePage(pageNumber)">
                    <template v-if="isSearchMode && page.length === 0">
                      <div class="search-empty-state">没有找到匹配的应用</div>
                    </template>
                    <DesktopIcon
                      v-for="(item, index) in getVisibleDesktopPage(page)"
                      :key="item.id"
                      :item="item"
                      :source="{ type: isSearchMode ? 'search' : 'page', pageIndex: pageNumber, index }"
                      :pending="!isSearchMode && pendingTargetId === item.id"
                      :dragging="!isSearchMode && dragMeta && dragMeta.item.id === item.id"
                      :folder-preview-page-size="folderPageSize"
                      :draggable="!isSearchMode"
                      :editing="isEditMode"
                      :textless="isTextlessMode"
                      :layout-enabled="desktopLayoutEnabled"
                      :removable="item.type === 'app'"
                      :selected="isIconSelected(isSearchMode ? 'search' : 'desktop', item.id, pageNumber)"
                      :opening="isIconOpening(isSearchMode ? 'search' : 'desktop', item.id, pageNumber)"
                      @pointerdown-icon="beginDrag"
                      @open-app="openApp"
                      @remove-app="removeAppById"
                      @change-app-icon="updateAppCustomIcon"
                      @reset-app-icon="resetAppCustomIcon"
                    />
                  </template>
                </Motion>
              </section>
            </Motion>
          </div>
        </div>

        <button class="page-button page-button-right" type="button" :disabled="activePageIndex >= activePages.length - 1" aria-label="下一页" @pointerdown.stop @click="goNextActivePage">
          <ChevronRightIcon class="button-icon" />
        </button>

        <template v-if="dragMeta">
          <div class="edge-hint edge-hint-left" />
          <div class="edge-hint edge-hint-right" />
        </template>
      </main>

      <footer ref="pageDotsRef" class="page-dots">
        <button
          v-for="index in activePages.length"
          :key="`${isSearchMode ? 'search-dot' : 'page-dot'}-${index}`"
          type="button"
          :class="cx('page-dot', index - 1 === activePageIndex && 'page-dot-active')"
          :aria-label="`切换到第 ${index} 页`"
          @pointerdown.stop
          @click="commitActivePageIndex(index - 1)"
        />
      </footer>
    </Motion>

    <div v-if="isSettingsPanelOpen" class="settings-overlay" @wheel.stop @pointerdown.self="closeSettingsPanel">
      <section class="settings-panel" aria-label="设置">
        <header class="settings-panel-header">
          <div>
            <h2>设置</h2>
            <p>显示偏好与应用管理</p>
          </div>
          <button class="settings-close-button" type="button" aria-label="关闭设置" @click="closeSettingsPanel">×</button>
        </header>

        <div class="settings-panel-body">
          <section class="settings-section" aria-label="显示偏好">
            <div class="settings-section-header">
              <h3>显示偏好</h3>
            </div>
            <div class="settings-grid">
              <div class="settings-field">
                <span>桌面行数</span>
                <div class="settings-number-control">
                  <input v-model.number="draftRows" min="2" max="8" type="number" aria-label="桌面行数" />
                  <div class="settings-number-buttons">
                    <button type="button" aria-label="增加桌面行数" @click.prevent="changeDraftRows(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                    <button type="button" aria-label="减少桌面行数" @click.prevent="changeDraftRows(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                  </div>
                </div>
              </div>
              <div class="settings-field">
                <span>桌面列数</span>
                <div class="settings-number-control">
                  <input v-model.number="draftCols" min="3" max="10" type="number" aria-label="桌面列数" />
                  <div class="settings-number-buttons">
                    <button type="button" aria-label="增加桌面列数" @click.prevent="changeDraftCols(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                    <button type="button" aria-label="减少桌面列数" @click.prevent="changeDraftCols(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                  </div>
                </div>
              </div>
              <div class="settings-field">
                <span>文件夹行数</span>
                <div class="settings-number-control">
                  <input v-model.number="draftFolderRows" min="2" max="6" type="number" aria-label="文件夹行数" />
                  <div class="settings-number-buttons">
                    <button type="button" aria-label="增加文件夹行数" @click.prevent="changeDraftFolderRows(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                    <button type="button" aria-label="减少文件夹行数" @click.prevent="changeDraftFolderRows(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                  </div>
                </div>
              </div>
              <div class="settings-field">
                <span>文件夹列数</span>
                <div class="settings-number-control">
                  <input v-model.number="draftFolderCols" min="2" max="8" type="number" aria-label="文件夹列数" />
                  <div class="settings-number-buttons">
                    <button type="button" aria-label="增加文件夹列数" @click.prevent="changeDraftFolderCols(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                    <button type="button" aria-label="减少文件夹列数" @click.prevent="changeDraftFolderCols(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                  </div>
                </div>
              </div>
              <div class="settings-field">
                <span>图标大小</span>
                <div class="settings-number-control settings-number-control-wide">
                  <input v-model.number="draftIconSize" min="48" max="96" type="number" aria-label="图标大小" />
                  <span class="settings-number-unit">px</span>
                  <div class="settings-number-buttons">
                    <button type="button" aria-label="增大图标" @click.prevent="changeDraftIconSize(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                    <button type="button" aria-label="缩小图标" @click.prevent="changeDraftIconSize(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                  </div>
                </div>
              </div>
              <label class="settings-toggle">
                <span>无字模式</span>
                <input v-model="isTextlessMode" type="checkbox" />
              </label>
            </div>
          </section>

          <section class="settings-section" aria-label="页面整理">
            <div class="settings-section-header">
              <div>
                <h3>页面整理</h3>
                <p>强制填满页面会重新压实桌面项目，并破坏当前分页布局。</p>
              </div>
              <button class="settings-warning-button" type="button" :disabled="!!dragMeta" @click="confirmForceFillAllPages">强制填满</button>
            </div>
          </section>

          <section class="settings-section" aria-label="应用管理">
            <div class="settings-section-header">
              <div>
                <h3>应用管理</h3>
                <p>{{ managedApps.length }} 个应用 · 已选择 {{ selectedManagedAppCount }} 个</p>
              </div>
              <div class="settings-inline-actions">
                <button class="settings-secondary-button" type="button" :disabled="!canScanManagedApps || isScanningApps" @click="rescanManagedApps">
                  {{ isScanningApps ? "扫描中" : "扫描应用" }}
                </button>
                <button class="settings-danger-button" type="button" :disabled="selectedManagedAppCount === 0" @click="deleteSelectedManagedApps">批量删除</button>
              </div>
            </div>

            <div class="settings-add-app-row">
              <input v-model="newAppName" type="text" maxlength="64" placeholder="应用名称" aria-label="应用名称" />
              <input v-model="newAppTarget" type="text" placeholder="启动路径或 URL" aria-label="启动路径或 URL" />
              <button class="settings-primary-button" type="button" :disabled="!canAddManagedApp" @click="addManagedApp">新增</button>
            </div>

            <div class="settings-list-actions">
              <button class="settings-link-button" type="button" @click="selectAllManagedApps">全选</button>
              <button class="settings-link-button" type="button" @click="clearManagedAppSelection">清空选择</button>
            </div>

            <div class="app-manager-list" role="list" aria-label="所有应用">
              <label v-for="app in managedApps" :key="app.id" class="app-manager-item" role="listitem">
                <input
                  type="checkbox"
                  :checked="appManagerSelectedIds.includes(app.id)"
                  @change="toggleManagedAppSelection(app.id, $event.target.checked)"
                />
                <span class="app-manager-icon">
                  <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
                  <span v-else>{{ app.emoji }}</span>
                </span>
                <span class="app-manager-name">{{ app.name }}</span>
              </label>
            </div>
          </section>
        </div>

        <footer class="settings-actions">
          <button class="settings-secondary-button" type="button" @click="closeSettingsPanel">取消</button>
          <button class="settings-primary-button" type="button" :disabled="!!dragMeta" @click="applySettingsConfig">应用</button>
        </footer>
      </section>
    </div>

    <div v-if="warningDialog" class="warning-dialog-overlay" @wheel.stop @pointerdown.self="closeWarningDialog">
      <section class="warning-dialog" role="alertdialog" aria-modal="true" :aria-label="warningDialog.title">
        <div class="warning-dialog-icon">
          <AlertTriangleIcon class="warning-dialog-svg" />
        </div>
        <div class="warning-dialog-content">
          <h2>{{ warningDialog.title }}</h2>
          <p>{{ warningDialog.message }}</p>
        </div>
        <footer class="warning-dialog-actions">
          <button class="settings-secondary-button" type="button" @click="closeWarningDialog">{{ warningDialog.cancelText }}</button>
          <button class="settings-warning-button" type="button" @click="confirmWarningDialog">{{ warningDialog.confirmText }}</button>
        </footer>
      </section>
    </div>

    <div
      v-if="renderedFolder"
      :key="renderedFolder.id"
      :class="cx('folder-overlay', (isFolderClosing || isFolderAppLaunchClosing) && 'folder-overlay-closing')"
      @pointerdown.self="handleFolderOverlayPointerDown"
    >
      <Motion
        ref="folderPanelRef"
        :class="cx('folder-panel', isFolderAppLaunchClosing && 'folder-panel-app-launching')"
        tabindex="-1"
        :initial="folderPanelInitial"
        :animate="folderPanelAnimate"
        :transition="panelSpring"
        :style="folderPanelStyle"
      >
        <Motion
          class="folder-panel-content"
          :initial="folderContentInitial"
          :animate="folderContentAnimate"
          :transition="folderContentTransition"
        >
        <div class="folder-header">
          <div class="folder-title-block">
            <input
              class="folder-name-input"
              :value="renderedFolder.name"
              :disabled="isFolderClosing"
              maxlength="32"
              aria-label="文件夹名称"
              @input="renameFolder(renderedFolder.id, $event.target.value)"
              @pointerdown.stop
            />
            <p>文件夹内使用紧凑数组排序；拖到两侧可切换或新建文件夹页。</p>
          </div>
          <div class="folder-count">{{ folderItemCount(renderedFolder) }} 个项目 · {{ folderRows }}×{{ folderCols }}</div>
        </div>

        <div class="folder-pages-shell">
          <button
            class="folder-page-zone folder-page-zone-left"
            type="button"
            :disabled="folderPageIndex === 0"
            aria-label="文件夹上一页"
            @pointerdown.stop
            @click="turnFolderPage(-1)"
          >
            <ChevronLeftIcon class="button-icon" />
          </button>

          <div class="folder-viewport">
            <Motion class="folder-track" :animate="folderTrackAnimate" :transition="desktopTrackTransition">
              <section v-for="(page, pageNumber) in folderPages" :key="pageNumber" class="folder-page-section">
                <Motion
                  :ref="(node) => setFolderPageRef(node, pageNumber)"
                  layout
                  class="folder-grid"
                  tabindex="-1"
                  :style="folderGridStyle"
                  :transition="layoutSpring"
                >
                  <DesktopIcon
                    v-for="(child, index) in getVisibleFolderPage(page)"
                    :key="child.id"
                    :item="child"
                    :source="{ type: 'folder', folderId: renderedFolder.id, index, pageIndex: pageNumber, slotIndex: index }"
                    :pending="false"
                    :dragging="dragMeta && dragMeta.item.id === child.id"
                    :editing="isEditMode"
                    :textless="isTextlessMode"
                    :removable="child.type === 'app'"
                    :selected="isIconSelected('folder', child.id, pageNumber, renderedFolder.id)"
                    :opening="isIconOpening('folder', child.id, pageNumber, renderedFolder.id)"
                    compact
                    @pointerdown-icon="beginDrag"
                    @open-app="openApp"
                    @remove-app="removeAppById"
                    @change-app-icon="updateAppCustomIcon"
                    @reset-app-icon="resetAppCustomIcon"
                  />
                </Motion>
              </section>
            </Motion>
          </div>

          <button
            class="folder-page-zone folder-page-zone-right"
            type="button"
            :disabled="folderPageIndex >= folderPages.length - 1"
            aria-label="文件夹下一页"
            @pointerdown.stop
            @click="turnFolderPage(1)"
          >
            <ChevronRightIcon class="button-icon" />
          </button>
        </div>

        <footer v-if="folderPages.length > 1" class="folder-page-dots">
          <button
            v-for="index in folderPages.length"
            :key="index"
            type="button"
            :class="cx('folder-page-dot', index - 1 === folderPageIndex && 'folder-page-dot-active')"
            :aria-label="`切换到文件夹第 ${index} 页`"
            @pointerdown.stop
            @click="commitFolderPageIndex(index - 1)"
          />
        </footer>
        </Motion>
      </Motion>
    </div>

    <Motion
      v-if="launchGhost"
      key="app-launch-ghost"
      class="app-launch-ghost"
      :initial="{ opacity: 1, scale: 1 }"
      :animate="{ opacity: 0, scale: 1.92 }"
      :transition="appLaunchGhostTransition"
      :style="launchGhostStyle"
    >
      <div class="app-launch-ghost-box">
        <img v-if="getIconSource(launchGhost.app)" class="app-launch-ghost-image" :src="getIconSource(launchGhost.app)" alt="" draggable="false" />
        <span v-else class="app-launch-ghost-emoji">{{ launchGhost.app.emoji }}</span>
      </div>
    </Motion>

    <Motion
      v-if="dragMeta"
      key="drag-preview"
      ref="dragPreviewRef"
      class="drag-preview"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :transition="dragPreviewSpring"
    >
      <div class="drag-preview-box">
        <div v-if="dragMeta.item.type === 'folder'" class="drag-folder-thumb">
          <div
            v-for="(child, index) in folderPreviewSlots(dragMeta.item)"
            :key="child ? child.id : `drag-folder-empty-${index}`"
            :class="cx('drag-folder-child', !child && 'folder-child-empty')"
          >
            <img v-if="getIconSource(child)" class="drag-folder-child-image" :src="getIconSource(child)" alt="" draggable="false" />
            <span v-else-if="child">{{ child.emoji }}</span>
          </div>
        </div>
        <img v-else-if="getIconSource(dragMeta.item)" class="drag-preview-image" :src="getIconSource(dragMeta.item)" alt="" draggable="false" />
        <span v-else class="drag-preview-emoji">{{ dragMeta.item.emoji }}</span>
      </div>
      <div v-if="!isTextlessMode" class="drag-preview-name">{{ dragMeta.item.name }}</div>
    </Motion>
  </div>
</template>

<script setup>
import { Motion } from "motion-v";
import { computed, ref } from "vue";
import DesktopIcon from "./components/DesktopIcon.js";
import { AlertTriangleIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, SearchIcon, SettingsIcon } from "./components/Icons.js";
import { useLaunchpadController } from "./composables/useLaunchpadController.js";
import "./styles/launchpad.css";

const {
  rootRef,
  rootStyle,
  cx,
  isTextlessMode,
  isDesktopOpen,
  isHomeInteractionDisabled,
  isAppLaunching,
  isEditMode,
  isSettingsPanelOpen,
  handleLaunchpadWheel,
  shellRef,
  homeShellInitial,
  homeShellAnimate,
  homeShellTransition,
  homeShellStyle,
  headerRef,
  draftRows,
  draftCols,
  draftFolderRows,
  draftFolderCols,
  draftIconSize,
  changeDraftRows,
  changeDraftCols,
  changeDraftFolderRows,
  changeDraftFolderCols,
  changeDraftIconSize,
  managedApps,
  appManagerSelectedIds,
  selectedManagedAppCount,
  newAppName,
  newAppTarget,
  isScanningApps,
  canAddManagedApp,
  canScanManagedApps,
  toggleManagedAppSelection,
  selectAllManagedApps,
  clearManagedAppSelection,
  confirmForceFillAllPages,
  warningDialog,
  closeWarningDialog,
  confirmWarningDialog,
  rescanManagedApps,
  addManagedApp,
  deleteSelectedManagedApps,
  dragMeta,
  applySettingsConfig,
  openSettingsPanel,
  closeSettingsPanel,
  searchRef,
  isSearchMode,
  searchInputRef,
  searchQuery,
  handleSearchInput,
  keyboardFocusArea,
  clearSearch,
  desktopMainRef,
  handleDesktopSurfacePointerDown,
  activePageIndex,
  activePages,
  shouldRenderActivePage,
  commitActivePageIndex,
  goNextActivePage,
  desktopTrackMotionKey,
  activeDesktopTrackAnimate,
  activeDesktopTrackTransition,
  getDesktopGridProjectionKey,
  setPageRef,
  desktopLayoutEnabled,
  getActivePageGridStyle,
  pageGridMeasureStyle,
  getVisibleDesktopPage,
  pendingTargetId,
  folderPageSize,
  isIconSelected,
  isIconOpening,
  beginDrag,
  openApp,
  removeAppById,
  updateAppCustomIcon,
  resetAppCustomIcon,
  layoutSpring,
  pageDotsRef,
  renderedFolder,
  isFolderClosing,
  isFolderAppLaunchClosing,
  handleFolderOverlayPointerDown,
  folderPanelRef,
  folderPanelInitial,
  folderPanelAnimate,
  panelSpring,
  folderPanelStyle,
  folderContentInitial,
  folderContentAnimate,
  folderContentTransition,
  renameFolder,
  folderItemCount,
  folderRows,
  folderCols,
  folderPageIndex,
  turnFolderPage,
  folderPages,
  folderTrackAnimate,
  desktopTrackTransition,
  setFolderPageRef,
  folderGridStyle,
  getVisibleFolderPage,
  commitFolderPageIndex,
  launchGhost,
  appLaunchGhostTransition,
  launchGhostStyle,
  dragPreviewRef,
  dragPreviewSpring,
  folderPreviewSlots,
} = useLaunchpadController();

const isSearchInputFocused = ref(false);
const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0);

function handleSearchFocus() {
  keyboardFocusArea.value = "search";
  isSearchInputFocused.value = true;
}

function handleSearchBlur() {
  isSearchInputFocused.value = false;
}

function getIconSource(item) {
  return item?.customIconDataUrl || item?.iconDataUrl || item?.iconUrl || null;
}
</script>
