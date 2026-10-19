import { NativeLayoutSaveError, nativeErrorFeedback, nativeLaunchErrorFeedback, nativeShortcutErrorMessage, type NativeErrorOperation } from "../nativeErrorFeedback.js";
import { createNativeHotCorners } from "../nativeHotCorners.js";
import { nativeHotCorners } from "../nativeHotCornersLibrary.js";
import {NativeNewAppsButton} from "../../rendering/native/NativeNewAppsButton.js";
import {createNativeOnboarding} from "../../rendering/native/NativeOnboarding.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
AlphaFilter,
Container,
Text,
type FederatedPointerEvent,
type Sprite
} from "pixi.js";
import {
NativeGlobalShortcut,
nativeHost,
NativeTray,openNativePath,openNativeExternalUrl,
readNativeSystemPreferences,
subscribeNativeSystemPreferences,
type NativePixiApplication
} from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { readErrorMessage } from "../../application/errorMessage.js";
import { createLaunchpadApps } from "../../application/launchpadApps.js";
import { createLaunchpadLaunchFlow } from "../../application/launchpadLaunchFlow.js";
import { createLaunchpadNotices } from "../../application/launchpadNotices.js";
import { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { createLayoutSaveQueue } from "../../application/layoutSaveQueue.js";
import { createNativeStateHost } from "../../application/stateHost.js";
import { resolveAppearancePreference } from "../../domain/appearancePreference.js";
import { findFocusedIcon,firstIconFocus,type LaunchpadIconScope } from "../../domain/iconFocus.js";
import type { LaunchpadApp,LaunchpadPages,ReadonlyLaunchpadApp } from "../../domain/launchpadLayout.js";
import { createAppSearchIndex } from "../../domain/launchpadSearch.js";
import type { LayoutDocument } from "../../domain/layoutDocument.js";
import { normalizeMainWindowShortcut } from "../../domain/mainWindowShortcut.js";
import { createLocaleRuntimePort } from "../../platform/localeRuntime.js";
import { PRODUCT } from "../../platform/product.js";
import { snapshotContractValue } from "../../rendering/contractSnapshot.js";
import { NativeAppDialogs } from "../../rendering/native/NativeAppDialogs.js";
import { NativeBackground } from "../../rendering/native/NativeBackground.js";
import { createNativeBrandingTextures } from "../../rendering/native/nativeBrandingTextures.js";
import { chooseNativeColor } from "../../rendering/native/nativeColorPicker.js";
import { collectDesktopPreparationItems } from "../../rendering/native/nativeDesktopPreparation.js";
import { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import {
createNativeFolderFlow
} from "../../rendering/native/nativeFolderFlow.js";
import { NativeFolderNameInput,type SingleStageFolderTitleFrame } from "../../rendering/native/NativeFolderNameInput.js";
import { createNativeIconTextureRepository } from "../../rendering/native/nativeIconTextureLoader.js";
import { fadeNativeLaunchpadChrome,NativeLaunchGhost } from "../../rendering/native/NativeLaunchGhost.js";
import { NativeManagement } from "../../rendering/native/NativeManagement.js";
import { NativeNotice } from "../../rendering/native/NativeNotice.js";
import { resolveNativePointerTarget } from "../../rendering/native/nativePointerTarget.js";
import { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import { NativeSelectionToolbar } from "../../rendering/native/NativeSelectionToolbar.js";
import { NativeSettingsButton } from "../../rendering/native/NativeSettingsButton.js";
import { createNativeTextPrewarm } from "../../rendering/native/nativeTextPrewarm.js";
import { configureNativeTextResolution,setNativeUiFontFamily } from "../../rendering/native/nativeTypography.js";
import { NativeWindowChrome } from "../../rendering/native/NativeWindowChrome.js";
import type { SceneFocusedIcon,SceneItem } from "../../rendering/sceneFrame.js";
import type { NativeFrameProof,NativeHostLifecycleProof } from "../diagnostics/nativeProofTypes.js";
import { createNativeCatalogPort } from "../nativeCatalogPort.js";
import { nativeClipboard } from "../nativeClipboard.js";
import { createNativeCloseCoordinator } from "../nativeCloseCoordinator.js";
import { normalizeNativeCustomIcon } from "../nativeCustomIcon.js";
import {
NativeDataHost,
type NativeCatalogScanResult,
} from "../nativeDataHost.js";
import { NativeLaunchError } from "../nativeDataProtocol.js";
import { createNativeEditing } from "../nativeEditing.js";
import { loadNativeLayoutWithRetry } from "../nativeLayoutLoad.js";
import { setNativeLocale,t } from "../nativeLocalization.js";
import { prepareNativeRestart } from "../nativeRestart.js";
import { createNativeResumeTiming } from "../nativeResumeTiming.js";
import { logNativeRuntime,nativeLogDirectory,nativeLogPath } from "../nativeRuntimeLog.js";
import { createNativeSceneScheduler } from "../nativeSceneScheduler.js";
import { type NativeSession } from "../nativeSession.js";
import { createNativeShortcut } from "../nativeShortcut.js";
import { createNativeFrameCallbacks } from "../nativeFrameCallbacks.js";
import { createNativeLiveDesktop } from "../nativeLiveDesktop.js";
import {
createNativeLayoutState,
getNativeActivePageItems,
makeNativeStartupFrame,
makeNativeStartupScanRequest,
setNativeDesktopPage,
type NativePageTurn,
} from "../nativeStartup.js";
import { createNativeStartupPreparation } from "../nativeStartupPreparation.js";
import { nativeCatalogCacheKey } from "../nativeCatalogCache.js";
import { createNativeCatalogRefresh } from "../nativeCatalogRefresh.js";
import { nativeCatalogContentKey } from "../nativeCatalogIdentity.js";
import { normalizeNativeApp } from "../../domain/launchpadData.js";
import { createLaunchpadTray } from "../nativeTray.js";
import { createNativeWindowEffects } from "../nativeWindowEffects.js";
import { type NativeMode } from "../product/nativeEntryMode.js";
import type { NativeIconNode } from "../product/nativeIconNode.js";
import { createNativeInputRouter,type NativeInputRouter,type NativePageTrackScrub } from "../product/nativeInputRouter.js";
import { createNativeKeyboardRouter } from "../product/nativeKeyboardRouter.js";
import { createNativeSceneController } from "../product/nativeSceneController.js";
import { present,waitFor } from "../product/nativeScenePresentation.js";
import { createNativeSettingsController } from "../product/nativeSettingsController.js";
import { collectTextureItems } from "../product/nativeTextureItems.js";
import { createNativeVisibilityController } from "../product/nativeVisibilityController.js";

// Supplied by both the Electrobun and optional bytecode build pipelines.
declare const __LUMERIA_DIAGNOSTICS__: boolean;

export async function runNativeProduct(
  nativeData: NativeDataHost,
  app: NativePixiApplication,
  session: NativeSession,
  nativeMode: NativeMode,
  smoke: typeof import("../nativeSmokeSupport.js") | null,
): Promise<void> {
let startupPhaseAt=performance.now();
const startupPhase=(phase:string)=>{const now=performance.now();logNativeRuntime("startup-phase",{phase,ms:now-startupPhaseAt});startupPhaseAt=now;};
const NATIVE_BACKGROUND = [9, 11, 20, 255] as const;
app.stage.label = "launchpad-native-stage";
// Creation is hidden; retry notices explicitly reveal it when action is needed.
app.window.hide();
const resumeTiming=__LUMERIA_DIAGNOSTICS__?createNativeResumeTiming(sample=>logNativeRuntime("resume-timing",sample)):null;
let diagnosticBackground:Partial<ReturnType<typeof backgroundConfig>>={};
const productDiagnostics=__LUMERIA_DIAGNOSTICS__? (await import("../diagnostics/nativeProductDiagnostics.js")).createNativeProductDiagnostics({
  background:{
    getState:()=>({committed:backgroundConfig(),preview:diagnosticBackground}),
    preview:async patch=>{
      const next={...diagnosticBackground};
      const map={source:"backgroundSource",effect:"backgroundEffect",blurStrength:"backgroundBlurStrength",darkenColor:"backgroundDarkenColor",darkenStrength:"backgroundDarkenStrength",liveDesktopOpacity:"backgroundLiveDesktopOpacity"} as const;
      for(const [key,value] of Object.entries(patch)){
        const field=map[key as keyof typeof map];if(!field)throw new Error("Unsupported background preview property");
        Object.assign(next,{[field]:value});
      }
      const config={...backgroundConfig(),...next};
      if(config.backgroundSource==="windowsLiveDesktop"&&!liveDesktop.enabled)throw new Error("Live Desktop experiment is disabled");
      liveDesktop.sync(config,systemAppearance);
      await desktopBackground.configure(config,app.contentSize.width,app.contentSize.height,undefined,systemAppearance);
      diagnosticBackground=next;return config;
    },
    restore:async()=>{diagnosticBackground={};if(app.state!=="closing"&&app.state!=="closed")await refreshBackground();},
  },
  layout:{getState:()=>({viewport:{width:app.contentSize.width,height:app.contentSize.height,rows:currentFrame.viewport.gridRows,columns:currentFrame.viewport.gridCols,iconSize:currentFrame.viewport.iconSize},geometry:scene.getMotionSnapshot()}),
    preview:()=>{throw new Error("Use the Native scene inspector and hit-test for layout debugging; Web CSS overrides do not apply");},restore:()=>{}},
  liveDesktop:{getState:()=>({enabled:liveDesktop.enabled,loaded:liveDesktop.loaded,support:liveDesktop.support.value,status:liveDesktop.poll()})},
}):null;
const resumeRenderObserver={prerender:()=>resumeTiming?.mark("renderStart"),postrender:()=>resumeTiming?.mark("renderEnd")};
let timedRenderer=app.renderer;
const unbindResumeRenderer=()=>{
  // Device recovery destroys the old runners before emitting `recovered`.
  for(const runner of [timedRenderer.runners.prerender,timedRenderer.runners.postrender]){
    if(runner?.items)runner.remove(resumeRenderObserver);
  }
};
const bindResumeRenderer=()=>{
  unbindResumeRenderer();
  timedRenderer=app.renderer;timedRenderer.runners.prerender.add(resumeRenderObserver);timedRenderer.runners.postrender.add(resumeRenderObserver);
};
bindResumeRenderer();
const offResumePrepare=app.beforeRender(()=>{resumeTiming?.mark("prepareCallbacksReached");});
configureNativeTextResolution(app.resolution,app.stage);
let loadedLayout: LayoutDocument | null;
let catalogResult!: NativeCatalogScanResult;
let startupLoadRecovered=false;
let startupCatalogCached=false;
try {
  await nativeData.connect();
  startupPhase("data-connect");
  if(__LUMERIA_DIAGNOSTICS__&&process.env.LAUNCHPAD_TARGET_ACTIONS_PROOF){
    process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR=process.env.LAUNCHPAD_TARGET_ACTIONS_PROOF;
    const recoverySmoke=await import("../diagnostics/nativeStartupSmoke.js");
    const support=await import("../nativeSmokeSupport.js");
    await recoverySmoke.verifyNativeRecoveryPanel({app,waitFor,present:name=>present(app,name),click:target=>support.clickWithNativeInput(app,target),capture:name=>support.captureSmokeFrame(app,name)});
  }
  // Diagnostic scenarios are loaded only in diagnostic builds; the compile-time
  // flag keeps them out of the production bundle.
  const startupSmoke=(__LUMERIA_DIAGNOSTICS__&&nativeMode==="smoke")?await import("../diagnostics/nativeStartupSmoke.js"):null;
  if(startupSmoke){
    await startupSmoke.verifyNativeStartupCancellation({app,waitFor,present:description=>present(app,description),click:clickWithNativeInput,capture:name=>smoke!.captureSmokeFrame(app,name)});
  }
  let loadAttempts=0;
  let layoutReadFailed=true;
  const loading=loadNativeLayoutWithRetry(app,async()=>{
    layoutReadFailed=true;
    if(startupSmoke&&startupSmoke.shouldInjectNativeStartupLoadFailure(++loadAttempts))throw new Error("smoke: layout read temporarily unavailable");
    const layout=await nativeData.loadLayout();
    startupPhase("layout-read");
    layoutReadFailed=false;
    const request=makeNativeStartupScanRequest(layout);
    const startupScanRequest={...request,roots:layout?.settings.importState.completed?request.roots:[]};
    const cached=nativeMode!=="smoke"&&layout?.settings.importState.completed
      ?await nativeData.cachedCatalog(startupScanRequest.roots,request.filters):null;
    startupCatalogCached=cached!==null;
    catalogResult=cached??await nativeData.scanApps(startupScanRequest.roots,request.filters);
    logNativeRuntime("startup-catalog",{cached:startupCatalogCached,apps:catalogResult.apps.length});
    startupPhase("catalog-scan");
    if(catalogResult.warnings.length||catalogResult.stats.limitReached)throw new Error(t("imports.partial"));
    return layout;
  },{reveal:()=>nativeData.revealLayout(),reset:()=>nativeData.backupResetLayout(),canReset:()=>layoutReadFailed});
  if(startupSmoke){
    await startupSmoke.driveNativeStartupRetryNotices({app,waitFor,present:description=>present(app,description),click:clickWithNativeInput,capture:name=>smoke!.captureSmokeFrame(app,name),loadAttempts:()=>loadAttempts});
  }
  const result=await loading;
  if(result.cancelled)return;
  loadedLayout=result.layout;startupLoadRecovered=result.recovered;

} catch (error) {
  throw error;
}
setNativeLocale(loadedLayout?.settings.localePreference ?? Intl.DateTimeFormat().resolvedOptions().locale);
// A retry notice may have revealed the window. Resume hidden preparation after a successful load.
const loginStartup=process.env.LUMERIA_LAUNCH_ORIGIN==="login";
app.window.hide();
let startupPreparation:ReturnType<typeof createNativeStartupPreparation>|null=null;
let catalogRefresh:ReturnType<typeof createNativeCatalogRefresh<{result:NativeCatalogScanResult;revision:number}>>|null=null;
let offCatalogCompleted=()=>{};
let appliedCatalogKey="";
// System preferences are read before the settings controller so its initial
// background profile matches the real appearance; the controller must not
// observe an eager default that later changes.
const systemPreferences=readNativeSystemPreferences();
setNativeUiFontFamily(systemPreferences.ok?systemPreferences.value.uiFontFamily:null);
let systemAppearance=systemPreferences.ok?systemPreferences.value.appearance:"dark";
const needsOnboarding=!loadedLayout||!loadedLayout.settings.importState.completed;
const layoutState = createNativeLayoutState(loadedLayout, needsOnboarding?[]:catalogResult.apps);
// The controller is constructed before its later collaborators exist. Every
// later collaborator is read through a lazy closure. The initial panel profile
// reads systemAppearance, which is initialized above.
let commitEditedPagesForSettings: (pages: LaunchpadPages) => void;
const nativeSettings=createNativeSettingsController({
  app,
  brandingTextures:()=>brandingTextures,
  cancelNativeGesture:()=>cancelNativeGesture(),
  chooseColor:initial=>chooseNativeColor(management,initial),
  chromeInset:()=>chromeInset(),
  closeFolder:()=>closeFolder(),
  commitEditedPages:pages=>commitEditedPagesForSettings(pages),
  desktopBackground:()=>desktopBackground,
  editItem:item=>editItem(item),
  getApps:()=>apps,
  getEditing:()=>editing,
  getIconTextures:()=>iconTextures,
  getManagement:()=>management,
  getSaves:()=>saves,
  getSearchBar:()=>searchBar,
  getSettingsButton:()=>settingsButton,
  getSystemAppearance:()=>systemAppearance,
  getTray:()=>tray,
  layoutState:()=>layoutState,
  mainShortcut:()=>mainShortcut,
  onApplied:config=>{
    currentFrame=Object.freeze({...currentFrame,viewport:Object.freeze({...currentFrame.viewport,
      gridRows:config.rows,gridCols:config.cols,iconSize:config.iconSize,
    }),interaction:Object.freeze({...currentFrame.interaction,isTextlessMode:settings.layoutSettings.isTextlessModeState.value})});
  },
  refreshBackground:()=>refreshBackground(),
  syncLiveDesktop:()=>syncLiveDesktop(),
  openLogs:()=>{if(!openNativePath(nativeLogDirectory))reportNativeError(new Error("Could not open logs folder"),"logs");},
  openExternalUrl:url=>{if(!openNativeExternalUrl(url))throw new Error("Could not open the default browser");},
  requestSceneRender:()=>requestSceneRender(),
  settings:()=>settings,
  settingsTheme:()=>settingsTheme(),
  t,
});
const settingsNavigation=nativeSettings.navigation;
const appsPageState=nativeSettings.appsPageState;
const windowPanelState=nativeSettings.windowPanelState;
const backgroundPanelState=nativeSettings.backgroundPanelState;
const openSettings=()=>nativeSettings.open();
const closeSettings=()=>nativeSettings.close();
let apps:ReturnType<typeof createLaunchpadApps>|null=null;
let appDialogs:NativeAppDialogs|null=null;
let refreshTargetChecks: (force?: boolean) => Promise<void> = async()=>{};
let refreshOneTarget: (id:string,force?:boolean)=>Promise<void> = async()=>{};
let saveFailed=(error:unknown)=>{logNativeRuntime("save-error",String(error));},saveRecovered=()=>{};
const saves = createLayoutSaveQueue(async document=>{try{await nativeData.saveLayout(document);saveRecovered();}catch(error){const failure=new NativeLayoutSaveError(error);saveFailed(error);throw failure;}});
let currentFrame = makeNativeStartupFrame(loadedLayout, catalogResult.apps, layoutState.presentation.pages.value);
let activePageItems = getNativeActivePageItems(currentFrame);
let searchQuery = "";
let launchFlow:ReturnType<typeof createLaunchpadLaunchFlow>|null=null;
let dismissLaunchpad=()=>{};
let showLaunchpad=()=>{};
let disposeLaunchFlow=()=>{};
let tray:ReturnType<typeof createLaunchpadTray>|null=null;
const folderLayout = Object.freeze({
  get cols(){return layoutState.presentation.folderCols.value;},
  get iconSize(){return layoutState.presentation.folderIconSizeMode.value==="custom"
    ?layoutState.presentation.folderIconSize.value:layoutState.presentation.iconSize.value;},
  get rows(){return layoutState.presentation.folderRows.value;},
});

let hotCornerActivate: (point:{x:number;y:number},toggle:boolean)=>void=()=>{};
const hotCorners=createNativeHotCorners(nativeHotCorners,event=>{logNativeRuntime("hot-corner-trigger",event);hotCornerActivate(event,event.toggle);},error=>logNativeRuntime("hot-corner-error",String(error)));
let toggleLaunchpad=()=>{};
let shortcutLaunchpad=()=>{};
const mainShortcut=createNativeShortcut(NativeGlobalShortcut,()=>{
  logNativeRuntime("shortcut",{state:app.state,visible:app.window.isVisible(),minimized:app.window.isMinimized()});
  try{shortcutLaunchpad();}catch(error){logNativeRuntime("shortcut-error",error);}
});
let refreshWindowChrome=()=>{};
const branding=createNativeBrandingTextures(join(import.meta.dir,"branding"),()=>{refreshWindowChrome();nativeSettings.redraw();app.invalidate();});
await branding.synchronize(app.resolution);
startupPhase("state-branding");
const brandingTextures=branding.textures;
const windowEffects=createNativeWindowEffects({
  apply:(material,appearance)=>app.setWindowPresentation(material,appearance),
  visible:()=>app.state==="running"&&app.window.isVisible()&&!app.window.isMinimized(),
  onError:error=>logNativeRuntime("window-effects-reapply-error",readErrorMessage(error)),
});
const settingsTheme=()=>resolveAppearancePreference(settings.draft.settingsThemePreference.value,systemAppearance);
const liveDesktop=createNativeLiveDesktop({enabled:process.env.LUMERIA_EXPERIMENTAL_LIVE_DESKTOP==="1",
  load:async()=>(await import("../nativeLiveDesktopLibrary.js")).requestNativeLiveDesktop,
  windowHandle:()=>app.nativeSurfaceHandle,visible:()=>app.window.isVisible()&&!app.window.isMinimized()});
await liveDesktop.initialize().catch(error=>logNativeRuntime("live-desktop-support-error",error));
const settings=createLaunchpadSettings({
  layout:layoutState,isDragActive:()=>editing?.drag.isDragActive()??false,localizationText:{t},
  autostartPort:{isAvailable:()=>nativeData.autostartAvailable,getStatus:()=>nativeData.autostart(),setEnabled:value=>nativeData.autostart(value)},
  localeRuntime:createLocaleRuntimePort({getSystemLanguages:()=>[Intl.DateTimeFormat().resolvedOptions().locale]}),
  activateLocale:state=>{setNativeLocale(state.resolvedLocale);searchBar.setPlaceholder(t("launchpad.search.placeholder"));tray?.refresh();},
  launchpadIconPort:{isAvailable:()=>app.supportsWindowIcon,applyVariant:async variant=>{
    app.setWindowIcon(readFileSync(join(import.meta.dir,"branding",variant+".png")));return variant;
  }},
  liveDesktopSupport:liveDesktop.support,
  isLiveDesktopEnabled:()=>liveDesktop.enabled,
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
  mainWindow:{support:{value:{...app.windowMaterialSupport,platform:"windows"}},
    registerShortcut:async value=>{
      const outcome=mainShortcut.apply(value);if(outcome.ok)return outcome;
      logNativeRuntime("shortcut-error",readErrorMessage(outcome.error));
      return {ok:false,error:new Error(nativeShortcutErrorMessage(outcome.error),{cause:outcome.error})};
    },applyHotCorners:config=>hotCorners.apply(config),
    setMode:request=>{
      app.setWindowMode(request.mode,request.fullscreenOverscanEnabled?1:0);return {ok:true};
    },
    setEffectsEnabled:request=>{
      windowEffects.set(request.enabled?request.material:"none",resolveAppearancePreference(request.appearance,systemAppearance));return {ok:true};
    }},
},createNativeStateHost(()=>{}));
settings.persistence.restore(loadedLayout?.settings??{});
const applySavedWindowIcon=()=>app.setWindowIcon(readFileSync(join(import.meta.dir,"branding",settings.presentation.launchpadIconVariant.value+".png")));
applySavedWindowIcon();
const layoutSettings=settings.layoutSettings;
const desktopBackground=new NativeBackground(app,()=>app.invalidate());
app.stage.addChildAt(desktopBackground,0);
const backgroundConfig=()=>({...loadedLayout?.settings,...settings.persistence.capture()});
const syncLiveDesktop=()=>liveDesktop.sync(backgroundConfig(),systemAppearance);
const refreshBackground=async()=>{
  try{syncLiveDesktop();}
  catch(error){
    await desktopBackground.configure({...backgroundConfig(),backgroundSource:"systemMaterial"},app.contentSize.width,app.contentSize.height,undefined,systemAppearance);
    throw error;
  }
  await desktopBackground.configure(backgroundConfig(),app.contentSize.width,app.contentSize.height,undefined,systemAppearance);
};
const chromeInset=()=>Math.max(app.contentSize.width<=760?14:20,app.windowMode==="fullscreen"?0:settings.presentation.showCustomTitlebar.value?56:24);
let changeSearch: (query: string, deferScene?:boolean) => void;
const searchBar = new NativeSearchBar(app, loadedLayout?.settings.localePreference === "en-US" ? "Search" : t("launchpad.search.placeholder"), query => changeSearch(query), nativeClipboard);
const folderNameInput = new NativeFolderNameInput(searchBar.host, (id, name) => editing!.renameFolder(id, name), () => app.invalidate());
app.stage.addChild(folderNameInput);
const management = new NativeManagement(searchBar.host, () => app.contentSize, () => app.invalidate(),
  settingsTheme);

const iconTextures = createNativeIconTextureRepository(app);
function reportNativeError(error:unknown,operation:NativeErrorOperation="runtime"):void {
  logNativeRuntime("error",{operation,message:readErrorMessage(error),cause:error instanceof Error?String(error.cause??""):""});
  const feedback=nativeErrorFeedback(error,operation);if(!feedback)return;
  if(startupPreparation?.pending){startupPreparation.activate();app.window.show();app.window.activate();}
  notices.showTransientNotice(feedback);
}



function clickWithNativeInput(target: Container, button=0, modifiers=0): void {
  smoke!.clickWithNativeInput(app, target, button, modifiers, (__LUMERIA_DIAGNOSTICS__ && nativeMode === "smoke"));
}

const inputFrames=createNativeFrameCallbacks(()=>app.invalidate());
const sceneUpdates = createNativeSceneScheduler(task=>{inputFrames.request(task);});
const renderScene = sceneUpdates.run;
const requestSceneRender = (snap = false) => { sceneUpdates.request(snap); catalogRefresh?.notifyReady(); };
let prepareSearchInput=()=>{};
let newAppsFocused=false;
const offInputFrame=app.beforeRender(()=>{inputFrames.flush();sceneUpdates.flush();prepareSearchInput();catalogRefresh?.notifyReady();});
let lastFolderPresentation:ReturnType<ReturnType<typeof createNativeFolderFlow>["snapshot"]>|null=null;
let folderNamePresentationItem:Readonly<{id:string;name?:string}>|null=null;
let folderNamePresentationBlocked=false;
const folderFlow = createNativeFolderFlow(presentation => {
  if(!presentation.renderedFolder && editing?.rollback.presentation.value?.phase === "closing") {
    editing.rollback.beginDissolve(editing.rollback.presentation.value.folderId);
  }
  const previous=lastFolderPresentation;
  lastFolderPresentation=presentation;
  if(previous&&previous.renderedFolder===presentation.renderedFolder
    &&previous.folderPageIndex===presentation.folderPageIndex&&previous.isClosing===presentation.isClosing
    &&previous.openProgressTarget===presentation.openProgressTarget&&previous.openingCancelRequest===presentation.openingCancelRequest){
    scene.presentFolderProgress(presentation.openProgress);
    folderNameInput.update(folderNamePresentationItem,presentation.openProgress,folderNamePresentationBlocked);
    app.invalidate();
  }else requestSceneRender();
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
  folderNameInput.cancelRename();
  if (!folderFlow.close()) return false;
  setFocusedIcon(null);
  return true;
}

function setFolderPageIndex(pageIndex: number, options?: { allowCreate?: boolean }): boolean {
  if (!folderFlow.setPageIndex(pageIndex, options)) return false;
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
  if(apps?.nativeIntegration.getTargetDetails(item.id)?.status === "missing") await refreshOneTarget(item.id,true);
  if(apps?.nativeIntegration.getTargetDetails(item.id)?.status === "missing") {
    management.warning({title:t("launchpad.target.missingTitle"),message:t("launchpad.target.missingMessage"),confirmText:t("common.actions.edit"),cancelText:t("launchpad.target.recheck"),
      onConfirm:()=>editItem(item),onCancel:()=>{void refreshOneTarget(item.id,true);}});
    return;
  }
  launchFlow?.openApp(item as ReadonlyLaunchpadApp);
}

let onDesktopPageIndexCommit: (index: number) => void;
let editing: ReturnType<typeof createNativeEditing> | null = null;
function editItem(item: SceneItem | null): void {
  const appItem = item && layoutState.operations.collectAppsFromPages(layoutState.presentation.pages.value).find(app => app.id === item.id);
  if(item?.type === "folder") {
    if (editing?.drag.isDragActive()) return;
    folderNameInput.requestRename(item.id);
    folderFlow.open(item);
    setFocusedIcon(null);
    requestSceneRender();
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
  management.warning({title:t("settings.apps.manager.remove"),message:t("launchpad.batch.removeMessage",{count:ids.length}),intent:"warning",cancelText:t("common.actions.cancel"),confirmText:t("launchpad.batch.remove"),confirmAppearance:"outline",confirmTone:"danger",onConfirm:()=>{
    management.close(true);
    if(apps)apps.removeManagedAppsFromLaunchpad(ids);
    const folders=ids.filter(id=>layoutState.operations.findFolder(layoutState.presentation.pages.value,id));
    if(folders.length)editing!.remove(folders);
    // The save queue reports failures through the persistent retry notice.
    void saves.flush().catch(()=>{});
  }});
}
let preserveViewAfterLocation=()=>{};
function contextMenu(item:SceneItem|null,x:number,y:number):void{
  const folder = folderFlow.snapshot();
  // Closing retains renderedFolder for animation, but no menu may use that retiring scope.
  // Both stage right-clicks and menu relocation requests pass through this entry.
  if (folder.isClosing) return;
  const scope=getCurrentIconScope();
  const check=item?.type==="app"?apps?.nativeIntegration.getLaunchTargetCheck(item.id):undefined;
  const initialDetails=item?apps?.nativeIntegration.getTargetDetails(item.id):undefined;
  const filesystem=check&&["executable","shortcut"].includes(check.launchTarget.kind);
  const showAdmin=filesystem||initialDetails?.canElevate;
  const showShortcut=initialDetails?.shortcutLocation||check?.launchTarget.kind==="shortcut"
    ||[check?.launchTarget.path,...(check?.fallbackPaths??[])].some(path=>path?.toLowerCase().endsWith(".lnk"));
  const appItem=item?apps?.nativeIntegration.getManagedApp(item.id):undefined;
  const buildActions=()=>{
    const actions:import("../../rendering/native/NativeManagement.js").NativeMenuAction[]=[];
    const beginBatch=()=>{editing!.alt.cancelAltEditMode();editing!.selection.begin({});};
    if(item){
      const details=apps?.nativeIntegration.getTargetDetails(item.id);
      actions.push({label:t("common.actions.open"),disabled:details?.status==="missing",icon:item.type==="folder"?"folder-open-20-regular":"open-20-regular",run:()=>{void activateItem(item);}});
      if(item.type==="app"){
        if(showAdmin)actions.push({label:t("launchpad.target.runAsAdmin"),icon:"shield-20-regular",disabled:!details?.canElevate||details.status==="missing",run:()=>{void (async()=>{
          await refreshOneTarget(item.id,true);
          const latest=apps?.nativeIntegration.getTargetDetails(item.id);if(latest?.status==="missing"){await activateItem(item);return;}
          if(!latest?.canElevate)throw new Error(t("launchpad.target.adminUnavailable"));
          launchFlow?.openApp(item as ReadonlyLaunchpadApp,undefined,true);
        })().catch(error=>{if(!(error instanceof NativeLaunchError&&error.kind==="cancelled"))reportNativeError(error,"launch");});}});
        const reveal=async(path:string,folder=false)=>{await saves.flush();await nativeData.revealPath(path,folder);preserveViewAfterLocation();launchFlow?.closeDesktop({clearSearch:false});};
        actions.push({label:t(details?.locationIsFolder?"launchpad.target.openFolder":"launchpad.target.openLocation"),icon:"folder-open-20-regular",disabled:!details?.fileLocation,run:()=>{if(details?.fileLocation)void reveal(details.fileLocation,details.locationIsFolder).catch(error=>reportNativeError(error,"location"));}});
        if(showShortcut)actions.push({label:t("launchpad.target.openShortcutLocation"),icon:"folder-link-20-regular",disabled:!details?.shortcutLocation,run:()=>{if(details?.shortcutLocation)void reveal(details.shortcutLocation).catch(error=>reportNativeError(error,"location"));}});
        actions.push({label:t("launchpad.target.recheck"),icon:"arrow-sync-20-regular",run:()=>{void refreshOneTarget(item.id,true);}});
      }
      actions.push({label:t(item.type==="folder"?"common.actions.rename":"common.actions.edit"),icon:item.type==="folder"?"rename-20-regular":"edit-20-regular",run:()=>editItem(item)});
      if(item.type==="folder")actions.push({label:t("launchpad.contextMenu.dissolve"),icon:"folder-arrow-right-20-regular",separatorBefore:true,danger:true,run:()=>editing!.pageCommands.confirmDissolveFolder(item.id)});
      else {
        actions.push({label:t("launchpad.contextMenu.remove"),icon:"delete-20-regular",separatorBefore:true,run:()=>apps!.removeManagedAppFromLaunchpad(item.id)});
        if(appItem&&apps!.canExcludeManagedAppFromScan(appItem))actions.push({label:t("launchpad.contextMenu.exclude"),icon:"delete-dismiss-20-regular",danger:true,run:()=>apps!.excludeManagedAppFromScan(appItem)});
      }
    }else{
      actions.push({label:t("launchpad.contextMenu.batchManage"),icon:"select-all-on-20-regular",run:beginBatch});
      if(!folder.renderedFolder){
        actions.push({label:t("settings.interface.layout.compactAction"),icon:"arrow-sort-20-regular",separatorBefore:true,run:()=>editing!.pageCommands.confirmForceFillAllPages()});
        if(apps?.canScanManagedApps.value)actions.push({label:t(apps.isScanningApps.value?"settings.apps.manager.scanning":"settings.apps.manager.scanApps"),icon:"scan-object-20-regular",disabled:apps.isScanningApps.value,run:()=>{void apps!.rescanManagedApps({announceStart:true});}});
        if(apps&&!apps.presentation.importState.value.completed)actions.push({label:t("imports.restoreInitial"),icon:"settings-20-regular",run:()=>onboarding?.open()});
        if(apps?.imports.canUndo)actions.push({label:t("imports.undo"),icon:"arrow-counterclockwise-20-regular",run:()=>{apps!.imports.undo();void saves.flush().catch(()=>{});}});
        actions.push({label:t("launchpad.openSettings"),icon:"settings-20-regular",separatorBefore:Boolean(apps?.canScanManagedApps.value),run:()=>openSettings()});
      }
    }
    return actions;
  };
  const menu=management.menu(x,y,buildActions());
  if(menu&&item?.type==="app")void refreshOneTarget(item.id).then(()=>{
    if(sceneUpdates.disposed||folderFlow.snapshot().isClosing)return;
    const current=getCurrentIconScope();
    if(current.area!==scope.area||current.folderId!==scope.folderId||current.pageIndex!==scope.pageIndex
      ||!current.items.some(candidate=>candidate.id===item.id)
      ||apps?.nativeIntegration.getLaunchTargetCheck(item.id)?.targetSignature!==check?.targetSignature)return;
    menu.update(buildActions());
  });
}
async function updateIcon(item:SceneItem, reset:boolean):Promise<void> {
  if(!reset){apps?.openExistingAppIconChooser(item.id);appDialogs?.sync();return;}
  if(!apps?.managedApps.value.some(app=>app.id===item.id))throw new Error("Application no longer exists");
  apps.updateAppCustomIcon(item.id,null);await saves.flush();
  iconTextures.retainLayout(collectTextureItems(currentFrame,layoutState.presentation.pages.value),collectDesktopPreparationItems(currentFrame.viewport.activePages,currentFrame.viewport.folderPageSize));
  const updated=collectTextureItems(currentFrame).find(candidate=>candidate.id===item.id);
  if(updated)await iconTextures.prepareItems([updated]);
  const result=iconTextures.snapshot();
  if(result.failed.length)throw new Error("Icon loading failed");
  requestSceneRender();
}
let poolPrewarmFrame:number|null=null;
const scene = new NativeDesktopScene(app.stage, {
  onDesktopPageIndexCommit: index => onDesktopPageIndexCommit(index),
  folderLayout,
  iconTextures,
  onFolderCloseRequest: closeFolder,
  onFolderTitleFrameChange: frame => folderNameInput.setFrame(frame as SingleStageFolderTitleFrame | null),
  onFolderReopenRequest: (folderId) => {
    const item = currentFrame.viewport.activePages.flat().find((item) => item?.id === folderId);
    if (item) void activateItem(item);
  },
  onFolderInternalActivityChange: (active, folderId) => {
    folderFlow.notifyInternalActivity(active, folderId);
  },
  onFolderPageIndexCommit: setFolderPageIndex,
  onFolderRenderRequest: reason=>{
    if(reason==="group-release-pool-prewarm"){
      if(poolPrewarmFrame===null)poolPrewarmFrame=inputFrames.request(()=>{
        poolPrewarmFrame=null;scene.requestLayerUpdate(reason);requestSceneRender();
      });
    }else{scene.requestLayerUpdate(reason);requestSceneRender();}
  },
  onIconActivate: (item) => void activateItem(item),
  onGroupReleaseComplete: result => editing?.complete(result),
  onRollbackComplete: token => {editing?.rollback.complete(token);},
  onIconEditAction:(action,item)=>{
    if(action==="remove")removeItems([item.id]);
    else if(action==="choose-icon" || action==="reset-icon")void updateIcon(item,action==="reset-icon").catch(error=>reportNativeError(error,"icons"));
  },
});
const textPrewarm=createNativeTextPrewarm({renderer:()=>timedRenderer,
  canRun:()=>app.state==="running"&&(app.window.isVisible()||Boolean(startupPreparation?.canPrepareHidden))&&!app.window.isMinimized(),
  onError:error=>logNativeRuntime("text-prewarm-error",String(error))});
startupPreparation=createNativeStartupPreparation(loginStartup,{
  start:()=>{textPrewarm.prioritize(currentFrame.viewport.activePageIndex,currentFrame.viewport.activePageIndex);textPrewarm.start();iconTextures.startBackground();},
  ready:()=>{const text=textPrewarm.snapshot();return (!text.enabled||text.pending===0)&&!iconTextures.isPreparing();},
  reveal:()=>{if(app.state!=="running")return;app.window.show();app.window.activate();windowEffects.refresh();prepareSearchInput();app.invalidate();},
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
// Older/unsupported native surfaces still need an intermediate. Prefer direct
// regional backdrop copies only when an acquired texture reports COPY_SRC.
const selectionBackdropSurface=new AlphaFilter({alpha:1,resolution:"inherit",antialias:"inherit"});
app.stage.addChild(selectionToolbar);
app.stage.on("pointerdowncapture",event=>{let node=event.target as Container|null;while(node&&node!==selectionToolbar)node=node.parent;if(!node)selectionToolbar.clearFocus();});
const settingsButton=new NativeSettingsButton(()=>openSettings(),()=>app.invalidate());
app.stage.addChild(settingsButton);
let onboarding:ReturnType<typeof createNativeOnboarding>|null=null;
const newAppsButton=new NativeNewAppsButton(()=>{if(management.modal)return;if(apps&&!apps.presentation.importState.value.completed)onboarding?.open();else appDialogs?.recent();},()=>app.invalidate());app.stage.addChild(newAppsButton);
const windowChrome=new NativeWindowChrome(app,error=>reportNativeError(error,"window"),()=>brandingTextures.get(settings.presentation.launchpadIconVariant.value)!);
refreshWindowChrome=()=>windowChrome.update(settings.presentation.showCustomTitlebar.value,app.windowMode==="windowed");
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
management.captureReturnFocus=()=>nativeSettings.shell?.captureFocus()??searchBar.captureFocus()??(()=>app.invalidate());
let offResize = (): void => {};
let offBackgroundResize=()=>{};
const offPresented = app.on("presented", () => {
  const visible=app.window.isVisible()&&!app.window.isMinimized();
  if(visible)resumeTiming?.mark("presented");resumeTiming?.presented(visible);textPrewarm.presented();
  // Maximize state may settle after the resize notification. Refresh caption
  // controls against the HWND state of the frame that actually reached screen.
  windowChrome.update(settings.presentation.showCustomTitlebar.value,app.windowMode==="windowed");
  folderFlow.commitPresented(scene.commitPresentedFrame());
  const session=launchFlow?.appLaunchCloseSessionId.value;
  if(session&&currentFrame.visual.appLaunchCloseSessionId===session)launchFlow?.commitAppLaunchCloseFrame(session);
});
let offStateChange = (): void => {};
const offFatal=app.on("fatal",event=>{logNativeRuntime("fatal",{type:event.type,message:event.message,error:event.error instanceof Error?{message:event.error.message,stack:event.error.stack}:String(event.error??"")});});
const offFrameError=app.on("frameerror",event=>logNativeRuntime("frame-error",event));
const offRecoveryPresented=app.on("recoverypresented",event=>logNativeRuntime("recovery-presented",event));
let bindApplicationFocus = () => {};
let cancelNativeGesture = () => {};
let nativeInputRouter: NativeInputRouter | null = null;
const offRecovered=app.on("recovered",event=>{logNativeRuntime("recovered",event);bindResumeRenderer();textPrewarm.start();applySavedWindowIcon();windowEffects.refresh();bindApplicationFocus();scene.invalidateStructure();requestSceneRender();});
let offFocus = (): void => {};
let offSystemPreferences=()=>{};
let disconnectAnimationHost = (): void => {};
const closeCoordinator=createNativeCloseCoordinator({
  canAnimate:()=>!(app.window.isMinimized()||app.state!=="running"),
  dismissLaunchpad:()=>dismissLaunchpad(),
  finishCloseAnimation:async()=>{
    if(launchFlow?.isDesktopOpen.value&&app.window.isVisible()&&!app.window.isMinimized()&&app.state==="running"){
      launchFlow.closeDesktop();
      await waitFor("native window close animation",()=>!launchFlow!.isDesktopClosing.value);
      await present(app,"native window final close frame");
    }
  },
  flushSaves:()=>saves.flush(),
  prepareClose:()=>liveDesktop.stop(),
  // Saving already supplies an actionable retry notice; preserve it on close failure.
  hasSaveFailure:()=>saveFailureCount>0,
  hideWindow:()=>app.window.hide(),
  log:event=>logNativeRuntime(event),
  prepareRestart:()=>prepareNativeRestart(),
  reportError:error=>{reportNativeError(error,"close");},
  requestWindowClose:()=>{app.window.requestClose();},
  setInteractive:enabled=>{app.stage.interactiveChildren=enabled;},
  waitForSettingsApply:()=>nativeSettings.shell?.waitForApply(),
});
const offSaveBeforeClose = app.beforeClose(async () => closeCoordinator.beforeClose());
let liveDesktopTimer:ReturnType<typeof setInterval>|null=null;
try {
  if(liveDesktop.enabled){
    let lastVisible=false;
    let lastDisplay=app.nativeDisplayId;
    liveDesktopTimer=setInterval(()=>{
      if(!liveDesktop.status?.active)return;
      try{
        const display=app.nativeDisplayId;
        if(display!==lastDisplay){liveDesktop.restart(backgroundConfig(),systemAppearance);lastDisplay=display;}
        const visible=app.window.isVisible()&&!app.window.isMinimized();
        if(visible!==lastVisible){liveDesktop.setVisible(visible);lastVisible=visible;}
        liveDesktop.poll();
      }catch(error){
        try{liveDesktop.stop();}catch(stopError){logNativeRuntime("live-desktop-stop-error",stopError);}
        void desktopBackground.configure({...backgroundConfig(),backgroundSource:"systemMaterial"},app.contentSize.width,app.contentSize.height,undefined,systemAppearance).catch(error=>reportNativeError(error,"background"));
        reportNativeError(error,"background");
      }
    },1000);
  }
  offBackgroundResize=app.on("resize",()=>{
    void refreshBackground().catch(error=>reportNativeError(error,"background"));
  });
  offSystemPreferences=subscribeNativeSystemPreferences(result=>{
    if(!result.ok){reportNativeError(result.error.message,"appearance");return;}
    if(setNativeUiFontFamily(result.value.uiFontFamily))nativeSettings.redraw();
    if(systemAppearance!==result.value.appearance){
      systemAppearance=result.value.appearance;nativeSettings.redraw();
      if(settings.presentation.windowEffectAppearance.value==="system"&&(!launchFlow||launchFlow.isDesktopOpen.value)){
        try{windowEffects.set(settings.presentation.windowEffectMaterial.value,systemAppearance);}
        catch(error){reportNativeError(error,"background");}
      }
      void refreshBackground().catch(error=>reportNativeError(error,"background"));app.invalidate();
    }
  });
  app.setWindowMode(settings.presentation.windowMode.value,settings.presentation.fullscreenOverscanEnabled.value?1:0);
  windowEffects.set(settings.presentation.windowEffectMaterial.value,resolveAppearancePreference(settings.presentation.windowEffectAppearance.value,systemAppearance));
  await present(app, "the native host startup frame");
  startupPhase("ui-assembly");
  await refreshBackground().catch(error=>reportNativeError(error,"background"));
  startupPhase("background");
  const iconTextureSnapshot = await iconTextures.synchronize(collectTextureItems(currentFrame));
  startupPhase("icon-repository");
  if (iconTextureSnapshot.pending.length !== 0) {
    throw new Error(`Native icon texture did not become ready: ${JSON.stringify(iconTextureSnapshot)}`);
  }
  if ((__LUMERIA_DIAGNOSTICS__ && nativeMode === "smoke") && iconTextureSnapshot.failed.length !== 0) {
    throw new Error(`Native smoke icon texture failed: ${JSON.stringify(iconTextureSnapshot)}`);
  }
  if (nativeMode !== "smoke" && iconTextureSnapshot.failed.length > 0) {
    console.warn("Some native icon textures could not be loaded", iconTextureSnapshot.failed);
  }

  disconnectAnimationHost = scene.connectAnimationHost({
    commit: sceneUpdates.flush,
    animate: (update) => app.animate(update),
    invalidate: () => app.invalidate(),
  });

  // Owned by the native input router once it is created below; null until then.
  let readPageTrackScrub: () => NativePageTrackScrub = () => ({ desktop: null, folder: null });
  const sceneController = createNativeSceneController({
    afterCommit:()=>{
    settingsButton.position.set(app.contentSize.width-54,14+chromeInset());
    const folderHeader=folderFlow.snapshot();
    const currentFolder = folderHeader.renderedFolder && layoutState.operations.findFolder(layoutState.presentation.pages.value, folderHeader.renderedFolder.id)?.item;
    folderNamePresentationItem=currentFolder ?? folderHeader.renderedFolder;
    folderNamePresentationBlocked=folderHeader.isClosing || Boolean(nativeSettings.shell || management.modal || editing?.drag.isDragActive()) || Boolean(launchFlow?.isLaunchpadInteractionBlocked());
    folderNameInput.update(folderNamePresentationItem, folderHeader.openProgress,folderNamePresentationBlocked);
    app.stage.setChildIndex(folderNameInput, app.stage.children.length - 1);
    const headerShown=!editing?.selection.isActive.value&&(!folderHeader.renderedFolder||folderHeader.isClosing)&&(!launchFlow||launchFlow.isDesktopOpen.value);
    settingsButton.reveal(headerShown,headerShown&&!nativeSettings.shell&&!folderHeader.renderedFolder);
    newAppsButton.update(apps?.imports.count??0,headerShown&&!nativeSettings.shell&&!searchQuery.trim(),!management.modal&&!folderHeader.renderedFolder&&!editing?.drag.isDragActive(),app.contentSize.width<760);
    newAppsButton.position.set(settingsButton.x-newAppsButton.controlWidth-8,settingsButton.y+(app.contentSize.width<760?42:0));
    searchBar.update(app.contentSize.width, Boolean(editing?.selection.isActive.value || (folderHeader.renderedFolder && !folderHeader.isClosing)),chromeInset(),!nativeSettings.shell);
    const hiddenCount=(editing?.selection.selectedCount.value??0)-getSelectionScope().orderedIds.filter(id=>editing?.selection.isSelected(id)).length;
    selectionToolbar.update({width:app.contentSize.width,chromeInset:chromeInset(),theme:settingsTheme(),
      active:Boolean(editing?.selection.isActive.value),count:editing?.selection.selectedCount.value??0,hiddenCount,
      frozen:Boolean(editing?.selection.isFrozen.value),canCancel:Boolean(editing?.drag.groupDragState.value?.canCancel),
      cancelArmed:Boolean(editing?.drag.groupDragState.value?.cancelArmed)});
    const needsBackdrop=selectionToolbar.backdropEnabled&&selectionToolbar.visible&&!editing?.drag.groupDragState.value?.canCancel
      && !(app.surfaceTextureUsage & 1);
    if(Boolean(app.stage.filters?.length)!==needsBackdrop)app.stage.filters=needsBackdrop?[selectionBackdropSurface]:[];
    app.stage.setChildIndex(noticeView,app.stage.children.length-1);
    if(nativeSettings.shell)app.stage.setChildIndex(nativeSettings.shell,app.stage.children.length-1);
    if(management.modal)app.stage.setChildIndex(management,app.stage.children.length-1);
    windowChrome.update(settings.presentation.showCustomTitlebar.value,app.windowMode==="windowed");
    app.stage.setChildIndex(windowChrome,app.stage.children.length-1);
    app.invalidate();
    },
    app,
    applyFrame:(frame,refreshActiveItems)=>{
      currentFrame=frame;
      if(refreshActiveItems)activePageItems=getNativeActivePageItems(currentFrame);
    },
    chromeInset,
    folderFlow,
    getActiveEditing:()=>editing,
    getApps:()=>apps,
    getFrame:()=>currentFrame,
    getIconSize:()=>layoutState.presentation.iconSize.value,
    getLayoutPages:()=>layoutState.presentation.pages.value,
    getLaunchFlow:()=>launchFlow,
    getPageTrackScrub:()=>readPageTrackScrub(),
    getSearchQuery:()=>searchQuery,
    iconTextures,
    launchGhostView,
    markSceneCommitted:()=>resumeTiming?.mark("sceneCommitted"),
    measureSceneCommit:(name,run)=>resumeTiming?resumeTiming.measure(name,run):run(),
    scene,
    sceneUpdates,
    textPrewarm,
  });
  const commitScene=sceneController.commitScene;
  searchBar.update(app.contentSize.width, false);
  let resizeEvents = 0;
  let resizeLiveBackingObserved = false;
  let observeLiveResize = false;
  offResize = app.on("resize", ({ height, resolution, width }) => {
    void branding.synchronize(resolution).catch(error=>reportNativeError(error,"icons"));
    configureNativeTextResolution(resolution,app.stage);
    nativeSettings.redraw();
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
  let indexedSearchPages:typeof layoutState.presentation.pages.value|null=null;
  const searchIndex=createAppSearchIndex<LaunchpadApp>();
  let searchResults:readonly LaunchpadApp[]|null=null;
  let searchPageSize=0;
  changeSearch = (query,deferScene=false) => {
    const queryChanged = query !== searchQuery;
    searchQuery = query;
    layoutState.commitSearchPageIndex(0);
    if(query.trim() && folderFlow.snapshot().renderedFolder) closeFolder();
    const layoutPages=layoutState.presentation.pages.value;
    const layoutChanged=indexedSearchPages!==layoutPages;
    if(query.trim()&&layoutChanged){indexedSearchPages=layoutPages;searchIndex.update(layoutState.operations.collectAppsFromPages(layoutPages));}
    const results=query.trim()?searchIndex.search(query):null;
    const pageSize=layoutState.presentation.pageSize.value;
    const sameResults=Boolean(results&&searchResults&&!layoutChanged&&pageSize===searchPageSize
      &&currentFrame.interaction.isSearchMode&&results.length===searchResults.length&&results.every((app,index)=>app===searchResults![index]));
    const resetNavigation = queryChanged || Boolean(query.trim() && !sameResults);
    const snapTrack = resetNavigation && (readPageTrackScrub().desktop !== null
      || Math.abs(scene.getMotionSnapshot().desktopPageTrackX) > 0.01);
    // A new query owns a new page projection; discard the gesture and its tail.
    if(resetNavigation)nativeInputRouter?.cancelGesture();
    const pages = sameResults?currentFrame.viewport.activePages:sceneController.resolveProjectedPages(query.trim()
      ? layoutState.operations.chunkIntoPages([...results!],pageSize)
      : layoutPages);
    searchResults=results;searchPageSize=pageSize;
    currentFrame = Object.freeze({ ...currentFrame,
      viewport: Object.freeze({ ...currentFrame.viewport, activePages: pages,
        activePageIndex: query.trim() ? 0 : layoutState.presentation.pageIndex.value,
        desktopProjectionEpoch: currentFrame.viewport.desktopProjectionEpoch + (sameResults?0:1),
        desktopTrackMotionKey: query.trim() ? "native-search" : "native-desktop" }),
      interaction: Object.freeze({ ...currentFrame.interaction, focusedIcon: null, isSearchMode: Boolean(query.trim()) }),
    });
    activePageItems = getNativeActivePageItems(currentFrame);
    if(query.trim()) setFocusedIcon(firstIconFocus(getCurrentIconScope()));
    if(deferScene){requestSceneRender(snapTrack);}
    else{renderScene(snapTrack);iconNodes = collectActiveIconNodes();}
  };

  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  offStateChange = app.on("statechange", ({ state,previous,reason }) => {
    logNativeRuntime("state",{state,previous,reason});
    // The host can destroy stage children before the awaiting product body gets
    // back to its finally. Stop queued commits synchronously at this boundary.
    if (state === "closing" || state === "closed") {
      try{liveDesktop.dispose();}catch(error){logNativeRuntime("live-desktop-stop-error",error);}
      hotCorners.dispose();
      sceneUpdates.dispose();
      cancelNativeGesture();
      resolveClosed();
      return;
    }
    if(state!=="running")cancelNativeGesture();
    if(state==="running"&&previous!=="running")windowEffects.refresh();
    if(state==="running")catalogRefresh?.notifyReady();
  });

  let presentCount = 0;
  let desktopPageMotionObserved = false;
  let folderPageMotionObserved = false;
  function commitDesktopPage(pageIndex: number): boolean {
    const nextFrame = setNativeDesktopPage(currentFrame, pageIndex);
    if (nextFrame === currentFrame) return false;
    textPrewarm.prioritize(currentFrame.viewport.activePageIndex,nextFrame.viewport.activePageIndex);
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
    cancelNativeGesture();
    commitDesktopPage(index);
  };
  const commitEditedPages = (pages: LaunchpadPages): void => {
    apps?.imports.observe(layoutState.presentation.pages.value,pages);
    layoutState.commitPages(pages);
    folderFlow.reconcile(snapshotContractValue(pages.flat()) as SceneItem[]);
    layoutState.commitPageIndex(layoutState.presentation.pageIndex.value);
    const config = layoutState.captureConfiguration();
    const document = layoutState.operations.createLayoutSnapshot({ ...loadedLayout?.settings,...settings.persistence.capture(),...apps?.persistence.capture(),
      pages, gridRows: config.rows, gridCols: config.cols, folderRows: config.folderRows, folderCols: config.folderCols,
      iconSize: config.iconSize, folderIconSize: config.folderIconSize, folderIconSizeMode: config.folderIconSizeMode,
      textless: layoutSettings.isTextlessModeState.value,hiddenAppIds:[...(apps?.presentation.hiddenAppIds.value??loadedLayout?.settings.hiddenAppIds??[])] });
    saves.enqueue(document);
    void saves.flush().catch(()=>{}); // The serialized writer reports failures and exposes retry through the notice.
    changeSearch(searchQuery,true);
    refreshTargetChecks();
    requestSceneRender();
    catalogRefresh?.sync();
  };
  commitEditedPagesForSettings = commitEditedPages;
  editing = createNativeEditing({ layout: layoutState, scene, folder: folderFlow,
    frames:inputFrames,
    size: () => app.contentSize, chromeInset, changed: requestSceneRender, commit: commitEditedPages,
    selectionToolbarRect:()=>selectionToolbar.cancelZoneRect(),
    confirm:config=>management.warning({...config,cancelText:t("common.actions.cancel"),intent:"warning",confirmAppearance:"outline",confirmTone:"danger",onConfirm:async()=>{config.onConfirm();await saves.flush();}}),
    page: index => onDesktopPageIndexCommit(index), dragPage: commitDesktopPage, folderPage: setFolderPageIndex,
    resetWheelNavigation: () => nativeInputRouter?.resetWheelNavigation(),
    isWheelNavigationActive: () => nativeInputRouter?.isWheelNavigationActive() ?? false,
    open: id => {
      nativeInputRouter?.resetWheelNavigation();
      if(!id) { closeFolder(); return; }
      const item = editing?.projectedPages().flat().find(item => item.id === id);
      if(item) { folderFlow.open(snapshotContractValue(item) as SceneItem);setFocusedIcon(null);requestSceneRender(); }
    },
  });
  let appsChangeQueued=false,appsPersistenceKey="";
  const changedApps=()=>{
    if(appsChangeQueued)return;appsChangeQueued=true;
    queueMicrotask(()=>{
      appsChangeQueued=false;if(!apps||sceneUpdates.disposed)return;
      const key=JSON.stringify(apps.persistence.capture());
      const persistedChange=key!==appsPersistenceKey;
      if(persistedChange){appsPersistenceKey=key;commitEditedPages(layoutState.operations.clonePages(layoutState.presentation.pages.value));}
      // Source edits are already visible in their live input. Recreating the whole
      // page on blur would flash it while focus is moving to the next source field.
      const sourceFieldFocused=searchBar.host.focused?.label?.startsWith("native-apps:source-");
      const keywordDraftFocused=searchBar.host.focused?.label==="native-apps:keyword"&&!persistedChange;
      if(nativeSettings.shell&&settingsNavigation.activeRoute.value.tabId==="apps"&&!sourceFieldFocused&&!keywordDraftFocused&&!management.modal)nativeSettings.shell.refreshContent();
      appDialogs?.sync();
      refreshTargetChecks();
      requestSceneRender();
    });
  };
  apps=createLaunchpadApps({
    ...layoutState.operations,pages:layoutState.presentation.pages,
    importPageSize:()=>layoutState.captureConfiguration().rows*layoutState.captureConfiguration().cols,importFolderSize:()=>layoutState.captureConfiguration().folderRows*layoutState.captureConfiguration().folderCols,
    catalogPort:createNativeCatalogPort(nativeData),localizationText:{t},shouldUseNativeCatalog:()=>true,
    isDragActive:()=>editing!.drag.isDragActive(),commitPages:pages=>editing!.commit(pages),commitPagesAfterDeletion:pages=>editing!.commit(pages),
    commitOpenFolder:id=>{if(!id)closeFolder();},openFolderId:{get value(){return folderFlow.snapshot().renderedFolder?.id??null;}},
    renderedFolder:{get value(){return folderFlow.snapshot().renderedFolder as import("../../domain/launchpadLayout.js").ReadonlyLaunchpadFolder|null;}},
    reclampPageIndices:()=>layoutState.commitPageIndex(layoutState.presentation.pageIndex.value),schedulePageGridMetrics:requestSceneRender,
    openScanKeywordSettings:()=>{settingsNavigation.selectTab("apps");appsPageState.keywords=true;if(nativeSettings.shell)nativeSettings.redraw();else openSettings();},
    clearFocusedIcon:()=>setFocusedIcon(null),
    focusedIcon:{get value(){return currentFrame.interaction.focusedIcon;}},
    openWarningDialog:config=>management.warning({...config,onConfirm:async()=>{config.onConfirm?.();await saves.flush();}}),
    showTransientNotice:notice=>notices.showTransientNotice(notice),
  },createNativeStateHost(changedApps));
  apps.persistence.restore(loadedLayout?.settings??{});
  apps.imports.setCatalog(catalogResult.apps);
  if(!needsOnboarding)apps.imports.registerStartup((loadedLayout?.pages??[]) as unknown as import("../../domain/launchpadLayout.js").ReadonlyLaunchpadPages);
  appsPersistenceKey=JSON.stringify(apps.persistence.capture());
  appDialogs=new NativeAppDialogs({apps,icons:iconTextures,management,host:searchBar.host,theme:settingsTheme,invalidate:()=>app.invalidate(),save:()=>saves.flush(),pickIcon:async()=>{
    const result=await nativeHost.platform.dialogs.openFiles({allowedFileTypes:"png,jpg,jpeg,webp,bmp,gif,svg,ico",multiple:false});
    if(!result.ok){if(result.error.code==="CANCELLED")return null;throw new Error(result.error.message);}
    const path=result.value[0];return path?nativeData.cacheCustomIcon(await normalizeNativeCustomIcon(path)):null;
  }});
  let targetCheckKey="",targetCheckGeneration=0,targetCheckedAt=0;
  let targetCheckPending: Promise<void> | null = null;
  refreshTargetChecks=async(force=false)=>{
    if(!apps||sceneUpdates.disposed)return;
    const checks=apps.nativeIntegration.listLaunchTargets();
    nativeData.retainLaunchTargets(checks);
    const key=apps.nativeIntegration.shouldCheckLaunchTargets()?apps.nativeIntegration.launchTargetCheckSignature(checks):"off";
    if(!force&&key===targetCheckKey && targetCheckPending) return targetCheckPending;
    if(!force&&key===targetCheckKey&&Date.now()-targetCheckedAt<15000)return;
    targetCheckKey=key;const generation=++targetCheckGeneration;
    if(key==="off"){apps.nativeIntegration.clearLaunchTargetStatuses();return;}
    targetCheckPending=(async()=>{
      for(let offset=0;offset<checks.length;offset+=4){
        await new Promise(resolve=>setTimeout(resolve,0));
        if(generation!==targetCheckGeneration||sceneUpdates.disposed)return;
        const batch=checks.slice(offset,offset+4);
        const results=await nativeData.checkLaunchTargets(batch.map(({id,launchTarget,fallbackPaths})=>({id,launchTarget,fallbackPaths})),force);
        if(generation===targetCheckGeneration&&!sceneUpdates.disposed)apps?.nativeIntegration.applyLaunchTargetStatuses(results,batch);
      }
      if(generation===targetCheckGeneration)targetCheckedAt=Date.now();
    })().catch(error=>{if(!sceneUpdates.disposed){logNativeRuntime("launch-target-check-error",error);if(generation===targetCheckGeneration){targetCheckedAt=0;apps?.nativeIntegration.clearLaunchTargetStatuses();}}}).finally(()=>{if(generation===targetCheckGeneration)targetCheckPending=null;});
    return targetCheckPending;
  };
  refreshOneTarget=async(id,force=false)=>{
    const check=apps?.nativeIntegration.getLaunchTargetCheck(id);if(!check)return;
    try{const results=await nativeData.checkLaunchTargets([check],force);if(!sceneUpdates.disposed)apps?.nativeIntegration.applyLaunchTargetStatuses(results,[check]);}
    catch(error){logNativeRuntime("launch-target-check-error",error);}
  };
  refreshTargetChecks();
  const flowState=createNativeStateHost(requestSceneRender),openingIcon=flowState.cell<import("../../application/launchpadLaunchFlow.js").LaunchIconFocus|null>(null);
  const visibility=createNativeVisibilityController({
    backgroundVisible:visible=>{liveDesktop.setVisible(visible);if(visible)void refreshTargetChecks();},
    backgroundDisplayChanged:()=>liveDesktop.restart(backgroundConfig(),systemAppearance),
    activateStartupPreparation:()=>startupPreparation?.activate(),
    app,
    closeSettings:()=>closeSettings(),
    desktopBackground,
    fadeChrome:(targets,visible,material)=>fadeNativeLaunchpadChrome(targets,visible,material),
    flushSaves:()=>saves.flush(),
    getActivePageIndex:()=>currentFrame.viewport.activePageIndex,
    getLaunchFlow:()=>launchFlow,
    getResumeTiming:()=>resumeTiming,
    getSettingsApplying:()=>Boolean(nativeSettings.shell?.applying),
    getSettingsButton:()=>settingsButton,
    getAdditionalChrome:()=>[newAppsButton],
    getSettingsMaterial:()=>settings.presentation.windowEffectMaterial.value,
    getSettingsShell:()=>nativeSettings.shell,
    getSettingsThemePreference:()=>settings.presentation.windowEffectAppearance.value,
    getSystemAppearance:()=>systemAppearance,
    isCloseCoordinatorClosing:()=>closeCoordinator.closing,
    isDesktopFrameVisible:()=>scene.getDesktopAlpha()>0,
    isDragActive:()=>editing?.drag.isDragActive()??false,
    isFolderRendered:()=>Boolean(folderFlow.snapshot().renderedFolder),
    log:(event,value)=>logNativeRuntime(event,value),
    management,
    pauseTextPrewarm:()=>textPrewarm.pause(),
    present:description=>present(app,description),
    prioritizeTextPrewarm:(pageIndex,targetIndex)=>textPrewarm.prioritize(pageIndex,targetIndex),
    reportError:error=>reportNativeError(error,"window"),
    requestSceneRender,
    resetFolder:()=>folderFlow.reset(),
    prepareSearchInput:()=>prepareSearchInput(),
    searchBar,
    setTextPrewarmRunning:start=>{if(start)textPrewarm.start();else textPrewarm.pause();},
    waitFor,
    windowChrome,
    windowEffects,
  });
  launchFlow=createLaunchpadLaunchFlow({
    localizationText:{t},desktopMainRef:flowState.cell(null),keyboardFocusArea:flowState.cell("desktop"),openingIcon,
    searchInputRef:flowState.derived(()=>searchBar.input),
    cancelInputGesture:()=>{
      cancelNativeGesture();
      editing?.alt.cancelAltEditMode();
    },clearFocusedIcon:()=>setFocusedIcon(null),
    clearOpeningIcon:()=>{openingIcon.value=null;},clearSearch:()=>searchBar.setQuery(""),
    cloneItem:item=>layoutState.operations.cloneItem(item) as import("../../domain/launchpadLayout.js").LaunchpadApp,
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
    restoreAfterLaunchCancelled:()=>visibility.show(),
    shouldWaitForElevation:(item,elevated)=>apps!.presentation.waitForElevationAnimation.value &&
      (elevated || item.runAsAdmin === true || apps!.nativeIntegration.getTargetDetails(item.id)?.requiresAdmin === true),
    launchNativeAppIfAvailable:async (item,elevated)=>{
      try{await nativeData.launchApp(item.id,elevated);return true;}
      catch(error){
        if(error instanceof NativeLaunchError&&error.kind==="cancelled")return {kind:"cancelled"};
        const detail=readErrorMessage(error);return {kind:"launch",...nativeLaunchErrorFeedback(error),detail};
      }
    },
    waitForAppLaunchAnimation:()=>launchGhostView.waitForCompletion(),
    showNativeLaunchError:error=>{visibility.show();management.warning({...error,intent:"error",confirmText:t("notices.acknowledge")});},
    beginNativeWindowClose:()=>visibility.beginCloseAnimation(),
    hideNativeWindow:visibility.hideAfterPresented,onDesktopCloseComplete:()=>{void visibility.hideAfterPresented().catch(error=>reportNativeError(error,"window"));},
    schedulePageGridMetrics:requestSceneRender,startHomeRevealSettleWindow:()=>{},
  },flowState,{...visibility.timers,afterCommit:queueMicrotask});
  showLaunchpad=visibility.show;
  let searchWindowFocused = app.window.isVisible() && !app.window.isMinimized();
  prepareSearchInput=()=>searchBar.prepareForTyping(searchWindowFocused && app.state==="running"
    && app.window.isVisible() && !app.window.isMinimized() && Boolean(launchFlow?.isDesktopOpen.value)
    && !launchFlow?.isLaunchpadInteractionBlocked() && !management.modal && !nativeSettings.shell
    && !folderFlow.snapshot().renderedFolder && !editing?.selection.isActive.value && !editing?.drag.isDragActive()
    && !noticeView.hasFocus && !newAppsFocused);
  preserveViewAfterLocation=visibility.preserveViewOnNextShow;
  dismissLaunchpad=visibility.dismiss;toggleLaunchpad=visibility.toggle;shortcutLaunchpad=visibility.shortcut;
  disposeLaunchFlow=visibility.disposeTimers;
  hotCornerActivate=visibility.hotCorner;
  try{hotCorners.apply(settings.presentation.hotCorners.value);}catch(error){reportNativeError(error,"hotCorners");}
  if(!process.env.LUMERIA_NATIVE_DATA_DIR){
    const outcome=mainShortcut.apply(normalizeMainWindowShortcut(loadedLayout?.settings.mainWindowShortcut));
    if(!outcome.ok){
      const message=readErrorMessage(outcome.error);console.error("Native shortcut registration failed:",message);
      settings.actions.setMainWindowShortcutError(nativeShortcutErrorMessage(outcome.error));reportNativeError(outcome.error,"shortcut");
    }
  }
  tray=createLaunchpadTray({
    brandingDirectory:join(import.meta.dir,"branding"),createTray:options=>new NativeTray(options),openPath:openNativePath,
    icon:()=>settings.presentation.launchpadIconVariant.value,
    show:()=>showLaunchpad(),toggle:()=>toggleLaunchpad(),
    settings:()=>{
      showLaunchpad();
      void waitFor("tray settings window ready",()=>app.state==="running"&&launchFlow!.isDesktopOpen.value)
        .then(()=>openSettings()).catch(error=>logNativeRuntime("tray-settings-error",error));
    },
    quit:restart=>closeCoordinator.requestQuit(restart),
  });
  session.setHandlers({
    activate:()=>showLaunchpad(),
    shutdown:()=>closeCoordinator.requestExternalShutdown(),
  });
  logNativeRuntime("ready",{version:PRODUCT.version,state:app.state,trayId:tray.id,logDirectory:nativeLogDirectory});
  const turnFolderPage = (direction: Exclude<NativePageTurn, 0>): boolean => {
    if (!setFolderPageIndex(folderFlow.snapshot().folderPageIndex + direction)) return false;
    return true;
  };
  nativeInputRouter = createNativeInputRouter({
    activateItem: (item, event) => { void activateItem(item, event); },
    app,
    closeFolder,
    commitDesktopPage,
    contextMenu,
    dismissLaunchpad: () => dismissLaunchpad(),
    folderFlow,
    getActivePageItems: () => activePageItems,
    getCurrentIconScope,
    getDesktopPageCount: () => currentFrame.viewport.activePages.length,
    getDesktopPageIndex: () => currentFrame.viewport.activePageIndex,
    getEditing: () => editing,
    getSettingsShell: () => nativeSettings.shell,
    isInteractionBlocked: () => launchFlow?.isLaunchpadInteractionBlocked() ?? false,
    management,
    requestSceneRender,
    scene,
    searchBar,
    setFolderPageIndex,
  });
  cancelNativeGesture = nativeInputRouter.cancelGesture;
  readPageTrackScrub = nativeInputRouter.readPageTrackScrub;
  const interruptWheel = nativeInputRouter.interruptWheel;
  const clearWheelPresentation = nativeInputRouter.clearPresentation;
  const readTouchId = nativeInputRouter.readTouchId;
  const routeKey = createNativeKeyboardRouter({
    activateItem: (item, event) => { void activateItem(item, event); },
    app,
    cancelNativeGesture: () => cancelNativeGesture(),
    closeFolder,
    dismissLaunchpad: () => dismissLaunchpad(),
    editItem,
    folderFlow,
    folderNameInput,
    getCurrentIconScope,
    getEditing: () => editing,
    getFocusedIcon: () => currentFrame.interaction.focusedIcon,
    getSelectionScope,
    getSettingsShell: () => nativeSettings.shell,
    isInteractionBlocked: () => launchFlow?.isLaunchpadInteractionBlocked() ?? false,
    isSearchMode: () => Boolean(searchQuery.trim()),
    isWindowClosing: () => closeCoordinator.closing,
    management,
    noticeView,
    removeItems,
    searchBar,
    selectionToolbar,
    setFocusedIcon,
    turnFolderPage,
    turnPage,
  }).handleKey;
  const onKey=(event:import("../nativeStartup.js").NativeNavigationKey)=>{
    if(onboarding?.handleKey(event))return true;
    if(!management.modal&&!nativeSettings.shell&&newAppsButton.visible&&event.type==="down"){
      if(event.key==="Tab"&&!newAppsFocused&&searchBar.input.focused&&searchBar.explicitEditing&&!event.shiftKey){searchBar.input.blur();newAppsFocused=true;newAppsButton.alpha=.7;app.invalidate();return true;}
      if(newAppsFocused){if(event.key==="Enter"||event.key===" "){newAppsFocused=false;newAppsButton.alpha=1;newAppsButton.activate();return true;}if(event.key==="Tab"||event.key==="Escape"){newAppsFocused=false;newAppsButton.alpha=1;searchBar.focusEditor();app.invalidate();return true;}}
    }else if(newAppsFocused){newAppsFocused=false;newAppsButton.alpha=1;}
    return routeKey(event);
  };
  searchBar.handleKey=onKey;
  if(__LUMERIA_DIAGNOSTICS__ && nativeMode==="dev" && process.env.LAUNCHPAD_TOUCHPAD_CAPTURE_DIR){
    await (await import("../diagnostics/nativeTouchpadCapture.js")).attachNativeTouchpadCapture({
      app, directory:process.env.LAUNCHPAD_TOUCHPAD_CAPTURE_DIR, searchBar, management, folderFlow,
      getSettingsShell:()=>nativeSettings.shell, onKey, interruptWheel, clearWheelPresentation,
      present:description=>present(app,description), requestQuit:()=>closeCoordinator.requestQuit(), smoke:smoke!,
    });
  }
  onboarding=createNativeOnboarding({apps:apps!,settings,management,icon:()=>brandingTextures.get(settingsTheme()==="dark"?"dark":"light")!,theme:settingsTheme,invalidate:()=>app.invalidate(),save:()=>saves.flush(),
    scan:async()=>{if(__LUMERIA_DIAGNOSTICS__&&process.env.LAUNCHPAD_NATIVE_IMPORT_CHECK==="1")await new Promise(resolve=>setTimeout(resolve,700));const request=apps!.nativeIntegration.captureScanRequest();const result=await nativeData.scanApps(request.roots,request.filters);if(result.warnings.length||result.stats.limitReached)throw new Error(t("imports.partial"));apps!.imports.setCatalog(result.apps);},
    complete:()=>{requestSceneRender();},
  });
  if(needsOnboarding&&nativeMode!=="smoke")onboarding.open();
  if(startupLoadRecovered&&!notices.transientNotice.value)notices.showLayoutLoadRecovered();
  bindApplicationFocus = () => {
    offFocus();
    offFocus=app.nativeInput.onFocusChange(focused=>{
      searchWindowFocused=focused;
      if(focused){windowEffects.refresh();prepareSearchInput();}
      else {cancelNativeGesture();editing?.alt.handleWindowBlur();}
    });
    searchWindowFocused=app.nativeInput.focused;
    prepareSearchInput();
  };
  bindApplicationFocus();
  searchBar.input.on("submit", () => {
    const focused = findFocusedIcon(currentFrame.interaction.focusedIcon, getCurrentIconScope());
    if(focused) void activateItem(focused);
  });

  await present(app, "the first LaunchPad scene frame");
  startupPhase("scene-first-present");
  const toolbarPrepareStart=performance.now();
  selectionToolbar.prepare(app.renderer,app.contentSize.width,chromeInset(),settingsTheme());
  logNativeRuntime("selection-toolbar-prepared",{ms:performance.now()-toolbarPrepareStart});
  logNativeRuntime("first-scene-presented");
  if ((__LUMERIA_DIAGNOSTICS__ && nativeMode === "smoke")) (await import("../diagnostics/nativeStartupSmoke.js")).assertNativeScenePrepared(iconTextures.snapshot().cached.length);
  iconTextures.startBackground();
  const startupWait=startupPreparation.start();
  if(loginStartup){void startupWait.then(result=>logNativeRuntime("startup-prepared",{...result,background:true}));}
  else logNativeRuntime("startup-prepared",{...await startupWait,background:false});
  appliedCatalogKey=nativeCatalogContentKey(catalogResult);
  const catalogInteractionBusy=()=>sceneUpdates.disposed||closeCoordinator.closing||app.state!=="running"||Boolean(editing?.drag.isDragActive()||editing?.selection.isActive.value||management.modal||nativeSettings.shell||folderFlow.snapshot().renderedFolder||launchFlow?.isLaunchpadInteractionBlocked());
  catalogRefresh=createNativeCatalogRefresh({
    request:()=>apps&&apps.persistence.capture().importState.completed?apps.nativeIntegration.captureScanRequest():null,
    scan:async(request,mode)=>{
      const revision=nativeData.catalogRevision;const result=await nativeData.refreshCatalog(request.roots,request.filters,mode);
      if(result.warnings.length||result.stats.limitReached)throw new Error(t("imports.partial"));
      return{result,revision};
    },
    canApply:()=>!catalogInteractionBusy(),
    report:error=>{logNativeRuntime("catalog-refresh-failed",error);reportNativeError(error,"scan");},
    apply:async({result,revision:catalogRevision},request,current)=>{
      const key=nativeCatalogCacheKey(request.roots,request.filters);
      const stillCurrent=()=>{
        if(!current()||sceneUpdates.disposed||closeCoordinator.closing||!apps||nativeData.catalogRevision!==catalogRevision)return false;
        const currentRequest=apps.nativeIntegration.captureScanRequest();
        return nativeCatalogCacheKey(currentRequest.roots,currentRequest.filters)===key;
      };
      if(!stillCurrent())return true;
      if(catalogInteractionBusy())return false;
      const contentKey=nativeCatalogContentKey(result);
      if(contentKey===appliedCatalogKey){
        await iconTextures.retryFailedSources();
        logNativeRuntime("catalog-refreshed",{apps:result.apps.length,changed:false});return true;
      }
      await nativeData.adoptCatalog(result);
      if(!stillCurrent())return true;
      if(catalogInteractionBusy())return false;
      const previous=layoutState.presentation.pages.value;
      const config=layoutState.captureConfiguration();
      // Reconcile consumes persisted items: runtime nodes carry presentationOverrides,
      // while the document uses overrides and also owns deferred import decisions.
      const document=layoutState.operations.createLayoutSnapshot({...loadedLayout?.settings,...settings.persistence.capture(),...apps!.persistence.capture(),
        pages:previous,gridRows:config.rows,gridCols:config.cols,folderRows:config.folderRows,folderCols:config.folderCols,
        iconSize:config.iconSize,folderIconSizeMode:config.folderIconSizeMode,folderIconSize:config.folderIconSize,
        textless:layoutSettings.isTextlessModeState.value,hiddenAppIds:[...apps!.presentation.hiddenAppIds.value]});
      const pages=layoutState.operations.reconcileDocument(result.apps.map(normalizeNativeApp),document,apps!.presentation.hiddenAppIds.value).pages;
      apps!.imports.setCatalog(result.apps);
      commitEditedPages(pages);
      void iconTextures.retryFailedSources().then(()=>requestSceneRender()).catch(error=>reportNativeError(error,"icons"));
      apps!.imports.registerStartup(previous);
      appliedCatalogKey=contentKey;
      logNativeRuntime("catalog-refreshed",{apps:result.apps.length,changed:true});return true;
    },
  });
  offCatalogCompleted=nativeData.onCatalogScanComplete((key,startedAt)=>catalogRefresh?.completed(key,startedAt));
  catalogRefresh.start(startupCatalogCached);
  presentCount += 1;
  // Input/state work is now frame-coalesced. Apply the initial presentation
  // before testing its endpoint; untouched nodes can still have alpha=1.
  sceneUpdates.flush();
  // Only the controlled smoke scenario requires a globally settled scene.
  // Product readiness is the first presented frame + startupPreparation; users
  // may already open a folder, drag, or hide the window after that boundary.
  if (__LUMERIA_DIAGNOSTICS__ && nativeMode === "smoke") await waitFor(
    "the LaunchPad entrance motion to make every node visible",
    () => app.state === "closing" || app.state === "closed"
      || (!sceneUpdates.pending&&!scene.getMotionSnapshot().active
        &&collectActiveIconNodes().every((node) => node.alpha >= 0.999 && node.renderable && node.visible)),
  );
  if (app.state === "closing" || app.state === "closed") return;
  await present(app, "the settled LaunchPad scene frame");
  if(closeCoordinator.closing||["closing","closed"].includes(app.state))return;
  liveDesktop.setVisible(app.window.isVisible()&&!app.window.isMinimized());
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

  const devtools=__LUMERIA_DIAGNOSTICS__ ? await (await import("../../../vendor/electrobun-pixi-native-starter/src/diagnostics/native-devtools.js")).attachNativeDevtools(app,{
    name:"LaunchPad",build:process.env.LAUNCHPAD_DEBUG_BUILD??"development",
    enabled:nativeMode==="dev"||(__LUMERIA_DIAGNOSTICS__ ? process.env.LAUNCHPAD_DEVTOOLS : undefined)==="1",
    isolated:Boolean(process.env.LUMERIA_NATIVE_DATA_DIR),
    ...(productDiagnostics?{commandExtension:productDiagnostics.command,statusExtension:()=>({product:productDiagnostics.status()})}:{}),
    state:()=>({
      route:nativeSettings.shell?settingsNavigation.activeRoute.value.key:"desktop",
      page:currentFrame.viewport.activePageIndex,
      folder:{id:folderFlow.snapshot().renderedFolder?.id??null,progress:folderFlow.snapshot().openProgress},
      selection:{active:editing?.selection.isActive.value??false,count:editing?.selection.selectedCount.value??0},
      drag:{active:editing?.drag.isDragActive()??false,phase:editing?.drag.groupDragState.value?.phase??null,
        hover:editing?.drag.dragFolderHoverState.value??null},
      motion:scene.getMotionSnapshot(),
      iconResidency:iconTextures.residency(),
    }),
  }) : null;
  if(devtools)logNativeRuntime("devtools-ready",devtools.identity);

  if(__LUMERIA_DIAGNOSTICS__&&nativeMode==="dev"&&process.env.LAUNCHPAD_NATIVE_SURFACE_PROOF){
    const proof=await (await import("../diagnostics/nativeSurfaceProof.js")).runNativeSurfaceProof({
      app,commitScene,getLiveBackingObserved:()=>resizeLiveBackingObserved,
      getObservedResizeEvents:()=>resizeEvents,iconNodes:()=>collectActiveIconNodes(),
      initialWork:sceneController.readWork(),present:description=>present(app,description),
      selectionToolbarX:()=>selectionToolbar.x,setObserveLiveResize:value=>{observeLiveResize=value;},
      settingsButtonX:()=>settingsButton.x,searchBarX:()=>searchBar.x,waitFor,
    });
    const {writeFileSync}=await import("node:fs");
    writeFileSync(process.env.LAUNCHPAD_NATIVE_SURFACE_PROOF,JSON.stringify(proof,null,2));
    closeCoordinator.requestQuit();await closed;return;
  }

  if(__LUMERIA_DIAGNOSTICS__&&nativeMode==="dev"&&process.env.LAUNCHPAD_DATA_ICONS_PROOF){
    await (await import("../diagnostics/nativeDataIconsSmoke.js")).runNativeDataIconsSmoke({app,apps:apps!,dialogs:appDialogs!,management,icons:iconTextures,directory:process.env.LAUNCHPAD_DATA_ICONS_PROOF,save:()=>saves.flush(),quit:()=>closeCoordinator.requestQuit()});return;
  }
  if(__LUMERIA_DIAGNOSTICS__&&nativeMode==="dev"&&process.env.LAUNCHPAD_AUTO_SCAN_PROOF){
    await (await import("../diagnostics/nativeAutoScanSmoke.js")).runNativeAutoScanSmoke({app,apps:apps!,data:nativeData,pages:()=>layoutState.presentation.pages.value,trigger:()=>catalogRefresh!.trigger(),openSettings,closeSettings,showLastPage:()=>{commitDesktopPage(layoutState.presentation.pages.value.length-1);},pageSettled:()=>!scene.getMotionSnapshot().active,save:()=>saves.flush(),quit:()=>closeCoordinator.requestQuit(),directory:process.env.LAUNCHPAD_AUTO_SCAN_PROOF});return;
  }
  if(__LUMERIA_DIAGNOSTICS__&&nativeMode==="dev"&&process.env.LAUNCHPAD_CONTEXT_MENU_PROOF){
    await (await import("../diagnostics/nativeContextMenuSmoke.js")).runNativeContextMenuSmoke({app,apps:apps!,editing:editing!,management,data:nativeData,
      present:name=>present(app,name),menu:contextMenu,quit:()=>closeCoordinator.requestQuit()});
    await closed;return;
  }
  if(__LUMERIA_DIAGNOSTICS__&&nativeMode==="dev"&&process.env.LAUNCHPAD_TARGET_ACTIONS_PROOF){
    await (await import("../diagnostics/nativeTargetActionsSmoke.js")).runNativeTargetActionsSmoke({app,apps:apps!,editing:editing!,folder:folderFlow,management,dialogs:appDialogs!,data:nativeData,
      present:name=>present(app,name),check:refreshTargetChecks,menu:contextMenu,search:query=>changeSearch(query),show:showLaunchpad,launching:()=>launchFlow!.isAppLaunching.value,showSettings:()=>{settingsNavigation.selectTab("apps");openSettings();},save:()=>saves.flush(),quit:()=>closeCoordinator.requestQuit()});
    await closed;return;
  }

  if(__LUMERIA_DIAGNOSTICS__&&nativeMode==="dev"&&process.env.LAUNCHPAD_ABOUT_PREVIEW_DIR&&process.env.LUMERIA_NATIVE_DATA_DIR){
    await (await import("../diagnostics/nativeAboutPreview.js")).nativeAboutPreview({app,texture:brandingTextures.get(settings.draft.launchpadIconVariant.value)!,
      directory:process.env.LAUNCHPAD_ABOUT_PREVIEW_DIR,openAbout:()=>{openSettings();settingsNavigation.selectTab("about");nativeSettings.redraw();},
      present:name=>present(app,name),quit:()=>closeCoordinator.requestQuit()});
    await closed;return;
  }

  if(__LUMERIA_DIAGNOSTICS__ && nativeMode === "dev" && process.env.LAUNCHPAD_NATIVE_STRESS_DIR){
    await (await import("../diagnostics/nativeStress.js")).runNativeStress({
      app,scene,editing:editing!,folder:folderFlow,icons:iconTextures,background:desktopBackground,backgroundConfig,selectionToolbar,
      pages:()=>layoutState.presentation.pages.value,page:commitDesktopPage,folderPage:setFolderPageIndex,
      closeFolder,show:showLaunchpad,hide:dismissLaunchpad,quit:()=>closeCoordinator.requestQuit(),
    });
    await closed;return;
  }

  if(__LUMERIA_DIAGNOSTICS__&&process.env.LAUNCHPAD_NATIVE_IMPORT_CHECK==="1"){
    await (await import("../diagnostics/nativeImportPreview.js")).runNativeImportPreview({app,apps:apps!,settings,management,showSources:()=>{settingsNavigation.selectTab("apps");openSettings();},appDialogs:appDialogs!,onboarding:onboarding!,present:description=>present(app,description),save:()=>saves.flush(),quit:()=>closeCoordinator.requestQuit()});
    return;
  }
  if(__LUMERIA_DIAGNOSTICS__&&process.env.LAUNCHPAD_INTERACTION_BENCH){
    await (await import("../diagnostics/nativeInteractionBench.js")).runNativeInteractionBench({app,editing:editing!,scene,
      items:()=>activePageItems,present:name=>present(app,name),waitFor,quit:()=>closeCoordinator.requestQuit()});return;
  }

  if(__LUMERIA_DIAGNOSTICS__&&process.env.LAUNCHPAD_LIVE_DESKTOP_PROOF){
    await (await import("../diagnostics/nativeLiveDesktopSmoke.js")).runNativeLiveDesktopSmoke({
      app,live:liveDesktop,diagnostics:productDiagnostics,show:showLaunchpad,hide:dismissLaunchpad,sync:syncLiveDesktop,
      present:name=>present(app,name),waitFor,quit:()=>closeCoordinator.requestQuit(),
    });return;
  }

  if(__LUMERIA_DIAGNOSTICS__&&process.env.LAUNCHPAD_PAGING_BENCH){
    await (await import("../diagnostics/nativePagingBenchSmoke.test.js")).runNativePagingBench({
      app,
      commitDesktopPage:index=>commitDesktopPage(index),
      currentFrame:()=>currentFrame,
      getLayoutPages:()=>layoutState.presentation.pages.value,
      iconTextures,
      present:description=>present(app,description),
      requestQuit:()=>closeCoordinator.requestQuit(),
      scene,
      waitFor,
    });
    await closed;return;
  }

  if(__LUMERIA_DIAGNOSTICS__ && nativeMode==="smoke" && process.env.LAUNCHPAD_NATIVE_SEARCH_SMOKE==="1"){
    const searchOutcome = await (await import("../diagnostics/nativeLaunchSearchSmoke.test.js")).runNativeSearchSmoke({
      activateItem:item=>activateItem(item),
      activePageItems:()=>activePageItems,
      app,
      capture:name=>smoke!.captureSmokeFrame(app,name),
      closeSettings,
      currentFrame:()=>currentFrame,
      editing:()=>editing,
      getLayoutPages:()=>layoutState.presentation.pages.value,
      getSettingsShell:()=>nativeSettings.shell,
      iconTextures,
      launchGhostView,
      layoutIconSize:()=>layoutState.presentation.iconSize.value,
      management,
      nativeData,
      openSettings:()=>openSettings(),
      present:description=>present(app,description),
      scene,
      searchBar,
      searchQuery:()=>searchQuery,
      settingsButton,
      showLaunchpad:()=>showLaunchpad(),
      smoke:smoke!,
      waitFor,
    });
    if(searchOutcome.kind==="search")return;
  }

  if(__LUMERIA_DIAGNOSTICS__ && nativeMode==="smoke" && process.env.LAUNCHPAD_NATIVE_DRAG_NAVIGATION_SMOKE==="1"){
    await (await import("../../rendering/native/nativeDragNavigationSmoke.test.js")).runNativeDragNavigationSmoke({
      app,editing:()=>editing,layoutState,scene,folderFlow,currentFrame:()=>currentFrame,
      onDesktopPageIndexCommit:index=>onDesktopPageIndexCommit(index),present:description=>present(app,description),
      waitFor,capture:name=>smoke!.captureSmokeFrame(app,name),saves,
    });
    const {writeFileSync}=await import("node:fs");
    writeFileSync(process.env.LAUNCHPAD_NATIVE_SMOKE_MARKER!,JSON.stringify({dragNavigation:"verified"}));
    return;
  }

  if(__LUMERIA_DIAGNOSTICS__ && nativeMode==="smoke" && process.env.LAUNCHPAD_NATIVE_LAUNCH_VISUAL_SMOKE==="1"){
    const launchOutcome = await (await import("../diagnostics/nativeLaunchSearchSmoke.test.js")).runNativeLaunchVisualSmoke({
      activateItem:item=>activateItem(item),
      activePageItems:()=>activePageItems,
      app,
      capture:name=>smoke!.captureSmokeFrame(app,name),
      closeSettings,
      currentFrame:()=>currentFrame,
      editing:()=>editing,
      getLayoutPages:()=>layoutState.presentation.pages.value,
      getSettingsShell:()=>nativeSettings.shell,
      iconTextures,
      launchGhostView,
      layoutIconSize:()=>layoutState.presentation.iconSize.value,
      management,
      nativeData,
      openSettings:()=>openSettings(),
      present:description=>present(app,description),
      scene,
      searchBar,
      searchQuery:()=>searchQuery,
      settingsButton,
      showLaunchpad:()=>showLaunchpad(),
      smoke:smoke!,
      waitFor,
    });
    if(launchOutcome.kind==="launch-visual")return;
  }

  if (__LUMERIA_DIAGNOSTICS__) {
  const { runNativeFolderRenameSmoke, runNativeWindowActivationSmoke } = await import("../diagnostics/nativeInteractionSmoke.js");
  const { activationClickOwnedNativeWindow, captureOwnedWindow, clickOwnedNativeWindow, cycleOwnedWindowFocus, dragOwnedNativeWindow } = smoke!;
  const captureSmokeFrame = (name: string) => smoke!.captureSmokeFrame(app, name);
  const interactionSmoke: import("../diagnostics/nativeInteractionSmoke.js").NativeInteractionSmokeContext = {
    activateItem, app, capture:captureSmokeFrame, click:(target,button)=>clickWithNativeInput(target,button??0),
    closeFolder, contextMenu, folderFlow, folderNameInput, launchFlow:launchFlow!, layoutState, management,
    onKey, present:description=>present(app,description), readTouchId, saves, scene, searchBar,
    showLaunchpad:()=>showLaunchpad(), smokeActions:{activationClickOwnedNativeWindow,clickOwnedNativeWindow},
    t, waitFor,
  };
  if (process.env.LAUNCHPAD_NATIVE_FOLDER_RENAME_SMOKE === "1" || process.env.LAUNCHPAD_NATIVE_WALLPAPER_FAILURE_SMOKE) {
    const brandingSmokeOutcome = await (await import("../diagnostics/nativeBrandingSmoke.js")).runNativeBrandingSmoke({
      activateItem:item=>activateItem(item),
      app,
      backgroundConfig,
      branding,
      brandingDirectory:join(import.meta.dir,"branding"),
      capture:captureSmokeFrame,
      closeFolder,
      desktopBackground,
      folderFlow,
      getActivePageItems:()=>activePageItems,
      nativeLogPath,
      notices,
      present:description=>present(app,description),
      refreshBackground,
      refreshWindowChrome:()=>refreshWindowChrome(),
      runFolderRename:folder=>runNativeFolderRenameSmoke(interactionSmoke,folder),
      runWindowActivation:()=>runNativeWindowActivationSmoke(interactionSmoke),
      scene,
      settings,
      waitFor,
      windowChrome,
    });
    if(brandingSmokeOutcome.kind==="wallpaper-failure"||brandingSmokeOutcome.kind==="folder-rename")return;
  }
  if (nativeMode === "smoke") {
    const hostSmoke = await (await import("../diagnostics/nativeHostSmoke.test.js")).runNativeHostSmoke({
      activePageItems:()=>activePageItems,
      app,
      capture:captureSmokeFrame,
      captureOwnedWindow,
      changeSearch:query=>changeSearch(query),
      chromeInset,
      clickOwnedNativeWindow,
      closeFolder,
      closeSettings,
      cycleOwnedWindowFocus,
      desktopBackground,
      dismissLaunchpad:()=>dismissLaunchpad(),
      folderFlow,
      getSettingsShell:()=>nativeSettings.shell,
      getSystemAppearance:()=>systemAppearance,
      launchFlow:()=>launchFlow!,
      mainShortcut,
      nativeData,
      onKey,
      openSettings:()=>openSettings(),
      present:description=>present(app,description),
      readTouchId,
      refreshBackground,
      scene,
      sceneUpdates,
      searchBar,
      settings,
      settingsButton,
      showLaunchpad:()=>showLaunchpad(),
      smoke:smoke!,
      toggleLaunchpad:()=>toggleLaunchpad(),
      tray:()=>tray,
      waitFor,
      windowEffects,
    });
    // `handled` reports that the smoke-only host scenarios ran; the structured
    // launch-failure probe feeds the existing proof flag.
    structuredLaunchFailureObserved ||= hostSmoke.structuredLaunchFailureObserved;
    const baselinePages=layoutState.operations.clonePages(layoutState.presentation.pages.value);
    const baselineConfig=layoutState.captureConfiguration();
    await (await import("../diagnostics/nativeSettingsSmoke.test.js")).runNativeSettingsSmoke({
      app,
      appDialogs:()=>appDialogs,
      apps:()=>apps!,
      appsPageState,
      backgroundBaseline:backgroundConfig(),
      backgroundPanelState,
      baselineConfig,
      baselinePages,
      brandingDirectory:join(import.meta.dir,"branding"),
      capture:captureSmokeFrame,
      captureOwnedWindow,
      commitEditedPages,
      desktopBackground,
      dragOwnedNativeWindow,
      getRecordingShortcut:()=>nativeSettings.isRecordingShortcut(),
      getSettingsShell:()=>nativeSettings.shell,
      isWindowClosing:()=>closeCoordinator.closing,
      launchFlow:launchFlow!,
      layoutSettings,
      layoutState,
      management,
      nativeData,
      navigation:settingsNavigation,
      notices,
      noticeView,
      onKey,
      openSettings:()=>openSettings(),
      present:description=>present(app,description),
      refreshBackground,
      removeItems,
      requestQuit:()=>closeCoordinator.requestQuit(),
      restoreCommittedLayout:async(config,pages)=>{
        layoutState.applyConfiguration(config);layoutSettings.syncDraftsFromCommitted();
        currentFrame=Object.freeze({...currentFrame,viewport:Object.freeze({...currentFrame.viewport,gridRows:config.rows,gridCols:config.cols,iconSize:config.iconSize})});
        commitEditedPages(pages);await saves.flush();
      },
      saves,
      scene,
      searchBar,
      settings,
      settingsButton,
      settingsTheme,
      showLaunchpad:()=>showLaunchpad(),
      smoke:smoke!,
      systemAppearance:()=>systemAppearance,
      tray:()=>tray,
      waitFor,
      windowChrome,
      windowPanelState,
    });


    await (await import("../diagnostics/nativeDesktopSmoke.test.js")).runNativeDesktopSmoke({
      activePageItems:()=>activePageItems,
      app,
      appDialogs:()=>appDialogs,
      apps:()=>apps!,
      baselinePages,
      catalogApps:catalogResult.apps,
      capture:captureSmokeFrame,
      chromeInset,
      click:(target,button,modifiers)=>clickWithNativeInput(target,button??0,modifiers??0),
      commitEditedPages,
      contextMenu,
      currentFrame:()=>currentFrame,
      editItem,
      editing:()=>editing,
      folderFlow,
      isDesktopOpen:()=>Boolean(launchFlow?.isDesktopOpen.value),
      layoutState,
      management,
      nativeData,
      onDesktopPageIndexCommit:index=>onDesktopPageIndexCommit(index),
      onKey,
      present:description=>present(app,description),
      saves,
      scene,
      searchBar,
      searchQuery:()=>searchQuery,
      selectionToolbar,
      smoke:smoke!,
      t,
      waitFor,
    });
    await (await import("../diagnostics/nativePagingSmoke.test.js")).runNativePagingSmoke({
      activePageItems:()=>activePageItems,
      app,
      capture:captureSmokeFrame,
      click:target=>clickWithNativeInput(target),
      closeSettings:()=>closeSettings(),
      commitDesktopPage:index=>commitDesktopPage(index),
      currentFrame:()=>currentFrame,
      getSettingsShell:()=>nativeSettings.shell,
      iconNodes:()=>iconNodes,
      interruptWheel,
      isDesktopPageMotionObserved:()=>desktopPageMotionObserved,
      onKey,
      openSettings:()=>openSettings(),
      present:description=>present(app,description),
      scene,
      setFocusedIcon,
      smoke:smoke!,
      turnPage:direction=>turnPage(direction),
      waitFor,
    }).then(outcome=>{
      presentCount+=outcome.presentCount;
      if(outcome.pageNavigation==="verified")pageNavigation="verified";
    });
    await (await import("../diagnostics/nativeFolderSmoke.js")).runNativeFolderSmoke({
      editing:editing!,
      activateItem:item=>activateItem(item),
      addPresent:count=>{presentCount+=count;},
      app,
      click:target=>clickWithNativeInput(target),
      closeFolder,
      desktopBackground,
      folderFlow,
      folderLayout,
      getActivePageItems:()=>activePageItems,
      getCurrentFocus:()=>currentFrame.interaction.focusedIcon,
      launchFlow:launchFlow!,
      launchGhostView,
      layoutState,
      onKey,
      present:description=>present(app,description),
      record:{
        folderChildLaunchObserved:()=>{folderChildLaunchObserved=true;},
        folderCloseMotionObserved:()=>{folderCloseMotionObserved=true;},
        folderOpenMotionObserved:()=>{folderOpenMotionObserved=true;},
        folderPageMotionObserved:()=>{folderPageMotionObserved=true;},
      },
      runFolderRename:folder=>runNativeFolderRenameSmoke(interactionSmoke,folder),
      scene,
      setFolderPageIndex,
      settingsButton,
      showLaunchpad:()=>showLaunchpad(),
      smoke:smoke!,
      turnFolderPage,
      waitFor,
    });

    const surfaceProof = await (await import("../diagnostics/nativeSurfaceProof.js")).runNativeSurfaceProof({
      app,
      commitScene,
      getLiveBackingObserved: () => resizeLiveBackingObserved,
      getObservedResizeEvents: () => resizeEvents,
      iconNodes:()=>iconNodes,
      initialWork: sceneController.readWork(),
      present: description => present(app, description),
      selectionToolbarX: () => selectionToolbar.x,
      setObserveLiveResize: value => { observeLiveResize = value; },
      settingsButtonX: () => settingsButton.x,
      searchBarX: () => searchBar.x,
      waitFor,
    });
    presentCount += surfaceProof.presentCount;
    sceneController.adoptWork(surfaceProof.work);
    resizeObserved = surfaceProof.resizeObserved;
    resizePresentCount = surfaceProof.resizePresentCount;
    resizeSettledBackingObserved = surfaceProof.resizeSettledBackingObserved;
    restoreObserved = surfaceProof.restoreObserved;
    restorePresentCount = surfaceProof.restorePresentCount;
    if (surfaceProof.dpiTransition !== null) dpiTransition = surfaceProof.dpiTransition;
    if (surfaceProof.dpiResolution !== null) dpiResolution = surfaceProof.dpiResolution;
  }

  }

  if(closeCoordinator.closing||["closing","closed"].includes(app.state))return;
  iconNodes=collectActiveIconNodes();
  const visibleNodes = iconNodes.filter((node) => (
    node.alpha >= 0.999 && node.renderable && node.visible
  )).length;
  if (__LUMERIA_DIAGNOSTICS__ && nativeMode === "smoke" && visibleNodes !== iconNodes.length) {
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

  if ((__LUMERIA_DIAGNOSTICS__ && nativeMode === "smoke")) {
    const { captureNativeSmokeProof } = await import("../diagnostics/nativeSmokeProof.js");
    await captureNativeSmokeProof({
      activePageItems,
      app,
      background: NATIVE_BACKGROUND,
      iconNodes,
      smoke: smoke!,
      inputs: {
        backingHeight,
        backingWidth,
        catalogApps: catalogResult.apps.length,
        contentSize,
        desktopPageMotionObserved,
        dpiResolution,
        dpiTransition,
        folderChildLaunchObserved,
        folderCloseMotionObserved,
        folderOpenMotionObserved,
        folderPageMotionObserved,
        loadedLayout: loadedLayout !== null,
        pageCount: currentFrame.viewport.activePages.length,
        pageNavigation,
        presentCount,
        reconciledNodes: sceneController.readWork().reconciledNodes,
        resizeLiveBackingObserved,
        resizeObserved,
        resizePresentCount,
        resizeSettledBackingObserved,
        resolution,
        restoreObserved,
        restorePresentCount,
        structuredLaunchFailureObserved,
        visibleNodes,
      },
    });
  } else {
    console.log(JSON.stringify({
      catalogApps: catalogResult.apps.length,
      loadedLayout: loadedLayout !== null,
      pageCount: currentFrame.viewport.activePages.length,
      reconciledNodes: sceneController.readWork().reconciledNodes,
      resolution,
      visibleNodes,
    }, null, 2));
    if((__LUMERIA_DIAGNOSTICS__ ? process.env.LAUNCHPAD_NATIVE_SETTINGS_ONLY : undefined)==="1"){
      if(process.env.LAUNCHPAD_NATIVE_TOGGLE_PROOF){
        await (await import("../diagnostics/nativeToggleSmoke.js")).runNativeToggleSmoke({app,nativeData,settings,open:openSettings,close:()=>nativeSettings.close(),shell:()=>nativeSettings.shell!,directory:process.env.LAUNCHPAD_NATIVE_TOGGLE_PROOF});
        closeCoordinator.requestQuit();return;
      }
      if((__LUMERIA_DIAGNOSTICS__ ? process.env.LAUNCHPAD_NATIVE_WINDOW_CARD_PREVIEW : undefined)==="1"){settingsNavigation.selectTab("interface");windowPanelState.mode=true;}
      if((__LUMERIA_DIAGNOSTICS__ ? process.env.LAUNCHPAD_NATIVE_APPS_PREVIEW : undefined)==="1")settingsNavigation.selectTab("apps");
      openSettings();
    }
    if((__LUMERIA_DIAGNOSTICS__ ? process.env.LAUNCHPAD_NATIVE_RESTART_SMOKE : undefined)==="1"){
      await (await import("../diagnostics/nativeRestartSmoke.test.js")).runNativeRestartSmoke({
        app,
        editing:()=>editing,
        layoutState,
        log:event=>logNativeRuntime(event),
        nativeLogPath,
        saves,
        tray:()=>tray,
        waitFor,
      });
    }
    if((__LUMERIA_DIAGNOSTICS__ ? process.env.LAUNCHPAD_MEMORY_BENCH : undefined)){
      const {runNativeAppsMemoryBenchmark}=await import("../nativeAppsMemoryBenchmark.js");
      await runNativeAppsMemoryBenchmark({apps:apps!,host:searchBar.host,width:740,theme:"dark",state:appsPageState,subPage:"apps.appManager",management,icons:iconTextures,
        invalidate:()=>app.invalidate(),redraw:()=>{},navigate:()=>{},edit:()=>{}},app.stage,()=>present(app,"memory benchmark frame"));
    }else await closed;
  }
} finally {
  offInputFrame();inputFrames.dispose();
  if(liveDesktopTimer)clearInterval(liveDesktopTimer);
  // Disconnect the renderer and invalidate queued tasks before any disposer can
  // publish state changes or schedule drag/animation completion callbacks.
  sceneUpdates.dispose();offCatalogCompleted();catalogRefresh?.dispose();startupPreparation?.dispose();textPrewarm.dispose();offResumePrepare();
  if(productDiagnostics){const result=await productDiagnostics.dispose();if(result.errors.length)logNativeRuntime("diagnostics-dispose-errors",result.errors);}
  unbindResumeRenderer();
  windowEffects.dispose();
  try{liveDesktop.dispose();}catch(error){logNativeRuntime("live-desktop-stop-error",error);}
  tray?.remove();tray=null;
  disposeLaunchFlow();
  desktopBackground.destroy();
  newAppsButton.destroy({children:true});
  hotCorners.dispose();
  mainShortcut.dispose();
  nativeSettings.dispose();
  branding.destroy();
  nativeInputRouter?.dispose();
  editing?.dispose();
  offSaveBeforeClose();
  disconnectAnimationHost();
  folderFlow.destroy();
  offFocus();
  offSystemPreferences();
  offResize();
  offBackgroundResize();
  offPresented();
  offStateChange();
  offFatal();offRecovered();offFrameError();offRecoveryPresented();logNativeRuntime("shutdown");
  scene.destroy();
  app.stage.off("rightclick",onContext);
  management.destroy();
  notices.clearTransientNoticeTimer();notices.clearWarningDialogTimer();noticeView.destroy({children:true});
  folderNameInput.destroy();
  searchBar.destroy();
  selectionToolbar.destroy();app.stage.filters=[];selectionBackdropSurface.destroy();
  iconTextures.dispose();
}
}
