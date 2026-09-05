import { t, setNativeLocale } from "./nativeLocalization.js";
import { existsSync, writeFileSync } from "node:fs";
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
import type { LaunchpadPages } from "../domain/launchpadLayout.js";
import { createNativeIconTextureRepository } from "../rendering/native/nativeIconTextureLoader.js";
import {
  createNativeFolderFlow,
  type NativeFolderItem,
} from "../rendering/native/nativeFolderFlow.js";
import type { SceneFocusedIcon, SceneItem, ScenePageTrackScrub } from "../rendering/sceneFrame.js";
import { PIXI_UI_FONT_FAMILY } from "../rendering/typography.js";
import type { LayoutDocument } from "../domain/layoutDocument.js";
import { DEFAULT_FOLDER_COLS, DEFAULT_FOLDER_ROWS } from "../domain/launchpadGridDefaults.js";
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
let hiddenAppIds=[...(loadedLayout?.settings.hiddenAppIds ?? [])];
const saves = createLayoutSaveQueue(document => nativeData.saveLayout(document));
let currentFrame = makeNativeStartupFrame(loadedLayout, catalogResult.apps, layoutState.presentation.pages.value);
let activePageItems = getNativeActivePageItems(currentFrame);
let searchQuery = "";
const folderLayout = Object.freeze({
  cols: loadedLayout?.settings.folderCols ?? DEFAULT_FOLDER_COLS,
  iconSize: loadedLayout?.settings.folderIconSizeMode === "custom"
    ? loadedLayout.settings.folderIconSize
    : currentFrame.viewport.iconSize,
  rows: loadedLayout?.settings.folderRows ?? DEFAULT_FOLDER_ROWS,
});

