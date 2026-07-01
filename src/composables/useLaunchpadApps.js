import { computed, ref, shallowRef } from "vue";
import {
  DEFAULT_SCAN_ROOTS,
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
import { cacheCustomIcon, loadAppIconChoices, pickLaunchFile, pickScanRootDirectory, scanApps } from "../api/launchpadApi.js";
import { ICON_SIZE_MAX } from "./launchpadConstants.js";

const CUSTOM_ICON_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const CUSTOM_ICON_DATA_URL_MAX_LENGTH = 1_400_000;
const CUSTOM_ICON_MIN_SOURCE_SIZE = 16;
const CUSTOM_ICON_OUTPUT_MIN_SIZE = ICON_SIZE_MAX;
const CUSTOM_ICON_OUTPUT_MAX_SIZE = ICON_SIZE_MAX * 2;

export function getCustomIconCanvasSize(width, height) {
  const sourceMax = Math.max(Number(width) || 0, Number(height) || 0);
  if (sourceMax <= 0) return CUSTOM_ICON_OUTPUT_MIN_SIZE;
  return Math.min(CUSTOM_ICON_OUTPUT_MAX_SIZE, Math.max(CUSTOM_ICON_OUTPUT_MIN_SIZE, sourceMax));
}

export function useLaunchpadApps(options) {
  const appManagerSelectedIds = ref([]);
  const appManagerSearchQuery = ref("");
  const isScanResultDialogOpen = ref(false);
  const scanResultApps = ref([]);
  const scanResultWarnings = ref([]);
  const scanResultSelectedIds = ref([]);
  const newScanKeyword = ref("");
  const isAddingManagedApp = ref(false);
  const newAppName = ref("");
  const newAppTarget = ref("");
  const newAppArgs = ref("");
  const newAppIconPath = ref(null);
  const newAppIconDataUrl = ref(null);
  const isBrowsingNewAppTarget = ref(false);
  const editingManagedAppId = ref(null);
  const editAppName = ref("");
  const editAppTarget = ref("");
  const editAppArgs = ref("");
  const editAppIconPath = ref(null);
  const editAppIconDataUrl = ref(null);
  const isEditAppIconReset = ref(false);
  const isBrowsingEditAppTarget = ref(false);
  const isScanningApps = ref(false);
  const browsingScanRootIds = ref([]);
  const iconChooser = shallowRef(null);
  const iconChoices = ref([]);
  const iconChoicesError = ref("");
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
  const canBrowseScanRoots = computed(() => options.shouldUseNativeCatalog());
  const canBrowseLaunchFile = computed(() => options.shouldUseNativeCatalog());
  const canScanManagedApps = computed(() => options.shouldUseNativeCatalog() && options.scanRoots.value.some((root) => root.enabled));
  const canEditNewAppArgs = computed(() => canUseLaunchArgsForTarget(newAppTarget.value));
  const canEditAppArgs = computed(() => canUseLaunchArgsForTarget(editAppTarget.value));

  function getLaunchTargetPath(app) {
    return app?.launchTarget?.path || "";
  }

  function canUseLaunchArgsForTarget(target) {
    return makeLaunchTarget(target)?.kind === "executable";
  }

  function launchArgsForTarget(launchTarget, value) {
    return launchTarget?.kind === "executable" ? value.trim() : "";
  }

  function updateAppCustomIcon(appId, icon) {
    if (!appId || options.isDragActive()) return;
    const next = options.clonePages(options.pages.value);
    let changed = false;
    const customIconPath = icon?.iconPath || null;
    const customIconDataUrl = icon?.iconDataUrl || null;

    function updateItem(item) {
      if (!item) return;
      if (item.type === "app" && item.id === appId) {
        if (customIconPath) item.customIconPath = customIconPath;
        else delete item.customIconPath;
        delete item.customIconUrl;
        if (customIconDataUrl) item.customIconDataUrl = customIconDataUrl;
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

  function changeScanRootLabel(rootId, label) {
    options.scanRoots.value = normalizeScanRoots(
      options.scanRoots.value.map((root) =>
        root.id === rootId ? { ...root, label: String(label || "") } : root
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
        path: "%USERPROFILE%/Desktop",
        enabled: false,
        removable: true,
        maxDepth: 3,
        maxEntries: 5000,
      },
    ]);
  }

  function resetScanRootsToDefaults() {
    options.scanRoots.value = DEFAULT_SCAN_ROOTS.map((root) => ({ ...root }));
  }

  function confirmResetScanRoots() {
    options.openWarningDialog?.({
      title: "还原默认来源",
      message: "将移除当前自定义扫描来源，并恢复为用户开始菜单和系统开始菜单。",
      intent: "warning",
      cancelText: "取消",
      confirmText: "还原",
      onConfirm: resetScanRootsToDefaults,
    });
  }

  function setBrowsingScanRoot(rootId, browsing) {
    const ids = new Set(browsingScanRootIds.value);
    if (browsing) ids.add(rootId);
    else ids.delete(rootId);
    browsingScanRootIds.value = Array.from(ids);
  }

  function isBrowsingScanRoot(rootId) {
    return browsingScanRootIds.value.includes(rootId);
  }

  function getOperationErrorDetail(error) {
    return String(error?.message || error || "").trim();
  }

  function openOperationFailedDialog(config, error) {
    const detail = getOperationErrorDetail(error);
    options.openWarningDialog?.({
      title: config.title,
      message: config.message,
      suggestion: [config.suggestion, detail && `错误信息：${detail}`].filter(Boolean).join(" "),
      intent: "error",
      confirmText: "知道了",
    });
  }

  async function browseScanRootDirectory(rootId) {
    if (!options.shouldUseNativeCatalog() || !rootId || isBrowsingScanRoot(rootId)) return;
    setBrowsingScanRoot(rootId, true);
    try {
      const selectedPath = await pickScanRootDirectory();
      if (!selectedPath) return;
      changeScanRootPath(rootId, selectedPath);
    } catch (error) {
      openOperationFailedDialog({
        title: "无法选择扫描来源",
        message: "LaunchPad 无法打开目录选择器。",
        suggestion: "请重试，或检查系统文件选择权限。",
      }, error);
      console.error("Failed to pick scan root directory", error);
    } finally {
      setBrowsingScanRoot(rootId, false);
    }
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
    scanResultWarnings.value = [];
    scanResultSelectedIds.value = [];
  }

  function resetNewManagedAppDraft() {
    newAppName.value = "";
    newAppTarget.value = "";
    newAppArgs.value = "";
    newAppIconPath.value = null;
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

  function openIconErrorDialog(message) {
    options.openWarningDialog?.({
      title: "无法使用此图标",
      message,
      intent: "error",
      confirmText: "知道了",
    });
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片无法读取。"));
      };
      image.src = url;
    });
  }

  function canvasToPngDataUrl(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("图标压缩失败。"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("图标压缩失败。"));
        };
        reader.onerror = () => reject(new Error("图标压缩失败。"));
        reader.readAsDataURL(blob);
      }, "image/png");
    });
  }

  async function normalizeCustomIconFile(file) {
    if (!file.type || !file.type.startsWith("image/")) {
      throw new Error("请选择图片文件。");
    }
    if (file.size > CUSTOM_ICON_SOURCE_MAX_BYTES) {
      throw new Error("图片文件过大，请选择 10MB 以内的图片。");
    }

    const image = await loadImageFromFile(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width < CUSTOM_ICON_MIN_SOURCE_SIZE || height < CUSTOM_ICON_MIN_SOURCE_SIZE) {
      throw new Error("图片尺寸过小，请选择至少 16x16 的图片。");
    }

    const canvasSize = getCustomIconCanvasSize(width, height);
    const scale = Math.min(canvasSize / width, canvasSize / height);
    const drawWidth = Math.max(1, Math.round(width * scale));
    const drawHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图标压缩失败。");
    context.clearRect(0, 0, canvasSize, canvasSize);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      Math.round((canvasSize - drawWidth) / 2),
      Math.round((canvasSize - drawHeight) / 2),
      drawWidth,
      drawHeight
    );

    const dataUrl = await canvasToPngDataUrl(canvas);
    if (dataUrl.length > CUSTOM_ICON_DATA_URL_MAX_LENGTH) {
      throw new Error("压缩后的图标仍然过大，请换一张更简单的图片。");
    }
    return dataUrl;
  }

  async function cacheCustomIconDataUrl(dataUrl) {
    if (!options.shouldUseNativeCatalog()) return { iconDataUrl: dataUrl, iconPath: null };
    const cached = await cacheCustomIcon(dataUrl);
    if (!cached?.iconPath) throw new Error("图标缓存失败。");
    return {
      iconPath: cached.iconPath,
      iconDataUrl: cached.iconDataUrl || dataUrl,
    };
  }

  async function readImageFileAsCustomIcon(event, callback) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await normalizeCustomIconFile(file);
      callback(await cacheCustomIconDataUrl(dataUrl));
    } catch (error) {
      openIconErrorDialog(error?.message || "图标处理失败。");
    } finally {
      input.value = "";
    }
  }

  function resetNewAppIcon() {
    newAppIconPath.value = null;
    newAppIconDataUrl.value = null;
  }

  async function browseNewAppLaunchFile() {
    if (!options.shouldUseNativeCatalog() || isBrowsingNewAppTarget.value) return;
    isBrowsingNewAppTarget.value = true;
    try {
      const selectedFile = await pickLaunchFile();
      if (!selectedFile) return;
      newAppName.value = String(selectedFile.name || "").trim() || newAppName.value;
      newAppTarget.value = String(selectedFile.launchTarget?.path || selectedFile.path || "").trim();
      newAppArgs.value = selectedFile.launchTarget?.kind === "executable" ? String(selectedFile.launchArgs || "").trim() : "";
      newAppIconPath.value = selectedFile.iconPath || null;
      newAppIconDataUrl.value = selectedFile.iconDataUrl || null;
    } catch (error) {
      openOperationFailedDialog({
        title: "无法选择启动文件",
        message: "LaunchPad 无法打开文件选择器。",
        suggestion: "请重试，或手动填写启动路径。",
      }, error);
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
    editAppIconPath.value = app.customIconPath || null;
    editAppIconDataUrl.value = app.customIconDataUrl || null;
    isEditAppIconReset.value = false;
  }

  function closeEditManagedApp() {
    editingManagedAppId.value = null;
    if (iconChooser.value?.target === "edit") closeIconChooser();
    editAppName.value = "";
    editAppTarget.value = "";
    editAppArgs.value = "";
    editAppIconPath.value = null;
    editAppIconDataUrl.value = null;
    isEditAppIconReset.value = false;
  }

  function resetEditAppIcon() {
    editAppIconPath.value = null;
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
      editAppTarget.value = String(selectedFile.launchTarget?.path || selectedFile.path || "").trim();
      editAppArgs.value = selectedFile.launchTarget?.kind === "executable" ? String(selectedFile.launchArgs || "").trim() : "";
      editAppIconPath.value = selectedFile.iconPath || null;
      editAppIconDataUrl.value = selectedFile.iconDataUrl || null;
      isEditAppIconReset.value = false;
    } catch (error) {
      openOperationFailedDialog({
        title: "无法选择启动文件",
        message: "LaunchPad 无法打开文件选择器。",
        suggestion: "请重试，或手动填写启动路径。",
      }, error);
      console.error("Failed to pick launch file", error);
    } finally {
      isBrowsingEditAppTarget.value = false;
    }
  }

  function normalizeIconChoices(choices) {
    return (choices || [])
      .map((choice, index) => ({
        id: String(choice?.id || `icon-choice-${index}`),
        iconPath: choice?.iconPath || choice?.icon_path || null,
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
    iconChoicesError.value = "";
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
      if (requestId === iconChooserRequestId) {
        iconChoices.value = [];
        iconChoicesError.value = "无法读取应用内图标，请重试。";
      }
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
    iconChoicesError.value = "";
    isLoadingIconChoices.value = false;
  }

  function isSameIconChooser(left, right) {
    return Boolean(
      left &&
      right &&
      left.target === right.target &&
      String(left.appId || "") === String(right.appId || "")
    );
  }

  function applyIconChooserIcon(icon) {
    if (!icon?.iconDataUrl || !iconChooser.value) return;
    if (iconChooser.value.target === "new") {
      newAppIconPath.value = icon.iconPath || null;
      newAppIconDataUrl.value = icon.iconDataUrl;
      closeIconChooser();
      return;
    }
    if (iconChooser.value.target === "edit") {
      editAppIconPath.value = icon.iconPath || null;
      editAppIconDataUrl.value = icon.iconDataUrl;
      isEditAppIconReset.value = false;
      closeIconChooser();
      return;
    }
    if (iconChooser.value.target === "existing") {
      updateAppCustomIcon(iconChooser.value.appId, icon);
      closeIconChooser();
    }
  }

  function chooseIconCandidate(choice) {
    applyIconChooserIcon(choice);
  }

  function handleIconChooserUpload(event) {
    const requestId = iconChooserRequestId;
    const chooser = iconChooser.value ? { ...iconChooser.value } : null;
    readImageFileAsCustomIcon(event, (icon) => {
      if (requestId !== iconChooserRequestId || !isSameIconChooser(chooser, iconChooser.value)) return;
      applyIconChooserIcon(icon);
    });
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
    const launchArgs = launchArgsForTarget(launchTarget, editAppArgs.value);
    const customIconPath = editAppIconPath.value;
    const customIconDataUrl = editAppIconDataUrl.value;

    const changed = updateManagedAppEverywhere(editingManagedAppId.value, (item) => {
      item.name = name;
      item.emoji = fallbackAppGlyph(name);
      item.launchTarget = launchTarget;
      if (launchArgs) item.launchArgs = launchArgs;
      else delete item.launchArgs;
      if (customIconPath) item.customIconPath = customIconPath;
      else delete item.customIconPath;
      delete item.customIconUrl;
      if (customIconDataUrl) item.customIconDataUrl = customIconDataUrl;
      else delete item.customIconDataUrl;
    });

    if (!changed) return;
    options.markLaunchCriticalLayoutDirty?.(editingManagedAppId.value);
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
      const scanResult = await scanApps(enabledRoots, scanFilters);
      const now = new Date().toISOString();
      const scannedRootIds = new Set(enabledRoots.map((root) => root.id));
      options.scanRoots.value = options.scanRoots.value.map((root) =>
        scannedRootIds.has(root.id) ? { ...root, lastScannedAt: now } : root
      );
      const existingApps = options.collectAppsFromPages(options.pages.value);
      const existingIds = new Set(existingApps.map((app) => app.id));
      const existingSourceKeys = new Set(existingApps.map((app) => app.sourceKey).filter(Boolean));
      const missingApps = (scanResult?.apps || [])
        .map(normalizeNativeApp)
        .filter((app) => !isAppBlockedByScanBlacklist(app, scanFilters.appBlacklist))
        .filter((app) => !existingIds.has(app.id) && !existingSourceKeys.has(app.sourceKey));
      scanResultApps.value = missingApps;
      scanResultWarnings.value = scanResult?.warnings || [];
      scanResultSelectedIds.value = missingApps.map((app) => app.id);
      isScanResultDialogOpen.value = true;
      syncManagedAppState();
    } catch (error) {
      openOperationFailedDialog({
        title: "无法扫描应用",
        message: "LaunchPad 无法扫描当前应用来源。",
        suggestion: "请检查扫描来源是否仍可访问，然后重试。",
      }, error);
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
      .filter((app) => selectedIds.has(app.id) && !existingIds.has(app.id) && !existingSourceKeys.has(app.sourceKey));
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
    const launchArgs = launchArgsForTarget(launchTarget, newAppArgs.value);
    const app = {
      id: options.makeId("custom-app"),
      type: "app",
      name,
      emoji: fallbackAppGlyph(name),
      launchTarget,
    };
    if (launchArgs) app.launchArgs = launchArgs;
    if (newAppIconPath.value) app.customIconPath = newAppIconPath.value;
    if (newAppIconDataUrl.value) app.customIconDataUrl = newAppIconDataUrl.value;
    options.commitPages(options.appendAppsToPages(options.pages.value, [app]));
    options.markLaunchCriticalLayoutDirty?.(app.id);
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
    canEditAppArgs,
    canEditNewAppArgs,
    canBrowseScanRoots,
    canBrowseLaunchFile,
    canScanManagedApps,
    browseScanRootDirectory,
    chooseIconCandidate,
    changeScanRootPath,
    changeScanRootLabel,
    clearManagedAppSelection,
    clearScanResultSelection,
    closeAddManagedAppPage,
    closeEditManagedApp,
    closeIconChooser,
    closeScanResultDialog,
    deleteManagedApp,
    deleteSelectedManagedApps,
    editAppArgs,
    editAppIconPath,
    editAppIconDataUrl,
    editingManagedApp,
    editAppName,
    editAppTarget,
    filteredManagedApps,
    getLaunchTargetPath,
    handleIconChooserUpload,
    iconChooser,
    iconChoices,
    iconChoicesError,
    isAddingManagedApp,
    ignoreManagedApp,
    ignoreSelectedManagedApps,
    isBrowsingEditAppTarget,
    isBrowsingNewAppTarget,
    isBrowsingScanRoot,
    isEditAppIconReset,
    isLoadingIconChoices,
    isScanningApps,
    isScanResultDialogOpen,
    managedApps,
    newAppArgs,
    newAppIconPath,
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
    scanResultWarnings,
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
    confirmResetScanRoots,
    removeScanAppBlacklistItem,
    removeScanKeywordBlacklistItem,
    updateAppCustomIcon,
  };
}
