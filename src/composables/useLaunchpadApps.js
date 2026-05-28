import { computed, ref, shallowRef } from "vue";
import {
  compareAppsByDefaultOrder,
  fallbackAppGlyph,
  isAppBlockedByScanBlacklist,
  makeScanAppBlacklistEntry,
  makeLaunchTarget,
  normalizeNativeApp,
  normalizeScanAppBlacklist,
  normalizeScanKeywordBlacklist,
  normalizeScanRoots,
} from "../domain/launchpadData.js";
import { loadAppIconChoices, pickLaunchFile, scanApps } from "../api/launchpadApi.js";

export function useLaunchpadApps(options) {
  const appManagerSelectedIds = ref([]);
  const appManagerSearchQuery = ref("");
  const isScanResultDialogOpen = ref(false);
  const scanResultApps = ref([]);
  const scanResultSelectedIds = ref([]);
  const newScanKeyword = ref("");
  const isAddingManagedApp = ref(false);
  const newAppName = ref("");
  const newAppTarget = ref("");
  const newAppArgs = ref("");
  const newAppIconDataUrl = ref(null);
  const isBrowsingNewAppTarget = ref(false);
  const editingManagedAppId = ref(null);
  const editAppName = ref("");
  const editAppTarget = ref("");
  const editAppArgs = ref("");
  const editAppIconDataUrl = ref(null);
  const isEditAppIconReset = ref(false);
  const isBrowsingEditAppTarget = ref(false);
  const isScanningApps = ref(false);
  const iconChooser = shallowRef(null);
  const iconChoices = ref([]);
  const isLoadingIconChoices = ref(false);
  let iconChooserRequestId = 0;

  const managedApps = computed(() => options.collectAppsFromPages(options.pages.value).sort(compareAppsByDefaultOrder));
  const filteredManagedApps = computed(() => {
    const query = appManagerSearchQuery.value.trim().toLowerCase();
    if (!query) return managedApps.value;
    return managedApps.value.filter((app) => {
      const name = String(app?.name || "").toLowerCase();
      const target = getLaunchTargetPath(app).toLowerCase();
      const args = String(app?.launchArgs || "").toLowerCase();
      return name.includes(query) || target.includes(query) || args.includes(query);
    });
  });
  const selectedManagedAppCount = computed(() => appManagerSelectedIds.value.length);
  const scanResultSelectedCount = computed(() => scanResultSelectedIds.value.length);
  const canAddScannedApps = computed(() => scanResultSelectedCount.value > 0);
  const canAddManagedApp = computed(() => newAppName.value.trim().length > 0 && newAppTarget.value.trim().length > 0);
  const newManagedAppGlyph = computed(() => fallbackAppGlyph(newAppName.value));
  const canSaveEditingManagedApp = computed(() => editAppName.value.trim().length > 0 && editAppTarget.value.trim().length > 0);
  const editingManagedApp = computed(() => managedApps.value.find((app) => app.id === editingManagedAppId.value) || null);
  const canScanManagedApps = computed(() => options.shouldUseNativeCatalog() && options.scanRoots.value.some((root) => root.enabled));

  function getLaunchTargetPath(app) {
    return app?.launchTarget?.path || "";
  }

  function updateAppCustomIcon(appId, dataUrl) {
    if (!appId || options.isDragActive()) return;
    const next = options.clonePages(options.pages.value);
    let changed = false;

    function updateItem(item) {
      if (!item) return;
      if (item.type === "app" && item.id === appId) {
        if (dataUrl) item.customIconDataUrl = dataUrl;
        else delete item.customIconDataUrl;
        changed = true;
        return;
      }
      if (item.type !== "folder") return;
      for (const page of item.childPages || []) {
        for (const child of page || []) updateItem(child);
      }
      item.children = (item.childPages || []).flat().filter(Boolean).map(options.cloneItem);
    }

    for (const page of next) {
      for (const item of page) updateItem(item);
    }
    if (!changed) return;
    options.commitPages(next);
    options.schedulePageGridMetrics();
  }

  function resetAppCustomIcon(appId) {
    updateAppCustomIcon(appId, null);
  }

  function syncEditingManagedApp() {
    if (editingManagedAppId.value && !editingManagedApp.value) closeEditManagedApp();
  }

  function syncSelectedManagedApps() {
    const validIds = new Set(filteredManagedApps.value.map((app) => app.id));
    appManagerSelectedIds.value = appManagerSelectedIds.value.filter((id) => validIds.has(id));
  }

  function syncManagedAppState() {
    syncEditingManagedApp();
    syncSelectedManagedApps();
  }

  function toggleManagedAppSelection(appId, checked) {
    if (!appId) return;
    const selected = new Set(appManagerSelectedIds.value);
    if (checked) selected.add(appId);
    else selected.delete(appId);
    appManagerSelectedIds.value = Array.from(selected);
  }

  function selectAllManagedApps() {
    appManagerSelectedIds.value = filteredManagedApps.value.map((app) => app.id);
  }

  function clearManagedAppSelection() {
    appManagerSelectedIds.value = [];
  }

  function toggleMissingLaunchTargetBadge(checked) {
    options.showMissingLaunchTargetBadge.value = Boolean(checked);
  }

  function toggleScanRootEnabled(rootId, checked) {
    options.scanRoots.value = normalizeScanRoots(
      options.scanRoots.value.map((root) =>
        root.id === rootId ? { ...root, enabled: Boolean(checked) } : root
      )
    );
  }

  function changeScanRootPath(rootId, path) {
    options.scanRoots.value = normalizeScanRoots(
      options.scanRoots.value.map((root) =>
        root.id === rootId ? { ...root, path: String(path || "") } : root
      )
    );
  }

  function removeScanRoot(rootId) {
    options.scanRoots.value = options.scanRoots.value.filter((root) => root.id !== rootId);
  }

  function addScanRoot() {
    options.scanRoots.value = normalizeScanRoots([
      ...options.scanRoots.value,
      {
        id: options.makeId("root"),
        type: "customDirectory",
        label: "自定义目录",
        path: "C:/",
        enabled: true,
        removable: true,
      },
    ]);
  }

  function addScanKeywordBlacklistItem() {
    const keyword = newScanKeyword.value.trim();
    if (!keyword) return;
    options.scanKeywordBlacklist.value = normalizeScanKeywordBlacklist([
      ...options.scanKeywordBlacklist.value,
      keyword,
    ]);
    newScanKeyword.value = "";
  }

  function removeScanKeywordBlacklistItem(index) {
    options.scanKeywordBlacklist.value = normalizeScanKeywordBlacklist(
      options.scanKeywordBlacklist.value.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  function removeScanAppBlacklistItem(index) {
    options.scanAppBlacklist.value = normalizeScanAppBlacklist(
      options.scanAppBlacklist.value.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  function toggleScanResultSelection(appId, checked) {
    if (!appId) return;
    const selected = new Set(scanResultSelectedIds.value);
    if (checked) selected.add(appId);
    else selected.delete(appId);
    scanResultSelectedIds.value = Array.from(selected);
  }

  function selectAllScanResultApps() {
    scanResultSelectedIds.value = scanResultApps.value.map((app) => app.id);
  }

  function clearScanResultSelection() {
    scanResultSelectedIds.value = [];
  }

  function closeScanResultDialog() {
    isScanResultDialogOpen.value = false;
    scanResultApps.value = [];
    scanResultSelectedIds.value = [];
  }

  function resetNewManagedAppDraft() {
    newAppName.value = "";
    newAppTarget.value = "";
    newAppArgs.value = "";
    newAppIconDataUrl.value = null;
  }

  function openAddManagedAppPage() {
    if (options.isDragActive()) return;
    resetNewManagedAppDraft();
    isAddingManagedApp.value = true;
  }

  function closeAddManagedAppPage() {
    isAddingManagedApp.value = false;
    if (iconChooser.value?.target === "new") closeIconChooser();
    resetNewManagedAppDraft();
  }

  function readImageFileAsDataUrl(event, callback) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") callback(reader.result);
      input.value = "";
    };
    reader.onerror = () => {
      input.value = "";
    };
    reader.readAsDataURL(file);
  }

  function resetNewAppIcon() {
    newAppIconDataUrl.value = null;
  }

  async function browseNewAppLaunchFile() {
    if (!options.shouldUseNativeCatalog() || isBrowsingNewAppTarget.value) return;
    isBrowsingNewAppTarget.value = true;
    try {
      const selectedFile = await pickLaunchFile();
      if (!selectedFile) return;
      newAppName.value = String(selectedFile.name || "").trim() || newAppName.value;
      newAppTarget.value = String(selectedFile.path || "").trim();
      newAppArgs.value = String(selectedFile.launchArgs || "").trim();
      newAppIconDataUrl.value = selectedFile.iconDataUrl || null;
    } catch (error) {
      console.error("Failed to pick launch file", error);
    } finally {
      isBrowsingNewAppTarget.value = false;
    }
  }

  function openEditManagedApp(app) {
    if (!app || options.isDragActive()) return;
    editingManagedAppId.value = app.id;
    editAppName.value = app.name || "";
    editAppTarget.value = getLaunchTargetPath(app);
    editAppArgs.value = typeof app.launchArgs === "string" ? app.launchArgs : "";
    editAppIconDataUrl.value = app.customIconDataUrl || null;
    isEditAppIconReset.value = false;
  }

  function closeEditManagedApp() {
    editingManagedAppId.value = null;
    if (iconChooser.value?.target === "edit") closeIconChooser();
    editAppName.value = "";
    editAppTarget.value = "";
    editAppArgs.value = "";
    editAppIconDataUrl.value = null;
    isEditAppIconReset.value = false;
  }

  function resetEditAppIcon() {
    editAppIconDataUrl.value = null;
    isEditAppIconReset.value = true;
  }

  async function browseEditAppLaunchFile() {
    if (!options.shouldUseNativeCatalog() || isBrowsingEditAppTarget.value) return;
    isBrowsingEditAppTarget.value = true;
    try {
      const selectedFile = await pickLaunchFile();
      if (!selectedFile) return;
      editAppName.value = String(selectedFile.name || "").trim() || editAppName.value;
      editAppTarget.value = String(selectedFile.path || "").trim();
      editAppArgs.value = String(selectedFile.launchArgs || "").trim();
      editAppIconDataUrl.value = selectedFile.iconDataUrl || null;
      isEditAppIconReset.value = false;
    } catch (error) {
      console.error("Failed to pick launch file", error);
    } finally {
      isBrowsingEditAppTarget.value = false;
    }
  }

  function normalizeIconChoices(choices) {
    return (choices || [])
      .map((choice, index) => ({
        id: String(choice?.id || `icon-choice-${index}`),
        iconDataUrl: choice?.iconDataUrl || choice?.icon_data_url || null,
      }))
      .filter((choice) => choice.iconDataUrl);
  }

  function getIconChooserSourcePath(chooser) {
    if (chooser?.target === "new") return newAppTarget.value.trim();
    if (chooser?.target === "edit") return editAppTarget.value.trim();
    if (chooser?.target === "existing") {
      const app = managedApps.value.find((item) => item.id === chooser.appId);
      return getLaunchTargetPath(app).trim();
    }
    return "";
  }

  async function loadIconChoicesForChooser(chooser) {
    const requestId = (iconChooserRequestId += 1);
    iconChoices.value = [];
    const targetPath = getIconChooserSourcePath(chooser);
    if (!targetPath || !options.shouldUseNativeCatalog()) {
      isLoadingIconChoices.value = false;
      return;
    }

    isLoadingIconChoices.value = true;
    try {
      const choices = await loadAppIconChoices(targetPath);
      if (requestId !== iconChooserRequestId) return;
      iconChoices.value = normalizeIconChoices(choices);
    } catch (error) {
      if (requestId === iconChooserRequestId) iconChoices.value = [];
      console.error("Failed to load app icon choices", error);
    } finally {
      if (requestId === iconChooserRequestId) isLoadingIconChoices.value = false;
    }
  }

  function openIconChooser(chooser) {
    if (!chooser || options.isDragActive()) return;
    iconChooser.value = chooser;
    loadIconChoicesForChooser(chooser);
  }

  function openNewAppIconChooser() {
    openIconChooser({
      target: "new",
      title: "更换图标",
      subtitle: newAppName.value.trim() || "新增应用",
    });
  }

  function openEditAppIconChooser() {
    openIconChooser({
      target: "edit",
      title: "更换图标",
      subtitle: editAppName.value.trim() || editingManagedApp.value?.name || "编辑应用",
    });
  }

  function openExistingAppIconChooser(appId) {
    if (!appId) return;
    const app = managedApps.value.find((item) => item.id === appId);
    if (!app) return;
    openIconChooser({
      target: "existing",
      appId,
      title: "更换图标",
      subtitle: app.name || "应用",
    });
  }

  function closeIconChooser() {
    iconChooserRequestId += 1;
    iconChooser.value = null;
    iconChoices.value = [];
    isLoadingIconChoices.value = false;
  }

  function applyIconChooserDataUrl(dataUrl) {
    if (!dataUrl || !iconChooser.value) return;
    if (iconChooser.value.target === "new") {
      newAppIconDataUrl.value = dataUrl;
      closeIconChooser();
      return;
    }
    if (iconChooser.value.target === "edit") {
      editAppIconDataUrl.value = dataUrl;
      isEditAppIconReset.value = false;
      closeIconChooser();
      return;
    }
    if (iconChooser.value.target === "existing") {
      updateAppCustomIcon(iconChooser.value.appId, dataUrl);
      closeIconChooser();
    }
  }

  function chooseIconCandidate(choice) {
    applyIconChooserDataUrl(choice?.iconDataUrl);
  }

  function handleIconChooserUpload(event) {
    readImageFileAsDataUrl(event, applyIconChooserDataUrl);
  }

  function updateManagedAppEverywhere(appId, updater) {
    if (!appId || typeof updater !== "function") return false;
    const next = options.clonePages(options.pages.value);
    let changed = false;

    function updateItem(item) {
      if (!item) return;
      if (item.type === "app" && item.id === appId) {
        updater(item);
        changed = true;
        return;
      }
      if (item.type !== "folder") return;
      for (const page of item.childPages || []) {
        for (const child of page || []) updateItem(child);
      }
      item.children = (item.childPages || []).flat().filter(Boolean).map(options.cloneItem);
    }

    for (const page of next) {
      for (const item of page) updateItem(item);
    }
    if (!changed) return false;
    options.commitPages(next);
    return true;
  }

  function saveEditingManagedApp() {
    if (options.isDragActive() || !editingManagedAppId.value || !canSaveEditingManagedApp.value) return;
    const name = editAppName.value.trim().slice(0, 64);
    const launchTarget = makeLaunchTarget(editAppTarget.value);
    if (!name || !launchTarget) return;
    const launchArgs = editAppArgs.value.trim();
    const customIcon = editAppIconDataUrl.value;

    const changed = updateManagedAppEverywhere(editingManagedAppId.value, (item) => {
      item.name = name;
      item.emoji = fallbackAppGlyph(name);
      item.launchTarget = launchTarget;
      if (launchArgs) item.launchArgs = launchArgs;
      else delete item.launchArgs;
      if (customIcon) item.customIconDataUrl = customIcon;
      else delete item.customIconDataUrl;
    });

    if (!changed) return;
    closeEditManagedApp();
    options.commitPageIndex(options.pageIndex.value);
    options.commitSearchPageIndex(options.searchPageIndex.value);
    options.schedulePageGridMetrics();
  }

  function deleteManagedApps(appIds) {
    if (options.isDragActive()) return;
    const ids = Array.from(new Set((appIds || []).filter(Boolean)));
    if (!ids.length) return;

    let next = options.pages.value;
    for (const id of ids) next = options.removeEverywhere(next, id);
    options.hiddenAppIds.value = Array.from(new Set([...options.hiddenAppIds.value, ...ids]));
    options.commitPages(next);
    const deletedIds = new Set(ids);
    appManagerSelectedIds.value = appManagerSelectedIds.value.filter((id) => !deletedIds.has(id));
    if (deletedIds.has(editingManagedAppId.value)) closeEditManagedApp();
    options.commitPageIndex(options.pageIndex.value);
    options.commitSearchPageIndex(options.searchPageIndex.value);
    if (options.renderedFolder.value && options.openFolderId.value && !options.findFolder(options.pages.value, options.openFolderId.value)) {
      options.commitOpenFolder(null);
    }
    options.schedulePageGridMetrics();
  }

  function deleteManagedApp(appId) {
    deleteManagedApps([appId]);
  }

  function deleteSelectedManagedApps() {
    deleteManagedApps(appManagerSelectedIds.value);
  }

  function ignoreManagedApp(app) {
    if (!app || options.isDragActive()) return;
    const entry = makeScanAppBlacklistEntry(app);
    options.scanAppBlacklist.value = normalizeScanAppBlacklist([
      ...options.scanAppBlacklist.value,
      entry,
    ]);
    deleteManagedApps([app.id]);
  }

  function ignoreSelectedManagedApps() {
    if (options.isDragActive() || selectedManagedAppCount.value === 0) return;
    const selectedIds = new Set(appManagerSelectedIds.value);
    const selectedApps = managedApps.value.filter((app) => selectedIds.has(app.id));
    if (!selectedApps.length) return;
    options.scanAppBlacklist.value = normalizeScanAppBlacklist([
      ...options.scanAppBlacklist.value,
      ...selectedApps.map(makeScanAppBlacklistEntry),
    ]);
    deleteManagedApps(selectedApps.map((app) => app.id));
  }

  async function rescanManagedApps() {
    if (!options.shouldUseNativeCatalog() || isScanningApps.value) return;
    isScanningApps.value = true;
    try {
      const enabledRoots = normalizeScanRoots(options.scanRoots.value).filter((root) => root.enabled);
      const scanFilters = {
        keywordBlacklist: normalizeScanKeywordBlacklist(options.scanKeywordBlacklist.value),
        appBlacklist: normalizeScanAppBlacklist(options.scanAppBlacklist.value),
      };
      const nativeApps = await scanApps(enabledRoots, scanFilters);
      const now = new Date().toISOString();
      const scannedRootIds = new Set(enabledRoots.map((root) => root.id));
      options.scanRoots.value = options.scanRoots.value.map((root) =>
        scannedRootIds.has(root.id) ? { ...root, lastScannedAt: now } : root
      );
      const existingApps = options.collectAppsFromPages(options.pages.value);
      const existingIds = new Set(existingApps.map((app) => app.id));
      const existingSourceKeys = new Set(existingApps.map((app) => app.sourceKey).filter(Boolean));
      const missingApps = (nativeApps || [])
        .map(normalizeNativeApp)
        .filter((app) => !isAppBlockedByScanBlacklist(app, scanFilters.appBlacklist))
        .filter((app) => !existingIds.has(app.id) && !existingSourceKeys.has(app.sourceKey));
      scanResultApps.value = missingApps;
      scanResultSelectedIds.value = missingApps.map((app) => app.id);
      isScanResultDialogOpen.value = true;
      syncManagedAppState();
    } catch (error) {
      console.error("Failed to scan apps", error);
    } finally {
      isScanningApps.value = false;
    }
  }

  function addSelectedScannedApps() {
    if (options.isDragActive() || !canAddScannedApps.value) return;
    const selectedIds = new Set(scanResultSelectedIds.value);
    const existingApps = options.collectAppsFromPages(options.pages.value);
    const existingIds = new Set(existingApps.map((app) => app.id));
    const existingSourceKeys = new Set(existingApps.map((app) => app.sourceKey).filter(Boolean));
    const selectedApps = scanResultApps.value
      .filter((app) => selectedIds.has(app.id) && !existingIds.has(app.id) && !existingSourceKeys.has(app.sourceKey))
      .map((app) => ({
        ...app,
        id: options.makeId("app"),
      }));
    if (!selectedApps.length) {
      closeScanResultDialog();
      return;
    }

    const restoredIds = new Set(selectedApps.map((app) => app.id));
    options.hiddenAppIds.value = options.hiddenAppIds.value.filter((id) => !restoredIds.has(id));
    options.commitPages(options.appendAppsToPages(options.pages.value, selectedApps));
    closeScanResultDialog();
    options.commitPageIndex(options.pageIndex.value);
    options.commitSearchPageIndex(options.searchPageIndex.value);
    syncManagedAppState();
    options.schedulePageGridMetrics();
  }

  function addManagedApp() {
    if (options.isDragActive()) return;
    const name = newAppName.value.trim().slice(0, 64);
    if (!name) return;
    const launchTarget = makeLaunchTarget(newAppTarget.value);
    if (!launchTarget) return;
    const launchArgs = newAppArgs.value.trim();
    const app = {
      id: options.makeId("custom-app"),
      type: "app",
      name,
      emoji: fallbackAppGlyph(name),
      launchTarget,
    };
    if (launchArgs) app.launchArgs = launchArgs;
    if (newAppIconDataUrl.value) app.customIconDataUrl = newAppIconDataUrl.value;
    options.commitPages(options.appendAppsToPages(options.pages.value, [app]));
    closeAddManagedAppPage();
    options.commitPageIndex(options.pageIndex.value);
    options.commitSearchPageIndex(options.searchPageIndex.value);
    options.schedulePageGridMetrics();
  }

  return {
    addManagedApp,
    addScanKeywordBlacklistItem,
    addScanRoot,
    addSelectedScannedApps,
    appManagerSearchQuery,
    appManagerSelectedIds,
    browseEditAppLaunchFile,
    browseNewAppLaunchFile,
    canAddManagedApp,
    canAddScannedApps,
    canSaveEditingManagedApp,
    canScanManagedApps,
    chooseIconCandidate,
    changeScanRootPath,
    clearManagedAppSelection,
    clearScanResultSelection,
    closeAddManagedAppPage,
    closeEditManagedApp,
    closeIconChooser,
    closeScanResultDialog,
    deleteManagedApp,
    deleteSelectedManagedApps,
    editAppArgs,
    editAppIconDataUrl,
    editingManagedApp,
    editAppName,
    editAppTarget,
    filteredManagedApps,
    getLaunchTargetPath,
    handleIconChooserUpload,
    iconChooser,
    iconChoices,
    isAddingManagedApp,
    ignoreManagedApp,
    ignoreSelectedManagedApps,
    isBrowsingEditAppTarget,
    isBrowsingNewAppTarget,
    isEditAppIconReset,
    isLoadingIconChoices,
    isScanningApps,
    isScanResultDialogOpen,
    managedApps,
    newAppArgs,
    newAppIconDataUrl,
    newAppName,
    newAppTarget,
    newScanKeyword,
    newManagedAppGlyph,
    openAddManagedAppPage,
    openEditAppIconChooser,
    openEditManagedApp,
    openExistingAppIconChooser,
    openNewAppIconChooser,
    rescanManagedApps,
    resetAppCustomIcon,
    resetEditAppIcon,
    resetNewAppIcon,
    saveEditingManagedApp,
    scanResultApps,
    scanResultSelectedCount,
    scanResultSelectedIds,
    selectAllManagedApps,
    selectAllScanResultApps,
    selectedManagedAppCount,
    toggleMissingLaunchTargetBadge,
    syncManagedAppState,
    toggleManagedAppSelection,
    toggleScanResultSelection,
    toggleScanRootEnabled,
    removeScanRoot,
    removeScanAppBlacklistItem,
    removeScanKeywordBlacklistItem,
    updateAppCustomIcon,
  };
}
