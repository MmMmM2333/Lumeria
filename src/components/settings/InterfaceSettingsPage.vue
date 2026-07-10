<template>
  <div class="settings-tab-panel" role="tabpanel" aria-label="外观">
    <section class="settings-section settings-section-plain" aria-label="窗口">
      <div class="settings-section-header">
        <div>
          <h3>窗口</h3>
        </div>
      </div>

      <div class="settings-list">
        <div class="settings-list-row">
          <span class="settings-list-icon" aria-hidden="true">
            <WindowIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">窗口模式</span>
            <span class="settings-list-description">选择打开 Lumeria 时的窗口形态</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-segmented-control" aria-label="窗口模式">
              <button
                type="button"
                :class="c.cx('settings-segmented-button', state.draftWindowMode.value === c.WINDOW_MODE_FULLSCREEN && 'settings-segmented-button-active')"
                @click="state.setDraftWindowMode(c.WINDOW_MODE_FULLSCREEN)"
              >
                全屏
              </button>
              <button
                type="button"
                :class="c.cx('settings-segmented-button', state.draftWindowMode.value === c.WINDOW_MODE_WINDOWED && 'settings-segmented-button-active')"
                @click="state.setDraftWindowMode(c.WINDOW_MODE_WINDOWED)"
              >
                窗口化
              </button>
            </span>
          </span>
        </div>

        <div :class="c.cx('settings-list-row', state.draftWindowMode.value !== c.WINDOW_MODE_WINDOWED && 'settings-row-disabled')">
          <span class="settings-list-icon" aria-hidden="true">
            <AppTitleIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">显示窗口标题栏</span>
            <span class="settings-list-description">窗口化时显示标题和窗口控制按钮</span>
          </span>
          <span class="settings-list-control">
            <fluent-switch
              :checked.prop="state.draftShowCustomTitlebar.value"
              :disabled.prop="state.draftWindowMode.value !== c.WINDOW_MODE_WINDOWED"
              name="showCustomTitlebar"
              aria-label="显示窗口标题栏"
              @change="state.setDraftShowCustomTitlebar($event.target.checked)"
            />
          </span>
        </div>

        <div class="settings-list-expandable">
          <button
            type="button"
            class="settings-list-row settings-list-row-button"
            :aria-expanded="isWindowMaterialExpanded"
            @click="isWindowMaterialExpanded = !isWindowMaterialExpanded"
          >
            <span class="settings-list-icon" aria-hidden="true">
              <ColorBackgroundIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">窗口底材</span>
              <span class="settings-list-description">{{ c.windowEffectsSupportHint.value }}</span>
            </span>
            <span class="settings-list-summary">{{ windowEffectSummary }}</span>
            <ChevronDownIcon :class="c.cx('settings-list-chevron', isWindowMaterialExpanded && 'settings-list-chevron-open')" />
          </button>

          <Transition name="settings-expand">
            <div v-if="isWindowMaterialExpanded" class="settings-list-expand-shell">
              <div class="settings-list-expand">
                <div class="settings-window-effect-controls">
                  <div class="settings-segmented-control" aria-label="窗口底材">
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectMaterial.value === c.WINDOW_EFFECT_MATERIAL_NONE && 'settings-segmented-button-active')"
                      @click="state.setDraftWindowEffectMaterial(c.WINDOW_EFFECT_MATERIAL_NONE)"
                    >
                      无材质
                    </button>
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectMaterial.value === c.WINDOW_EFFECT_MATERIAL_ACRYLIC && 'settings-segmented-button-active')"
                      :disabled="!state.canUseWindowEffectMaterial(c.WINDOW_EFFECT_MATERIAL_ACRYLIC)"
                      @click="state.setDraftWindowEffectMaterial(c.WINDOW_EFFECT_MATERIAL_ACRYLIC)"
                    >
                      Acrylic
                    </button>
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectMaterial.value === c.WINDOW_EFFECT_MATERIAL_MICA && 'settings-segmented-button-active')"
                      :disabled="!state.canUseWindowEffectMaterial(c.WINDOW_EFFECT_MATERIAL_MICA)"
                      @click="state.setDraftWindowEffectMaterial(c.WINDOW_EFFECT_MATERIAL_MICA)"
                    >
                      Mica
                    </button>
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectMaterial.value === c.WINDOW_EFFECT_MATERIAL_MICA_ALT && 'settings-segmented-button-active')"
                      :disabled="!state.canUseWindowEffectMaterial(c.WINDOW_EFFECT_MATERIAL_MICA_ALT)"
                      @click="state.setDraftWindowEffectMaterial(c.WINDOW_EFFECT_MATERIAL_MICA_ALT)"
                    >
                      Mica Alt
                    </button>
                  </div>
                  <div class="settings-segmented-control" aria-label="窗口底材明暗">
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectAppearance.value === c.WINDOW_EFFECT_APPEARANCE_LIGHT && 'settings-segmented-button-active')"
                      :disabled="!c.canEditWindowEffectAppearance.value"
                      @click="state.setDraftWindowEffectAppearance(c.WINDOW_EFFECT_APPEARANCE_LIGHT)"
                    >
                      浅色
                    </button>
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectAppearance.value === c.WINDOW_EFFECT_APPEARANCE_DARK && 'settings-segmented-button-active')"
                      :disabled="!c.canEditWindowEffectAppearance.value"
                      @click="state.setDraftWindowEffectAppearance(c.WINDOW_EFFECT_APPEARANCE_DARK)"
                    >
                      深色
                    </button>
                  </div>
                </div>

                <div class="settings-window-effect-previews" aria-label="窗口底材示意">
                  <button
                    v-for="item in c.windowEffectPreviewItems.value"
                    :key="`${item.material}-${item.appearance}`"
                    type="button"
                    :class="c.cx(
                      'settings-window-effect-preview',
                      `settings-window-effect-preview-${item.materialClass}`,
                      `settings-window-effect-preview-${item.appearance}`,
                      item.active && 'settings-window-effect-preview-active',
                      !item.available && 'settings-window-effect-preview-disabled'
                    )"
                    :disabled="!item.available"
                    @click="c.selectWindowEffectPreview(item.material, item.appearance)"
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
            </div>
          </Transition>
        </div>
      </div>
    </section>

    <section class="settings-section settings-section-plain" aria-label="背景">
      <div class="settings-section-header">
        <div>
          <h3>背景</h3>
        </div>
      </div>

      <div class="settings-list">
        <div class="settings-list-row">
          <span class="settings-list-icon" aria-hidden="true">
            <PaintBrushIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">背景底色</span>
            <span class="settings-list-description">位于图片层下方</span>
          </span>
          <span class="settings-list-control settings-background-base-control">
            <label class="settings-color-control">
              <span>颜色</span>
              <span class="settings-color-swatch">
                <input
                  :value="state.draftBackgroundBaseColor.value"
                  type="color"
                  aria-label="背景底色"
                  autocomplete="off"
                  @input="state.setDraftBackgroundBaseColor($event.target.value)"
                />
              </span>
              <span class="settings-color-value">{{ state.draftBackgroundBaseColor.value }}</span>
            </label>
            <label class="settings-opacity-control">
              <span>不透明度</span>
              <SettingsSlider
                :value="state.draftBackgroundBaseOpacity.value"
                :min="c.BACKGROUND_BASE_OPACITY_MIN"
                :max="c.BACKGROUND_BASE_OPACITY_MAX"
                :step="c.BACKGROUND_BASE_OPACITY_STEP"
                aria-label="背景底色不透明度"
                @change="state.setDraftBackgroundBaseOpacity($event)"
              />
              <span class="settings-opacity-value">{{ state.draftBackgroundBaseOpacity.value }}%</span>
            </label>
          </span>
        </div>

        <div class="settings-list-expandable">
          <button
            type="button"
            class="settings-list-row settings-list-row-button"
            :aria-expanded="isBackgroundLayerExpanded"
            @click="isBackgroundLayerExpanded = !isBackgroundLayerExpanded"
          >
            <span class="settings-list-icon" aria-hidden="true">
              <ImageIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">背景层</span>
              <span class="settings-list-description">{{ c.backgroundSourceHint.value }}</span>
            </span>
            <span class="settings-list-summary">{{ backgroundLayerSummary }}</span>
            <ChevronDownIcon :class="c.cx('settings-list-chevron', isBackgroundLayerExpanded && 'settings-list-chevron-open')" />
          </button>

          <Transition name="settings-expand">
            <div v-if="isBackgroundLayerExpanded" class="settings-list-expand-shell">
              <div class="settings-list-expand settings-background-expand">
                <div class="settings-background-detail">
                  <div class="settings-background-control-row">
                    <span class="settings-acrylic-row-label">来源</span>
                    <div class="settings-segmented-control" aria-label="图片来源">
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_SYSTEM_MATERIAL && 'settings-segmented-button-active')"
                        @click="state.setDraftBackgroundSource(c.BACKGROUND_SOURCE_SYSTEM_MATERIAL)"
                      >
                        无图片
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_CUSTOM_IMAGE && 'settings-segmented-button-active')"
                        :disabled="state.isChoosingBackgroundImage.value"
                        @click="state.draftBackgroundImagePath.value ? state.setDraftBackgroundSource(c.BACKGROUND_SOURCE_CUSTOM_IMAGE) : state.chooseDraftBackgroundImage()"
                      >
                        自定义图片
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_WINDOWS_WALLPAPER && 'settings-segmented-button-active')"
                        :disabled="state.isChoosingBackgroundImage.value"
                        @click="state.useDraftDesktopWallpaper"
                      >
                        桌面壁纸
                      </button>
                      <button
                        v-if="c.canShowLiveDesktopControls.value"
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && 'settings-segmented-button-active')"
                        :disabled="!state.canUseLiveDesktopBackground()"
                        @click="state.setDraftBackgroundSource(c.BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP)"
                      >
                        动态桌面
                      </button>
                    </div>
                  </div>

                  <label v-if="c.doesDraftBackgroundUseImage.value" class="settings-opacity-control settings-background-inline-control">
                    <span>背景透明度</span>
                    <SettingsSlider
                      :value="state.draftBackgroundImageOpacity.value"
                      :min="c.BACKGROUND_IMAGE_OPACITY_MIN"
                      :max="c.BACKGROUND_IMAGE_OPACITY_MAX"
                      :step="c.BACKGROUND_IMAGE_OPACITY_STEP"
                      aria-label="背景层透明度"
                      @change="state.setDraftBackgroundImageOpacity($event)"
                    />
                    <span class="settings-opacity-value">{{ state.draftBackgroundImageOpacity.value }}%</span>
                  </label>

                  <label v-if="c.doesDraftBackgroundUseLiveDesktop.value" class="settings-opacity-control settings-background-inline-control">
                    <span>动态桌面不透明度</span>
                    <SettingsSlider
                      :value="state.draftBackgroundLiveDesktopOpacity.value"
                      :min="c.BACKGROUND_LIVE_DESKTOP_OPACITY_MIN"
                      :max="c.BACKGROUND_LIVE_DESKTOP_OPACITY_MAX"
                      :step="c.BACKGROUND_LIVE_DESKTOP_OPACITY_STEP"
                      aria-label="动态桌面不透明度"
                      @change="state.setDraftBackgroundLiveDesktopOpacity($event)"
                    />
                    <span class="settings-opacity-value">{{ state.draftBackgroundLiveDesktopOpacity.value }}%</span>
                  </label>

                  <div v-if="c.doesDraftBackgroundUseImage.value" class="settings-background-image-controls">
                    <span class="settings-background-image-name">{{ c.draftBackgroundImageName.value }}</span>
                    <SettingsFluentButton
                      v-if="c.isDraftCustomImage.value"
                      appearance="outline"
                      size="small"
                      type="button"
                      :disabled="state.isChoosingBackgroundImage.value"
                      @click="state.chooseDraftBackgroundImage"
                    >
                      {{ state.isChoosingBackgroundImage.value ? "选择中" : "选择图片" }}
                    </SettingsFluentButton>
                    <SettingsFluentButton
                      v-if="c.isDraftWindowsWallpaper.value"
                      appearance="outline"
                      size="small"
                      type="button"
                      :disabled="state.isChoosingBackgroundImage.value"
                      @click="state.useDraftDesktopWallpaper"
                    >
                      {{ state.isChoosingBackgroundImage.value ? "同步中" : "刷新壁纸" }}
                    </SettingsFluentButton>
                    <SettingsFluentButton
                      appearance="subtle"
                      size="small"
                      type="button"
                      :disabled="!state.draftBackgroundImagePath.value"
                      @click="state.clearDraftBackgroundImage"
                    >
                      恢复默认
                    </SettingsFluentButton>
                  </div>

                  <div v-if="c.doesDraftBackgroundUseImage.value" class="settings-background-control-row">
                    <span class="settings-acrylic-row-label">显示方式</span>
                    <div class="settings-segmented-control" aria-label="背景图片显示方式">
                      <button
                        v-for="item in c.backgroundImageLayoutOptions"
                        :key="item.layout"
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundImageLayout.value === item.layout && 'settings-segmented-button-active')"
                        @click="state.setDraftBackgroundImageLayout(item.layout)"
                      >
                        {{ item.label }}
                      </button>
                    </div>
                  </div>
                </div>

                <BackgroundImagePreviewCanvas
                  aria-label="图片层预览"
                  :background-base-color="state.draftBackgroundBaseColor.value"
                  :background-base-opacity="state.draftBackgroundBaseOpacity.value"
                  :background-image-layout="state.draftBackgroundImageLayout.value"
                  :background-image-opacity="state.draftBackgroundImageOpacity.value"
                  :background-image-pixel-size="c.draftBackgroundImagePixelSize.value"
                  :background-image-url="c.hasDraftBackgroundImagePreview.value ? state.draftBackgroundImageUrl.value : null"
                  :background-layout-context="backgroundLayoutContext"
                  :empty-label="c.backgroundLayerPreviewLabel.value"
                />
              </div>
            </div>
          </Transition>
        </div>

        <div class="settings-list-expandable">
          <button
            type="button"
            class="settings-list-row settings-list-row-button"
            :aria-expanded="isBackgroundEffectExpanded"
            @click="isBackgroundEffectExpanded = !isBackgroundEffectExpanded"
          >
            <span class="settings-list-icon" aria-hidden="true">
              <BlurIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">背景效果</span>
              <span class="settings-list-description">{{ c.backgroundEffectHint.value }}</span>
            </span>
            <span class="settings-list-summary">{{ backgroundEffectSummary }}</span>
            <ChevronDownIcon :class="c.cx('settings-list-chevron', isBackgroundEffectExpanded && 'settings-list-chevron-open')" />
          </button>

          <Transition name="settings-expand">
            <div v-if="isBackgroundEffectExpanded" class="settings-list-expand-shell">
              <div class="settings-list-expand settings-background-expand">
                <div class="settings-background-detail">
                  <div class="settings-background-control-row">
                    <span class="settings-acrylic-row-label">效果</span>
                    <div class="settings-segmented-control" aria-label="图片效果">
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_NONE && 'settings-segmented-button-active')"
                        :disabled="!c.canUseDraftBackgroundEffect(c.BACKGROUND_EFFECT_NONE)"
                        @click="state.setDraftBackgroundEffect(c.BACKGROUND_EFFECT_NONE)"
                      >
                        原图
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_DIMMED && 'settings-segmented-button-active')"
                        :disabled="!c.canUseDraftBackgroundEffect(c.BACKGROUND_EFFECT_DIMMED)"
                        @click="state.setDraftBackgroundEffect(c.BACKGROUND_EFFECT_DIMMED)"
                      >
                        暗化
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_BLUR && 'settings-segmented-button-active')"
                        :disabled="!c.canUseDraftBackgroundEffect(c.BACKGROUND_EFFECT_BLUR)"
                        @click="state.setDraftBackgroundEffect(c.BACKGROUND_EFFECT_BLUR)"
                      >
                        模糊
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_ACRYLIC_WEBGL && 'settings-segmented-button-active')"
                        :disabled="!c.canUseDraftBackgroundEffect(c.BACKGROUND_EFFECT_ACRYLIC_WEBGL)"
                        @click="state.setDraftBackgroundEffect(c.BACKGROUND_EFFECT_ACRYLIC_WEBGL)"
                      >
                        Acrylic
                      </button>
                    </div>
                  </div>

                  <label v-if="c.doesDraftBackgroundUseLayer.value && state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_BLUR" class="settings-opacity-control settings-background-inline-control">
                    <span>模糊强度</span>
                    <SettingsSlider
                      :value="state.draftBackgroundBlurStrength.value"
                      :min="c.BACKGROUND_BLUR_STRENGTH_MIN"
                      :max="c.BACKGROUND_BLUR_STRENGTH_MAX"
                      :step="c.BACKGROUND_BLUR_STRENGTH_STEP"
                      aria-label="背景模糊强度"
                      @change="state.setDraftBackgroundBlurStrength($event)"
                    />
                    <span class="settings-opacity-value">{{ state.draftBackgroundBlurStrength.value }}%</span>
                  </label>

                  <label v-if="c.doesDraftBackgroundUseLayer.value && state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_DIMMED" class="settings-color-control">
                    <span>暗化颜色</span>
                    <span class="settings-color-swatch">
                      <input
                        :value="state.draftBackgroundDarkenColor.value"
                        type="color"
                        aria-label="背景暗化颜色"
                        autocomplete="off"
                        @input="state.setDraftBackgroundDarkenColor($event.target.value)"
                      />
                    </span>
                    <span class="settings-color-value">{{ state.draftBackgroundDarkenColor.value }}</span>
                  </label>

                  <label v-if="c.doesDraftBackgroundUseLayer.value && state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_DIMMED" class="settings-opacity-control settings-background-inline-control">
                    <span>暗化强度</span>
                    <SettingsSlider
                      :value="state.draftBackgroundDarkenStrength.value"
                      :min="c.BACKGROUND_DARKEN_STRENGTH_MIN"
                      :max="c.BACKGROUND_DARKEN_STRENGTH_MAX"
                      :step="c.BACKGROUND_DARKEN_STRENGTH_STEP"
                      aria-label="背景暗化强度"
                      @change="state.setDraftBackgroundDarkenStrength($event)"
                    />
                    <span class="settings-opacity-value">{{ state.draftBackgroundDarkenStrength.value }}%</span>
                  </label>

                  <div v-if="c.doesDraftBackgroundUseLayer.value && state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_ACRYLIC_WEBGL" class="settings-acrylic-controls">
                    <label class="settings-opacity-control">
                      <span>模糊强度</span>
                      <SettingsSlider
                        :value="state.draftBackgroundAcrylicBlurStrength.value"
                        :min="c.BACKGROUND_BLUR_STRENGTH_MIN"
                        :max="c.BACKGROUND_BLUR_STRENGTH_MAX"
                        :step="c.BACKGROUND_BLUR_STRENGTH_STEP"
                        aria-label="Acrylic 模糊强度"
                        @change="state.setDraftBackgroundAcrylicBlurStrength($event)"
                      />
                      <span class="settings-opacity-value">{{ state.draftBackgroundAcrylicBlurStrength.value }}%</span>
                    </label>

                    <div class="settings-acrylic-row">
                      <span class="settings-acrylic-row-label">Acrylic 外观</span>
                      <div class="settings-segmented-control" aria-label="Acrylic 外观">
                        <button
                          type="button"
                          :class="c.cx('settings-segmented-button', state.draftBackgroundAcrylicAppearance.value === c.BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM && 'settings-segmented-button-active')"
                          @click="c.setDraftBackgroundAcrylicAppearance(c.BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM)"
                        >
                          跟随系统
                        </button>
                        <button
                          type="button"
                          :class="c.cx('settings-segmented-button', state.draftBackgroundAcrylicAppearance.value === c.BACKGROUND_ACRYLIC_APPEARANCE_DARK && 'settings-segmented-button-active')"
                          @click="c.setDraftBackgroundAcrylicAppearance(c.BACKGROUND_ACRYLIC_APPEARANCE_DARK)"
                        >
                          深色
                        </button>
                        <button
                          type="button"
                          :class="c.cx('settings-segmented-button', state.draftBackgroundAcrylicAppearance.value === c.BACKGROUND_ACRYLIC_APPEARANCE_LIGHT && 'settings-segmented-button-active')"
                          @click="c.setDraftBackgroundAcrylicAppearance(c.BACKGROUND_ACRYLIC_APPEARANCE_LIGHT)"
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
                          :class="c.cx('settings-segmented-button', c.activeAcrylicParamsProfile.value === c.BACKGROUND_ACRYLIC_APPEARANCE_DARK && 'settings-segmented-button-active')"
                          @click="c.activeAcrylicParamsProfile.value = c.BACKGROUND_ACRYLIC_APPEARANCE_DARK"
                        >
                          深色参数
                        </button>
                        <button
                          type="button"
                          :class="c.cx('settings-segmented-button', c.activeAcrylicParamsProfile.value === c.BACKGROUND_ACRYLIC_APPEARANCE_LIGHT && 'settings-segmented-button-active')"
                          @click="c.activeAcrylicParamsProfile.value = c.BACKGROUND_ACRYLIC_APPEARANCE_LIGHT"
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
                            :value="c.activeAcrylicTintColorHex.value"
                            type="color"
                            aria-label="Acrylic 染色"
                            autocomplete="off"
                            @input="c.setActiveDraftBackgroundAcrylicParam('tintColor', $event.target.value)"
                          />
                        </span>
                        <span class="settings-color-value">{{ c.activeAcrylicTintColorHex.value }}</span>
                      </label>

                      <label class="settings-opacity-control">
                        <span>染色强度</span>
                        <SettingsSlider
                          :value="c.activeAcrylicParams.value.tintStrength"
                          :min="c.ACRYLIC_TINT_STRENGTH_MIN"
                          :max="c.ACRYLIC_TINT_STRENGTH_MAX"
                          :step="c.ACRYLIC_PARAM_STEP"
                          aria-label="Acrylic 染色强度"
                          @change="c.setActiveDraftBackgroundAcrylicParam('tintStrength', $event)"
                        />
                        <span class="settings-opacity-value">{{ c.formatAcrylicPercent(c.activeAcrylicParams.value.tintStrength) }}</span>
                      </label>

                      <label class="settings-opacity-control">
                        <span>亮度</span>
                        <SettingsSlider
                          :value="c.activeAcrylicParams.value.brightness"
                          :min="c.ACRYLIC_BRIGHTNESS_MIN"
                          :max="c.ACRYLIC_BRIGHTNESS_MAX"
                          :step="c.ACRYLIC_PARAM_STEP"
                          aria-label="Acrylic 亮度"
                          @change="c.setActiveDraftBackgroundAcrylicParam('brightness', $event)"
                        />
                        <span class="settings-opacity-value">{{ c.formatAcrylicPercent(c.activeAcrylicParams.value.brightness) }}</span>
                      </label>

                      <label class="settings-opacity-control">
                        <span>对比度</span>
                        <SettingsSlider
                          :value="c.activeAcrylicParams.value.contrast"
                          :min="c.ACRYLIC_CONTRAST_MIN"
                          :max="c.ACRYLIC_CONTRAST_MAX"
                          :step="c.ACRYLIC_PARAM_STEP"
                          aria-label="Acrylic 对比度"
                          @change="c.setActiveDraftBackgroundAcrylicParam('contrast', $event)"
                        />
                        <span class="settings-opacity-value">{{ c.formatAcrylicPercent(c.activeAcrylicParams.value.contrast) }}</span>
                      </label>

                      <label class="settings-opacity-control">
                        <span>饱和度</span>
                        <SettingsSlider
                          :value="c.activeAcrylicParams.value.saturation"
                          :min="c.ACRYLIC_SATURATION_MIN"
                          :max="c.ACRYLIC_SATURATION_MAX"
                          :step="c.ACRYLIC_PARAM_STEP"
                          aria-label="Acrylic 饱和度"
                          @change="c.setActiveDraftBackgroundAcrylicParam('saturation', $event)"
                        />
                        <span class="settings-opacity-value">{{ c.formatAcrylicPercent(c.activeAcrylicParams.value.saturation) }}</span>
                      </label>

                      <SettingsFluentButton appearance="outline" type="button" @click="c.resetActiveDraftBackgroundAcrylicParams">
                        恢复默认
                      </SettingsFluentButton>
                    </div>
                  </div>
                </div>

                <BackgroundEffectPreview
                  :active="isBackgroundEffectExpanded && state.isSettingsPanelOpen.value && c.activeSettingsTab.value === 'interface'"
                  :background-acrylic-params="c.draftBackgroundAcrylicPreviewParams.value"
                  :background-base-color="state.draftBackgroundBaseColor.value"
                  :background-base-opacity="state.draftBackgroundBaseOpacity.value"
                  :background-blur-strength="c.draftBackgroundEffectBlurStrength.value"
                  :background-darken-color="state.draftBackgroundDarkenColor.value"
                  :background-darken-strength="state.draftBackgroundDarkenStrength.value"
                  :background-effect="state.draftBackgroundEffect.value"
                  :background-image-layout="state.draftBackgroundImageLayout.value"
                  :background-image-opacity="state.draftBackgroundImageOpacity.value"
                  :background-image-path="state.draftBackgroundImagePath.value"
                  :background-image-pixel-size="c.draftBackgroundImagePixelSize.value"
                  :background-image-url="c.hasDraftBackgroundImagePreview.value ? state.draftBackgroundImageUrl.value : null"
                  :background-layout-context="backgroundLayoutContext"
                  :empty-label="c.backgroundEffectPreviewLabel.value"
                />
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </section>

    <section class="settings-section settings-section-plain" aria-label="布局">
      <div class="settings-section-header">
        <div>
          <h3>布局</h3>
        </div>
      </div>

      <div class="settings-list settings-list-no-icons">
        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">桌面布局</span>
            <span class="settings-list-description">设置桌面网格的行数和列数</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-grid-layout-control" aria-label="桌面布局">
              <SettingsSpinButton
                v-model="state.draftRows.value"
                aria-label="桌面行数"
                decrease-label="减少桌面行数"
                increase-label="增加桌面行数"
                name="desktopRows"
                :min="2"
                :max="8"
              />
              <span class="settings-grid-layout-separator">x</span>
              <SettingsSpinButton
                v-model="state.draftCols.value"
                aria-label="桌面列数"
                decrease-label="减少桌面列数"
                increase-label="增加桌面列数"
                name="desktopCols"
                :min="3"
                :max="10"
              />
            </span>
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">文件夹布局</span>
            <span class="settings-list-description">设置文件夹展开后的行数和列数</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-grid-layout-control" aria-label="文件夹布局">
              <SettingsSpinButton
                v-model="state.draftFolderRows.value"
                aria-label="文件夹行数"
                decrease-label="减少文件夹行数"
                increase-label="增加文件夹行数"
                name="folderRows"
                :min="2"
                :max="6"
              />
              <span class="settings-grid-layout-separator">x</span>
              <SettingsSpinButton
                v-model="state.draftFolderCols.value"
                aria-label="文件夹列数"
                decrease-label="减少文件夹列数"
                increase-label="增加文件夹列数"
                name="folderCols"
                :min="2"
                :max="8"
              />
            </span>
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">图标大小</span>
            <span class="settings-list-description">设置桌面图标的目标尺寸；实际显示会受行列布局和可用空间影响</span>
          </span>
          <span class="settings-list-control">
            <SettingsSpinButton
              v-model="state.draftIconSize.value"
              aria-label="图标大小"
              decrease-label="缩小图标"
              increase-label="增大图标"
              name="iconSize"
              unit="px"
              wide
              :min="c.ICON_SIZE_MIN"
              :max="c.ICON_SIZE_MAX"
              :step="c.ICON_SIZE_STEP"
            />
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">文件夹图标大小</span>
            <span class="settings-list-description">设置文件夹内图标的目标尺寸；可跟随桌面图标或单独设置</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-folder-icon-size-control">
              <span class="settings-segmented-control" aria-label="文件夹图标大小模式">
                <button
                  type="button"
                  :class="c.cx('settings-segmented-button', state.draftFolderIconSizeMode.value === 'global' && 'settings-segmented-button-active')"
                  @click="state.setDraftFolderIconSizeMode('global')"
                >
                  跟随全局
                </button>
                <button
                  type="button"
                  :class="c.cx('settings-segmented-button', state.draftFolderIconSizeMode.value === 'custom' && 'settings-segmented-button-active')"
                  @click="state.setDraftFolderIconSizeMode('custom')"
                >
                  自定义
                </button>
              </span>
              <SettingsSpinButton
                v-if="state.draftFolderIconSizeMode.value === 'custom'"
                v-model="state.draftFolderIconSize.value"
                aria-label="文件夹图标大小"
                decrease-label="缩小文件夹图标"
                increase-label="增大文件夹图标"
                name="folderIconSize"
                unit="px"
                wide
                :min="c.ICON_SIZE_MIN"
                :max="c.ICON_SIZE_MAX"
                :step="c.ICON_SIZE_STEP"
              />
            </span>
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">无字模式</span>
            <span class="settings-list-description">隐藏应用名称，保留图标网格</span>
          </span>
          <span class="settings-list-control">
            <fluent-switch
              :checked.prop="state.draftIsTextlessMode.value"
              name="textlessMode"
              aria-label="无字模式"
              @change="state.draftIsTextlessMode.value = $event.target.checked"
            />
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">整理空位</span>
            <span class="settings-list-description">根据当前行列布局，将 App 向前整理以填补空位</span>
          </span>
          <span class="settings-list-control">
            <SettingsFluentButton
              appearance="outline"
              type="button"
              :disabled="!!state.dragMeta.value"
              @click="state.confirmForceFillAllPages"
            >
              重新整理
            </SettingsFluentButton>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import AppTitleIcon from "~icons/fluent/app-title-24-regular";
