<template>
  <div class="settings-tab-panel" role="tabpanel" aria-label="通用">
    <section class="settings-section" aria-label="通用">
      <div class="settings-section-header">
        <div>
          <h3>通用</h3>
          <p>控制 LaunchPad 的启动入口和全局快捷键。</p>
        </div>
      </div>

      <div class="settings-options">
        <div class="settings-row settings-row-disabled">
          <span class="settings-option-copy">
            <span>开机自启</span>
            <span class="settings-field-hint">登录 Windows 后自动打开 LaunchPad</span>
          </span>
          <fluent-switch :disabled.prop="true" aria-label="开机自启" />
        </div>

        <div class="settings-row settings-row-stackable">
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
            <fluent-button
              appearance="outline"
              type="button"
              :disabled.prop="state.isApplyingSettingsConfig.value"
              @click="startMainWindowShortcutRecording"
            >
              {{ isRecordingMainWindowShortcut ? "录制中" : "录制" }}
            </fluent-button>
            <fluent-button
              appearance="subtle"
              type="button"
              :disabled.prop="state.isApplyingSettingsConfig.value"
              @click="resetMainWindowShortcut"
            >
              重置
            </fluent-button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import DismissIcon from "~icons/fluent/dismiss-16-regular";

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
