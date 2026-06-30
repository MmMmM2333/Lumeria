<template>
  <div class="settings-tab-panel" role="tabpanel" aria-label="关于">
    <section class="settings-section" aria-label="关于">
      <div class="settings-section-header">
        <div>
          <h3>关于</h3>
          <p>当前应用版本和运行信息。</p>
        </div>
      </div>
      <div class="settings-about-card">
        <span class="settings-about-mark">LP</span>
        <span class="settings-about-copy">
          <span class="settings-about-name">LaunchPad</span>
          <span class="settings-about-version">版本 {{ state.appVersion }}</span>
        </span>
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
