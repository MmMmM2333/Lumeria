<template>
  <div class="settings-tab-panel" role="tabpanel" :aria-label="t('settings.about.title')">
    <section class="settings-section settings-section-plain" :aria-label="t('settings.about.title')">
      <div class="settings-list">
        <div class="settings-list-row settings-about-row">
          <img class="settings-about-mark" :src="appIconUrl" alt="" aria-hidden="true" />
          <span class="settings-list-copy">
            <span class="settings-list-title settings-about-name">Lumeria</span>
            <span class="settings-list-description settings-about-description">{{ t("settings.about.description") }}</span>
          </span>
          <span class="settings-list-control">
            <span class="settings-list-summary settings-about-version">{{ t("settings.about.version", { version: model.appVersion }) }}</span>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { launchpadIconUrls } from "../../assets/branding/launchpadIconUrls.js";
import type { useSettingsPanelModel } from "../../composables/useSettingsPanelModel.js";
import { useLocalization } from "../../i18n/localization.js";

type AboutSettingsModel = ReturnType<typeof useSettingsPanelModel>["pages"]["about"];

const props = defineProps<{ model: AboutSettingsModel }>();
const { t } = useLocalization();
const appIconUrl = computed(() => launchpadIconUrls[props.model.draftLaunchpadIconVariant.value]);
</script>
