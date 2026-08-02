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
            <span class="settings-list-description">登录 Windows 后自动打开 Lumeria</span>
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
                  aria-label="关闭快捷键"
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
                {{ model.isRecordingMainWindowShortcut.value ? "录制中" : "录制" }}
              </SettingsFluentButton>
              <SettingsFluentButton
                appearance="subtle"
                type="button"
                :disabled="model.isApplyingSettingsConfig.value"
                @click="model.actions.resetShortcut"
              >
                重置
              </SettingsFluentButton>
            </span>
          </span>
        </div>
      </div>
    </section>

    <section class="settings-section settings-section-plain" aria-label="高级选项">
      <header class="settings-section-header">
        <div>
          <h3>高级选项</h3>
        </div>
      </header>

      <div class="settings-list">
        <div class="settings-list-row">
          <span class="settings-list-icon" aria-hidden="true">
            <WindowDevToolsIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">开发者控制台</span>
            <span class="settings-list-description" aria-live="polite">{{ model.developerConsoleHint.value }}</span>
          </span>
          <span class="settings-list-control">
            <SettingsFluentButton
              appearance="outline"
              type="button"
              :disabled="!model.canOpenDeveloperConsole.value || model.isOpeningDeveloperConsole.value"
              @click="model.actions.openDeveloperConsole"
            >
              {{ model.isOpeningDeveloperConsole.value ? "正在打开" : "打开控制台" }}
            </SettingsFluentButton>
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
import WindowDevToolsIcon from "~icons/fluent/window-dev-tools-24-regular";
import SettingsFluentButton from "./SettingsFluentButton.vue";

defineProps({ model: { type: Object, required: true } });
</script>
