import { existsSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Screen } from "electrobun/main";
import {
  Container,
  Rectangle,
  Text,
  FederatedWheelEvent,
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
let currentFrame = makeNativeStartupFrame(loadedLayout, catalogResult.apps);
let activePageItems = getNativeActivePageItems(currentFrame);
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

function clickWithNativeInput(target: Container): void {
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
  app.nativeInput.emitPointer("pointermove", x, y, 0);
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
  app.nativeInput.emitPointer("pointerdown", x, y, 0);
  app.nativeInput.emitPointer("pointerup", x, y, 0);
}

let launchInFlight = false;
let renderScene: () => void;
let sceneRenderQueued = false;
const requestSceneRender = (): void => {
  if (sceneRenderQueued) return;
  sceneRenderQueued = true;
  queueMicrotask(() => {
    sceneRenderQueued = false;
    renderScene();
  });
};
const folderFlow = createNativeFolderFlow(() => requestSceneRender());

function setFocusedIcon(focusedIcon: SceneFocusedIcon | null): void {
  currentFrame = Object.freeze({
    ...currentFrame,
    interaction: Object.freeze({ ...currentFrame.interaction, focusedIcon: focusedIcon ? Object.freeze({ ...focusedIcon }) : null }),
  });
  requestSceneRender();
}

function getCurrentIconScope(): LaunchpadIconScope<SceneItem> {
  const folder = folderFlow.snapshot();
  return folder.renderedFolder ? {
    area: "folder", columns: folderLayout.cols, folderId: folder.renderedFolder.id,
    items: (folder.renderedFolder.childPages[folder.folderPageIndex] ?? []).filter((item): item is SceneItem => item !== null),
    pageIndex: folder.folderPageIndex,
  } : {
    area: "desktop", columns: currentFrame.viewport.gridCols, folderId: null,
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

async function activateItem(item: SceneItem): Promise<void> {
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

const scene = new NativeDesktopScene(app.stage, {
  folderLayout,
  iconTextures,
  onFolderCloseRequest: closeFolder,
  onFolderInternalActivityChange: (active, folderId) => {
    folderFlow.notifyInternalActivity(active, folderId);
  },
  onFolderPageIndexCommit: setFolderPageIndex,
  onFolderRenderRequest: requestSceneRender,
  onIconActivate: (item) => void activateItem(item),
});
app.stage.addChild(statusText);
let offResize = (): void => {};
let offStateChange = (): void => {};
let offKey = (): void => {};
let offWheel = (): void => {};
let offWheelPointerInterrupt = (): void => {};
let disconnectAnimationHost = (): void => {};
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
    work = commitScene({
      height: app.contentSize.height,
      resolution: app.resolution,
      width: app.contentSize.width,
    }, false);
    app.invalidate();
  };
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
    const timestamp = Number(event.timeStamp);
    const time = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : performance.now();
    applyWheelOutput(wheelGestures.dispatch({ type: "cancel", time }), null, time);
  };
  app.stage.on("pointerdowncapture", interruptWheel);
  offWheelPointerInterrupt = () => app.stage.off("pointerdowncapture", interruptWheel);
  const onKey = (event: NativeNavigationKey): void => {
    if (event.type !== "down" || event.isComposing || event.altKey || event.metaKey) return;
    const key = event.key || event.code;
    const direction = getNativePageTurnFromKey(event);
    const arrow = key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
    if (event.ctrlKey && direction === 0) return;
    if (!arrow && key !== "Enter" && key !== "Escape") return;
    if (event.repeat && !arrow) return;
    wheelGestures.dispatch({ type: "cancel", time: performance.now() });
    for (const timer of wheelDeadlines.values()) clearTimeout(timer);
    wheelDeadlines.clear();
    clearWheelPresentation();
    const folder = folderFlow.snapshot();
    if (key === "Escape") {
      closeFolder();
      return;
    }
    if (folder.isClosing) return;
    if (direction !== 0) {
      const changed = folder.renderedFolder ? turnFolderPage(direction) : turnPage(direction);
      if (changed) setFocusedIcon(firstIconFocus(getCurrentIconScope()));
      return;
    }
    const scope = getCurrentIconScope();
    if (arrow) {
      setFocusedIcon(moveIconFocus(currentFrame.interaction.focusedIcon, scope, key));
    } else if (key === "Enter") {
      const focused = findFocusedIcon(currentFrame.interaction.focusedIcon, scope);
      if (focused) void activateItem(focused);
      else setFocusedIcon(firstIconFocus(scope));
    }
  };
  offKey = app.nativeInput.onKey(onKey);

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

    await captureSmokeFrame("desktop-page-1");
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
    if (folderFlow.close()) {
      throw new Error("Native folder close should be rejected until opening settles");
    }
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
  for (const timer of wheelDeadlines.values()) clearTimeout(timer);
  wheelDeadlines.clear();
  disconnectAnimationHost();
  folderFlow.destroy();
  offKey();
  offWheel();
  offResize();
  offStateChange();
  scene.destroy();
  iconTextures.dispose();
  await app.dispose();
  await nativeData.dispose();
}
