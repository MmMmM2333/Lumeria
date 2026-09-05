import { t, setNativeLocale, nativeLocaleOptions } from "./nativeLocalization.js";
import { readErrorMessage } from "../application/errorMessage.js";
import { setNativeUiFontFamily } from "../rendering/native/nativeTypography.js";
import { NativeWindowChrome } from "../rendering/native/NativeWindowChrome.js";
import { clickOwnedNativeWindow, dragOwnedNativeWindow, respondToOwnedColorDialog } from "./nativeSettingsSmoke.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Screen } from "electrobun/main";
import {
  Container,
  Graphics,
  Rectangle,
  Text,
  FederatedWheelEvent,
  type FederatedPointerEvent,
  type Sprite,
} from "pixi.js";
import {
  createNativePixiApplication,
  NativeGlobalShortcut,
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
import { makeLaunchTarget } from "../domain/launchpadData.js";
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
import { nativeLayoutSettingsPage } from "../rendering/native/nativeLayoutSettingsPage.js";
import { nativeFluentIcon } from "../rendering/native/nativeFluentIcons.js";
import { nativeAboutSettingsPage } from "../rendering/native/nativeAboutSettingsPage.js";
import { loadNativeIconTexture } from "../rendering/native/nativeIconTextureLoader.js";
import { normalizeLaunchpadIconVariant, LAUNCHPAD_ICON_VARIANTS } from "../domain/launchpadIconVariant.js";
import { createNativeShortcut } from "./nativeShortcut.js";
import { normalizeMainWindowShortcut } from "../domain/mainWindowShortcut.js";
import type { LaunchpadPages, ReadonlyLaunchpadApp } from "../domain/launchpadLayout.js";
import { createNativeIconTextureRepository } from "../rendering/native/nativeIconTextureLoader.js";
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
  resizeLiveLogicalObserved: boolean;
  resizeMode: "adaptive";
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
let loadedLayout: LayoutDocument | null;
let catalogResult: NativeCatalogScanResult;
try {
  await nativeData.connect();
  loadedLayout = await nativeData.loadLayout();
  const scanRequest = makeNativeStartupScanRequest(loadedLayout);
  catalogResult = await nativeData.scanApps(scanRequest.roots, scanRequest.filters);
} catch (error) {
  await nativeData.dispose();
  throw error;
}
setNativeLocale(loadedLayout?.settings.localePreference ?? Intl.DateTimeFormat().resolvedOptions().locale);
const layoutState = createNativeLayoutState(loadedLayout, catalogResult.apps);
const settingsNavigation=createSettingsNavigation(createNativeStateHost(()=>{}),key=>t(key));
settingsNavigation.selectTab("interface");
let settingsShell:NativeSettingsShell|null=null;
let openSettings:()=>void;
let hiddenAppIds=[...(loadedLayout?.settings.hiddenAppIds ?? [])];
const saves = createLayoutSaveQueue(document => nativeData.saveLayout(document));
let currentFrame = makeNativeStartupFrame(loadedLayout, catalogResult.apps, layoutState.presentation.pages.value);
let activePageItems = getNativeActivePageItems(currentFrame);
let searchQuery = "";
let launchFlow:ReturnType<typeof createLaunchpadLaunchFlow>|null=null;
let dismissLaunchpad=()=>{};
let showLaunchpad=()=>{};
let disposeLaunchFlow=()=>{};
const folderLayout = Object.freeze({
  get cols(){return layoutState.presentation.folderCols.value;},
  get iconSize(){return layoutState.presentation.folderIconSizeMode.value==="custom"
    ?layoutState.presentation.folderIconSize.value:layoutState.presentation.iconSize.value;},
  get rows(){return layoutState.presentation.folderRows.value;},
});

const app = await createNativePixiApplication({
  transparent:true,
  titleBarStyle:"hidden",
  antialias: true,
  background: 0x090b14,
  height: 600,
  resizeMode: "adaptive",
  title: nativeMode === "app" ? "LaunchPad" : `LaunchPad · Native WebGPU ${nativeMode}`,
  width: 900,
}).catch(async (error: unknown) => {
  await nativeData.dispose();
  throw error;
});
app.stage.label = "launchpad-native-stage";
let toggleLaunchpad=()=>{};
const mainShortcut=createNativeShortcut(NativeGlobalShortcut,()=>toggleLaunchpad());
const brandingTextures=new Map(await Promise.all(LAUNCHPAD_ICON_VARIANTS.map(async variant=>
  [variant,await loadNativeIconTexture(join(import.meta.dir,"branding",variant+".svg"))] as const)));
const systemPreferences=readNativeSystemPreferences();
setNativeUiFontFamily(systemPreferences.ok?systemPreferences.value.uiFontFamily:null);
let systemAppearance=systemPreferences.ok?systemPreferences.value.appearance:"dark";
const settingsTheme=()=>resolveAppearancePreference(settings.draft.settingsThemePreference.value,systemAppearance);
const settings=createLaunchpadSettings({
  layout:layoutState,isDragActive:()=>editing?.drag.isDragActive()??false,localizationText:{t},
  autostartPort:{isAvailable:()=>nativeData.autostartAvailable,getStatus:()=>nativeData.autostart(),setEnabled:value=>nativeData.autostart(value)},
  localeRuntime:createLocaleRuntimePort({getSystemLanguages:()=>[Intl.DateTimeFormat().resolvedOptions().locale]}),
  activateLocale:state=>{setNativeLocale(state.resolvedLocale);searchBar.setPlaceholder(t("launchpad.search.placeholder"));},
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
      app.setWindowPresentation(request.enabled?request.material:"none",resolveAppearancePreference(request.appearance,systemAppearance));return {ok:true};
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
const statusText = new Text({
  resolution: app.resolution,
  style: {
    fill: 0xd8dee9,
    fontFamily: [...PIXI_UI_FONT_FAMILY],
    fontSize: 14,
  },
});
statusText.anchor.set(0.5, 1);
statusText.eventMode = "none";

function setStatus(message: string, color = 0xd8dee9): void {
  statusText.text = message;
  statusText.style.fill = color;
  statusText.position.set(app.contentSize.width / 2, app.contentSize.height - 16);
  statusText.resolution = app.resolution;
  app.invalidate();
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
        `Native pointer target ${target.label || target.constructor.name} was obscured by ${hit?.label || hit?.constructor.name || "nothing"}`,
      );
    }
  }
  app.nativeInput.emitPointer("pointerdown", x, y, button, modifiers);
  app.nativeInput.emitPointer("pointerup", x, y, button, modifiers);
}

