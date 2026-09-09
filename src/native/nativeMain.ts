import { createNativeText } from "../rendering/native/nativeTypography.js";
import { t, setNativeLocale, getNativeLocale, nativeLocaleOptions } from "./nativeLocalization.js";
import { createDefaultScanRoots } from "../domain/launchpadData.js";
import { DEFAULT_SCAN_ROOTS } from "../platform/applicationCatalogDefaults.js";
import { readErrorMessage } from "../application/errorMessage.js";
import { createTouchpadCapture,setTouchpadCapture,activeTouchpadCapture } from "../debug/touchpadCapture.js";
import { DEFAULT_PAGE_SWIPE_SPEED,getPageSwipeSpeed,setPageSwipeSpeed,cyclePageSwipeSpeed } from "../rendering/pageSwipePreview.js";
import { createNativeWindowEffects } from "./nativeWindowEffects.js";
import { loadNativeLayoutWithRetry } from "./nativeLayoutLoad.js";
import { configureNativeTextResolution, setNativeUiFontFamily } from "../rendering/native/nativeTypography.js";
import { NativeWindowChrome } from "../rendering/native/NativeWindowChrome.js";
import { NativeSettingsButton } from "../rendering/native/NativeSettingsButton.js";
import { logNativeRuntime, nativeLogDirectory, nativeLogPath } from "./nativeRuntimeLog.js";
import { createLaunchpadTray } from "./nativeTray.js";
import { prepareNativeRestart } from "./nativeRestart.js";
import { captureOwnedWindow, clickOwnedNativeWindow, cycleOwnedWindowFocus, dragOwnedNativeWindow, respondToOwnedColorDialog } from "./nativeSettingsSmoke.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Screen } from "electrobun/main";
import {
  Container,
  AlphaFilter,
  Graphics,
  Rectangle,
  Text,
  FederatedWheelEvent,
  type FederatedPointerEvent,
  type Sprite,
} from "pixi.js";
import {
  createNativePixiApplication,
  attachNativeDevtools,
  NativeGlobalShortcut,
  NativeTray,openNativePath,
  readNativeTouchpad,
  readNativeSystemPreferences,
  subscribeNativeSystemPreferences,
  type NativePixiApplication,
} from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import {
  createLaunchpadGestureEngine,
  type LaunchpadGestureDeadline,
  type LaunchpadGestureOutput,
  type LaunchpadPagePresentation,
} from "../domain/input/launchpadGestureEngine.js";
import { findFocusedIcon, firstIconFocus, moveIconFocus, type LaunchpadIconScope } from "../domain/iconFocus.js";
import { NativeDesktopScene } from "../rendering/native/NativeDesktopScene.js";
import { resolveNativePointerTarget } from "../rendering/native/nativePointerTarget.js";
import { NativeSearchBar } from "../rendering/native/NativeSearchBar.js";
import { NativeManagement } from "../rendering/native/NativeManagement.js";
import { NativeSelectionToolbar } from "../rendering/native/NativeSelectionToolbar.js";
import { createLaunchpadNotices } from "../application/launchpadNotices.js";
import { NativeNotice } from "../rendering/native/NativeNotice.js";
import { NativeAppDialogs } from "../rendering/native/NativeAppDialogs.js";
import { nativeHost } from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { buildAppSearchDocuments, searchAppDocuments } from "../domain/launchpadSearch.js";
import { snapshotContractValue } from "../rendering/contractSnapshot.js";
import { createNativeEditing } from "./nativeEditing.js";
import { createLayoutSaveQueue } from "../application/layoutSaveQueue.js";
import { normalizeNativeCustomIcon } from "./nativeCustomIcon.js";
import { createLaunchpadSettings } from "../application/launchpadSettings.js";
import { createLocaleRuntimePort } from "../platform/localeRuntime.js";
import { mainWindowShortcutFromKeyboardEvent } from "../platform/mainWindowShortcutInput.js";
import { nativeGeneralSettingsPage } from "../rendering/native/nativeGeneralSettingsPage.js";
import { resolveAppearancePreference } from "../domain/appearancePreference.js";
import { createNativeStateHost } from "../application/stateHost.js";
import { createLaunchpadLaunchFlow } from "../application/launchpadLaunchFlow.js";
import { NativeLaunchGhost, fadeNativeLaunchpadChrome } from "../rendering/native/NativeLaunchGhost.js";
import { DESKTOP_CLOSE_SCALE } from "../composables/launchpadConstants.js";
import { createSettingsNavigation } from "../application/settingsNavigation.js";
import { NativeBackground } from "../rendering/native/NativeBackground.js";
import { NativeFluentButton } from "../rendering/native/NativeFluentButton.js";
import { NativeFluentToggle } from "../rendering/native/NativeFluentToggle.js";
import { nativeBackgroundSettings, nativeDraftBackground, type NativeBackgroundPanelState } from "../rendering/native/nativeBackgroundSettings.js";
import { NativeSettingsShell } from "../rendering/native/NativeSettingsShell.js";
import { createLaunchpadApps } from "../application/launchpadApps.js";
import { createNativeCatalogPort } from "./nativeCatalogPort.js";
import { nativeAppsSettingsPage, type NativeAppsPageState } from "../rendering/native/nativeAppsSettingsPage.js";
import { nativeLayoutSettingsPage } from "../rendering/native/nativeLayoutSettingsPage.js";
import { nativeFluentIcon } from "../rendering/native/nativeFluentIcons.js";
import { nativeAboutSettingsPage } from "../rendering/native/nativeAboutSettingsPage.js";
import { loadNativeIconTexture } from "../rendering/native/nativeIconTextureLoader.js";
import { createNativeBrandingTextures } from "../rendering/native/nativeBrandingTextures.js";
import { normalizeLaunchpadIconVariant, LAUNCHPAD_ICON_VARIANTS } from "../domain/launchpadIconVariant.js";
import { createNativeShortcut } from "./nativeShortcut.js";
import { normalizeMainWindowShortcut } from "../domain/mainWindowShortcut.js";
import type { LaunchpadPages, ReadonlyLaunchpadApp } from "../domain/launchpadLayout.js";
import { createNativeIconTextureRepository } from "../rendering/native/nativeIconTextureLoader.js";
import { prepareNativeIconTextures } from "../rendering/native/nativeRecoverableIconSource.js";
import {
  createNativeFolderFlow,
  type NativeFolderItem,
} from "../rendering/native/nativeFolderFlow.js";
import type { SceneFocusedIcon, SceneItem, ScenePageTrackScrub } from "../rendering/sceneFrame.js";
import { PIXI_UI_FONT_FAMILY } from "../rendering/typography.js";
import type { LayoutDocument } from "../domain/layoutDocument.js";
import {
  NativeDataHost,
  NativeLaunchError,
  type NativeCatalogScanResult,
} from "./nativeDataHost.js";
import {
  getNativeActivePageItems,
  createNativeLayoutState,
  getNativePageTurnFromKey,
  makeNativeStartupFrame,
  makeNativeStartupScanRequest,
  setNativeDesktopPage,
  type NativeNavigationKey,
  type NativePageTurn,
} from "./nativeStartup.js";
import {
  assertNativeScenePixels,
  type NativePixelData,
  type NativePixelRegion,
  type NativeScenePixelProof,
} from "./nativePixelProof.js";

type NativeMode = "app" | "dev" | "smoke";

type NativeFrameProof = Readonly<{
  backingHeight: number;
  backingWidth: number;
  catalogApps: number;
  cjkLabelPixels: readonly number[];
  height: number;
  loadedLayout: boolean;
  pageCount: number;
  desktopPageMotionObserved: boolean;
  folderChildLaunchObserved: boolean;
  folderCloseMotionObserved: boolean;
  folderOpenMotionObserved: boolean;
  folderPageMotionObserved: boolean;
  folderPageNavigation: "verified";
  pageNavigation: "skipped-single-page" | "verified";
  inputNavigation: "verified";
  folderInterruptions: "verified";
  folderTitleSamples: number;
  presentCount: number;
  presented: true;
  reconciledNodes: number;
  resolution: number;
  visibleNodes: number;
  width: number;
}>;

type NativeHostLifecycleProof = Readonly<{
  dpiResolution: number;
  dpiTransition: "skipped-no-mixed-dpi-display" | "verified-display-fallback";
  resizeLiveBackingObserved: boolean;
  resizeMode: "live";
  resizeObserved: boolean;
  resizePresentCount: number;
  resizeSettledBackingObserved: boolean;
  restoreObserved: boolean;
  restorePresentCount: number;
  structuredLaunchFailureObserved: boolean;
}>;

type NativeProof = NativeFrameProof & NativeHostLifecycleProof & NativeScenePixelProof;

type NativeIconNode = Container & Readonly<{
  emojiText: Text;
  iconSprite: Sprite;
  labelText: Text;
}>;

