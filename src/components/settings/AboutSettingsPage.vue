<template>
  <div class="settings-tab-panel" role="tabpanel" aria-label="关于">
    <section class="settings-section settings-section-plain" aria-label="关于">
      <div class="settings-list">
        <div class="settings-list-row">
          <span class="settings-about-mark" aria-hidden="true">LP</span>
          <span class="settings-list-copy">
            <span class="settings-list-title">LaunchPad</span>
            <span class="settings-list-description">桌面启动器</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-list-summary">版本 {{ state.appVersion }}</span>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
defineProps({
  backgroundLayoutContext: { type: Object, default: null },
  context: { type: Object, default: null },
  state: { type: Object, required: true },
});
</script>
