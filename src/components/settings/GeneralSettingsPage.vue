<template>
  <div class="settings-tab-panel" role="tabpanel" aria-label="通用">
    <section class="settings-section settings-section-plain" aria-label="通用">
      <div class="settings-list">
        <div class="settings-list-row settings-row-disabled">
          <span class="settings-list-icon" aria-hidden="true">
            <PowerIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">开机自启</span>
            <span class="settings-list-description">登录 Windows 后自动打开 LaunchPad</span>
          </span>
          <span class="settings-list-control">
            <fluent-switch :disabled.prop="true" aria-label="开机自启" />
          </span>
        </div>

        <div class="settings-list-row">
          <span class="settings-list-icon" aria-hidden="true">
            <KeyboardIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">快捷键</span>
            <span class="settings-list-description">{{ mainWindowShortcutHint }}</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-hotkey-control">
              <span :class="cx('settings-hotkey-input', state.draftMainWindowShortcut.value === null && 'settings-hotkey-input-empty')">
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
              </span>
              <SettingsFluentButton
                appearance="outline"
                type="button"
                :disabled="state.isApplyingSettingsConfig.value"
                @click="startMainWindowShortcutRecording"
              >
                {{ isRecordingMainWindowShortcut ? "录制中" : "录制" }}
              </SettingsFluentButton>
              <SettingsFluentButton
                appearance="subtle"
                type="button"
                :disabled="state.isApplyingSettingsConfig.value"
                @click="resetMainWindowShortcut"
              >
                重置
              </SettingsFluentButton>
            </span>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import KeyboardIcon from "~icons/fluent/keyboard-24-regular";
import PowerIcon from "~icons/fluent/power-24-regular";
import SettingsFluentButton from "./SettingsFluentButton.vue";

const props = defineProps({
  backgroundLayoutContext: { type: Object, default: null },
  context: { type: Object, required: true },
  state: { type: Object, required: true },
});

const {
  clearMainWindowShortcut,
  cx,
  isRecordingMainWindowShortcut,
  mainWindowShortcutHint,
  mainWindowShortcutLabel,
  resetMainWindowShortcut,
  startMainWindowShortcutRecording,
} = props.context;
</script>
