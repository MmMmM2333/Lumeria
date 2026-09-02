import { writeFileSync } from "node:fs";
import { Screen } from "electrobun/main";
import {
  Container,
  Rectangle,
  Text,
  type FederatedWheelEvent,
  type Sprite,
} from "pixi.js";
import {
  createNativePixiApplication,
  type NativePixiApplication,
} from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { NativeDesktopScene } from "../rendering/native/NativeDesktopScene.js";
import { createNativeIconTextureRepository } from "../rendering/native/nativeIconTextureLoader.js";
import type { SceneItem } from "../rendering/sceneFrame.js";
import type { LayoutDocument } from "../domain/layoutDocument.js";
import {
  NativeDataHost,
  NativeLaunchError,
  type NativeCatalogScanResult,
} from "./nativeDataHost.js";
import {
  getNativeActivePageItems,
  getNativePageTurnFromKey,
  getNativePageTurnFromWheel,
  makeNativeStartupFrame,
  makeNativeStartupScanRequest,
  turnNativeDesktopPage,
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
  height: number;
  loadedLayout: boolean;
  pageCount: number;
  pageNavigation: "skipped-single-page" | "verified";
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

async function present(app: NativePixiApplication, description: string): Promise<void> {
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
    fontFamily: "Segoe UI",
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

let launchInFlight = false;
async function activateItem(item: SceneItem): Promise<void> {
  const name = typeof item.name === "string" ? item.name : item.id;
  if (item.type === "folder") {
    setStatus(`Folder opening is not migrated yet: ${name}`, 0xf0b86e);
    return;
  }
  if (launchInFlight) return;
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
  iconTextures,
  onIconActivate: (item) => void activateItem(item),
});
app.stage.addChild(statusText);
let offResize = (): void => {};
let offStateChange = (): void => {};
let offKey = (): void => {};
let offWheel = (): void => {};
let disconnectAnimationHost = (): void => {};

try {
  await present(app, "the native host startup frame");
  const iconTextureSnapshot = await iconTextures.synchronize(activePageItems);
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

  let work = scene.commit(currentFrame, {
    height: app.contentSize.height,
    resolution: app.resolution,
    width: app.contentSize.width,
  });
  let resizeEvents = 0;
  let resizeLiveLogicalObserved = false;
  let adaptiveResizeBaseline: Readonly<{ height: number; width: number }> | null = null;
  offResize = app.on("resize", ({ height, resolution, width }) => {
    work = scene.commit(currentFrame, { height, resolution, width });
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
  let pageTurnInFlight = false;
  async function turnPage(direction: Exclude<NativePageTurn, 0>): Promise<boolean> {
    if (pageTurnInFlight) return false;
    const nextFrame = turnNativeDesktopPage(currentFrame, direction);
    if (nextFrame === currentFrame) return false;
    pageTurnInFlight = true;
    try {
      const nextItems = getNativeActivePageItems(nextFrame);
      const snapshot = await iconTextures.synchronize([...activePageItems, ...nextItems]);
      if (snapshot.pending.length !== 0) {
        throw new Error(`Native page icon textures remained pending: ${JSON.stringify(snapshot)}`);
      }
      if (snapshot.failed.length > 0) {
        console.warn("Some native page icon textures could not be loaded", snapshot.failed);
      }
      currentFrame = nextFrame;
      activePageItems = nextItems;
      work = scene.commit(currentFrame, {
        height: app.contentSize.height,
        resolution: app.resolution,
        width: app.contentSize.width,
      });
      iconNodes = collectActiveIconNodes();
      setStatus("");
      await present(app, `desktop page ${currentFrame.viewport.activePageIndex + 1}`);
      presentCount += 1;
      return true;
    } finally {
      pageTurnInFlight = false;
    }
  }

  const reportPageTurnFailure = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Native desktop page turn failed", error);
    setStatus(`Page turn failed: ${message}`, 0xff7b72);
  };
  const onWheel = (event: FederatedWheelEvent): void => {
    const direction = getNativePageTurnFromWheel(event);
    if (direction === 0) return;
    event.preventDefault();
    void turnPage(direction).catch(reportPageTurnFailure);
  };
  app.stage.on("wheel", onWheel);
  offWheel = () => app.stage.off("wheel", onWheel);
  offKey = app.nativeInput.onKey((event) => {
    const direction = getNativePageTurnFromKey(event);
    if (direction !== 0) {
      void turnPage(direction).catch(reportPageTurnFailure);
      return;
    }
    if (
      event.type !== "down"
      || event.repeat
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.isComposing
      || (event.key !== "Enter" && event.key !== " " && event.code !== "Space")
    ) return;
    const focusedId = currentFrame.interaction.focusedIcon?.id;
    const focused = activePageItems.find((item) => item.id === focusedId);
    if (focused) void activateItem(focused);
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

    if (currentFrame.viewport.activePages.length > 1) {
      if (!await turnPage(1)) throw new Error("Native smoke could not turn to the second desktop page");
      await waitFor(
        "the second native desktop page to become visible",
        () => iconNodes.every((node) => node.alpha >= 0.999 && node.renderable && node.visible),
      );
      await present(app, "the settled second desktop page");
      presentCount += 1;
      if (!await turnPage(-1)) throw new Error("Native smoke could not return to the first desktop page");
      await waitFor(
        "the first native desktop page to become visible again",
        () => iconNodes.every((node) => node.alpha >= 0.999 && node.renderable && node.visible),
      );
      await present(app, "the restored first desktop page");
      presentCount += 1;
      pageNavigation = "verified";
    }

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
      work = scene.commit(currentFrame, {
        height: app.contentSize.height,
        resolution: app.resolution,
        width: app.contentSize.width,
      });
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
    work = scene.commit(currentFrame, {
      height: app.contentSize.height,
      resolution: app.resolution,
      width: app.contentSize.width,
    });
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
    const proof: NativeProof = Object.freeze({
      ...pixelProof,
      backingHeight,
      backingWidth,
      catalogApps: catalogResult.apps.length,
      dpiResolution,
      dpiTransition,
      height: contentSize.height,
      loadedLayout: loadedLayout !== null,
      pageCount: currentFrame.viewport.activePages.length,
      pageNavigation,
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
  disconnectAnimationHost();
  offKey();
  offWheel();
  offResize();
  offStateChange();
  scene.destroy();
  iconTextures.dispose();
  await app.dispose();
  await nativeData.dispose();
}
