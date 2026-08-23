import { computed, readonly, ref, shallowRef } from "vue";
import type { Ref } from "vue";
import { readErrorMessage } from "../application/errorMessage.js";
import {
  DEFAULT_SCAN_KEYWORD_BLACKLIST,
  canExcludeAppFromScan,
  compareAppsByDefaultOrder,
  createDefaultScanRoots,
  fallbackAppGlyph,
  isAppExcludedFromScan,
  makeScanAppExclusionEntry,
  makeLaunchTarget,
  normalizeNativeApp,
  normalizeScanAppBlacklist,
  normalizeScanKeywordAllowlist,
  normalizeScanKeywordBlacklist,
  normalizeScanRoots,
} from "../domain/launchpadData.js";
import type { CatalogRuntimeApp, NormalizedScanRoot } from "../domain/launchpadData.js";
import type {
  LaunchpadApp,
  LaunchpadItem,
  LaunchpadPages,
  ReadonlyLaunchpadApp,
  ReadonlyLaunchpadFolder,
  ReadonlyLaunchpadPages,
} from "../domain/launchpadLayout.js";
import type { LaunchTarget, ScanAppBlacklistEntry } from "../domain/layoutDocument.js";
import type { CatalogScanWarning, ScannedCatalogApp } from "../domain/applicationCatalog.js";
import type {
  AppIconChoice,
  LaunchTargetCheckResult,
  ScanAppsResult,
  ScanStats,
} from "../api/launchpadApi.js";
import { applyCachedIconAssetUrlsToApp } from "../domain/iconSource.js";
import { DEFAULT_SCAN_ROOTS } from "../platform/applicationCatalogDefaults.js";
import { catalogPort } from "../platform/launchpadPorts.js";
import type { CatalogPort } from "../platform/launchpadPorts.js";
import type { LocalizationText } from "../i18n/localization.js";
import { ICON_SIZE_MAX } from "./launchpadConstants.js";

const CUSTOM_ICON_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const CUSTOM_ICON_DATA_URL_MAX_LENGTH = 1_400_000;
const CUSTOM_ICON_MIN_SOURCE_SIZE = 16;
const CUSTOM_ICON_OUTPUT_MIN_SIZE = ICON_SIZE_MAX;
const CUSTOM_ICON_OUTPUT_MAX_SIZE = ICON_SIZE_MAX * 2;
const WINDOWS_APP_CATALOG_ROOT_TYPE = "windowsAppCatalog";
const SCAN_RESULT_TAB_AVAILABLE = "available";
const SCAN_RESULT_TAB_IGNORED = "ignored";

export type ScanResultTab = typeof SCAN_RESULT_TAB_AVAILABLE | typeof SCAN_RESULT_TAB_IGNORED;
export type LaunchTargetStatus = LaunchTargetCheckResult["status"];
export type ManagedAppIcon = Readonly<{ iconDataUrl: string; iconPath: string | null }>;
export type ManagedAppIconChoice = Readonly<{
  id: string;
  iconDataUrl: string;
  iconPath: string | null;
}>;
export type ManagedAppEditorSession = Readonly<{
  mode: "create" | "edit";
  originalAppId: string | null;
  originalTargetKind: string | null;
}>;
export type ManagedAppIconChooser =
  | Readonly<{ target: "editor"; title: string; subtitle: string }>
  | Readonly<{ target: "existing"; appId: string; title: string; subtitle: string }>;
export type LaunchpadAppsDialogConfig = Readonly<{
  title: string;
  message: string;
  suggestion?: string;
  intent: "error" | "warning";
  cancelText?: string;
  confirmText: string;
  onConfirm?: () => void;
}>;
export type LaunchpadAppsNotice = Readonly<{
  durationMs?: number;
  intent?: "error" | "info" | "success";
  message: string;
  title: string;
}>;
type RescanManagedAppsOptions = Readonly<{
  announceStart?: boolean;
}>;
export type LaunchpadAppsPersistenceFragment = Readonly<{
  hiddenAppIds?: unknown;
  scanRoots?: unknown;
  scanKeywordBlacklist?: unknown;
  scanKeywordAllowlist?: unknown;
  scanAppBlacklist?: unknown;
  showMissingLaunchTargetBadge?: unknown;
}>;
export type LaunchpadAppsOptions = Readonly<{
  appendAppsToPages: (sourcePages: ReadonlyLaunchpadPages, apps: readonly LaunchpadApp[]) => LaunchpadPages;
  cancelInputGesture?: () => void;
  catalogPort?: CatalogPort;
  clearFocusedIcon?: () => void;
  clonePages: (pages: ReadonlyLaunchpadPages) => LaunchpadPages;
  collectAppsFromPages: (pages: ReadonlyLaunchpadPages) => LaunchpadApp[];
  commitOpenFolder: (folderId: string | null) => unknown;
  commitPages: (pages: LaunchpadPages) => unknown;
  commitPagesAfterDeletion: (pages: LaunchpadPages) => unknown;
  findFolder: (
    pages: ReadonlyLaunchpadPages,
    folderId: string,
  ) => Readonly<{ item: ReadonlyLaunchpadFolder }> | null;
  focusedIcon?: Readonly<Ref<Readonly<{ id?: string }> | null>>;
  isDragActive: () => boolean;
  localizationText: Pick<LocalizationText, "t">;
  makeId: (prefix: string) => string;
  markLaunchCriticalLayoutDirty?: (appId: string) => void;
  openFolderId: Readonly<Ref<string | null>>;
  openScanKeywordSettings: () => void;
  openWarningDialog?: (config: LaunchpadAppsDialogConfig) => void;
  pages: Readonly<{ readonly value: ReadonlyLaunchpadPages }>;
  reclampPageIndices: () => unknown;
  removeEverywhere: (pages: ReadonlyLaunchpadPages, itemId: string) => LaunchpadPages;
  renderedFolder: Readonly<{ readonly value: ReadonlyLaunchpadFolder | null }>;
  schedulePageGridMetrics: () => void;
  shouldUseNativeCatalog: () => boolean;
  showTransientNotice?: (notice: LaunchpadAppsNotice) => void;
}>;

type RuntimeKeywordExcludedApp = Readonly<{ app: LaunchpadApp; matchedKeyword: string }>;
type LaunchTargetStatusRecord = Readonly<{ status: LaunchTargetStatus; targetSignature: string }>;
type LaunchTargetCheck = Readonly<{ id: string; launchTarget: LaunchTarget; targetSignature: string }>;
type ReadonlyLaunchTarget = NonNullable<ReadonlyLaunchpadApp["launchTarget"]>;
type OperationErrorConfig = Readonly<{ title: string; message: string; suggestion: string }>;
type FileInputEvent = Readonly<{ target?: (HTMLInputElement & { value: string }) | null }> | null | undefined;

export function getCustomIconCanvasSize(width: unknown, height: unknown): number {
  const sourceMax = Math.max(Number(width) || 0, Number(height) || 0);
  if (sourceMax <= 0) return CUSTOM_ICON_OUTPUT_MIN_SIZE;
  return Math.min(CUSTOM_ICON_OUTPUT_MAX_SIZE, Math.max(CUSTOM_ICON_OUTPUT_MIN_SIZE, sourceMax));
}

