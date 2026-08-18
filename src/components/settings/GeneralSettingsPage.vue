<template>
  <div class="settings-tab-panel" role="tabpanel" :aria-label="t('settings.general.title')">
    <section class="settings-section settings-section-plain" :aria-label="t('settings.general.title')">
      <div class="settings-list">
        <div :class="model.cx(
          'settings-list-row',
          (!model.canConfigureLaunchAtLogin.value || model.isRefreshingLaunchAtLogin.value) && 'settings-row-disabled',
        )">
          <span class="settings-list-icon" aria-hidden="true">
            <PowerIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.general.startup.title") }}</span>
            <span class="settings-list-description" aria-live="polite">{{ model.launchAtLoginHint.value }}</span>
          </span>
          <span class="settings-list-control">
            <fluent-switch
              :checked.prop="model.draftLaunchAtLogin.value"
              :disabled.prop="model.isApplyingSettingsConfig.value || model.isRefreshingLaunchAtLogin.value || !model.canConfigureLaunchAtLogin.value"
              :aria-label="t('settings.general.startup.title')"
              @change="model.actions.setLaunchAtLogin($event.target.checked)"
            />
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-icon" aria-hidden="true">
            <KeyboardIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.general.shortcut.title") }}</span>
            <span class="settings-list-description">{{ model.mainWindowShortcutHint.value }}</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-hotkey-control">
              <span :class="model.cx('settings-hotkey-input', model.draftMainWindowShortcut.value === null && 'settings-hotkey-input-empty')">
                <kbd>{{ model.mainWindowShortcutLabel.value }}</kbd>
                <button
                  v-if="model.draftMainWindowShortcut.value !== null"
                  class="settings-hotkey-clear-button"
                  type="button"
                  :aria-label="t('settings.general.shortcut.disable')"
                  :disabled="model.isApplyingSettingsConfig.value"
                  @click="model.actions.clearShortcut"
                >
                  <DismissIcon class="settings-hotkey-clear-icon" />
                </button>
              </span>
              <SettingsFluentButton
                appearance="outline"
                type="button"
                :disabled="model.isApplyingSettingsConfig.value"
                @click="model.actions.startShortcutRecording"
              >
                {{ model.isRecordingMainWindowShortcut.value ? t("settings.general.shortcut.recording") : t("settings.general.shortcut.record") }}
              </SettingsFluentButton>
              <SettingsFluentButton
                appearance="outline"
                type="button"
                :disabled="model.isApplyingSettingsConfig.value || !model.canResetMainWindowShortcut.value"
                @click="model.actions.resetShortcut"
              >
                {{ t("common.actions.reset") }}
              </SettingsFluentButton>
            </span>
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-icon settings-language-icon" aria-hidden="true">
            <LocalLanguageIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.general.language.title") }}</span>
            <span v-if="model.localePreferenceError.value" class="settings-field-error" role="alert">{{ model.localePreferenceError.value }}</span>
          </span>
          <span class="settings-list-control">
            <span id="settings-language-select-label" class="settings-visually-hidden">
              {{ t("settings.general.language.select") }}
            </span>
            <fluent-dropdown
              ref="languageDropdownRef"
              class="settings-language-dropdown"
              appearance="outline"
              :disabled.prop="model.isApplyingSettingsConfig.value"
              @change="model.actions.setLocalePreference($event.currentTarget.value)"
            >
              <fluent-listbox class="settings-language-listbox" role="listbox">
                <fluent-option
                  v-for="option in languageOptions"
                  :key="option.value"
                  class="settings-language-option"
                  role="option"
                  :value.attr="option.value"
                  :selected.attr="option.value === model.draftLocalePreference.value ? '' : null"
                  :aria-selected="option.value === model.draftLocalePreference.value ? 'true' : 'false'"
                >
                  <span slot="checked-indicator" class="settings-language-native-indicator" aria-hidden="true" />
                  <span slot="start" class="settings-language-selection-indicator" aria-hidden="true" />
                  {{ option.label }}
                </fluent-option>
              </fluent-listbox>
            </fluent-dropdown>
          </span>
        </div>

        <div class="settings-list-expandable">
          <button
            type="button"
            class="settings-list-row settings-list-row-button"
            :aria-expanded="isLaunchpadIconExpanded"
            @click="isLaunchpadIconExpanded = !isLaunchpadIconExpanded"
          >
            <span class="settings-list-icon" aria-hidden="true">
              <RocketIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">{{ t("settings.general.launchpadIcon.title") }}</span>
              <span class="settings-list-description settings-list-description-wrap">{{ t("settings.general.launchpadIcon.description") }}</span>
              <span v-if="model.launchpadIconError.value" class="settings-field-error" role="alert">{{ model.launchpadIconError.value }}</span>
            </span>
            <span class="settings-list-summary">{{ activeLaunchpadIconOption?.label }}</span>
            <ChevronDownIcon :class="model.cx('settings-list-chevron', isLaunchpadIconExpanded && 'settings-list-chevron-open')" />
          </button>

          <Transition name="settings-expand">
            <div v-if="isLaunchpadIconExpanded" class="settings-list-expand-shell">
              <div class="settings-list-expand">
                <div class="settings-launchpad-icon-options" role="radiogroup" :aria-label="t('settings.general.launchpadIcon.title')">
                  <button
                    v-for="option in model.launchpadIconOptions.value"
                    :key="option.value"
                    type="button"
                    role="radio"
                    :class="model.cx(
                      'settings-launchpad-icon-option',
                      option.value === model.draftLaunchpadIconVariant.value && 'settings-launchpad-icon-option-active',
                    )"
                    :aria-label="option.label"
                    :aria-checked="option.value === model.draftLaunchpadIconVariant.value ? 'true' : 'false'"
                    :disabled="model.isApplyingSettingsConfig.value || !model.canCustomizeLaunchpadIcon.value"
                    @click="model.actions.setLaunchpadIconVariant(option.value)"
                  >
                    <img
                      class="settings-launchpad-icon-preview"
                      :src="launchpadIconPreviewUrls[option.value]"
                      alt=""
                      draggable="false"
                    />
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </section>

    <section class="settings-section settings-section-plain" :aria-label="t('settings.general.advanced.title')">
      <header class="settings-section-header">
        <div>
          <h3>{{ t("settings.general.advanced.title") }}</h3>
        </div>
      </header>

      <div class="settings-list">
        <div class="settings-list-row">
          <span class="settings-list-icon" aria-hidden="true">
            <WindowDevToolsIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">{{ t("settings.general.advanced.developerConsole") }}</span>
            <span class="settings-list-description" aria-live="polite">{{ model.developerConsoleHint.value }}</span>
          </span>
          <span class="settings-list-control">
            <SettingsFluentButton
              appearance="outline"
              type="button"
              :disabled="!model.canOpenDeveloperConsole.value || model.isOpeningDeveloperConsole.value"
              @click="model.actions.openDeveloperConsole"
            >
              {{ model.isOpeningDeveloperConsole.value ? t("settings.general.advanced.opening") : t("settings.general.advanced.open") }}
            </SettingsFluentButton>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ChevronDownIcon from "~icons/fluent/chevron-down-20-regular";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import KeyboardIcon from "~icons/fluent/keyboard-24-regular";