async function runNativeApplication(): Promise<void> {
const NATIVE_BACKGROUND = [9, 11, 20, 255] as const;

const configuredNativeMode = process.env.LAUNCHPAD_NATIVE_MODE;
if (configuredNativeMode !== undefined && configuredNativeMode !== "dev" && configuredNativeMode !== "smoke") {
  throw new Error(`LAUNCHPAD_NATIVE_MODE must be dev or smoke when set, received: ${configuredNativeMode}`);
}
const nativeMode: NativeMode = configuredNativeMode ?? "app";

function displayFor(frame: Readonly<{ height: number; width: number; x: number; y: number }>) {
  const primary = Screen.getPrimaryDisplay();
  let best = primary;
  let bestArea = 0;
  for (const candidate of Screen.getAllDisplays()) {
    const { bounds } = candidate;
    const width = Math.max(
      0,
      Math.min(frame.x + frame.width, bounds.x + bounds.width) - Math.max(frame.x, bounds.x),
    );
    const height = Math.max(
      0,
      Math.min(frame.y + frame.height, bounds.y + bounds.height) - Math.max(frame.y, bounds.y),
    );
    const area = width * height;
    if (area <= bestArea) continue;
    best = candidate;
    bestArea = area;
  }
  return best;
}

async function waitFor(
  description: string,
  predicate: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
}

async function present(
  app: NativePixiApplication,
  description: string,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const presented = app.nextPresent();
  app.invalidate();
  try {
    await Promise.race([
      presented,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${description}`)),
          5000,
        );
      }),
    ]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

function collectTextureItems(
  frame: Readonly<{ viewport: Readonly<{ activePageIndex: number; activePages: readonly (readonly (SceneItem | null)[])[] }> }>,
): readonly SceneItem[] {
  const result: SceneItem[] = [];
  const seen = new Set<string>();
  const append = (item: SceneItem | null): void => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
    if (item.type !== "folder" || !Array.isArray(item.childPages)) return;
    for (const page of item.childPages) for (const child of page) append(child as SceneItem | null);
  };
  frame.viewport.activePages.forEach((page) => {
    // ponytail: retain layout textures for the scene lifetime; add scene-owned leases only if catalog-scale GPU memory becomes measurable.
    for (const item of page) append(item);
  });
  return result;
}

function toPixelRegion(
  target: Readonly<{ getBounds(): Readonly<{ height: number; width: number; x: number; y: number }> }>,
  width: number,
  height: number,
): NativePixelRegion {
  const bounds = target.getBounds();
  const x = Math.max(0, Math.floor(bounds.x) - 2);
  const y = Math.max(0, Math.floor(bounds.y) - 2);
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width) + 2);
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height) + 2);
  if (right <= x || bottom <= y) {
    throw new Error(
      `Native text bounds are outside the captured scene: ${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`,
    );
  }
  return Object.freeze({ height: bottom - y, width: right - x, x, y });
}

async function captureScenePixels(
  app: NativePixiApplication,
  width: number,
  height: number,
): Promise<NativePixelData> {
  await prepareNativeIconTextures(app.stage, app.renderer);
  return await app.renderer.extract.pixels({
    antialias: true,
    clearColor: 0x090b14,
    frame: new Rectangle(0, 0, width, height),
    resolution: 1,
    target: app.stage,
  }) as unknown as NativePixelData;
}

async function captureSmokeFrame(name: string): Promise<void> {
  const directory = process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR;
  if (!directory) throw new Error("LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR is required in smoke mode");
  await prepareNativeIconTextures(app.stage, app.renderer);
  const dataUrl = await app.renderer.extract.base64({
    target: app.stage,
    frame: new Rectangle(0, 0, app.contentSize.width, app.contentSize.height),
    resolution: 1,
    clearColor: 0x090b14,
    format: "png",
  });
  writeFileSync(join(directory, `${name}.png`), Buffer.from(dataUrl.split(",")[1]!, "base64"));
}

const nativeData = new NativeDataHost();
const app = await createNativePixiApplication({
  transparent:true,
  titleBarStyle:"hidden",
  antialias: true,
  background: 0x090b14,
  height: 600,
  resizeMode: "live",
  title: nativeMode === "app" ? "LaunchPad" : process.env.LAUNCHPAD_NATIVE_SETTINGS_ONLY==="1"?"LaunchPad · Settings style preview":`LaunchPad · Native WebGPU ${nativeMode}`,
  width: 900,
}).catch(async (error: unknown) => {
  await nativeData.dispose();
  throw error;
});
app.stage.label = "launchpad-native-stage";
app.beforeRender(() => prepareNativeIconTextures(app.stage, app.renderer));
configureNativeTextResolution(app.resolution,app.stage);
let loadedLayout: LayoutDocument | null;
let catalogResult: NativeCatalogScanResult;
let startupLoadRecovered=false;
try {
  await nativeData.connect();
  if(nativeMode==="smoke"){
    const cancelled=loadNativeLayoutWithRetry(app,async()=>{throw new Error("smoke: cancelled layout read");});
    await waitFor("cancellable startup notice",()=>Boolean(app.stage.getChildByLabel("native-notice:close",true)));
    await present(app,"startup notice cancellation");clickWithNativeInput(app.stage.getChildByLabel("native-notice:close",true)!);
    assert.deepEqual(await cancelled,{cancelled:true});assert.equal(app.stage.getChildByLabel("native-notice",true),null);
  }
  let loadAttempts=0;
  const loading=loadNativeLayoutWithRetry(app,async()=>{
    if(nativeMode==="smoke"&&++loadAttempts<=2)throw new Error("smoke: layout read temporarily unavailable");
    return nativeData.loadLayout();
  });
  if(nativeMode==="smoke"){
    for(let attempt=1;attempt<=2;attempt++){
      await waitFor("startup layout retry notice",()=>loadAttempts===attempt&&Boolean(app.stage.getChildByLabel("native-notice:action",true)));
      await present(app,"startup layout retry hit target");
      if(attempt===2)await captureSmokeFrame("layout-load-retry");
      if(attempt===1)clickWithNativeInput(app.stage.getChildByLabel("native-notice:action",true)!);
      else{app.nativeInput.emitKey("down",{keyCode:13});app.nativeInput.emitKey("up",{keyCode:13});}
    }
  }
  const result=await loading;
  if(result.cancelled){await nativeData.dispose();await app.dispose();process.exit(0);}
  loadedLayout=result.layout;startupLoadRecovered=result.recovered;
  const scanRequest = makeNativeStartupScanRequest(loadedLayout);
  catalogResult = await nativeData.scanApps(scanRequest.roots, scanRequest.filters);
} catch (error) {
  await nativeData.dispose();
  await app.dispose();
  throw error;
}
setNativeLocale(loadedLayout?.settings.localePreference ?? Intl.DateTimeFormat().resolvedOptions().locale);
const layoutState = createNativeLayoutState(loadedLayout, catalogResult.apps);
const settingsNavigation=createSettingsNavigation(createNativeStateHost(()=>{}),key=>t(key));
settingsNavigation.selectTab("general");
let settingsShell:NativeSettingsShell|null=null;
let openSettings:()=>void;
let apps:ReturnType<typeof createLaunchpadApps>|null=null;
let appDialogs:NativeAppDialogs|null=null;
let refreshTargetChecks=()=>{};
let saveFailed=(error:unknown)=>{logNativeRuntime("save-error",String(error));},saveRecovered=()=>{};
const saves = createLayoutSaveQueue(async document=>{try{await nativeData.saveLayout(document);saveRecovered();}catch(error){saveFailed(error);throw error;}});
let currentFrame = makeNativeStartupFrame(loadedLayout, catalogResult.apps, layoutState.presentation.pages.value);
let activePageItems = getNativeActivePageItems(currentFrame);
let searchQuery = "";
let launchFlow:ReturnType<typeof createLaunchpadLaunchFlow>|null=null;
let dismissLaunchpad=()=>{};
let showLaunchpad=()=>{};
let disposeLaunchFlow=()=>{};
let tray:ReturnType<typeof createLaunchpadTray>|null=null;
let restartRequested=false;
let quitRequested=false;
const folderLayout = Object.freeze({
  get cols(){return layoutState.presentation.folderCols.value;},
  get iconSize(){return layoutState.presentation.folderIconSizeMode.value==="custom"
    ?layoutState.presentation.folderIconSize.value:layoutState.presentation.iconSize.value;},
  get rows(){return layoutState.presentation.folderRows.value;},
});

let toggleLaunchpad=()=>{};
const mainShortcut=createNativeShortcut(NativeGlobalShortcut,()=>{
  logNativeRuntime("shortcut",{state:app.state,visible:app.window.isVisible(),minimized:app.window.isMinimized()});
  try{toggleLaunchpad();}catch(error){logNativeRuntime("shortcut-error",error);}
});
const branding=createNativeBrandingTextures(join(import.meta.dir,"branding"),()=>{settingsShell?.redraw();app.invalidate();});
await branding.synchronize(app.resolution);
const brandingTextures=branding.textures;
const systemPreferences=readNativeSystemPreferences();
setNativeUiFontFamily(systemPreferences.ok?systemPreferences.value.uiFontFamily:null);
let systemAppearance=systemPreferences.ok?systemPreferences.value.appearance:"dark";
const windowEffects=createNativeWindowEffects({
  apply:(material,appearance)=>app.setWindowPresentation(material,appearance),
  visible:()=>app.state==="running"&&app.window.isVisible()&&!app.window.isMinimized(),
  onError:error=>logNativeRuntime("window-effects-reapply-error",readErrorMessage(error)),
});
const settingsTheme=()=>resolveAppearancePreference(settings.draft.settingsThemePreference.value,systemAppearance);
const settings=createLaunchpadSettings({
  layout:layoutState,isDragActive:()=>editing?.drag.isDragActive()??false,localizationText:{t},
  autostartPort:{isAvailable:()=>nativeData.autostartAvailable,getStatus:()=>nativeData.autostart(),setEnabled:value=>nativeData.autostart(value)},
  localeRuntime:createLocaleRuntimePort({getSystemLanguages:()=>[Intl.DateTimeFormat().resolvedOptions().locale]}),
  activateLocale:state=>{setNativeLocale(state.resolvedLocale);searchBar.setPlaceholder(t("launchpad.search.placeholder"));tray?.refresh();},
  launchpadIconPort:{isAvailable:()=>app.supportsWindowIcon,applyVariant:async variant=>{
    app.setWindowIcon(readFileSync(join(import.meta.dir,"branding",variant+".png")));return variant;
  }},
  liveDesktopSupport:{value:{supportsLiveDesktopBackground:false}},
  backgroundAssetPort:{
    toAssetUrl:path=>path??null,
    getDesktopWallpaper:async()=>{
      const frame=app.getWindowFrame();
      return nativeData.background({rect:[frame.x,frame.y,frame.x+frame.width,frame.y+frame.height]});
    },
    pickImage:async()=>{
      const selected=await nativeHost.platform.dialogs.openFiles({allowedFileTypes:"png,jpg,jpeg,webp",multiple:false});
      if(!selected.ok){if(selected.error.code==="CANCELLED")return null;throw new Error(selected.error.message);}
      return selected.value[0]?nativeData.background({path:selected.value[0]}):null;
    },
  },
  mainWindow:{support:{value:{...app.windowMaterialSupport,platform:"windows"}},registerShortcut:async value=>mainShortcut.apply(value),
    setMode:request=>{
      app.setWindowMode(request.mode,request.fullscreenOverscanEnabled?1:0);return {ok:true};
    },
    setEffectsEnabled:request=>{
      windowEffects.set(request.enabled?request.material:"none",resolveAppearancePreference(request.appearance,systemAppearance));return {ok:true};
    }},
},createNativeStateHost(()=>{}));
settings.persistence.restore(loadedLayout?.settings??{});
const layoutSettings=settings.layoutSettings;
const desktopBackground=new NativeBackground(app,()=>app.invalidate());
app.stage.addChildAt(desktopBackground,0);
const backgroundConfig=()=>({...loadedLayout?.settings,...settings.persistence.capture()});
const refreshBackground=()=>desktopBackground.configure(backgroundConfig(),app.contentSize.width,app.contentSize.height,undefined,systemAppearance);
const backgroundPanelState:NativeBackgroundPanelState={layer:false,effect:false,profile:systemAppearance,error:""};
const windowPanelState={mode:false,material:false,advanced:false};
const appsPageState:NativeAppsPageState={keywords:false,excludedQuery:"",excludedKeys:new Set()};
const chromeInset=()=>app.windowMode==="fullscreen"?0:settings.presentation.showCustomTitlebar.value?56:24;
let recordingShortcut=false,expandedIcons=false;
const stopShortcutRecording=()=>{
  if(!recordingShortcut)return true;
  try{mainShortcut.resume();recordingShortcut=false;return true;}
  catch(error){settings.actions.setMainWindowShortcutError(String(error));return false;}
};
const recordShortcut=()=>{
  try{mainShortcut.suspend();recordingShortcut=true;settings.actions.setMainWindowShortcutError("");}
  catch(error){settings.actions.setMainWindowShortcutError(String(error));}
  settingsShell?.redraw();
};
let changeSearch: (query: string) => void;
const searchBar = new NativeSearchBar(app, loadedLayout?.settings.localePreference === "en-US" ? "Search" : t("launchpad.search.placeholder"), query => changeSearch(query));
const management = new NativeManagement(searchBar.host, () => app.contentSize, () => app.invalidate(),
  settingsTheme);

const iconTextures = createNativeIconTextureRepository();
function reportNativeError(error: unknown): void {
  const message=readErrorMessage(error);
  logNativeRuntime("error",message);
  notices.showTransientNotice({title:t("errors.launch.genericTitle"),message,intent:"error"});
}

function clickWithNativeInput(target: Container, button=0, modifiers=0): void {
  const hitArea = target.hitArea as Readonly<{
    height?: number;
    width?: number;
    x?: number;
    y?: number;
  }> | null;
  const bounds = target.getBounds();
  const point = hitArea && Number(hitArea.width) > 0 && Number(hitArea.height) > 0
    ? target.toGlobal({
      x: Number(hitArea.x) + Number(hitArea.width) / 2,
      y: Number(hitArea.y) + Number(hitArea.height) / 2,
    })
    : { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const { x, y } = point;
  app.nativeInput.emitPointer("pointermove", x, y, 0, modifiers);
  if (nativeMode === "smoke") {
    const boundary = app.renderer.events.rootBoundary;
    const hit = boundary.hitTest(x, y);
    let current: Container | null = hit;
    while (current && current !== target) current = current.parent;
    if (!current) {
      throw new Error(
        `Native pointer target ${target.label || target.constructor.name} was obscured by ${hit?.label || hit?.constructor.name || "nothing"}; ancestors=${[hit,hit?.parent,hit?.parent?.parent].map(node=>node?.label||node?.constructor.name).join("/")}; modal=${management.activeId}; point=${x},${y}`,
      );
    }
  }
  app.nativeInput.emitPointer("pointerdown", x, y, button, modifiers);
  app.nativeInput.emitPointer("pointerup", x, y, button, modifiers);
}

let renderScene: (snapDesktopLayout?: boolean) => void;
let sceneRenderQueued = false;
let sceneDisposed = false;
const requestSceneRender = (): void => {
  if (sceneDisposed || sceneRenderQueued) return;
  sceneRenderQueued = true;
  queueMicrotask(() => {
    if (!sceneRenderQueued) return;
    sceneRenderQueued = false;
    renderScene();
  });
};
const folderFlow = createNativeFolderFlow(presentation => {
  if(!presentation.renderedFolder && editing?.rollback.presentation.value?.phase === "closing") {
    editing.rollback.beginDissolve(editing.rollback.presentation.value.folderId);
  }
  requestSceneRender();
});

function setFocusedIcon(focusedIcon: SceneFocusedIcon | null): void {
  currentFrame = Object.freeze({
    ...currentFrame,
    interaction: Object.freeze({ ...currentFrame.interaction, focusedIcon: focusedIcon ? Object.freeze({ ...focusedIcon }) : null }),
  });
  requestSceneRender();
}

function getCurrentIconScope(): LaunchpadIconScope<SceneItem> {
  const folder = folderFlow.snapshot();
  return folder.renderedFolder && !folder.isClosing ? {
    area: "folder", columns: folderLayout.cols, folderId: folder.renderedFolder.id,
    items: (folder.renderedFolder.childPages[folder.folderPageIndex] ?? []).filter((item): item is SceneItem => item !== null),
    pageIndex: folder.folderPageIndex,
  } : {
    area: searchQuery.trim() ? "search" : "desktop", columns: currentFrame.viewport.gridCols, folderId: null,
    items: activePageItems, pageIndex: currentFrame.viewport.activePageIndex,
  };
}

function closeFolder(): boolean {
  if (!folderFlow.close()) return false;
  setFocusedIcon(null);
  return true;
}

function setFolderPageIndex(pageIndex: number): boolean {
  if (!folderFlow.setPageIndex(pageIndex)) return false;
  setFocusedIcon(null);
  return true;
}

function getSelectionScope() {
  const scope=getCurrentIconScope();
  return {key:`${scope.area}:${scope.folderId ?? ""}:${scope.pageIndex}`,orderedIds:scope.items.filter(item=>item.type==="app").map(item=>item.id)};
}

async function activateItem(item: SceneItem, event: {shiftKey?:boolean} = {}): Promise<void> {
  if (editing?.drag.isDragActive()) return;
  if (editing?.selection.isActive.value && item.type === "app") {
    editing.selection.toggle(item.id, { range:Boolean(event.shiftKey),scope:getSelectionScope() });
    return;
  }
  if(editing?.mode.value && item.type === "app") { editItem(item); return; }
  if (item.type === "folder") {
    if (folderFlow.open(item)) {
      setFocusedIcon(null);
    }
    return;
  }
  launchFlow?.openApp(item as ReadonlyLaunchpadApp);
}

let onDesktopPageIndexCommit: (index: number) => void;
let editing: ReturnType<typeof createNativeEditing> | null = null;
function editItem(item: SceneItem | null): void {
  const appItem = item && layoutState.operations.collectAppsFromPages(layoutState.presentation.pages.value).find(app => app.id === item.id);
  if(item?.type === "folder") {
    management.form(t("common.actions.rename"), [{label:t("dialogs.appEditor.name"), value:String(item.name ?? "")}], t("common.actions.save"), async values=>{
      editing!.rename(item.id,values[0]!); await saves.flush();
    });
    return;
  }
  if(!apps)return;
  const editor=apps.editorModel;
  if(appItem)editor.actions.openEdit(appItem);else editor.actions.openCreate();
  appDialogs?.sync();
}

const noticeView=new NativeNotice(()=>app.contentSize,()=>app.invalidate());app.stage.addChild(noticeView);
const notices=createLaunchpadNotices({localizationText:{t}},createNativeStateHost(()=>{
  queueMicrotask(()=>{if(!noticeView.destroyed){noticeView.show(notices.transientNotice.value,notices.closeTransientNotice);requestSceneRender();}});
}));
let saveFailureCount=0;
saveFailed=error=>{saveFailureCount++;logNativeRuntime("save-error",String(error));notices.showLayoutSaveFailed({error,retryCount:saveFailureCount,onRetry:()=>{void saves.flush().catch(()=>{});}});};
saveRecovered=()=>{if(saveFailureCount){saveFailureCount=0;notices.showLayoutSaveRecovered();}};
function removeItems(ids: readonly string[]): void {
  management.warning({title:t("settings.apps.manager.remove"),message:t("launchpad.batch.removeMessage",{count:ids.length}),intent:"warning",cancelText:t("common.actions.cancel"),confirmText:t("launchpad.batch.remove"),confirmAppearance:"outline",confirmTone:"danger",onConfirm:async()=>{
    if(apps)apps.removeManagedAppsFromLaunchpad(ids);
    const folders=ids.filter(id=>layoutState.operations.findFolder(layoutState.presentation.pages.value,id));
    if(folders.length)editing!.remove(folders);
    await saves.flush();
  }});
}
function contextMenu(item:SceneItem|null,x:number,y:number):void{
  const actions:import("../rendering/native/NativeManagement.js").NativeMenuAction[]=[];
  const beginBatch=()=>{editing!.alt.cancelAltEditMode();editing!.selection.begin({});};
  if(item){
    actions.push({label:t("common.actions.open"),icon:item.type==="folder"?"folder-open-20-regular":"open-20-regular",run:()=>{void activateItem(item);}});
    actions.push({label:t(item.type==="folder"?"common.actions.rename":"common.actions.edit"),icon:item.type==="folder"?"rename-20-regular":"edit-20-regular",run:()=>editItem(item)});
    if(item.type==="folder")actions.push({label:t("launchpad.contextMenu.dissolve"),icon:"folder-arrow-right-20-regular",separatorBefore:true,danger:true,run:()=>editing!.pageCommands.confirmDissolveFolder(item.id)});
    else {
      actions.push({label:t("launchpad.contextMenu.remove"),icon:"delete-20-regular",separatorBefore:true,run:()=>apps!.removeManagedAppFromLaunchpad(item.id)});
      const appItem=apps?.managedApps.value.find(app=>app.id===item.id);
      if(appItem&&apps!.canExcludeManagedAppFromScan(appItem))actions.push({label:t("launchpad.contextMenu.exclude"),icon:"delete-dismiss-20-regular",danger:true,run:()=>apps!.excludeManagedAppFromScan(appItem)});
    }
  }else{
    actions.push({label:t("launchpad.contextMenu.batchManage"),icon:"select-all-on-20-regular",run:beginBatch});
    if(!folderFlow.snapshot().renderedFolder){
      actions.push({label:t("settings.interface.layout.compactAction"),icon:"arrow-sort-20-regular",separatorBefore:true,run:()=>editing!.pageCommands.confirmForceFillAllPages()});
      if(apps?.canScanManagedApps.value)actions.push({label:t(apps.isScanningApps.value?"settings.apps.manager.scanning":"settings.apps.manager.scanApps"),icon:"scan-object-20-regular",disabled:apps.isScanningApps.value,run:()=>{void apps!.rescanManagedApps({announceStart:true});}});
      actions.push({label:t("launchpad.openSettings"),icon:"settings-20-regular",separatorBefore:Boolean(apps?.canScanManagedApps.value),run:()=>openSettings()});
    }
  }
  management.menu(x,y,actions);
}
async function updateIcon(item:SceneItem, reset:boolean):Promise<void> {
  if(!reset){apps?.openExistingAppIconChooser(item.id);appDialogs?.sync();return;}
  if(!apps?.managedApps.value.some(app=>app.id===item.id))throw new Error("Application no longer exists");
  apps.updateAppCustomIcon(item.id,null);await saves.flush();
  const result=await iconTextures.synchronize(collectTextureItems(currentFrame));
  if(result.failed.length)throw new Error("Icon loading failed");
  requestSceneRender();
}
const scene = new NativeDesktopScene(app.stage, {
  onDesktopPageIndexCommit: index => onDesktopPageIndexCommit(index),
  folderLayout,
  iconTextures,
  onFolderCloseRequest: closeFolder,
  onFolderReopenRequest: (folderId) => {
    const item = currentFrame.viewport.activePages.flat().find((item) => item?.id === folderId);
    if (item) void activateItem(item);
  },
  onFolderInternalActivityChange: (active, folderId) => {
    folderFlow.notifyInternalActivity(active, folderId);
  },
  onFolderPageIndexCommit: setFolderPageIndex,
  onFolderRenderRequest: requestSceneRender,
  onIconActivate: (item) => void activateItem(item),
  onGroupReleaseComplete: result => editing?.complete(result),
  onRollbackComplete: token => {editing?.rollback.complete(token);},
  onIconEditAction:(action,item)=>{
    if(action==="remove")removeItems([item.id]);
    else if(action==="choose-icon" || action==="reset-icon")void updateIcon(item,action==="reset-icon").catch(reportNativeError);
  },
});
app.stage.addChild(searchBar);
app.stage.addChild(management);
const selectionToolbar = new NativeSelectionToolbar({
  invalidate:()=>app.invalidate(),selectScope:()=>editing!.selection.selectScope(getSelectionScope()),
  clear:()=>editing!.selection.deselectAll(),createFolder:()=>{editing!.createFolder();},
  done:()=>{if(!editing!.selection.isFrozen.value)editing!.selection.clear();},
  removeMenu:(x,y,restore)=>{
    const ids=[...editing!.selection.selectedIds.value];
    const selected=apps?.managedApps.value.filter(item=>ids.includes(item.id))??[];
    const canExclude=Boolean(apps&&selected.length===ids.length&&ids.length&&selected.every(item=>apps!.canExcludeManagedAppFromScan(item)));
    management.menu(x,y,[
      {label:t("settings.apps.manager.remove"),icon:"delete-20-regular",run:()=>removeItems(ids)},
      {label:t("settings.apps.manager.exclude"),icon:"delete-dismiss-20-regular",danger:true,disabled:!canExclude,run:()=>{apps?.excludeManagedAppsFromScan(selected);}},
    ],248,{restore});
  },
});
// The native presentation surface is not COPY_SRC. While the toolbar needs
// backdrop sampling, render the stage through Pixi's sampleable intermediate.
const selectionBackdropSurface=new AlphaFilter({alpha:1,resolution:"inherit"});
app.stage.addChild(selectionToolbar);
app.stage.on("pointerdowncapture",event=>{let node=event.target as Container|null;while(node&&node!==selectionToolbar)node=node.parent;if(!node)selectionToolbar.clearFocus();});
const settingsButton=new NativeSettingsButton(()=>openSettings(),()=>app.invalidate());
app.stage.addChild(settingsButton);
const windowChrome=new NativeWindowChrome(app,reportNativeError);
app.stage.addChild(windowChrome);
const launchGhostView=new NativeLaunchGhost();app.stage.addChild(launchGhostView);
const onContext = (event: FederatedPointerEvent):void=>{
  const target=resolveNativePointerTarget(event.target);
  if(target.kind==="control")return;
  const id=target.kind==="icon"?target.id:null;
  const item=id?getCurrentIconScope().items.find(item=>item.id===id)??null:null;
  contextMenu(item,event.global.x,event.global.y);event.stopPropagation();
};
app.stage.on("rightclick",onContext);
management.on("context-request",(x:number,y:number)=>{const hit=app.renderer.events.rootBoundary.hitTest(x,y);const target=resolveNativePointerTarget(hit);const item=target.kind==="icon"?getCurrentIconScope().items.find(item=>item.id===target.id)??null:null;contextMenu(item,x,y);});
management.captureReturnFocus=()=>settingsShell?.captureFocus()??(()=>app.invalidate());
let offResize = (): void => {};
let offBackgroundResize=()=>{};
const offPresented = app.on("presented", () => {
  // Maximize state may settle after the resize notification. Refresh caption
  // controls against the HWND state of the frame that actually reached screen.
  windowChrome.update(settings.presentation.showCustomTitlebar.value,app.windowMode==="windowed");
  folderFlow.commitPresented(scene.commitPresentedFrame());
  const session=launchFlow?.appLaunchCloseSessionId.value;
  if(session&&currentFrame.visual.appLaunchCloseSessionId===session)launchFlow?.commitAppLaunchCloseFrame(session);
});
let offStateChange = (): void => {};
const offFatal=app.on("fatal",event=>{logNativeRuntime("fatal",{type:event.type,message:event.message,error:String(event.error??"")});});
let bindApplicationFocus = () => {};
const offRecovered=app.on("recovered",event=>{logNativeRuntime("recovered",event);windowEffects.refresh();bindApplicationFocus();});
let offFocus = (): void => {};
let offSystemPreferences=()=>{};
let offWheel = (): void => {};
let offWheelPointerInterrupt = (): void => {};
let offTouch = (): void => {};
let disconnectAnimationHost = (): void => {};
let windowClosing=false;
const offSaveBeforeClose = app.beforeClose(async () => {
  if(!quitRequested&&!restartRequested){
    logNativeRuntime("window-close-hide");
    if(app.window.isMinimized()||app.state!=="running"){
      await saves.flush();app.window.hide();return false;
    }
    dismissLaunchpad();return false;
  }
  windowClosing=true;app.stage.interactiveChildren=false;
  try {
    await settingsShell?.waitForApply();
    await saves.flush();
    if(launchFlow?.isDesktopOpen.value&&app.window.isVisible()&&!app.window.isMinimized()&&app.state==="running"){
      launchFlow.closeDesktop();
      await waitFor("native window close animation",()=>!launchFlow!.isDesktopClosing.value);
      await present(app,"native window final close frame");
    }
    if(restartRequested){
      await prepareNativeRestart();
      logNativeRuntime("restart-ready");
    }
  } catch (error) {
    restartRequested=false;
    quitRequested=false;
    windowClosing=false;app.stage.interactiveChildren=true;
    // Saving already supplies an actionable retry notice; preserve it on close failure.
    if(!saveFailureCount)reportNativeError(error);throw error;
  }
});
const wheelDeadlines = new Map<
  LaunchpadGestureDeadline["kind"],
  ReturnType<typeof setTimeout>
>();

try {
  offBackgroundResize=app.on("resize",()=>{
    void refreshBackground().catch(reportNativeError);
  });
  offSystemPreferences=subscribeNativeSystemPreferences(result=>{
    if(!result.ok){reportNativeError(result.error.message);return;}
    if(setNativeUiFontFamily(result.value.uiFontFamily))settingsShell?.redraw();
    if(systemAppearance!==result.value.appearance){
      systemAppearance=result.value.appearance;settingsShell?.redraw();
      if(settings.presentation.windowEffectAppearance.value==="system"&&(!launchFlow||launchFlow.isDesktopOpen.value)){
        try{windowEffects.set(settings.presentation.windowEffectMaterial.value,systemAppearance);}
        catch(error){reportNativeError(error);}
      }
      void refreshBackground().catch(reportNativeError);app.invalidate();
    }
  });
  app.setWindowMode(settings.presentation.windowMode.value,settings.presentation.fullscreenOverscanEnabled.value?1:0);
  windowEffects.set(settings.presentation.windowEffectMaterial.value,resolveAppearancePreference(settings.presentation.windowEffectAppearance.value,systemAppearance));
  await present(app, "the native host startup frame");
  await refreshBackground().catch(reportNativeError);
  const iconTextureSnapshot = await iconTextures.synchronize(collectTextureItems(currentFrame));
  if (iconTextureSnapshot.pending.length !== 0) {
    throw new Error(`Native icon texture did not become ready: ${JSON.stringify(iconTextureSnapshot)}`);
  }
  if (nativeMode === "smoke" && (
    iconTextureSnapshot.cached.length < 1 || iconTextureSnapshot.failed.length !== 0
  )) {
    throw new Error(`Native smoke icon texture failed: ${JSON.stringify(iconTextureSnapshot)}`);
  }
  if (nativeMode !== "smoke" && iconTextureSnapshot.failed.length > 0) {
    console.warn("Some native icon textures could not be loaded", iconTextureSnapshot.failed);
  }

  disconnectAnimationHost = scene.connectAnimationHost({
    commit: () => renderScene(),
    animate: (update) => app.animate(update),
    invalidate: () => app.invalidate(),
  });

  let desktopPageTrackScrub: ScenePageTrackScrub | null = null;
  let folderPageTrackScrub: ScenePageTrackScrub | null = null;
  const commitScene = (
    viewport: Readonly<{ height: number; resolution: number; width: number }>,
    snapDesktopLayout: boolean,
  ) => scene.commit(currentFrame, viewport, {
    openingIconId:launchFlow?.launchGhost.value?.app.id??null,
    chromeInset:chromeInset(),
    folderPageTrackScrub,
    folderPresentation: folderFlow.snapshot(),
    pageTrackScrub: desktopPageTrackScrub,
    snapDesktopLayout,
  });
  let work = commitScene({
    height: app.contentSize.height,
    resolution: app.resolution,
    width: app.contentSize.width,
  }, true);
  renderScene = (snapDesktopLayout = false) => {
    sceneRenderQueued = false;
    if(launchFlow){
      const closed=!launchFlow.isDesktopOpen.value;
      currentFrame=Object.freeze({...currentFrame,
        interaction:Object.freeze({...currentFrame.interaction,isDesktopClosing:closed}),
        visual:Object.freeze({...currentFrame.visual,desktopVisualAlpha:closed?0:1,
          desktopVisualTransform:Object.freeze({scale:closed?DESKTOP_CLOSE_SCALE:1,y:0}),
          launchpadVisualAlpha:closed?0:1,launchpadVisualTransform:Object.freeze({scale:closed?DESKTOP_CLOSE_SCALE:1,y:0}),
          appLaunchCloseSessionId:launchFlow.appLaunchCloseSessionId.value})});
      const ghost=launchFlow.launchGhost.value;
      launchGhostView.update(ghost,ghost?app.stage.getChildByLabel(`launchpad-item:${ghost.app.id}`,true):null);
    }
    if(editing) {
      const interaction = snapshotContractValue({ ...currentFrame.interaction,
        dragMeta: editing.drag.dragMeta.value, groupDragState: editing.drag.groupDragState.value,
        dragFolderHoverState: editing.drag.dragFolderHoverState.value, dragFolderTargetId: editing.drag.dragFolderTargetId.value,
        isEditMode: editing.mode.value, isBatchSelectionActive: editing.selection.isActive.value,
        selectedAppIds: editing.selection.selectedIds.value,
        provisionalFolderRollback: editing.rollback.presentation.value,
      }) as typeof currentFrame.interaction;
      const pages = searchQuery.trim() ? currentFrame.viewport.activePages : snapshotContractValue(editing.projectedPages()) as typeof currentFrame.viewport.activePages;
      currentFrame = Object.freeze({ ...currentFrame, interaction,
        diagnostics:Object.freeze({...currentFrame.diagnostics,showMissingLaunchTargetBadge:apps?.presentation.showMissingLaunchTargetBadge.value??currentFrame.diagnostics.showMissingLaunchTargetBadge,
          launchTargetStatusById:snapshotContractValue(apps?.presentation.launchTargetStatusById.value??currentFrame.diagnostics.launchTargetStatusById)}),
        viewport: Object.freeze({ ...currentFrame.viewport, activePages: pages }) });
      activePageItems = getNativeActivePageItems(currentFrame);
    }
    work = commitScene({
      height: app.contentSize.height,
      resolution: app.resolution,
      width: app.contentSize.width,
    }, snapDesktopLayout);
    settingsButton.position.set(app.contentSize.width-54,14+chromeInset());
    const folderHeader=folderFlow.snapshot();
    const headerShown=!settingsShell&&!editing?.selection.isActive.value&&(!folderHeader.renderedFolder||folderHeader.isClosing)&&(!launchFlow||launchFlow.isDesktopOpen.value);
    settingsButton.reveal(headerShown,headerShown&&!folderHeader.renderedFolder);
    searchBar.update(app.contentSize.width, Boolean(settingsShell||editing?.selection.isActive.value || (folderFlow.snapshot().renderedFolder && !folderFlow.snapshot().isClosing)));
    searchBar.y=14+chromeInset();
    const hiddenCount=(editing?.selection.selectedCount.value??0)-getSelectionScope().orderedIds.filter(id=>editing?.selection.isSelected(id)).length;
    selectionToolbar.update({width:app.contentSize.width,chromeInset:chromeInset(),theme:settingsTheme(),
      active:Boolean(editing?.selection.isActive.value),count:editing?.selection.selectedCount.value??0,hiddenCount,
      frozen:Boolean(editing?.selection.isFrozen.value),canCancel:Boolean(editing?.drag.groupDragState.value?.canCancel),
      cancelArmed:Boolean(editing?.drag.groupDragState.value?.cancelArmed)});
    const needsBackdrop=selectionToolbar.visible&&!editing?.drag.groupDragState.value?.canCancel;
    if(Boolean(app.stage.filters?.length)!==needsBackdrop)app.stage.filters=needsBackdrop?[selectionBackdropSurface]:[];
    app.stage.setChildIndex(noticeView,app.stage.children.length-1);
    if(settingsShell)app.stage.setChildIndex(settingsShell,app.stage.children.length-1);
    if(management.modal)app.stage.setChildIndex(management,app.stage.children.length-1);
    windowChrome.update(settings.presentation.showCustomTitlebar.value,app.windowMode==="windowed");
    app.stage.setChildIndex(windowChrome,app.stage.children.length-1);
    app.invalidate();
  };
  searchBar.update(app.contentSize.width, false);
  let resizeEvents = 0;
  let resizeLiveBackingObserved = false;
  let observeLiveResize = false;
  offResize = app.on("resize", ({ height, resolution, width }) => {
    void branding.synchronize(resolution).catch(reportNativeError);
    configureNativeTextResolution(resolution,app.stage);
    settingsShell?.redraw();
    // Resize must update controls as well as icons without depending on a later animation commit.
    renderScene(true);
    management.resize();noticeView.redraw();
    if (observeLiveResize) {
      const source = app.renderer.view.texture.source;
      resizeLiveBackingObserved ||= source.pixelWidth === Math.round(width * resolution)
        && source.pixelHeight === Math.round(height * resolution);
    }
    resizeEvents += 1;
  });

  const collectActiveIconNodes = () => activePageItems.map((item) => {
      const node = app.stage.getChildByLabel(`launchpad-item:${item.id}`, true);
      if (!node) throw new Error(`LaunchPad native scene did not create node ${item.id}`);
      return node as NativeIconNode;
    });
  let iconNodes = collectActiveIconNodes();
  changeSearch = query => {
    searchQuery = query;
    layoutState.commitSearchPageIndex(0);
    if(query.trim() && folderFlow.snapshot().renderedFolder) closeFolder();
    const documents = buildAppSearchDocuments(layoutState.operations.collectAppsFromPages(layoutState.presentation.pages.value));
    const pages = query.trim()
      ? layoutState.operations.chunkIntoPages(searchAppDocuments(documents, query), layoutState.presentation.pageSize.value)
      : layoutState.presentation.pages.value;
    currentFrame = Object.freeze({ ...currentFrame,
      viewport: Object.freeze({ ...currentFrame.viewport, activePages: snapshotContractValue(pages) as typeof currentFrame.viewport.activePages,
        activePageIndex: query.trim() ? 0 : layoutState.presentation.pageIndex.value,
        desktopProjectionEpoch: currentFrame.viewport.desktopProjectionEpoch + 1,
        desktopTrackMotionKey: query.trim() ? "native-search" : "native-desktop" }),
      interaction: Object.freeze({ ...currentFrame.interaction, focusedIcon: null, isSearchMode: Boolean(query.trim()) }),
    });
    activePageItems = getNativeActivePageItems(currentFrame);
    if(query.trim()) setFocusedIcon(firstIconFocus(getCurrentIconScope()));
    renderScene();
    iconNodes = collectActiveIconNodes();
  };

  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  offStateChange = app.on("statechange", ({ state,previous,reason }) => {
    logNativeRuntime("state",{state,previous,reason});
    if(state==="running"&&previous!=="running")windowEffects.refresh();
    if (state === "closing" || state === "closed") resolveClosed();
  });

  let presentCount = 0;
  let desktopPageMotionObserved = false;
  let folderPageMotionObserved = false;
  function commitDesktopPage(pageIndex: number): boolean {
    const nextFrame = setNativeDesktopPage(currentFrame, pageIndex);
    if (nextFrame === currentFrame) return false;
    if(searchQuery.trim()) layoutState.commitSearchPageIndex(nextFrame.viewport.activePageIndex);
    else layoutState.commitPageIndex(nextFrame.viewport.activePageIndex);
    currentFrame = nextFrame;
    activePageItems = getNativeActivePageItems(currentFrame);
    renderScene();
    const committedMotion = scene.getMotionSnapshot();
    desktopPageMotionObserved ||= Math.abs(
      committedMotion.desktopPageTrackX - committedMotion.desktopPageTrackTargetX,
    ) > 0.5;
    iconNodes = collectActiveIconNodes();
    return true;
  }
  const turnPage = (direction: Exclude<NativePageTurn, 0>): boolean => {
    return commitDesktopPage(currentFrame.viewport.activePageIndex + direction);
  };
  onDesktopPageIndexCommit = index => {
    wheelGestures.dispatch({ type: "cancel", time: performance.now() });
    for (const timer of wheelDeadlines.values()) clearTimeout(timer);
    wheelDeadlines.clear();
    clearWheelPresentation();
    commitDesktopPage(index);
  };
  const commitEditedPages = (pages: LaunchpadPages): void => {
    layoutState.commitPages(pages);
    layoutState.commitPageIndex(layoutState.presentation.pageIndex.value);
    const config = layoutState.captureConfiguration();
    const document = layoutState.operations.createLayoutSnapshot({ ...loadedLayout?.settings,...settings.persistence.capture(),...apps?.persistence.capture(),
      pages, gridRows: config.rows, gridCols: config.cols, folderRows: config.folderRows, folderCols: config.folderCols,
      iconSize: config.iconSize, folderIconSize: config.folderIconSize, folderIconSizeMode: config.folderIconSizeMode,
      textless: layoutSettings.isTextlessModeState.value,hiddenAppIds:[...(apps?.presentation.hiddenAppIds.value??loadedLayout?.settings.hiddenAppIds??[])] });
    saves.enqueue(document);
    void saves.flush().catch(()=>{}); // The serialized writer reports failures and exposes retry through the notice.
    changeSearch(searchQuery);
    refreshTargetChecks();
    requestSceneRender();
  };
  editing = createNativeEditing({ layout: layoutState, scene, folder: folderFlow,
    size: () => app.contentSize, chromeInset, changed: requestSceneRender, commit: commitEditedPages,
    selectionToolbarRect:()=>selectionToolbar.cancelZoneRect(),
    confirm:config=>management.warning({...config,cancelText:t("common.actions.cancel"),intent:"warning",confirmAppearance:"outline",confirmTone:"danger",onConfirm:async()=>{config.onConfirm();await saves.flush();}}),
    page: index => onDesktopPageIndexCommit(index), folderPage: setFolderPageIndex,
    open: id => {
      if(!id) { closeFolder(); return; }
      const item = editing?.projectedPages().flat().find(item => item.id === id);
      if(item) { folderFlow.open(snapshotContractValue(item) as SceneItem);setFocusedIcon(null);requestSceneRender(); }
    },
  });
  const closeSettings=()=>{
    if(settingsShell?.applying)return;
    if(!stopShortcutRecording()){settingsShell?.redraw();return;}
    searchBar.host.blur();settingsShell?.destroy();settingsShell=null;
    settings.cancelEdit();requestSceneRender();
  };
  let appsChangeQueued=false,appsPersistenceKey="";
  const changedApps=()=>{
    if(appsChangeQueued)return;appsChangeQueued=true;
    queueMicrotask(()=>{
      appsChangeQueued=false;if(!apps||sceneDisposed)return;
      const key=JSON.stringify(apps.persistence.capture());
      const persistedChange=key!==appsPersistenceKey;
      if(persistedChange){appsPersistenceKey=key;commitEditedPages(layoutState.operations.clonePages(layoutState.presentation.pages.value));}
      // Source edits are already visible in their live input. Recreating the whole
      // page on blur would flash it while focus is moving to the next source field.
      const sourceFieldFocused=searchBar.host.focused?.label?.startsWith("native-apps:source-");
      const keywordDraftFocused=searchBar.host.focused?.label==="native-apps:keyword"&&!persistedChange;
      if(settingsShell&&settingsNavigation.activeRoute.value.tabId==="apps"&&!sourceFieldFocused&&!keywordDraftFocused&&!management.modal)settingsShell.redraw();
      appDialogs?.sync();
      refreshTargetChecks();
      requestSceneRender();
    });
  };
  apps=createLaunchpadApps({
    ...layoutState.operations,pages:layoutState.presentation.pages,
    catalogPort:createNativeCatalogPort(nativeData),localizationText:{t},shouldUseNativeCatalog:()=>true,
    isDragActive:()=>editing!.drag.isDragActive(),commitPages:pages=>editing!.commit(pages),commitPagesAfterDeletion:pages=>editing!.commit(pages),
    commitOpenFolder:id=>{if(!id)closeFolder();},openFolderId:{get value(){return folderFlow.snapshot().renderedFolder?.id??null;}},
    renderedFolder:{get value(){return folderFlow.snapshot().renderedFolder as import("../domain/launchpadLayout.js").ReadonlyLaunchpadFolder|null;}},
    reclampPageIndices:()=>layoutState.commitPageIndex(layoutState.presentation.pageIndex.value),schedulePageGridMetrics:requestSceneRender,
    openScanKeywordSettings:()=>{settingsNavigation.selectTab("apps");appsPageState.keywords=true;if(settingsShell)settingsShell.redraw();else openSettings();},
    clearFocusedIcon:()=>setFocusedIcon(null),
    openWarningDialog:config=>management.warning({...config,onConfirm:async()=>{config.onConfirm?.();await saves.flush();}}),
    showTransientNotice:notice=>notices.showTransientNotice(notice),
  },createNativeStateHost(changedApps));
  apps.persistence.restore(loadedLayout?.settings??{});appsPersistenceKey=JSON.stringify(apps.persistence.capture());
  appDialogs=new NativeAppDialogs({apps,management,host:searchBar.host,theme:settingsTheme,invalidate:()=>app.invalidate(),save:()=>saves.flush(),pickIcon:async()=>{
    const result=await nativeHost.platform.dialogs.openFiles({allowedFileTypes:"png,jpg,jpeg,webp,bmp,gif,svg,ico",multiple:false});
    if(!result.ok){if(result.error.code==="CANCELLED")return null;throw new Error(result.error.message);}
    const path=result.value[0];return path?nativeData.cacheCustomIcon(await normalizeNativeCustomIcon(path)):null;
  }});
  let targetCheckKey="",targetCheckGeneration=0;
  refreshTargetChecks=()=>{
    if(!apps||sceneDisposed)return;
    const checks=apps.nativeIntegration.listLaunchTargets();
    const key=apps.nativeIntegration.shouldCheckLaunchTargets()?apps.nativeIntegration.launchTargetCheckSignature(checks):"off";
    if(key===targetCheckKey)return;targetCheckKey=key;const generation=++targetCheckGeneration;
    if(key==="off"){apps.nativeIntegration.clearLaunchTargetStatuses();return;}
    void nativeData.checkLaunchTargets(checks.map(({id,launchTarget})=>({id,launchTarget}))).then(results=>{
      if(generation===targetCheckGeneration&&!sceneDisposed)apps?.nativeIntegration.applyLaunchTargetStatuses(results,checks);
    }).catch(error=>{if(!sceneDisposed)logNativeRuntime("launch-target-check-error",error);});
  };
  refreshTargetChecks();
  const flowState=createNativeStateHost(requestSceneRender),openingIcon=flowState.cell<import("../application/launchpadLaunchFlow.js").LaunchIconFocus|null>(null);
  const launchTimers=new Map<number,ReturnType<typeof setTimeout>>();let nextLaunchTimer=0;
  disposeLaunchFlow=()=>{for(const timer of launchTimers.values())clearTimeout(timer);launchTimers.clear();};
  let visibilityGeneration=0,visibilityPreparing=false;
  const hideAfterPresented=async()=>{
    if(windowClosing)return;
    const generation=visibilityGeneration;
    if(!app.window.isMinimized()&&app.state==="running")await present(app,"desktop close animation final frame");
    if(generation!==visibilityGeneration||launchFlow!.isDesktopOpen.value)return;
    app.window.hide();logNativeRuntime("hidden");
  };
  launchFlow=createLaunchpadLaunchFlow({
    localizationText:{t},desktopMainRef:flowState.cell(null),keyboardFocusArea:flowState.cell("desktop"),openingIcon,
    searchInputRef:flowState.derived(()=>searchBar.input),
    cancelInputGesture:()=>{
      wheelGestures.dispatch({type:"cancel",time:performance.now()});
      for(const timer of wheelDeadlines.values())clearTimeout(timer);wheelDeadlines.clear();clearWheelPresentation();
      editing?.alt.cancelAltEditMode();
    },clearFocusedIcon:()=>setFocusedIcon(null),
    clearOpeningIcon:()=>{openingIcon.value=null;},clearSearch:()=>changeSearch(""),
    cloneItem:item=>layoutState.operations.cloneItem(item) as import("../domain/launchpadLayout.js").LaunchpadApp,
    getLaunchIconRect:source=>{
      const node=app.stage.getChildByLabel(`launchpad-item:${source.id}`,true) as (Container & {iconSprite?:Sprite;emojiText?:Text})|null;
      const visual=node?.iconSprite?.visible?node.iconSprite:node?.emojiText;
      const rect=visual?.getBounds()??node?.getBounds();
      return rect?{left:rect.x,top:rect.y,width:rect.width,height:rect.height}:null;
    },
    hasFolderLayer:()=>Boolean(folderFlow.snapshot().renderedFolder),isFolderAppLaunchClosing:flowState.derived(()=>false),
    isDragActive:()=>editing?.drag.isDragActive()??false,isSearchMode:()=>Boolean(searchQuery.trim()),
    normalizeLaunchSource:item=>({id:item.id,area:folderFlow.snapshot().renderedFolder?"folder":searchQuery?"search":"desktop",pageIndex:getCurrentIconScope().pageIndex}),
    prepareNativeLaunch:async()=>{try{await saves.flush();return true;}catch{return false;}},
    launchNativeAppIfAvailable:async item=>{
      try{await nativeData.launchApp(item.id);return true;}
      catch(error){const detail=readErrorMessage(error);return {kind:"launch",title:t("errors.launch.genericTitle"),message:detail,detail,suggestion:t("errors.launch.suggestion.editTarget")};}
    },
    showNativeLaunchError:error=>{showLaunchpad();management.warning({...error,intent:"error",confirmText:t("notices.acknowledge")});},
    beginNativeWindowClose:()=>{
      visibilityGeneration++;
      windowEffects.set("none",resolveAppearancePreference(settings.presentation.windowEffectAppearance.value,systemAppearance));
      desktopBackground.alpha=0;
      fadeNativeLaunchpadChrome([searchBar,settingsButton,windowChrome,management,...(settingsShell?[settingsShell]:[])],false);
    },
    hideNativeWindow:hideAfterPresented,onDesktopCloseComplete:()=>{void hideAfterPresented().catch(reportNativeError);},
    schedulePageGridMetrics:requestSceneRender,startHomeRevealSettleWindow:()=>{},
  },flowState,{
    setTimeout:(callback,delay)=>{const id=++nextLaunchTimer;launchTimers.set(id,setTimeout(()=>{launchTimers.delete(id);callback();},delay));return id;},
    clearTimeout:id=>{clearTimeout(launchTimers.get(id));launchTimers.delete(id);},afterCommit:queueMicrotask,
  });
  showLaunchpad=()=>{
    visibilityGeneration++;visibilityPreparing=false;
    const generation=visibilityGeneration;
    logNativeRuntime("show-request",{state:app.state,minimized:app.window.isMinimized()});
    if(app.state==="failed"){logNativeRuntime("show-failed","Renderer failed; use tray restart to recover");return;}
    if(folderFlow.snapshot().renderedFolder)folderFlow.reset();
    if(app.window.isMinimized())app.window.unminimize();
    windowEffects.set(settings.presentation.windowEffectMaterial.value,resolveAppearancePreference(settings.presentation.windowEffectAppearance.value,systemAppearance));
    app.window.show();app.window.activate();
    const reveal=()=>{
      if(generation!==visibilityGeneration||windowClosing)return;
      windowEffects.refresh();
      launchFlow!.openDesktop();fadeNativeLaunchpadChrome([desktopBackground,searchBar,windowChrome,management],true);
      requestSceneRender();logNativeRuntime("shown",{state:app.state});
    };
    if(app.state==="running")reveal();
    else void waitFor("window restored before reveal",()=>app.state==="running"&&!app.window.isMinimized()).then(reveal)
      .catch(error=>logNativeRuntime("show-timeout",error));
  };
  dismissLaunchpad=()=>{
    if(visibilityPreparing||launchFlow!.isLaunchpadInteractionBlocked()||editing?.drag.isDragActive()||settingsShell?.applying)return;
    const generation=++visibilityGeneration;visibilityPreparing=true;
    void saves.flush().then(()=>{
      if(generation!==visibilityGeneration)return;
      visibilityPreparing=false;closeSettings();launchFlow!.closeDesktop({clearSearch:true});
    }).catch(error=>{visibilityPreparing=false;reportNativeError(error);});
  };
  toggleLaunchpad=()=>{
    if(windowClosing)return;
    if(app.window.isMinimized()||app.state!=="running"||!app.window.isVisible()||!launchFlow!.isDesktopOpen.value||visibilityPreparing)showLaunchpad();
    else dismissLaunchpad();
  };
  if(!process.env.LUMERIA_NATIVE_DATA_DIR){
    const outcome=mainShortcut.apply(normalizeMainWindowShortcut(loadedLayout?.settings.mainWindowShortcut));
    if(!outcome.ok){
      const message=readErrorMessage(outcome.error);console.error("Native shortcut registration failed:",message);
      settings.actions.setMainWindowShortcutError(message);reportNativeError(message);
    }
  }
  openSettings=()=>{
    if(settingsShell||editing!.drag.isDragActive())return;
    closeFolder();editing!.selection.clear();editing!.alt.cancelAltEditMode();searchBar.host.blur();
    const startupStatus=settings.beginEdit();
    settingsShell=new NativeSettingsShell({
      navigation:settingsNavigation,t:key=>t(key),tabs:["general","interface","apps","about"],
      beforeKey:event=>{
        if(!recordingShortcut)return false;
        if(event.type!=="down")return true;
        const result=mainWindowShortcutFromKeyboardEvent(event);
        if(result.status==="valid"){settings.actions.setDraftMainWindowShortcut(result.shortcut);stopShortcutRecording();}
        else if(result.status==="cancel")stopShortcutRecording();
        else settings.actions.setMainWindowShortcutError(t(`settings.general.shortcut.invalid.${result.reason}`));
        settingsShell?.redraw();return true;
      },
      theme:()=>settingsTheme(),
      size:()=>app.contentSize,topInset:chromeInset,invalidate:()=>app.invalidate(),close:closeSettings,
      anchor:()=>({x:settingsButton.x,y:settingsButton.y,width:34,height:34}),
      content:(tab,subPage,width)=>tab==="apps"
        ?nativeAppsSettingsPage({apps:apps!,host:searchBar.host,width,theme:settingsTheme(),state:appsPageState,subPage,management,icons:iconTextures,
          invalidate:()=>app.invalidate(),redraw:()=>settingsShell?.redraw(),
          navigate:page=>{settingsNavigation.openSubPage({id:page==="manager"?"apps.appManager":"apps.excludedApps",parentTabId:"apps",
            labelKey:page==="manager"?"settings.apps.manager.title":"settings.apps.excluded.title"});settingsShell?.redraw();},
          edit:item=>editItem(item as SceneItem|null)})
        :tab==="general"
        ?nativeGeneralSettingsPage({settings,width,theme:settingsTheme(),
          management,invalidate:()=>app.invalidate(),redraw:()=>settingsShell?.redraw(),recording:recordingShortcut,
          record:recordShortcut,expanded:expandedIcons,expand:()=>{expandedIcons=!expandedIcons;settingsShell?.redraw();},icons:brandingTextures})
        :tab==="about"
        ?nativeAboutSettingsPage(width,settingsTheme(),brandingTextures.get(settings.draft.launchpadIconVariant.value)!)
        :nativeLayoutSettingsPage(settings,searchBar.host,width,()=>app.invalidate(),
          settingsTheme(),()=>settingsShell?.redraw(),{renderer:app.renderer,size:app.contentSize,state:backgroundPanelState,systemAppearance,
            chooseColor:app.supportsColorDialog?async color=>{
              const result=await app.chooseColor(color);
              if(!result.ok){if(result.error.code==="CANCELLED")return null;throw new Error(result.error.message);}
              return result.value;
            }:undefined},windowPanelState,()=>editing!.pageCommands.confirmForceFillAllPages()),
      apply:async()=>{
        if(!stopShortcutRecording())throw new Error(settings.presentation.mainWindowShortcutError.value);
        if(settings.presentation.isChoosingBackgroundImage.value)throw new Error(t("settings.interface.background.layer.choosing"));
        try{
          await desktopBackground.configure(nativeDraftBackground(settings),app.contentSize.width,app.contentSize.height,undefined,systemAppearance);
        }catch(error){
          try{await refreshBackground();}
          catch(rollback){throw new AggregateError([error,rollback],`${readErrorMessage(error)}\n${readErrorMessage(rollback)}`);}
          throw error;
        }
        const outcome=await settings.applyEdit();
        if(!outcome.ok){
          const errors:unknown[]=[outcome.error];
          if("rollbackErrors" in outcome&&Array.isArray(outcome.rollbackErrors))errors.push(...outcome.rollbackErrors);
          try{await refreshBackground();}catch(error){errors.push(error);}
          throw new Error(errors.map(readErrorMessage).filter(Boolean).join("\n"));
        }
        await refreshBackground();
        const config=layoutState.captureConfiguration();
        currentFrame=Object.freeze({...currentFrame,viewport:Object.freeze({...currentFrame.viewport,
          gridRows:config.rows,gridCols:config.cols,iconSize:config.iconSize,
        }),interaction:Object.freeze({...currentFrame.interaction,isTextlessMode:layoutSettings.isTextlessModeState.value})});
        commitEditedPages(layoutState.operations.clonePages(layoutState.presentation.pages.value));
        await saves.flush();
        tray?.refresh();
      },
    });
    const openedShell=settingsShell;
    void startupStatus.then(()=>{if(settingsShell===openedShell&&!openedShell.destroyed)openedShell.redraw();});
    app.stage.addChild(settingsShell);requestSceneRender();
  };
  tray=createLaunchpadTray({
    brandingDirectory:join(import.meta.dir,"branding"),createTray:options=>new NativeTray(options),openPath:openNativePath,
    icon:()=>settings.presentation.launchpadIconVariant.value,
    show:()=>showLaunchpad(),toggle:()=>toggleLaunchpad(),
    settings:()=>{
      showLaunchpad();
      void waitFor("tray settings window ready",()=>app.state==="running"&&launchFlow!.isDesktopOpen.value)
        .then(()=>openSettings()).catch(error=>logNativeRuntime("tray-settings-error",error));
    },
    quit:restart=>{if(windowClosing)return;restartRequested=restart;quitRequested=!restart;logNativeRuntime(restart?"restart-request":"quit-request");app.window.requestClose();},
  });
  logNativeRuntime("ready",{version:"0.1.0",state:app.state,logDirectory:nativeLogDirectory});
  const turnFolderPage = (direction: Exclude<NativePageTurn, 0>): boolean => {
    if (!setFolderPageIndex(folderFlow.snapshot().folderPageIndex + direction)) return false;
    return true;
  };
  const wheelGestures = createLaunchpadGestureEngine();
  let lastWheelGestureTime = 0;
  const clearWheelDeadline = (kind: LaunchpadGestureDeadline["kind"]): void => {
    const timer = wheelDeadlines.get(kind);
    if (timer) clearTimeout(timer);
    wheelDeadlines.delete(kind);
  };
  const clearWheelPresentation = (): void => {
    desktopPageTrackScrub = null;
    folderPageTrackScrub = null;
    requestSceneRender();
  };
  const toPageTrackScrub = (
    presentation: LaunchpadPagePresentation,
  ): ScenePageTrackScrub => ({
    ...(presentation.continuousWheel?{continuousWheel:true,sampleTime:presentation.sampleTime}:{}),
    edge: presentation.edge,
    fromIndex: presentation.fromIndex,
    progress: presentation.progress,
    scope: presentation.scope,
    ...(presentation.settle ? {
      settle: true,
      settleToken: presentation.settleToken,
      targetProgress: presentation.targetProgress,
      velocity: presentation.velocity,
    } : {}),
    toIndex: presentation.toIndex,
  });
  let applyWheelOutput: (
    output: LaunchpadGestureOutput,
    event: FederatedWheelEvent | null,
    time: number,
  ) => void;
  const scheduleWheelDeadline = (
    deadline: LaunchpadGestureDeadline | null | undefined,
  ): void => {
    if (!deadline) {
      clearWheelDeadline("wheelEnd");
      clearWheelDeadline("hold");
      return;
    }
    clearWheelDeadline(deadline.kind);
    const timer = setTimeout(() => {
      wheelDeadlines.delete(deadline.kind);
      if (deadline.kind === "clearPresentation") {
        clearWheelPresentation();
        return;
      }
      applyWheelOutput(
        wheelGestures.dispatch({ type: "deadline", kind: deadline.kind, time: deadline.at }),
        null,
        deadline.at,
      );
    }, Math.max(0, deadline.at - lastWheelGestureTime));
    wheelDeadlines.set(deadline.kind, timer);
  };
  applyWheelOutput = (output, event, time): void => {
    activeTouchpadCapture?.decision(output);
    lastWheelGestureTime = time;
    if (output.presentation) {
      clearWheelDeadline("clearPresentation");
      const scrub = toPageTrackScrub(output.presentation);
      if (scrub.scope.startsWith("folder:")) {
        desktopPageTrackScrub = null;
        folderPageTrackScrub = scrub;
      } else {
        desktopPageTrackScrub = scrub;
        folderPageTrackScrub = null;
      }
      requestSceneRender();
    }
    for (const command of output.commands) {
      if(command.type === "startDrag" && command.target.kind === "icon" && command.target.id) {
        editing?.beginDrag(command.target.id, {
          ...scene.createDragPointerEvent(command.target.id,{clientX:Number(command.pointer.x),clientY:Number(command.pointer.y),
            pointerId:command.pointer.pointerId??undefined,pointerType:command.pointer.pointerType,
            button:0,buttons:1,type:"pointermove"}),
          isPrimary:true,pointerType:command.pointer.pointerType??undefined,
          dragAnchor:command.dragAnchor,dragStartedFromThreshold:command.dragStartedFromThreshold,
        });
      }
      if(command.type === "updateDrag") editing?.drag.updateDragPointer({ clientX: Number(command.pointer.x), clientY: Number(command.pointer.y),
        pointerId: command.pointer.pointerId, pointerType: command.pointer.pointerType, buttons: command.pointer.buttons, preventDefault: () => {} });
      if(command.type === "finishDrag") editing?.drag.finishDrag({ clientX: Number(command.pointer.x), clientY: Number(command.pointer.y),
        pointerId: command.pointer.pointerId, pointerType: command.pointer.pointerType, button: 0, type: "pointerup" });
      if(command.type === "cancelDrag") editing?.drag.cancelDrag({ pointerId: command.pointer.pointerId, type: "pointercancel" });
      if(command.type === "openContextMenu" && command.target.kind === "icon") {
        const id=command.target.id;const item=getCurrentIconScope().items.find(item=>item.id===id);
        if(item)contextMenu(item,Number(command.pointer.x),Number(command.pointer.y));
      }
      if (command.type === "activateTarget" && command.target.kind === "icon") {
        const id = command.target.id;
        const item = getCurrentIconScope().items.find(item => item.id === id);
        if (item) void activateItem(item, {shiftKey: pointerShiftKey});
      }
      if(command.type==="surfaceTap"&&command.target.kind==="surface"){
        if(settingsShell||management.modal||editing?.drag.isDragActive())continue;
        if(folderFlow.snapshot().renderedFolder){closeFolder();continue;}
        dismissLaunchpad();
      }
      if (command.type !== "commitPage") continue;
      if (command.scope.startsWith("folder:")) {
        if (command.scope === `folder:${folderFlow.snapshot().renderedFolder?.id}`) {
          setFolderPageIndex(command.pageIndex);
        }
      } else {
        commitDesktopPage(command.pageIndex);
      }
    }
    if (Object.prototype.hasOwnProperty.call(output, "deadline")) {
      scheduleWheelDeadline(output.deadline);
    }
    if (output.handled) {
      event?.preventDefault();
      event?.stopPropagation();
    }
  };
  const onWheel = (event: FederatedWheelEvent): void => {
    if(launchFlow?.isLaunchpadInteractionBlocked())return;
    if(settingsShell||management.modal || searchBar.input.focused || editing?.drag.isDragActive())return;
    const folder = folderFlow.snapshot();
    if (folder.renderedFolder && folder.isClosing) {
      event.preventDefault();
      return;
    }
    const scope = folder.renderedFolder ? `folder:${folder.renderedFolder.id}` : "desktop";
    const pageIndex = folder.renderedFolder
      ? folder.folderPageIndex
      : currentFrame.viewport.activePageIndex;
    const pageCount = folder.renderedFolder
      ? folder.renderedFolder.childPages.length
      : currentFrame.viewport.activePages.length;
    const timeStamp = Number(event.timeStamp);
    const time = Number.isFinite(timeStamp) && timeStamp >= 0 ? timeStamp : performance.now();
    const touchpad=readNativeTouchpad(event);
    applyWheelOutput(wheelGestures.dispatch({
      type: "wheel",
      time,
      ctrlKey: event.ctrlKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      metaKey: event.metaKey,
      momentum: touchpad?touchpad.phase==="inertia":null,
      ...(touchpad?{wheelSource:"touchpad" as const,wheelPhase:touchpad.phase}:{}),
      viewport: {
        scope,
        pageIndex,
        pageCount,
        pageWidth: scene.getPageWidth(scope, pageIndex, app.contentSize.width),
      },
    }), event, time);
  };
  let touchpadOwner:{sequence:number;settings:NativeSettingsShell|null;dialog:string|null;folder:string|null}|null=null;
  const guardTouchpadRoute=(event:FederatedWheelEvent)=>{
    const meta=readNativeTouchpad(event);
    if(!meta)return;
    if(meta.phase==="begin")touchpadOwner={sequence:meta.sequence,settings:settingsShell,dialog:management.activeId,folder:folderFlow.snapshot().renderedFolder?.id??null};
    const valid=touchpadOwner?.sequence===meta.sequence&&touchpadOwner.settings===settingsShell&&touchpadOwner.dialog===management.activeId&&touchpadOwner.folder===(folderFlow.snapshot().renderedFolder?.id??null);
    if(!valid){event.preventDefault();event.stopPropagation();touchpadOwner=null;interruptWheel(event);}
    if(meta.phase==="end"||meta.phase==="cancel")touchpadOwner=null;
  };
  app.stage.on("wheelcapture",guardTouchpadRoute);
  app.stage.on("wheel", onWheel);
  offWheel = () => {app.stage.off("wheel", onWheel);app.stage.off("wheelcapture",guardTouchpadRoute);};
  const interruptWheel = (event: Readonly<{ timeStamp?: unknown }>): void => {
    if (touchId !== null) return;
    const timestamp = Number(event.timeStamp);
    const time = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : performance.now();
    applyWheelOutput(wheelGestures.dispatch({ type: "cancel", time }), null, time);
  };
  let touchId: number | null = null;
  let pointerShiftKey = false;
  const touch = (type: string, event: FederatedPointerEvent): void => {
    if(launchFlow?.isLaunchpadInteractionBlocked())return;
    if (event.pointerType !== "touch" && event.pointerType !== "mouse") return;
    if (type === "pointerDown" && (touchId !== null || event.isPrimary === false)) return;
    if (type !== "pointerDown" && touchId !== event.pointerId) return;
    const scope = getCurrentIconScope();
    const target = resolveNativePointerTarget(event.target);
    const itemId = target.kind === "icon" ? target.id : undefined;
    if(type === "pointerDown" && target.kind === "control") return;
    // Closing residuals keep their original reopen handler; desktop icons use the desktop scope.
    if(type === "pointerDown" && folderFlow.snapshot().isClosing && (!itemId || !activePageItems.some(item=>item.id===itemId))) return;
    if(type === "pointerDown" && !itemId && scope.area === "folder") return;
    if(type === "pointerDown" && management.modal) return;
    if(type === "pointerDown" && settingsShell) return;
    pointerShiftKey=event.shiftKey;
    const output = wheelGestures.dispatch({ type, pointerId: event.pointerId, pointerType: event.pointerType,
      isPrimary: event.isPrimary, button: event.button, buttons: event.buttons,
      x: event.global.x, y: event.global.y, time: event.timeStamp,
      target: itemId ? { kind: "icon", id: itemId } : { kind: "surface" },
      dragOnHold: editing?.selection.isActive.value === true,
      viewport: { scope: scope.area === "folder" ? `folder:${scope.folderId}` : scope.area,
        pageIndex: scope.pageIndex,
        pageCount: scope.area === "folder" ? folderFlow.snapshot().renderedFolder!.childPages.length : currentFrame.viewport.activePages.length,
        pageWidth: scene.getPageWidth(scope.area === "folder" ? `folder:${scope.folderId}` : scope.area, scope.pageIndex, app.contentSize.width) },
    });
    if (output.ownsPointer) {
      touchId = event.pointerId;
      clearWheelPresentation();
      app.nativeInput.capturePointer(event.pointerId);
    }
    applyWheelOutput(output, null, event.timeStamp);
    if (output.releasesPointer) {
      app.nativeInput.releasePointerCapture(event.pointerId);
      touchId = null;
    }
    event.stopPropagation();
  };
  const touchDown = (event: FederatedPointerEvent) => touch("pointerDown", event);
  const touchMove = (event: FederatedPointerEvent) => touch("pointerMove", event);
  const touchUp = (event: FederatedPointerEvent) => touch("pointerUp", event);
  const touchCancel = (event: FederatedPointerEvent) => touch("pointerCancel", event);
  app.stage.on("pointerdowncapture", touchDown);
  app.stage.on("globalpointermove", touchMove);
  app.stage.on("pointerupcapture", touchUp);
  app.stage.on("pointerupoutside", touchUp);
  app.stage.on("pointercancel", touchCancel);
  offTouch = () => {
    app.stage.off("pointerdowncapture", touchDown);
    app.stage.off("globalpointermove", touchMove);
    app.stage.off("pointerupcapture", touchUp);
    app.stage.off("pointerupoutside", touchUp);
    app.stage.off("pointercancel", touchCancel);
    if (touchId !== null) app.nativeInput.releasePointerCapture(touchId);
  };
  app.stage.on("pointerdowncapture", interruptWheel);
  offWheelPointerInterrupt = () => app.stage.off("pointerdowncapture", interruptWheel);
  const onKey = (event: NativeNavigationKey): boolean => {
    if(windowClosing)return true;
    if(launchFlow?.isLaunchpadInteractionBlocked())return true;
    if(event.type==="up") {editing?.alt.handleAltKeyUp(event);return false;}
    if(management.modal) {
      const handled=management.handleKey(event);app.invalidate();return handled;
    }
    if(settingsShell){
      if(searchBar.host.focused?.composing||event.isComposing)return false;
      return settingsShell.handleKey(event);
    }
    if (searchBar.input.composing || event.isComposing) return false;
    if(noticeView.hasFocus){
      if(noticeView.handleKey(event.key??"",Boolean(event.shiftKey)))return true;
      if(event.key==="Tab")searchBar.input.focus();
      return true;
    }
    if(editing?.drag.isDragActive()){
      if(event.key==="Escape")editing.drag.cancelDrag({userInitiatedCancel:true});
      return true;
    }
    if(editing?.selection.isActive.value&&(event.key==="Tab"||selectionToolbar.hasFocus)&&selectionToolbar.handleKey(event.key??"",Boolean(event.shiftKey))){setFocusedIcon(null);return true;}
    if(event.key==="Escape" && editing?.selection.isActive.value){
      if(!editing.selection.isFrozen.value)editing.selection.clear();
      return true;
    }
    if (searchBar.input.focused) {
      if(event.key==="Escape") {searchBar.setQuery("");searchBar.input.blur();return true;}
      if(event.key==="Tab" || event.key?.startsWith("Arrow") || event.key==="Enter") {
        if((event.key==="ArrowLeft" || event.key==="ArrowRight") && event.shiftKey)return false;
        searchBar.input.blur();
        if(event.key==="Tab"){if(event.shiftKey&&noticeView.focusEdge(true))return true;setFocusedIcon(currentFrame.interaction.focusedIcon??firstIconFocus(getCurrentIconScope()));return true;}
      } else return false;
    }
    editing?.alt.handleAltKeyDown(event);
    if(editing?.alt.isAltKeyEvent(event))return true;
    if(event.type === "down" && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key?.toLowerCase()==="a" && editing?.selection.isActive.value) {
      editing.selection.selectScope(getSelectionScope());return true;
    }
    if(event.type==="down" && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key?.toLowerCase()==="n" && editing?.selection.isActive.value){editing.createFolder();return true;}
    if(event.type==="down" && event.key==="F2") {const item=findFocusedIcon(currentFrame.interaction.focusedIcon,getCurrentIconScope());if(item)editItem(item);return true;}
    if(event.type==="down" && event.key==="Delete" && editing?.selection.isActive.value) {if(editing.selection.selectedCount.value)removeItems([...editing.selection.selectedIds.value]);return true;}
    if(editing?.selection.isActive.value && event.key===" " && !event.altKey){
      const item=findFocusedIcon(currentFrame.interaction.focusedIcon,getCurrentIconScope());
      if(item?.type==="app")void activateItem(item,event);
      return true;
    }
    if(editing?.selection.isActive.value && (event.key==="Enter" || event.key==="Backspace" || (!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key?.length===1)))return true;
    if(event.type==="down" && event.key==="Tab") {
      if(noticeView.focusEdge(Boolean(event.shiftKey))){setFocusedIcon(null);return true;}
      if(folderFlow.snapshot().renderedFolder || editing?.selection.isActive.value)setFocusedIcon(currentFrame.interaction.focusedIcon??firstIconFocus(getCurrentIconScope()));
      else searchBar.input.focus();
      return true;
    }
    if(event.type==="down" && !event.ctrlKey && !event.altKey && !event.metaKey && event.key?.length===1 && event.key!==" " && !folderFlow.snapshot().renderedFolder) {
      // The native text session starts after this key's character message; transfer its first character once.
      searchBar.input.focus();searchBar.input.commitText(event.key);return true;
    }
    if (event.type !== "down" || event.isComposing || event.altKey || event.metaKey) return false;
    const key = event.key || event.code;
    const direction = getNativePageTurnFromKey(event);
    const arrow = key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
    if (event.ctrlKey && direction === 0) return false;
    if (!arrow && key !== "Enter" && key !== "Escape") return false;
    if (event.repeat && !arrow) return true;
    wheelGestures.dispatch({ type: "cancel", time: performance.now() });
    for (const timer of wheelDeadlines.values()) clearTimeout(timer);
    wheelDeadlines.clear();
    clearWheelPresentation();
    const folder = folderFlow.snapshot();
    if (key === "Escape") {
      if(folder.renderedFolder)closeFolder();
      else if(searchQuery)searchBar.setQuery("");
      else dismissLaunchpad();
      return true;
    }
    if (folder.isClosing) return true;
    if (direction !== 0) {
      const changed = folder.renderedFolder ? turnFolderPage(direction) : turnPage(direction);
      if (changed) setFocusedIcon(firstIconFocus(getCurrentIconScope()));
      return true;
    }
    const scope = getCurrentIconScope();
    if (arrow) {
      setFocusedIcon(moveIconFocus(currentFrame.interaction.focusedIcon, scope, key));
    } else if (key === "Enter") {
      const focused = findFocusedIcon(currentFrame.interaction.focusedIcon, scope);
      if (focused) void activateItem(focused);
      else setFocusedIcon(firstIconFocus(scope));
    }
    return true;
  };
  searchBar.handleKey=onKey;
  if(nativeMode==="dev"&&process.env.LAUNCHPAD_TOUCHPAD_CAPTURE_DIR){
    app.window.setTitle("LaunchPad · Swipe speed preview");
    const directory=process.env.LAUNCHPAD_TOUCHPAD_CAPTURE_DIR;
    mkdirSync(directory,{recursive:true});
    const outputPath=join(directory,`touchpad-native-${Date.now()}.json`);
    const status=createNativeText({text:"",eventMode:"none",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fill:"#ffffff"}});
    const panel=new Container({label:"native-touchpad-capture",eventMode:"static"});
    panel.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,480,140,8).fill("#20242e"),status);status.position.set(10,8);
    let detail=t("touchpadCapture.hint");
    const paint=()=>{if(panel.destroyed)return;status.text=`${t("touchpadCapture.title")}: ${t(capture.recording?"touchpadCapture.recording":capture.overflow?"touchpadCapture.full":"touchpadCapture.stopped")}\n${detail}`;panel.position.set(8,app.contentSize.height-148);app.stage.setChildIndex(panel,app.stage.children.length-1);app.invalidate();};
    const capture=createTouchpadCapture("native",()=>({...app.contentSize,resolution:app.resolution}),paint);
    setTouchpadCapture(capture);app.stage.addChild(panel);paint();
    for(const type of ["pointerdown","pointertap","wheel"] as const)panel.on(type,event=>event.stopPropagation());
    const exportFile=()=>{capture.stop();try{writeFileSync(outputPath,capture.serialize(),"utf8");detail=t("touchpadCapture.saved");}catch(error){detail=t("touchpadCapture.failed",{error:readErrorMessage(error)});}paint();};
    const toggle=()=>capture.recording?capture.stop():capture.start();
    const mark=()=>{capture.mark();detail=t("touchpadCapture.marked",{count:capture.count});paint();};
    const speedLabel=()=>t("touchpadCapture.speed",{mode:getPageSwipeSpeed()?t("touchpadCapture.rate",{rate:getPageSwipeSpeed()}):t("touchpadCapture.baseline")});
    const changeSpeed=()=>{interruptWheel({timeStamp:performance.now()});clearWheelPresentation();cyclePageSwipeSpeed();capture.speed();speedButton.caption.text=speedLabel();paint();};
    const speedButton=new NativeFluentButton(speedLabel(),458,changeSpeed,()=>app.invalidate(),"dark");speedButton.position.set(10,98);panel.addChild(speedButton);
    for(const [index,[label,action]] of ([[t("touchpadCapture.toggle"),toggle],[t("touchpadCapture.mark"),mark],[t("touchpadCapture.export"),exportFile]] as const).entries()){
      const button=new NativeFluentButton(label,146,action,()=>app.invalidate(),"dark");button.position.set(10+index*156,58);panel.addChild(button);
    }
    searchBar.handleKey=event=>{
      if(event.type==="down"&&!event.isComposing&&!event.repeat&&["F6","F7","F8","F9"].includes(event.key??"")){
        if(event.key==="F6")toggle();
        if(event.key==="F7")mark();
        if(event.key==="F9")changeSpeed();
        if(event.key==="F8")exportFile();return true;
      }
      return onKey(event);
    };
    app.stage.on("wheelcapture",event=>{let node=event.target as Container|null;let list=false;while(node){if(node===panel)return;if(node.label==="native-scroll-view")list=true;node=node.parent;}capture.wheel(event,list?"list":settingsShell||management.modal?"control":folderFlow.snapshot().renderedFolder?"folder":"desktop");});
    const offCaptureResize=app.on("resize",paint);
    app.beforeClose(async()=>{exportFile();});
    panel.on("destroyed",()=>{offCaptureResize();setTouchpadCapture(null);});
    console.log("Touchpad capture ready",outputPath);
    if(process.env.LAUNCHPAD_TOUCHPAD_CAPTURE_SELFTEST==="1"){
      await present(app,"capture controls ready");
      searchBar.handleKey({type:"down",key:"F6"});assert.equal(capture.recording,true);
      for(const expected of [0,6,4]){searchBar.handleKey({type:"down",key:"F9"});assert.equal(getPageSwipeSpeed(),expected);}
      const sample=new FederatedWheelEvent(app.renderer.events.rootBoundary);sample.deltaX=5;sample.deltaY=0;sample.deltaMode=0;sample.timeStamp=performance.now();
      app.stage.emit("wheelcapture",sample);
      searchBar.handleKey({type:"down",key:"F7"});
      await present(app,"capture recording and marker");
      const {getNativePixiApplicationTesting}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
      await captureOwnedWindow(getNativePixiApplicationTesting(app).handles().inputWindow,join(directory,"capture-ui.png"));
      searchBar.handleKey({type:"down",key:"F8"});
      const saved=JSON.parse(readFileSync(outputPath,"utf8")) as {events:{kind:string}[]};
      assert.ok(saved.events.some(event=>event.kind==="wheel"));assert.ok(saved.events.some(event=>event.kind==="mark"));assert.equal(capture.recording,false);
      console.log("Touchpad capture UI/export selftest passed");
      setTimeout(()=>{quitRequested=true;app.window.requestClose();},1500);
    }
  }
  if(startupLoadRecovered)notices.showLayoutLoadRecovered();
  bindApplicationFocus = () => {
    offFocus();
    offFocus=app.nativeInput.onFocusChange(focused=>{if(focused)windowEffects.refresh();else editing?.alt.handleWindowBlur();});
  };
  bindApplicationFocus();
  searchBar.input.on("submit", () => {
    const focused = findFocusedIcon(currentFrame.interaction.focusedIcon, getCurrentIconScope());
    if(focused) void activateItem(focused);
  });

  await present(app, "the first LaunchPad scene frame");
  presentCount += 1;
  await waitFor(
    "the LaunchPad entrance motion to make every node visible",
    () => iconNodes.every((node) => node.alpha >= 0.999 && node.renderable && node.visible),
  );
  await present(app, "the settled LaunchPad scene frame");
  presentCount += 1;

  let resizeObserved = false;
  let resizePresentCount = 0;
  let resizeSettledBackingObserved = false;
  let restoreObserved = false;
  let restorePresentCount = 0;
  let pageNavigation: NativeFrameProof["pageNavigation"] = "skipped-single-page";
  let structuredLaunchFailureObserved = false;
  let folderOpenMotionObserved = false;
  let folderCloseMotionObserved = false;
  let folderChildLaunchObserved = false;
  let dpiTransition: NativeHostLifecycleProof["dpiTransition"] = "skipped-no-mixed-dpi-display";
  let dpiResolution = app.resolution;

  const devtools=await attachNativeDevtools(app,{
    name:"LaunchPad",build:process.env.LAUNCHPAD_DEBUG_BUILD??"development",
    enabled:nativeMode==="dev"||process.env.LAUNCHPAD_DEVTOOLS==="1",
    isolated:Boolean(process.env.LUMERIA_NATIVE_DATA_DIR),
    state:()=>({
      route:settingsShell?settingsNavigation.activeRoute.value.key:"desktop",
      page:currentFrame.viewport.activePageIndex,
      folder:{id:folderFlow.snapshot().renderedFolder?.id??null,progress:folderFlow.snapshot().openProgress},
      selection:{active:editing?.selection.isActive.value??false,count:editing?.selection.selectedCount.value??0},
      drag:{active:editing?.drag.isDragActive()??false,phase:editing?.drag.groupDragState.value?.phase??null,
        hover:editing?.drag.dragFolderHoverState.value??null},
      motion:scene.getMotionSnapshot(),
    }),
  });
  if(devtools)logNativeRuntime("devtools-ready",devtools.identity);


  if (nativeMode === "smoke") {
    await (await import("./nativeIconRecoverySmoke.test.js")).runNativeIconRecoverySmoke(app);
    if(process.env.LAUNCHPAD_ACRYLIC_RECOVERY_SMOKE==="1"){
      const {getNativePixiApplicationTesting}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
      const handle=getNativePixiApplicationTesting(app).handles().inputWindow;
      const savedSettings=settings.persistence.capture();
      const backgroundVisible=desktopBackground.visible;
      const savedMaterial=settings.presentation.windowEffectMaterial.value,savedAppearance=settings.presentation.windowEffectAppearance.value;
      const samples:unknown[]=[];
      try{
        desktopBackground.visible=false;
        for(const appearance of ["dark","light"] as const){
          settings.persistence.restore({...savedSettings,windowEffectMaterial:"acrylic",windowEffectAppearance:appearance});
          for(let i=0;i<3;i++){
            dismissLaunchpad();await waitFor("acrylic close hides",()=>!app.window.isVisible());
            await new Promise(resolve=>setTimeout(resolve,220));
            assert.equal((await captureOwnedWindow(handle)).material,1,"old settle callbacks must not re-enable a hidden backdrop");
            showLaunchpad();await waitFor("acrylic reopen settles",()=>app.state==="running"&&scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
            await new Promise(resolve=>setTimeout(resolve,240));await cycleOwnedWindowFocus(handle,join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,`acrylic-${appearance}-${i}.png`));
            const sample=await captureOwnedWindow(handle);
            assert.equal(sample.material,3);samples.push({appearance,i,...sample});
          }
        }
        // Controlled DWM state loss verifies focus recovery without claiming an intermittent OS reproduction.
        windowEffects.set("none","light");await present(app,"transparent close material");
        await cycleOwnedWindowFocus(handle,join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"acrylic-close-transparent.png"),true);
        windowEffects.set("acrylic","light");
        app.setWindowPresentation("none","light");
        assert.equal((await captureOwnedWindow(handle)).material,1);await cycleOwnedWindowFocus(handle);
        assert.equal((await captureOwnedWindow(handle)).material,3,"focus must restore the requested material after native state loss");
        app.window.minimize();await waitFor("acrylic minimized",()=>app.state==="suspended");showLaunchpad();
        await waitFor("acrylic minimized recovery",()=>app.state==="running"&&!app.window.isMinimized());
        await new Promise(resolve=>setTimeout(resolve,240));assert.equal((await captureOwnedWindow(handle)).material,3);
        writeFileSync(join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"acrylic-recovery.json"),JSON.stringify(samples,null,2));
        console.log("Acrylic recovery: 6 dark/light hide-show/focus cycles, stale timer cancellation, DWM fault recovery and minimized restore passed");
      }finally{
        settings.persistence.restore(savedSettings);
        desktopBackground.visible=backgroundVisible;
        windowEffects.set(savedMaterial,resolveAppearancePreference(savedAppearance,systemAppearance));
      }
    }
    if(process.env.LAUNCHPAD_NATIVE_SETTINGS_ONLY!=="1"){
      const {sendAltSpace}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/shortcut-smoke.js");
      assert.ok(mainShortcut.apply("alt+Space").ok,"Alt+Space must register for the isolated physical input test");
      try{
        await sendAltSpace();
        await waitFor("shortcut close animation",()=>scene.getDesktopAlpha()<0.95&&scene.getDesktopAlpha()>0.02);
        assert.equal(app.window.isVisible(),true,"window remains visible during close animation");
        await captureSmokeFrame("shortcut-close-animation");
        await waitFor("physical shortcut hides",()=>!app.window.isVisible());
        await sendAltSpace();
        await waitFor("physical shortcut reopens",()=>app.window.isVisible()&&launchFlow!.isDesktopOpen.value);
        await waitFor("shortcut reopen settles",()=>scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
        app.window.minimize();
        await waitFor("shortcut test minimized",()=>app.window.isMinimized()&&app.state==="suspended");
        await sendAltSpace();
        await waitFor("Alt+Space restores minimized window",()=>!app.window.isMinimized()&&app.window.isVisible()&&app.state==="running");
        await waitFor("minimized restoration settles",()=>scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
        console.log("Physical Alt+Space restored minimized/suspended window");
        dismissLaunchpad();
        await waitFor("interruptible close started",()=>launchFlow!.isDesktopClosing.value);
        await sendAltSpace();
        await waitFor("shortcut reverses closing",()=>launchFlow!.isDesktopOpen.value&&scene.getDesktopAlpha()>0.99);
        await new Promise(resolve=>setTimeout(resolve,450));
        assert.equal(app.window.isVisible(),true,"old close completion cannot hide a reopened window");
        await present(app,"shortcut animation restoration");
        app.nativeInput.emitKey("down",{keyCode:0x1b});
        await waitFor("Escape uses animated dismissal",()=>launchFlow!.isDesktopClosing.value);
        await waitFor("Escape hides after animation",()=>!app.window.isVisible());
        await sendAltSpace();
        await waitFor("reopen after Escape",()=>app.window.isVisible()&&scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
        console.log("Physical Alt+Space: animated close, hidden reopen and close interruption passed");
      }finally{mainShortcut.apply(null);}
    }
    else console.log("Settings-focused smoke: skipped physical Alt+Space to preserve the running user instance");
    {
      const {sendTrayTestAction}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/tray-smoke.js");
      assert.ok(tray);
      await sendTrayTestAction(tray.id,"left");await waitFor("tray left click hides",()=>!app.window.isVisible());
      await sendTrayTestAction(tray.id,"left");await waitFor("tray left click reopens",()=>app.window.isVisible()&&launchFlow!.isDesktopOpen.value);
      await waitFor("tray show settles",()=>scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
      app.window.minimize();await waitFor("tray minimized fixture",()=>app.window.isMinimized()&&app.state==="suspended");
      await sendTrayTestAction(tray.id,"menu",0);await waitFor("tray menu restores",()=>!app.window.isMinimized()&&app.state==="running");
      await sendTrayTestAction(tray.id,"menu",1);await waitFor("tray settings opened",()=>Boolean(settingsShell));
      await present(app,"tray settings ready");
      app.nativeInput.emitKey("down",{keyCode:0x1b});await present(app,"tray settings dismissed");
      console.log("Tray left toggle, right-menu restore and settings actions passed");
    }
    if(settings.presentation.windowMode.value==="fullscreen"){
      await present(app,"restored fullscreen background settled");
      assert.equal(desktopBackground.getLocalBounds().width,app.contentSize.width,"startup background must cover the fullscreen width");
      assert.equal(desktopBackground.getLocalBounds().height,app.contentSize.height,"startup background must cover the fullscreen height");
      await captureSmokeFrame("fullscreen-startup-background");
      const {assertWindowInputCoverage}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/window-input-smoke.js");
      await assertWindowInputCoverage(app);
      const {getNativePixiApplicationTesting}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
      const testing=getNativePixiApplicationTesting(app),handle=testing.handles().inputWindow;
      const nativePoint=(x:number,y:number)=>testing.clientToScreen(Math.round(x*app.resolution),Math.round(y*app.resolution));
      const buttonBounds=settingsButton.getBounds();
      await clickOwnedNativeWindow(handle,nativePoint(buttonBounds.x+buttonBounds.width/2,buttonBounds.y+buttonBounds.height/2));
      await waitFor("real far-right settings click",()=>settingsShell!==null);
      app.nativeInput.emitKey("down",{keyCode:0x1b});await present(app,"fullscreen settings dismissed");
      const blank={x:app.contentSize.width-60,y:app.contentSize.height-110};
      assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(blank.x,blank.y)).kind,"surface");
      await clickOwnedNativeWindow(handle,nativePoint(blank.x,blank.y));
      await waitFor("real fullscreen blank click hides launchpad",()=>!app.window.isVisible());
      showLaunchpad();await present(app,"fullscreen blank-close restoration");
      await waitFor("fullscreen reopen animation settles",()=>!scene.getMotionSnapshot().active);
      app.setWindowMode("windowed");
      const restored=settings.persistence.capture();restored.windowMode="windowed";settings.persistence.restore(restored);
      await waitFor("startup fullscreen test restores window dimensions",()=>app.contentSize.width===900&&app.contentSize.height===600);
      settings.actions.clearDraftBackgroundImage();
      const cleared=settings.persistence.capture();cleared.backgroundSource="systemMaterial";cleared.backgroundImagePath=null;settings.persistence.restore(cleared);
      await refreshBackground();await present(app,"windowed background after fullscreen startup");
      console.log("Fullscreen startup: full background, 25 OS hit points, real far-right settings and blank-click hide passed");
    }
    try {
      await nativeData.launchApp(`__launchpad-native-smoke-missing-${process.pid}-${Date.now()}__`);
      throw new Error("Native launch failure smoke unexpectedly succeeded");
    } catch (error) {
      if (!(error instanceof NativeLaunchError) || error.kind !== "missingLaunchInfo") throw error;
      structuredLaunchFailureObserved = true;
    }

    const backgroundBaseline=backgroundConfig();
    const cachedBackground=await nativeData.background({path:join(import.meta.dir,"branding","light.png")});
    assert.ok(cachedBackground);
    for(const effect of ["none","dimmed","blur","acrylic"] as const){
      await desktopBackground.configure({...backgroundBaseline,backgroundSource:"customImage",backgroundImagePath:cachedBackground.imagePath,
        backgroundImageOpacity:100,backgroundEffect:effect},app.contentSize.width,app.contentSize.height);
      await present(app,`native background ${effect}`);
      await captureSmokeFrame(`background-${effect}`);
    }
    await refreshBackground();
    const baselinePages=layoutState.operations.clonePages(layoutState.presentation.pages.value);
    const baselineConfig=layoutState.captureConfiguration();
    clickWithNativeInput(settingsButton);await present(app,"native settings opened");
    assert.ok(settingsShell,"settings button must open the native settings shell");
    await waitFor("settings entrance settles",()=>!scene.getMotionSnapshot().active);
    await present(app,"settings layout settled");
    await captureSmokeFrame("settings-layout");
    const aboutTab=app.stage.getChildByLabel("native-settings-tab:about",true);assert.ok(aboutTab);
    clickWithNativeInput(aboutTab);await present(app,"native about route");
    await waitFor("about entrance settles",()=>!scene.getMotionSnapshot().active);
    await captureSmokeFrame("settings-about");
    const generalTab=app.stage.getChildByLabel("native-settings-tab:general",true);assert.ok(generalTab);
    clickWithNativeInput(generalTab);await present(app,"native general settings");
    await waitFor("general entrance settles",()=>!scene.getMotionSnapshot().active);
    await captureSmokeFrame("settings-general");
    const iconSummary=app.stage.getChildByLabel("native-setting:icon-summary",true) as Text;
    const iconSummaryRow=app.stage.getChildByLabel("native-setting:icon-expand",true) as NativeFluentButton;
    assert.equal(iconSummary.anchor.x,1);assert.equal(iconSummary.x,iconSummaryRow.controlWidth-47,"summary right edge must track arrow column, not fixed text start");
    {
      const {nativeUiGallery}=await import("../rendering/native/ui/nativeUiGallery.js");
      for(const theme of ["dark","light"] as const){
        const gallery=nativeUiGallery(searchBar.host,theme,()=>app.invalidate());app.stage.addChild(gallery);
        await present(app,`UI gallery ${theme}`);await captureSmokeFrame(`native-ui-gallery-${theme}`);gallery.destroy({children:true});
      }
      await present(app,"UI gallery disposed");
    }
    const styleThemeBefore=settings.draft.settingsThemePreference.value;
    for(const theme of ["dark","light"] as const){
      settings.actions.setDraftSettingsThemePreference(theme);(settingsShell as NativeSettingsShell).redraw();await present(app,`style ${theme} ready`);
      const hoverRow=app.stage.getChildByLabel("native-setting:icon-expand",true) as NativeFluentButton;
      assert.equal(hoverRow.parent!.getChildIndex(hoverRow),0,"hover paint must be behind row icon and title");
      const p=hoverRow.toGlobal({x:Math.min(220,hoverRow.controlWidth/2),y:36});app.nativeInput.emitPointer("pointermove",p.x,p.y,0);
      await present(app,`style ${theme} hover`);await captureSmokeFrame(`settings-style-${theme}-hover`);
      clickWithNativeInput(app.stage.getChildByLabel("native-setting:language",true)!);
      await waitFor("language popup entrance",()=>!scene.getMotionSnapshot().active);await present(app,`style ${theme} popup`);
      assert.ok(management.getChildByLabel("native-menu:selected-indicator",true));await captureSmokeFrame(`settings-style-${theme}-dropdown`);
      onKey({type:"down",key:"Escape"});await present(app,"style dropdown dismissed");
    }
    settings.actions.setDraftSettingsThemePreference(styleThemeBefore);(settingsShell as NativeSettingsShell).redraw();await present(app,"style theme restored");
    const sidebar=settingsShell as NativeSettingsShell;
    const languageBefore=app.stage.getChildByLabel("native-setting:language",true)!.getBounds();
    const beforeLanguage={x:languageBefore.x,y:languageBefore.y,width:languageBefore.width,height:languageBefore.height};
    sidebar.toggleNavigation();
    const languageStart=app.stage.getChildByLabel("native-setting:language",true)!.getBounds();
    assert.ok(Math.abs(languageStart.x-beforeLanguage.x)<0.1&&Math.abs(languageStart.y-beforeLanguage.y)<0.1,"sidebar toggle must not jump right-aligned controls before the first animation frame");
    await waitFor("sidebar intermediate width",()=>sidebar.navigationWidth>72&&sidebar.navigationWidth<215);
    await captureSmokeFrame("settings-sidebar-expanding");
    const languageMid=app.stage.getChildByLabel("native-setting:language",true)!.getBounds();const midpoint={x:languageMid.x,y:languageMid.y};
    sidebar.toggleNavigation();
    const languageReverse=app.stage.getChildByLabel("native-setting:language",true)!.getBounds();
    assert.ok(Math.abs(languageReverse.x-midpoint.x)<0.1&&Math.abs(languageReverse.y-midpoint.y)<0.1,"reversing sidebar keeps current content geometry");
    await present(app,"sidebar reverse");sidebar.toggleNavigation();
    await waitFor("sidebar expanded width",()=>sidebar.navigationWidth===220&&!scene.getMotionSnapshot().active);await captureSmokeFrame("settings-sidebar-expanded");
    sidebar.toggleNavigation();await waitFor("sidebar collapsed width",()=>sidebar.navigationWidth===68&&!scene.getMotionSnapshot().active);
    const disclosureButton=app.stage.getChildByLabel("native-setting:icon-expand",true) as NativeFluentButton;
    assert.ok(disclosureButton);clickWithNativeInput(disclosureButton);
    assert.equal(disclosureButton.focused,false,"mouse selection must not paint a keyboard focus ring");
    await waitFor("icon disclosure intermediate",()=>{
      const body=app.stage.getChildByLabel("native-disclosure:general.icons",true)?.getChildByLabel("native-disclosure-content");return Boolean(body&&body.alpha>0.05&&body.alpha<0.95);
    });
    await captureSmokeFrame("settings-icons-expanding");
    clickWithNativeInput(app.stage.getChildByLabel("native-setting:icon-expand",true)!);
    await present(app,"icon disclosure closing interruption");
    clickWithNativeInput(app.stage.getChildByLabel("native-setting:icon-expand",true)!);
    await waitFor("icon disclosure reopened",()=>app.stage.getChildByLabel("native-disclosure:general.icons",true)?.getChildByLabel("native-disclosure-content")?.alpha===1&&!scene.getMotionSnapshot().active);
    await captureSmokeFrame("settings-icons-expanded");
    {const tile=app.stage.getChildByLabel(`native-setting:icon-${settings.draft.launchpadIconVariant.value}`,true) as NativeFluentButton;
      tile.hovered=true;await present(app,"icon card hover");await captureSmokeFrame("settings-icon-card-hover");tile.hovered=false;}
    clickWithNativeInput(app.stage.getChildByLabel("native-setting:icon-expand",true)!);
    await waitFor("icon disclosure collapsed",()=>app.stage.getChildByLabel("native-disclosure:general.icons",true)?.visible===false);
    const originalShortcut=settings.draft.mainWindowShortcut.value;
    const shortcutControl=app.stage.getChildByLabel("native-setting:shortcut",true);assert.ok(shortcutControl);
    clickWithNativeInput(shortcutControl);
    app.nativeInput.emitKey("down",{keyCode:0x77,modifiers:6});
    assert.equal(settings.draft.mainWindowShortcut.value,"control+alt+F8","native shortcut recording must reach the shared draft");
    const clearShortcut=app.stage.getChildByLabel("native-setting:clear-shortcut",true) as NativeFluentButton;
    assert.equal(clearShortcut.controlWidth,22);assert.equal(clearShortcut.controlHeight,22);assert.equal(clearShortcut.appearance,"subtle");
    await captureSmokeFrame("settings-shortcut-clear");
    assert.equal(recordingShortcut,false);
    settings.actions.setDraftMainWindowShortcut(originalShortcut);
    await present(app,"shortcut recording settles refreshed controls");
    const languageControl=app.stage.getChildByLabel("native-setting:language",true);assert.ok(languageControl);
    clickWithNativeInput(languageControl);await present(app,"general language menu");
    assert.ok(management.modal,"language selector must open the native menu");
    app.nativeInput.emitKey("down",{keyCode:0x1b});
    assert.ok(settingsShell,"closing the language menu must retain settings");
    await present(app,"language menu dismissed");
    const localeBefore=settings.draft.localePreference.value;
    const iconBefore=settings.draft.launchpadIconVariant.value;
    const nextLocale=localeBefore==="en-US"?"zh-CN":"en-US";
    const nextIcon=LAUNCHPAD_ICON_VARIANTS.find(value=>value!==iconBefore)!;
    const languageAgain=app.stage.getChildByLabel("native-setting:language",true)!;
    clickWithNativeInput(languageAgain);await present(app,"language menu selection");
    const localeLabel=nativeLocaleOptions.find(option=>option.value===nextLocale)!.label;
    const languageOption=management.getChildByLabel(`native-action:${localeLabel}`,true);assert.ok(languageOption);
    clickWithNativeInput(languageOption);
    assert.equal(settings.draft.localePreference.value,nextLocale);
    settings.actions.setDraftLaunchpadIconVariant(nextIcon);
    await present(app,"general changes ready");
    clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
    await waitFor("general settings persisted",()=>Boolean(settingsShell&&!settingsShell.applying));
    const savedGeneral=(await nativeData.loadLayout())!.settings;
    assert.equal(savedGeneral.localePreference,nextLocale);
    assert.equal(savedGeneral.launchpadIconVariant,nextIcon);
    await captureSmokeFrame("settings-general-applied");
    settings.actions.setDraftLocalePreference(localeBefore);settings.actions.setDraftLaunchpadIconVariant(iconBefore);
    await present(app,"general restore ready");
    clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
    await (settingsShell as NativeSettingsShell).waitForApply();
    await waitFor("general settings restored",()=>Boolean(settingsShell&&!settingsShell.applying));
    assert.equal((await nativeData.loadLayout())!.settings.localePreference,localeBefore);
    await present(app,"restored settings navigation hit targets");
    clickWithNativeInput(app.stage.getChildByLabel("native-settings-tab:apps",true)!);
    await waitFor("apps overview transition",()=>!scene.getMotionSnapshot().active);await present(app,"apps overview rendered");
    await captureSmokeFrame("settings-apps-overview");
    {
      const before=apps!.persistence.capture();
      for(const root of apps!.presentation.scanRoots.value)if(root.enabled)apps!.toggleScanRootEnabled(root.id,false);
      await present(app,"scan disabled");
      const scanButton=app.stage.getChildByLabel("native-apps:scan",true) as NativeFluentButton;assert.ok(scanButton.disabled);
      const scroll=scanButton.parent!.parent!.parent as import("../rendering/native/NativeScrollView.js").NativeScrollView;
      scroll.scrollTo(scroll.maxOffset);await present(app,"disabled scan overview");await captureSmokeFrame("settings-apps-scan-disabled");
      apps!.persistence.restore(before);await present(app,"scan sources restored");
      for(const word of ["sample","installer","uninstall","temporary application name"]){apps!.newScanKeyword.value=word;apps!.addScanKeywordBlacklistItem();}
      appsPageState.keywords=true;(settingsShell as NativeSettingsShell).redraw();
      await waitFor("keyword chips expanded",()=>!scene.getMotionSnapshot().active);
      const add=app.stage.getChildByLabel("native-apps:add-keyword",true)!;
      const scroller=app.stage.getChildByLabel("native-apps:manager",true)!.parent!.parent!.parent as import("../rendering/native/NativeScrollView.js").NativeScrollView;
      scroller.reveal(scroller.content.toLocal(add.toGlobal({x:0,y:0})).y,120);await present(app,"keyword chips");await captureSmokeFrame("settings-apps-keyword-chips");
      const keywordField=()=>app.stage.getChildByLabel("native-apps:keyword",true) as import("../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
      let field=keywordField();clickWithNativeInput(field);field.commitText("single-click-keyword");
      await present(app,"keyword draft remains live");assert.equal(keywordField(),field,"typing must retain the input and Add button");
      assert.equal(apps!.newScanKeyword.value,"single-click-keyword");
      clickWithNativeInput(app.stage.getChildByLabel("native-apps:add-keyword",true)!);
      await present(app,"single click keyword added");assert.ok(apps!.presentation.scanKeywordBlacklist.value.includes("single-click-keyword"));assert.equal(keywordField().value,"");
      field=keywordField();clickWithNativeInput(field);field.commitText("immediate-click-keyword");
      clickWithNativeInput(app.stage.getChildByLabel("native-apps:add-keyword",true)!);
      await present(app,"immediate keyword click added");assert.ok(apps!.presentation.scanKeywordBlacklist.value.includes("immediate-click-keyword"));
      field=keywordField();clickWithNativeInput(field);field.commitText("enter-keyword");
      app.nativeInput.emitKey("down",{keyCode:0x0d});app.nativeInput.emitKey("up",{keyCode:0x0d});
      await present(app,"Enter keyword added");assert.ok(apps!.presentation.scanKeywordBlacklist.value.includes("enter-keyword"));assert.equal(keywordField().value,"");
      await saves.flush();assert.ok((await nativeData.loadLayout())!.settings.scanKeywordBlacklist.includes("enter-keyword"));
      await captureSmokeFrame("settings-keyword-placeholder-fixed");
      {
        const badge=()=>app.stage.getChildByLabel("native-apps:missing-badge",true)!;
        const scroll=()=>badge().parent!.parent!.parent as import("../rendering/native/NativeScrollView.js").NativeScrollView;
        scroll().scrollTo(scroll().maxOffset);await present(app,"apps bottom toggle before click");
        const offset=scroll().offset,position=badge().getGlobalPosition().y;
        const from=(badge() as NativeFluentToggle).transitionProgress;
        clickWithNativeInput(badge());
        await waitFor("switch animation intermediate after page rebuild",()=>{const value=(badge() as NativeFluentToggle).transitionProgress;return value>0.05&&value<0.95;});
        await captureSmokeFrame("settings-switch-animation-middle");
        await present(app,"switch hit geometry after asynchronous target checks");
        clickWithNativeInput(badge());
        await waitFor("switch rapid reversal settled",()=>Math.abs((badge() as NativeFluentToggle).transitionProgress-from)<0.001&&!scene.getMotionSnapshot().active);
        assert.equal(scroll().offset,offset);
        for(let repeat=0;repeat<2;repeat++){
          clickWithNativeInput(badge());await present(app,"apps bottom toggle after click");
          assert.equal(scroll().offset,offset,"clicking the last switch must retain the bottom scroll offset");
          assert.equal(badge().getGlobalPosition().y,position,"bottom switch must stay under the pointer after redraw");
        }
        await captureSmokeFrame("settings-apps-bottom-scroll-stable");
      }
      apps!.persistence.restore(before);appsPageState.keywords=false;(settingsShell as NativeSettingsShell).redraw();
      await waitFor("keyword audit restored",()=>!scene.getMotionSnapshot().active);
      const currentScroll=app.stage.getChildByLabel("native-apps:manager",true)!.parent!.parent!.parent as import("../rendering/native/NativeScrollView.js").NativeScrollView;currentScroll.scrollTo(0);await present(app,"source inputs revealed after audit");
    }
    {
      const shell=settingsShell as NativeSettingsShell,root=apps!.presentation.scanRoots.value[0]!;
      const field=app.stage.getChildByLabel(`native-apps:source-path-${root.id}`,true)!;
      const revision=shell.redrawCount;
      clickWithNativeInput(field);await present(app,"source path focused");
      assert.equal(shell.redrawCount,revision,"focusing an unchanged source path must not rebuild settings");
      assert.equal(app.stage.getChildByLabel(`native-apps:source-path-${root.id}`,true),field,"focus must retain the input session");
      await captureSmokeFrame("settings-source-focused");
      const sourceName=app.stage.getChildByLabel(`native-apps:source-label-${root.id}`,true) as import("../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
      clickWithNativeInput(sourceName);sourceName.selectAll();sourceName.commitText(root.label+" test");
      clickWithNativeInput(field);await present(app,"source blur saved without page rebuild");await saves.flush();
      assert.equal(shell.redrawCount,revision,"saving a source label while moving focus must not rebuild the page");
      assert.equal((await nativeData.loadLayout())!.settings.scanRoots[0]?.label,root.label+" test");
      clickWithNativeInput(sourceName);sourceName.selectAll();sourceName.commitText(root.label);clickWithNativeInput(field);
      await present(app,"source label restored");await saves.flush();
    }
    for(const theme of ["dark","light"] as const){
      settings.actions.setDraftSettingsThemePreference(theme);(settingsShell as NativeSettingsShell).redraw();await present(app,`sources ${theme}`);
      await captureSmokeFrame(`settings-sources-${theme}`);
    }
    settings.actions.setDraftSettingsThemePreference(styleThemeBefore);(settingsShell as NativeSettingsShell).redraw();await present(app,"sources theme restored");
    {
      const savedSources=apps!.persistence.capture(),savedLocale=getNativeLocale();
      try{
        setNativeLocale("zh-CN");
        const roots=createDefaultScanRoots({roots:DEFAULT_SCAN_ROOTS,translate:t}).map(root=>({...root,lastScannedAt:"2026-09-08T19:05:00.000Z"}));
        apps!.persistence.restore({...savedSources,scanRoots:roots});
        for(const theme of ["dark","light"] as const){
          settings.actions.setDraftSettingsThemePreference(theme);(settingsShell as NativeSettingsShell).redraw();
          await present(app,`default sources ${theme}`);
          for(const root of roots){
            const path=app.stage.getChildByLabel(`native-apps:source-path-${root.id}`,true)!;
            const description=app.stage.getChildByLabel(`native-apps:source-description-${root.id}`,true);
            const status=app.stage.getChildByLabel(`native-apps:source-last-scan-${root.id}`,true)!;
            const previous=description??path;
            assert.ok(status.y>=previous.y+previous.height+4,"scan metadata must clear the preceding input or description");
            if(description)assert.ok(description.y>=path.y+path.height+4,"Windows source description must clear the path input");
          }
          await captureSmokeFrame(`settings-default-sources-${theme}`);
        }
      }finally{
        apps!.persistence.restore(savedSources);setNativeLocale(savedLocale);
        settings.actions.setDraftSettingsThemePreference(styleThemeBefore);(settingsShell as NativeSettingsShell).redraw();await present(app,"default source fixtures restored");
      }
    }
    const managerLink=app.stage.getChildByLabel("native-apps:manager",true) as NativeFluentButton;
    for(let index=0;index<100&&!managerLink.focused;index++)onKey({type:"down",key:"Tab"});
    assert.ok(managerLink.focused);await present(app,"apps manager link revealed");
    {const scroll=managerLink.parent!.parent!.parent as import("../rendering/native/NativeScrollView.js").NativeScrollView;scroll.scrollTo(scroll.maxOffset);await present(app,"apps overview actions");await captureSmokeFrame("settings-apps-actions");}
    clickWithNativeInput(managerLink);
    await waitFor("apps manager transition",()=>!scene.getMotionSnapshot().active);await present(app,"apps manager rendered");
    const firstManaged=apps!.filteredManagedApps.value[0]!;
    await captureSmokeFrame("virtual-manager-before-selection");
    {
      const list=app.stage.getChildByLabel("native-virtual-list",true) as import("../rendering/native/ui/NativeVirtualList.js").NativeVirtualList;
      assert.ok(list.mountedCount<apps!.managedApps.value.length,"only visible rows should be mounted");
      const last=list.controls.at(-1)!;last.focus(true);assert.ok(last.revealRect!().top>list.y);
      list.viewport(100000,450);assert.equal(list.mountedCount,1,"keyboard focused row must survive scrolling away");
      last.focus(false);
      const scroll=app.stage.getChildByLabel("native-apps:list-scroll",true) as import("../rendering/native/NativeScrollView.js").NativeScrollView;
      const toolbar=app.stage.getChildByLabel("native-apps:search",true)!,toolbarY=toolbar.getGlobalPosition().y;
      scroll.scrollTo(0);list.viewport(0,450);assert.ok(list.mountedCount<=9);
      assert.equal(toolbar.getGlobalPosition().y,toolbarY,"list scrolling must not move the toolbar");
      await present(app,"virtual scroll restored");
    }
    clickWithNativeInput(app.stage.getChildByLabel(`native-apps:select-${firstManaged.id}`,true)!);
    await waitFor("apps selection bar expands",()=>app.stage.getChildByLabel("native-disclosure:apps.selection.apps.appManager",true)?.getChildByLabel("native-disclosure-content")?.alpha===1);
    assert.deepEqual(apps!.appManagerSelectedIds.value,[firstManaged.id]);
    await captureSmokeFrame("settings-apps-selected");
    clickWithNativeInput(app.stage.getChildByLabel("native-apps:clear",true)!);
    await waitFor("apps selection cleared",()=>apps!.selectedManagedAppCount.value===0&&!scene.getMotionSnapshot().active);
    const appSettingsBefore=apps!.persistence.capture();
    apps!.newScanKeyword.value="native-settings-test";apps!.addScanKeywordBlacklistItem();
    await present(app,"apps keyword changed");await saves.flush();
    assert.ok((await nativeData.loadLayout())!.settings.scanKeywordBlacklist.includes("native-settings-test"));
    const newTargets=await nativeData.checkLaunchTargets([{id:"missing",launchTarget:{kind:"executable",path:join(process.env.LUMERIA_NATIVE_DATA_DIR!,"does-not-exist.exe")}}]);
    assert.equal(newTargets[0]?.status,"missing");
    apps!.persistence.restore(appSettingsBefore);await present(app,"apps settings restored");await saves.flush();
    clickWithNativeInput(app.stage.getChildByLabel("native-apps:add",true)!);
    await waitFor("apps editor transition",()=>management.getChildByLabel("native-form-overlay")?.alpha===1);
    assert.ok(management.modal);onKey({type:"down",key:"Escape"});
    await present(app,"apps editor cancelled");
    assert.deepEqual(layoutState.presentation.pages.value,baselinePages,"cancelled app editor cannot alter layout");
    const managerSearch=app.stage.getChildByLabel("native-apps:search",true) as import("../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
    managerSearch.focus();managerSearch.selectAll();managerSearch.commitText("No matching application");
    await waitFor("apps search filters",()=>apps!.filteredManagedApps.value.length===0);await present(app,"apps empty search");
    assert.equal(searchBar.host.focused?.value,"No matching application","live search redraw must preserve focused text");
    searchBar.host.focused!.selectAll();searchBar.host.focused!.commitText("");await waitFor("apps search restores",()=>apps!.filteredManagedApps.value.length===apps!.managedApps.value.length);
    await present(app,"apps search restored");
    assert.ok(apps!.canExcludeManagedAppFromScan(firstManaged));apps!.excludeManagedAppFromScan(firstManaged);
    await present(app,"app excluded");await saves.flush();assert.equal(apps!.managedApps.value.some(item=>item.id===firstManaged.id),false);
    settingsNavigation.openSubPage(settingsNavigation.settingsSubPages.value.appsExcludedApps!);(settingsShell as NativeSettingsShell).redraw();
    await waitFor("excluded page transition",()=>!scene.getMotionSnapshot().active);await present(app,"excluded page rendered");
    await captureSmokeFrame("settings-apps-excluded");
    clickWithNativeInput(app.stage.getChildByLabel(`native-apps:restore-${firstManaged.id}`,true)!);await present(app,"exclusion removed");await saves.flush();
    assert.equal(apps!.presentation.scanAppBlacklist.value.length,appSettingsBefore.scanAppBlacklist.length);
    await apps!.rescanManagedApps();
    await waitFor("scan result modal",()=>management.activeId==="scan-results");await present(app,"scan results rendered");
    assert.ok(apps!.scanResultModel.apps.value.some(item=>item.id===firstManaged.id));await captureSmokeFrame("settings-apps-scan-results");
    {
      const saveNormally=appDialogs!.options.save;
      appDialogs!.options.save=async()=>{throw new Error("smoke: scan save unavailable");};
      try{
        clickWithNativeInput(management.getChildByLabel("native-modal:scan-results:confirm",true)!);
        await present(app,"scan save failure retained");
        assert.equal(apps!.scanResultModel.isOpen.value,true,"scan persistence failure must retain its model and dialog");
        assert.equal(management.activeId,"scan-results");
        await captureSmokeFrame("scan-save-failure");
      }finally{appDialogs!.options.save=saveNormally;}
      clickWithNativeInput(management.getChildByLabel("native-modal:scan-results:confirm",true)!);
      await waitFor("scan selection saved after retry",()=>!management.modal);await present(app,"scan selection added");await saves.flush();
      assert.equal(apps!.managedApps.value.filter(item=>item.id===firstManaged.id).length,1,"retry must not append the scanned app twice");
    }
    assert.ok(apps!.managedApps.value.some(item=>item.id===firstManaged.id));
    apps!.persistence.restore(appSettingsBefore);commitEditedPages(baselinePages);await present(app,"apps roundtrip fixture restored");await saves.flush();
    console.log("Native apps settings: overview, multi-selection animation, persistence, target checks and editor cancellation passed");

    const appearanceTab=app.stage.getChildByLabel("native-settings-tab:interface",true);assert.ok(appearanceTab);
    clickWithNativeInput(appearanceTab);await present(app,"back to native layout settings");
    const committedTheme=settings.persistence.capture().settingsThemePreference;
    const previewTheme=settingsTheme()==="dark"?"light":"dark";
    clickWithNativeInput(app.stage.getChildByLabel(`native-setting:theme-${previewTheme}`,true)!);
    await present(app,"settings theme preview");
    assert.equal(settingsTheme(),previewTheme);
    assert.equal(settings.persistence.capture().settingsThemePreference,committedTheme,"theme preview must not commit settings");
    await captureSmokeFrame("settings-theme-preview");
    for(const theme of ["dark","light"] as const){
      settings.actions.setDraftSettingsThemePreference(theme);(settingsShell as NativeSettingsShell).redraw();await present(app,`segment ${theme}`);
      const selected=app.stage.getChildByLabel(`native-setting:theme-${theme}`,true) as NativeFluentButton;
      selected.hovered=true;await present(app,"selected segment hover");await captureSmokeFrame(`settings-segment-${theme}-selected-hover`);selected.hovered=false;
      const middle=app.stage.getChildByLabel("native-setting:theme-light",true) as NativeFluentButton;
      middle.hovered=true;await present(app,"middle segment hover");await captureSmokeFrame(`settings-segment-${theme}-middle-hover`);middle.hovered=false;
    }
    settings.actions.setDraftSettingsThemePreference(committedTheme);(settingsShell as NativeSettingsShell|null)?.redraw();
    await present(app,"settings theme restored");

    const clickWindowControl=async(label:string)=>{
      const control=app.stage.getChildByLabel(`native-window:${label}`,true);assert.ok(control instanceof NativeFluentButton);
      for(let index=0;index<160&&!control.focused;index++)onKey({type:"down",key:"Tab"});
      assert.ok(control.focused,`window settings keyboard must reach ${label}`);
      await present(app,`window ${label} revealed`);clickWithNativeInput(control);await present(app,`window ${label} selected`);
    };
    const windowBefore=app.getWindowFrame(),materialBefore=settings.presentation.windowEffectMaterial.value;
    const modeRow=app.stage.getChildByLabel("native-window:mode-expand",true) as NativeFluentButton;
    const arrowPoint=modeRow.toGlobal({x:modeRow.controlWidth-25,y:36});
    assert.equal(app.renderer.events.rootBoundary.hitTest(arrowPoint.x,arrowPoint.y),modeRow,"mode arrow must hit the whole-row expander");
    const applyWindowSettings=async()=>{
      clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
      await waitFor("window settings transaction completed",()=>Boolean(settingsShell&&!settingsShell.applying));
      await present(app,"window settings presentation settled");
    };
    const titlebarBefore=settings.presentation.showCustomTitlebar.value;
    await clickWindowControl("mode-expand");
    {
      const themeBefore=settings.draft.settingsThemePreference.value,modeBefore=settings.draft.windowMode.value;
      settings.actions.setDraftSettingsThemePreference("dark");
      for(const mode of ["windowed","fullscreen"] as const){
        settings.actions.setDraftWindowMode(mode);(settingsShell as NativeSettingsShell).redraw();
        await waitFor("window disclosure settles",()=>!scene.getMotionSnapshot().active);await present(app,`window disclosure ${mode}`);
        const detailRow=app.stage.getChildByLabel("native-window:titlebar-row",true)!;
        assert.equal(detailRow.alpha,mode==="fullscreen"?0.68:1);
        const disclosure=app.stage.getChildByLabel("native-disclosure:window.mode",true)!;
        const header=app.stage.getChildByLabel("native-window:mode-expand",true)!;
        assert.ok(Math.abs(disclosure.y-header.y-72)<0.01,"header and detail must share a seam without a row gap");
        await captureSmokeFrame(`settings-window-disclosure-${mode}`);
      }
      settings.actions.setDraftWindowMode(modeBefore);settings.actions.setDraftSettingsThemePreference(themeBefore);(settingsShell as NativeSettingsShell).redraw();await present(app,"window disclosure draft restored");
    }
    const toggleTitlebar=async()=>{
      await clickWindowControl("windowed");
      onKey({type:"down",key:"Tab"});await present(app,"titlebar toggle revealed");
      const toggle=app.stage.getChildByLabel("native-window:titlebar",true);assert.ok(toggle instanceof NativeFluentToggle);
      clickWithNativeInput(toggle);await applyWindowSettings();
    };
    if(!titlebarBefore)await toggleTitlebar();
    assert.equal(settings.presentation.showCustomTitlebar.value,true);
    assert.equal((await nativeData.loadLayout())!.settings.showCustomTitlebar,true);
    assert.ok(windowChrome.getChildByLabel("native-window-chrome:close"),"custom titlebar must expose a close action");
    await captureSmokeFrame("settings-titlebar");
    {
      const {getNativePixiApplicationTesting}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
      const handle=getNativePixiApplicationTesting(app).handles().inputWindow;
      const caption=windowChrome.getChildByLabel("native-window-chrome:close");assert.ok(caption);
      clickWithNativeInput(caption);
      await waitFor("caption X starts hiding",()=>launchFlow!.isDesktopClosing.value);
      assert.equal((await captureOwnedWindow(handle)).material,1,"closing begins by removing the Windows material");
      await waitFor("caption X hides without exiting",()=>!app.window.isVisible());
      assert.equal(app.state,"running");assert.ok(tray?.id,"X must retain the tray");
      showLaunchpad();await waitFor("caption X reopen settles",()=>app.window.isVisible()&&scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
      openSettings();await present(app,"settings reopened after X");
      await captureOwnedWindow(handle,join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"caption-system.png"));
      const beforeMaximize={...app.contentSize};
      const maximize=windowChrome.getChildByLabel("native-window-chrome:maximize");assert.ok(maximize);
      clickWithNativeInput(maximize);await waitFor("caption maximize",()=>app.window.isMaximized());await present(app,"maximized caption settled");
      await waitFor("restore caption presented and hit-testable",()=>{
        const control=windowChrome.getChildByLabel("native-window-chrome:restore");if(!control)return false;
        const point=control.toGlobal({x:21,y:22});return app.renderer.events.rootBoundary.hitTest(point.x,point.y)===control;
      });
      const restore=windowChrome.getChildByLabel("native-window-chrome:restore");assert.ok(restore);
      clickWithNativeInput(restore);await waitFor("caption restore",()=>!app.window.isMaximized()&&app.contentSize.width===beforeMaximize.width&&app.contentSize.height===beforeMaximize.height);
      await present(app,"restored caption settled");
      console.log("Caption X hides and preserves tray; close begins with DWM material disabled");
    }
    if(process.env.LAUNCHPAD_NATIVE_WINDOW_INPUT_SMOKE==="1"){
      const {getNativePixiApplicationTesting}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
      const testing=getNativePixiApplicationTesting(app),handle=testing.handles().inputWindow;
      const screenPoint=(x:number,y:number)=>testing.clientToScreen(
        Math.round(x*testing.diagnostics().window.snapshot.scaleFactor),Math.round(y*testing.diagnostics().window.snapshot.scaleFactor));
      const initial={...app.window.getFrame()},initialContent={...app.contentSize};
      const restore=async()=>{
        await waitFor("OS move/size capture released",()=>!testing.diagnostics().input.captured&&!testing.diagnostics().input.nativeCaptured);
        app.window.setSize(initial.width,initial.height);app.window.setPosition(initial.x,initial.y);
        await waitFor("window restored after OS drag",()=>{
          const frame=app.window.getFrame();return Math.abs(frame.x-initial.x)<2&&Math.abs(frame.y-initial.y)<2
            &&Math.abs(frame.width-initial.width)<2&&Math.abs(frame.height-initial.height)<2
            &&Math.abs(app.contentSize.width-initialContent.width)<1&&Math.abs(app.contentSize.height-initialContent.height)<1;
        });
        await present(app,"restored window geometry after OS drag");
      };
      const beforeDrag=app.getWindowFrame();
      testing.resetInputEvents();
      await dragOwnedNativeWindow(handle,screenPoint(100,20),{x:30,y:24});
      console.log("Native OS titlebar observation",JSON.stringify({before:beforeDrag,after:app.getWindowFrame()}));
      await waitFor("titlebar drag moves the actual HWND",()=>Math.abs(app.getWindowFrame().x-beforeDrag.x)>10);
      await restore();
      for(const direction of ["North","South","West","East","NorthWest","NorthEast","SouthWest","SouthEast"]){
        const edge=windowChrome.getChildByLabel(`native-window-resize:${direction}`);assert.ok(edge);
        const area=edge.hitArea as Rectangle;
        const point=edge.toGlobal({x:area.x+area.width/2,y:area.y+area.height/2});
        const delta={x:direction.includes("West")?18:direction.includes("East")?-18:0,
          y:direction.includes("North")?18:direction.includes("South")?-18:0};
        const before=app.getWindowFrame();
        assert.equal(app.renderer.events.rootBoundary.hitTest(point.x,point.y),edge,`${direction} resize handle must own its actual coordinates`);
        try{await dragOwnedNativeWindow(handle,screenPoint(point.x,point.y),delta);}
        catch(error){console.error("Native OS resize failure",direction,testing.diagnostics().input);throw error;}
        console.log("Native OS resize observation",direction,JSON.stringify({before,after:app.getWindowFrame(),point}));
        await waitFor(`actual ${direction} resize`,()=>{
          const frame=app.getWindowFrame();return (delta.x===0||frame.width<before.width-8)&&(delta.y===0||frame.height<before.height-8);
        });
        await restore();
      }
      console.log("Native window OS input: titlebar drag and all eight resize directions passed");
    }
    // Exercise the actual close guard while a settings transaction is in flight.
    const applyingShell=settingsShell as NativeSettingsShell;
    const applyNormally=applyingShell.options.apply;
    {
      const applyButton=app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true) as NativeFluentButton;
      const cancelButton=app.stage.getChildByLabel(`native-action:${t("common.actions.cancel")}`,true)!;
      let finish!:()=>void,calls=0;
      applyingShell.options.apply=()=>{calls++;return new Promise<void>(resolve=>{finish=resolve;});};
      try{
        clickWithNativeInput(applyButton);
        const p=applyButton.toGlobal({x:44,y:17});
        for(let click=0;click<12;click++){app.nativeInput.emitPointer("pointerdown",p.x,p.y,0);app.nativeInput.emitPointer("pointerup",p.x,p.y,0);}
        assert.equal(calls,1);assert.equal(applyButton.disabled,false);assert.equal(applyingShell.closing,false);
        app.nativeInput.emitPointer("pointerdown",p.x,p.y,0);finish();await applyingShell.waitForApply();
        app.nativeInput.emitPointer("pointerup",p.x,p.y,0);await present(app,"rapid apply across save completion");
        if(applyingShell.applying){finish();await applyingShell.waitForApply();}
        assert.equal(settingsShell,applyingShell);assert.equal(applyingShell.closing,false);
        assert.equal(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true),applyButton);
        assert.equal(app.stage.getChildByLabel(`native-action:${t("common.actions.cancel")}`,true),cancelButton);
        await captureSmokeFrame("settings-rapid-apply-stable");
        console.log("Rapid apply: duplicate save blocked, footer nodes preserved, no settings close");
      }finally{applyingShell.options.apply=applyNormally;}
    }
    let rejectPending!:(error:Error)=>void;
    applyingShell.options.apply=()=>new Promise<void>((_resolve,reject)=>{rejectPending=reject;});
    try{
      const beforeApply=applyingShell.redrawCount;
      clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
      assert.ok(applyingShell.applying);
      assert.equal(applyingShell.redrawCount,beforeApply,"pending apply must preserve the rendered controls");
      await present(app,"pending apply visual");await captureSmokeFrame("settings-apply-pending");
      quitRequested=true;
      app.window.requestClose();
      await waitFor("close waits for settings",()=>windowClosing);
      assert.equal(app.state,"running");assert.equal(app.stage.interactiveChildren,false);
      rejectPending(new Error("smoke: settings apply failure must retain the window"));
      await waitFor("failed apply restores window input",()=>!windowClosing&&!applyingShell.applying);
      assert.equal(app.state,"running");assert.equal(app.stage.interactiveChildren,true);
    }finally{applyingShell.options.apply=applyNormally;notices.closeTransientNotice();}
    await applyWindowSettings();
    console.log("Native close guard: pending settings wait, failure retention and retry passed");
    await toggleTitlebar();
    assert.equal(settings.presentation.showCustomTitlebar.value,false);
    assert.equal(windowChrome.getChildByLabel("native-window-chrome:close"),null,"titlebar off must remove its controls");
    assert.ok(windowChrome.getChildByLabel("native-window-drag"),"titlebar off must retain the drag strip");
    if(titlebarBefore)await toggleTitlebar();
    windowPanelState.mode=false;(settingsShell as NativeSettingsShell|null)?.redraw();
    await present(app,"titlebar settings restored");
    await clickWindowControl("material-expand");
    if(settings.actions.canUseWindowEffectMaterial("mica")){
      await clickWindowControl("preview-mica");
      await applyWindowSettings();
      assert.equal((await nativeData.loadLayout())!.settings.windowEffectMaterial,"mica");
    }
    await captureSmokeFrame("settings-window-material");
    for(const theme of ["dark","light"] as const){
      settings.actions.setDraftSettingsThemePreference(theme);(settingsShell as NativeSettingsShell|null)?.redraw();
      await present(app,`window settings ${theme} theme`);
      await captureSmokeFrame(`settings-window-${theme}`);
    }
    settings.actions.setDraftSettingsThemePreference(committedTheme);(settingsShell as NativeSettingsShell|null)?.redraw();
    await present(app,"window theme restored after comparison");
    await clickWindowControl("fullscreen");await applyWindowSettings();
    assert.equal(app.windowMode,"fullscreen");
    assert.equal((await nativeData.loadLayout())!.settings.windowMode,"fullscreen");
    assert.ok(app.getWindowFrame().width>=windowBefore.width);
    await captureSmokeFrame("settings-window-fullscreen");
    await clickWindowControl("windowed");settings.actions.setDraftWindowEffectMaterial(materialBefore);await applyWindowSettings();
    assert.equal(app.windowMode,"windowed");
    assert.deepEqual(app.getWindowFrame(),windowBefore,"window settings must restore the previous physical frame");
    windowPanelState.material=false;(settingsShell as NativeSettingsShell|null)?.redraw();
    await present(app,"window settings restored");

    const clickBackgroundControl=async(label:string)=>{
      const control=app.stage.getChildByLabel(`native-background:${label}`,true);
      assert.ok(control instanceof NativeFluentButton);
      for(let index=0;index<100&&!control.focused;index++)onKey({type:"down",key:"Tab"});
      assert.ok(control.focused,`keyboard must reach ${label}`);
      await present(app,`background ${label} revealed`);clickWithNativeInput(control);
      await present(app,`background ${label} selected`);
    };
    for(const command of [1,2] as const){
      const beforeColor=settings.draft.backgroundBaseColor.value;
      const response=respondToOwnedColorDialog(command);
      await clickBackgroundControl("base-color-picker");
      await response;
      await waitFor("native color picker released",()=>{
        const picker=app.stage.getChildByLabel("native-background:base-color-picker",true);
        return picker instanceof NativeFluentButton&&!picker.disabled;
      });
      assert.equal(settings.draft.backgroundBaseColor.value,beforeColor,"system color confirmation/cancel must roundtrip the requested color");
    }
    console.log("Native settings color picker: actual system confirmation and cancellation passed");
    {
      const initial=settings.draft.backgroundBaseColor.value;
      let finishColor!:(value:number|null)=>void;
      const createColorPage=()=>nativeBackgroundSettings({settings,host:searchBar.host,renderer:app.renderer,width:700,
        size:app.contentSize,theme:settingsTheme(),systemAppearance,state:{layer:false,effect:false,profile:systemAppearance,error:""},
        invalidate:()=>{},redraw:()=>{},chooseColor:()=>new Promise(resolve=>{finishColor=resolve;})});
      const accepted=createColorPage();
      (accepted.node.getChildByLabel("native-background:base-color-picker",true) as NativeFluentButton).activate();
      finishColor(0x123456);await Promise.resolve();
      assert.equal(settings.draft.backgroundBaseColor.value,"#123456","selected color must reach the shared draft");
      accepted.dispose();accepted.node.destroy({children:true});
      const cancelled=createColorPage();
      (cancelled.node.getChildByLabel("native-background:base-color-picker",true) as NativeFluentButton).activate();
      finishColor(null);await Promise.resolve();assert.equal(settings.draft.backgroundBaseColor.value,"#123456");
      cancelled.dispose();cancelled.node.destroy({children:true});
      const stale=createColorPage();
      (stale.node.getChildByLabel("native-background:base-color-picker",true) as NativeFluentButton).activate();
      stale.dispose();stale.node.destroy({children:true});
      settings.actions.setDraftBackgroundBaseColor(initial);
      finishColor(0xff0000);await Promise.resolve();
      assert.equal(settings.draft.backgroundBaseColor.value,initial,"disposed color selection must not mutate the next draft");
    }
    await clickBackgroundControl("layer-expand");
    settings.draft.backgroundImagePath.value=cachedBackground.imagePath;
    await clickBackgroundControl("source-customImage");
    await clickBackgroundControl("layout-fit");
    assert.equal(settings.draft.backgroundImageLayout.value,"fit");
    assert.equal(settings.persistence.capture().backgroundImagePath,backgroundBaseline.backgroundImagePath,"preview must not commit the image");
    await waitFor("background layer preview loaded",()=>app.stage.getChildByLabel("native-background-preview:layer",true)?.visible===true);
    await present(app,"background layer preview ready");
    await captureSmokeFrame("settings-background-layer");
    await clickBackgroundControl("effect-expand");
    await clickBackgroundControl("effect-acrylic");
    await clickBackgroundControl("appearance-light");
    await waitFor("background effect preview loaded",()=>app.stage.getChildByLabel("native-background-preview:effect",true)?.visible===true);
    await present(app,"background effect preview ready");
    await captureSmokeFrame("settings-background-effect");
    for(const theme of ["dark","light"] as const){
      settings.actions.setDraftSettingsThemePreference(theme);(settingsShell as NativeSettingsShell|null)?.redraw();
      await waitFor("theme background preview loaded",()=>app.stage.getChildByLabel("native-background-preview:effect",true)?.visible===true);
      await present(app,`background settings ${theme} theme`);
      await captureSmokeFrame(`settings-background-${theme}`);
    }
    settings.actions.setDraftSettingsThemePreference(committedTheme);(settingsShell as NativeSettingsShell|null)?.redraw();
    await present(app,"background theme restored after comparison");
    await clickBackgroundControl("profile-light");
    for(let index=0;index<4;index++)onKey({type:"down",key:"Tab"});
    await present(app,"acrylic brightness control revealed");
    onKey({type:"down",key:"End"});
    assert.equal(settings.draft.backgroundAcrylicLightParams.value.brightness,1.2,"brightness keyboard control must use the original UI range");
    onKey({type:"down",key:"Tab"});onKey({type:"down",key:"End"});
    assert.equal(settings.draft.backgroundAcrylicLightParams.value.contrast,1.25,"contrast control must reach the shared profile");
    await present(app,"acrylic parameter controls settled");await captureSmokeFrame("settings-acrylic-parameters");
    clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
    await waitFor("background applied",()=>Boolean(settingsShell&&!settingsShell.applying));
    const savedBackground=(await nativeData.loadLayout())!.settings;
    assert.equal(savedBackground.backgroundImagePath,cachedBackground.imagePath);
    assert.equal(savedBackground.backgroundImageLayout,"fit");
    assert.equal(savedBackground.backgroundEffect,"acrylic");
    assert.equal(savedBackground.backgroundAcrylicLightParams.brightness,1.2);
    assert.equal(savedBackground.backgroundAcrylicLightParams.contrast,1.25);
    settings.actions.clearDraftBackgroundImage();
    clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
    await waitFor("background cleared",()=>Boolean(settingsShell&&!settingsShell.applying));
    assert.equal((await nativeData.loadLayout())!.settings.backgroundImagePath,null);
    backgroundPanelState.layer=backgroundPanelState.effect=false;
    (settingsShell as NativeSettingsShell|null)?.redraw();await present(app,"background sections collapsed");
    // A missing image must leave the committed document and desktop usable for retry.
    {
      const before=settings.persistence.capture();
      settings.draft.backgroundImagePath.value=join(process.env.LUMERIA_NATIVE_DATA_DIR!,"missing-settings-background.png");
      settings.actions.setDraftBackgroundSource("customImage");
      await applyWindowSettings();
      assert.deepEqual(settings.persistence.capture(),before,"failed background preparation must not commit the draft");
      assert.equal((await nativeData.loadLayout())!.settings.backgroundImagePath,before.backgroundImagePath);
      assert.ok((settingsShell as NativeSettingsShell).children.length>0,"settings must remain open after background failure");
      settings.actions.clearDraftBackgroundImage();await applyWindowSettings();
    }

    const showCompact=async()=>{
      const compact=app.stage.getChildByLabel("native-setting:compact",true);assert.ok(compact instanceof NativeFluentButton);
      for(let index=0;index<160&&!compact.focused;index++)onKey({type:"down",key:"Tab"});
      assert.ok(compact.focused);await present(app,"compact control revealed");
      clickWithNativeInput(compact);await present(app,"compact confirmation visible");
      assert.ok(management.modal);
    };
    await showCompact();
    await waitFor("compact confirmation animation settled",()=>management.getChildByLabel("native-form-overlay")?.alpha===1);
    await present(app,"compact confirmation settled frame");await captureSmokeFrame("settings-compact-confirm");
    onKey({type:"down",key:"Escape"});
    assert.deepEqual(layoutState.presentation.pages.value,baselinePages,"cancelled compact must retain page boundaries");
    await waitFor("compact cancellation settled",()=>!management.modal);await present(app,"compact cancellation settled");await showCompact();
    const confirmCompact=management.getChildByLabel("native-modal:warning:confirm",true);assert.ok(confirmCompact);
    clickWithNativeInput(confirmCompact);await waitFor("compacted layout saved",()=>!management.modal);
    assert.deepEqual(layoutState.presentation.pages.value.flat().map(item=>item.id),baselinePages.flat().map(item=>item.id));
    assert.equal(layoutState.presentation.pages.value.length,Math.ceil(baselinePages.flat().length/layoutState.presentation.pageSize.value));
    assert.deepEqual((await nativeData.loadLayout())!.pages.map(page=>page.map(item=>item.id)),
      layoutState.presentation.pages.value.map(page=>page.map(item=>item.id)),"saved page boundaries and order must match the compacted layout");
    commitEditedPages(baselinePages);await saves.flush();await present(app,"compact fixture restored");
    console.log("Native settings compact: confirmation, cancellation, item order and persisted layout passed");

    const rowsControl=app.stage.getChildByLabel("native-setting:desktopRows",true);
    assert.ok(rowsControl);
    for(let index=0;index<60&&!(rowsControl as import("../rendering/native/NativeSpinButton.js").NativeSpinButton).input.focused;index++)onKey({type:"down",key:"Tab"});
    assert.ok((rowsControl as import("../rendering/native/NativeSpinButton.js").NativeSpinButton).input.focused,"Tab must reveal and focus the desktop row input");
    await present(app,"desktop row focus scroll settled");
    onKey({type:"down",key:"ArrowUp"});
    assert.equal(layoutSettings.draftRows.value,baselineConfig.rows+1,"numeric keyboard handling must reach the shared draft");
    onKey({type:"down",key:"ArrowDown"});
    const increase=rowsControl.getChildByLabel("native-action:+",true);assert.ok(increase);
    clickWithNativeInput(increase);
    assert.equal(layoutSettings.draftRows.value,baselineConfig.rows+1);
    assert.equal(layoutState.captureConfiguration().rows,baselineConfig.rows,"draft edits must not change desktop configuration");
    onKey({type:"down",key:"Escape"});
    await waitFor("settings close animation complete",()=>settingsShell===null);
    assert.equal(layoutState.captureConfiguration().rows,baselineConfig.rows,"Cancel must retain the committed configuration");
    await present(app,"settings close restores entry hit target");
    {
      let noticeActions=0;
      notices.showTransientNotice({title:"Temporary",message:"Replaced notice",durationMs:60});
      notices.showTransientNotice({title:"Layout could not be saved",message:"Your changes are kept in this session. Retry saving when the destination is available.",detail:"Smoke fixture: a deliberately unavailable destination.",intent:"error",actionText:"Retry",onAction:()=>{noticeActions++;}});
      await new Promise<void>(resolve=>setTimeout(resolve,90));await present(app,"persistent notice replaces timer");
      assert.equal(noticeView.visible,true,"replacing a timed notice must cancel its previous timer");
      await captureSmokeFrame("notice-error-action");
      clickWithNativeInput(noticeView.getChildByLabel("native-notice:action",true)!);assert.equal(noticeActions,1);
      searchBar.input.blur();onKey({type:"down",key:"Tab"});assert.equal(noticeView.hasFocus,true);
      onKey({type:"down",key:"Enter"});assert.equal(noticeActions,2,"notice action must be reachable from desktop keyboard navigation");
      onKey({type:"down",key:"Tab"});onKey({type:"down",key:"Tab"});assert.equal(noticeView.hasFocus,false,"notification keyboard navigation must return to the desktop");searchBar.input.blur();
      clickWithNativeInput(noticeView.getChildByLabel("native-notice:close",true)!);await present(app,"notice dismissed");assert.equal(noticeView.visible,false);
      notices.showTransientNotice({title:"Saved",message:"The latest layout is saved.",intent:"success",durationMs:60});
      await waitFor("notice expires",()=>!noticeView.visible);
      await present(app,"notice expiry restores desktop hit targets");
      assert.equal(launchFlow!.isDesktopOpen.value,true,"notice clicks must not enter the desktop blank-click dismissal gesture");
      await captureSmokeFrame("notice-expired-desktop");await present(app,"notice desktop presented");
    }
    clickWithNativeInput(settingsButton);await present(app,"settings reopened");
    const reopenedRows=app.stage.getChildByLabel("native-setting:desktopRows",true);assert.ok(reopenedRows);
    for(let index=0;index<60&&!(reopenedRows as import("../rendering/native/NativeSpinButton.js").NativeSpinButton).input.focused;index++)onKey({type:"down",key:"Tab"});
    await present(app,"reopened desktop row revealed");
    clickWithNativeInput(reopenedRows.getChildByLabel("native-action:+",true)!);
    const applyButton=app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true);assert.ok(applyButton);
    clickWithNativeInput(applyButton);
    await waitFor("settings applied and persisted",()=>Boolean(settingsShell&&!settingsShell.applying));
    assert.equal(layoutState.captureConfiguration().rows,baselineConfig.rows+1);
    assert.equal((await nativeData.loadLayout())?.settings.gridRows,baselineConfig.rows+1);
    for(let index=0;index<12;index++)onKey({type:"down",key:"Tab"});
    await present(app,"settings keyboard scrolled content");
    await captureSmokeFrame("settings-layout-keyboard");
    onKey({type:"down",key:"Escape"});
    layoutState.applyConfiguration(baselineConfig);layoutSettings.syncDraftsFromCommitted();
    currentFrame=Object.freeze({...currentFrame,viewport:Object.freeze({...currentFrame.viewport,gridRows:baselineConfig.rows,gridCols:baselineConfig.cols,iconSize:baselineConfig.iconSize})});
    commitEditedPages(baselinePages);await saves.flush();
    await waitFor("settings restored layout settled",()=>!scene.getMotionSnapshot().active);
    await present(app,"settings restoration complete");
    const customSource=baselinePages.flat().find(item=>item.id==="native-layout-icon")?.customIconPath;
    assert.equal(typeof customSource,"string","runNativeElectrobun smoke fixture must provide its generated icon");
    const normalizedIcon=await normalizeNativeCustomIcon(customSource as string);
    const cachedIcon=await nativeData.cacheCustomIcon(normalizedIcon);
    assert.ok(existsSync(cachedIcon.iconPath),"normalized icon must be cached by the real Rust host");
    assert.equal(cachedIcon.iconDataUrl,normalizedIcon);
    assert.deepEqual(await nativeData.loadIconChoices(""),[],"empty target has no embedded icon choices");
    {
      const editor=apps!.editorModel,chooser=apps!.iconChooserModel;
      const loadNormally=nativeData.loadIconChoices,saveNormally=appDialogs!.options.save,pickNormally=appDialogs!.options.pickIcon;
      const candidates=Array.from({length:121},(_,index)=>({id:`fixture-${index}`,...cachedIcon}));
      nativeData.loadIconChoices=async()=>candidates;
      try{
        editor.actions.openCreate();appDialogs!.sync();await present(app,"new app editor rendered");
        const editField=(id:string,value:string)=>{
          const input=management.getChildByLabel(`native-editor:${id}`,true) as import("../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
          assert.ok(input);clickWithNativeInput(input);input.selectAll();input.commitText(value);
        };
        editField("name","Native dialog fixture");editField("target","C:\\Windows\\System32\\notepad.exe");
        await present(app,"editor executable args appear");assert.ok(management.getChildByLabel("native-editor:args",true));
        editField("args","--fixture");await present(app,"editor live draft");assert.equal(editor.args.value,"--fixture");
        await captureSmokeFrame("editor-reference-match");
        nativeData.loadIconChoices=async()=>{throw new Error("Embedded icon fixture could not be read.");};
        clickWithNativeInput(management.getChildByLabel("native-dialog:editor-icon",true)!);
        await waitFor("embedded icon load failure",()=>Boolean(chooser.error.value)&&management.activeId==="icon-chooser");await present(app,"embedded icon error visible");
        assert.ok(management.getChildByLabel("native-dialog:icon-upload",true),"local image selection remains available after embedded icon failure");
        await captureSmokeFrame("icon-candidate-load-error");onKey({type:"down",key:"Escape"});await present(app,"failed chooser closed");
        nativeData.loadIconChoices=async()=>candidates;
        clickWithNativeInput(management.getChildByLabel("native-dialog:editor-icon",true)!);
        await waitFor("embedded icon candidates loaded",()=>management.activeId==="icon-chooser"&&chooser.choices.value.length===candidates.length);await present(app,"candidate grid visible");
        const list=management.getChildByLabel("native-virtual-list",true) as import("../rendering/native/ui/NativeVirtualList.js").NativeVirtualList;
        assert.ok(list.mountedCount<list.count,"candidate grid must virtualize offscreen rows");
        await captureSmokeFrame("icon-candidate-grid");await present(app,"candidate selection hit target");
        clickWithNativeInput(management.getChildByLabel("native-dialog:icon-choice-0",true)!);
        await waitFor("candidate returns to editor",()=>management.activeId==="editor");await present(app,"selected editor icon");
        assert.equal(editor.iconDataUrl.value,cachedIcon.iconDataUrl);
        // A delayed upload result belongs to the chooser session that initiated it.
        let finishUpload!:(value:typeof cachedIcon|null)=>void;
        appDialogs!.options.pickIcon=()=>new Promise(resolve=>{finishUpload=resolve;});
        clickWithNativeInput(management.getChildByLabel("native-dialog:editor-icon",true)!);
        await waitFor("upload chooser",()=>management.activeId==="icon-chooser"&&chooser.choices.value.length===candidates.length);await present(app,"upload action visible");
        const upload=management.getChildByLabel("native-dialog:icon-upload",true)!;
        // The upload control follows the virtualized candidates and must be revealed by keyboard.
        for(let index=0;index<150&&!(upload as NativeFluentButton).focused;index++)onKey({type:"down",key:"Tab"});
        assert.equal((upload as NativeFluentButton).focused,true);await present(app,"upload action revealed");clickWithNativeInput(upload);
        onKey({type:"down",key:"Escape"});await present(app,"upload chooser cancelled");
        editor.actions.resetIcon();finishUpload(cachedIcon);await present(app,"stale upload ignored");assert.equal(editor.iconDataUrl.value,null);
        nativeData.loadIconChoices=async()=>[];
        clickWithNativeInput(management.getChildByLabel("native-dialog:editor-icon",true)!);
        await waitFor("empty icon chooser ready",()=>management.activeId==="icon-chooser"&&!chooser.isLoading.value);await present(app,"empty icon chooser");
        await captureSmokeFrame("icon-chooser-empty-reference-match");onKey({type:"down",key:"Escape"});await present(app,"empty chooser cancelled");
        assert.equal(editor.name.value,"Native dialog fixture","chooser cancellation preserves the editor draft");
        appDialogs!.options.save=async()=>{throw new Error("smoke: editor save unavailable. ".repeat(24));};
        const countBefore=apps!.managedApps.value.length;
        clickWithNativeInput(management.getChildByLabel("native-modal:editor:confirm",true)!);await present(app,"editor save failed");
        assert.equal(management.activeId,"editor");assert.equal(editor.name.value,"Native dialog fixture");assert.equal(apps!.managedApps.value.length,countBefore+1);
        await captureSmokeFrame("editor-save-failure");
        const editorWindow={...app.window.getFrame()};
        try{
          app.window.setSize(480,420);
          await waitFor("narrow editor resized",()=>app.contentSize.width<=480&&app.contentSize.height<=420);
          await present(app,"narrow editor with long error");
          const confirm=management.getChildByLabel("native-modal:editor:confirm",true)!;
          const cancel=management.getChildByLabel("native-modal:editor:cancel",true)!;
          for(const button of [confirm,cancel]){const bounds=button.getBounds();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=app.contentSize.width&&bounds.y+bounds.height<=app.contentSize.height,"error details must not displace footer controls outside a narrow viewport");}
          await captureSmokeFrame("editor-narrow-long-error");
        }finally{
          app.window.setSize(editorWindow.width,editorWindow.height);
          await waitFor("editor window restored",()=>app.contentSize.width>480);
          await present(app,"editor retry hit target");
        }
        appDialogs!.options.save=saveNormally;clickWithNativeInput(management.getChildByLabel("native-modal:editor:confirm",true)!);
        await waitFor("editor retry saved",()=>!management.modal);
        assert.equal(apps!.managedApps.value.length,countBefore+1,"retrying a newly created app must preserve its original id");
        const savedFixture=apps!.managedApps.value.find(item=>item.name==="Native dialog fixture")!;
        assert.equal((await nativeData.loadLayout())!.pages.flat().filter(item=>item.id===savedFixture.id).length,1);
      }finally{
        nativeData.loadIconChoices=loadNormally;appDialogs!.options.save=saveNormally;appDialogs!.options.pickIcon=pickNormally;
        while(management.modal)management.close(true);commitEditedPages(baselinePages);await saves.flush();await present(app,"editor fixture restored");
      }
    }
    clickWithNativeInput(searchBar);
    assert.equal(searchBar.input.focused,true,"pointer click on search chrome must focus without exiting");
    searchBar.input.blur();
    await present(app,"search blurred before child hit");
    clickWithNativeInput(searchBar.input);
    assert.equal(searchBar.input.focused,true,"pointer click on search editor must not start a desktop gesture");
    searchBar.input.beginComposition();searchBar.input.updateComposition("\u5df2\u52a0\u8f7d",3);
    assert.equal(searchQuery,"","IME preedit must not submit a search");
    searchBar.input.commitText("\u5df2\u52a0\u8f7d");
    assert.equal(activePageItems.length,1,"Chinese search should use shared matching");
    assert.equal(activePageItems[0]?.id,"native-layout-icon");
    await new Promise<void>(resolve=>setTimeout(resolve,250));await present(app,"native search results");await captureSmokeFrame("search-chinese");
    searchBar.setQuery("yijiazai");
    assert.equal(activePageItems[0]?.id,"native-layout-icon","pinyin search should match the original algorithm");
    searchBar.setQuery("no-such-app-xyz");assert.equal(activePageItems.length,0);
    await present(app,"search clear hit target");
    const searchClear=app.stage.getChildByLabel("native-search-clear",true);assert.ok(searchClear);
    clickWithNativeInput(searchClear);
    assert.equal(searchQuery,"","clear child pointer must clear the query");
    assert.equal(searchBar.input.focused,true,"clear child pointer must retain input focus");
    searchBar.input.blur();await present(app,"search cleared");
    await waitFor("search clear restores desktop icon positions",()=>!scene.getMotionSnapshot().active);
    await present(app,"desktop icon hit areas after search reset");
    const firstApp=app.stage.getChildByLabel("launchpad-item:native-layout-icon",true);assert.ok(firstApp);
    clickWithNativeInput(firstApp,2);await present(app,"native context menu hit targets");
    assert.equal(management.modal,true);
    assert.ok(management.getChildByLabel(`native-action:${t("common.actions.open")}`,true));
    await captureSmokeFrame("context-menu-app");management.close();
    {
      let activated="",returned=0;
      const restore=management.captureReturnFocus;management.captureReturnFocus=()=>()=>{returned++;};
      management.menu(app.contentSize.width,app.contentSize.height,[{label:"Unavailable",disabled:true,run:()=>{activated="disabled";}},{label:"First enabled",run:()=>{activated="first";}},{label:"Last enabled",run:()=>{activated="last";}}]);
      await present(app,"menu bottom right clamped");
      for(const label of ["Unavailable","First enabled","Last enabled"]){const button=management.getChildByLabel(`native-action:${label}`,true)!;const b=button.getBounds();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=app.contentSize.width&&b.y+b.height<=app.contentSize.height);}
      onKey({type:"down",key:"Home"});onKey({type:"down",key:"Enter"});assert.equal(activated,"first");assert.equal(returned,1);
      management.menu(1,1,[{label:"Unavailable",disabled:true,run:()=>{activated="disabled";}},{label:"Last enabled",run:()=>{activated="last";}}]);
      onKey({type:"down",key:"End"});onKey({type:"down",key:"Enter"});assert.equal(activated,"last");assert.equal(returned,2);
      management.captureReturnFocus=restore;
      contextMenu(null,app.contentSize.width-1,app.contentSize.height-1);await present(app,"menu before relocation");
      app.nativeInput.emitPointer("pointerdown",40,200,2,0);app.nativeInput.emitPointer("pointerup",40,200,2,0);
      await present(app,"outside right click relocates menu");assert.equal(management.modal,true);
      await captureSmokeFrame("context-menu-relocated");
      management.resize();assert.equal(management.modal,false,"viewport changes must dismiss stale menu geometry");
    }
    contextMenu(null,880,570);await present(app,"surface context menu");await captureSmokeFrame("context-menu-surface");
    const batchAction=management.getChildByLabel(`native-action:${t("launchpad.contextMenu.batchManage")}`,true);assert.ok(batchAction);
    clickWithNativeInput(batchAction);await present(app,"native selection from context menu");
    assert.equal(editing!.selection.isActive.value,true);
    clickWithNativeInput(firstApp);assert.deepEqual([...editing!.selection.selectedIds.value],["native-layout-icon"]);
    const thirdApp=app.stage.getChildByLabel("launchpad-item:native-settings",true);assert.ok(thirdApp);
    clickWithNativeInput(thirdApp,0,1);
    assert.deepEqual([...editing!.selection.selectedIds.value],["native-layout-icon","native-webgpu","native-settings"],"Shift pointer range must include the intermediate app");
    await waitFor("selected pointer range settles",()=>!scene.getMotionSnapshot().active);
    await present(app,"selected pointer range committed");
    const selectionBeforeCancel=[...editing!.selection.selectedIds.value];
    {
      const {runNativeToolbarVisualSmoke}=await import("../rendering/native/nativeToolbarVisualSmoke.test.js");
      const proof=await runNativeToolbarVisualSmoke(app,()=>present(app,"toolbar visual parity"),captureSmokeFrame);
      console.log("Native toolbar backdrop GPU proof",proof);
    }
    const sourceBounds=firstApp.getBounds(), sx=sourceBounds.x+sourceBounds.width/2,sy=sourceBounds.y+sourceBounds.height/2;
    assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(sx,sy)).kind,"icon","group drag must start on an icon");
    app.nativeInput.emitPointer("pointerdown",sx,sy,0,0);
    await new Promise<void>(resolve=>setTimeout(resolve,450));
    app.nativeInput.emitPointer("pointermove",sx+30,sy+30,0,0);
    await present(app,"selected group drag started");
    assert.ok(editing!.drag.isDragActive());
    app.nativeInput.emitPointer("pointermove",app.contentSize.width/2,30+chromeInset(),0,0);
    await present(app,"selected group over cancel zone");
    assert.equal(editing!.drag.groupDragState.value?.cancelArmed,true);
    assert.ok(selectionToolbar.summaryText.includes(t("launchpad.batch.releaseToCancel")));
    await captureSmokeFrame("selection-cancel-zone");
    app.nativeInput.emitPointer("pointerup",app.contentSize.width/2,30+chromeInset(),0,0);
    await waitFor("selected group cancelled return",()=>!editing!.drag.isDragActive());
    assert.deepEqual(layoutState.presentation.pages.value,baselinePages,"cancel-zone drop must preserve layout");
    assert.deepEqual([...editing!.selection.selectedIds.value],selectionBeforeCancel,"cancel-zone drop must preserve selection");
    onKey({type:"down",key:"Alt"});await new Promise<void>(resolve=>setTimeout(resolve,550));
    assert.equal(editing!.mode.value,false,"Alt must remain blocked in selection mode");
    onKey({type:"up",key:"Alt"});
    onKey({type:"down",key:"q"});
    onKey({type:"down",key:"Enter"});
    assert.equal(searchQuery,"","selection mode must suppress printable search");
    assert.equal(management.modal,false,"selection Enter must not launch or edit");
    const secondDot=app.stage.getChildByLabel("native-page-dot:1",true);assert.ok(secondDot);
    clickWithNativeInput(secondDot);await present(app,"selection hidden on second page");
    assert.ok(selectionToolbar.summaryText.includes(t("launchpad.batch.hiddenCount",{count:3})));
    await captureSmokeFrame("selection-hidden-count");
    onKey({type:"down",key:"Escape"});await present(app,"selection escaped");
    assert.equal(editing!.selection.isActive.value,false);
    const homeDot=app.stage.getChildByLabel("native-page-dot:0",true);assert.ok(homeDot);
    clickWithNativeInput(homeDot);
    await waitFor("selection test page restoration",()=>Math.abs(scene.getMotionSnapshot().desktopPageTrackX)<0.05);
    await present(app,"selection page restored");
    onKey({type:"down",key:"Alt"});
    assert.equal(editing!.mode.value,false,"Alt must not enter edit immediately");
    await new Promise<void>(resolve=>setTimeout(resolve,550));
    assert.equal(editing!.mode.value,true,"holding Alt must enter shared edit mode");
    onKey({type:"up",key:"Alt"});
    assert.equal(editing!.mode.value,false,"Alt release must exit edit mode");
    const pointer=(type:string,x:number,y:number,id=17)=>app.nativeInput.emitPointer(type,x,y,0,0,undefined,{pointerId:id,pointerType:"touch",isPrimary:id===17});
    pointer("pointerdown",app.contentSize.width-30,app.contentSize.height/2);
    pointer("pointermove",app.contentSize.width/2,app.contentSize.height/2);
    pointer("pointerdown",20,100,18);pointer("pointerup",20,100,18);
    pointer("pointerup",app.contentSize.width/2,app.contentSize.height/2);
    await waitFor("touch page commit",()=>currentFrame.viewport.activePageIndex===1);
    onDesktopPageIndexCommit(0);await present(app,"touch reset");
    await waitFor("touch reset settle",()=>Math.abs(scene.getMotionSnapshot().desktopPageTrackX)<0.05);
    pointer("pointerdown",app.contentSize.width-30,app.contentSize.height/2);
    pointer("pointermove",app.contentSize.width/2,app.contentSize.height/2);
    pointer("pointercancel",app.contentSize.width/2,app.contentSize.height/2);
    await present(app,"touch cancellation committed");
    await waitFor("touch cancelled return",()=>Math.abs(scene.getMotionSnapshot().desktopPageTrackX)<0.05);
    await present(app,"touch cancellation settled hit testing");
    assert.equal(currentFrame.viewport.activePageIndex,0);
    const dragNode=app.stage.getChildByLabel("launchpad-item:native-settings",true);assert.ok(dragNode);
    const start=dragNode.getBounds();
    assert.ok(start.x >= 0 && start.x+start.width <= app.contentSize.width,"drag source must be on screen");
    assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(start.x+start.width/2,start.y+start.height/2)).kind,"icon","mouse drag source must remain hit-testable after touch cancellation");
    app.nativeInput.emitPointer("pointermove",start.x+start.width/2,start.y+start.height/2,0);
    app.nativeInput.emitPointer("pointerdown",start.x+start.width/2,start.y+start.height/2,0);
    await new Promise<void>(resolve=>setTimeout(resolve,450));
    app.nativeInput.emitPointer("pointermove",start.x+start.width/2+35,start.y+start.height/2+30,0);
    await present(app,"native drag preview");
    assert.ok(editing?.drag.isDragActive(),"native mouse movement must enter shared drag");
    editing!.drag.cancelDrag({userInitiatedCancel:true});
    app.nativeInput.emitPointer("pointerup",start.x+start.width/2+35,start.y+start.height/2+30,0);
    await waitFor("drag cancellation release",()=>!editing!.drag.isDragActive());
    await waitFor("cancelled drag geometry settles",()=>!scene.getMotionSnapshot().active);
    await present(app,"drag source restored");
    const moveNode=app.stage.getChildByLabel("launchpad-item:native-settings",true);assert.ok(moveNode);
    const moveBounds=moveNode.getBounds();const mx=moveBounds.x+moveBounds.width/2,my=moveBounds.y+moveBounds.height/2;
    assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(mx,my)).kind,"icon","reorder source must be hit-testable after the return animation");
    app.nativeInput.emitPointer("pointerdown",mx,my,0);await new Promise<void>(resolve=>setTimeout(resolve,450));
    app.nativeInput.emitPointer("pointermove",mx+30,my+25,0);await present(app,"drag start for committed reorder");
    assert.ok(editing!.drag.isDragActive(),"the second mouse gesture must start a new drag after cancellation");
    app.nativeInput.emitPointer("pointermove",app.contentSize.width-100,my+80,0);await present(app,"drag reorder destination");
    app.nativeInput.emitPointer("pointerup",app.contentSize.width-100,my+80,0);
    await waitFor("committed drag release",()=>!editing!.drag.isDragActive());await saves.flush();
    assert.notDeepEqual(layoutState.presentation.pages.value,baselinePages,"a drop into an empty desktop slot must change layout");
    editing!.commit(baselinePages);await saves.flush();await present(app,"baseline restored after reorder");
    {
      const {runNativeDragVisualSmoke}=await import("../rendering/native/nativeDragVisualSmoke.test.js");
      const proof=await runNativeDragVisualSmoke({app,scene,editing:editing!,folder:folderFlow,
        pages:()=>layoutState.presentation.pages.value,clone:layoutState.operations.clonePages,
        present:reason=>present(app,reason),capture:captureSmokeFrame});
      writeFileSync(join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"drag-visual-parity.json"),JSON.stringify(proof,null,2));
      console.log(`Native drag visual parity: ${proof.samples.length} presented white-frame samples across ${proof.hoverReentries} reentries passed`);
    }
    editing!.rename("native-layout-icon","Save roundtrip");await saves.flush();
    const persisted=await nativeData.loadLayout();assert.ok(persisted);
    assert.equal(makeNativeStartupFrame(persisted,catalogResult.apps).viewport.activePages[0]?.[0]?.name,"Save roundtrip");
    editing!.commit(baselinePages);await saves.flush();
    await present(app,"restored isolated layout");
    editing!.selection.begin({initialIds:["native-layout-icon","native-webgpu"],primaryId:"native-layout-icon"});
    await present(app,"selected applications");
    assert.equal(editing!.createFolder(),true,"multi-select folder creation must start the original group transfer");
    await waitFor("group folder creation release",()=>!editing!.drag.isDragActive());
    await saves.flush();
    const created=layoutState.presentation.pages.value.flat().find(item=>item.type==="folder" && item.id!=="native-folder" && item.id!=="native-folder-other");
    assert.ok(created?.type==="folder" && created.childPages.flat().some(item=>item?.id==="native-layout-icon"));
    await captureSmokeFrame("edited-folder-created");
    const freshHost=new NativeDataHost();
    try {await freshHost.connect();const saved=await freshHost.loadLayout();assert.ok(saved);assert.ok(saved.pages.flat().some(item=>item.id===created.id),"a restarted Rust host must read committed folder creation");}
    finally {await freshHost.dispose();}
    editing!.commit(baselinePages);await saves.flush();await present(app,"baseline restored after editing");
    editItem(activePageItems.find(item=>item.id==="native-settings")??null);
    await new Promise<void>(resolve=>setTimeout(resolve,200));await present(app,"native application edit form");await captureSmokeFrame("application-edit-dialog");
    const initialField=management.getChildByLabel("native-editor:name",true) as import("../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;assert.ok(initialField);clickWithNativeInput(initialField);
    management.form(t("dialogs.appEditor.changeIcon"),[],t("common.actions.cancel"),()=>{});
    assert.equal(management.modal,true,"nested form must retain the parent editing session");
    onKey({type:"down",key:"Escape"});
    assert.equal(searchBar.host.focused,initialField,"closing nested form must restore the parent field focus");
    assert.equal(management.modal,true,"closing nested form must not close its parent");
    clickWithNativeInput(management.getChildByLabel("native-modal:editor:cancel",true)!);
    assert.equal(management.modal,false,"Space on the focused Cancel button must close the dialog");
    await present(app,"edit dialog cancelled");
    editItem(activePageItems.find(item=>item.id==="native-settings")??null);
    await present(app,"reopened application editor hit targets");
    clickWithNativeInput(management.getChildByLabel("native-modal:editor:confirm",true)!);
    onKey({type:"down",key:"Escape"});
    assert.equal(management.modal,true,"Escape cannot destroy an in-flight form submission");
    await waitFor("Enter submits native edit form",()=>!management.modal);
    console.log("Native search/IME/touch/drag cancellation/save roundtrip smoke passed");

    await captureSmokeFrame("desktop-page-1");
    const lastDot = app.stage.getChildByLabel(`native-page-dot:${currentFrame.viewport.activePages.length - 1}`, true);
    assert.ok(lastDot, "desktop pages must expose clickable dots");
    clickWithNativeInput(lastDot);
    assert.equal(currentFrame.viewport.activePageIndex, currentFrame.viewport.activePages.length - 1, "page dot click must commit its exact page");
    const firstDot = app.stage.getChildByLabel("native-page-dot:0", true);
    assert.ok(firstDot);
    clickWithNativeInput(firstDot);
    const settleDesktop = async (): Promise<void> => {
      await waitFor("desktop input motion to settle", () => {
        const motion = scene.getMotionSnapshot();
        return Math.abs(motion.desktopPageTrackX - motion.desktopPageTrackTargetX) < 0.05;
      });
      await present(app, "settled desktop input");
    };
    const currentFocus = (): SceneFocusedIcon | null => currentFrame.interaction.focusedIcon;
    assert.equal(currentFocus(), null, "startup must have no keyboard focus");
    onKey({ type: "down", key: " " });
    onKey({ type: "down", key: "PageDown" });
    assert.equal(currentFocus(), null, "Space must not activate or focus an icon");
    assert.equal(currentFrame.viewport.activePageIndex, 0, "PageDown is not the original page shortcut");
    onKey({ type: "down", key: "Enter" });
    assert.equal(currentFocus()?.id, activePageItems[0]?.id, "first Enter should only establish focus");
    onKey({ type: "down", key: "ArrowRight" });
    assert.equal(currentFocus()?.id, activePageItems[1]?.id, "plain arrows should navigate icons");
    assert.equal(currentFrame.viewport.activePageIndex, 0, "plain arrows must not turn pages");
    onKey({ type: "down", key: "ArrowRight", ctrlKey: true });
    onKey({ type: "down", key: "ArrowRight", ctrlKey: true, repeat: true });
    assert.equal(currentFrame.viewport.activePageIndex, 2, "two keyboard page commits must work before any animation frame");
    assert.equal(currentFocus()?.id, activePageItems[0]?.id, "keyboard paging should focus the new page's first icon");
    assert.ok(app.stage.getChildByLabel("launchpad-item:native-layout-icon", true), "interrupted turns must retain the still-presented source page");
    await settleDesktop();
    onKey({ type: "down", key: "ArrowLeft", ctrlKey: true });
    onKey({ type: "down", key: "ArrowLeft", ctrlKey: true });
    await settleDesktop();
    setFocusedIcon(null);

    // Inject at the same Pixi event boundary consumed by native wheel input.
    // This verifies application integration; physical touchpad fidelity needs hardware acceptance.
    let wheelTime = performance.now();
    {
      assert.equal(app.supportsTouchpadGestures,true,"Direct Manipulation must initialize on the actual GPU HWND");
      let sequence=1000,time=performance.now();
      const emit=(phase:"begin"|"update"|"inertia"|"end"|"cancel",dx=0,dy=0)=>{
        time+=16;app.nativeInput.emitWheel(400,250,dx,dy,0,0,time,{source:"touchpad",phase,sequence});
      };
      emit("begin");emit("update",120);emit("update",160);await present(app,"touchpad direct scrub");
      assert.equal(currentFrame.viewport.activePageIndex,0,"touchpad update does not commit a discrete notch");
      emit("inertia");assert.equal(currentFrame.viewport.activePageIndex,1);
      for(let i=0;i<40;i++)emit("inertia",100);
      assert.equal(currentFrame.viewport.activePageIndex,1,"inertia tail cannot repeat a page");emit("end");await settleDesktop();
      sequence++;emit("begin");emit("update",100);openSettings();await present(app,"touchpad modal route change");emit("inertia",100);
      assert.equal(currentFrame.viewport.activePageIndex,1,"old desktop gesture cannot continue after opening settings");emit("end");closeSettings();await waitFor("touchpad settings close",()=>!settingsShell);await settleDesktop();
      commitDesktopPage(0);await settleDesktop();
      const {NativeScrollView}=await import("../rendering/native/NativeScrollView.js");
      for(const speed of [6,4] as const){
        setPageSwipeSpeed(speed);
        try{
          sequence++;emit("begin");emit("update",600);emit("update",600);emit("inertia");
          assert.equal(currentFrame.viewport.activePageIndex,1);
          const span=scene.getPageWidth("desktop",0,app.contentSize.width);
          await waitFor("limited swipe visible intermediate frame",()=>{const x=scene.getMotionSnapshot().desktopPageTrackX;return x < -span*.02&&x > -span*.9;});
          await present(app,"speed-limited page visible");await captureSmokeFrame(`swipe-speed-${speed}-middle`);
          emit("end");await settleDesktop();
          const settled=scene.getMotionSnapshot();
          assert.ok(settled.desktopPageTrackTargetX<0&&Math.abs(settled.desktopPageTrackX-settled.desktopPageTrackTargetX)<1,"limited swipe reaches the rendered page target, including the page gap");
        }finally{setPageSwipeSpeed(DEFAULT_PAGE_SWIPE_SPEED);interruptWheel({timeStamp:time+1});commitDesktopPage(0);await settleDesktop();}
      }
      const scrollProbe=new NativeScrollView(()=>app.invalidate());scrollProbe.position.set(430,170);scrollProbe.resize(240,160,800);
      scrollProbe.content.addChild(new Graphics({eventMode:"none"}).rect(0,0,240,800).fill(0x334455));app.stage.addChild(scrollProbe);
      try{
        await present(app,"touchpad list scroll probe");sequence++;
        const listWheel=(phase:"begin"|"update"|"inertia"|"end",dy=0)=>{time+=16;app.nativeInput.emitWheel(480,220,0,dy,0,0,time,{source:"touchpad",phase,sequence});};
        listWheel("begin");listWheel("update",28);listWheel("inertia",40);listWheel("end");
        assert.equal(scrollProbe.offset,68,"list consumes active and OS inertia pixels once, without an extra inertia driver");
        assert.equal(currentFrame.viewport.activePageIndex,0,"list wheel must not reach desktop paging");
      }finally{scrollProbe.destroy();await present(app,"touchpad list probe cleanup");}
      console.log("Touchpad Pixi integration: explicit phases, one-page inertia drain and modal route cancellation passed");
    }
    const wheel = (deltaY: number, elapsedMs = 16): void => {
      const event = new FederatedWheelEvent(app.renderer.events.rootBoundary);
      event.deltaY = deltaY;
      event.deltaMode = 0;
      event.timeStamp = wheelTime += elapsedMs;
      app.stage.emit("wheel", event);
    };
    wheel(100);
    assert.equal(currentFrame.viewport.activePageIndex, 1, "one discrete wheel step should commit immediately");
    wheel(100);
    assert.equal(currentFrame.viewport.activePageIndex, 1, "a discrete burst should not turn twice immediately");
    wheel(100, 320);
    assert.equal(currentFrame.viewport.activePageIndex, 2, "accepted repeat input must not wait for the previous spring");
    assert.equal(currentFocus(), null, "wheel paging must not manufacture focus");
    wheel(-100);
    assert.equal(currentFrame.viewport.activePageIndex, 1, "opposite wheel input should retarget immediately");
    await settleDesktop();
    interruptWheel({timeStamp:wheelTime+1});
    commitDesktopPage(0);
    await settleDesktop();
    wheel(5);
    await present(app, "continuous wheel scrub");
    assert.ok(scene.getMotionSnapshot().desktopPageTrackX < -0.5, "small wheel deltas should scrub the live track");
    interruptWheel({ timeStamp: wheelTime + 1 });
    await settleDesktop();
    assert.equal(currentFrame.viewport.activePageIndex, 0, "cancelled short gestures must not commit");
    assert.ok(Math.abs(scene.getMotionSnapshot().desktopPageTrackX) < 0.1, "cancelled scrubs should return to their source page");
    wheel(60);
    wheel(60);
    wheel(60);
    await waitFor("continuous wheel progress commit", () => currentFrame.viewport.activePageIndex === 1);
    await settleDesktop();
    interruptWheel({timeStamp:wheelTime+1});
    commitDesktopPage(0);
    await settleDesktop();
    wheel(20);
    wheel(20);
    await waitFor("continuous wheel velocity commit", () => currentFrame.viewport.activePageIndex === 1);
    await settleDesktop();
    interruptWheel({timeStamp:wheelTime+1});
    commitDesktopPage(0);
    await settleDesktop();
    wheel(-20);
    await present(app, "first-page edge resistance");
    assert.ok(scene.getMotionSnapshot().desktopPageTrackX > 0, "edge gestures should expose a resisted stretch");
    assert.ok(scene.getMotionSnapshot().desktopPageTrackX < app.contentSize.width * 0.12, "edge stretch must remain bounded");
    await new Promise<void>((resolve) => setTimeout(resolve, 160));
    await settleDesktop();
    assert.equal(currentFrame.viewport.activePageIndex, 0, "edge gestures must not leave the page range");
    interruptWheel({timeStamp:wheelTime+1});
    if (currentFrame.viewport.activePages.length > 1) {
      while (currentFrame.viewport.activePageIndex < currentFrame.viewport.activePages.length - 1) {
        if (!turnPage(1)) throw new Error("Native smoke could not turn to the next desktop page");
        await waitFor("desktop page motion to settle", () => {
          const motion = scene.getMotionSnapshot();
          return Math.abs(motion.desktopPageTrackX - motion.desktopPageTrackTargetX) < 0.05;
        });
        await waitFor(
          "the next native desktop page to become visible",
          () => iconNodes.every((node) => node.alpha >= 0.999 && node.renderable && node.visible),
        );
        await present(app, "the settled next desktop page");
        await captureSmokeFrame(`desktop-page-${currentFrame.viewport.activePageIndex + 1}`);
        presentCount += 1;
      }
      if (turnPage(1)) throw new Error("Native desktop paging advanced past its last page");
      while (currentFrame.viewport.activePageIndex > 0) {
        if (!turnPage(-1)) throw new Error("Native smoke could not turn to the previous desktop page");
        await waitFor("desktop page motion to settle", () => {
          const motion = scene.getMotionSnapshot();
          return Math.abs(motion.desktopPageTrackX - motion.desktopPageTrackTargetX) < 0.05;
        });
        await waitFor(
          "the previous native desktop page to become visible",
          () => iconNodes.every((node) => node.alpha >= 0.999 && node.renderable && node.visible),
        );
        await present(app, "the settled previous desktop page");
        presentCount += 1;
      }
      if (!desktopPageMotionObserved) {
        throw new Error("Native desktop page changed without an observable intermediate track position");
      }
      pageNavigation = "verified";
    }

    const smokeFolder = activePageItems.find((item) => (
      item.type === "folder" && Array.isArray(item.childPages) && item.childPages.length > 1
    )) as NativeFolderItem | undefined;
    if (!smokeFolder) throw new Error("Native smoke fixture must contain a multi-page folder on page one");
    const otherFolder = activePageItems.find((item) => item.id === "native-folder-other");
    assert.ok(otherFolder, "interruption smoke requires a second desktop folder");
    await activateItem(smokeFolder);
    assert.equal(closeFolder(), true, "a close before the first opening present must be accepted");
    await waitFor("unpresented opening cancellation", () => folderFlow.snapshot().renderedFolder === null);
    await activateItem(smokeFolder);
    await waitFor("partial folder opening", () => {
      const progress = folderFlow.snapshot().openProgress;
      return progress > 0.01 && progress < 0.95;
    });
    await present(app, "partial opening before cancel");
    assert.equal(closeFolder(), true, "close must interrupt a presented opening");
    await present(app, "interrupted folder close");
    await captureSmokeFrame("folder-opening-cancel");
    await activateItem(smokeFolder);
    await waitFor("same-folder reopen", () => !folderFlow.snapshot().isClosing && folderFlow.snapshot().openProgress >= 0.999);
    await present(app, "same-folder reopened");
    await captureSmokeFrame("folder-reopened");
    assert.equal(closeFolder(),true);
    await present(app,"closing before desktop pointer activation");
    assert.equal(folderFlow.snapshot().isClosing,true,"desktop pointer regression must run during closing");
    const otherFolderNode=app.stage.getChildByLabel(`launchpad-item:${otherFolder.id}`,true);
    assert.ok(otherFolderNode);
    clickWithNativeInput(otherFolderNode);
    await waitFor("cross-folder opening", () => folderFlow.snapshot().renderedFolder?.id === otherFolder.id);
    await present(app, "cross-folder handoff");
    await captureSmokeFrame("folder-cross-handoff");
    await activateItem(smokeFolder);
    await activateItem(otherFolder);
    await activateItem(smokeFolder);
    await waitFor("latest cross-folder request wins", () => (
      folderFlow.snapshot().renderedFolder?.id === smokeFolder.id
      && !folderFlow.snapshot().isClosing && folderFlow.snapshot().openProgress >= 0.999
    ));
    assert.equal(closeFolder(), true);
    await waitFor("settings button reveals while folder is still closing",()=>settingsButton.alpha>0.1&&folderFlow.snapshot().isClosing);
    assert.ok(folderFlow.snapshot().renderedFolder,"settings button must appear before folder cleanup");
    assert.equal(settingsButton.eventMode,"none","visual reveal must not enable clicks through the closing folder");
    await captureSmokeFrame("settings-button-folder-closing");
    await waitFor("interruption stress cleanup", () => folderFlow.snapshot().renderedFolder === null);
    await present(app, "clean desktop after interruptions");
    for (const folder of [smokeFolder, otherFolder]) {
      const node = app.stage.getChildByLabel(`launchpad-item:${folder.id}`, true);
      assert.ok(node?.visible && node.renderable, "every folder source must return after interrupted handoffs");
    }
    console.log("Native folder interruption smoke: cancel, reopen, cross-folder latest-request and cleanup passed");
    onKey({ type: "down", key: "Enter" });
    const folderIndex = activePageItems.findIndex((item) => item.id === smokeFolder.id);
    for (let index = 0; index < folderIndex; index += 1) onKey({ type: "down", key: "ArrowRight" });
    assert.equal(currentFocus()?.id, smokeFolder.id);
    onKey({ type: "down", key: "Enter" });
    assert.equal(folderFlow.snapshot().renderedFolder?.id, smokeFolder.id, "Enter with focus should activate the folder");
    assert.equal(currentFocus(), null, "opening a folder must clear the previous scope's focus");
    await waitFor("keyboard-opened folder", () => folderFlow.snapshot().openProgress >= 0.999);
    onKey({ type: "down", key: "ArrowDown" });
    assert.equal(currentFocus()?.id, smokeFolder.childPages[0]?.[0]?.id, "first folder arrow should establish focus");
    onKey({ type: "down", key: "ArrowDown" });
    assert.equal(currentFocus()?.id, smokeFolder.childPages[0]?.[folderLayout.cols]?.id, "folder arrows should use folder columns");
    onKey({ type: "down", key: "Escape" });
    await waitFor("keyboard-closed folder handoff", () => folderFlow.snapshot().renderedFolder === null);
    assert.equal(currentFocus(), null, "closing a folder must clear keyboard focus");
    const folderNode = app.stage.getChildByLabel(`launchpad-item:${smokeFolder.id}`, true);
    if (!folderNode) throw new Error(`Native smoke folder node ${smokeFolder.id} was not rendered`);
    clickWithNativeInput(folderNode);
    assert.equal(currentFocus(), null, "pointer-opened folders must not create keyboard focus");
    await waitFor(
      "an intermediate native folder opening frame",
      () => {
        const progress = folderFlow.snapshot().openProgress;
        return progress > 0.001 && progress < 0.999;
      },
    );
    folderOpenMotionObserved = true;
    await waitFor(
      "the native folder opening motion to settle",
      () => folderFlow.snapshot().openProgress >= 0.999,
    );
    await present(app, "the opened native folder");
    await waitFor("desktop fade behind folder", () => {
      const dots = app.stage.getChildByLabel("native-desktop-page-dots", true);
      return Boolean(dots && dots.alpha < 0.01 && scene.getDesktopAlpha()<0.01);
    });
    await captureSmokeFrame("folder-page-1");
    presentCount += 1;

    wheel(100);
    assert.equal(folderFlow.snapshot().folderPageIndex, 1, "folder wheel commits should use the shared engine");
    assert.equal(currentFocus(), null, "folder wheel paging must not manufacture focus");
    await waitFor(
      "an intermediate native folder page frame",
      () => {
        const motion = scene.getMotionSnapshot();
        return motion.folderPageTrackX !== null
          && motion.folderPageTrackTargetX !== null
          && Math.abs(motion.folderPageTrackX - motion.folderPageTrackTargetX) > 0.5;
      },
    );
    folderPageMotionObserved = true;
    await waitFor(
      "the native folder page motion to settle",
      () => {
        const motion = scene.getMotionSnapshot();
        return motion.folderPageTrackX !== null
          && motion.folderPageTrackTargetX !== null
          && Math.abs(motion.folderPageTrackX - motion.folderPageTrackTargetX) < 0.05;
      },
    );
    if (!folderPageMotionObserved || folderFlow.snapshot().folderPageIndex !== 1) {
      throw new Error("Native folder page navigation did not expose a real track animation");
    }
    await present(app, "the settled second native folder page");
    await captureSmokeFrame("folder-page-2");
    const secondFolderPageX = scene.getMotionSnapshot().folderPageTrackTargetX;
    assert.ok(secondFolderPageX !== null && secondFolderPageX < -1);
    for (let sample = 0; sample < 20; sample += 1) {
      const pageIndex = sample % 2;
      assert.equal(setFolderPageIndex(pageIndex), true, "each title sample must change the logical page");
      await present(app, "folder title stress page commit");
      const expectedX = pageIndex === 0 ? 0 : secondFolderPageX;
      await waitFor("folder title paging stress", () => {
        const motion = scene.getMotionSnapshot();
        return motion.folderPageTrackX !== null && motion.folderPageTrackTargetX !== null
          && Math.abs(motion.folderPageTrackTargetX - expectedX) < 0.05
          && Math.abs(motion.folderPageTrackX - expectedX) < 0.05;
      });
      await present(app, "folder title stress sample");
      const pending: Container[] = [app.stage];
      let title: Text | null = null;
      while (pending.length) {
        const node = pending.pop()!;
        if (node instanceof Text && node.text === smokeFolder.name && Number(node.style.fontSize) === 18) title = node;
        pending.push(...node.children);
      }
      assert.ok(title, "folder title must remain in the scene while paging");
      const pixels = await captureScenePixels(app, app.contentSize.width, app.contentSize.height);
      const region = toPixelRegion(title, pixels.width, pixels.height);
      let brightPixels = 0;
      for (let y = region.y; y < region.y + region.height; y += 1) {
        for (let x = region.x; x < region.x + region.width; x += 1) {
          const offset = (y * pixels.width + x) * 4;
          if (pixels.pixels[offset]! > 200 && pixels.pixels[offset + 1]! > 200 && pixels.pixels[offset + 2]! > 200) brightPixels += 1;
        }
      }
      assert.ok(brightPixels > 20, `folder title disappeared after page ${pageIndex}, sample ${sample}: ${brightPixels} bright pixels`);
    }
    console.log("Folder title GPU stress: 20 alternating page samples passed");
    presentCount += 1;
    if (turnFolderPage(1)) throw new Error("Native folder paging advanced past its last page");

    const child = smokeFolder.childPages[1]?.find((item): item is SceneItem => item !== null);
    if (!child) throw new Error("Native smoke folder second page must contain a launchable child");
    const childNode = app.stage.getChildByLabel(`launchpad-item:${child.id}`, true);
    if (!childNode) throw new Error(`Native smoke folder child ${child.id} was not rendered`);
    if (childNode.eventMode !== "static") {
      throw new Error(`Native smoke folder child ${child.id} was not interactive`);
    }
    const childLaunchMarker = process.env.LAUNCHPAD_NATIVE_CHILD_LAUNCH_MARKER;
    if (!childLaunchMarker) {
      throw new Error("LAUNCHPAD_NATIVE_CHILD_LAUNCH_MARKER is required in smoke mode");
    }
    clickWithNativeInput(childNode);
    await waitFor("launch close state committed",()=>launchFlow!.isDesktopClosing.value);
    assert.equal(desktopBackground.alpha,0,"application launch removes the Pixi background immediately");
    assert.deepEqual(app.renderer.background.colorRgba,[0,0,0,0],"launch animation must clear to premultiplied transparent black");
    await waitFor("an intermediate app launch ghost",()=>launchGhostView.visible&&launchGhostView.alpha>0.15&&launchGhostView.alpha<0.6);
    assert.ok(launchGhostView.scale.x>1.2,"launch icon must expand as it fades");
    await captureSmokeFrame("folder-app-launch-animation");
    folderCloseMotionObserved = true;
    await waitFor("the native folder child process", () => existsSync(childLaunchMarker));
    folderChildLaunchObserved = true;
    await waitFor("launch animation hides window",()=>!app.window.isVisible());
    showLaunchpad();await present(app,"reopened after application launch");
    await waitFor("launch reopen settles",()=>!scene.getMotionSnapshot().active);
    await waitFor(
      "the native folder closing handoff",
      () => folderFlow.snapshot().renderedFolder === null,
    );
    await present(app, "the closed native folder");
    await captureSmokeFrame("folder-closed");
    presentCount += 1;

    const initialSize = app.contentSize;
    const initialResizeEvents = resizeEvents;
    observeLiveResize = true;
    const windowFrame = app.window.getFrame();
    app.window.setSize(windowFrame.width + 160, windowFrame.height + 80);
    await waitFor(
      "the native resize event to update the public viewport",
      () => resizeEvents > initialResizeEvents && (
        app.contentSize.width !== initialSize.width || app.contentSize.height !== initialSize.height
      ),
    );
    const liveSize = app.contentSize;
    if (!resizeLiveBackingObserved) {
      throw new Error("Live resize did not update the GPU backing with the public viewport");
    }
    await waitFor(
      "live resize to match the GPU backing",
      () => {
        const source = app.renderer.view.texture.source;
        return source.pixelWidth === Math.round(liveSize.width * app.resolution)
          && source.pixelHeight === Math.round(liveSize.height * app.resolution);
      },
    );
    observeLiveResize = false;
    resizeSettledBackingObserved = true;
    await present(app, "the resized LaunchPad scene frame");
    const resizedSearchWidth = Math.min(348, Math.max(180, app.contentSize.width - 40));
    assert.equal(searchBar.x, (app.contentSize.width - resizedSearchWidth) / 2,
      "resize must recenter the search bar without waiting for an animation commit");
    assert.equal(settingsButton.x, app.contentSize.width - 54,
      "resize must keep the settings button anchored to the current right edge");
    assert.equal(selectionToolbar.x, (app.contentSize.width - Math.min(760, app.contentSize.width - (app.contentSize.width<=760?20:40))) / 2,
      "resize must update the selection toolbar even while it is hidden");
    presentCount += 1;
    resizeObserved = true;
    resizePresentCount = 1;

    const currentDisplay = displayFor(app.window.getFrame());
    const alternateDisplay = Screen.getAllDisplays().find((candidate) => (
      candidate.id !== currentDisplay.id && candidate.scaleFactor !== app.resolution
    ));
    if (alternateDisplay) {
      app.window.setPosition(
        alternateDisplay.workArea.x + 32,
        alternateDisplay.workArea.y + 32,
      );
      await waitFor(
        "the public resolution to follow the mixed-DPI display",
        () => app.resolution === alternateDisplay.scaleFactor,
      );
      work = commitScene({
        height: app.contentSize.height,
        resolution: app.resolution,
        width: app.contentSize.width,
      }, true);
      if (iconNodes.some((node) => (
        node.emojiText.resolution !== Math.max(2,app.resolution) || node.labelText.resolution !== Math.max(2,app.resolution)
      ))) {
        throw new Error("Native Pixi text resolution did not follow the mixed-DPI display");
      }
      await present(app, "the mixed-DPI LaunchPad scene frame");
      presentCount += 1;
      dpiTransition = "verified-display-fallback";
      dpiResolution = app.resolution;
    }

    app.window.minimize();
    await waitFor(
      "the native application to suspend after minimization",
      () => app.window.isMinimized() && app.state === "suspended",
    );
    app.window.unminimize();
    await waitFor(
      "the native application to resume after restoration",
      () => !app.window.isMinimized() && app.state === "running",
    );
    work = commitScene({
      height: app.contentSize.height,
      resolution: app.resolution,
      width: app.contentSize.width,
    }, true);
    await present(app, "the restored LaunchPad scene frame");
    presentCount += 1;
    restoreObserved = true;
    restorePresentCount = 1;
  }

  const visibleNodes = iconNodes.filter((node) => (
    node.alpha >= 0.999 && node.renderable && node.visible
  )).length;
  if (visibleNodes !== iconNodes.length) {
    throw new Error(`Only ${visibleNodes}/${iconNodes.length} LaunchPad nodes became visible`);
  }

  const renderer = app.renderer;
  const contentSize = app.contentSize;
  const resolution = app.resolution;
  const source = renderer.view.texture.source;
  const backingWidth = Math.round(contentSize.width * resolution);
  const backingHeight = Math.round(contentSize.height * resolution);
  if (
    renderer.view.screen.width !== contentSize.width
    || renderer.view.screen.height !== contentSize.height
    || source.pixelWidth !== backingWidth
    || source.pixelHeight !== backingHeight
    || source.resolution !== resolution
  ) {
    throw new Error(
      `Native renderer viewport mismatch: screen=${renderer.view.screen.width}x${renderer.view.screen.height}`
      + ` backing=${source.pixelWidth}x${source.pixelHeight}@${source.resolution}`
      + ` expected=${contentSize.width}x${contentSize.height} / ${backingWidth}x${backingHeight}@${resolution}`,
    );
  }

  if (nativeMode === "smoke") {
    await captureSmokeFrame("desktop-restored-resized");
    const pixels = await captureScenePixels(app, contentSize.width, contentSize.height);
    const iconRegions = iconNodes
      .filter((node) => node.iconSprite.visible)
      .map((node) => toPixelRegion(node.iconSprite, pixels.width, pixels.height));
    if (iconRegions.length < 1) throw new Error("Expected at least one native PNG icon sprite");
    const pixelProof = assertNativeScenePixels(pixels, {
      background: NATIVE_BACKGROUND,
      contentBottom: Math.ceil(contentSize.height / 2),
      contentEnd: Math.floor(contentSize.height - 72),
      emojiRegions: iconNodes
        .filter((node) => node.emojiText.visible)
        .map((node) => toPixelRegion(node.emojiText, pixels.width, pixels.height)),
      iconRegions,
      labelRegions: iconNodes.map((node) => toPixelRegion(node.labelText, pixels.width, pixels.height)),
    });
    const cjkLabelPixels = activePageItems.flatMap((item, index) => (
      typeof item.name === "string" && /\p{Script=Han}/u.test(item.name)
        ? [pixelProof.labelForegroundPixels[index] ?? 0]
        : []
    ));
    if (cjkLabelPixels.length < 1 || cjkLabelPixels.some((count) => count <= 0)) {
      throw new Error("Native CJK labels did not produce foreground pixels");
    }
    const proof: NativeProof = Object.freeze({
      ...pixelProof,
      backingHeight,
      backingWidth,
      catalogApps: catalogResult.apps.length,
      cjkLabelPixels,
      desktopPageMotionObserved,
      dpiResolution,
      dpiTransition,
      folderChildLaunchObserved,
      folderCloseMotionObserved,
      folderOpenMotionObserved,
      folderPageMotionObserved,
      folderPageNavigation: "verified",
      height: contentSize.height,
      loadedLayout: loadedLayout !== null,
      pageCount: currentFrame.viewport.activePages.length,
      pageNavigation,
      inputNavigation: "verified",
      folderInterruptions: "verified",
      folderTitleSamples: 20,
      presentCount,
      presented: true,
      reconciledNodes: work.reconciledNodes,
      resolution,
      resizeLiveBackingObserved,
      resizeMode: "live",
      resizeObserved,
      resizePresentCount,
      resizeSettledBackingObserved,
      restoreObserved,
      restorePresentCount,
      structuredLaunchFailureObserved,
      visibleNodes,
      width: contentSize.width,
    });
    const markerPath = process.env.LAUNCHPAD_NATIVE_SMOKE_MARKER;
    if (!markerPath) throw new Error("LAUNCHPAD_NATIVE_SMOKE_MARKER is required in smoke mode");
    writeFileSync(markerPath, JSON.stringify(proof), "utf8");
    console.log(JSON.stringify(proof, null, 2));
  } else {
    console.log(JSON.stringify({
      catalogApps: catalogResult.apps.length,
      loadedLayout: loadedLayout !== null,
      pageCount: currentFrame.viewport.activePages.length,
      reconciledNodes: work.reconciledNodes,
      resolution,
      visibleNodes,
    }, null, 2));
    if(process.env.LAUNCHPAD_NATIVE_SETTINGS_ONLY==="1"){
      if(process.env.LAUNCHPAD_NATIVE_WINDOW_CARD_PREVIEW==="1"){settingsNavigation.selectTab("interface");windowPanelState.mode=true;}
      if(process.env.LAUNCHPAD_NATIVE_APPS_PREVIEW==="1")settingsNavigation.selectTab("apps");
      openSettings();
    }
    if(process.env.LAUNCHPAD_NATIVE_RESTART_SMOKE==="1"){
      const {sendTrayTestAction}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/tray-smoke.js");
      assert.ok(process.env.LUMERIA_NATIVE_DATA_DIR,"restart smoke must use isolated data");
      const attempt=Number(process.env.LAUNCHPAD_NATIVE_RESTART_ATTEMPT);
      if(attempt===0){
        editing!.rename("native-layout-icon","Tray restart saved");await saves.flush();
        app.window.minimize();await waitFor("restart fixture minimized",()=>app.window.isMinimized()&&app.state==="suspended");
        await sendTrayTestAction(tray!.id,"menu",4);
      }else if(attempt===1){
        const {getNativePixiApplicationTesting}=await import("../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
        const testing=getNativePixiApplicationTesting(app);testing.injectFault("out-of-memory");app.invalidate();
        await waitFor("injected fatal recorded",()=>app.state==="failed");
        assert.ok(readFileSync(nativeLogPath,"utf8").includes('"event":"fatal"'),"fatal error must reach the persistent journal");
        await sendTrayTestAction(tray!.id,"menu",4);
      }else{
        assert.equal(attempt,2);assert.equal(layoutState.presentation.pages.value.flat().find(item=>item.id==="native-layout-icon")?.name,"Tray restart saved");
        logNativeRuntime("restart-smoke-restored");
        await sendTrayTestAction(tray!.id,"menu",5);
      }
    }
    if(process.env.LAUNCHPAD_MEMORY_BENCH){
      const {runNativeAppsMemoryBenchmark}=await import("./nativeAppsMemoryBenchmark.js");
      await runNativeAppsMemoryBenchmark({apps:apps!,host:searchBar.host,width:740,theme:"dark",state:appsPageState,subPage:"apps.appManager",management,icons:iconTextures,
        invalidate:()=>app.invalidate(),redraw:()=>{},navigate:()=>{},edit:()=>{}},app.stage,()=>present(app,"memory benchmark frame"));
      await app.dispose();
    }else await closed;
  }
} finally {
  windowEffects.dispose();
  tray?.remove();tray=null;
  disposeLaunchFlow();
  sceneDisposed=true;sceneRenderQueued=false;
  desktopBackground.destroy();
  mainShortcut.dispose();
  (settingsShell as NativeSettingsShell|null)?.destroy();
  branding.destroy();
  offWheelPointerInterrupt();
  offTouch();
  editing?.dispose();
  offSaveBeforeClose();
  for (const timer of wheelDeadlines.values()) clearTimeout(timer);
  wheelDeadlines.clear();
  disconnectAnimationHost();
  folderFlow.destroy();
  offFocus();
  offSystemPreferences();
  offWheel();
  offResize();
  offBackgroundResize();
  offPresented();
  offStateChange();
  offFatal();offRecovered();logNativeRuntime("shutdown");
  scene.destroy();
  app.stage.off("rightclick",onContext);
  management.destroy();
  notices.clearTransientNoticeTimer();notices.clearWarningDialogTimer();noticeView.destroy({children:true});
  searchBar.destroy();
  selectionToolbar.destroy();app.stage.filters=[];selectionBackdropSurface.destroy();
  iconTextures.dispose();
  await app.dispose();
  await nativeData.dispose();
}
}

// Keep failures observable by the Worker error handler after existing finally
// blocks have released application resources; never turn startup failure into success.
void runNativeApplication().catch(error => { queueMicrotask(() => { throw error; }); });
