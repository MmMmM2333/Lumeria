<template>
  <div class="settings-tab-panel" role="tabpanel" :aria-label="t('settings.interface.title')">
    <section class="settings-section settings-section-plain" :aria-label="t('settings.interface.theme.title')">
      <div class="settings-section-header">
        <div>
          <h3>{{ t("settings.interface.theme.title") }}</h3>
        </div>
      </div>

      <div class="settings-list">
        <div class="settings-list-row">
          <span class="settings-list-icon" aria-hidden="true">
            <DarkThemeIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.interface.theme.mode") }}</span>
            <span class="settings-list-description">{{ t("settings.interface.theme.description") }}</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-segmented-control" :aria-label="t('settings.interface.theme.mode')">
              <button
                v-for="option in c.settingsThemeOptions.value"
                :key="option.value"
                type="button"
                :class="c.cx('settings-segmented-button', state.draftSettingsThemePreference.value === option.value && 'settings-segmented-button-active')"
                :aria-pressed="state.draftSettingsThemePreference.value === option.value"
                @click="state.setDraftSettingsThemePreference(option.value)"
              >
                {{ option.label }}
              </button>
            </span>
          </span>
        </div>
      </div>
    </section>

    <section class="settings-section settings-section-plain" :aria-label="t('settings.interface.window.title')">
      <div class="settings-section-header">
        <div>
          <h3>{{ t("settings.interface.window.title") }}</h3>
        </div>
      </div>

      <div class="settings-list">
        <div class="settings-list-expandable">
          <div class="settings-list-row settings-list-row-button settings-window-mode-row">
            <button
              type="button"
              class="settings-window-mode-row-toggle"
              :aria-label="t(isWindowModeSettingsExpanded ? 'settings.interface.window.collapseModeSettings' : 'settings.interface.window.expandModeSettings')"
              :aria-expanded="isWindowModeSettingsExpanded"
              aria-controls="settings-window-mode-details"
              @click="isWindowModeSettingsExpanded = !isWindowModeSettingsExpanded"
            />
            <span class="settings-list-icon" aria-hidden="true">
              <WindowIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">{{ t("settings.interface.window.mode") }}</span>
              <span class="settings-list-description">{{ t("settings.interface.window.modeDescription") }}</span>
            </span>
            <span class="settings-list-control settings-window-mode-control">
              <span class="settings-segmented-control" :aria-label="t('settings.interface.window.mode')">
                <button
                  type="button"
                  :class="c.cx('settings-segmented-button', state.draftWindowMode.value === c.WINDOW_MODE_FULLSCREEN && 'settings-segmented-button-active')"
                  :aria-pressed="state.draftWindowMode.value === c.WINDOW_MODE_FULLSCREEN"
                  @click="state.setDraftWindowMode(c.WINDOW_MODE_FULLSCREEN)"
                >
                  {{ t("settings.interface.window.fullscreen") }}
                </button>
                <button
                  type="button"
                  :class="c.cx('settings-segmented-button', state.draftWindowMode.value === c.WINDOW_MODE_WINDOWED && 'settings-segmented-button-active')"
                  :aria-pressed="state.draftWindowMode.value === c.WINDOW_MODE_WINDOWED"
                  @click="state.setDraftWindowMode(c.WINDOW_MODE_WINDOWED)"
                >
                  {{ t("settings.interface.window.windowed") }}
                </button>
              </span>
            </span>
            <ChevronDownIcon :class="c.cx('settings-list-chevron', isWindowModeSettingsExpanded && 'settings-list-chevron-open')" />
          </div>

          <Transition name="settings-expand">
            <div
              v-if="isWindowModeSettingsExpanded"
              id="settings-window-mode-details"
              class="settings-list-expand-shell"
            >
              <div class="settings-list-expand">
                <label :class="c.cx('settings-toggle', state.draftWindowMode.value !== c.WINDOW_MODE_WINDOWED && 'settings-row-disabled')">
                  <span class="settings-field-copy">
                    <span class="settings-list-title">{{ t("settings.interface.window.titlebar") }}</span>
                    <span class="settings-list-description settings-list-description-wrap">{{ t("settings.interface.window.titlebarDescription") }}</span>
                  </span>
                  <fluent-switch
                    :checked.prop="state.draftShowCustomTitlebar.value"
                    :disabled.attr="state.draftWindowMode.value !== c.WINDOW_MODE_WINDOWED ? '' : null"
                    name="showCustomTitlebar"
                    :aria-label="t('settings.interface.window.titlebar')"
                    @change="state.setDraftShowCustomTitlebar(readControlChecked($event))"
                  />
                </label>
              </div>
            </div>
          </Transition>
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
              <span class="settings-list-title">{{ t("settings.interface.window.material") }}</span>
            </span>
            <span class="settings-list-summary">{{ windowEffectSummary }}</span>
            <ChevronDownIcon :class="c.cx('settings-list-chevron', isWindowMaterialExpanded && 'settings-list-chevron-open')" />
          </button>

          <Transition name="settings-expand">
            <div v-if="isWindowMaterialExpanded" class="settings-list-expand-shell">
              <div class="settings-list-expand">
                <div class="settings-window-effect-controls">
                  <div class="settings-segmented-control" :aria-label="t('settings.interface.window.material')">
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectMaterial.value === c.WINDOW_EFFECT_MATERIAL_NONE && 'settings-segmented-button-active')"
                      @click="state.setDraftWindowEffectMaterial(c.WINDOW_EFFECT_MATERIAL_NONE)"
                    >
                      {{ t("settings.interface.window.materialNone") }}
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
                  <div class="settings-segmented-control" :aria-label="t('settings.interface.window.appearance')">
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectAppearance.value === c.WINDOW_EFFECT_APPEARANCE_SYSTEM && 'settings-segmented-button-active')"
                      :disabled="!c.canEditWindowEffectAppearance.value"
                      @click="state.setDraftWindowEffectAppearance(c.WINDOW_EFFECT_APPEARANCE_SYSTEM)"
                    >
                      {{ t("settings.interface.window.system") }}
                    </button>
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectAppearance.value === c.WINDOW_EFFECT_APPEARANCE_LIGHT && 'settings-segmented-button-active')"
                      :disabled="!c.canEditWindowEffectAppearance.value"
                      @click="state.setDraftWindowEffectAppearance(c.WINDOW_EFFECT_APPEARANCE_LIGHT)"
                    >
                      {{ t("settings.interface.window.light") }}
                    </button>
                    <button
                      type="button"
                      :class="c.cx('settings-segmented-button', state.draftWindowEffectAppearance.value === c.WINDOW_EFFECT_APPEARANCE_DARK && 'settings-segmented-button-active')"
                      :disabled="!c.canEditWindowEffectAppearance.value"
                      @click="state.setDraftWindowEffectAppearance(c.WINDOW_EFFECT_APPEARANCE_DARK)"
                    >
                      {{ t("settings.interface.window.dark") }}
                    </button>
                  </div>
                </div>

                <div class="settings-window-effect-previews" :aria-label="t('settings.interface.window.previews')">
                  <button
                    v-for="item in c.windowEffectPreviewItems.value"
                    :key="`${item.material}-${item.appearance}`"
                    type="button"
                    :class="c.cx(
                      'settings-window-effect-preview',
                      `settings-window-effect-preview-${item.materialClass}`,
                      `settings-window-effect-preview-${item.resolvedAppearance}`,
                      item.active && 'settings-window-effect-preview-active',
                      !item.available && 'settings-window-effect-preview-disabled'
                    )"
                    :disabled="!item.available"
                    @click="c.selectWindowEffectPreview(normalizeWindowEffectMaterial(item.material), normalizeWindowEffectAppearance(item.appearance))"
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
                        <span v-if="item.material !== c.WINDOW_EFFECT_MATERIAL_NONE">{{ item.appearanceLabel }}</span>
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

    <section class="settings-section settings-section-plain" :aria-label="t('settings.interface.background.title')">
      <div class="settings-section-header">
        <div>
          <h3>{{ t("settings.interface.background.title") }}</h3>
        </div>
      </div>

      <div class="settings-list">
        <div class="settings-list-row">
          <span class="settings-list-icon" aria-hidden="true">
            <PaintBrushIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.interface.background.base.title") }}</span>
            <span class="settings-list-description">{{ t("settings.interface.background.base.description") }}</span>
          </span>
          <span class="settings-list-control settings-background-base-control">
            <label class="settings-color-control">
              <span>{{ t("settings.interface.background.base.color") }}</span>
              <span class="settings-color-swatch">
                <input
                  :value="state.draftBackgroundBaseColor.value"
                  type="color"
                  :aria-label="t('settings.interface.background.base.title')"
                  autocomplete="off"
                  @input="state.setDraftBackgroundBaseColor(readInputValue($event))"
                />
              </span>
              <span class="settings-color-value">{{ state.draftBackgroundBaseColor.value }}</span>
            </label>
            <label class="settings-opacity-control">
              <span>{{ t("settings.interface.background.base.opacity") }}</span>
              <SettingsSlider
                :value="state.draftBackgroundBaseOpacity.value"
                :min="c.BACKGROUND_BASE_OPACITY_MIN"
                :max="c.BACKGROUND_BASE_OPACITY_MAX"
                :step="c.BACKGROUND_BASE_OPACITY_STEP"
                :aria-label="t('settings.interface.background.base.opacityLabel')"
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
              <span class="settings-list-title">{{ t("settings.interface.background.layer.title") }}</span>
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
                    <span class="settings-acrylic-row-label">{{ t("settings.interface.background.layer.source") }}</span>
                    <div class="settings-segmented-control" :aria-label="t('settings.interface.background.layer.sourceLabel')">
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_SYSTEM_MATERIAL && 'settings-segmented-button-active')"
                        @click="state.setDraftBackgroundSource(c.BACKGROUND_SOURCE_SYSTEM_MATERIAL)"
                      >
                        {{ t("settings.interface.background.layer.none") }}
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_CUSTOM_IMAGE && 'settings-segmented-button-active')"
                        :disabled="state.isChoosingBackgroundImage.value"
                        @click="state.draftBackgroundImagePath.value ? state.setDraftBackgroundSource(c.BACKGROUND_SOURCE_CUSTOM_IMAGE) : state.chooseDraftBackgroundImage()"
                      >
                        {{ t("settings.interface.background.layer.custom") }}
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_WINDOWS_WALLPAPER && 'settings-segmented-button-active')"
                        :disabled="state.isChoosingBackgroundImage.value"
                        @click="state.useDraftDesktopWallpaper"
                      >
                        {{ t("settings.interface.background.layer.wallpaper") }}
                      </button>
                      <button
                        v-if="c.canShowLiveDesktopControls.value"
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundSource.value === c.BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && 'settings-segmented-button-active')"
                        :disabled="!state.canUseLiveDesktopBackground()"
                        @click="state.setDraftBackgroundSource(c.BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP)"
                      >
                        {{ t("settings.interface.background.layer.live") }}
                      </button>
                    </div>
                  </div>

                  <label v-if="c.doesDraftBackgroundUseImage.value" class="settings-opacity-control settings-background-inline-control">
                    <span>{{ t("settings.interface.background.layer.imageOpacity") }}</span>
                    <SettingsSlider
                      :value="state.draftBackgroundImageOpacity.value"
                      :min="c.BACKGROUND_IMAGE_OPACITY_MIN"
                      :max="c.BACKGROUND_IMAGE_OPACITY_MAX"
                      :step="c.BACKGROUND_IMAGE_OPACITY_STEP"
                      :aria-label="t('settings.interface.background.layer.imageOpacityLabel')"
                      @change="state.setDraftBackgroundImageOpacity($event)"
                    />
                    <span class="settings-opacity-value">{{ state.draftBackgroundImageOpacity.value }}%</span>
                  </label>

                  <label v-if="c.doesDraftBackgroundUseLiveDesktop.value" class="settings-opacity-control settings-background-inline-control">
                    <span>{{ t("settings.interface.background.layer.liveOpacity") }}</span>
                    <SettingsSlider
                      :value="state.draftBackgroundLiveDesktopOpacity.value"
                      :min="c.BACKGROUND_LIVE_DESKTOP_OPACITY_MIN"
                      :max="c.BACKGROUND_LIVE_DESKTOP_OPACITY_MAX"
                      :step="c.BACKGROUND_LIVE_DESKTOP_OPACITY_STEP"
                      :aria-label="t('settings.interface.background.layer.liveOpacity')"
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
                      {{ state.isChoosingBackgroundImage.value ? t("settings.interface.background.layer.choosing") : t("common.actions.selectImage") }}
                    </SettingsFluentButton>
                    <SettingsFluentButton
                      v-if="c.isDraftWindowsWallpaper.value"
                      appearance="outline"
                      size="small"
                      type="button"
                      :disabled="state.isChoosingBackgroundImage.value"
                      @click="state.useDraftDesktopWallpaper"
                    >
                      {{ state.isChoosingBackgroundImage.value ? t("settings.interface.background.layer.syncing") : t("settings.interface.background.layer.refreshWallpaper") }}
                    </SettingsFluentButton>
                    <SettingsFluentButton
                      appearance="subtle"
                      size="small"
                      type="button"
                      :disabled="!state.draftBackgroundImagePath.value"
                      @click="state.clearDraftBackgroundImage"
                    >
                      {{ t("common.actions.restoreDefault") }}
                    </SettingsFluentButton>
                  </div>

                  <div v-if="c.doesDraftBackgroundUseImage.value" class="settings-background-control-row">
                    <span class="settings-acrylic-row-label">{{ t("settings.interface.background.layer.display") }}</span>
                    <div class="settings-segmented-control" :aria-label="t('settings.interface.background.layer.displayLabel')">
                      <button
                        v-for="item in c.backgroundImageLayoutOptions.value"
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
                  :aria-label="t('settings.interface.background.layer.preview')"
                  :background-base-color="state.draftBackgroundBaseColor.value"
                  :background-base-opacity="state.draftBackgroundBaseOpacity.value"
                  :background-image-layout="state.draftBackgroundImageLayout.value"
                  :background-image-opacity="state.draftBackgroundImageOpacity.value"
                  :background-image-pixel-size="c.draftBackgroundImagePixelSize.value"
                  :background-image-url="c.hasDraftBackgroundImagePreview.value ? state.draftBackgroundImageUrl.value : null"
                  :background-layout-context="state.backgroundLayoutContext.value"
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
              <span class="settings-list-title">{{ t("settings.interface.background.effect.title") }}</span>
              <span class="settings-list-description">{{ c.backgroundEffectHint.value }}</span>
            </span>
            <span class="settings-list-summary">{{ backgroundEffectSummary }}</span>
            <ChevronDownIcon :class="c.cx('settings-list-chevron', isBackgroundEffectExpanded && 'settings-list-chevron-open')" />
          </button>

          <Transition name="settings-expand">
            <div v-show="isBackgroundEffectExpanded" class="settings-list-expand-shell">
              <div class="settings-list-expand settings-background-expand">
                <div class="settings-background-detail">
                  <div class="settings-background-control-row">
                    <span class="settings-acrylic-row-label">{{ t("settings.interface.background.effect.effect") }}</span>
                    <div class="settings-segmented-control" :aria-label="t('settings.interface.background.effect.effectLabel')">
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_NONE && 'settings-segmented-button-active')"
                        :disabled="!c.canUseDraftBackgroundEffect(c.BACKGROUND_EFFECT_NONE)"
                        @click="state.setDraftBackgroundEffect(c.BACKGROUND_EFFECT_NONE)"
                      >
                        {{ t("settings.interface.background.effect.original") }}
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_DIMMED && 'settings-segmented-button-active')"
                        :disabled="!c.canUseDraftBackgroundEffect(c.BACKGROUND_EFFECT_DIMMED)"
                        @click="state.setDraftBackgroundEffect(c.BACKGROUND_EFFECT_DIMMED)"
                      >
                        {{ t("settings.interface.background.effect.dim") }}
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_BLUR && 'settings-segmented-button-active')"
                        :disabled="!c.canUseDraftBackgroundEffect(c.BACKGROUND_EFFECT_BLUR)"
                        @click="state.setDraftBackgroundEffect(c.BACKGROUND_EFFECT_BLUR)"
                      >
                        {{ t("settings.interface.background.effect.blur") }}
                      </button>
                      <button
                        type="button"
                        :class="c.cx('settings-segmented-button', state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_ACRYLIC && 'settings-segmented-button-active')"
                        :disabled="!c.canUseDraftBackgroundEffect(c.BACKGROUND_EFFECT_ACRYLIC)"
                        @click="state.setDraftBackgroundEffect(c.BACKGROUND_EFFECT_ACRYLIC)"
                      >
                        Acrylic
                      </button>
                    </div>
                  </div>

                  <label v-if="c.doesDraftBackgroundUseLayer.value && state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_BLUR" class="settings-opacity-control settings-background-inline-control">
                    <span>{{ t("settings.interface.background.effect.blurStrength") }}</span>
                    <SettingsSlider
                      :value="state.draftBackgroundBlurStrength.value"
                      :min="c.BACKGROUND_BLUR_STRENGTH_MIN"
                      :max="c.BACKGROUND_BLUR_STRENGTH_MAX"
                      :step="c.BACKGROUND_BLUR_STRENGTH_STEP"
                      :aria-label="t('settings.interface.background.effect.backgroundBlurStrength')"
                      @change="state.setDraftBackgroundBlurStrength($event)"
                    />
                    <span class="settings-opacity-value">{{ state.draftBackgroundBlurStrength.value }}%</span>
                  </label>

                  <label v-if="c.doesDraftBackgroundUseLayer.value && state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_DIMMED" class="settings-color-control">
                    <span>{{ t("settings.interface.background.effect.dimColor") }}</span>
                    <span class="settings-color-swatch">
                      <input
                        :value="state.draftBackgroundDarkenColor.value"
                        type="color"
                        :aria-label="t('settings.interface.background.effect.backgroundDimColor')"
                        autocomplete="off"
                        @input="state.setDraftBackgroundDarkenColor(readInputValue($event))"
                      />
                    </span>
                    <span class="settings-color-value">{{ state.draftBackgroundDarkenColor.value }}</span>
                  </label>

                  <label v-if="c.doesDraftBackgroundUseLayer.value && state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_DIMMED" class="settings-opacity-control settings-background-inline-control">
                    <span>{{ t("settings.interface.background.effect.dimStrength") }}</span>
                    <SettingsSlider
                      :value="state.draftBackgroundDarkenStrength.value"
                      :min="c.BACKGROUND_DARKEN_STRENGTH_MIN"
                      :max="c.BACKGROUND_DARKEN_STRENGTH_MAX"
                      :step="c.BACKGROUND_DARKEN_STRENGTH_STEP"
                      :aria-label="t('settings.interface.background.effect.backgroundDimStrength')"
                      @change="state.setDraftBackgroundDarkenStrength($event)"
                    />
                    <span class="settings-opacity-value">{{ state.draftBackgroundDarkenStrength.value }}%</span>
                  </label>

                  <div v-if="c.doesDraftBackgroundUseLayer.value && state.draftBackgroundEffect.value === c.BACKGROUND_EFFECT_ACRYLIC" class="settings-acrylic-controls">
                    <label class="settings-opacity-control">
                      <span>{{ t("settings.interface.background.effect.blurStrength") }}</span>
                      <SettingsSlider
                        :value="state.draftBackgroundAcrylicBlurStrength.value"
                        :min="c.BACKGROUND_BLUR_STRENGTH_MIN"
                        :max="c.BACKGROUND_BLUR_STRENGTH_MAX"
                        :step="c.BACKGROUND_BLUR_STRENGTH_STEP"
                        :aria-label="t('settings.interface.background.effect.acrylicBlurStrength')"
                        @change="state.setDraftBackgroundAcrylicBlurStrength($event)"
                      />
                      <span class="settings-opacity-value">{{ state.draftBackgroundAcrylicBlurStrength.value }}%</span>
                    </label>

                    <div class="settings-acrylic-row">
                      <span class="settings-acrylic-row-label">{{ t("settings.interface.background.effect.acrylicAppearance") }}</span>
                      <div class="settings-segmented-control" :aria-label="t('settings.interface.background.effect.acrylicAppearance')">
                        <button
                          type="button"
                          :class="c.cx('settings-segmented-button', state.draftBackgroundAcrylicAppearance.value === c.BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM && 'settings-segmented-button-active')"
                          @click="c.setDraftBackgroundAcrylicAppearance(c.BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM)"
                        >
                          {{ t("settings.interface.background.effect.system") }}
                        </button>
                        <button
                          type="button"
                          :class="c.cx('settings-segmented-button', state.draftBackgroundAcrylicAppearance.value === c.BACKGROUND_ACRYLIC_APPEARANCE_DARK && 'settings-segmented-button-active')"
                          @click="c.setDraftBackgroundAcrylicAppearance(c.BACKGROUND_ACRYLIC_APPEARANCE_DARK)"
                        >
                          {{ t("settings.interface.window.dark") }}
                        </button>
                        <button
                          type="button"
                          :class="c.cx('settings-segmented-button', state.draftBackgroundAcrylicAppearance.value === c.BACKGROUND_ACRYLIC_APPEARANCE_LIGHT && 'settings-segmented-button-active')"
                          @click="c.setDraftBackgroundAcrylicAppearance(c.BACKGROUND_ACRYLIC_APPEARANCE_LIGHT)"
                        >
                          {{ t("settings.interface.window.light") }}
                        </button>
                      </div>
                    </div>

                    <div class="settings-acrylic-row">
                      <span class="settings-acrylic-row-label">{{ t("settings.interface.background.effect.params") }}</span>
                      <div class="settings-segmented-control" :aria-label="t('settings.interface.background.effect.paramsLabel')">
                        <button
                          type="button"
                          :class="c.cx('settings-segmented-button', c.activeAcrylicParamsProfile.value === c.BACKGROUND_ACRYLIC_APPEARANCE_DARK && 'settings-segmented-button-active')"
                          @click="c.activeAcrylicParamsProfile.value = c.BACKGROUND_ACRYLIC_APPEARANCE_DARK"
                        >
                          {{ t("settings.interface.background.effect.darkParams") }}
                        </button>
                        <button
                          type="button"
                          :class="c.cx('settings-segmented-button', c.activeAcrylicParamsProfile.value === c.BACKGROUND_ACRYLIC_APPEARANCE_LIGHT && 'settings-segmented-button-active')"
                          @click="c.activeAcrylicParamsProfile.value = c.BACKGROUND_ACRYLIC_APPEARANCE_LIGHT"
                        >
                          {{ t("settings.interface.background.effect.lightParams") }}
                        </button>
                      </div>
                    </div>

                    <div class="settings-acrylic-params">
                      <label class="settings-color-control">
                        <span>{{ t("settings.interface.background.effect.tint") }}</span>
                        <span class="settings-color-swatch">
                          <input
                            :value="c.activeAcrylicTintColorHex.value"
                            type="color"
                            :aria-label="t('settings.interface.background.effect.acrylicTint')"
                            autocomplete="off"
                            @input="c.setActiveDraftBackgroundAcrylicParam('tintColor', readInputValue($event))"
                          />
                        </span>
                        <span class="settings-color-value">{{ c.activeAcrylicTintColorHex.value }}</span>
                      </label>

                      <label class="settings-opacity-control">
                        <span>{{ t("settings.interface.background.effect.tintStrength") }}</span>
                        <SettingsSlider
                          :value="c.activeAcrylicParams.value.tintStrength"
                          :min="c.ACRYLIC_TINT_STRENGTH_MIN"
                          :max="c.ACRYLIC_TINT_STRENGTH_MAX"
                          :step="c.ACRYLIC_PARAM_STEP"
                          :aria-label="t('settings.interface.background.effect.acrylicTintStrength')"
                          @change="c.setActiveDraftBackgroundAcrylicParam('tintStrength', $event)"
                        />
                        <span class="settings-opacity-value">{{ c.formatAcrylicPercent(c.activeAcrylicParams.value.tintStrength) }}</span>
                      </label>

                      <label class="settings-opacity-control">
                        <span>{{ t("settings.interface.background.effect.brightness") }}</span>
                        <SettingsSlider
                          :value="c.activeAcrylicParams.value.brightness"
                          :min="c.ACRYLIC_BRIGHTNESS_MIN"
                          :max="c.ACRYLIC_BRIGHTNESS_MAX"
                          :step="c.ACRYLIC_PARAM_STEP"
                          :aria-label="t('settings.interface.background.effect.acrylicBrightness')"
                          @change="c.setActiveDraftBackgroundAcrylicParam('brightness', $event)"
                        />
                        <span class="settings-opacity-value">{{ c.formatAcrylicPercent(c.activeAcrylicParams.value.brightness) }}</span>
                      </label>

                      <label class="settings-opacity-control">
                        <span>{{ t("settings.interface.background.effect.contrast") }}</span>
                        <SettingsSlider
                          :value="c.activeAcrylicParams.value.contrast"
                          :min="c.ACRYLIC_CONTRAST_MIN"
                          :max="c.ACRYLIC_CONTRAST_MAX"
                          :step="c.ACRYLIC_PARAM_STEP"
                          :aria-label="t('settings.interface.background.effect.acrylicContrast')"
                          @change="c.setActiveDraftBackgroundAcrylicParam('contrast', $event)"
                        />
                        <span class="settings-opacity-value">{{ c.formatAcrylicPercent(c.activeAcrylicParams.value.contrast) }}</span>
                      </label>

                      <label class="settings-opacity-control">
                        <span>{{ t("settings.interface.background.effect.saturation") }}</span>
                        <SettingsSlider
                          :value="c.activeAcrylicParams.value.saturation"
                          :min="c.ACRYLIC_SATURATION_MIN"
                          :max="c.ACRYLIC_SATURATION_MAX"
                          :step="c.ACRYLIC_PARAM_STEP"
                          :aria-label="t('settings.interface.background.effect.acrylicSaturation')"
                          @change="c.setActiveDraftBackgroundAcrylicParam('saturation', $event)"
                        />
                        <span class="settings-opacity-value">{{ c.formatAcrylicPercent(c.activeAcrylicParams.value.saturation) }}</span>
                      </label>

                      <SettingsFluentButton appearance="outline" type="button" @click="c.resetActiveDraftBackgroundAcrylicParams">
                        {{ t("common.actions.restoreDefault") }}
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
                  :background-layout-context="state.backgroundLayoutContext.value"
                  :empty-label="c.backgroundEffectPreviewLabel.value"
                />
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </section>

    <section class="settings-section settings-section-plain" :aria-label="t('settings.interface.layout.title')">
      <div class="settings-section-header">
        <div>
          <h3>{{ t("settings.interface.layout.title") }}</h3>
        </div>
      </div>

      <div class="settings-list settings-list-no-icons">
        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.interface.layout.desktop") }}</span>
            <span class="settings-list-description">{{ t("settings.interface.layout.desktopDescription") }}</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-grid-layout-control" :aria-label="t('settings.interface.layout.desktop')">
              <SettingsSpinButton
                v-model="state.draftRows.value"
                :ariaLabel="t('settings.interface.layout.desktopRows')"
                :decrease-label="t('settings.interface.layout.desktopRowsDecrease')"
                :increase-label="t('settings.interface.layout.desktopRowsIncrease')"
                name="desktopRows"
                :min="2"
                :max="8"
              />
              <span class="settings-grid-layout-separator">x</span>
              <SettingsSpinButton
                v-model="state.draftCols.value"
                :ariaLabel="t('settings.interface.layout.desktopCols')"
                :decrease-label="t('settings.interface.layout.desktopColsDecrease')"
                :increase-label="t('settings.interface.layout.desktopColsIncrease')"
                name="desktopCols"
                :min="3"
                :max="10"
              />
            </span>
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.interface.layout.folder") }}</span>
            <span class="settings-list-description">{{ t("settings.interface.layout.folderDescription") }}</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-grid-layout-control" :aria-label="t('settings.interface.layout.folder')">
              <SettingsSpinButton
                v-model="state.draftFolderRows.value"
                :ariaLabel="t('settings.interface.layout.folderRows')"
                :decrease-label="t('settings.interface.layout.folderRowsDecrease')"
                :increase-label="t('settings.interface.layout.folderRowsIncrease')"
                name="folderRows"
                :min="2"
                :max="6"
              />
              <span class="settings-grid-layout-separator">x</span>
              <SettingsSpinButton
                v-model="state.draftFolderCols.value"
                :ariaLabel="t('settings.interface.layout.folderCols')"
                :decrease-label="t('settings.interface.layout.folderColsDecrease')"
                :increase-label="t('settings.interface.layout.folderColsIncrease')"
                name="folderCols"
                :min="2"
                :max="8"
              />
            </span>
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.interface.layout.iconSize") }}</span>
            <span class="settings-list-description">{{ t("settings.interface.layout.iconSizeDescription") }}</span>
          </span>
          <span class="settings-list-control">
            <SettingsSpinButton
              v-model="state.draftIconSize.value"
              :ariaLabel="t('settings.interface.layout.iconSize')"
              :decrease-label="t('settings.interface.layout.iconSizeDecrease')"
              :increase-label="t('settings.interface.layout.iconSizeIncrease')"
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
            <span class="settings-list-title">{{ t("settings.interface.layout.folderIconSize") }}</span>
            <span class="settings-list-description">{{ t("settings.interface.layout.folderIconSizeDescription") }}</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-folder-icon-size-control">
              <span class="settings-segmented-control" :aria-label="t('settings.interface.layout.folderIconSizeMode')">
                <button
                  type="button"
                  :class="c.cx('settings-segmented-button', state.draftFolderIconSizeMode.value === 'global' && 'settings-segmented-button-active')"
                  @click="state.setDraftFolderIconSizeMode('global')"
                >
                  {{ t("settings.interface.layout.global") }}
                </button>
                <button
                  type="button"
                  :class="c.cx('settings-segmented-button', state.draftFolderIconSizeMode.value === 'custom' && 'settings-segmented-button-active')"
                  @click="state.setDraftFolderIconSizeMode('custom')"
                >
                  {{ t("settings.interface.layout.custom") }}
                </button>
              </span>
              <SettingsSpinButton
                v-if="state.draftFolderIconSizeMode.value === 'custom'"
                v-model="state.draftFolderIconSize.value"
                :ariaLabel="t('settings.interface.layout.folderIconSize')"
                :decrease-label="t('settings.interface.layout.folderIconSizeDecrease')"
                :increase-label="t('settings.interface.layout.folderIconSizeIncrease')"
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
            <span class="settings-list-title">{{ t("settings.interface.layout.textless") }}</span>
            <span class="settings-list-description">{{ t("settings.interface.layout.textlessDescription") }}</span>
          </span>
          <span class="settings-list-control">
            <fluent-switch
              :checked.prop="state.draftIsTextlessMode.value"
              name="textlessMode"
              :aria-label="t('settings.interface.layout.textless')"
              @change="state.draftIsTextlessMode.value = readControlChecked($event)"
            />
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.interface.layout.compact") }}</span>
            <span class="settings-list-description">{{ t("settings.interface.layout.compactDescription") }}</span>
          </span>
          <span class="settings-list-control">
            <SettingsFluentButton
              appearance="outline"
              type="button"
              :disabled="!!state.dragMeta.value"
              @click="state.confirmForceFillAllPages"
            >
              {{ t("settings.interface.layout.compactAction") }}
            </SettingsFluentButton>
          </span>
        </div>
      </div>
    </section>

    <section class="settings-section settings-section-plain" :aria-label="t('settings.interface.advanced.title')">
      <div class="settings-section-header">
        <div>
          <h3>{{ t("settings.interface.advanced.title") }}</h3>
        </div>
      </div>

      <div class="settings-list">
        <div class="settings-list-expandable">
          <button
            type="button"
            class="settings-list-row settings-list-row-button"
            :aria-expanded="isAdvancedExpanded"
            @click="isAdvancedExpanded = !isAdvancedExpanded"
          >
            <span class="settings-list-icon" aria-hidden="true">
              <SettingsIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">{{ t("settings.interface.advanced.options") }}</span>
              <span class="settings-list-description">{{ t("settings.interface.advanced.description") }}</span>
            </span>
            <ChevronDownIcon :class="c.cx('settings-list-chevron', isAdvancedExpanded && 'settings-list-chevron-open')" />
          </button>

          <Transition name="settings-expand">
            <div v-if="isAdvancedExpanded" class="settings-list-expand-shell">
              <div class="settings-list-expand">
                <label class="settings-toggle">
                  <span class="settings-field-copy">
                    <span class="settings-list-title">{{ t("settings.interface.advanced.overscan") }}</span>
                    <span class="settings-list-description settings-list-description-wrap">
                      {{ t("settings.interface.advanced.overscanDescription") }}
                    </span>
                  </span>
                  <fluent-switch
                    :checked.prop="state.draftFullscreenOverscanEnabled.value"
                    name="fullscreenOverscanEnabled"
                    :aria-label="t('settings.interface.advanced.overscan')"
                    @change="state.setDraftFullscreenOverscanEnabled(readControlChecked($event))"
                  />
                </label>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import BlurIcon from "~icons/fluent/blur-24-regular";