import BlurIcon from "~icons/fluent/blur-24-regular";
import ChevronDownIcon from "~icons/fluent/chevron-down-20-regular";
import ColorBackgroundIcon from "~icons/fluent/color-background-24-regular";
import ImageIcon from "~icons/fluent/image-24-regular";
import PaintBrushIcon from "~icons/fluent/paint-brush-24-regular";
import WindowIcon from "~icons/fluent/window-24-regular";
import BackgroundEffectPreview from "../BackgroundEffectPreview.vue";
import BackgroundImagePreviewCanvas from "../BackgroundImagePreviewCanvas.vue";
import SettingsFluentButton from "./SettingsFluentButton.vue";
import SettingsSlider from "./SettingsSlider.vue";
import SettingsSpinButton from "./SettingsSpinButton.vue";

const props = defineProps({
  backgroundLayoutContext: { type: Object, default: null },
  context: { type: Object, required: true },
  state: { type: Object, required: true },
});

const c = props.context;
const isWindowMaterialExpanded = ref(false);
const isBackgroundLayerExpanded = ref(false);
const isBackgroundEffectExpanded = ref(false);
const activeWindowEffectItem = computed(() => (
  c.windowEffectPreviewItems.value.find((item) => item.active)
  || c.windowEffectPreviewItems.value[0]
));
const windowEffectSummary = computed(() => {
  const item = activeWindowEffectItem.value;
  if (!item) return "未设置";
  return `${item.label} · ${item.appearanceLabel}`;
});
const activeBackgroundImageLayoutLabel = computed(() => (
  c.backgroundImageLayoutOptions.find((item) => item.layout === props.state.draftBackgroundImageLayout.value)?.label
  || c.backgroundImageLayoutOptions[0]?.label
  || "填充"
));
const backgroundLayerSourceLabel = computed(() => {
  if (props.state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_CUSTOM_IMAGE) return "自定义图片";
  if (props.state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_WINDOWS_WALLPAPER) return "桌面壁纸";
  if (props.state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && c.canShowLiveDesktopControls.value) return "动态桌面";
  return "无图片";
});
const backgroundLayerSummary = computed(() => {
  if (c.doesDraftBackgroundUseLiveDesktop.value) {
    return `${backgroundLayerSourceLabel.value} · ${props.state.draftBackgroundLiveDesktopOpacity.value}%`;
  }
  if (c.doesDraftBackgroundUseImage.value) {
    return `${backgroundLayerSourceLabel.value} · ${activeBackgroundImageLayoutLabel.value} · ${props.state.draftBackgroundImageOpacity.value}%`;
  }
  return backgroundLayerSourceLabel.value;
});
const backgroundAcrylicAppearanceLabel = computed(() => {
  if (props.state.draftBackgroundAcrylicAppearance.value === c.BACKGROUND_ACRYLIC_APPEARANCE_DARK) return "深色";
  if (props.state.draftBackgroundAcrylicAppearance.value === c.BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) return "浅色";
  return "跟随系统";
});
const backgroundEffectSummary = computed(() => {
  if (!c.doesDraftBackgroundUseLayer.value) return "选择背景层后可用";
  if (props.state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_BLUR) {
    return `模糊 · ${props.state.draftBackgroundBlurStrength.value}%`;
  }
  if (props.state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_ACRYLIC_WEBGL) {
    return `Acrylic · ${backgroundAcrylicAppearanceLabel.value} · ${props.state.draftBackgroundAcrylicBlurStrength.value}%`;
  }
  if (props.state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_DIMMED) {
    return `暗化 · ${props.state.draftBackgroundDarkenStrength.value}%`;
  }
  return "原图";
});
</script>
