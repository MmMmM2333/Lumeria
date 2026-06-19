<template>
  <div
    v-if="state.shouldRenderSettingsPanel.value"
    key="settings-overlay"
    ref="settingsOverlayRef"
    :class="cx('settings-overlay', !state.isSettingsPanelOpen.value && 'settings-overlay-closing')"
    @wheel.stop
    @pointerdown.self="state.closeSettingsPanel"
  >
    <section
      ref="settingsPanelRef"
      class="settings-panel"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      tabindex="-1"
      @keydown="handleSettingsPanelKeydown"
    >
      <header class="settings-panel-header">
        <div>
          <h2>设置</h2>
        </div>
        <button class="settings-close-button" type="button" aria-label="关闭设置" @click="state.closeSettingsPanel">×</button>
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
                <input name="autoStart" type="checkbox" aria-label="开机自启" disabled />
              </label>
              <div class="settings-option">
                <span class="settings-option-copy">
                  <span>快捷键</span>
                  <span class="settings-field-hint">{{ mainWindowShortcutHint }}</span>
                </span>
                <div class="settings-hotkey-control">
                  <div :class="cx('settings-hotkey-input', state.draftMainWindowShortcut.value === null && 'settings-hotkey-input-empty')">
                    <kbd>{{ mainWindowShortcutLabel }}</kbd>
                    <button
                      v-if="state.draftMainWindowShortcut.value !== null"
                      class="settings-hotkey-clear-button"
                      type="button"
                      aria-label="关闭快捷键"
                      :disabled="state.isApplyingSettingsConfig.value"
                      @click="clearMainWindowShortcut"
                    >
                      <DismissIcon class="settings-hotkey-clear-icon" />
                    </button>
                  </div>
                  <button class="settings-secondary-button" type="button" :disabled="state.isApplyingSettingsConfig.value" @click="startMainWindowShortcutRecording">
                    {{ isRecordingMainWindowShortcut ? "录制中" : "录制" }}
                  </button>
                  <button class="settings-secondary-button" type="button" :disabled="state.isApplyingSettingsConfig.value" @click="resetMainWindowShortcut">重置</button>
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
              <div class="settings-field settings-field-wide">
                <span class="settings-field-copy">
                  <span>窗口模式</span>
                  <span class="settings-field-hint">选择打开 LaunchPad 时的窗口形态</span>
                </span>
                <div class="settings-segmented-control" aria-label="窗口模式">
                  <button
                    type="button"
                    :class="cx('settings-segmented-button', state.draftWindowMode.value === WINDOW_MODE_FULLSCREEN && 'settings-segmented-button-active')"
                    @click="state.setDraftWindowMode(WINDOW_MODE_FULLSCREEN)"
                  >
                    全屏
                  </button>
                  <button
                    type="button"
                    :class="cx('settings-segmented-button', state.draftWindowMode.value === WINDOW_MODE_WINDOWED && 'settings-segmented-button-active')"
                    @click="state.setDraftWindowMode(WINDOW_MODE_WINDOWED)"
                  >
                    窗口化
                  </button>
                </div>
              </div>
              <div class="settings-field settings-field-wide settings-window-effect-field">
                <span class="settings-field-copy">
                  <span>窗口底材</span>
                  <span class="settings-field-hint">{{ windowEffectsSupportHint }}</span>
                </span>
                <div class="settings-window-effect-controls">
                  <div class="settings-segmented-control" aria-label="窗口底材">
                    <button
                      type="button"
                      :class="cx('settings-segmented-button', state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_NONE && 'settings-segmented-button-active')"
                      @click="state.setDraftWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_NONE)"
                    >
                      无材质
                    </button>
                    <button
                      type="button"
                      :class="cx('settings-segmented-button', state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_ACRYLIC && 'settings-segmented-button-active')"
                      :disabled="!state.canUseWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_ACRYLIC)"
                      @click="state.setDraftWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_ACRYLIC)"
                    >
                      透明磨砂
                    </button>
                    <button
                      type="button"
                      :class="cx('settings-segmented-button', state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA && 'settings-segmented-button-active')"
                      :disabled="!state.canUseWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_MICA)"
                      @click="state.setDraftWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_MICA)"
                    >
                      Mica
                    </button>
                    <button
                      type="button"
                      :class="cx('settings-segmented-button', state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA_ALT && 'settings-segmented-button-active')"
                      :disabled="!state.canUseWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_MICA_ALT)"
                      @click="state.setDraftWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_MICA_ALT)"
                    >
                      Mica Alt
                    </button>
                  </div>
                  <div class="settings-segmented-control" aria-label="窗口底材明暗">
                    <button
                      type="button"
                      :class="cx('settings-segmented-button', state.draftWindowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT && 'settings-segmented-button-active')"
                      :disabled="!canEditWindowEffectAppearance"
                      @click="state.setDraftWindowEffectAppearance(WINDOW_EFFECT_APPEARANCE_LIGHT)"
                    >
                      浅色
                    </button>
                    <button
                      type="button"
                      :class="cx('settings-segmented-button', state.draftWindowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_DARK && 'settings-segmented-button-active')"
                      :disabled="!canEditWindowEffectAppearance"
                      @click="state.setDraftWindowEffectAppearance(WINDOW_EFFECT_APPEARANCE_DARK)"
                    >
                      深色
                    </button>
                  </div>
                </div>
                <div class="settings-window-effect-previews" aria-label="窗口底材示意">
                  <button
                    v-for="item in windowEffectPreviewItems"
                    :key="`${item.material}-${item.appearance}`"
                    type="button"
                    :class="cx(
                      'settings-window-effect-preview',
                      `settings-window-effect-preview-${item.materialClass}`,
                      `settings-window-effect-preview-${item.appearance}`,
                      item.active && 'settings-window-effect-preview-active',
                      !item.available && 'settings-window-effect-preview-disabled'
                    )"
                    :disabled="!item.available"
                    @click="selectWindowEffectPreview(item.material, item.appearance)"
                  >
                    <span class="settings-window-effect-preview-scene" aria-hidden="true">
                      <span class="settings-window-effect-preview-icons" />
                      <span class="settings-window-effect-preview-pane">
                        <span class="settings-window-effect-preview-titlebar" />
                        <span class="settings-window-effect-preview-line settings-window-effect-preview-line-wide" />
                        <span class="settings-window-effect-preview-line" />
                      </span>
                    </span>
                    <span class="settings-window-effect-preview-copy">
                      <span class="settings-window-effect-preview-title">
                        <span>{{ item.label }}</span>
                        <span>{{ item.appearanceLabel }}</span>
                      </span>
                      <span>{{ item.description }}</span>
                    </span>
                  </button>
                </div>
              </div>
              <div class="settings-field settings-field-wide settings-background-field">
                <span class="settings-field-copy">
                  <span>背景底色</span>
                  <span class="settings-field-hint">位于图片层下方</span>
                </span>
                <div class="settings-background-controls">
                  <div class="settings-background-mode-row">
                    <label class="settings-color-control">
                      <span>颜色</span>
                      <span class="settings-color-swatch">
                        <input
                          :value="state.draftBackgroundBaseColor.value"
                          type="color"
                          aria-label="背景底色"
                          @input="state.setDraftBackgroundBaseColor($event.target.value)"
                        />
                      </span>
                      <span class="settings-color-value">{{ state.draftBackgroundBaseColor.value }}</span>
                    </label>
                    <label class="settings-opacity-control">
                      <span>不透明度</span>
                      <input
                        :value="state.draftBackgroundBaseOpacity.value"
                        :min="BACKGROUND_BASE_OPACITY_MIN"
                        :max="BACKGROUND_BASE_OPACITY_MAX"
                        :step="BACKGROUND_BASE_OPACITY_STEP"
                        type="range"
                        aria-label="背景底色不透明度"
                        @input="state.setDraftBackgroundBaseOpacity($event.target.value)"
                      />
                      <span class="settings-opacity-value">{{ state.draftBackgroundBaseOpacity.value }}%</span>
                    </label>
                  </div>
                </div>
              </div>
              <div class="settings-field settings-field-wide settings-background-field">
                <span class="settings-field-copy">
                  <span>背景层</span>
                  <span class="settings-field-hint">{{ backgroundSourceHint }}</span>
                </span>
                <div class="settings-background-controls">
                  <div class="settings-background-mode-row">
                    <div class="settings-segmented-control" aria-label="图片来源">
                      <button
                        type="button"
                        :class="cx('settings-segmented-button', state.draftBackgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL && 'settings-segmented-button-active')"
                        @click="state.setDraftBackgroundSource(BACKGROUND_SOURCE_SYSTEM_MATERIAL)"
                      >
                        无图片
                      </button>
                      <button
                        type="button"
                        :class="cx('settings-segmented-button', state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE && 'settings-segmented-button-active')"
                        :disabled="state.isChoosingBackgroundImage.value"
                        @click="state.draftBackgroundImagePath.value ? state.setDraftBackgroundSource(BACKGROUND_SOURCE_CUSTOM_IMAGE) : state.chooseDraftBackgroundImage()"
                      >
                        自定义图片
                      </button>
                      <button
                        type="button"
                        :class="cx('settings-segmented-button', state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER && 'settings-segmented-button-active')"
                        :disabled="state.isChoosingBackgroundImage.value"
                        @click="state.useDraftDesktopWallpaper"
                      >
                        桌面壁纸
                      </button>
                      <button
                        v-if="canShowLiveDesktopControls"
                        type="button"
                        :class="cx('settings-segmented-button', state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && 'settings-segmented-button-active')"
                        :disabled="!state.canUseLiveDesktopBackground()"
                        @click="state.setDraftBackgroundSource(BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP)"
                      >
                        动态桌面
                      </button>
                    </div>
                    <label v-if="doesDraftBackgroundUseImage" class="settings-opacity-control">
                      <span>背景透明度</span>
                      <input
                        :value="state.draftBackgroundImageOpacity.value"
                        :min="BACKGROUND_IMAGE_OPACITY_MIN"
                        :max="BACKGROUND_IMAGE_OPACITY_MAX"
                        :step="BACKGROUND_IMAGE_OPACITY_STEP"
                        type="range"
                        aria-label="背景层透明度"
                        @input="state.setDraftBackgroundImageOpacity($event.target.value)"
                      />
                      <span class="settings-opacity-value">{{ state.draftBackgroundImageOpacity.value }}%</span>
                    </label>
                    <label v-if="doesDraftBackgroundUseLiveDesktop" class="settings-opacity-control">
                      <span>动态桌面不透明度</span>
                      <input
                        :value="state.draftBackgroundLiveDesktopOpacity.value"
                        :min="BACKGROUND_LIVE_DESKTOP_OPACITY_MIN"
                        :max="BACKGROUND_LIVE_DESKTOP_OPACITY_MAX"
                        :step="BACKGROUND_LIVE_DESKTOP_OPACITY_STEP"
                        type="range"
                        aria-label="动态桌面不透明度"
                        @input="state.setDraftBackgroundLiveDesktopOpacity($event.target.value)"
                      />
                      <span class="settings-opacity-value">{{ state.draftBackgroundLiveDesktopOpacity.value }}%</span>
                    </label>
                  </div>
                  <div v-if="doesDraftBackgroundUseImage" class="settings-background-image-controls">
                    <span class="settings-background-image-name">{{ draftBackgroundImageName }}</span>
                    <button
                      v-if="isDraftCustomImage"
                      class="settings-secondary-button settings-background-image-button"
                      type="button"
                      :disabled="state.isChoosingBackgroundImage.value"
                      @click="state.chooseDraftBackgroundImage"
                    >
                      {{ state.isChoosingBackgroundImage.value ? "选择中" : "选择图片" }}
                    </button>
                    <button
                      v-if="isDraftWindowsWallpaper"
                      class="settings-secondary-button settings-background-image-button"
                      type="button"
                      :disabled="state.isChoosingBackgroundImage.value"
                      @click="state.useDraftDesktopWallpaper"
                    >
                      {{ state.isChoosingBackgroundImage.value ? "同步中" : "刷新壁纸" }}
                    </button>
                    <button
                      class="settings-secondary-button settings-background-image-button"
                      type="button"
                      :disabled="!state.draftBackgroundImagePath.value"
                      @click="state.clearDraftBackgroundImage"
                    >
                      恢复默认
                    </button>
                  </div>
                  <div v-if="doesDraftBackgroundUseImage" class="settings-background-image-layout-controls">
                    <span class="settings-acrylic-row-label">显示方式</span>
                    <div class="settings-segmented-control" aria-label="背景图片显示方式">
                      <button
                        v-for="item in backgroundImageLayoutOptions"
                        :key="item.layout"
                        type="button"
                        :class="cx('settings-segmented-button', state.draftBackgroundImageLayout.value === item.layout && 'settings-segmented-button-active')"
                        @click="state.setDraftBackgroundImageLayout(item.layout)"
                      >
                        {{ item.label }}
                      </button>
                    </div>
                  </div>
                  <BackgroundImagePreviewCanvas
                    aria-label="图片层预览"
                    :background-base-color="state.draftBackgroundBaseColor.value"
                    :background-base-opacity="state.draftBackgroundBaseOpacity.value"
                    :background-image-layout="state.draftBackgroundImageLayout.value"
                    :background-image-opacity="state.draftBackgroundImageOpacity.value"
                    :background-image-pixel-size="draftBackgroundImagePixelSize"
                    :background-image-url="hasDraftBackgroundImagePreview ? state.draftBackgroundImageUrl.value : null"
                    :background-layout-context="backgroundLayoutContext"
                    :empty-label="backgroundLayerPreviewLabel"
                  />
                </div>
              </div>
              <div class="settings-field settings-field-wide settings-background-field">
                <span class="settings-field-copy">
                  <span>背景效果</span>
                  <span class="settings-field-hint">{{ backgroundEffectHint }}</span>
                </span>
                <div class="settings-background-controls">
                  <div class="settings-background-mode-row">
                    <div class="settings-segmented-control" aria-label="图片效果">
                      <button
                        type="button"
                        :class="cx('settings-segmented-button', state.draftBackgroundEffect.value === BACKGROUND_EFFECT_NONE && 'settings-segmented-button-active')"
                        :disabled="!canUseDraftBackgroundEffect(BACKGROUND_EFFECT_NONE)"
                        @click="state.setDraftBackgroundEffect(BACKGROUND_EFFECT_NONE)"
                      >
                        原图
                      </button>
                      <button
                        type="button"
                        :class="cx('settings-segmented-button', state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED && 'settings-segmented-button-active')"
                        :disabled="!canUseDraftBackgroundEffect(BACKGROUND_EFFECT_DIMMED)"
                        @click="state.setDraftBackgroundEffect(BACKGROUND_EFFECT_DIMMED)"
                      >
                        暗化
                      </button>
                      <button
                        type="button"
                        :class="cx('settings-segmented-button', state.draftBackgroundEffect.value === BACKGROUND_EFFECT_BLUR && 'settings-segmented-button-active')"
                        :disabled="!canUseDraftBackgroundEffect(BACKGROUND_EFFECT_BLUR)"
                        @click="state.setDraftBackgroundEffect(BACKGROUND_EFFECT_BLUR)"
                      >
                        模糊
                      </button>
                      <button
                        type="button"
                        :class="cx('settings-segmented-button', state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL && 'settings-segmented-button-active')"
                        :disabled="!canUseDraftBackgroundEffect(BACKGROUND_EFFECT_ACRYLIC_WEBGL)"
                        @click="state.setDraftBackgroundEffect(BACKGROUND_EFFECT_ACRYLIC_WEBGL)"
                      >
                        Acrylic
                      </button>
                    </div>
                  </div>
                  <label v-if="doesDraftBackgroundUseLayer && state.draftBackgroundEffect.value === BACKGROUND_EFFECT_BLUR" class="settings-opacity-control">
                    <span>模糊强度</span>
                    <input
                      :value="state.draftBackgroundBlurStrength.value"
                      :min="BACKGROUND_BLUR_STRENGTH_MIN"
                      :max="BACKGROUND_BLUR_STRENGTH_MAX"
                      :step="BACKGROUND_BLUR_STRENGTH_STEP"
                      type="range"
                      aria-label="背景模糊强度"
                      @input="state.setDraftBackgroundBlurStrength($event.target.value)"
                    />
                    <span class="settings-opacity-value">{{ state.draftBackgroundBlurStrength.value }}%</span>
                  </label>
                  <label v-if="doesDraftBackgroundUseLayer && state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED" class="settings-color-control">
                    <span>暗化颜色</span>
                    <span class="settings-color-swatch">
                      <input
                        :value="state.draftBackgroundDarkenColor.value"
                        type="color"
                        aria-label="背景暗化颜色"
                        @input="state.setDraftBackgroundDarkenColor($event.target.value)"
                      />
                    </span>
                    <span class="settings-color-value">{{ state.draftBackgroundDarkenColor.value }}</span>
                  </label>
                  <label v-if="doesDraftBackgroundUseLayer && state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED" class="settings-opacity-control">
                    <span>暗化强度</span>
                    <input
                      :value="state.draftBackgroundDarkenStrength.value"
                      :min="BACKGROUND_DARKEN_STRENGTH_MIN"
                      :max="BACKGROUND_DARKEN_STRENGTH_MAX"
                      :step="BACKGROUND_DARKEN_STRENGTH_STEP"
                      type="range"
                      aria-label="背景暗化强度"
                      @input="state.setDraftBackgroundDarkenStrength($event.target.value)"
                    />
                    <span class="settings-opacity-value">{{ state.draftBackgroundDarkenStrength.value }}%</span>
                  </label>
                  <div v-if="doesDraftBackgroundUseLayer && state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL" class="settings-acrylic-controls">
                    <label class="settings-opacity-control">
                      <span>模糊强度</span>
                      <input
                        :value="state.draftBackgroundAcrylicBlurStrength.value"
                        :min="BACKGROUND_BLUR_STRENGTH_MIN"
                        :max="BACKGROUND_BLUR_STRENGTH_MAX"
                        :step="BACKGROUND_BLUR_STRENGTH_STEP"
                        type="range"
                        aria-label="Acrylic 模糊强度"
                        @input="state.setDraftBackgroundAcrylicBlurStrength($event.target.value)"
                      />
                      <span class="settings-opacity-value">{{ state.draftBackgroundAcrylicBlurStrength.value }}%</span>
                    </label>
                    <div class="settings-acrylic-row">
                      <span class="settings-acrylic-row-label">Acrylic 外观</span>
                      <div class="settings-segmented-control" aria-label="Acrylic 外观">
                        <button
                          type="button"
                          :class="cx('settings-segmented-button', state.draftBackgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM && 'settings-segmented-button-active')"
                          @click="setDraftBackgroundAcrylicAppearance(BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM)"
                        >
                          跟随系统
                        </button>
                        <button
                          type="button"
                          :class="cx('settings-segmented-button', state.draftBackgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_DARK && 'settings-segmented-button-active')"
                          @click="setDraftBackgroundAcrylicAppearance(BACKGROUND_ACRYLIC_APPEARANCE_DARK)"
                        >
                          深色
                        </button>
                        <button
                          type="button"
                          :class="cx('settings-segmented-button', state.draftBackgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT && 'settings-segmented-button-active')"
                          @click="setDraftBackgroundAcrylicAppearance(BACKGROUND_ACRYLIC_APPEARANCE_LIGHT)"
                        >
                          浅色
                        </button>
                      </div>
                    </div>
                    <div class="settings-acrylic-row">
                      <span class="settings-acrylic-row-label">参数</span>
                      <div class="settings-segmented-control" aria-label="Acrylic 参数">
                        <button
                          type="button"
                          :class="cx('settings-segmented-button', activeAcrylicParamsProfile === BACKGROUND_ACRYLIC_APPEARANCE_DARK && 'settings-segmented-button-active')"
                          @click="activeAcrylicParamsProfile = BACKGROUND_ACRYLIC_APPEARANCE_DARK"
                        >
                          深色参数
                        </button>
                        <button
                          type="button"
                          :class="cx('settings-segmented-button', activeAcrylicParamsProfile === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT && 'settings-segmented-button-active')"
                          @click="activeAcrylicParamsProfile = BACKGROUND_ACRYLIC_APPEARANCE_LIGHT"
                        >
                          浅色参数
                        </button>
                      </div>
                    </div>
                    <div class="settings-acrylic-params">
                      <label class="settings-color-control">
                        <span>染色</span>
                        <span class="settings-color-swatch">
                          <input
                            :value="activeAcrylicTintColorHex"
                            type="color"
                            aria-label="Acrylic 染色"
                            @input="setActiveDraftBackgroundAcrylicParam('tintColor', $event.target.value)"
                          />
                        </span>
                        <span class="settings-color-value">{{ activeAcrylicTintColorHex }}</span>
                      </label>
                      <label class="settings-opacity-control">
                        <span>染色强度</span>
                        <input
                          :value="activeAcrylicParams.tintStrength"
                          :min="ACRYLIC_TINT_STRENGTH_MIN"
                          :max="ACRYLIC_TINT_STRENGTH_MAX"
                          :step="ACRYLIC_PARAM_STEP"
                          type="range"
                          aria-label="Acrylic 染色强度"
                          @input="setActiveDraftBackgroundAcrylicParam('tintStrength', $event.target.value)"
                        />
                        <span class="settings-opacity-value">{{ formatAcrylicPercent(activeAcrylicParams.tintStrength) }}</span>
                      </label>
                      <label class="settings-opacity-control">
                        <span>亮度</span>
                        <input
                          :value="activeAcrylicParams.brightness"
                          :min="ACRYLIC_BRIGHTNESS_MIN"
                          :max="ACRYLIC_BRIGHTNESS_MAX"
                          :step="ACRYLIC_PARAM_STEP"
                          type="range"
                          aria-label="Acrylic 亮度"
                          @input="setActiveDraftBackgroundAcrylicParam('brightness', $event.target.value)"
                        />
                        <span class="settings-opacity-value">{{ formatAcrylicPercent(activeAcrylicParams.brightness) }}</span>
                      </label>
                      <label class="settings-opacity-control">
                        <span>对比度</span>
                        <input
                          :value="activeAcrylicParams.contrast"
                          :min="ACRYLIC_CONTRAST_MIN"
                          :max="ACRYLIC_CONTRAST_MAX"
                          :step="ACRYLIC_PARAM_STEP"
                          type="range"
                          aria-label="Acrylic 对比度"
                          @input="setActiveDraftBackgroundAcrylicParam('contrast', $event.target.value)"
                        />
                        <span class="settings-opacity-value">{{ formatAcrylicPercent(activeAcrylicParams.contrast) }}</span>
                      </label>
                      <label class="settings-opacity-control">
                        <span>饱和度</span>
                        <input
                          :value="activeAcrylicParams.saturation"
                          :min="ACRYLIC_SATURATION_MIN"
                          :max="ACRYLIC_SATURATION_MAX"
                          :step="ACRYLIC_PARAM_STEP"
                          type="range"
                          aria-label="Acrylic 饱和度"
                          @input="setActiveDraftBackgroundAcrylicParam('saturation', $event.target.value)"
                        />
                        <span class="settings-opacity-value">{{ formatAcrylicPercent(activeAcrylicParams.saturation) }}</span>
                      </label>
                      <button class="settings-secondary-button" type="button" @click="resetActiveDraftBackgroundAcrylicParams">
                        恢复默认
                      </button>
                    </div>
                  </div>
                  <BackgroundEffectPreview
                    :active="state.isSettingsPanelOpen.value && activeSettingsTab === 'interface'"
                    :background-acrylic-params="draftBackgroundAcrylicPreviewParams"
                    :background-base-color="state.draftBackgroundBaseColor.value"
                    :background-base-opacity="state.draftBackgroundBaseOpacity.value"
                    :background-blur-strength="draftBackgroundEffectBlurStrength"
                    :background-darken-color="state.draftBackgroundDarkenColor.value"
                    :background-darken-strength="state.draftBackgroundDarkenStrength.value"
                    :background-effect="state.draftBackgroundEffect.value"
                    :background-image-layout="state.draftBackgroundImageLayout.value"
                    :background-image-opacity="state.draftBackgroundImageOpacity.value"
                    :background-image-path="state.draftBackgroundImagePath.value"
                    :background-image-pixel-size="draftBackgroundImagePixelSize"
                    :background-image-url="hasDraftBackgroundImagePreview ? state.draftBackgroundImageUrl.value : null"
                    :background-layout-context="backgroundLayoutContext"
                    :empty-label="backgroundEffectPreviewLabel"
                  />
                </div>
              </div>
              <div class="settings-field settings-field-wide settings-grid-layout-field">
                <span>桌面布局</span>
                <div class="settings-grid-layout-control" aria-label="桌面布局">
                  <div class="settings-number-control">
                    <input v-model.number="state.draftRows.value" name="desktopRows" min="2" max="8" type="number" aria-label="桌面行数" />
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增加桌面行数" @click.prevent="state.changeDraftRows(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="减少桌面行数" @click.prevent="state.changeDraftRows(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                  <span class="settings-grid-layout-separator">×</span>
                  <div class="settings-number-control">
                    <input v-model.number="state.draftCols.value" name="desktopCols" min="3" max="10" type="number" aria-label="桌面列数" />
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增加桌面列数" @click.prevent="state.changeDraftCols(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="减少桌面列数" @click.prevent="state.changeDraftCols(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="settings-field settings-field-wide settings-grid-layout-field">
                <span>文件夹布局</span>
                <div class="settings-grid-layout-control" aria-label="文件夹布局">
                  <div class="settings-number-control">
                    <input v-model.number="state.draftFolderRows.value" name="folderRows" min="2" max="6" type="number" aria-label="文件夹行数" />
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增加文件夹行数" @click.prevent="state.changeDraftFolderRows(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="减少文件夹行数" @click.prevent="state.changeDraftFolderRows(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                  <span class="settings-grid-layout-separator">×</span>
                  <div class="settings-number-control">
                    <input v-model.number="state.draftFolderCols.value" name="folderCols" min="2" max="8" type="number" aria-label="文件夹列数" />
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增加文件夹列数" @click.prevent="state.changeDraftFolderCols(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="减少文件夹列数" @click.prevent="state.changeDraftFolderCols(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
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
                  <input v-model.number="state.draftIconSize.value" name="iconSize" :min="ICON_SIZE_MIN" :max="ICON_SIZE_MAX" :step="ICON_SIZE_STEP" type="number" aria-label="图标大小" />
                  <span class="settings-number-unit">px</span>
                  <div class="settings-number-buttons">
                    <button type="button" aria-label="增大图标" @click.prevent="state.changeDraftIconSize(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                    <button type="button" aria-label="缩小图标" @click.prevent="state.changeDraftIconSize(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
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
                      :class="cx('settings-segmented-button', state.draftFolderIconSizeMode.value === 'global' && 'settings-segmented-button-active')"
                      @click="state.setDraftFolderIconSizeMode('global')"
                    >
                      跟随全局
                    </button>
                    <button
                      type="button"
                      :class="cx('settings-segmented-button', state.draftFolderIconSizeMode.value === 'custom' && 'settings-segmented-button-active')"
                      @click="state.setDraftFolderIconSizeMode('custom')"
                    >
                      自定义
                    </button>
                  </div>
                  <div v-if="state.draftFolderIconSizeMode.value === 'custom'" class="settings-number-control settings-number-control-wide">
                    <input v-model.number="state.draftFolderIconSize.value" name="folderIconSize" :min="ICON_SIZE_MIN" :max="ICON_SIZE_MAX" :step="ICON_SIZE_STEP" type="number" aria-label="文件夹图标大小" />
                    <span class="settings-number-unit">px</span>
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增大文件夹图标" @click.prevent="state.changeDraftFolderIconSize(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="缩小文件夹图标" @click.prevent="state.changeDraftFolderIconSize(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                </div>
              </div>
              <label class="settings-toggle">
                <span>无字模式</span>
                <input v-model="state.draftIsTextlessMode.value" name="textlessMode" type="checkbox" />
              </label>
            </div>
          </section>

          <section class="settings-section" aria-label="整理空位">
            <div class="settings-section-header">
              <div>
                <h3>整理空位</h3>
                <p>根据当前行列布局，将App向前整理以填补空位</p>
              </div>
              <button class="settings-warning-button" type="button" :disabled="!!state.dragMeta.value" @click="state.confirmForceFillAllPages">重新整理</button>
            </div>
          </section>
        </div>

        <div v-else-if="activeSettingsTab === 'apps'" class="settings-tab-panel" role="tabpanel" aria-label="Apps">
          <section class="settings-section" aria-label="扫描来源">
            <div class="settings-section-header">
              <div>
                <h3>扫描来源</h3>
                <p>{{ state.scanRoots.value.filter((root) => root.enabled).length }} / {{ state.scanRoots.value.length }} 个来源已启用</p>
              </div>
              <div class="settings-inline-actions">
                <button class="settings-secondary-button" type="button" @click="state.confirmResetScanRoots">还原默认来源</button>
                <button class="settings-secondary-button" type="button" @click="state.addScanRoot">新增来源</button>
              </div>
            </div>
            <label class="settings-toggle">
              <span>显示失效路径标记</span>
              <input
                :checked="state.showMissingLaunchTargetBadge.value"
                type="checkbox"
                aria-label="显示失效路径标记"
                @change="state.toggleMissingLaunchTargetBadge($event.target.checked)"
              />
            </label>
            <div class="scan-root-list">
              <div v-for="root in state.scanRoots.value" :key="root.id" class="scan-root-item">
                <input
                  :name="`scanRootEnabled-${root.id}`"
                  type="checkbox"
                  :checked="root.enabled"
                  :aria-label="`启用 ${root.label}`"
                  @change="state.toggleScanRootEnabled(root.id, $event.target.checked)"
                />
                <span class="scan-root-details">
                  <input
                    class="scan-root-label"
                    :name="`scanRootLabel-${root.id}`"
                    :value="root.label"
                    type="text"
                    :aria-label="`${root.label} 标签`"
                    @change="state.changeScanRootLabel(root.id, $event.target.value)"
                  />
                  <span class="scan-root-path-row">
                    <input
                      class="scan-root-path"
                      :name="`scanRootPath-${root.id}`"
                      :value="root.path"
                      type="text"
                      :aria-label="`${root.label} 路径`"
                      @change="state.changeScanRootPath(root.id, $event.target.value)"
                    />
                    <button
                      class="settings-secondary-button scan-root-browse-button"
                      type="button"
                      :disabled="!state.canBrowseScanRoots.value || state.isBrowsingScanRoot(root.id)"
                      @click="state.browseScanRootDirectory(root.id)"
                    >
                      {{ state.isBrowsingScanRoot(root.id) ? "选择中" : "浏览" }}
                    </button>
                  </span>
                  <span v-if="root.lastScannedAt" class="settings-field-hint">上次扫描 {{ formatScanTime(root.lastScannedAt) }}</span>
                </span>
                <button class="settings-danger-button" type="button" :disabled="!root.removable" @click="state.removeScanRoot(root.id)">删除</button>
              </div>
            </div>
          </section>

          <section class="settings-section" aria-label="扫描过滤">
            <div class="settings-section-header">
              <div>
                <h3>扫描过滤</h3>
                <p>{{ state.scanKeywordBlacklist.value.length }} 个关键字 · {{ state.scanAppBlacklist.value.length }} 个忽略应用</p>
              </div>
            </div>

            <div class="scan-filter-block">
              <div class="scan-filter-header">
                <span>关键字黑名单</span>
              </div>
              <div class="scan-keyword-editor">
                <input
                  v-model="state.newScanKeyword.value"
                  class="scan-keyword-input"
                  name="newScanKeyword"
                  type="text"
                  placeholder="输入关键字"
                  aria-label="新增扫描过滤关键字"
                  @keydown.enter.prevent="state.addScanKeywordBlacklistItem"
                />
                <button class="settings-secondary-button" type="button" @click="state.addScanKeywordBlacklistItem">添加</button>
              </div>
              <div v-if="state.scanKeywordBlacklist.value.length" class="scan-keyword-list">
                <span v-for="(keyword, index) in state.scanKeywordBlacklist.value" :key="`${keyword}-${index}`" class="scan-keyword-chip">
                  <span>{{ keyword }}</span>
                  <button type="button" :aria-label="`移除关键字 ${keyword}`" @click="state.removeScanKeywordBlacklistItem(index)">×</button>
                </span>
              </div>
              <div v-else class="settings-empty-state">没有关键字</div>
            </div>

            <div class="scan-filter-block">
              <div class="scan-filter-header">
                <span>忽略的应用</span>
              </div>
              <div v-if="state.scanAppBlacklist.value.length" class="scan-blocked-app-list">
                <div v-for="(app, index) in state.scanAppBlacklist.value" :key="`${app.sourceKey || app.path}-${index}`" class="scan-blocked-app-item">
                  <span class="scan-root-details">
                    <span class="scan-root-name">{{ app.name || "未命名应用" }}</span>
                    <span class="scan-blocked-app-path">{{ app.path || app.sourceKey }}</span>
                  </span>
                  <button class="settings-secondary-button" type="button" @click="state.removeScanAppBlacklistItem(index)">恢复扫描</button>
                </div>
              </div>
              <div v-else class="settings-empty-state">没有忽略的应用</div>
            </div>
          </section>

          <section class="settings-section" aria-label="应用管理">
            <div class="settings-section-header">
              <div>
                <h3>应用管理</h3>
                <p>{{ state.filteredManagedApps.value.length }} / {{ state.managedApps.value.length }} 个应用 · 已选择 {{ state.selectedManagedAppCount.value }} 个</p>
              </div>
              <div class="settings-inline-actions">
                <button class="settings-secondary-button" type="button" :disabled="!state.canScanManagedApps.value || state.isScanningApps.value" @click="state.rescanManagedApps">
                  {{ state.isScanningApps.value ? "扫描中" : "扫描应用" }}
                </button>
                <button class="settings-primary-button" type="button" @click="state.openAddManagedAppPage">新增应用</button>
                <button class="settings-secondary-button" type="button" :disabled="state.selectedManagedAppCount.value === 0" @click="state.ignoreSelectedManagedApps">批量忽略</button>
                <button class="settings-danger-button" type="button" :disabled="state.selectedManagedAppCount.value === 0" @click="state.deleteSelectedManagedApps">批量删除</button>
              </div>
            </div>

            <input v-model="state.appManagerSearchQuery.value" class="app-manager-search" name="appManagerSearch" type="search" placeholder="搜索应用" aria-label="搜索应用" />

            <div class="settings-list-actions">
              <button class="settings-link-button" type="button" @click="state.selectAllManagedApps">全选</button>
              <button class="settings-link-button" type="button" @click="state.clearManagedAppSelection">清空选择</button>
            </div>

            <div class="app-manager-list" role="list" aria-label="所有应用">
              <div v-for="app in state.filteredManagedApps.value" :key="app.id" class="app-manager-item" role="listitem">
                <input
                  :name="`managedAppSelection-${app.id}`"
                  type="checkbox"
                  :aria-label="`选择 ${app.name}`"
                  :checked="state.appManagerSelectedIds.value.includes(app.id)"
                  @change="state.toggleManagedAppSelection(app.id, $event.target.checked)"
                />
                <span class="app-manager-icon">
                  <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
                  <span v-else>{{ app.emoji }}</span>
                </span>
                <span class="app-manager-details">
                  <span class="app-manager-name">{{ app.name }}</span>
                  <span class="app-manager-target">{{ state.getLaunchTargetPath(app) || "未设置启动路径" }}</span>
                </span>
                <span class="app-manager-actions">
                  <button class="settings-secondary-button" type="button" @click="state.openEditManagedApp(app)">编辑</button>
                  <button class="settings-secondary-button" type="button" @click="state.ignoreManagedApp(app)">忽略</button>
                  <button class="settings-danger-button" type="button" @click="state.deleteManagedApp(app.id)">删除</button>
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
              <span class="settings-about-version">版本 {{ state.appVersion }}</span>
            </div>
          </section>
        </div>
      </div>

      <footer v-if="activeSettingsTab === 'general' || activeSettingsTab === 'interface'" class="settings-actions">
        <button class="settings-secondary-button" type="button" @click="state.closeSettingsPanel">取消</button>
        <button class="settings-primary-button" type="button" :disabled="!!state.dragMeta.value || state.isApplyingSettingsConfig.value" @click="state.applySettingsConfig">应用</button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import BackgroundEffectPreview from "./BackgroundEffectPreview.vue";
import BackgroundImagePreviewCanvas from "./BackgroundImagePreviewCanvas.vue";
import { ChevronDownIcon, ChevronUpIcon } from "./Icons.js";
import { useBackgroundImagePixelSize } from "../composables/useBackgroundImagePixelSize.js";
import { useGsapDomMotion } from "../composables/useGsapDomMotion.js";
import { ICON_SIZE_MAX, ICON_SIZE_MIN, ICON_SIZE_STEP } from "../composables/launchpadConstants.js";
import { listenNativeEvent } from "../api/launchpadApi.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_EFFECT_NONE,
  BACKGROUND_BLUR_STRENGTH_MAX,
  BACKGROUND_BLUR_STRENGTH_MIN,
  BACKGROUND_BLUR_STRENGTH_STEP,
  BACKGROUND_DARKEN_STRENGTH_MAX,
  BACKGROUND_DARKEN_STRENGTH_MIN,
  BACKGROUND_DARKEN_STRENGTH_STEP,
  BACKGROUND_BASE_OPACITY_MAX,
  BACKGROUND_BASE_OPACITY_MIN,
  BACKGROUND_BASE_OPACITY_STEP,
  BACKGROUND_IMAGE_LAYOUT_CENTER,
  BACKGROUND_IMAGE_LAYOUT_FILL,
  BACKGROUND_IMAGE_LAYOUT_FIT,
  BACKGROUND_IMAGE_LAYOUT_STRETCH,
  BACKGROUND_IMAGE_LAYOUT_TILE,
  BACKGROUND_IMAGE_OPACITY_MAX,
  BACKGROUND_IMAGE_OPACITY_MIN,
  BACKGROUND_IMAGE_OPACITY_STEP,
  BACKGROUND_LIVE_DESKTOP_OPACITY_MAX,
  BACKGROUND_LIVE_DESKTOP_OPACITY_MIN,
  BACKGROUND_LIVE_DESKTOP_OPACITY_STEP,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
  BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
  backgroundSourceUsesLiveDesktop,
  backgroundSourceUsesImage,
  normalizeBackgroundAcrylicAppearance,
  normalizeBackgroundAcrylicParams,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_MATERIAL_NONE,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_MICA,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
  WINDOW_MODE_FULLSCREEN,
  WINDOW_MODE_WINDOWED,
} from "../composables/useLaunchpadSettingsConfig.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import { getIconSource } from "../domain/iconSource.js";
import { cx } from "../domain/launchpadLayout.js";
import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  formatMainWindowShortcut,
  mainWindowShortcutFromKeyboardEvent,
} from "../domain/mainWindowShortcut.js";
import { rgbArrayToHex } from "../rendering/pixi/background/acrylicParams.js";

const props = defineProps({
  backgroundLayoutContext: { type: Object, default: null },
  state: { type: Object, required: true },
});

const activeSettingsTab = ref("general");
const activeAcrylicParamsProfile = ref(BACKGROUND_ACRYLIC_APPEARANCE_DARK);
const settingsOverlayRef = ref(null);
const settingsPanelRef = ref(null);
const settingsOverlayMotion = useGsapDomMotion(settingsOverlayRef, {
  initial: { opacity: 0 },
  motion: resolveSettingsOverlayMotion,
});
const settingsPanelMotion = useGsapDomMotion(settingsPanelRef, {
  initial: () => props.state.settingsPanelInitial.value,
  motion: resolveSettingsPanelMotion,
});
const systemAcrylicAppearance = ref(BACKGROUND_ACRYLIC_APPEARANCE_DARK);
const isRecordingMainWindowShortcut = ref(false);
let systemAppearanceQuery = null;
let liveDesktopStatusTimer = null;
let unlistenMainWindowShortcutCaptured = null;
let mainWindowShortcutRecordingSession = 0;
const ACRYLIC_PARAM_STEP = 0.01;
const SETTINGS_OVERLAY_DURATION = 0.16;
const SETTINGS_OVERLAY_EASE = "power2.out";
const SETTINGS_PANEL_OPEN_DURATION = 0.34;
const SETTINGS_PANEL_OPEN_EASE = "power3.out";
const SETTINGS_PANEL_CLOSE_DURATION = 0.22;
const SETTINGS_PANEL_CLOSE_EASE = "power2.inOut";
const LIVE_DESKTOP_STATUS_REFRESH_INTERVAL_MS = 1000;
const ACRYLIC_TINT_STRENGTH_MIN = 0;
const ACRYLIC_TINT_STRENGTH_MAX = 0.6;
const ACRYLIC_BRIGHTNESS_MIN = 0.5;
const ACRYLIC_BRIGHTNESS_MAX = 1.2;
const ACRYLIC_CONTRAST_MIN = 0.75;
const ACRYLIC_CONTRAST_MAX = 1.25;
const ACRYLIC_SATURATION_MIN = 0.8;
const ACRYLIC_SATURATION_MAX = 1.8;
const windowEffectsSupport = computed(() => props.state.windowEffectsSupport.value || {});
const windowEffectMaterialNotes = computed(() => [
  {
    material: WINDOW_EFFECT_MATERIAL_NONE,
    materialClass: "none",
    label: "无材质",
    description: "关闭系统材质，只显示底色与图片层",
    available: true,
  },
  {
    material: WINDOW_EFFECT_MATERIAL_ACRYLIC,
    materialClass: "acrylic",
    label: "透明磨砂",
    description: "半透明模糊，背景变化更明显",
    available: Boolean(windowEffectsSupport.value.supportsAcrylic),
  },
  {
    material: WINDOW_EFFECT_MATERIAL_MICA,
    materialClass: "mica",
    label: "Mica",
    description: "桌面采样，观感更稳定，资源占用更低",
    available: Boolean(windowEffectsSupport.value.supportsMica),
  },
  {
    material: WINDOW_EFFECT_MATERIAL_MICA_ALT,
    materialClass: "mica-alt",
    label: "Mica Alt",
    description: "Mica 变体，层次更强，适合分层窗口",
    available: Boolean(windowEffectsSupport.value.supportsMicaAlt),
  },
]);
const windowEffectAppearances = [
  { appearance: WINDOW_EFFECT_APPEARANCE_LIGHT, appearanceLabel: "浅色" },
  { appearance: WINDOW_EFFECT_APPEARANCE_DARK, appearanceLabel: "深色" },
];
const mainWindowShortcutLabel = computed(() => (
  isRecordingMainWindowShortcut.value
    ? "按下组合键"
    : formatMainWindowShortcut(props.state.draftMainWindowShortcut.value)
));
const mainWindowShortcutHint = computed(() => {
  if (props.state.mainWindowShortcutError.value) return props.state.mainWindowShortcutError.value;
  return isRecordingMainWindowShortcut.value ? "按 Esc 取消录制" : "快速显示或隐藏 LaunchPad";
});
const backgroundImageLayoutOptions = [
  { layout: BACKGROUND_IMAGE_LAYOUT_FILL, label: "填充" },
  { layout: BACKGROUND_IMAGE_LAYOUT_FIT, label: "适应" },
  { layout: BACKGROUND_IMAGE_LAYOUT_STRETCH, label: "拉伸" },
  { layout: BACKGROUND_IMAGE_LAYOUT_TILE, label: "平铺" },
  { layout: BACKGROUND_IMAGE_LAYOUT_CENTER, label: "居中" },
];
const activeWindowEffectAppearance = computed(() => (
  windowEffectAppearances.find((item) => item.appearance === props.state.draftWindowEffectAppearance.value)
  || windowEffectAppearances[1]
));
const windowEffectPreviewItems = computed(() => (
  windowEffectMaterialNotes.value.map((material) => ({
    ...material,
    ...activeWindowEffectAppearance.value,
    active: props.state.draftWindowEffectMaterial.value === material.material,
  }))
));
const canEditWindowEffectAppearance = computed(() =>
  props.state.draftWindowEffectMaterial.value !== WINDOW_EFFECT_MATERIAL_NONE
  && props.state.canUseWindowEffectMaterial(props.state.draftWindowEffectMaterial.value)
);
const doesDraftBackgroundUseImage = computed(() => backgroundSourceUsesImage(props.state.draftBackgroundSource.value));
const canShowLiveDesktopControls = computed(() => isLiveDesktopExperimentEnabled());
const doesDraftBackgroundUseLiveDesktop = computed(() => Boolean(
  canShowLiveDesktopControls.value
  && backgroundSourceUsesLiveDesktop(props.state.draftBackgroundSource.value)
));
const doesDraftBackgroundUseLayer = computed(() => doesDraftBackgroundUseImage.value || doesDraftBackgroundUseLiveDesktop.value);
const isDraftCustomImage = computed(() => props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE);
const isDraftWindowsWallpaper = computed(() => props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER);
const canUseDraftBackgroundEffect = (effect) => props.state.canUseDraftBackgroundEffect(effect);
const liveDesktopUnavailableDetail = computed(() => {
  const support = props.state.liveDesktopBackgroundSupport?.value;
  return String(support?.detail || support?.reason || "").trim();
});
const liveDesktopRuntimeDetail = computed(() => {
  const status = props.state.liveDesktopRuntimeStatus?.value;
  if (!status || status.phase === "stopped") return "";
  return String(status.detail || status.reason || "").trim();
});
const backgroundSourceHint = computed(() =>
  props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE
    ? "自定义图片叠在底色上方"
    : props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER
      ? "跟随当前 Windows 桌面壁纸"
      : props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && canShowLiveDesktopControls.value
        ? liveDesktopRuntimeDetail.value || "捕获动态桌面并在 Native GPU 管线中合成"
        : canShowLiveDesktopControls.value && !props.state.canUseLiveDesktopBackground() && liveDesktopUnavailableDetail.value
          ? `动态桌面不可用：${liveDesktopUnavailableDetail.value}`
        : "不叠加背景层"
);
const backgroundEffectHint = computed(() =>
  doesDraftBackgroundUseLayer.value
    ? doesDraftBackgroundUseLiveDesktop.value && !props.state.canUseLiveDesktopBackgroundEffect(props.state.draftBackgroundEffect.value)
      ? "当前效果由前端透明层合成"
      : props.state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL
      ? "WebGL Acrylic 风格合成"
      : props.state.draftBackgroundEffect.value === BACKGROUND_EFFECT_BLUR
        ? "模糊背景层"
      : props.state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED
        ? "叠加暗化遮罩"
        : "直接显示背景层"
    : "选择背景层后可用"
);
const draftBackgroundImageName = computed(() => {
  const path = String(props.state.draftBackgroundImagePath.value || "").trim();
  if (!path) return isDraftWindowsWallpaper.value ? "等待同步桌面壁纸" : "使用内置图片";
  const name = path.split(/[\\/]/).filter(Boolean).pop() || "";
  if (isDraftWindowsWallpaper.value && /^background-[a-f0-9]{32}\./i.test(name)) return "当前桌面壁纸";
  return /^background-[a-f0-9]{32}\./i.test(name) ? "自定义图片" : name || "自定义图片";
});
const hasDraftBackgroundImagePreview = computed(() => Boolean(
  doesDraftBackgroundUseImage.value && props.state.draftBackgroundImageUrl.value
));
const draftBackgroundImagePixelSize = useBackgroundImagePixelSize(() => (
  hasDraftBackgroundImagePreview.value ? props.state.draftBackgroundImageUrl.value : null
));
const backgroundLayerPreviewLabel = computed(() => {
  if (!doesDraftBackgroundUseImage.value) return "无图片";
  return isDraftWindowsWallpaper.value ? "等待壁纸" : "选择图片";
});
const backgroundEffectPreviewLabel = computed(() => (
  isDraftWindowsWallpaper.value ? "等待壁纸" : "选择图片后可用"
));
const effectiveDraftBackgroundAcrylicAppearance = computed(() => {
  const appearance = normalizeBackgroundAcrylicAppearance(props.state.draftBackgroundAcrylicAppearance.value);
  return appearance === BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM ? systemAcrylicAppearance.value : appearance;
});
const draftBackgroundAcrylicPreviewParams = computed(() => {
  const appearance = effectiveDraftBackgroundAcrylicAppearance.value;
  const params = appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    ? props.state.draftBackgroundAcrylicLightParams.value
    : props.state.draftBackgroundAcrylicDarkParams.value;
  return normalizeBackgroundAcrylicParams(params, appearance);
});
const draftBackgroundEffectBlurStrength = computed(() => (
  props.state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL
    ? props.state.draftBackgroundAcrylicBlurStrength.value
    : props.state.draftBackgroundBlurStrength.value
));
const activeAcrylicParams = computed(() => (
  activeAcrylicParamsProfile.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    ? props.state.draftBackgroundAcrylicLightParams.value
    : props.state.draftBackgroundAcrylicDarkParams.value
));
const activeAcrylicTintColorHex = computed(() => rgbArrayToHex(activeAcrylicParams.value?.tintColor));
const windowEffectsSupportHint = computed(() => {
  const availableLabels = windowEffectMaterialNotes.value
    .filter((item) => item.available)
    .map((item) => item.label);
  return availableLabels.length ? `${availableLabels.join(" / ")} 可用` : "当前系统不可用";
});
const settingsTabs = [
  { id: "general", label: "通用" },
  { id: "interface", label: "界面" },
  { id: "apps", label: "Apps" },
  { id: "about", label: "关于" },
];

onMounted(() => {
  if (typeof window === "undefined") return;
  if (typeof window.matchMedia !== "function") return;
  systemAppearanceQuery = window.matchMedia("(prefers-color-scheme: light)");
  updateSystemAcrylicAppearance();
  if (typeof systemAppearanceQuery.addEventListener === "function") {
    systemAppearanceQuery.addEventListener("change", updateSystemAcrylicAppearance);
  } else {
    systemAppearanceQuery.addListener?.(updateSystemAcrylicAppearance);
  }
});

onBeforeUnmount(() => {
  clearLiveDesktopStatusTimer();
  stopMainWindowShortcutRecording();
  if (!systemAppearanceQuery) return;
  if (typeof systemAppearanceQuery.removeEventListener === "function") {
    systemAppearanceQuery.removeEventListener("change", updateSystemAcrylicAppearance);
  } else {
    systemAppearanceQuery.removeListener?.(updateSystemAcrylicAppearance);
  }
  systemAppearanceQuery = null;
});

watch(
  [
    () => props.state.isSettingsPanelOpen.value,
    () => props.state.draftBackgroundSource.value,
  ],
  syncLiveDesktopStatusTimer,
  { immediate: true }
);

watch(
  () => props.state.isSettingsPanelOpen.value,
  async (isOpen) => {
    if (!isOpen) {
      stopMainWindowShortcutRecording();
      return;
    }
    await nextTick();
    focusModalElement(settingsPanelRef);
  }
);

watch(
  () => props.state.draftBackgroundAcrylicAppearance.value,
  (appearance) => {
    if (appearance === BACKGROUND_ACRYLIC_APPEARANCE_DARK || appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) {
      activeAcrylicParamsProfile.value = appearance;
    }
  },
  { immediate: true }
);

watch(
  () => props.state.settingsOverlayAnimate.value,
  () => {
    settingsOverlayMotion.animate();
  },
  { flush: "post" }
);

watch(
  () => props.state.settingsPanelAnimate.value,
  () => {
    settingsPanelMotion.animate();
  },
  { flush: "post" }
);

async function startMainWindowShortcutRecording() {
  if (typeof window === "undefined") return;
  if (isRecordingMainWindowShortcut.value) return;
  props.state.mainWindowShortcutError.value = "";
  isRecordingMainWindowShortcut.value = true;
  mainWindowShortcutRecordingSession += 1;
  const session = mainWindowShortcutRecordingSession;
  window.addEventListener("keydown", handleMainWindowShortcutRecordingKeydown, true);
  const unlisten = await listenNativeEvent("launchpad-main-window-shortcut-captured", (event) => {
    if (session !== mainWindowShortcutRecordingSession) return;
    const shortcut = String(event?.payload || "").trim();
    if (!shortcut) return;
    props.state.setDraftMainWindowShortcut(shortcut);
    props.state.mainWindowShortcutError.value = "";
    stopMainWindowShortcutRecording();
  });
  if (session !== mainWindowShortcutRecordingSession) {
    unlisten?.();
    return;
  }
  unlistenMainWindowShortcutCaptured = unlisten;
  props.state.setMainWindowShortcutCaptureActive?.(true);
}

function stopMainWindowShortcutRecording() {
  if (isRecordingMainWindowShortcut.value) {
    props.state.setMainWindowShortcutCaptureActive?.(false);
  }
  mainWindowShortcutRecordingSession += 1;
  unlistenMainWindowShortcutCaptured?.();
  unlistenMainWindowShortcutCaptured = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleMainWindowShortcutRecordingKeydown, true);
  }
  isRecordingMainWindowShortcut.value = false;
}

function handleMainWindowShortcutRecordingKeydown(event) {
  event.preventDefault();
  event.stopPropagation();
  const result = mainWindowShortcutFromKeyboardEvent(event);
  if (result.status === "cancel") {
    stopMainWindowShortcutRecording();
    props.state.mainWindowShortcutError.value = "";
    return;
  }
  if (result.status === "invalid") {
    props.state.mainWindowShortcutError.value = result.message;
    return;
  }
  props.state.setDraftMainWindowShortcut(result.shortcut);
  props.state.mainWindowShortcutError.value = "";
  stopMainWindowShortcutRecording();
}

function resetMainWindowShortcut() {
  stopMainWindowShortcutRecording();
  props.state.setDraftMainWindowShortcut(DEFAULT_MAIN_WINDOW_SHORTCUT);
}

function clearMainWindowShortcut() {
  stopMainWindowShortcutRecording();
  props.state.setDraftMainWindowShortcut(null);
}

function handleSettingsPanelKeydown(event) {
  handleModalKeydown(event, settingsPanelRef, props.state.closeSettingsPanel);
}

function resolveSettingsOverlayMotion() {
  return {
    ...props.state.settingsOverlayAnimate.value,
    duration: SETTINGS_OVERLAY_DURATION,
    ease: SETTINGS_OVERLAY_EASE,
  };
}

function resolveSettingsPanelMotion() {
  const target = props.state.settingsPanelAnimate.value;
  const isClosing = Number(target.opacity) === 0;
  return {
    ...target,
    duration: isClosing ? SETTINGS_PANEL_CLOSE_DURATION : SETTINGS_PANEL_OPEN_DURATION,
    ease: isClosing ? SETTINGS_PANEL_CLOSE_EASE : SETTINGS_PANEL_OPEN_EASE,
  };
}

function resolveSystemAcrylicAppearance() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return BACKGROUND_ACRYLIC_APPEARANCE_DARK;
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    : BACKGROUND_ACRYLIC_APPEARANCE_DARK;
}

function updateSystemAcrylicAppearance() {
  systemAcrylicAppearance.value = resolveSystemAcrylicAppearance();
}

function clearLiveDesktopStatusTimer() {
  if (liveDesktopStatusTimer) window.clearInterval(liveDesktopStatusTimer);
  liveDesktopStatusTimer = null;
}

function refreshLiveDesktopRuntimeStatus() {
  if (!canShowLiveDesktopControls.value) return;
  props.state.refreshLiveDesktopRuntimeStatus?.();
}

function syncLiveDesktopStatusTimer() {
  clearLiveDesktopStatusTimer();
  if (typeof window === "undefined") return;
  if (!canShowLiveDesktopControls.value) return;
  if (!props.state.isSettingsPanelOpen.value || !doesDraftBackgroundUseLiveDesktop.value) return;
  if (typeof props.state.refreshLiveDesktopRuntimeStatus !== "function") return;
  refreshLiveDesktopRuntimeStatus();
  liveDesktopStatusTimer = window.setInterval(
    refreshLiveDesktopRuntimeStatus,
    LIVE_DESKTOP_STATUS_REFRESH_INTERVAL_MS
  );
}

function selectWindowEffectPreview(material, appearance) {
  if (!props.state.canUseWindowEffectMaterial(material)) return;
  props.state.setDraftWindowEffectMaterial(material);
  props.state.setDraftWindowEffectAppearance(appearance);
}

function setDraftBackgroundAcrylicAppearance(appearance) {
  props.state.setDraftBackgroundAcrylicAppearance(appearance);
  if (appearance === BACKGROUND_ACRYLIC_APPEARANCE_DARK || appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) {
    activeAcrylicParamsProfile.value = appearance;
  }
}

function setActiveDraftBackgroundAcrylicParam(key, value) {
  props.state.setDraftBackgroundAcrylicParam(activeAcrylicParamsProfile.value, key, value);
}

function resetActiveDraftBackgroundAcrylicParams() {
  props.state.resetDraftBackgroundAcrylicParams(activeAcrylicParamsProfile.value);
}

function formatAcrylicPercent(value) {
  const number = Number(value);
  return `${Math.round((Number.isFinite(number) ? number : 0) * 100)}%`;
}

function formatScanTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
</script>