import ChevronDownIcon from "~icons/fluent/chevron-down-20-regular";
import ColorBackgroundIcon from "~icons/fluent/color-background-24-regular";
import DarkThemeIcon from "~icons/fluent/dark-theme-24-regular";
import ImageIcon from "~icons/fluent/image-24-regular";
import PaintBrushIcon from "~icons/fluent/paint-brush-24-regular";
import SettingsIcon from "~icons/fluent/settings-24-regular";
import WindowIcon from "~icons/fluent/window-24-regular";
import BackgroundEffectPreview from "../BackgroundEffectPreview.vue";
import BackgroundImagePreviewCanvas from "../BackgroundImagePreviewCanvas.vue";
import SettingsFluentButton from "./SettingsFluentButton.vue";
import SettingsSlider from "./SettingsSlider.vue";
import SettingsSpinButton from "./SettingsSpinButton.vue";
import type { useSettingsPanelModel } from "../../composables/useSettingsPanelModel.js";
import {
  normalizeWindowEffectAppearance,
  normalizeWindowEffectMaterial,
} from "../../composables/useLaunchpadSettingsConfig.js";
import { useLocalization } from "../../i18n/localization.js";

type InterfaceSettingsModel = ReturnType<typeof useSettingsPanelModel>["pages"]["interface"];

const props = defineProps<{ model: InterfaceSettingsModel }>();

const state = props.model;
const { t } = useLocalization();
const c = props.model;
const {
  backgroundEffectSummary,
  backgroundLayerSummary,
  windowEffectSummary,
} = props.model;
const isWindowModeSettingsExpanded = ref(false);
const isWindowMaterialExpanded = ref(false);
const isBackgroundLayerExpanded = ref(false);
const isBackgroundEffectExpanded = ref(false);
const isAdvancedExpanded = ref(false);

function readInputValue(event: Event): string {
  if (!(event.currentTarget instanceof HTMLInputElement)) {
    throw new TypeError("Interface settings input event currentTarget must be an input element");
  }
  return event.currentTarget.value;
}

function readControlChecked(event: Event): boolean {
  const target = event.currentTarget;
  if (!target || !("checked" in target) || typeof target.checked !== "boolean") {
    throw new TypeError("Interface settings control currentTarget must expose a boolean checked value");
  }
  return target.checked;
}
</script>
