<template>
  <div class="settings-tab-panel" role="tabpanel" :aria-label="t('settings.about.title')">
    <section class="settings-section settings-section-plain" :aria-label="t('settings.about.title')">
      <div class="settings-list-row about-product-card">
        <img class="settings-about-mark" :src="appIconUrl" alt="" aria-hidden="true" />
        <span class="settings-list-copy">
          <span class="settings-list-title settings-about-name">{{ PRODUCT.name }}</span>
          <span class="settings-list-description">{{ t('settings.about.description') }}</span>
        </span>
        <div class="about-actions">
          <span class="settings-list-summary">{{ t('settings.about.version', { version: PRODUCT.version }) }}</span>
          <div class="about-buttons">
            <button class="about-check" :disabled="checking" @click="activateCheck">
              <span v-if="checking" class="about-progress" aria-hidden="true"></span>{{ buttonText }}
            </button>
            <a class="about-github" :href="PRODUCT.repositoryUrl" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path :d="githubPath" fill="currentColor" /></svg>GitHub
            </a>
          </div>
          <span v-if="status" role="status" aria-live="polite" class="about-status" :class="{ 'about-error': failed }">{{ status }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed,onBeforeUnmount,ref } from "vue";
import { launchpadIconUrls } from "../../assets/branding/launchpadIconUrls.js";
import { githubMarkSvg } from "../../assets/branding/githubMark.js";
import type { useSettingsPanelModel } from "../../composables/useSettingsPanelModel.js";
import { useLocalization } from "../../i18n/localization.js";
import { PRODUCT } from "../../platform/product.js";
import { createGitHubReleaseSource } from "../../platform/githubReleaseSource.js";
import { checkRelease,type ReleaseCheckResult } from "../../application/releaseCheck.js";

type AboutSettingsModel = ReturnType<typeof useSettingsPanelModel>["pages"]["about"];
const props = defineProps<{ model: AboutSettingsModel }>();
const { t } = useLocalization();
const appIconUrl = computed(() => launchpadIconUrls[props.model.draftLaunchpadIconVariant.value]);
const githubPath=githubMarkSvg.match(/ d="([^"]+)"/)![1];
const checking=ref(false),failed=ref(false),status=ref("");
const result=ref<ReleaseCheckResult|null>(null),source=createGitHubReleaseSource();
let controller:AbortController|null=null,disposed=false;
let timeout:ReturnType<typeof setTimeout>|undefined;
const buttonText=computed(()=>t(`settings.about.${checking.value?'checking':failed.value?'retry':result.value?.status==='available'?'viewRelease':'checkUpdates'}`));
async function activateCheck(){
  if(checking.value)return;
  if(result.value?.status==="available"){window.open(result.value.release.releaseUrl,"_blank","noopener,noreferrer");return;}
  checking.value=true;failed.value=false;status.value=t('settings.about.checkingDetail');controller=new AbortController();const active=controller;
  timeout=setTimeout(()=>active.abort(),10000);
  try{
    const next=await checkRelease(PRODUCT.version,source,active.signal);if(disposed)return;result.value=next;
    status.value=next.status==="available"?t('settings.about.updateAvailable',{version:next.release.version}):t(`settings.about.${next.status==='current'?'upToDate':'noRelease'}`);
  }catch{if(!disposed){failed.value=true;status.value=t('settings.about.checkFailed');}}
  finally{clearTimeout(timeout);controller=null;if(!disposed)checking.value=false;}
}
onBeforeUnmount(()=>{disposed=true;controller?.abort();clearTimeout(timeout);});
</script>

<style scoped>
.about-product-card { display:flex; flex-wrap:wrap; gap:16px; align-items:center; padding:24px 20px; }
.about-product-card .settings-list-copy { min-width:160px; }
.about-actions { display:flex; flex-direction:column; align-items:flex-end; gap:12px; margin-left:auto; }
.about-buttons { display:flex; gap:8px; }
.about-check,.about-github { height:32px; border-radius:4px; display:inline-flex; gap:8px; align-items:center; justify-content:center; padding:0 12px; font:inherit; font-size:13px; cursor:pointer; }
.about-check { min-width:150px; color:white; background:#0067c0; border:1px solid transparent; }
.about-check:hover { background:#1975c5; }.about-check:active { background:#005a9e; }.about-check:disabled { cursor:default; }
.about-github { color:inherit; background:var(--colorNeutralBackground1); border:1px solid var(--colorNeutralStroke1); text-decoration:none; }.about-github:hover { background:var(--colorNeutralBackground1Hover); }.about-github:active { background:var(--colorNeutralBackground1Pressed); }
.about-check:focus-visible,.about-github:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
.about-status { max-width:300px; font-size:12px; text-align:right; }.about-error { color:#c42b1c; }
.about-progress { width:12px; height:12px; border:2px solid rgba(255,255,255,.3); border-top-color:white; border-radius:50%; animation:about-spin .9s linear infinite; }
@keyframes about-spin { to { transform:rotate(360deg); } }
</style>