const app = await createNativePixiApplication({
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
let changeSearch: (query: string) => void;
const searchBar = new NativeSearchBar(app, loadedLayout?.settings.localePreference === "en-US" ? "Search" : t("launchpad.search.placeholder"), query => changeSearch(query));
const management = new NativeManagement(searchBar.host, () => app.contentSize, () => app.invalidate());

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

let launchInFlight = false;
let renderScene: () => void;
let sceneRenderQueued = false;
const requestSceneRender = (): void => {
  if (sceneRenderQueued) return;
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
  const name = typeof item.name === "string" ? item.name : item.id;
  if (item.type === "folder") {
    if (folderFlow.open(item)) {
      setFocusedIcon(null);
      setStatus("");
    }
    return;
  }
  if (launchInFlight) return;
  if (folderFlow.snapshot().renderedFolder && !closeFolder()) return;
  launchInFlight = true;
  setStatus(`Launching ${name}...`);
  try {
    await saves.flush();
    await nativeData.launchApp(item.id);
    setStatus(`Launch request accepted: ${name}`, 0x8bd49c);
  } catch (error) {
    const message = error instanceof NativeLaunchError
      ? `${error.kind}: ${error.detail}`
      : error instanceof Error ? error.message : String(error);
    console.error(`Failed to launch ${item.id}`, error);
    setStatus(`Launch failed: ${message}`, 0xff7b72);
  } finally {
    launchInFlight = false;
  }
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
const onContext = (event: FederatedPointerEvent):void=>{
  const target=resolveNativePointerTarget(event.target);
  if(target.kind==="control")return;
  const id=target.kind==="icon"?target.id:null;
  const item=id?getCurrentIconScope().items.find(item=>item.id===id)??null:null;
  contextMenu(item,event.global.x,event.global.y);event.stopPropagation();
};
app.stage.on("rightclick",onContext);
let offResize = (): void => {};
const offPresented = app.on("presented", () => {
  folderFlow.commitPresented(scene.commitPresentedFrame());
});
let offStateChange = (): void => {};
let offFocus = (): void => {};
let offWheel = (): void => {};
let offWheelPointerInterrupt = (): void => {};
let offTouch = (): void => {};
let disconnectAnimationHost = (): void => {};
const offSaveBeforeClose = app.beforeClose(async () => {
  try { await saves.flush(); }
  catch (error) { setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`, 0xff7b72); throw error; }
});
const wheelDeadlines = new Map<
  LaunchpadGestureDeadline["kind"],
  ReturnType<typeof setTimeout>
>();

try {
  await present(app, "the native host startup frame");
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
    searchBar.update(app.contentSize.width, Boolean(editing?.selection.isActive.value || (folderFlow.snapshot().renderedFolder && !folderFlow.snapshot().isClosing)));
    selectionToolbar.visible=Boolean(editing?.selection.isActive.value);
    const toolbarWidth=Math.min(760,app.contentSize.width-40);
    selectionToolbar.position.set((app.contentSize.width-toolbarWidth)/2,14);
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
    app.invalidate();
  };
  searchBar.update(app.contentSize.width, false);
  let resizeEvents = 0;
  let resizeLiveLogicalObserved = false;
  let adaptiveResizeBaseline: Readonly<{ height: number; width: number }> | null = null;
  offResize = app.on("resize", ({ height, resolution, width }) => {
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
    const document = layoutState.operations.createLayoutSnapshot({ ...loadedLayout?.settings,
      pages, gridRows: config.rows, gridCols: config.cols, folderRows: config.folderRows, folderCols: config.folderCols,
      iconSize: config.iconSize, folderIconSize: config.folderIconSize, folderIconSizeMode: config.folderIconSizeMode,
      textless: loadedLayout?.settings.textless ?? false, hiddenAppIds });
    saves.enqueue(document);
    void saves.flush().catch(error => setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`, 0xff7b72));
    changeSearch(searchQuery);
    requestSceneRender();
  };
  editing = createNativeEditing({ layout: layoutState, scene, folder: folderFlow,
    size: () => app.contentSize, changed: requestSceneRender, commit: commitEditedPages,
    page: index => onDesktopPageIndexCommit(index), folderPage: setFolderPageIndex,
    open: id => {
      if(!id) { closeFolder(); return; }
      const item = editing?.projectedPages().flat().find(item => item.id === id);
      if(item) { folderFlow.open(snapshotContractValue(item) as SceneItem);setFocusedIcon(null);requestSceneRender(); }
    },
  });
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
    if(management.modal || searchBar.input.focused || editing?.drag.isDragActive())return;
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
    if(event.type==="up") {editing?.alt.handleAltKeyUp(event);return false;}
    if(management.modal) {
      const handled=management.handleKey(event);app.invalidate();return handled;
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
    try {
      await nativeData.launchApp(`__launchpad-native-smoke-missing-${process.pid}-${Date.now()}__`);
      throw new Error("Native launch failure smoke unexpectedly succeeded");
    } catch (error) {
      if (!(error instanceof NativeLaunchError) || error.kind !== "missingLaunchInfo") throw error;
      structuredLaunchFailureObserved = true;
    }

    const baselinePages=layoutState.operations.clonePages(layoutState.presentation.pages.value);
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
    app.nativeInput.emitPointer("pointermove",app.contentSize.width/2,30,0,0);
    await present(app,"selected group over cancel zone");
    assert.equal(editing!.drag.groupDragState.value?.cancelArmed,true);
    assert.ok(toolbarSummary.text.includes(t("launchpad.batch.releaseToCancel")));
    await captureSmokeFrame("selection-cancel-zone");
    app.nativeInput.emitPointer("pointerup",app.contentSize.width/2,30,0,0);
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
    app.nativeInput.emitPointer("pointermove",start.x+start.width/2,start.y+start.height/2,0);
    app.nativeInput.emitPointer("pointerdown",start.x+start.width/2,start.y+start.height/2,0);
    await new Promise<void>(resolve=>setTimeout(resolve,450));
    app.nativeInput.emitPointer("pointermove",start.x+start.width/2+35,start.y+start.height/2+30,0);
    await present(app,"native drag preview");
    assert.ok(editing?.drag.isDragActive(),"native mouse movement must enter shared drag");
    editing!.drag.cancelDrag({userInitiatedCancel:true});
    app.nativeInput.emitPointer("pointerup",start.x+start.width/2+35,start.y+start.height/2+30,0);
    await waitFor("drag cancellation release",()=>!editing!.drag.isDragActive());
    await present(app,"drag source restored");
    const moveNode=app.stage.getChildByLabel("launchpad-item:native-settings",true);assert.ok(moveNode);
    const moveBounds=moveNode.getBounds();const mx=moveBounds.x+moveBounds.width/2,my=moveBounds.y+moveBounds.height/2;
    app.nativeInput.emitPointer("pointerdown",mx,my,0);await new Promise<void>(resolve=>setTimeout(resolve,450));
    app.nativeInput.emitPointer("pointermove",mx+30,my+25,0);await present(app,"drag start for committed reorder");
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
    onKey({ type: "down", key: "Escape" });
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
    onKey({ type: "down", key: "Escape" });
    commitDesktopPage(0);
    await settleDesktop();
    wheel(20);
    wheel(20);
    await waitFor("continuous wheel velocity commit", () => currentFrame.viewport.activePageIndex === 1);
    await settleDesktop();
    onKey({ type: "down", key: "Escape" });
    commitDesktopPage(0);
    await settleDesktop();
    wheel(-20);
    await present(app, "first-page edge resistance");
    assert.ok(scene.getMotionSnapshot().desktopPageTrackX > 0, "edge gestures should expose a resisted stretch");
    assert.ok(scene.getMotionSnapshot().desktopPageTrackX < app.contentSize.width * 0.12, "edge stretch must remain bounded");
    await new Promise<void>((resolve) => setTimeout(resolve, 160));
    await settleDesktop();
    assert.equal(currentFrame.viewport.activePageIndex, 0, "edge gestures must not leave the page range");
    onKey({ type: "down", key: "Escape" });
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
    await waitFor(
      "an intermediate native folder closing frame",
      () => {
        const folder = folderFlow.snapshot();
        return folder.isClosing && folder.openProgress > 0.001 && folder.openProgress < 0.999;
      },
    );
    folderCloseMotionObserved = true;
    await waitFor("the native folder child process", () => existsSync(childLaunchMarker));
    folderChildLaunchObserved = true;
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
  offWheelPointerInterrupt();
  offTouch();
  editing?.dispose();
  offSaveBeforeClose();
  for (const timer of wheelDeadlines.values()) clearTimeout(timer);
  wheelDeadlines.clear();
  disconnectAnimationHost();
  folderFlow.destroy();
  offFocus();
  offWheel();
  offResize();
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