import LocalLanguageIcon from "~icons/fluent/local-language-24-regular";
import PowerIcon from "~icons/fluent/power-24-regular";
import RocketIcon from "~icons/fluent/rocket-24-regular";
import WindowDevToolsIcon from "~icons/fluent/window-dev-tools-24-regular";
import { launchpadIconUrls as launchpadIconPreviewUrls } from "../../assets/branding/launchpadIconUrls.js";
import SettingsFluentButton from "./SettingsFluentButton.vue";
import { useLocalization } from "../../i18n/localization.js";

const props = defineProps({ model: { type: Object, required: true } });
const model = props.model;
const localization = useLocalization();
const { availableLocales, t } = localization;
const languageDropdownRef = ref(null);
const isLaunchpadIconExpanded = ref(false);
let languageDropdownControlObserver = null;
const languageOptions = computed(() => [
  { value: "system", label: t("settings.general.language.system") },
  ...availableLocales.map((locale) => ({ value: locale.locale, label: locale.displayName })),
]);
const activeLaunchpadIconOption = computed(() => (
  model.launchpadIconOptions.value.find((option) => option.value === model.draftLaunchpadIconVariant.value)
  || model.launchpadIconOptions.value[0]
));

onMounted(() => {
  const dropdown = languageDropdownRef.value;
  if (!dropdown) throw new Error("Language dropdown failed to mount");
  if (labelLanguageDropdownControl(dropdown)) return;

  languageDropdownControlObserver = new MutationObserver(() => {
    if (!labelLanguageDropdownControl(dropdown)) return;
    languageDropdownControlObserver?.disconnect();
    languageDropdownControlObserver = null;
  });
  languageDropdownControlObserver.observe(dropdown, { childList: true });
});

onBeforeUnmount(() => {
  languageDropdownControlObserver?.disconnect();
});

function labelLanguageDropdownControl(dropdown) {
  const control = dropdown.querySelector("[slot='control']");
  if (!control) return false;
  control.setAttribute("aria-labelledby", "settings-language-select-label");
  return true;
}
</script>
