<template>
  <div
    ref="rootRef"
    :class="cx('launchpad-root', isTextlessMode && 'launchpad-root-textless', !isDesktopOpen && 'launchpad-root-closed', isHomeInteractionDisabled && 'launchpad-root-interaction-disabled', isAppLaunching && 'launchpad-root-app-launching')"
    :style="rootStyle"
    @wheel="handleLaunchpadWheel"
    @pointerdown="handleLaunchpadSurfacePointerDown"
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
              placeholder="搜索"
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

      <main ref="desktopMainRef" class="desktop-main" tabindex="-1" @focus="keyboardFocusArea = 'desktop'">
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
                      @pointerdown-icon="beginDrag"
                      @open-app="openApp"
                      @context-menu-icon="openIconContextMenu"
                      @remove-app="removeAppById"
                      @choose-app-icon="openExistingAppIconChooser"
                      @reset-app-icon="resetAppCustomIcon"
                    />
                  </template>
                  <StaticPagePreview
                    v-else-if="shouldRenderStaticActivePage(pageNumber)"
                    :items="getVisibleDesktopPage(page)"
                    :folder-preview-page-size="folderPageSize"
                    :textless="isTextlessMode"
                  />
                </Motion>
              </section>
            </Motion>
          </div>
        </div>
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

    <Motion
      v-if="shouldRenderSettingsPanel"
      key="settings-overlay"
      :class="cx('settings-overlay', !isSettingsPanelOpen && 'settings-overlay-closing')"
      :initial="{ opacity: 0 }"
      :animate="settingsOverlayAnimate"
      :transition="{ duration: 0.16 }"
      @wheel.stop
      @pointerdown.self="closeSettingsPanel"
    >
      <Motion
        class="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        :initial="settingsPanelInitial"
        :animate="settingsPanelAnimate"
        :transition="panelSpring"
      >
        <header class="settings-panel-header">
          <div>
            <h2>设置</h2>
          </div>
          <button class="settings-close-button" type="button" aria-label="关闭设置" @click="closeSettingsPanel">×</button>
        </header>

        <nav class="settings-tabs" role="tablist" aria-label="设置分类">
          <button
            v-for="tab in settingsTabs"
            :key="tab.id"
            type="button"
            role="tab"
            :class="cx('settings-tab', activeSettingsTab === tab.id && 'settings-tab-active')"
            :aria-selected="activeSettingsTab === tab.id"
            :tabindex="activeSettingsTab === tab.id ? 0 : -1"
            @click="activeSettingsTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </nav>

        <div class="settings-panel-body">
          <div v-if="activeSettingsTab === 'general'" class="settings-tab-panel" role="tabpanel" aria-label="通用">
            <section class="settings-section" aria-label="通用">
              <div class="settings-section-header">
                <h3>通用</h3>
              </div>
              <div class="settings-options">
                <label class="settings-option settings-option-disabled">
                  <span class="settings-option-copy">
                    <span>开机自启</span>
                    <span class="settings-field-hint">登录 Windows 后自动打开 LaunchPad</span>
                  </span>
                  <input type="checkbox" aria-label="开机自启" disabled />
                </label>
                <div class="settings-option settings-option-disabled">
                  <span class="settings-option-copy">
                    <span>快捷键</span>
                    <span class="settings-field-hint">快速显示或隐藏 LaunchPad</span>
                  </span>
                  <div class="settings-hotkey-control">
                    <kbd>Alt + Space</kbd>
                    <button class="settings-secondary-button" type="button" disabled>录制</button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div v-else-if="activeSettingsTab === 'interface'" class="settings-tab-panel" role="tabpanel" aria-label="界面">
            <section class="settings-section" aria-label="显示偏好">
              <div class="settings-section-header">
                <h3>显示偏好</h3>
              </div>
              <div class="settings-grid">
                <div class="settings-field settings-field-wide settings-grid-layout-field">
                  <span>桌面布局</span>
                  <div class="settings-grid-layout-control" aria-label="桌面布局">
                    <div class="settings-number-control">
                      <input v-model.number="draftRows" min="2" max="8" type="number" aria-label="桌面行数" />
                      <div class="settings-number-buttons">
                        <button type="button" aria-label="增加桌面行数" @click.prevent="changeDraftRows(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                        <button type="button" aria-label="减少桌面行数" @click.prevent="changeDraftRows(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                      </div>
                    </div>
                    <span class="settings-grid-layout-separator">×</span>
                    <div class="settings-number-control">
                      <input v-model.number="draftCols" min="3" max="10" type="number" aria-label="桌面列数" />
                      <div class="settings-number-buttons">
                        <button type="button" aria-label="增加桌面列数" @click.prevent="changeDraftCols(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                        <button type="button" aria-label="减少桌面列数" @click.prevent="changeDraftCols(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="settings-field settings-field-wide settings-grid-layout-field">
                  <span>文件夹布局</span>
                  <div class="settings-grid-layout-control" aria-label="文件夹布局">
                    <div class="settings-number-control">
                      <input v-model.number="draftFolderRows" min="2" max="6" type="number" aria-label="文件夹行数" />
                      <div class="settings-number-buttons">
                        <button type="button" aria-label="增加文件夹行数" @click.prevent="changeDraftFolderRows(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                        <button type="button" aria-label="减少文件夹行数" @click.prevent="changeDraftFolderRows(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                      </div>
                    </div>
                    <span class="settings-grid-layout-separator">×</span>
                    <div class="settings-number-control">
                      <input v-model.number="draftFolderCols" min="2" max="8" type="number" aria-label="文件夹列数" />
                      <div class="settings-number-buttons">
                        <button type="button" aria-label="增加文件夹列数" @click.prevent="changeDraftFolderCols(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                        <button type="button" aria-label="减少文件夹列数" @click.prevent="changeDraftFolderCols(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="settings-field settings-field-wide">
                  <span class="settings-field-copy">
                    <span>图标大小</span>
                    <span class="settings-field-hint">{{ ICON_SIZE_MIN }}-{{ ICON_SIZE_MAX }}px</span>
                  </span>
                  <div class="settings-number-control settings-number-control-wide">
                    <input v-model.number="draftIconSize" :min="ICON_SIZE_MIN" :max="ICON_SIZE_MAX" :step="ICON_SIZE_STEP" type="number" aria-label="图标大小" />
                    <span class="settings-number-unit">px</span>
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增大图标" @click.prevent="changeDraftIconSize(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="缩小图标" @click.prevent="changeDraftIconSize(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                </div>
                <div class="settings-field settings-field-wide settings-folder-icon-size-field">
                  <span class="settings-field-copy">
                    <span>文件夹图标大小</span>
                    <span class="settings-field-hint">{{ ICON_SIZE_MIN }}-{{ ICON_SIZE_MAX }}px</span>
                  </span>
                  <div class="settings-folder-icon-size-control">
                    <div class="settings-segmented-control" aria-label="文件夹图标大小模式">
                      <button
                        type="button"
                        :class="cx('settings-segmented-button', draftFolderIconSizeMode === 'global' && 'settings-segmented-button-active')"
                        @click="setDraftFolderIconSizeMode('global')"
                      >
                        跟随全局
                      </button>
                      <button
                        type="button"
                        :class="cx('settings-segmented-button', draftFolderIconSizeMode === 'custom' && 'settings-segmented-button-active')"
                        @click="setDraftFolderIconSizeMode('custom')"
                      >
                        自定义
                      </button>
                    </div>
                    <div v-if="draftFolderIconSizeMode === 'custom'" class="settings-number-control settings-number-control-wide">
                      <input v-model.number="draftFolderIconSize" :min="ICON_SIZE_MIN" :max="ICON_SIZE_MAX" :step="ICON_SIZE_STEP" type="number" aria-label="文件夹图标大小" />
                      <span class="settings-number-unit">px</span>
                      <div class="settings-number-buttons">
                        <button type="button" aria-label="增大文件夹图标" @click.prevent="changeDraftFolderIconSize(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                        <button type="button" aria-label="缩小文件夹图标" @click.prevent="changeDraftFolderIconSize(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                      </div>
                    </div>
                  </div>
                </div>
                <label class="settings-toggle">
                  <span>无字模式</span>
                  <input v-model="isTextlessMode" type="checkbox" />
                </label>
              </div>
            </section>

            <section class="settings-section" aria-label="整理空位">
              <div class="settings-section-header">
                <div>
                  <h3>整理空位</h3>
                  <p>根据当前行列布局，将App向前整理以填补空位</p>
                </div>
                <button class="settings-warning-button" type="button" :disabled="!!dragMeta" @click="confirmForceFillAllPages">重新整理</button>
              </div>
            </section>
          </div>

          <div v-else-if="activeSettingsTab === 'apps'" class="settings-tab-panel" role="tabpanel" aria-label="Apps">
            <section class="settings-section" aria-label="应用管理">
              <div class="settings-section-header">
                <div>
                  <h3>应用管理</h3>
                  <p>{{ filteredManagedApps.length }} / {{ managedApps.length }} 个应用 · 已选择 {{ selectedManagedAppCount }} 个</p>
                </div>
                <div class="settings-inline-actions">
                  <button class="settings-secondary-button" type="button" :disabled="!canScanManagedApps || isScanningApps" @click="rescanManagedApps">
                    {{ isScanningApps ? "扫描中" : "扫描应用" }}
                  </button>
                  <button class="settings-primary-button" type="button" @click="openAddManagedAppPage">新增应用</button>
                  <button class="settings-danger-button" type="button" :disabled="selectedManagedAppCount === 0" @click="deleteSelectedManagedApps">批量删除</button>
                </div>
              </div>

              <input v-model="appManagerSearchQuery" class="app-manager-search" type="search" placeholder="搜索应用" aria-label="搜索应用" />

              <div class="settings-list-actions">
                <button class="settings-link-button" type="button" @click="selectAllManagedApps">全选</button>
                <button class="settings-link-button" type="button" @click="clearManagedAppSelection">清空选择</button>
              </div>

              <div class="app-manager-list" role="list" aria-label="所有应用">
                <div v-for="app in filteredManagedApps" :key="app.id" class="app-manager-item" role="listitem">
                  <input
                    type="checkbox"
                    :aria-label="`选择 ${app.name}`"
                    :checked="appManagerSelectedIds.includes(app.id)"
                    @change="toggleManagedAppSelection(app.id, $event.target.checked)"
                  />
                  <span class="app-manager-icon">
                    <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
                    <span v-else>{{ app.emoji }}</span>
                  </span>
                  <span class="app-manager-details">
                    <span class="app-manager-name">{{ app.name }}</span>
                    <span class="app-manager-target">{{ getLaunchTargetPath(app) || "未设置启动路径" }}</span>
                  </span>
                  <span class="app-manager-actions">
                    <button class="settings-secondary-button" type="button" @click="openEditManagedApp(app)">编辑</button>
                    <button class="settings-danger-button" type="button" @click="deleteManagedApp(app.id)">删除</button>
                  </span>
                </div>
              </div>
            </section>
          </div>

          <div v-else class="settings-tab-panel" role="tabpanel" aria-label="关于">
            <section class="settings-section" aria-label="关于">
              <div class="settings-section-header">
                <h3>关于</h3>
              </div>
              <div class="settings-about-card">
                <span class="settings-about-name">LaunchPad</span>
                <span class="settings-about-version">版本 {{ appVersion }}</span>
              </div>
            </section>
          </div>
        </div>

        <footer v-if="activeSettingsTab === 'interface'" class="settings-actions">
          <button class="settings-secondary-button" type="button" @click="closeSettingsPanel">取消</button>
          <button class="settings-primary-button" type="button" :disabled="!!dragMeta" @click="applySettingsConfig">应用</button>
        </footer>
      </Motion>
    </Motion>

    <div v-if="isScanResultDialogOpen" class="scan-result-overlay" @wheel.stop @pointerdown.self="closeScanResultDialog">
      <section class="scan-result-dialog" role="dialog" aria-modal="true" aria-label="扫描结果">
        <header class="scan-result-header">
          <div>
            <h2>扫描结果</h2>
            <p>发现 {{ scanResultApps.length }} 个可添加应用 · 已选择 {{ scanResultSelectedCount }} 个</p>
          </div>
          <button class="settings-close-button" type="button" aria-label="关闭扫描结果" @click="closeScanResultDialog">×</button>
        </header>

        <div class="scan-result-body">
          <div v-if="scanResultApps.length" class="settings-list-actions">
            <button class="settings-link-button" type="button" @click="selectAllScanResultApps">全选</button>
            <button class="settings-link-button" type="button" @click="clearScanResultSelection">清空选择</button>
          </div>

          <div v-if="scanResultApps.length" class="app-manager-list scan-result-list" role="list" aria-label="可添加应用">
            <label v-for="app in scanResultApps" :key="app.id" class="app-manager-item scan-result-item" role="listitem">
              <input
                type="checkbox"
                :aria-label="`选择 ${app.name}`"
                :checked="scanResultSelectedIds.includes(app.id)"
                @change="toggleScanResultSelection(app.id, $event.target.checked)"
              />
              <span class="app-manager-icon">
                <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
                <span v-else>{{ app.emoji }}</span>
              </span>
              <span class="app-manager-details">
                <span class="app-manager-name">{{ app.name }}</span>
                <span class="app-manager-target">{{ getLaunchTargetPath(app) || "未设置启动路径" }}</span>
                <span v-if="app.launchArgs" class="app-manager-target">参数：{{ app.launchArgs }}</span>
              </span>
            </label>
          </div>

          <div v-else class="scan-result-empty">没有发现可添加的应用</div>
        </div>

        <footer class="scan-result-actions">
          <button class="settings-secondary-button" type="button" @click="closeScanResultDialog">取消</button>
          <button class="settings-primary-button" type="button" :disabled="!canAddScannedApps" @click="addSelectedScannedApps">添加所选</button>
        </footer>
      </section>
    </div>

    <div v-if="isAddingManagedApp" class="app-edit-overlay" @wheel.stop @pointerdown.self="closeAddManagedAppPage">
      <section class="app-edit-dialog" role="dialog" aria-modal="true" aria-label="新增应用">
        <header class="app-edit-header">
          <div>
            <h2>新增应用</h2>
            <p>添加自定义应用到启动台</p>
          </div>
          <button class="settings-close-button" type="button" aria-label="关闭新增窗口" @click="closeAddManagedAppPage">×</button>
        </header>

        <div class="app-edit-body">
          <div class="app-edit-icon-row">
            <span class="app-edit-icon">
              <img v-if="newAppIconDataUrl" :src="newAppIconDataUrl" alt="" draggable="false" />
              <span v-else>{{ newManagedAppGlyph }}</span>
            </span>
            <div class="app-edit-icon-actions">
              <button class="settings-secondary-button" type="button" @click="openNewAppIconChooser">更换图标</button>
              <button class="settings-secondary-button" type="button" @click="resetNewAppIcon">恢复默认</button>
            </div>
          </div>

          <label class="app-edit-field">
            <span>应用名称</span>
            <input v-model="newAppName" type="text" maxlength="64" aria-label="应用名称" />
          </label>
          <label class="app-edit-field">
            <span>启动路径或 URL</span>
            <span class="app-edit-target-row">
              <input v-model="newAppTarget" type="text" aria-label="启动路径或 URL" />
              <button class="settings-secondary-button" type="button" :disabled="!canScanManagedApps || isBrowsingNewAppTarget" @click="browseNewAppLaunchFile">
                {{ isBrowsingNewAppTarget ? "选择中" : "浏览" }}
              </button>
            </span>
          </label>
          <label class="app-edit-field">
            <span>启动参数</span>
            <input v-model="newAppArgs" type="text" aria-label="启动参数" />
          </label>
        </div>

        <footer class="app-edit-actions">
          <button class="settings-secondary-button" type="button" @click="closeAddManagedAppPage">取消</button>
          <button class="settings-primary-button" type="button" :disabled="!canAddManagedApp" @click="addManagedApp">保存</button>
        </footer>
      </section>
    </div>

    <div v-if="editingManagedApp" class="app-edit-overlay" @wheel.stop @pointerdown.self="closeEditManagedApp">
      <section class="app-edit-dialog" role="dialog" aria-modal="true" aria-label="编辑应用">
        <header class="app-edit-header">
          <div>
            <h2>编辑应用</h2>
            <p>{{ editingManagedApp.name }}</p>
          </div>
          <button class="settings-close-button" type="button" aria-label="关闭编辑窗口" @click="closeEditManagedApp">×</button>
        </header>

        <div class="app-edit-body">
          <div class="app-edit-icon-row">
            <span class="app-edit-icon">
              <img v-if="editingAppIconSource" :src="editingAppIconSource" alt="" draggable="false" />
              <span v-else>{{ editingManagedApp.emoji }}</span>
            </span>
            <div class="app-edit-icon-actions">
              <button class="settings-secondary-button" type="button" @click="openEditAppIconChooser">更换图标</button>
              <button class="settings-secondary-button" type="button" @click="resetEditAppIcon">恢复默认</button>
            </div>
          </div>

          <label class="app-edit-field">
            <span>应用名称</span>
            <input v-model="editAppName" type="text" maxlength="64" aria-label="应用名称" />
          </label>
          <label class="app-edit-field">
            <span>启动路径或 URL</span>
            <span class="app-edit-target-row">
              <input v-model="editAppTarget" type="text" aria-label="启动路径或 URL" />
              <button class="settings-secondary-button" type="button" :disabled="!canScanManagedApps || isBrowsingEditAppTarget" @click="browseEditAppLaunchFile">
                {{ isBrowsingEditAppTarget ? "选择中" : "浏览" }}
              </button>
            </span>
          </label>
          <label class="app-edit-field">
            <span>启动参数</span>
            <input v-model="editAppArgs" type="text" aria-label="启动参数" />
          </label>
        </div>

        <footer class="app-edit-actions">
          <button class="settings-secondary-button" type="button" @click="closeEditManagedApp">取消</button>
          <button class="settings-primary-button" type="button" :disabled="!canSaveEditingManagedApp" @click="saveEditingManagedApp">保存</button>
        </footer>
      </section>
    </div>

    <div v-if="iconChooser" class="icon-chooser-overlay" @wheel.stop @pointerdown.self="closeIconChooser">
      <section class="icon-chooser-dialog" role="dialog" aria-modal="true" :aria-label="iconChooser.title">
        <header class="icon-chooser-header">
          <div>
            <h2>{{ iconChooser.title }}</h2>
            <p>{{ iconChooser.subtitle }}</p>
          </div>
          <button class="settings-close-button" type="button" aria-label="关闭图标选择" @click="closeIconChooser">×</button>
        </header>

        <div class="icon-chooser-body">
          <section class="icon-chooser-section" aria-label="应用内图标">
            <div class="icon-chooser-section-header">
              <h3>应用内图标</h3>
              <span v-if="iconChoices.length">{{ iconChoices.length }} 个</span>
            </div>
            <div v-if="isLoadingIconChoices" class="icon-chooser-empty">正在读取</div>
            <div v-else-if="iconChoices.length" class="icon-chooser-grid">
              <button
                v-for="choice in iconChoices"
                :key="choice.id"
                class="icon-chooser-option"
                type="button"
                aria-label="选择应用内图标"
                @click="chooseIconCandidate(choice)"
              >
                <img :src="choice.iconDataUrl" alt="" draggable="false" />
              </button>
            </div>
            <div v-else class="icon-chooser-empty">没有可用图标</div>
          </section>

          <section class="icon-chooser-section" aria-label="本地图片">
            <div class="icon-chooser-section-header">
              <h3>本地图片</h3>
            </div>
            <label class="settings-secondary-button icon-chooser-upload-button">
              选择图片
              <input type="file" accept="image/*" aria-label="从硬盘选择图片" @change="handleIconChooserUpload" />
            </label>
          </section>
        </div>
      </section>
    </div>

    <div v-if="layoutRecoveryNotice" class="layout-recovery-notice" role="status" aria-live="polite">
      <div class="layout-recovery-copy">
        <strong>{{ layoutRecoveryNotice.title }}</strong>
        <span>{{ layoutRecoveryNotice.message }}</span>
        <small v-if="layoutRecoveryNotice.backupPath">{{ layoutRecoveryNotice.backupPath }}</small>
      </div>
      <button class="layout-recovery-close" type="button" aria-label="关闭布局恢复提示" @click="closeLayoutRecoveryNotice">×</button>
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
        :transition="folderPanelTransition"
        :style="folderPanelStyle"
      >
        <Motion
          class="folder-panel-content"
          :initial="folderContentInitial"
          :animate="folderContentAnimate"
          :transition="folderContentTransition"
        >
        <div class="folder-header">
          <input
            class="folder-name-input"
            :value="renderedFolder.name"
            :disabled="isFolderClosing"
            maxlength="32"
            aria-label="文件夹名称"
            @input="renameFolder(renderedFolder.id, $event.target.value)"
            @pointerdown.stop
          />
        </div>

        <div class="folder-pages-shell">
          <div ref="folderViewportRef" class="folder-viewport">
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
                  <template v-if="shouldRenderFolderPage(pageNumber)">
                    <DesktopIcon
                      v-for="(child, index) in getVisibleFolderPage(page)"
                      :key="child.id"
                      :item="child"
                      :source="{ type: 'folder', folderId: renderedFolder.id, index, pageIndex: pageNumber, slotIndex: index }"
                      :dragging="dragMeta && dragMeta.item.id === child.id"
                      :editing="isEditMode"
                      :textless="isTextlessMode"
                      :removable="child.type === 'app'"
                      :selected="isIconSelected('folder', child.id, pageNumber, renderedFolder.id)"
                      :opening="isIconOpening('folder', child.id, pageNumber, renderedFolder.id)"
                      @pointerdown-icon="beginDrag"
                      @open-app="openApp"
                      @context-menu-icon="openIconContextMenu"
                      @remove-app="removeAppById"
                      @choose-app-icon="openExistingAppIconChooser"
                      @reset-app-icon="resetAppCustomIcon"
                    />
                  </template>
                  <StaticPagePreview
                    v-else-if="shouldRenderStaticFolderPage(pageNumber)"
                    :items="getVisibleFolderPage(page)"
                    :folder-preview-page-size="folderPageSize"
                    :textless="isTextlessMode"
                  />
                </Motion>
              </section>
            </Motion>
          </div>

          <footer v-if="folderPages.length > 1" class="folder-page-dots">
            <button
              v-for="index in folderPages.length"
              :key="index"
              type="button"
              :class="cx('page-dot', index - 1 === folderPageIndex && 'page-dot-active')"
              :aria-label="`切换到文件夹第 ${index} 页`"
              @pointerdown.stop
              @click="commitFolderPageIndex(index - 1)"
            />
          </footer>
        </div>
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

    <div v-if="iconContextMenu" class="icon-context-menu-layer" @contextmenu.prevent>
      <div class="icon-context-menu" :style="iconContextMenuStyle" role="menu" :aria-label="`${iconContextMenu.app.name} 菜单`" @pointerdown.stop>
        <button type="button" role="menuitem" @click="openContextMenuApp">打开</button>
        <button type="button" role="menuitem" @click="editContextMenuApp">编辑</button>
      </div>
    </div>

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
import StaticPagePreview from "./components/StaticPagePreview.js";
import { AlertTriangleIcon, ChevronDownIcon, ChevronUpIcon, SearchIcon, SettingsIcon } from "./components/Icons.js";
import { ICON_SIZE_MAX, ICON_SIZE_MIN, ICON_SIZE_STEP } from "./composables/launchpadConstants.js";
import { useLaunchpadController } from "./composables/useLaunchpadController.js";
import appPackage from "../package.json";
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
  shouldRenderSettingsPanel,
  settingsOverlayAnimate,
  settingsPanelInitial,
  settingsPanelAnimate,
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
  draftFolderIconSizeMode,
  draftFolderIconSize,
  changeDraftRows,
  changeDraftCols,
  changeDraftFolderRows,
  changeDraftFolderCols,
  changeDraftIconSize,
  changeDraftFolderIconSize,
  setDraftFolderIconSizeMode,
  managedApps,
  filteredManagedApps,
  appManagerSelectedIds,
  appManagerSearchQuery,
  isScanResultDialogOpen,
  scanResultApps,
  scanResultSelectedIds,
  scanResultSelectedCount,
  canAddScannedApps,
  isAddingManagedApp,
  selectedManagedAppCount,
  newAppName,
  newAppTarget,
  newAppArgs,
  newAppIconDataUrl,
  isBrowsingNewAppTarget,
  newManagedAppGlyph,
  editingManagedApp,
  editAppName,
  editAppTarget,
  editAppArgs,
  editAppIconDataUrl,
  isEditAppIconReset,
  isBrowsingEditAppTarget,
  isScanningApps,
  canAddManagedApp,
  canSaveEditingManagedApp,
  canScanManagedApps,
  getLaunchTargetPath,
  toggleManagedAppSelection,
  selectAllManagedApps,
  clearManagedAppSelection,
  toggleScanResultSelection,
  selectAllScanResultApps,
  clearScanResultSelection,
  closeScanResultDialog,
  addSelectedScannedApps,
  openAddManagedAppPage,
  closeAddManagedAppPage,
  openNewAppIconChooser,
  resetNewAppIcon,
  browseNewAppLaunchFile,
  openEditManagedApp,
  closeEditManagedApp,
  openEditAppIconChooser,
  resetEditAppIcon,
  browseEditAppLaunchFile,
  iconChooser,
  iconChoices,
  isLoadingIconChoices,
  closeIconChooser,
  chooseIconCandidate,
  handleIconChooserUpload,
  openExistingAppIconChooser,
  saveEditingManagedApp,
  deleteManagedApp,
  confirmForceFillAllPages,
  warningDialog,
  closeWarningDialog,
  confirmWarningDialog,
  layoutRecoveryNotice,
  closeLayoutRecoveryNotice,
  rescanManagedApps,
  addManagedApp,
  deleteSelectedManagedApps,
  dragFolderTargetId,
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
  shouldRenderStaticActivePage,
  shouldRenderFolderPage,
  shouldRenderStaticFolderPage,
  commitActivePageIndex,
  desktopTrackMotionKey,
  activeDesktopTrackAnimate,
  activeDesktopTrackTransition,
  getDesktopGridProjectionKey,
  setPageRef,
  desktopLayoutEnabled,
  getActivePageGridStyle,
  pageGridMeasureStyle,
  getVisibleDesktopPage,
  folderPageSize,
  isIconSelected,
  isIconOpening,
  beginDrag,
  openApp,
  removeAppById,
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
  folderPanelTransition,
  panelSpring,
  folderPanelStyle,
  folderContentInitial,
  folderContentAnimate,
  folderContentTransition,
  renameFolder,
  folderPageIndex,
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
const iconContextMenu = ref(null);
const activeSettingsTab = ref("general");
const appVersion = appPackage.version;
const settingsTabs = [
  { id: "general", label: "通用" },
  { id: "interface", label: "界面" },
  { id: "apps", label: "Apps" },
  { id: "about", label: "关于" },
];
const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0);
const iconContextMenuStyle = computed(() => {
  if (!iconContextMenu.value) return {};
  return {
    left: `${iconContextMenu.value.x}px`,
    top: `${iconContextMenu.value.y}px`,
  };
});
const editingAppIconSource = computed(() => {
  if (editAppIconDataUrl.value) return editAppIconDataUrl.value;
  if (isEditAppIconReset.value) return getDefaultIconSource(editingManagedApp.value);
  return getIconSource(editingManagedApp.value);
});

function handleSearchFocus() {
  keyboardFocusArea.value = "search";
  isSearchInputFocused.value = true;
}

function handleSearchBlur() {
  isSearchInputFocused.value = false;
}

function openIconContextMenu(event, app, source) {
  if (!app || app.type !== "app") return;
  const menuWidth = 172;
  const menuHeight = 116;
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - menuWidth - margin);
  const maxY = Math.max(margin, window.innerHeight - menuHeight - margin);
  iconContextMenu.value = {
    app,
    source,
    x: Math.min(Math.max(event.clientX, margin), maxX),
    y: Math.min(Math.max(event.clientY, margin), maxY),
  };
}

function closeIconContextMenu() {
  iconContextMenu.value = null;
}

function handleLaunchpadSurfacePointerDown(event) {
  if (iconContextMenu.value) {
    closeIconContextMenu();
    return;
  }
  handleDesktopSurfacePointerDown(event);
}

function openContextMenuApp() {
  const menu = iconContextMenu.value;
  if (!menu) return;
  closeIconContextMenu();
  openApp(menu.app, menu.source);
}

function editContextMenuApp() {
  const menu = iconContextMenu.value;
  if (!menu) return;
  closeIconContextMenu();
  openEditManagedApp(menu.app);
}

function getIconSource(item) {
  return item?.customIconDataUrl || item?.iconDataUrl || item?.iconUrl || null;
}

function getDefaultIconSource(item) {
  return item?.iconDataUrl || item?.iconUrl || null;
}
</script>
