<template>
  <div class="settings-tab-panel" role="tabpanel" :aria-label="t('settings.about.title')">
    <section class="settings-section settings-section-plain" :aria-label="t('settings.about.title')">
      <div class="settings-list">
        <div class="settings-list-row">
          <span class="settings-about-mark" aria-hidden="true">L</span>
          <span class="settings-list-copy">
            <span class="settings-list-title">Lumeria</span>
            <span class="settings-list-description">{{ t("settings.about.description") }}</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-list-summary">{{ t("settings.about.version", { version: model.appVersion }) }}</span>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useLocalization } from "../../i18n/localization.js";

defineProps({ model: { type: Object, required: true } });
const { t } = useLocalization();
</script>