let renderScene: () => void;
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
      setStatus("");
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
  const target=appItem?.launchTarget;
  management.form(item ? t("dialogs.appEditor.editTitle") : t("dialogs.appEditor.addTitle"), [
    {label:t("dialogs.appEditor.name"),value:appItem?.name ?? ""},
    {label:target?.kind === "appUserModelId" ? t("dialogs.appEditor.windowsId") : t("dialogs.appEditor.target"),value:target?.path ?? target?.appUserModelId ?? "",readOnly:target?.kind === "appUserModelId",
      ...(target?.kind!=="appUserModelId"?{browse:async()=>{const result=await nativeHost.platform.dialogs.openFiles({multiple:false});if(!result.ok){if(result.error.code==="CANCELLED")return null;throw new Error(result.error.message);}return result.value[0]??null;}}:{})},
    {label:t("dialogs.appEditor.args"),value:appItem?.launchArgs ?? ""},
  ],t("common.actions.save"), async values=>{
    const [name,path,args]=values;
    if(!name?.trim())throw new Error("Name is required");
    const nextTarget=target?.kind === "appUserModelId" ? target : makeLaunchTarget(path);
    if(!nextTarget)throw new Error("Launch target is required");
    const pages=layoutState.operations.clonePages(layoutState.presentation.pages.value);
    if(appItem) {
      const app=pages.flatMap(page=>page.flatMap(item=>item.type==="folder"?item.childPages.flat():[item])).find(item=>item?.id===appItem.id);
      if(!app || app.type!=="app")throw new Error("Application no longer exists");
      if(app.origin==="catalog" && (JSON.stringify(app.launchTarget)!==JSON.stringify(nextTarget) || (app.launchArgs??"")!==(args??""))) {
        hiddenAppIds=[...new Set([...hiddenAppIds,app.id])];
        app.id=layoutState.operations.makeId("manual");app.origin="manual";
        delete app.presentationOverrides;delete app.catalogPresentation;
      }
      app.name=name.trim();app.launchTarget=nextTarget;app.launchArgs=args ?? "";
      if(app.origin==="catalog")app.presentationOverrides={...app.presentationOverrides,name:app.name};
    } else {
      const app={id:layoutState.operations.makeId("manual"),type:"app" as const,origin:"manual" as const,name:name.trim(),emoji:"◼",launchTarget:nextTarget,launchArgs:args ?? ""};
      const next=layoutState.operations.appendAppsToPages(pages,[app]);pages.splice(0,pages.length,...next);
    }
    editing!.commit(pages);await saves.flush();
  });
}
function removeItems(ids: readonly string[]): void {
  management.form(t("settings.apps.manager.remove"), [{label:t("launchpad.batch.removeMessage",{count:ids.length}),value:"",readOnly:true}],t("launchpad.batch.remove"),async()=>{
    const catalogIds=layoutState.operations.collectAppsFromPages(layoutState.presentation.pages.value).filter(app=>ids.includes(app.id)&&app.origin==="catalog").map(app=>app.id);
    hiddenAppIds=[...new Set([...hiddenAppIds,...catalogIds])];
    editing!.remove(ids);await saves.flush();
  });
}
function contextMenu(item: SceneItem | null,x:number,y:number):void {
  const actions = item ? [
    {label:item.type==="folder"?t("common.actions.rename"):t("dialogs.appEditor.editTitle"),run:()=>editItem(item)},
    {label:t("settings.apps.manager.remove"),run:()=>removeItems([item.id])},
    ...item.type==="app" ? [
      {label:t("dialogs.appEditor.changeIcon"),run:()=>{void updateIcon(item,false).catch(error=>setStatus(String(error),0xff7b72));}},
      {label:t("common.actions.restoreDefault"),run:()=>{void updateIcon(item,true).catch(error=>setStatus(String(error),0xff7b72));}},
    ] : [],
  ] : [{label:t("dialogs.appEditor.addTitle"),run:()=>editItem(null)}];
  if(!item)actions.push({label:t("settings.shell.title"),run:()=>openSettings()});
  if(item?.type === "folder")actions.push({label:t("commands.dissolve.confirm"),run:()=>{
    editing!.commit(layoutState.operations.dissolveFolder(layoutState.presentation.pages.value,item.id,layoutState.presentation.pageSize.value));
  }});
  if(!editing!.mode.value)actions.push({label:t("launchpad.batch.toolbarLabel"),run:()=>{
    editing!.alt.cancelAltEditMode();
    editing!.selection.begin({initialIds:item?.type==="app"?[item.id]:[]});
  }});
  management.menu(x,y,actions);
}
async function updateIcon(item:SceneItem, reset:boolean):Promise<void> {
  let path:string|null=null;
  if(!reset) {
    const result=await nativeHost.platform.dialogs.openFiles({allowedFileTypes:"png,jpg,jpeg,webp",multiple:false});
    if(!result.ok) {if(result.error.code==="CANCELLED")return;throw new Error(result.error.message);}
    path=result.value[0]??null;if(!path)return;
    const cached=await nativeData.cacheCustomIcon(await normalizeNativeCustomIcon(path));
    path=cached.iconPath;
  }
  const pages=layoutState.operations.clonePages(layoutState.presentation.pages.value);
  const app=pages.flatMap(page=>page.flatMap(item=>item.type==="folder"?item.childPages.flat():[item])).find(app=>app?.id===item.id);
  if(!app || app.type!=="app")throw new Error("Application no longer exists");
  if(reset) {delete app.customIconPath;delete app.customIconDataUrl;if(app.presentationOverrides)delete app.presentationOverrides.customIconPath;}
  else {app.customIconPath=path;if(app.origin==="catalog")app.presentationOverrides={...app.presentationOverrides,customIconPath:path!};}
  editing!.commit(pages);await saves.flush();
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
    else if(action==="choose-icon" || action==="reset-icon")void updateIcon(item,action==="reset-icon").catch(error=>setStatus(String(error),0xff7b72));
  },
});
app.stage.addChild(statusText);
app.stage.addChild(searchBar);
app.stage.addChild(management);
const selectionToolbar = new Container({label:"native-selection-toolbar"});
selectionToolbar.visible=false;
const toolbarBackground=new Graphics();
const toolbarSummary=new Text({text:"",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fill:0xffffff}});
toolbarSummary.eventMode="none";
selectionToolbar.addChild(toolbarBackground,toolbarSummary);
const selectAllButton=management.button(t("common.actions.selectAll"),88,()=>editing!.selection.selectScope(getSelectionScope()));
const clearSelectionButton=management.button(t("common.actions.clearSelection"),116,()=>editing!.selection.deselectAll());
const createFolderButton=management.button(t("launchpad.batch.createFolder"),116,()=>editing!.createFolder());
const removeButton=management.button(t("launchpad.batch.remove"),80,()=>removeItems([...editing!.selection.selectedIds.value]));
const doneButton=management.button(t("launchpad.batch.done"),68,()=>{if(!editing!.selection.isFrozen.value)editing!.selection.clear();});
selectionToolbar.addChild(selectAllButton,clearSelectionButton,createFolderButton,removeButton,doneButton);
app.stage.addChild(selectionToolbar);
const settingsButton=management.button(t("settings.shell.title"),34,()=>openSettings(),"subtle");
settingsButton.caption.visible=false;settingsButton.label="native-settings-button";
const settingsIcon=nativeFluentIcon("settings-24-regular",0xffffff,20);settingsIcon.position.set(7,7);settingsButton.addChild(settingsIcon);
app.stage.addChild(settingsButton);
const windowChrome=new NativeWindowChrome(app,error=>setStatus(readErrorMessage(error),0xff7b72));
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
let offResize = (): void => {};
let offBackgroundResize=()=>{};
const offPresented = app.on("presented", () => {
  folderFlow.commitPresented(scene.commitPresentedFrame());
  const session=launchFlow?.appLaunchCloseSessionId.value;
  if(session&&currentFrame.visual.appLaunchCloseSessionId===session)launchFlow?.commitAppLaunchCloseFrame(session);
});
let offStateChange = (): void => {};
let offFocus = (): void => {};
let offSystemPreferences=()=>{};
let offWheel = (): void => {};
let offWheelPointerInterrupt = (): void => {};
let offTouch = (): void => {};
let disconnectAnimationHost = (): void => {};
let windowClosing=false;
const offSaveBeforeClose = app.beforeClose(async () => {
  windowClosing=true;app.stage.interactiveChildren=false;
  try {
    await settingsShell?.waitForApply();
    await saves.flush();
    if(launchFlow?.isDesktopOpen.value&&app.window.isVisible()){
      launchFlow.closeDesktop();
      await waitFor("native window close animation",()=>!launchFlow!.isDesktopClosing.value);
      await present(app,"native window final close frame");
    }
  } catch (error) {
    windowClosing=false;app.stage.interactiveChildren=true;
    setStatus(readErrorMessage(error),0xff7b72);throw error;
  }
});
const wheelDeadlines = new Map<
  LaunchpadGestureDeadline["kind"],
  ReturnType<typeof setTimeout>
