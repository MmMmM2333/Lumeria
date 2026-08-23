import { computed, ref } from "vue";
import type { BackgroundLayoutContext } from "../api/launchpadApi.js";
import {
  normalizeAppearancePreference,
} from "../domain/appearancePreference.js";
import type { AppearancePreference } from "../domain/appearancePreference.js";
import { normalizeLaunchpadIconVariant } from "../domain/launchpadIconVariant.js";
import { normalizeMainWindowShortcut } from "../domain/mainWindowShortcut.js";
import { normalizeLocalePreference } from "../i18n/locale.js";
import { createLocalization } from "../i18n/localization.js";
import { useSettingsPanelModel } from "./useSettingsPanelModel.js";
import type { SettingsPanelCapabilities } from "./useSettingsPanelModel.js";

type AcrylicParams = SettingsPanelCapabilities["draftBackgroundAcrylicDarkParams"]["value"];
type EditorAppInput = Parameters<SettingsPanelCapabilities["editorModel"]["actions"]["openEdit"]>[0];
type EditorSession = SettingsPanelCapabilities["editorModel"]["session"]["value"];
type ManagedApp = SettingsPanelCapabilities["managedApps"]["value"][number];

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${field} must be a finite number`);
  return number;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  return value;
}

function createDarkAcrylicParams(): AcrylicParams {
  return {
    brightness: 0.8,
    contrast: 0.85,
    noise: 0.005,
    saturation: 1.5,
    seed: 0,
    tintColor: [0.235, 0.235, 0.235],
    tintStrength: 0.2,
  };
}

function createLightAcrylicParams(): AcrylicParams {
  return {
    brightness: 1,
    contrast: 0.85,
    noise: 0.005,
    saturation: 1.5,
    seed: 0,
    tintColor: [0.459, 0.459, 0.459],
    tintStrength: 0.2,
  };
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`[Settings panel model test failed] ${message}`);
}

function requirePresent<Value>(value: Value | null | undefined, message: string): Value {
  if (value == null) throw new Error(`[Settings panel model test failed] ${message}`);
  return value;
}

function createCapabilities() {
  const draftMainWindowShortcut = ref<string | null>("control+alt+KeyL");
  const draftLaunchpadIconVariant = ref<SettingsPanelCapabilities["draftLaunchpadIconVariant"]["value"]>("light");
  const draftLocalePreference = ref("system");
  const draftSettingsThemePreference = ref<SettingsPanelCapabilities["draftSettingsThemePreference"]["value"]>("system");
  const draftWindowEffectAppearance = ref<SettingsPanelCapabilities["draftWindowEffectAppearance"]["value"]>("dark");
  const draftWindowEffectMaterial = ref<SettingsPanelCapabilities["draftWindowEffectMaterial"]["value"]>("none");
  const localePreferenceError = ref("");
  const launchpadIconError = ref("");
  const mainWindowShortcutError = ref("");
  const draftLaunchAtLogin = ref(false);
  const isRefreshingLaunchAtLogin = ref(false);
  const launchAtLoginError = ref("");
  const isChoosingBackgroundImage = ref(false);
  const draftBackgroundAcrylicAppearance = ref<SettingsPanelCapabilities["draftBackgroundAcrylicAppearance"]["value"]>("system");
  const draftBackgroundAcrylicBlurStrength = ref(32);
  const draftBackgroundAcrylicDarkParams = ref<AcrylicParams>(createDarkAcrylicParams());
  const draftBackgroundAcrylicLightParams = ref<AcrylicParams>(createLightAcrylicParams());
  const draftBackgroundBaseColor = ref("#202020");
  const draftBackgroundBaseOpacity = ref(28);
  const draftBackgroundBlurStrength = ref(24);
  const draftBackgroundDarkenColor = ref("#1c1c1c");
  const draftBackgroundDarkenStrength = ref(30);
  const draftBackgroundEffect = ref<SettingsPanelCapabilities["draftBackgroundEffect"]["value"]>("none");
  const draftBackgroundImageLayout = ref<SettingsPanelCapabilities["draftBackgroundImageLayout"]["value"]>("fill");
  const draftBackgroundImageOpacity = ref(100);
  const draftBackgroundImagePath = ref<string | null>(null);
  const draftBackgroundImageUrl = ref<string | null>(null);
  const draftBackgroundLiveDesktopOpacity = ref(100);
  const draftBackgroundSource = ref<SettingsPanelCapabilities["draftBackgroundSource"]["value"]>("systemMaterial");
  const draftCols = ref(7);
  const draftFolderCols = ref(4);
  const draftFolderIconSize = ref(64);
  const draftFolderIconSizeMode = ref<SettingsPanelCapabilities["draftFolderIconSizeMode"]["value"]>("global");
  const draftFolderRows = ref(3);
  const draftFullscreenOverscanEnabled = ref(false);
  const draftIconSize = ref(64);
  const draftIsTextlessMode = ref(false);
  const draftRows = ref(4);
  const draftShowCustomTitlebar = ref(true);
  const draftWindowMode = ref<SettingsPanelCapabilities["draftWindowMode"]["value"]>("fullscreen");
  const isSettingsPanelOpen = ref(true);

  const appManagerSearchQuery = ref("");
  const appManagerSelectedIds = ref<string[]>([]);
  const managedAppState = ref<ManagedApp[]>([
    {
      id: "catalog-terminal",
      type: "app",
      name: "Terminal",
      origin: "catalog",
      launchTarget: { kind: "executable", path: "C:/Tools/terminal.exe" },
    },
  ]);
  const managedApps = computed(() => managedAppState.value);
  const filteredManagedApps = computed(() => {
    const query = appManagerSearchQuery.value.trim().toLocaleLowerCase();
    return query
      ? managedAppState.value.filter((app) => app.name.toLocaleLowerCase().includes(query))
      : managedAppState.value;
  });
  const selectedManagedAppCount = computed(() => appManagerSelectedIds.value.length);
  const canBrowseScanRoots = computed(() => true);
  const canScanManagedApps = computed(() => true);
  const isScanningApps = ref(false);
  const newScanKeyword = ref("");
  const scanKeywordBlacklist = ref<SettingsPanelCapabilities["scanKeywordBlacklist"]["value"]>([]);
  const scanRoots = ref<SettingsPanelCapabilities["scanRoots"]["value"]>([]);
  const scanAppBlacklist = ref<SettingsPanelCapabilities["scanAppBlacklist"]["value"]>([
    { name: "Blocked Tool", catalogId: "catalog-blocked-tool" },
    { name: "Hidden Editor", catalogId: "catalog-hidden-editor" },
  ]);
  const excludedScanApps = ref<SettingsPanelCapabilities["excludedScanApps"]["value"]>([
    { name: "Blocked Tool", catalogId: "catalog-blocked-tool", iconUrl: "http://asset.localhost/blocked.png" },
    { name: "Hidden Editor", catalogId: "catalog-hidden-editor" },
  ]);
  const showMissingLaunchTargetBadge = ref(true);
  const browsingScanRootId = ref<string | null>(null);

  const editorApp = ref<ManagedApp | null>(null);
  const editorArgs = ref("");
  const editorIconDataUrl = ref<string | null>(null);
  const editorIconPath = ref<string | null>(null);
  const editorIsBrowsingTarget = ref(false);
  const editorIsIconReset = ref(false);
  const editorName = ref("");
  const editorSession = ref<EditorSession>(null);
  const editorTarget = ref("");
  const editorModel = Object.freeze({
    app: computed(() => editorApp.value),
    args: editorArgs,
    canBrowseTarget: computed(() => !editorIsBrowsingTarget.value),
    canEditArgs: computed(() => editorSession.value?.originalTargetKind !== "appUserModelId"),
    canSave: computed(() => Boolean(editorName.value.trim() && editorTarget.value.trim())),
    glyph: computed(() => editorName.value.trim().charAt(0).toLocaleUpperCase() || "A"),
    iconDataUrl: editorIconDataUrl,
    iconPath: editorIconPath,
    isBrowsingTarget: editorIsBrowsingTarget,
    isIconReset: editorIsIconReset,
    isOpen: computed(() => editorSession.value !== null),
    mode: computed(() => editorSession.value?.mode ?? null),
    name: editorName,
    session: editorSession,
    target: editorTarget,
    targetReadOnly: computed(() => editorSession.value?.originalTargetKind === "appUserModelId"),
    actions: Object.freeze({
      browseTarget: async () => {
        editorIsBrowsingTarget.value = true;
        editorTarget.value = "C:/Tools/selected.exe";
        editorIsBrowsingTarget.value = false;
      },
      cancel: () => {
        editorSession.value = null;
        editorApp.value = null;
      },
      openCreate: () => {
        editorApp.value = null;
        editorName.value = "";
        editorTarget.value = "";
        editorSession.value = { mode: "create", originalAppId: null, originalTargetKind: null };
      },
      openEdit: (app: EditorAppInput) => {
        if (!app) return;
        editorApp.value = app.origin
          ? { id: app.id, name: app.name, origin: app.origin, type: "app" }
          : { id: app.id, name: app.name, type: "app" };
        editorName.value = app.name;
        editorTarget.value = app.launchTarget?.path || app.launchTarget?.appUserModelId || "";
        editorSession.value = {
          mode: "edit",
          originalAppId: app.id,
          originalTargetKind: app.launchTarget?.kind ?? null,
        };
      },
      openIconChooser: () => {
        editorIsIconReset.value = false;
      },
      resetIcon: () => {
        editorIconDataUrl.value = null;
        editorIconPath.value = null;
        editorIsIconReset.value = true;
      },
      save: () => Boolean(editorName.value.trim() && editorTarget.value.trim()),
    }),
  }) satisfies SettingsPanelCapabilities["editorModel"];

  const canExcludeSelectedManagedAppsFromScan = computed(() => (
    appManagerSelectedIds.value.length > 0
    && appManagerSelectedIds.value.every((id) => {
      const app = managedAppState.value.find((candidate) => candidate.id === id);
      return app?.origin === "catalog";
    })
  ));
  const capabilities = {
    addScanKeywordBlacklistItem: () => {
      const keyword = newScanKeyword.value.trim();
      if (!keyword || scanKeywordBlacklist.value.includes(keyword)) return;
      scanKeywordBlacklist.value = [...scanKeywordBlacklist.value, keyword];
      newScanKeyword.value = "";
    },
    addScanRoot: () => {
      const index = scanRoots.value.length + 1;
      scanRoots.value = [...scanRoots.value, {
        enabled: true,
        id: `test-root-${index}`,
        label: `Test Root ${index}`,
        path: `C:/Test/Root-${index}`,
        removable: true,
        type: "customDirectory",
      }];
    },
    appManagerSearchQuery,
    appManagerSelectedIds,
    applySettingsConfig: async () => ({ ok: true }),
    browseScanRootDirectory: async (rootId) => {
      if (!scanRoots.value.some((root) => root.id === rootId)) {
        throw new Error(`Unknown scan root: ${rootId}`);
      }
      browsingScanRootId.value = rootId;
      browsingScanRootId.value = null;
    },
    canBrowseScanRoots,
    cancelScanAppExclusion: (index) => {
      if (!Number.isInteger(index) || index < 0 || index >= scanAppBlacklist.value.length) return false;
      const removed = scanAppBlacklist.value[index];
      scanAppBlacklist.value = scanAppBlacklist.value.filter((_, itemIndex) => itemIndex !== index);
      if (removed) {
        excludedScanApps.value = excludedScanApps.value.filter((app) => app.catalogId !== removed.catalogId);
      }
      return true;
    },
    cancelScanAppExclusions: (indices) => {
      if (!indices?.length) return false;
      const validIndices = new Set<number>();
      for (const index of indices) {
        if (typeof index === "number" && Number.isInteger(index) && index >= 0) validIndices.add(index);
      }
      if (!validIndices.size) return false;
      const removedIds = new Set(
        scanAppBlacklist.value
          .filter((_, index) => validIndices.has(index))
          .map((app) => app.catalogId),
      );
      scanAppBlacklist.value = scanAppBlacklist.value.filter((_, index) => !validIndices.has(index));
      excludedScanApps.value = excludedScanApps.value.filter((app) => !removedIds.has(app.catalogId));
      return true;
    },
    canConfigureLaunchAtLogin: ref(true),
    canCustomizeLaunchpadIcon: ref(true),
    canExcludeManagedAppFromScan: (app) => app.origin === "catalog" && app.id.trim().length > 0,
    canExcludeSelectedManagedAppsFromScan,
    canScanManagedApps,
    canUseDraftBackgroundEffect: (effect) => (
      effect === "none" || effect === "dimmed" || effect === "blur" || effect === "acrylicWebgl"
    ),
    canUseLiveDesktopBackground: () => false,
    canUseLiveDesktopBackgroundEffect: () => false,
    canUseWindowEffectMaterial: (material) => (
      material === "none" || material === "acrylic" || material === "mica" || material === "micaAlt"
    ),
    changeScanRootLabel: (rootId, label) => {
      const nextLabel = requireString(label, "scan root label");
      scanRoots.value = scanRoots.value.map((root) => root.id === rootId ? { ...root, label: nextLabel } : root);
    },
    changeScanRootPath: (rootId, path) => {
      const nextPath = requireString(path, "scan root path");
      scanRoots.value = scanRoots.value.map((root) => root.id === rootId ? { ...root, path: nextPath } : root);
    },
    chooseDraftBackgroundImage: async () => {
      isChoosingBackgroundImage.value = true;
      const imagePath = "C:/Images/test-background.png";
      draftBackgroundImagePath.value = imagePath;
      draftBackgroundImageUrl.value = "http://asset.localhost/test-background.png";
      draftBackgroundSource.value = "customImage";
      isChoosingBackgroundImage.value = false;
      return { ok: true, imagePath };
    },
    clearDraftBackgroundImage: () => {
      draftBackgroundImagePath.value = null;
      draftBackgroundImageUrl.value = null;
      draftBackgroundSource.value = "systemMaterial";
    },
    clearManagedAppSelection: () => {
      appManagerSelectedIds.value = [];
    },
    closeSettingsPanel: () => {
      isSettingsPanelOpen.value = false;
    },
    confirmForceFillAllPages: () => {},
    confirmResetScanRoots: () => {
      scanRoots.value = [];
    },
    draftBackgroundAcrylicAppearance,
    draftBackgroundAcrylicBlurStrength,
    draftBackgroundAcrylicDarkParams,
    draftBackgroundAcrylicLightParams,
    draftBackgroundBaseColor,
    draftBackgroundBaseOpacity,
    draftBackgroundBlurStrength,
    draftBackgroundDarkenColor,
    draftBackgroundDarkenStrength,
    draftBackgroundEffect,
    draftBackgroundImageLayout,
    draftBackgroundImageOpacity,
    draftBackgroundImagePath,
    draftBackgroundImageUrl,
    draftBackgroundLiveDesktopOpacity,
    draftBackgroundSource,
    draftCols,
    draftFolderCols,
    draftFolderIconSize,
    draftFolderIconSizeMode,
    draftFolderRows,
    draftFullscreenOverscanEnabled,
    draftIconSize,
    draftIsTextlessMode,
    draftLaunchAtLogin,
    draftLaunchpadIconVariant,
    draftLocalePreference,
    draftMainWindowShortcut,
    draftRows,
    draftSettingsThemePreference,
    draftShowCustomTitlebar,
    draftWindowEffectAppearance,
    draftWindowEffectMaterial,
    draftWindowMode,
    dragMeta: ref(null),
    editorModel,
    excludeManagedAppFromScan: (app) => {
      if (app.origin !== "catalog" || !app.id.trim()) return false;
      if (!scanAppBlacklist.value.some((blocked) => blocked.catalogId === app.id)) {
        scanAppBlacklist.value = [...scanAppBlacklist.value, { catalogId: app.id, name: app.name }];
      }
      return true;
    },
    excludeSelectedManagedAppsFromScan: () => {
      const selectedApps = managedAppState.value.filter((app) => appManagerSelectedIds.value.includes(app.id));
      if (!selectedApps.length || selectedApps.some((app) => app.origin !== "catalog")) return false;
      for (const app of selectedApps) {
        if (!scanAppBlacklist.value.some((blocked) => blocked.catalogId === app.id)) {
          scanAppBlacklist.value = [...scanAppBlacklist.value, { catalogId: app.id, name: app.name }];
        }
      }
      return true;
    },
    excludedScanApps,
    filteredManagedApps,
    getLaunchTargetPath: (app) => app?.launchTarget?.path || app?.launchTarget?.appUserModelId || "",
    isApplyingSettingsConfig: ref(false),
    isBrowsingScanRoot: (rootId) => browsingScanRootId.value === rootId,
    isChoosingBackgroundImage,
    isRefreshingLaunchAtLogin,
    isScanningApps,
    isSettingsPanelOpen,
    launchAtLoginError,
    launchpadIconError,
    localePreferenceError,
    mainWindowShortcutError,
    managedApps,
    newScanKeyword,
    removeManagedAppFromLaunchpad: (appId) => {
      const previousLength = managedAppState.value.length;
      managedAppState.value = managedAppState.value.filter((app) => app.id !== appId);
      appManagerSelectedIds.value = appManagerSelectedIds.value.filter((id) => id !== appId);
      return managedAppState.value.length !== previousLength;
    },
    removeScanKeywordBlacklistItem: (index) => {
      if (!Number.isInteger(index) || index < 0 || index >= scanKeywordBlacklist.value.length) return;
      scanKeywordBlacklist.value = scanKeywordBlacklist.value.filter((_, itemIndex) => itemIndex !== index);
    },
    removeScanRoot: (rootId) => {
      scanRoots.value = scanRoots.value.filter((root) => root.id !== rootId || !root.removable);
    },
    removeSelectedManagedAppsFromLaunchpad: () => {
      if (!appManagerSelectedIds.value.length) return false;
      const selected = new Set(appManagerSelectedIds.value);
      const previousLength = managedAppState.value.length;
      managedAppState.value = managedAppState.value.filter((app) => !selected.has(app.id));
      appManagerSelectedIds.value = [];
      return managedAppState.value.length !== previousLength;
    },
    rescanManagedApps: async () => {
      isScanningApps.value = true;
      await Promise.resolve();
      isScanningApps.value = false;
    },
    resetDraftBackgroundAcrylicParams: (profile) => {
      if (profile === "dark") {
        draftBackgroundAcrylicDarkParams.value = createDarkAcrylicParams();
        return;
      }
      if (profile === "light") {
        draftBackgroundAcrylicLightParams.value = createLightAcrylicParams();
        return;
      }
      throw new TypeError("acrylic profile must be dark or light");
    },
    scanAppBlacklist,
    scanKeywordBlacklist,
    scanRoots,
    selectAllManagedApps: () => {
      appManagerSelectedIds.value = filteredManagedApps.value.map((app) => app.id);
    },
    selectedManagedAppCount,
    setDraftBackgroundAcrylicAppearance: (value) => {
      if (value !== "system" && value !== "dark" && value !== "light") {
        throw new TypeError("acrylic appearance must be system, dark, or light");
      }
      draftBackgroundAcrylicAppearance.value = value;
    },
    setDraftBackgroundAcrylicBlurStrength: (value) => {
      draftBackgroundAcrylicBlurStrength.value = requireFiniteNumber(value, "acrylic blur strength");
    },
    setDraftBackgroundAcrylicParam: (profile, key, value) => {
      const target = profile === "dark"
        ? draftBackgroundAcrylicDarkParams
        : profile === "light"
          ? draftBackgroundAcrylicLightParams
          : null;
      if (!target) throw new TypeError("acrylic profile must be dark or light");
      switch (key) {
        case "brightness":
          target.value = { ...target.value, brightness: requireFiniteNumber(value, key) };
          return;
        case "contrast":
          target.value = { ...target.value, contrast: requireFiniteNumber(value, key) };
          return;
        case "noise":
          target.value = { ...target.value, noise: requireFiniteNumber(value, key) };
          return;
        case "saturation":
          target.value = { ...target.value, saturation: requireFiniteNumber(value, key) };
          return;
        case "seed":
          target.value = { ...target.value, seed: requireFiniteNumber(value, key) };
          return;
        case "tintStrength":
          target.value = { ...target.value, tintStrength: requireFiniteNumber(value, key) };
          return;
        case "tintColor": {
          if (!Array.isArray(value) || value.length !== 3) {
            throw new TypeError("tintColor must contain three numeric channels");
          }
          target.value = {
            ...target.value,
            tintColor: [
              requireFiniteNumber(value[0], "tintColor[0]"),
              requireFiniteNumber(value[1], "tintColor[1]"),
              requireFiniteNumber(value[2], "tintColor[2]"),
            ],
          };
        }
      }
    },
    setDraftBackgroundBaseColor: (value) => {
      draftBackgroundBaseColor.value = requireString(value, "background base color");
    },
    setDraftBackgroundBaseOpacity: (value) => {
      draftBackgroundBaseOpacity.value = requireFiniteNumber(value, "background base opacity");
    },
    setDraftBackgroundBlurStrength: (value) => {
      draftBackgroundBlurStrength.value = requireFiniteNumber(value, "background blur strength");
    },
    setDraftBackgroundDarkenColor: (value) => {
      draftBackgroundDarkenColor.value = requireString(value, "background darken color");
    },
    setDraftBackgroundDarkenStrength: (value) => {
      draftBackgroundDarkenStrength.value = requireFiniteNumber(value, "background darken strength");
    },
    setDraftBackgroundEffect: (value) => {
      if (value !== "none" && value !== "dimmed" && value !== "blur" && value !== "acrylicWebgl") {
        throw new TypeError("unsupported background effect");
      }
      draftBackgroundEffect.value = value;
    },
    setDraftBackgroundImageLayout: (value) => {
      if (value !== "fill" && value !== "fit" && value !== "stretch" && value !== "tile" && value !== "center") {
        throw new TypeError("unsupported background image layout");
      }
      draftBackgroundImageLayout.value = value;
    },
    setDraftBackgroundImageOpacity: (value) => {
      draftBackgroundImageOpacity.value = requireFiniteNumber(value, "background image opacity");
    },
    setDraftBackgroundLiveDesktopOpacity: (value) => {
      draftBackgroundLiveDesktopOpacity.value = requireFiniteNumber(value, "live desktop opacity");
    },
    setDraftBackgroundSource: (value) => {
      if (value !== "systemMaterial" && value !== "customImage" && value !== "windowsWallpaper" && value !== "windowsLiveDesktop") {
        throw new TypeError("unsupported background source");
      }
      draftBackgroundSource.value = value;
    },
    setDraftFolderIconSizeMode: (value) => {
      if (value !== "global" && value !== "custom") throw new TypeError("folder icon size mode must be global or custom");
      draftFolderIconSizeMode.value = value;
    },
    setDraftFullscreenOverscanEnabled: (value) => {
      draftFullscreenOverscanEnabled.value = requireBoolean(value, "fullscreen overscan");
    },
    setDraftLaunchAtLogin: (value) => {
      draftLaunchAtLogin.value = requireBoolean(value, "launch at login");
      launchAtLoginError.value = "";
    },
    setDraftMainWindowShortcut: (value: unknown) => {
      draftMainWindowShortcut.value = normalizeMainWindowShortcut(value);
      mainWindowShortcutError.value = "";
    },
    setDraftLocalePreference: (value: unknown) => {
      draftLocalePreference.value = normalizeLocalePreference(value);
      localePreferenceError.value = "";
    },
    setDraftLaunchpadIconVariant: (value: unknown) => {
      draftLaunchpadIconVariant.value = normalizeLaunchpadIconVariant(value);
      launchpadIconError.value = "";
    },
    setDraftSettingsThemePreference: (value: unknown) => {
      draftSettingsThemePreference.value = normalizeAppearancePreference(value);
    },
    setDraftShowCustomTitlebar: (value) => {
      draftShowCustomTitlebar.value = requireBoolean(value, "custom titlebar");
    },
    setDraftWindowEffectAppearance: (value) => {
      if (value !== "system" && value !== "dark" && value !== "light") throw new TypeError("unsupported window appearance");
      draftWindowEffectAppearance.value = value;
    },
    setDraftWindowEffectMaterial: (value) => {
      if (value !== "none" && value !== "acrylic" && value !== "mica" && value !== "micaAlt") {
        throw new TypeError("unsupported window material");
      }
      draftWindowEffectMaterial.value = value;
    },
    setDraftWindowMode: (value) => {
      if (value !== "fullscreen" && value !== "windowed") throw new TypeError("unsupported window mode");
      draftWindowMode.value = value;
    },
    setMainWindowShortcutError: (value: unknown) => {
      mainWindowShortcutError.value = String(value || "");
    },
    showMissingLaunchTargetBadge,
    settingsOverlayAnimate: computed(() => ({ opacity: 1 })),
    settingsPanelAnimate: computed(() => ({
      opacity: 1,
      scaleX: 1,
      scaleY: 1,
      x: 0,
      y: 0,
      borderRadius: "18px",
    })),
    settingsPanelCloseDurationSeconds: computed(() => 0.22),
    settingsPanelInitial: computed(() => ({
      opacity: 0,
      scaleX: 0.08,
      scaleY: 0.06,
      x: 0,
      y: 0,
      borderRadius: "18px",
    })),
    shouldRenderSettingsPanel: computed(() => true),
    toggleManagedAppSelection: (appId, checked) => {
      const nextChecked = requireBoolean(checked, "managed app selection");
      const next = new Set(appManagerSelectedIds.value);
      if (nextChecked) next.add(appId);
      else next.delete(appId);
      appManagerSelectedIds.value = [...next];
    },
    toggleMissingLaunchTargetBadge: (checked) => {
      showMissingLaunchTargetBadge.value = requireBoolean(checked, "missing target badge");
    },
    toggleScanRootEnabled: (rootId, checked) => {
      const enabled = requireBoolean(checked, "scan root enabled");
      scanRoots.value = scanRoots.value.map((root) => root.id === rootId ? { ...root, enabled } : root);
    },
    useDraftDesktopWallpaper: async () => {
      const imagePath = "C:/Windows/Web/Wallpaper/test.jpg";
      draftBackgroundImagePath.value = imagePath;
      draftBackgroundImageUrl.value = "http://asset.localhost/windows-wallpaper.jpg";
      draftBackgroundSource.value = "windowsWallpaper";
      return { ok: true, imagePath };
    },
    windowEffectsSupport: ref({ supportsAcrylic: true, supportsMica: true, supportsMicaAlt: true }),
  } satisfies SettingsPanelCapabilities;
  return capabilities;
}

export async function runSettingsPanelModelTests() {
  const capabilities = createCapabilities();
  const localization = createLocalization({
    issue: null,
    match: "exact",
    preference: "en-US",
    resolvedLocale: "en-US",
  });
  let developerConsoleOpenCount = 0;
  const systemAppearance = ref<AppearancePreference>("light");
  const model = useSettingsPanelModel({
    appVersion: "0.1.0-test",
    backgroundLayoutContext: ref<BackgroundLayoutContext | null>(null),
    capabilities,
    developerTools: {
      isAvailable: () => true,
      openConsole: async () => {
        developerConsoleOpenCount += 1;
        return true;
      },
    },
    nativeEvents: { listen: async () => () => {} },
    localizationText: localization.text,
    systemAppearance,
  });

  assert(model.shell.activeTab.value === "general", "settings should start on the general page");
  const initialGeneralTab = requirePresent(model.shell.tabs.value[0], "settings navigation should expose the General tab");
  assert(initialGeneralTab.label === "General", "settings navigation should use the active locale");
  localization.activate({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" });
  const localizedGeneralTab = requirePresent(model.shell.tabs.value[0], "localized settings navigation should retain the General tab");
  assert(localizedGeneralTab.label === "通用", "settings navigation should react to locale changes");
  model.pages.general.actions.setLocalePreference("en-US");
  assert(capabilities.draftLocalePreference.value === "en-US", "General should update the locale draft through the owner command");
  model.pages.general.actions.setLaunchpadIconVariant("pastelDark");
  assert(capabilities.draftLaunchpadIconVariant.value === "pastelDark", "General should update the launchpad icon draft through the owner command");
  assert(model.pages.general.launchpadIconOptions.value.length === 4, "General should expose all four launchpad icon choices");
  model.shell.actions.selectTab("apps");
  model.pages.apps.actions.openAppManager();
  assert(model.shell.activeRoute.value.subPageId === "apps.appManager", "Apps should own navigation to its manager subpage");
  model.pages.apps.actions.openKeywordFilters();
  assert(model.shell.activeRoute.value.key === "apps/index", "keyword settings navigation should return to the Apps root");
  assert(model.pages.apps.isKeywordBlacklistExpanded.value, "keyword settings navigation should expand the keyword editor");
  assert(model.shell.activePageModel.value === model.pages.apps, "the shell should expose only the selected page model");
  const firstExcludedApp = model.pages.apps.filteredExcludedApps.value[0]?.app;
  assert(
    firstExcludedApp
      && "iconUrl" in firstExcludedApp
      && firstExcludedApp.iconUrl === "http://asset.localhost/blocked.png",
    "Apps should preserve runtime icon presentation for excluded rows"
  );
  model.shell.actions.closeSubPage();
  assert(model.shell.activeRoute.value.depth === 0, "closing a subpage should return to the Apps root");

  model.pages.apps.actions.setExcludedAppsSearchQuery("editor");
  assert(model.pages.apps.filteredExcludedApps.value.length === 1, "Apps should own excluded-app filtering");
  const excluded = requirePresent(
    model.pages.apps.filteredExcludedApps.value[0],
    "the excluded-app filter should retain the matching app",
  );
  model.pages.apps.actions.toggleExcludedAppSelection(excluded.key, true);
  assert(model.pages.apps.selectedExcludedAppCount.value === 1, "Apps should own excluded-app selection");

  model.pages.general.actions.clearShortcut();
  assert(capabilities.draftMainWindowShortcut.value === null, "General should update shortcut drafts through an owner command");
  assert(model.pages.general.canResetMainWindowShortcut.value, "a disabled shortcut should be resettable");
  model.pages.general.actions.resetShortcut();
  assert(capabilities.draftMainWindowShortcut.value === "alt+Space", "reset should restore the documented default shortcut");
  assert(!model.pages.general.canResetMainWindowShortcut.value, "the default shortcut should not offer a no-op reset");
  assert(model.pages.general.canOpenDeveloperConsole.value, "General should expose developer console availability");
  assert(await model.pages.general.actions.openDeveloperConsole(), "General should report a successful developer console open");
  assert(developerConsoleOpenCount === 1, "General should open the developer console through its injected port");
  assert(!("scanRoots" in model.pages.general), "General should not expose Apps page state");
  assert(!("draftBackgroundSource" in model.pages.apps), "Apps should not expose Interface page drafts");
  assert(model.pages.about.appVersion === "0.1.0-test", "About should receive the app version explicitly");
  assert(model.pages.about.draftLaunchpadIconVariant === capabilities.draftLaunchpadIconVariant, "About should reuse the launchpad icon draft owner");
  assert(model.pages.interface.systemAppearance === model.systemAppearance, "Interface should reuse the shared system appearance owner");
  assert(model.shell.resolvedSettingsTheme.value === "light", "the system settings theme should resolve through the shared appearance owner");
  capabilities.setDraftSettingsThemePreference("dark");
  assert(model.shell.resolvedSettingsTheme.value === "dark", "an explicit settings theme should override the system appearance");
  assert(model.pages.interface.windowEffectSummary.value === "无材质", "no material summaries should omit the inactive appearance");
  capabilities.draftWindowEffectMaterial.value = "acrylic";
  assert(model.pages.interface.windowEffectSummary.value === "Acrylic · 深色", "active materials should retain their appearance summary");
  capabilities.draftWindowEffectAppearance.value = "system";
  assert(model.pages.interface.windowEffectSummary.value === "Acrylic · 跟随系统", "window material summaries should expose the system preference");
  const lightAcrylicPreview = requirePresent(
    model.pages.interface.windowEffectPreviewItems.value[1],
    "window previews should include Acrylic",
  );
  assert(lightAcrylicPreview.appearance === "system", "window previews should preserve the selected preference");
  assert(lightAcrylicPreview.resolvedAppearance === "light", "window previews should resolve system appearance for presentation");
  systemAppearance.value = "dark";
  const darkAcrylicPreview = requirePresent(
    model.pages.interface.windowEffectPreviewItems.value[1],
    "window previews should retain Acrylic after appearance changes",
  );
  assert(darkAcrylicPreview.resolvedAppearance === "dark", "window previews should react to system appearance changes");
  model.dispose();
}