export function useLaunchpadApps(options: LaunchpadAppsOptions) {
  const catalog = options.catalogPort || catalogPort;
  const t = options.localizationText?.t;
  if (typeof options.commitPagesAfterDeletion !== "function") {
    throw new TypeError("useLaunchpadApps requires commitPagesAfterDeletion");
  }
  if (typeof options.reclampPageIndices !== "function") {
    throw new TypeError("useLaunchpadApps requires reclampPageIndices");
  }
  if (typeof options.openScanKeywordSettings !== "function") {
    throw new TypeError("useLaunchpadApps requires openScanKeywordSettings");
  }
  if (typeof t !== "function") {
    throw new TypeError("useLaunchpadApps requires localization text");
  }

  const appManagerSelectedIds = ref<string[]>([]);
  const appManagerSearchQuery = ref("");
  const scanResultActiveTab = ref<ScanResultTab>(SCAN_RESULT_TAB_AVAILABLE);
  const isScanResultDialogOpen = ref(false);
  const scanResultApps = ref<LaunchpadApp[]>([]);
  const scanResultKeywordExcludedApps = ref<RuntimeKeywordExcludedApp[]>([]);
  const scanResultStats = ref<ScanStats | null>(null);
  const scanResultWarnings = ref<CatalogScanWarning[]>([]);
  const scanResultSelectedIds = ref<string[]>([]);
  const newScanKeyword = ref("");
  const hiddenAppIds = ref<string[]>([]);
  const scanRoots = ref(createDefaultScanRoots({ roots: DEFAULT_SCAN_ROOTS, translate: t }));
  const scanKeywordBlacklist = ref([...DEFAULT_SCAN_KEYWORD_BLACKLIST]);
  const scanKeywordAllowlist = ref<string[]>([]);
  const scanAppBlacklist = ref<ScanAppBlacklistEntry[]>([]);
  const excludedCatalogApps = ref<LaunchpadApp[]>([]);
  const showMissingLaunchTargetBadge = ref(true);
  const launchTargetStatusRecordsById = ref<{ [id: string]: LaunchTargetStatusRecord }>({});
  const launchTargetStatusById = computed(() => Object.fromEntries(
    Object.entries(launchTargetStatusRecordsById.value).map(([id, record]) => [id, record.status])
  ));
  const editorSession = shallowRef<ManagedAppEditorSession | null>(null);
  const editorName = ref("");
  const editorTarget = ref("");
  const editorArgs = ref("");
  const editorIconPath = ref<string | null>(null);
  const editorIconDataUrl = ref<string | null>(null);
  const isEditorIconReset = ref(false);
  const isBrowsingEditorTarget = ref(false);
  const isScanningApps = ref(false);
  const browsingScanRootIds = ref<string[]>([]);
  const iconChooser = shallowRef<ManagedAppIconChooser | null>(null);
  const iconChoices = ref<ManagedAppIconChoice[]>([]);
  const iconChoicesError = ref("");
  const isLoadingIconChoices = ref(false);
  let iconChooserRequestId = 0;

  const managedApps = computed(() => options.collectAppsFromPages(options.pages.value).sort(compareAppsByDefaultOrder));
  const selectedManagedApps = computed(() => {
    const selectedIds = new Set(appManagerSelectedIds.value);
    return managedApps.value.filter((app) => selectedIds.has(app.id));
  });
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
  const excludedScanApps = computed(() => {
    const catalogAppsById = new Map(
      excludedCatalogApps.value.map((app) => [String(app.id).toLowerCase(), app])
    );
    return scanAppBlacklist.value.map((entry) => {
      const catalogApp = catalogAppsById.get(String(entry.catalogId).toLowerCase());
      if (!catalogApp) return entry;
      return {
        ...entry,
        ...catalogApp,
        catalogId: entry.catalogId,
        blockedAt: entry.blockedAt,
      };
    });
  });
  const selectedManagedAppCount = computed(() => appManagerSelectedIds.value.length);
  const canExcludeSelectedManagedAppsFromScan = computed(() => (
    selectedManagedAppCount.value > 0
    && selectedManagedApps.value.length === selectedManagedAppCount.value
    && selectedManagedApps.value.every(canExcludeManagedAppFromScan)
  ));
  const scanResultSelectedCount = computed(() => scanResultSelectedIds.value.length);
  const canAddScannedApps = computed(() => scanResultSelectedCount.value > 0);
  const editingManagedApp = computed(() => {
    const session = editorSession.value;
    return session?.mode === "edit"
      ? managedApps.value.find((app) => app.id === session.originalAppId) || null
      : null;
  });
  const isEditingAppUserModelId = computed(() => editingManagedApp.value?.launchTarget?.kind === "appUserModelId");
  const canSaveManagedAppEditor = computed(() => editorName.value.trim().length > 0 && editorTarget.value.trim().length > 0);
  const managedAppEditorGlyph = computed(() => fallbackAppGlyph(editorName.value));
  const canBrowseScanRoots = computed(() => options.shouldUseNativeCatalog());
  const canBrowseLaunchFile = computed(() => options.shouldUseNativeCatalog());
  const canScanManagedApps = computed(() => options.shouldUseNativeCatalog() && scanRoots.value.some((root) => root.enabled));
  const canEditManagedAppArgs = computed(() => !isEditingAppUserModelId.value && canUseLaunchArgsForTarget(editorTarget.value));

  function getLaunchTargetPath(
    app: Pick<ReadonlyLaunchpadApp, "launchTarget"> | null | undefined,
  ): string {
    const target = app?.launchTarget;
    if (target?.kind === "appUserModelId") {
      return target.appUserModelId || "";
    }
    return target?.path || "";
  }

  function toRuntimeCatalogApp(app: ScannedCatalogApp): CatalogRuntimeApp {
    return applyCachedIconAssetUrlsToApp(normalizeNativeApp(app), catalog.toAssetUrl);
  }

  function replaceExcludedCatalogApps(apps: readonly ScannedCatalogApp[]): CatalogRuntimeApp[] {
    const runtimeApps = apps.map(toRuntimeCatalogApp);
    excludedCatalogApps.value = runtimeApps;
    return runtimeApps;
  }

  function rememberExcludedCatalogApps(apps: readonly LaunchpadApp[]): void {
    const catalogAppsById = new Map(
      excludedCatalogApps.value.map((app) => [String(app.id).toLowerCase(), app])
    );
    for (const app of apps) {
      if (app?.origin !== "catalog" || !app.id) continue;
      catalogAppsById.set(String(app.id).toLowerCase(), { ...app });
    }
    excludedCatalogApps.value = Array.from(catalogAppsById.values());
  }

  function forgetExcludedCatalogApps(catalogIds: readonly string[]): void {
    const ids = new Set(catalogIds.map((id) => String(id).toLowerCase()));
    excludedCatalogApps.value = excludedCatalogApps.value.filter((app) => !ids.has(String(app.id).toLowerCase()));
  }

  function getFilesystemLaunchTargetPath(app: Pick<LaunchpadApp, "launchTarget"> | null | undefined): string {
    return app?.launchTarget?.kind === "appUserModelId" ? "" : app?.launchTarget?.path || "";
  }

  function isWindowsAppCatalogRoot(root: NormalizedScanRoot | null | undefined): boolean {
    return root?.type === WINDOWS_APP_CATALOG_ROOT_TYPE;
  }

  function canUseLaunchArgsForTarget(target: unknown): boolean {
    return makeLaunchTarget(target)?.kind === "executable";
  }

  function launchArgsForTarget(launchTarget: LaunchTarget | null | undefined, value: string): string {
    return launchTarget?.kind === "executable" ? value.trim() : "";
  }

  function updateAppCustomIcon(appId: string, icon: ManagedAppIcon | null): void {
    if (!appId || options.isDragActive()) return;
    const next = options.clonePages(options.pages.value);
    let changed = false;
    const customIconPath = icon?.iconPath || null;
    const customIconDataUrl = icon?.iconDataUrl || null;

    function updateItem(item: LaunchpadItem | null | undefined): void {
      if (!item) return;
      if (item.type === "app" && item.id === appId) {
        if (customIconPath) item.customIconPath = customIconPath;
        else delete item.customIconPath;
        if (item.origin === "catalog") {
          const overrides = { ...(item.presentationOverrides || {}) };
          if (customIconPath) overrides.customIconPath = customIconPath;
          else delete overrides.customIconPath;
          item.presentationOverrides = overrides;
        }
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
    }

    for (const page of next) {
      for (const item of page) updateItem(item);
    }
    if (!changed) return;
    options.commitPages(next);
    options.schedulePageGridMetrics();
  }

  function resetAppCustomIcon(appId: string): void {
    updateAppCustomIcon(appId, null);
  }

  function syncEditingManagedApp() {
    if (editorSession.value?.mode === "edit" && !editingManagedApp.value) closeManagedAppEditor();
  }

  function syncSelectedManagedApps() {
    const validIds = new Set(filteredManagedApps.value.map((app) => app.id));
    appManagerSelectedIds.value = appManagerSelectedIds.value.filter((id) => validIds.has(id));
  }

  function syncManagedAppState() {
    syncEditingManagedApp();
    syncSelectedManagedApps();
  }

  function toggleManagedAppSelection(appId: string, checked: unknown): void {
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

  function toggleMissingLaunchTargetBadge(checked: unknown): void {
    showMissingLaunchTargetBadge.value = Boolean(checked);
  }

  function toggleScanRootEnabled(rootId: string, checked: unknown): void {
    scanRoots.value = normalizeScanRoots(
      scanRoots.value.map((root) =>
        root.id === rootId ? { ...root, enabled: Boolean(checked) } : root
      )
    );
  }

  function changeScanRootPath(rootId: string, path: unknown): void {
    const root = scanRoots.value.find((item) => item.id === rootId);
    if (!root || isWindowsAppCatalogRoot(root)) return;
    scanRoots.value = normalizeScanRoots(
      scanRoots.value.map((root) =>
        root.id === rootId ? { ...root, path: String(path || "") } : root
      )
    );
  }

  function changeScanRootLabel(rootId: string, label: unknown): void {
    scanRoots.value = normalizeScanRoots(
      scanRoots.value.map((root) =>
        root.id === rootId ? { ...root, label: String(label || "") } : root
      )
    );
  }

  function removeScanRoot(rootId: string): void {
    const root = scanRoots.value.find((item) => item.id === rootId);
    if (!root || root.removable === false) return;
    scanRoots.value = scanRoots.value.filter((root) => root.id !== rootId);
  }

  function addScanRoot() {
    scanRoots.value = normalizeScanRoots([
      ...scanRoots.value,
      {
        id: options.makeId("root"),
        type: "customDirectory",
        label: t("settings.apps.sources.custom"),
        path: "%USERPROFILE%/Desktop",
        enabled: false,
        removable: true,
        maxDepth: 3,
        maxEntries: 5000,
      },
    ]);
  }

  function resetScanRootsToDefaults() {
    scanRoots.value = createDefaultScanRoots({ roots: DEFAULT_SCAN_ROOTS, translate: t });
  }

  function confirmResetScanRoots() {
    options.openWarningDialog?.({
      title: t("settings.apps.sources.resetTitle"),
      message: t("settings.apps.sources.resetMessage"),
      intent: "warning",
      cancelText: t("common.actions.cancel"),
      confirmText: t("settings.apps.sources.resetConfirm"),
      onConfirm: resetScanRootsToDefaults,
    });
  }

  function setBrowsingScanRoot(rootId: string, browsing: boolean): void {
    const ids = new Set(browsingScanRootIds.value);
    if (browsing) ids.add(rootId);
    else ids.delete(rootId);
    browsingScanRootIds.value = Array.from(ids);
  }

  function isBrowsingScanRoot(rootId: string): boolean {
    return browsingScanRootIds.value.includes(rootId);
  }

  function openOperationFailedDialog(config: OperationErrorConfig, error: unknown): void {
    const detail = readErrorMessage(error);
    options.openWarningDialog?.({
      title: config.title,
      message: config.message,
      suggestion: [config.suggestion, detail && t("settings.apps.operations.errorDetail", { detail })].filter(Boolean).join(" "),
      intent: "error",
      confirmText: t("notices.acknowledge"),
    });
  }

  async function browseScanRootDirectory(rootId: string): Promise<void> {
    const root = scanRoots.value.find((item) => item.id === rootId);
    if (!options.shouldUseNativeCatalog() || !root || isWindowsAppCatalogRoot(root) || isBrowsingScanRoot(rootId)) return;
    setBrowsingScanRoot(rootId, true);
    try {
      const selectedPath = await catalog.pickScanRoot();
      if (!selectedPath) return;
      changeScanRootPath(rootId, selectedPath);
    } catch (error) {
      openOperationFailedDialog({
        title: t("settings.apps.sources.chooseFailedTitle"),
        message: t("settings.apps.sources.chooseFailedMessage"),
        suggestion: t("settings.apps.sources.chooseFailedSuggestion"),
      }, error);
      console.error("Failed to pick scan root directory", error);
    } finally {
      setBrowsingScanRoot(rootId, false);
    }
  }

  function addScanKeywordBlacklistItem() {
    const keyword = newScanKeyword.value.trim();
    if (!keyword) return;
    scanKeywordBlacklist.value = normalizeScanKeywordBlacklist([
      ...scanKeywordBlacklist.value,
      keyword,
    ]);
    newScanKeyword.value = "";
  }

  function removeScanKeywordBlacklistItem(index: number): void {
    scanKeywordBlacklist.value = normalizeScanKeywordBlacklist(
      scanKeywordBlacklist.value.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  function showAppActionNotice(config: LaunchpadAppsNotice): void {
    options.showTransientNotice?.({
      durationMs: 3600,
      intent: "info",
      ...config,
    });
  }

  function cancelScanAppExclusions(indices: readonly unknown[] | null | undefined): boolean {
    const selectedIndices = Array.from(new Set((indices || [])
      .map(Number)
      .filter((index) => Number.isInteger(index) && index >= 0 && index < scanAppBlacklist.value.length)));
    if (!selectedIndices.length) return false;
    const selectedIndexSet = new Set(selectedIndices);
    const restoredEntries = scanAppBlacklist.value.filter((_, index) => selectedIndexSet.has(index));
    scanAppBlacklist.value = normalizeScanAppBlacklist(
      scanAppBlacklist.value.filter((_, index) => !selectedIndexSet.has(index))
    );
    forgetExcludedCatalogApps(restoredEntries.map((entry) => entry.catalogId));
    const singleName = restoredEntries.length === 1
      ? String(restoredEntries[0]?.name || t("settings.apps.operations.appFallback"))
      : "";
    showAppActionNotice({
      title: t("settings.apps.operations.restoredTitle"),
      message: restoredEntries.length === 1
        ? t("settings.apps.operations.restoredOne", { name: singleName })
        : t("settings.apps.operations.restoredMany", { count: restoredEntries.length }),
      intent: "success",
    });
    return true;
  }

  function cancelScanAppExclusion(index: number): boolean {
    return cancelScanAppExclusions([index]);
  }

  function toggleScanResultSelection(appId: string, checked: unknown): void {
    if (!appId) return;
    const selected = new Set(scanResultSelectedIds.value);
    if (checked) selected.add(appId);
    else selected.delete(appId);
    scanResultSelectedIds.value = Array.from(selected);
  }

  function selectAllScanResultApps() {
    const selected = new Set(scanResultSelectedIds.value);
    const activeIds = scanResultActiveTab.value === SCAN_RESULT_TAB_IGNORED
      ? scanResultKeywordExcludedApps.value.map((entry) => entry.app.id)
      : scanResultApps.value.map((app) => app.id);
    activeIds.forEach((id) => selected.add(id));
    scanResultSelectedIds.value = Array.from(selected);
  }

  function clearScanResultSelection() {
    const activeIds = new Set(scanResultActiveTab.value === SCAN_RESULT_TAB_IGNORED
      ? scanResultKeywordExcludedApps.value.map((entry) => entry.app.id)
      : scanResultApps.value.map((app) => app.id));
    scanResultSelectedIds.value = scanResultSelectedIds.value.filter((id) => !activeIds.has(id));
  }

  function closeScanResultDialog() {
    scanResultActiveTab.value = SCAN_RESULT_TAB_AVAILABLE;
    isScanResultDialogOpen.value = false;
    scanResultApps.value = [];
    scanResultKeywordExcludedApps.value = [];
    scanResultStats.value = null;
    scanResultWarnings.value = [];
    scanResultSelectedIds.value = [];
  }

  function selectScanResultTab(tab: unknown): void {
    if (tab !== SCAN_RESULT_TAB_AVAILABLE && tab !== SCAN_RESULT_TAB_IGNORED) return;
    scanResultActiveTab.value = tab;
  }

  function manageScanResultKeywords() {
    closeScanResultDialog();
    options.openScanKeywordSettings();
  }

  function resetManagedAppEditorDraft() {
    editorName.value = "";
    editorTarget.value = "";
    editorArgs.value = "";
    editorIconPath.value = null;
    editorIconDataUrl.value = null;
    isEditorIconReset.value = false;
    isBrowsingEditorTarget.value = false;
  }

  function openCreateManagedApp() {
    if (options.isDragActive()) return;
    closeManagedAppEditor();
    editorSession.value = { mode: "create", originalAppId: null, originalTargetKind: null };
  }

  function closeManagedAppEditor() {
    editorSession.value = null;
    if (iconChooser.value?.target === "editor") closeIconChooser();
    resetManagedAppEditorDraft();
  }

  function openIconErrorDialog(message: string): void {
    options.openWarningDialog?.({
      title: t("settings.apps.icon.errorTitle"),
      message,
      intent: "error",
      confirmText: t("notices.acknowledge"),
    });
  }

  function loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(t("settings.apps.icon.readFailed")));
      };
      image.src = url;
    });
  }

  function canvasToPngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error(t("settings.apps.icon.compressFailed")));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error(t("settings.apps.icon.compressFailed")));
        };
        reader.onerror = () => reject(new Error(t("settings.apps.icon.compressFailed")));
        reader.readAsDataURL(blob);
      }, "image/png");
    });
  }

  async function normalizeCustomIconFile(file: File): Promise<string> {
    if (!file.type || !file.type.startsWith("image/")) {
      throw new Error(t("settings.apps.icon.chooseImage"));
    }
    if (file.size > CUSTOM_ICON_SOURCE_MAX_BYTES) {
      throw new Error(t("settings.apps.icon.tooLarge"));
    }

    const image = await loadImageFromFile(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width < CUSTOM_ICON_MIN_SOURCE_SIZE || height < CUSTOM_ICON_MIN_SOURCE_SIZE) {
      throw new Error(t("settings.apps.icon.tooSmall"));
    }

    const canvasSize = getCustomIconCanvasSize(width, height);
    const scale = Math.min(canvasSize / width, canvasSize / height);
    const drawWidth = Math.max(1, Math.round(width * scale));
    const drawHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(t("settings.apps.icon.compressFailed"));
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
      throw new Error(t("settings.apps.icon.compressedTooLarge"));
    }
    return dataUrl;
  }

  async function cacheCustomIconDataUrl(dataUrl: string): Promise<ManagedAppIcon> {
    if (!options.shouldUseNativeCatalog()) return { iconDataUrl: dataUrl, iconPath: null };
    const cached = await catalog.cacheCustomIcon(dataUrl);
    if (!cached?.iconPath) throw new Error(t("settings.apps.icon.cacheFailed"));
    return {
      iconPath: cached.iconPath,
      iconDataUrl: cached.iconDataUrl || dataUrl,
    };
  }

  async function readImageFileAsCustomIcon(
    event: FileInputEvent,
    callback: (icon: ManagedAppIcon) => void,
  ): Promise<void> {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await normalizeCustomIconFile(file);
      callback(await cacheCustomIconDataUrl(dataUrl));
    } catch (error) {
      openIconErrorDialog(readErrorMessage(error) || t("settings.apps.icon.processFailed"));
    } finally {
      input.value = "";
    }
  }

  function resetManagedAppEditorIcon() {
    editorIconPath.value = null;
    editorIconDataUrl.value = null;
    isEditorIconReset.value = editorSession.value?.mode === "edit";
  }

  async function browseManagedAppTarget(): Promise<void> {
    if (
      !editorSession.value
      || !options.shouldUseNativeCatalog()
      || isEditingAppUserModelId.value
      || isBrowsingEditorTarget.value
    ) return;
    isBrowsingEditorTarget.value = true;
    try {
      const selectedFile = await catalog.pickLaunchFile();
      if (!selectedFile) return;
      editorName.value = String(selectedFile.name || "").trim() || editorName.value;
      editorTarget.value = String(selectedFile.launchTarget?.path || selectedFile.path || "").trim();
      editorArgs.value = selectedFile.launchTarget?.kind === "executable" ? String(selectedFile.launchArgs || "").trim() : "";
      editorIconPath.value = selectedFile.iconPath || null;
      editorIconDataUrl.value = selectedFile.iconDataUrl || null;
      isEditorIconReset.value = false;
    } catch (error) {
      openOperationFailedDialog({
        title: t("settings.apps.targetPicker.failedTitle"),
        message: t("settings.apps.targetPicker.failedMessage"),
        suggestion: t("settings.apps.targetPicker.failedSuggestion"),
      }, error);
      console.error("Failed to pick launch file", error);
    } finally {
      isBrowsingEditorTarget.value = false;
    }
  }

  function openEditManagedApp(app: ReadonlyLaunchpadApp | null | undefined): void {
    if (!app || options.isDragActive()) return;
    closeManagedAppEditor();
    editorSession.value = {
      mode: "edit",
      originalAppId: app.id,
      originalTargetKind: app.launchTarget?.kind || null,
    };
    editorName.value = app.name || "";
    editorTarget.value = getLaunchTargetPath(app);
    editorArgs.value = typeof app.launchArgs === "string" ? app.launchArgs : "";
    editorIconPath.value = app.customIconPath || null;
    editorIconDataUrl.value = app.customIconDataUrl || null;
  }

  function normalizeIconChoices(choices: readonly AppIconChoice[]): ManagedAppIconChoice[] {
    return (choices || [])
      .map((choice, index) => ({
        id: String(choice?.id || `icon-choice-${index}`),
        iconPath: choice?.iconPath || null,
        iconDataUrl: choice?.iconDataUrl || null,
      }))
      .filter((choice): choice is ManagedAppIconChoice => Boolean(choice.iconDataUrl));
  }

  function getIconChooserSourcePath(chooser: ManagedAppIconChooser | null | undefined): string {
    if (chooser?.target === "editor") {
      return isEditingAppUserModelId.value ? "" : editorTarget.value.trim();
    }
    if (chooser?.target === "existing") {
      const app = managedApps.value.find((item) => item.id === chooser.appId);
      return getFilesystemLaunchTargetPath(app).trim();
    }
    return "";
  }

  async function loadIconChoicesForChooser(chooser: ManagedAppIconChooser): Promise<void> {
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
      const choices = await catalog.loadIconChoices(targetPath);
      if (requestId !== iconChooserRequestId) return;
      iconChoices.value = normalizeIconChoices(choices);
    } catch (error) {
      if (requestId === iconChooserRequestId) {
        iconChoices.value = [];
        iconChoicesError.value = t("settings.apps.icon.loadChoicesFailed");
      }
      console.error("Failed to load app icon choices", error);
    } finally {
      if (requestId === iconChooserRequestId) isLoadingIconChoices.value = false;
    }
  }

  function openIconChooser(chooser: ManagedAppIconChooser | null | undefined): void {
    if (!chooser || options.isDragActive()) return;
    iconChooser.value = chooser;
    loadIconChoicesForChooser(chooser);
  }

  function openManagedAppEditorIconChooser() {
    if (!editorSession.value) return;
    openIconChooser({
      target: "editor",
      title: t("settings.apps.icon.change"),
      subtitle: editorName.value.trim() || (editorSession.value.mode === "edit"
        ? t("dialogs.appEditor.editTitle")
        : t("dialogs.appEditor.addTitle")),
    });
  }

  function openExistingAppIconChooser(appId: string): void {
    if (!appId) return;
    const app = managedApps.value.find((item) => item.id === appId);
    if (!app) return;
    openIconChooser({
      target: "existing",
      appId,
      title: t("settings.apps.icon.change"),
      subtitle: app.name || t("settings.apps.icon.appFallback"),
    });
  }

  function closeIconChooser() {
    iconChooserRequestId += 1;
    iconChooser.value = null;
    iconChoices.value = [];
    iconChoicesError.value = "";
    isLoadingIconChoices.value = false;
  }

  function isSameIconChooser(
    left: ManagedAppIconChooser | null,
    right: ManagedAppIconChooser | null,
  ): boolean {
    return Boolean(
      left &&
      right &&
      left.target === right.target &&
      String(left.target === "existing" ? left.appId : "") ===
        String(right.target === "existing" ? right.appId : "")
    );
  }

  function applyIconChooserIcon(icon: ManagedAppIcon): void {
    if (!icon?.iconDataUrl || !iconChooser.value) return;
    if (iconChooser.value.target === "editor") {
      editorIconPath.value = icon.iconPath || null;
      editorIconDataUrl.value = icon.iconDataUrl;
      isEditorIconReset.value = false;
      closeIconChooser();
      return;
    }
    if (iconChooser.value.target === "existing") {
      updateAppCustomIcon(iconChooser.value.appId, icon);
      closeIconChooser();
    }
  }

  function chooseIconCandidate(choice: ManagedAppIconChoice): void {
    applyIconChooserIcon(choice);
  }

  function handleIconChooserUpload(event: FileInputEvent): void {
    const requestId = iconChooserRequestId;
    const chooser = iconChooser.value ? { ...iconChooser.value } : null;
    readImageFileAsCustomIcon(event, (icon) => {
      if (requestId !== iconChooserRequestId || !isSameIconChooser(chooser, iconChooser.value)) return;
      applyIconChooserIcon(icon);
    });
  }

  function updateManagedAppEverywhere(appId: string, updater: (item: LaunchpadApp) => void): boolean {
    if (!appId || typeof updater !== "function") return false;
    const next = options.clonePages(options.pages.value);
    let changed = false;

    function updateItem(item: LaunchpadItem | null | undefined): void {
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
    }

    for (const page of next) {
      for (const item of page) updateItem(item);
    }
    if (!changed) return false;
    options.commitPages(next);
    return true;
  }

  function updateManagedAppFromEditor() {
    const appId = editorSession.value?.originalAppId;
    if (!appId || !editingManagedApp.value) return false;
    const name = editorName.value.trim().slice(0, 64);
    const originalLaunchTarget = editingManagedApp.value?.launchTarget;
    const appUserModelId = originalLaunchTarget?.kind === "appUserModelId"
      ? String(originalLaunchTarget.appUserModelId || "").trim()
      : "";
    const launchTarget: LaunchTarget | null = originalLaunchTarget?.kind === "appUserModelId"
      ? (appUserModelId ? { kind: "appUserModelId", appUserModelId } : null)
      : makeLaunchTarget(editorTarget.value);
    if (!name || !launchTarget) return false;
    const launchArgs = launchArgsForTarget(launchTarget, editorArgs.value);
    const customIconPath = editorIconPath.value;
    const customIconDataUrl = editorIconDataUrl.value;
    const isCatalogApp = editingManagedApp.value.origin === "catalog";
    const targetChanged = launchTargetSignature(originalLaunchTarget) !== launchTargetSignature(launchTarget)
      || String(editingManagedApp.value.launchArgs || "").trim() !== launchArgs;
    const nextAppId = isCatalogApp && targetChanged ? options.makeId("manual-app") : appId;

    const changed = updateManagedAppEverywhere(appId, (item) => {
      if (isCatalogApp && targetChanged) {
        item.id = nextAppId;
        item.origin = "manual";
        delete item.catalogPresentation;
        delete item.presentationOverrides;
        delete item.trackingKey;
        delete item.identityStatus;
        delete item.sources;
      }
      item.name = name;
      item.emoji = fallbackAppGlyph(name);
      if (!isCatalogApp || targetChanged) {
        item.launchTarget = launchTarget;
        if (launchArgs) item.launchArgs = launchArgs;
        else delete item.launchArgs;
      }
      if (customIconPath) item.customIconPath = customIconPath;
      else delete item.customIconPath;
      delete item.customIconUrl;
      if (customIconDataUrl) item.customIconDataUrl = customIconDataUrl;
      else delete item.customIconDataUrl;
      if (isCatalogApp && !targetChanged) {
        const overrides = { ...(item.presentationOverrides || {}) };
        const catalogName = String(item.catalogPresentation?.name || "");
        const catalogEmoji = String(item.catalogPresentation?.emoji || "");
        if (name && name !== catalogName) overrides.name = name;
        else delete overrides.name;
        if (item.emoji && item.emoji !== catalogEmoji) overrides.emoji = item.emoji;
        else delete overrides.emoji;
        if (customIconPath) overrides.customIconPath = customIconPath;
        else delete overrides.customIconPath;
        item.presentationOverrides = overrides;
      }
    });

    if (!changed) return false;
    if (isCatalogApp && targetChanged) {
      hiddenAppIds.value = Array.from(new Set([...hiddenAppIds.value, appId]));
    }
    options.reclampPageIndices();
    options.markLaunchCriticalLayoutDirty?.(nextAppId);
    options.schedulePageGridMetrics();
    return true;
  }

  function applyManagedAppRemoval(appIds: readonly string[] | null | undefined): LaunchpadApp[] | undefined {
    if (options.isDragActive()) return;
    const ids = Array.from(new Set((appIds || []).filter(Boolean)));
    if (!ids.length) return [];
    const idSet = new Set(ids);
    const removedApps = managedApps.value.filter((app) => idSet.has(app.id));
    if (!removedApps.length) return [];
    const removedIds = removedApps.map((app) => app.id);

    options.cancelInputGesture?.();
    const firstRemovedId = removedIds[0];
    if (!firstRemovedId) return [];
    let next = options.removeEverywhere(options.pages.value, firstRemovedId);
    for (const id of removedIds.slice(1)) next = options.removeEverywhere(next, id);
    const removedCatalogIds = removedApps
      .filter((app) => app.origin === "catalog")
      .map((app) => app.id);
    hiddenAppIds.value = Array.from(new Set([...hiddenAppIds.value, ...removedCatalogIds]));
    options.commitPagesAfterDeletion(next);
    const removedIdSet = new Set(removedIds);
    const focusedId = options.focusedIcon?.value?.id;
    if (focusedId && removedIdSet.has(focusedId)) options.clearFocusedIcon?.();
    appManagerSelectedIds.value = appManagerSelectedIds.value.filter((id) => !removedIdSet.has(id));
    const editedId = editorSession.value?.originalAppId;
    if (editedId && removedIdSet.has(editedId)) closeManagedAppEditor();
    if (options.renderedFolder.value && options.openFolderId.value && !options.findFolder(options.pages.value, options.openFolderId.value)) {
      options.commitOpenFolder(null);
    }
    options.schedulePageGridMetrics();
    return removedApps;
  }

  function showManagedAppsRemovedNotice(removedApps: readonly LaunchpadApp[]): void {
    if (!removedApps.length) return;
    showAppActionNotice({
      title: t("settings.apps.operations.removedTitle"),
      message: removedApps.length === 1
        ? t("settings.apps.operations.removedOne", { name: removedApps[0]!.name })
        : t("settings.apps.operations.removedMany", { count: removedApps.length }),
    });
  }

  function removeManagedAppsFromLaunchpad(appIds: readonly string[]): boolean {
    const removedApps = applyManagedAppRemoval(appIds) || [];
    showManagedAppsRemovedNotice(removedApps);
    return removedApps.length > 0;
  }

  function removeManagedAppFromLaunchpad(appId: string): boolean {
    return removeManagedAppsFromLaunchpad([appId]);
  }

  function removeSelectedManagedAppsFromLaunchpad() {
    return removeManagedAppsFromLaunchpad(appManagerSelectedIds.value);
  }

  function canExcludeManagedAppFromScan(
    app: Pick<ReadonlyLaunchpadApp, "id" | "origin">,
  ): boolean {
    return canExcludeAppFromScan(app);
  }

  function excludeManagedAppsFromScan(
    apps: readonly Pick<ReadonlyLaunchpadApp, "id">[],
  ): boolean {
    if (options.isDragActive()) return false;
    const requestedApps = Array.from(new Map((apps || [])
      .filter((app) => app?.id)
      .map((app) => [app.id, app])).values());
    if (!requestedApps.length) return false;
    const currentById = new Map(managedApps.value.map((app) => [app.id, app]));
    const currentApps = requestedApps
      .map((app) => currentById.get(app.id))
      .filter((app): app is LaunchpadApp => app !== undefined);
    if (currentApps.length !== requestedApps.length || !currentApps.every(canExcludeManagedAppFromScan)) {
      showAppActionNotice({
        title: t("settings.apps.operations.excludeFailedTitle"),
        message: t("settings.apps.operations.excludeUnstable"),
        intent: "error",
      });
      return false;
    }

    const entries = currentApps.map(makeScanAppExclusionEntry);
    const previousBlacklist = normalizeScanAppBlacklist(scanAppBlacklist.value);
    const nextBlacklist = normalizeScanAppBlacklist([
      ...previousBlacklist,
      ...entries,
    ]);
    if (!currentApps.every((app) => isAppExcludedFromScan(app, nextBlacklist))) {
      showAppActionNotice({
        title: t("settings.apps.operations.excludeFailedTitle"),
        message: t("settings.apps.operations.excludeSaveFailed"),
        intent: "error",
      });
      return false;
    }

    scanAppBlacklist.value = nextBlacklist;
    const removedApps = applyManagedAppRemoval(currentApps.map((app) => app.id)) || [];
    if (removedApps.length !== currentApps.length) {
      scanAppBlacklist.value = previousBlacklist;
      showAppActionNotice({
        title: t("settings.apps.operations.excludeChangedTitle"),
        message: t("settings.apps.operations.excludeChanged"),
        intent: "error",
      });
      return false;
    }
    rememberExcludedCatalogApps(removedApps);

    showAppActionNotice({
      title: t("settings.apps.operations.excludedTitle"),
      message: removedApps.length === 1
        ? t("settings.apps.operations.excludedOne", { name: removedApps[0]!.name })
        : t("settings.apps.operations.excludedMany", { count: removedApps.length }),
    });
    return true;
  }

  function excludeManagedAppFromScan(app: ReadonlyLaunchpadApp): boolean {
    return excludeManagedAppsFromScan([app]);
  }

  function excludeSelectedManagedAppsFromScan() {
    return excludeManagedAppsFromScan(appManagerSelectedIds.value.map((id) => ({ id })));
  }

  async function rescanManagedApps(scanOptions: RescanManagedAppsOptions = {}): Promise<void> {
    if (!options.shouldUseNativeCatalog() || isScanningApps.value) return;
    isScanningApps.value = true;
    try {
      if (scanOptions.announceStart === true) {
        showAppActionNotice({
          title: t("settings.apps.operations.scanStartedTitle"),
          message: t("settings.apps.operations.scanStartedMessage"),
        });
      }
      const enabledRoots = normalizeScanRoots(scanRoots.value).filter((root) => root.enabled);
      const scanFilters = {
        keywordBlacklist: normalizeScanKeywordBlacklist(scanKeywordBlacklist.value),
        keywordAllowlist: normalizeScanKeywordAllowlist(scanKeywordAllowlist.value),
        appBlacklist: normalizeScanAppBlacklist(scanAppBlacklist.value),
      };
      const scanResult = await catalog.scan(enabledRoots, scanFilters);
      if (!scanResult) throw new Error(t("settings.apps.operations.scanFailedMessage"));
      replaceExcludedCatalogApps(scanResult.excludedApps);
      const now = new Date().toISOString();
      const scannedRootIds = new Set(enabledRoots.map((root) => root.id));
      scanRoots.value = scanRoots.value.map((root) =>
        scannedRootIds.has(root.id) ? { ...root, lastScannedAt: now } : root
      );
      const existingApps = options.collectAppsFromPages(options.pages.value);
      const existingIds = new Set(existingApps.map((app) => app.id));
      const missingApps = (scanResult?.apps || [])
        .map((app) => applyCachedIconAssetUrlsToApp(
          normalizeNativeApp(app),
          catalog.toAssetUrl
        ))
        .filter((app) => !isAppExcludedFromScan(app, scanFilters.appBlacklist))
        .filter((app) => !existingIds.has(app.id));
      const keywordExcludedApps = (scanResult?.keywordExcludedApps || [])
        .map((entry) => ({
          app: applyCachedIconAssetUrlsToApp(normalizeNativeApp(entry.app), catalog.toAssetUrl),
          matchedKeyword: entry.matchedKeyword,
        }))
        .filter((entry) => !existingIds.has(entry.app.id));
      scanResultApps.value = missingApps;
      scanResultActiveTab.value = missingApps.length || !scanResult.stats.keywordExcludedApps
        ? SCAN_RESULT_TAB_AVAILABLE
        : SCAN_RESULT_TAB_IGNORED;
      scanResultKeywordExcludedApps.value = keywordExcludedApps;
      scanResultStats.value = scanResult.stats;
      scanResultWarnings.value = [...scanResult.warnings];
      scanResultSelectedIds.value = missingApps.map((app) => app.id);
      isScanResultDialogOpen.value = true;
      syncManagedAppState();
    } catch (error) {
      openOperationFailedDialog({
        title: t("settings.apps.operations.scanFailedTitle"),
        message: t("settings.apps.operations.scanFailedMessage"),
        suggestion: t("settings.apps.operations.scanFailedSuggestion"),
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
    const keywordExcludedApps = scanResultKeywordExcludedApps.value.map((entry) => entry.app);
    const selectableApps = [...scanResultApps.value, ...keywordExcludedApps];
    const admittedIds = new Set(
      selectableApps.filter((app) => selectedIds.has(app.id)).map((app) => app.id)
    );
    const deferredIds = scanResultApps.value
      .filter((app) => !selectedIds.has(app.id))
      .map((app) => app.id);
    hiddenAppIds.value = Array.from(new Set([
      ...hiddenAppIds.value.filter((id) => !admittedIds.has(id)),
      ...deferredIds,
    ]));
    const selectedKeywordExcludedIds = keywordExcludedApps
      .filter((app) => selectedIds.has(app.id))
      .map((app) => app.id);
    scanKeywordAllowlist.value = normalizeScanKeywordAllowlist([
      ...scanKeywordAllowlist.value,
      ...selectedKeywordExcludedIds,
    ]);
    const selectedApps = selectableApps
      .filter((app) => selectedIds.has(app.id) && !existingIds.has(app.id));
    if (!selectedApps.length) {
      closeScanResultDialog();
      syncManagedAppState();
      return;
    }

    options.commitPages(options.appendAppsToPages(options.pages.value, selectedApps));
    options.reclampPageIndices();
    closeScanResultDialog();
    syncManagedAppState();
    options.schedulePageGridMetrics();
  }

  function createManagedAppFromEditor() {
    const name = editorName.value.trim().slice(0, 64);
    if (!name) return false;
    const launchTarget = makeLaunchTarget(editorTarget.value);
    if (!launchTarget) return false;
    const launchArgs = launchArgsForTarget(launchTarget, editorArgs.value);
    const app: LaunchpadApp = {
      id: options.makeId("manual-app"),
      type: "app",
      origin: "manual",
      name,
      emoji: fallbackAppGlyph(name),
      launchTarget,
    };
    if (launchArgs) app.launchArgs = launchArgs;
    if (editorIconPath.value) app.customIconPath = editorIconPath.value;
    if (editorIconDataUrl.value) app.customIconDataUrl = editorIconDataUrl.value;
    options.commitPages(options.appendAppsToPages(options.pages.value, [app]));
    options.reclampPageIndices();
    options.markLaunchCriticalLayoutDirty?.(app.id);
    options.schedulePageGridMetrics();
    return true;
  }

  function saveManagedAppEditor() {
    if (options.isDragActive() || !editorSession.value || !canSaveManagedAppEditor.value) return false;
    const saved = editorSession.value.mode === "edit"
      ? updateManagedAppFromEditor()
      : createManagedAppFromEditor();
    if (saved) closeManagedAppEditor();
    return saved;
  }

  function capturePersistence() {
    return {
      hiddenAppIds: [...hiddenAppIds.value],
      scanRoots: scanRoots.value.map((root) => ({ ...root })),
      scanKeywordBlacklist: [...scanKeywordBlacklist.value],
      scanKeywordAllowlist: [...scanKeywordAllowlist.value],
      scanAppBlacklist: scanAppBlacklist.value.map((entry) => ({ ...entry })),
      showMissingLaunchTargetBadge: showMissingLaunchTargetBadge.value,
    };
  }

  function restorePersistence(fragment: LaunchpadAppsPersistenceFragment = {}): void {
    hiddenAppIds.value = Array.isArray(fragment.hiddenAppIds)
      ? Array.from(new Set(fragment.hiddenAppIds.map(String)))
      : [];
    scanRoots.value = Array.isArray(fragment.scanRoots)
      ? normalizeScanRoots(fragment.scanRoots)
      : createDefaultScanRoots({ roots: DEFAULT_SCAN_ROOTS, translate: t });
    scanKeywordBlacklist.value = Array.isArray(fragment.scanKeywordBlacklist)
      ? normalizeScanKeywordBlacklist(fragment.scanKeywordBlacklist)
      : [...DEFAULT_SCAN_KEYWORD_BLACKLIST];
    scanKeywordAllowlist.value = normalizeScanKeywordAllowlist(fragment.scanKeywordAllowlist);
    scanAppBlacklist.value = normalizeScanAppBlacklist(fragment.scanAppBlacklist);
    excludedCatalogApps.value = [];
    showMissingLaunchTargetBadge.value = fragment.showMissingLaunchTargetBadge !== false;
    syncManagedAppState();
  }

  function launchTargetSignature(
    launchTarget: ReadonlyLaunchTarget | LaunchTarget | null | undefined,
  ): string {
    return JSON.stringify([
      String(launchTarget?.kind || ""),
      String(launchTarget?.path || "").trim(),
      String(launchTarget?.appUserModelId || "").trim(),
    ]);
  }

  function listLaunchTargets(): LaunchTargetCheck[] {
    return managedApps.value
      .filter((app) => app?.id && app.launchTarget)
      .map((app) => ({
        id: String(app.id),
        launchTarget: app.launchTarget as LaunchTarget,
        targetSignature: launchTargetSignature(app.launchTarget),
      }));
  }

  function launchTargetCheckSignature(checks: readonly LaunchTargetCheck[] = listLaunchTargets()): string {
    return JSON.stringify(
      checks
        .map((app): [string, string] => [app.id, app.targetSignature])
        .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    );
  }

  function clearLaunchTargetStatuses() {
    launchTargetStatusRecordsById.value = {};
  }

  function applyLaunchTargetStatuses(
    results: readonly LaunchTargetCheckResult[],
    requestedChecks: readonly LaunchTargetCheck[] = listLaunchTargets(),
  ): { [id: string]: LaunchTargetStatus } {
    const requestedSignatureById = new Map(
      requestedChecks.map((app) => [String(app.id), app.targetSignature])
    );
    const currentSignatureById = new Map(
      listLaunchTargets().map((app) => [app.id, app.targetSignature])
    );
    launchTargetStatusRecordsById.value = Object.fromEntries(
      (results || [])
        .map((result) => {
          const id = String(result?.id || "");
          const expectedSignature = requestedSignatureById.get(id);
          if (!id || !expectedSignature || currentSignatureById.get(id) !== expectedSignature) return null;
          return [id, { status: result.status, targetSignature: expectedSignature }];
        })
        .filter((entry): entry is [string, LaunchTargetStatusRecord] => entry !== null)
    );
    return launchTargetStatusById.value;
  }

  function pruneLaunchTargetStatuses() {
    const currentSignatureById = new Map(
      listLaunchTargets().map((app) => [app.id, app.targetSignature])
    );
    launchTargetStatusRecordsById.value = Object.fromEntries(
      Object.entries(launchTargetStatusRecordsById.value)
        .filter(([id, record]) => currentSignatureById.get(id) === record.targetSignature)
    );
  }

  function getLaunchTargetStatus(app: ReadonlyLaunchpadApp | null | undefined): LaunchTargetStatus | null {
    const record = launchTargetStatusRecordsById.value[String(app?.id || "")];
    return record?.targetSignature === launchTargetSignature(app?.launchTarget)
      ? record.status
      : null;
  }

  function captureNativeScanRequest() {
    return {
      roots: normalizeScanRoots(scanRoots.value).filter((root) => root.enabled),
      filters: {
        keywordBlacklist: normalizeScanKeywordBlacklist(scanKeywordBlacklist.value),
        keywordAllowlist: normalizeScanKeywordAllowlist(scanKeywordAllowlist.value),
        appBlacklist: normalizeScanAppBlacklist(scanAppBlacklist.value),
      },
    };
  }

  function markScanRootsScanned(rootIds: readonly string[], scannedAt = new Date().toISOString()): void {
    const ids = new Set(rootIds || []);
    scanRoots.value = scanRoots.value.map((root) => (
      ids.has(root.id) ? { ...root, lastScannedAt: scannedAt } : root
    ));
  }

  async function scanInitialCatalog() {
    const request = captureNativeScanRequest();
    if (!request.roots.length) {
      replaceExcludedCatalogApps([]);
      return {
        apps: [],
        excludedApps: [],
        keywordExcludedApps: [],
        warnings: [],
        stats: {
          dirsVisited: 0,
          entriesSeen: 0,
          physicalAppsFound: 0,
          startMenuOverlays: 0,
          equivalentAppsMerged: 0,
          unresolvedApps: 0,
          keywordExcludedApps: 0,
          excludedApps: 0,
          appsFound: 0,
          limitReached: false,
        },
      };
    }
    const result = await catalog.scan(request.roots, request.filters);
    if (!result) throw new Error("Initial native catalog scan returned no result");
    if (result?.warnings?.length) {
      console.warn("Lumeria scan completed with warnings", result.warnings);
    }
    const excludedApps = replaceExcludedCatalogApps(result.excludedApps);
    markScanRootsScanned(request.roots.map((root) => root.id));
    return {
      apps: (result?.apps || [])
        .map((app) => normalizeNativeApp(app))
        .filter((app) => !isAppExcludedFromScan(app, request.filters.appBlacklist)),
      excludedApps,
      keywordExcludedApps: result?.keywordExcludedApps || [],
      warnings: result?.warnings || [],
      stats: result?.stats || {},
    };
  }

  const editorModel = Object.freeze({
    app: editingManagedApp,
    args: editorArgs,
    canBrowseTarget: computed(() => (
      canBrowseLaunchFile.value && !isEditingAppUserModelId.value && !isBrowsingEditorTarget.value
    )),
    canEditArgs: canEditManagedAppArgs,
    canSave: canSaveManagedAppEditor,
    glyph: managedAppEditorGlyph,
    iconDataUrl: editorIconDataUrl,
    iconPath: editorIconPath,
    isBrowsingTarget: readonly(isBrowsingEditorTarget),
    isIconReset: readonly(isEditorIconReset),
    isOpen: computed(() => Boolean(editorSession.value)),
    mode: computed(() => editorSession.value?.mode || null),
    name: editorName,
    session: readonly(editorSession),
    target: editorTarget,
    targetReadOnly: isEditingAppUserModelId,
    actions: Object.freeze({
      browseTarget: browseManagedAppTarget,
      cancel: closeManagedAppEditor,
      openCreate: openCreateManagedApp,
      openEdit: openEditManagedApp,
      openIconChooser: openManagedAppEditorIconChooser,
      resetIcon: resetManagedAppEditorIcon,
      save: saveManagedAppEditor,
    }),
  });
  const iconChooserModel = Object.freeze({
    chooser: readonly(iconChooser),
    choices: readonly(iconChoices),
    error: readonly(iconChoicesError),
    isLoading: readonly(isLoadingIconChoices),
    actions: Object.freeze({
      choose: chooseIconCandidate,
      close: closeIconChooser,
      upload: handleIconChooserUpload,
    }),
  });
  const scanResultModel = Object.freeze({
    activeTab: readonly(scanResultActiveTab),
    apps: readonly(scanResultApps),
    canAdd: canAddScannedApps,
    isOpen: readonly(isScanResultDialogOpen),
    keywordExcludedApps: readonly(scanResultKeywordExcludedApps),
    selectedCount: scanResultSelectedCount,
    selectedIds: readonly(scanResultSelectedIds),
    stats: readonly(scanResultStats),
    warnings: readonly(scanResultWarnings),
    getLaunchTargetPath,
    actions: Object.freeze({
      addSelected: addSelectedScannedApps,
      clearSelection: clearScanResultSelection,
      close: closeScanResultDialog,
      manageKeywords: manageScanResultKeywords,
      selectTab: selectScanResultTab,
      selectAll: selectAllScanResultApps,
      toggleSelection: toggleScanResultSelection,
    }),
  });
  const presentation = Object.freeze({
    excludedScanApps: readonly(excludedScanApps),
    hiddenAppIds: readonly(hiddenAppIds),
    launchTargetStatusById: readonly(launchTargetStatusById),
    scanAppBlacklist: readonly(scanAppBlacklist),
    scanKeywordAllowlist: readonly(scanKeywordAllowlist),
    scanKeywordBlacklist: readonly(scanKeywordBlacklist),
    scanRoots: readonly(scanRoots),
    showMissingLaunchTargetBadge: readonly(showMissingLaunchTargetBadge),
  });
  const nativeIntegration = Object.freeze({
    applyLaunchTargetStatuses,
    captureScanRequest: captureNativeScanRequest,
    clearLaunchTargetStatuses,
    getLaunchTargetStatus,
    launchTargetCheckSignature,
    listLaunchTargets,
    markScanRootsScanned,
    pruneLaunchTargetStatuses,
    scanInitialCatalog,
    shouldCheckLaunchTargets: () => showMissingLaunchTargetBadge.value,
  });

  return {
    addScanKeywordBlacklistItem,
    addScanRoot,
    appManagerSearchQuery,
    appManagerSelectedIds,
    browseScanRootDirectory,
    canBrowseScanRoots,
    canExcludeManagedAppFromScan,
    canExcludeSelectedManagedAppsFromScan,
    canScanManagedApps,
    cancelScanAppExclusion,
    cancelScanAppExclusions,
    changeScanRootLabel,
    changeScanRootPath,
    clearManagedAppSelection,
    confirmResetScanRoots,
    editorModel,
    excludeManagedAppFromScan,
    excludeManagedAppsFromScan,
    excludeSelectedManagedAppsFromScan,
    filteredManagedApps,
    getLaunchTargetPath,
    iconChooserModel,
    isBrowsingScanRoot,
    isScanningApps,
    managedApps,
    nativeIntegration,
    newScanKeyword,
    openCreateManagedApp,
    openEditManagedApp,
    openExistingAppIconChooser,
    persistence: Object.freeze({ capture: capturePersistence, restore: restorePersistence }),
    presentation,
    removeManagedAppFromLaunchpad,
    removeManagedAppsFromLaunchpad,
    removeScanKeywordBlacklistItem,
    removeScanRoot,
    removeSelectedManagedAppsFromLaunchpad,
    rescanManagedApps,
    resetAppCustomIcon,
    scanResultModel,
    selectAllManagedApps,
    selectedManagedAppCount,
    syncManagedAppState,
    toggleManagedAppSelection,
    toggleMissingLaunchTargetBadge,
    toggleScanRootEnabled,
    updateAppCustomIcon,
  };
}
