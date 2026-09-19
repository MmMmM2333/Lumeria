import assert from "node:assert/strict";
import { readFileSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { LAUNCHPAD_ICON_VARIANTS } from "../../domain/launchpadIconVariant.js";
import type { NativeBackground } from "../../rendering/native/NativeBackground.js";
import type { createNativeBrandingTextures } from "../../rendering/native/nativeBrandingTextures.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { NativeWindowChrome } from "../../rendering/native/NativeWindowChrome.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";
import type { NativeFolderFlow } from "../product/nativeInputRouter.js";

type NativeSettings = ReturnType<typeof createLaunchpadSettings>;
type NativeBrandingTextures = ReturnType<typeof createNativeBrandingTextures>;

// Branding, caption icon and invalid-wallpaper recovery scenarios. These own
// the Windows icon fixture and the deliberate background IO faults; the entry
// assembly keeps the branding directory, log path and product controllers.
export type NativeBrandingSmokeContext = Readonly<{
  activateItem: (item: SceneItem) => Promise<void>;
  app: NativePixiApplication;
  backgroundConfig: () => Parameters<NativeBackground["configure"]>[0];
  branding: NativeBrandingTextures;
  brandingDirectory: string;
  capture: (name: string) => Promise<void>;
  closeFolder: () => boolean;
  desktopBackground: NativeBackground;
  folderFlow: NativeFolderFlow;
  getActivePageItems: () => readonly SceneItem[];
  nativeLogPath: string;
  notices: Readonly<{ transientNotice: Readonly<{ value: Readonly<{ intent?: string; message?: string }> | null }> }>;
  present: (description: string) => Promise<void>;
  refreshBackground: () => Promise<void>;
  refreshWindowChrome: () => void;
  runFolderRename: (folder: SceneItem) => Promise<void>;
  runWindowActivation: () => Promise<void>;
  scene: NativeDesktopScene;
  settings: NativeSettings;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
  windowChrome: NativeWindowChrome;
}>;

// `wallpaper-failure` and `folder-rename` both terminate the diagnostic run, so
// the caller needs an explicit completion outcome instead of a bare return.
export type NativeBrandingSmokeOutcome = Readonly<{ kind: "wallpaper-failure" | "folder-rename" }>;

export async function runNativeBrandingSmoke(context: NativeBrandingSmokeContext): Promise<NativeBrandingSmokeOutcome> {
  const {
    activateItem, app, backgroundConfig, branding, brandingDirectory, capture, closeFolder,
    desktopBackground, folderFlow, getActivePageItems, nativeLogPath, notices,
    present, refreshBackground, refreshWindowChrome, scene, settings, waitFor, windowChrome,
  } = context;
  assert.ok(process.env.LUMERIA_NATIVE_DATA_DIR, "native interaction smoke requires isolated data");
  const {dlopen}=await import("bun:ffi");
  const {Sprite}=await import("pixi.js");
  if(process.env.LAUNCHPAD_NATIVE_WALLPAPER_FAILURE_SMOKE){
    const failedPath=settings.presentation.backgroundImagePath.value;
    assert.ok(failedPath);assert.equal(settings.presentation.backgroundSource.value,"customImage");
    const display=desktopBackground.getChildByLabel("native-background-image") as InstanceType<typeof Sprite>;
    const base=desktopBackground.getChildByLabel("native-background-base");assert.ok(base);
    assert.equal(display.visible,false,"failed startup wallpaper must show the base background");
    assert.equal(base.width,app.contentSize.width);assert.equal(base.height,app.contentSize.height);
    assert.equal(notices.transientNotice.value?.intent,"error","startup IO failure must retain its error notice");
    assert.ok(notices.transientNotice.value?.message?.includes(process.env.LAUNCHPAD_NATIVE_WALLPAPER_FAILURE_SMOKE==="missing"?"ENOENT":"Unsupported image type"));
    assert.equal(readFileSync(nativeLogPath,"utf8").includes('"event":"uncaught-exception"'),false);
    await capture(`wallpaper-${process.env.LAUNCHPAD_NATIVE_WALLPAPER_FAILURE_SMOKE}-fallback`);
    const config=backgroundConfig();
    const stale=desktopBackground.configure({...config,backgroundImagePath:failedPath+".superseded"},app.contentSize.width,app.contentSize.height);
    await desktopBackground.configure({...config,backgroundSource:"systemMaterial"},app.contentSize.width,app.contentSize.height);
    await stale;
    writeFileSync(failedPath,readFileSync(join(brandingDirectory,"light.png")));
    await refreshBackground();assert.equal(display.visible,true,"restoring the same file must allow a later retry");
    const previousTexture=display.texture;
    await assert.rejects(desktopBackground.configure({...config,backgroundImagePath:failedPath+".missing"},app.contentSize.width,app.contentSize.height));
    assert.equal(display.visible,false);assert.equal(previousTexture.destroyed,true,"fallback must release obsolete effect render textures");
    await refreshBackground();await present("wallpaper retry restored");
    assert.equal(settings.presentation.backgroundImagePath.value,failedPath,"fallback must not erase the user's configured path");
    await capture("wallpaper-restored");
    console.log("Native invalid wallpaper: startup notice, base fallback, stale IO, texture cleanup and same-path retry passed");
    writeFileSync(process.env.LAUNCHPAD_NATIVE_SMOKE_MARKER!,JSON.stringify({wallpaper:process.env.LAUNCHPAD_NATIVE_WALLPAPER_FAILURE_SMOKE}),"utf8");
    return Object.freeze({ kind: "wallpaper-failure" });
  }
  const {getNativePixiApplicationTesting}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
  const icons=dlopen("user32.dll",{GetAncestor:{args:["u64","u32"],returns:"u64"},SendMessageW:{args:["u64","u32","u64","i64"],returns:"i64"}});
  const root=icons.symbols.GetAncestor(BigInt(getNativePixiApplicationTesting(app).handles().inputWindow),2);
  const readIcon=()=>icons.symbols.SendMessageW(root,0x7f,1n,0n);
  const initialIcon=readIcon();assert.notEqual(initialIcon,0n,"startup must assign a window icon before any settings changes");
  const originalVariant=settings.presentation.launchpadIconVariant.value;
  const originalTitlebar=settings.presentation.showCustomTitlebar.value;
  try{
    for(const variant of LAUNCHPAD_ICON_VARIANTS){
      const before=readIcon(),changed=variant!==settings.presentation.launchpadIconVariant.value;
      settings.beginEdit();settings.actions.setDraftLaunchpadIconVariant(variant);settings.actions.setDraftShowCustomTitlebar(true);
      await settings.applyEdit();refreshWindowChrome();await present(`branding ${variant}`);
      const logo=windowChrome.getChildByLabel("native-window-brand-icon");assert.ok(logo instanceof Sprite);
      assert.equal(logo.texture,branding.textures.get(variant),"caption must use the committed icon variant");
      assert.equal(logo.width,20);assert.equal(logo.height,20);
      if(changed)assert.notEqual(readIcon(),before,"changing variants must replace the native window icon");
      await capture(`window-branding-${variant}`);
    }
    await branding.synchronize(3);refreshWindowChrome();
    const logo=windowChrome.getChildByLabel("native-window-brand-icon") as InstanceType<typeof Sprite>;
    assert.equal(logo.texture,branding.textures.get(settings.presentation.launchpadIconVariant.value),"DPI refresh must replace the caption texture before old textures are destroyed");
    assert.equal(logo.texture.destroyed,false);
  }finally{
    icons.close();settings.beginEdit();settings.actions.setDraftLaunchpadIconVariant(originalVariant);
    settings.actions.setDraftShowCustomTitlebar(originalTitlebar);await settings.applyEdit();refreshWindowChrome();
  }
  console.log("Native branding: startup window icon, four variants, caption synchronization and DPI refresh passed");
  const folder = getActivePageItems().find(item => item.type === "folder");
  assert.ok(folder);await activateItem(folder);
  await context.runFolderRename(folder);
  app.nativeInput.emitPointer("pointermove", 20, 20, 0);
  await waitFor("folder rename idle appearance", () => !scene.getMotionSnapshot().active);
  await capture("folder-rename-idle");
  closeFolder();await waitFor("rename smoke folder cleanup", () => !folderFlow.snapshot().renderedFolder);
  await context.runWindowActivation();
  writeFileSync(process.env.LAUNCHPAD_NATIVE_SMOKE_MARKER!, JSON.stringify({ folderRename: "verified" }), "utf8");
  return Object.freeze({ kind: "folder-rename" });
}