>();

try {
  offBackgroundResize=app.on("resize",()=>{
    void refreshBackground().catch(error=>setStatus(readErrorMessage(error),0xff7b72));
  });
  offSystemPreferences=subscribeNativeSystemPreferences(result=>{
    if(!result.ok){setStatus(result.error.message,0xff7b72);return;}
    if(setNativeUiFontFamily(result.value.uiFontFamily))settingsShell?.redraw();
    if(systemAppearance!==result.value.appearance){
      systemAppearance=result.value.appearance;settingsShell?.redraw();
      if(settings.presentation.windowEffectAppearance.value==="system"){
        try{app.setWindowPresentation(settings.presentation.windowEffectMaterial.value,systemAppearance);}
        catch(error){setStatus(readErrorMessage(error),0xff7b72);}
      }
      void refreshBackground().catch(error=>setStatus(String(error),0xff7b72));app.invalidate();
    }
  });
  app.setWindowMode(settings.presentation.windowMode.value,settings.presentation.fullscreenOverscanEnabled.value?1:0);
  app.setWindowPresentation(settings.presentation.windowEffectMaterial.value,resolveAppearancePreference(settings.presentation.windowEffectAppearance.value,systemAppearance));
  await present(app, "the native host startup frame");
  await refreshBackground().catch(error=>setStatus(String(error),0xff7b72));
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
  renderScene = () => {
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
        viewport: Object.freeze({ ...currentFrame.viewport, activePages: pages }) });
      activePageItems = getNativeActivePageItems(currentFrame);
    }
    work = commitScene({
      height: app.contentSize.height,
      resolution: app.resolution,
      width: app.contentSize.width,
    }, false);
    settingsButton.position.set(app.contentSize.width-54,14+chromeInset());
    settingsButton.visible=!settingsShell&&!editing?.selection.isActive.value&&!folderFlow.snapshot().renderedFolder;
    searchBar.update(app.contentSize.width, Boolean(settingsShell||editing?.selection.isActive.value || (folderFlow.snapshot().renderedFolder && !folderFlow.snapshot().isClosing)));
    searchBar.y=14+chromeInset();
    selectionToolbar.visible=Boolean(editing?.selection.isActive.value);
    const toolbarWidth=Math.min(760,app.contentSize.width-40);
    selectionToolbar.position.set((app.contentSize.width-toolbarWidth)/2,14+chromeInset());
    toolbarBackground.clear().roundRect(0,0,toolbarWidth,54,18).fill({color:0x292929,alpha:0.96}).stroke({color:0xffffff,alpha:0.16,width:1});
    const cancelling=Boolean(editing?.drag.groupDragState.value?.canCancel);
    toolbarSummary.text=cancelling
      ?t(editing?.drag.groupDragState.value?.cancelArmed?"launchpad.batch.releaseToCancel":"launchpad.batch.cancelDrag")+"\n"+t("launchpad.batch.cancelDragHint")
      :t("launchpad.batch.selectedCount",{count:editing?.selection.selectedCount.value??0});
    const hiddenCount=(editing?.selection.selectedCount.value??0)-getSelectionScope().orderedIds.filter(id=>editing?.selection.isSelected(id)).length;
    if(!cancelling && hiddenCount>0)toolbarSummary.text+="\n"+t("launchpad.batch.hiddenCount",{count:hiddenCount});
    toolbarSummary.position.set(14,hiddenCount>0||cancelling?10:19);
    [selectAllButton,clearSelectionButton,createFolderButton,removeButton,doneButton].forEach((button,index)=>{
      button.visible=!cancelling;button.y=10;button.x=toolbarWidth-510+[0,96,220,344,432][index]!;
      const disabled=Boolean(editing?.selection.isFrozen.value)
        || (button===createFolderButton && (editing?.selection.selectedCount.value??0)<2)
        || ((button===removeButton || button===clearSelectionButton) && !editing?.selection.selectedCount.value);
      button.eventMode=disabled?"none":"static";button.alpha=disabled?0.4:1;
    });
    if(management.modal)app.stage.setChildIndex(management,app.stage.children.length-1);
    if(settingsShell&&!management.modal)app.stage.setChildIndex(settingsShell,app.stage.children.length-1);
    windowChrome.update(settings.presentation.showCustomTitlebar.value,app.windowMode==="windowed");
    app.stage.setChildIndex(windowChrome,app.stage.children.length-1);
    app.invalidate();
  };
  searchBar.update(app.contentSize.width, false);
  let resizeEvents = 0;
  let resizeLiveLogicalObserved = false;
  let adaptiveResizeBaseline: Readonly<{ height: number; width: number }> | null = null;
  offResize = app.on("resize", ({ height, resolution, width }) => {
    windowChrome.update(settings.presentation.showCustomTitlebar.value,app.windowMode==="windowed");
    settingsShell?.redraw();
    work = commitScene({ height, resolution, width }, true);
    setStatus(statusText.text);
    if (adaptiveResizeBaseline) {
      const source = app.renderer.view.texture.source;
      resizeLiveLogicalObserved ||= source.pixelWidth === adaptiveResizeBaseline.width
        && source.pixelHeight === adaptiveResizeBaseline.height;
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
  offStateChange = app.on("statechange", ({ state }) => {
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
    setStatus("");
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
    const document = layoutState.operations.createLayoutSnapshot({ ...loadedLayout?.settings,...settings.persistence.capture(),
      pages, gridRows: config.rows, gridCols: config.cols, folderRows: config.folderRows, folderCols: config.folderCols,
      iconSize: config.iconSize, folderIconSize: config.folderIconSize, folderIconSizeMode: config.folderIconSizeMode,
      textless: layoutSettings.isTextlessModeState.value, hiddenAppIds });
    saves.enqueue(document);
    void saves.flush().catch(error => setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`, 0xff7b72));
    changeSearch(searchQuery);
    requestSceneRender();
  };
  editing = createNativeEditing({ layout: layoutState, scene, folder: folderFlow,
    size: () => app.contentSize, chromeInset, changed: requestSceneRender, commit: commitEditedPages,
    confirm:config=>management.form(config.title,[],config.confirmText,async()=>{config.onConfirm();await saves.flush();},config.message),
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
  const flowState=createNativeStateHost(requestSceneRender),openingIcon=flowState.cell<import("../application/launchpadLaunchFlow.js").LaunchIconFocus|null>(null);
  const launchTimers=new Map<number,ReturnType<typeof setTimeout>>();let nextLaunchTimer=0;
  disposeLaunchFlow=()=>{for(const timer of launchTimers.values())clearTimeout(timer);launchTimers.clear();};
  let visibilityGeneration=0,visibilityPreparing=false;
  const hideAfterPresented=async()=>{
    if(windowClosing)return;
    const generation=visibilityGeneration;
    await present(app,"desktop close animation final frame");
    if(generation!==visibilityGeneration||launchFlow!.isDesktopOpen.value)return;
    app.window.hide();
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
    prepareNativeLaunch:async()=>{try{await saves.flush();return true;}catch(error){setStatus(readErrorMessage(error),0xff7b72);return false;}},
    launchNativeAppIfAvailable:async item=>{
      try{await nativeData.launchApp(item.id);return true;}
      catch(error){const detail=readErrorMessage(error);return {kind:"launch",title:t("errors.launch.genericTitle"),message:detail,detail,suggestion:t("errors.launch.suggestion.editTarget")};}
    },
    showNativeLaunchError:error=>{showLaunchpad();management.form(error.title,[],t("common.actions.close"),()=>{},error.message);},
    beginNativeWindowClose:()=>{
      visibilityGeneration++;
      fadeNativeLaunchpadChrome([desktopBackground,searchBar,settingsButton,windowChrome,management,...(settingsShell?[settingsShell]:[])],false);
    },
    hideNativeWindow:hideAfterPresented,onDesktopCloseComplete:()=>{void hideAfterPresented().catch(error=>setStatus(readErrorMessage(error),0xff7b72));},
    schedulePageGridMetrics:requestSceneRender,startHomeRevealSettleWindow:()=>{},
  },flowState,{
    setTimeout:(callback,delay)=>{const id=++nextLaunchTimer;launchTimers.set(id,setTimeout(()=>{launchTimers.delete(id);callback();},delay));return id;},
    clearTimeout:id=>{clearTimeout(launchTimers.get(id));launchTimers.delete(id);},afterCommit:queueMicrotask,
  });
  showLaunchpad=()=>{
    visibilityGeneration++;visibilityPreparing=false;
    if(folderFlow.snapshot().renderedFolder)folderFlow.reset();
    app.window.show();app.window.activate();launchFlow!.openDesktop();
    fadeNativeLaunchpadChrome([desktopBackground,searchBar,settingsButton,windowChrome,management],true);
    requestSceneRender();
  };
  dismissLaunchpad=()=>{
    if(visibilityPreparing||launchFlow!.isLaunchpadInteractionBlocked()||editing?.drag.isDragActive()||settingsShell?.applying)return;
    const generation=++visibilityGeneration;visibilityPreparing=true;
    void saves.flush().then(()=>{
      if(generation!==visibilityGeneration)return;
      visibilityPreparing=false;closeSettings();launchFlow!.closeDesktop({clearSearch:true});
    }).catch(error=>{visibilityPreparing=false;setStatus(readErrorMessage(error),0xff7b72);});
  };
  toggleLaunchpad=()=>{
    if(!app.window.isVisible()||!launchFlow!.isDesktopOpen.value||visibilityPreparing)showLaunchpad();
    else dismissLaunchpad();
  };
  if(!process.env.LUMERIA_NATIVE_DATA_DIR){
    const outcome=mainShortcut.apply(normalizeMainWindowShortcut(loadedLayout?.settings.mainWindowShortcut));
    if(!outcome.ok){
      const message=readErrorMessage(outcome.error);console.error("Native shortcut registration failed:",message);
      settings.actions.setMainWindowShortcutError(message);setStatus(message,0xff7b72);
    }
  }
  openSettings=()=>{
    if(settingsShell||editing!.drag.isDragActive())return;
    closeFolder();editing!.selection.clear();editing!.alt.cancelAltEditMode();searchBar.host.blur();
    const startupStatus=settings.beginEdit();
    settingsShell=new NativeSettingsShell({
      navigation:settingsNavigation,t:key=>t(key),tabs:["general","interface","about"],
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
      content:(tab,_subPage,width)=>tab==="general"
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
      },
    });
    const openedShell=settingsShell;
    void startupStatus.then(()=>{if(settingsShell===openedShell&&!openedShell.destroyed)openedShell.redraw();});
    app.stage.addChild(settingsShell);requestSceneRender();
  };
  const turnFolderPage = (direction: Exclude<NativePageTurn, 0>): boolean => {
    if (!setFolderPageIndex(folderFlow.snapshot().folderPageIndex + direction)) return false;
    setStatus("");
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
        const node=app.stage.getChildByLabel(`launchpad-item:${command.target.id}`,true);
        if(!node)throw new Error("Drag target is not rendered");
        editing?.beginDrag(command.target.id, { clientX: Number(command.pointer.x), clientY: Number(command.pointer.y),
          pointerId: command.pointer.pointerId, pointerType: command.pointer.pointerType,
          button: 0, buttons: 1, dragAnchor: command.dragAnchor,
          dragStartedFromThreshold: command.dragStartedFromThreshold,
          type:"pointermove",currentTarget:{getBoundingClientRect:()=>{const b=node.getBounds();return {left:b.x,top:b.y,width:b.width,height:b.height};}},
          preventDefault: () => {}, stopPropagation: () => {} });
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
    applyWheelOutput(wheelGestures.dispatch({
      type: "wheel",
      time,
      ctrlKey: event.ctrlKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      metaKey: event.metaKey,
      momentum: null,
      viewport: {
        scope,
        pageIndex,
        pageCount,
        pageWidth: scene.getPageWidth(scope, pageIndex, app.contentSize.width),
      },
    }), event, time);
  };
  app.stage.on("wheel", onWheel);
  offWheel = () => app.stage.off("wheel", onWheel);
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
    if(editing?.drag.isDragActive()){
      if(event.key==="Escape")editing.drag.cancelDrag({userInitiatedCancel:true});
      return true;
    }
    if(event.key==="Escape" && editing?.selection.isActive.value){
      if(!editing.selection.isFrozen.value)editing.selection.clear();
      return true;
    }
    if (searchBar.input.focused) {
      if(event.key==="Escape") {searchBar.setQuery("");searchBar.input.blur();return true;}
      if(event.key==="Tab" || event.key?.startsWith("Arrow") || event.key==="Enter") {
        if((event.key==="ArrowLeft" || event.key==="ArrowRight") && event.shiftKey)return false;
        searchBar.input.blur();
        if(event.key==="Tab"){setFocusedIcon(currentFrame.interaction.focusedIcon??firstIconFocus(getCurrentIconScope()));return true;}
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
  offFocus=app.nativeInput.onFocusChange(focused=>{if(!focused)editing?.alt.handleWindowBlur();});
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

  if (nativeMode === "smoke") {
    {
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
    const aboutTab=app.stage.getChildByLabel(`native-action:${t("settings.about.title")}`,true);assert.ok(aboutTab);
    clickWithNativeInput(aboutTab);await present(app,"native about route");
    await waitFor("about entrance settles",()=>!scene.getMotionSnapshot().active);
    await captureSmokeFrame("settings-about");
    const generalTab=app.stage.getChildByLabel(`native-action:${t("settings.general.title")}`,true);assert.ok(generalTab);
    clickWithNativeInput(generalTab);await present(app,"native general settings");
    await waitFor("general entrance settles",()=>!scene.getMotionSnapshot().active);
    await captureSmokeFrame("settings-general");
    const originalShortcut=settings.draft.mainWindowShortcut.value;
    const shortcutControl=app.stage.getChildByLabel("native-setting:shortcut",true);assert.ok(shortcutControl);
    clickWithNativeInput(shortcutControl);
    app.nativeInput.emitKey("down",{keyCode:0x77,modifiers:6});
    assert.equal(settings.draft.mainWindowShortcut.value,"control+alt+F8","native shortcut recording must reach the shared draft");
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
    await waitFor("general settings restored",()=>Boolean(settingsShell&&!settingsShell.applying));
    assert.equal((await nativeData.loadLayout())!.settings.localePreference,localeBefore);

    const appearanceTab=app.stage.getChildByLabel(`native-action:${t("settings.interface.title")}`,true);assert.ok(appearanceTab);
    clickWithNativeInput(appearanceTab);await present(app,"back to native layout settings");
    const committedTheme=settings.persistence.capture().settingsThemePreference;
    const previewTheme=settingsTheme()==="dark"?"light":"dark";
    clickWithNativeInput(app.stage.getChildByLabel(`native-setting:theme-${previewTheme}`,true)!);
    await present(app,"settings theme preview");
    assert.equal(settingsTheme(),previewTheme);
    assert.equal(settings.persistence.capture().settingsThemePreference,committedTheme,"theme preview must not commit settings");
    await captureSmokeFrame("settings-theme-preview");
    settings.actions.setDraftSettingsThemePreference(committedTheme);(settingsShell as NativeSettingsShell|null)?.redraw();
    await present(app,"settings theme restored");

    const clickWindowControl=async(label:string)=>{
      const control=app.stage.getChildByLabel(`native-window:${label}`,true);assert.ok(control instanceof NativeFluentButton);
      for(let index=0;index<160&&!control.focused;index++)onKey({type:"down",key:"Tab"});
      assert.ok(control.focused,`window settings keyboard must reach ${label}`);
      await present(app,`window ${label} revealed`);clickWithNativeInput(control);await present(app,`window ${label} selected`);
    };
    const windowBefore=app.getWindowFrame(),materialBefore=settings.presentation.windowEffectMaterial.value;
    const applyWindowSettings=async()=>{
      clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
      await waitFor("window settings transaction completed",()=>Boolean(settingsShell&&!settingsShell.applying));
      await present(app,"window settings presentation settled");
    };
    const titlebarBefore=settings.presentation.showCustomTitlebar.value;
    await clickWindowControl("mode-expand");
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
    let rejectPending!:(error:Error)=>void;
    applyingShell.options.apply=()=>new Promise<void>((_resolve,reject)=>{rejectPending=reject;});
    try{
      clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
      assert.ok(applyingShell.applying);
      app.window.requestClose();
      await waitFor("close waits for settings",()=>windowClosing);
      assert.equal(app.state,"running");assert.equal(app.stage.interactiveChildren,false);
      rejectPending(new Error("smoke: settings apply failure must retain the window"));
      await waitFor("failed apply restores window input",()=>!windowClosing&&!applyingShell.applying);
      assert.equal(app.state,"running");assert.equal(app.stage.interactiveChildren,true);
    }finally{applyingShell.options.apply=applyNormally;setStatus("");}
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
    await present(app,"compact cancellation settled");await showCompact();
    const confirmCompact=management.getChildByLabel(`native-action:${t("commands.compact.confirm")}`,true);assert.ok(confirmCompact);
    clickWithNativeInput(confirmCompact);await waitFor("compacted layout saved",()=>!management.modal);
    assert.deepEqual(layoutState.presentation.pages.value.flat().map(item=>item.id),baselinePages.flat().map(item=>item.id));
    assert.equal(layoutState.presentation.pages.value.length,Math.ceil(baselinePages.flat().length/layoutState.presentation.pageSize.value));
    assert.deepEqual((await nativeData.loadLayout())!.pages.map(page=>page.map(item=>item.id)),
      layoutState.presentation.pages.value.map(page=>page.map(item=>item.id)),"saved page boundaries and order must match the compacted layout");
    commitEditedPages(baselinePages);await saves.flush();await present(app,"compact fixture restored");
    console.log("Native settings compact: confirmation, cancellation, item order and persisted layout passed");

    const rowsControl=app.stage.getChildByLabel("native-setting:desktopRows",true);
    assert.ok(rowsControl);
    for(let index=0;index<60&&!rowsControl.children.includes(searchBar.host.focused!);index++)onKey({type:"down",key:"Tab"});
    assert.ok(rowsControl.children.includes(searchBar.host.focused!),"Tab must reveal and focus the desktop row input");
    await present(app,"desktop row focus scroll settled");
    onKey({type:"down",key:"ArrowUp"});
    assert.equal(layoutSettings.draftRows.value,baselineConfig.rows+1,"numeric keyboard handling must reach the shared draft");
    onKey({type:"down",key:"ArrowDown"});
    const increase=rowsControl.getChildByLabel("native-action:+",true);assert.ok(increase);
    clickWithNativeInput(increase);
    assert.equal(layoutSettings.draftRows.value,baselineConfig.rows+1);
    assert.equal(layoutState.captureConfiguration().rows,baselineConfig.rows,"draft edits must not change desktop configuration");
    onKey({type:"down",key:"Escape"});
    assert.equal(settingsShell,null);
    assert.equal(layoutState.captureConfiguration().rows,baselineConfig.rows,"Cancel must retain the committed configuration");
    await present(app,"settings close restores entry hit target");
    clickWithNativeInput(settingsButton);await present(app,"settings reopened");
    const reopenedRows=app.stage.getChildByLabel("native-setting:desktopRows",true);assert.ok(reopenedRows);
    for(let index=0;index<60&&!reopenedRows.children.includes(searchBar.host.focused!);index++)onKey({type:"down",key:"Tab"});
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
    const batchAction=management.getChildByLabel(`native-action:${t("launchpad.batch.toolbarLabel")}`,true);assert.ok(batchAction);
    clickWithNativeInput(batchAction);await present(app,"native selection from context menu");
    assert.equal(editing!.selection.isActive.value,true);
    assert.deepEqual([...editing!.selection.selectedIds.value],["native-layout-icon"]);
    clickWithNativeInput(firstApp);clickWithNativeInput(firstApp);
    const thirdApp=app.stage.getChildByLabel("launchpad-item:native-settings",true);assert.ok(thirdApp);
    clickWithNativeInput(thirdApp,0,1);
    assert.deepEqual([...editing!.selection.selectedIds.value],["native-layout-icon","native-webgpu","native-settings"],"Shift pointer range must include the intermediate app");
    await waitFor("selected pointer range settles",()=>!scene.getMotionSnapshot().active);
    await present(app,"selected pointer range committed");
    const selectionBeforeCancel=[...editing!.selection.selectedIds.value];
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
    assert.ok(toolbarSummary.text.includes(t("launchpad.batch.releaseToCancel")));
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
    assert.ok(toolbarSummary.text.includes(t("launchpad.batch.hiddenCount",{count:3})));
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
    const initialField=searchBar.host.focused;assert.ok(initialField);
    management.form(t("dialogs.appEditor.changeIcon"),[],t("common.actions.cancel"),()=>{});
    assert.equal(management.modal,true,"nested form must retain the parent editing session");
    onKey({type:"down",key:"Escape"});
    assert.equal(searchBar.host.focused,initialField,"closing nested form must restore the parent field focus");
    assert.equal(management.modal,true,"closing nested form must not close its parent");
    onKey({type:"down",key:"Tab",shiftKey:true});
    assert.equal(searchBar.host.focused,null,"reverse Tab from first field must focus the last dialog button");
    onKey({type:"down",key:"Tab"});
    assert.equal(searchBar.host.focused,initialField,"Tab from the last button must wrap to the first field");
    onKey({type:"down",key:"Tab",shiftKey:true});
    onKey({type:"down",key:"Tab",shiftKey:true});
    onKey({type:"down",key:" "});
    assert.equal(management.modal,false,"Space on the focused Cancel button must close the dialog");
    await present(app,"edit dialog cancelled");
    editItem(activePageItems.find(item=>item.id==="native-settings")??null);
    onKey({type:"down",key:"Enter"});
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
    setStatus("");
    await present(app, "the closed native folder");
    await captureSmokeFrame("folder-closed");
    presentCount += 1;

    const initialSize = app.contentSize;
    const initialResizeEvents = resizeEvents;
    const initialSource = app.renderer.view.texture.source;
    const initialBackingWidth = initialSource.pixelWidth;
    const initialBackingHeight = initialSource.pixelHeight;
    adaptiveResizeBaseline = Object.freeze({
      height: initialBackingHeight,
      width: initialBackingWidth,
    });
    const windowFrame = app.window.getFrame();
    app.window.setSize(windowFrame.width + 160, windowFrame.height + 80);
    await waitFor(
      "the native resize event to update the public viewport",
      () => resizeEvents > initialResizeEvents && (
        app.contentSize.width !== initialSize.width || app.contentSize.height !== initialSize.height
      ),
    );
    const liveSize = app.contentSize;
    if (!resizeLiveLogicalObserved) {
      throw new Error("Adaptive resize rebuilt the GPU backing before the live logical resize was observed");
    }
    await waitFor(
      "adaptive resize to settle the GPU backing",
      () => {
        const source = app.renderer.view.texture.source;
        return source.pixelWidth === Math.round(liveSize.width * app.resolution)
          && source.pixelHeight === Math.round(liveSize.height * app.resolution);
      },
    );
    adaptiveResizeBaseline = null;
    resizeSettledBackingObserved = true;
    await present(app, "the resized LaunchPad scene frame");
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
        node.emojiText.resolution !== app.resolution || node.labelText.resolution !== app.resolution
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
      resizeLiveLogicalObserved,
      resizeMode: "adaptive",
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
    await closed;
  }
} finally {
  disposeLaunchFlow();
  sceneDisposed=true;sceneRenderQueued=false;
  desktopBackground.destroy();
  mainShortcut.dispose();
  (settingsShell as NativeSettingsShell|null)?.destroy();
  for(const texture of brandingTextures.values())texture.destroy(true);
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
  scene.destroy();
  app.stage.off("rightclick",onContext);
  management.destroy();
  searchBar.destroy();
  iconTextures.dispose();
  await app.dispose();
  await nativeData.dispose();
}
