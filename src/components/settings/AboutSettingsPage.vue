<template>
  <div class="settings-tab-panel" role="tabpanel" aria-label="关于">
    <section class="settings-section settings-section-plain" aria-label="关于">
      <div class="settings-list">
        <div class="settings-list-row">
          <span class="settings-about-mark" aria-hidden="true">L</span>
          <span class="settings-list-copy">
            <span class="settings-list-title">Lumeria</span>
            <span class="settings-list-description">Windows 应用启动台</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-list-summary">版本 {{ model.appVersion }}</span>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
defineProps({ model: { type: Object, required: true } });
</script>
