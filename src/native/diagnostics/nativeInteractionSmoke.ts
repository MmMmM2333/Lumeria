import assert from "node:assert/strict";
import type { Container } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadLaunchFlow } from "../../application/launchpadLaunchFlow.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { NativeFolderNameInput } from "../../rendering/native/NativeFolderNameInput.js";
import type { NativeManagement } from "../../rendering/native/NativeManagement.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import type { createNativeFolderFlow } from "../../rendering/native/nativeFolderFlow.js";
import { resolveNativePointerTarget } from "../../rendering/native/nativePointerTarget.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";
import type { createNativeLayoutState,NativeNavigationKey } from "../nativeStartup.js";

type NativeLayoutState = ReturnType<typeof createNativeLayoutState>;
type NativeFolderFlow = ReturnType<typeof createNativeFolderFlow>;
type LaunchpadLaunchFlow = ReturnType<typeof createLaunchpadLaunchFlow>;

// Explicit live readers, actions and capture resources for the interaction
// scenarios. Product state stays owned by the entry assembly; these scenarios
// only drive real user input and assert on the resulting presentation.
export type NativeInteractionSmokeContext = Readonly<{
  activateItem: (item: SceneItem, event?: { shiftKey?: boolean }) => Promise<void>;
  app: NativePixiApplication;
  capture: (name: string) => Promise<void>;
  click: (target: Container, button?: number) => void;
  closeFolder: () => boolean;
  contextMenu: (item: SceneItem | null, x: number, y: number) => void;
  folderFlow: NativeFolderFlow;
  folderNameInput: NativeFolderNameInput;
  launchFlow: LaunchpadLaunchFlow;
  layoutState: NativeLayoutState;
  management: NativeManagement;
  onKey: (event: NativeNavigationKey) => boolean;
  present: (description: string) => Promise<void>;
  readTouchId: () => number | null;
  saves: Readonly<{ flush(): Promise<void> }>;
  scene: NativeDesktopScene;
  searchBar: NativeSearchBar;
  showLaunchpad: () => void;
  smokeActions: Readonly<{
    activationClickOwnedNativeWindow: (inputWindow: number, point: { x: number; y: number }, programmatic?: boolean) => Promise<unknown>;
    clickOwnedNativeWindow: (inputWindow: number, point: { x: number; y: number }) => Promise<unknown>;
  }>;
  t: (key: string, values?: Record<string, string | number>) => string;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
}>;

export async function runNativeFolderClosingContextSmoke(
  context: NativeInteractionSmokeContext,
  folder: SceneItem,
): Promise<void> {
  const { app, capture, closeFolder, contextMenu, folderFlow, folderNameInput, management, onKey, present, scene, t, waitFor } = context;
  const rightAt = (x: number, y: number) => {
    app.nativeInput.emitPointer("pointermove", x, y, 0);
    app.nativeInput.emitPointer("pointerdown", x, y, 2);
    app.nativeInput.emitPointer("pointerup", x, y, 2);
  };
  const assertNoMenu = (phase: string) => {
    assert.equal(folderFlow.snapshot().isClosing, true, `${phase} must exercise a closing folder`);
    assert.ok(folderFlow.snapshot().renderedFolder, "closing visuals must remain alive");
    assert.equal(management.modal, false, `${phase} must not display a context menu`);
  };
  closeFolder();rightAt(20, 100);assertNoMenu("close-start right-click");
  await waitFor("folder closing midpoint", () => folderFlow.snapshot().openProgress < 0.8);
  rightAt(20, 100);assertNoMenu("mid-close right-click");
  await capture("folder-closing-no-context-menu");
  await waitFor("folder closed before desktop menu", () => !folderFlow.snapshot().renderedFolder);
  await present("desktop menu after folder closes");
  rightAt(20, 100);
  assert.ok(management.getChildByLabel(`native-action:${t("launchpad.openSettings")}`, true), "desktop menu must return after closing cleanup");
  assert.equal(management.getChildByLabel("native-management:keyboard-focus", true), null, "pointer-opened menus must not show default keyboard focus");
  await present("pointer-opened menu without keyboard focus");
  await capture("context-menu-pointer-focus");
  onKey({type:"down",key:"ArrowDown"});
  assert.ok(management.getChildByLabel("native-management:keyboard-focus", true), "arrow navigation must reveal keyboard focus");
  await present("keyboard-navigated menu with focus");
  await capture("context-menu-keyboard-focus");
  onKey({type:"down",key:"Escape"});
  assert.equal(management.modal, false, "keyboard Escape must still dismiss the menu");

  await context.activateItem(folder);
  await waitFor("folder reopened before menu relocation", () => !folderNameInput.input.disabled);
  const panel = scene.getFolderPanelRect();assert.ok(panel);
  rightAt(panel.left + panel.width / 2, panel.top + 12);
  assert.ok(management.getChildByLabel("native-context-menu", true), "relocation regression requires an existing folder menu");
  assert.equal(management.getChildByLabel(`native-action:${t("launchpad.openSettings")}`, true), null, "open-folder blank menu must keep its folder scope");
  closeFolder();rightAt(20, 100);assertNoMenu("menu relocation during close");

  await context.activateItem(folder);
  await waitFor("rapidly reopened folder can interact", () => !folderFlow.snapshot().isClosing && !folderNameInput.input.disabled);
  contextMenu(null, 450, 140);
  assert.ok(management.getChildByLabel(`native-action:${t("launchpad.contextMenu.batchManage")}`, true), "rapid reopen must restore folder menus");
  management.close();
  console.log("Native closing folder context menu: start, midpoint, desktop recovery, relocation and rapid reopen passed");
}

export async function runNativeWindowActivationSmoke(context: NativeInteractionSmokeContext): Promise<void> {
  const { app, capture, launchFlow, present, readTouchId, scene, searchBar, showLaunchpad, smokeActions, waitFor } = context;
  const { activationClickOwnedNativeWindow, clickOwnedNativeWindow } = smokeActions;
  const { getNativePixiApplicationTesting } = await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
  const testing = getNativePixiApplicationTesting(app);
  const handle = testing.handles().inputWindow;
  const point = (x: number, y: number) => testing.clientToScreen(Math.round(x * app.resolution), Math.round(y * app.resolution));
  const blank = { x: app.contentSize.width - 60, y: app.contentSize.height - 110 };
  assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(blank.x, blank.y)).kind, "surface");
  let activationDowns = 0;
  const off = app.nativeInput.onHostEvent(event => { if (event.kind === 2 && (event.modifiers & 32)) activationDowns++; });
  try {
    await activationClickOwnedNativeWindow(handle, point(blank.x, blank.y));
    await present("activation blank click keeps desktop open");
    assert.ok(activationDowns > 0, "real Windows activation must reach pointer metadata");
    assert.equal(launchFlow.isDesktopOpen.value, true, "activation blank click must only focus the window");
    assert.equal(readTouchId(), null, "activation click must not leave a desktop gesture owner");
    await capture("activation-click-keeps-open");
    await present("restore input target after activation screenshot");
    const activationCount = activationDowns;
    await clickOwnedNativeWindow(handle, point(blank.x, blank.y));
    assert.equal(activationDowns, activationCount, "an already-focused click must not carry activation metadata");
    await waitFor("second focused blank click hides", () => !app.window.isVisible());
    showLaunchpad();await waitFor("activation smoke restored", () => app.window.isVisible() && !scene.getMotionSnapshot().active);
    await activationClickOwnedNativeWindow(handle, point(blank.x, blank.y), true);
    await waitFor("programmatic focus does not swallow next click", () => !app.window.isVisible());
    showLaunchpad();await waitFor("activation control smoke restored", () => app.window.isVisible() && !scene.getMotionSnapshot().active);
    const search = searchBar.input.getBounds();
    await activationClickOwnedNativeWindow(handle, point(search.x + search.width / 2, search.y + search.height / 2));
    assert.equal(searchBar.input.focused, true, "activation clicks on controls must retain control behavior");
    searchBar.input.blur();
    console.log("Native activation click: real mouse activation, second-click dismissal, programmatic focus and input control passed");
  } finally { off(); }
}

export async function runNativeFolderRenameSmoke(
  context: NativeInteractionSmokeContext,
  smokeFolder: SceneItem,
): Promise<void> {
  const { app, capture, click, closeFolder, folderFlow, folderNameInput, layoutState, management, onKey, present, saves, scene, t, waitFor } = context;
  await waitFor("editable folder title", () => !folderNameInput.input.disabled);
  click(folderNameInput.input);
  assert.equal(folderNameInput.input.focused, true, "title clicks must focus the inline editor");
  assert.equal(folderFlow.snapshot().isClosing, false, "title clicks must not close the folder");
  const originalFolderName = String(smokeFolder.name);
  folderNameInput.input.selectAll();
  folderNameInput.input.beginComposition();
  folderNameInput.input.updateComposition("\u4e2d\u6587\u6539\u540d", 4);
  assert.equal(onKey({ type: "down", key: "Enter", isComposing: true }), false);
  assert.equal(folderNameInput.input.focused, true, "IME confirmation must not blur the title");
  folderNameInput.input.commitText("\u4e2d\u6587\u6539\u540d");
  await present("folder inline rename committed");
  const savedFolderName = () => layoutState.operations.findFolder(layoutState.presentation.pages.value, smokeFolder.id)?.item.name;
  assert.equal(savedFolderName(), "\u4e2d\u6587\u6539\u540d", "inline input must update layout without a Save dialog");
  onKey({ type: "down", key: "Enter" });
  await present("folder title after Enter");
  assert.equal(folderNameInput.input.focused, false);
  assert.equal(folderNameInput.input.value, "\u4e2d\u6587\u6539\u540d", "blur must not restore a stale opening snapshot");
  click(folderNameInput.input);
  folderNameInput.input.selectAll();folderNameInput.input.commitText("temporary name");
  folderNameInput.input.selectAll();folderNameInput.input.command({ type: "insert", text: "" }, true);
  onKey({ type: "down", key: "Enter" });
  assert.equal(folderNameInput.input.value, "\u4e2d\u6587\u6539\u540d", "empty input must restore the name at focus");
  assert.equal(savedFolderName(), folderNameInput.input.value, "empty restore must also restore the saved layout name");
  closeFolder();await waitFor("close before context rename", () => !folderFlow.snapshot().renderedFolder);
  await present("folder context rename source");
  click(app.stage.getChildByLabel(`launchpad-item:${smokeFolder.id}`, true)!, 2);
  await present("folder context menu");
  const renameAction = management.getChildByLabel(`native-action:${t("common.actions.rename")}`, true);
  assert.ok(renameAction);click(renameAction);
  await waitFor("context rename focuses inline title", () => folderNameInput.input.focused);
  assert.equal(management.modal, false, "folder rename must not open a form");
  assert.equal(folderNameInput.input.selection.start, 0);
  assert.equal(folderNameInput.input.selection.end, folderNameInput.input.value.length);
  await waitFor("folder rename focus appearance", () => !scene.getMotionSnapshot().active);
  await capture("folder-rename-selected");
  folderNameInput.input.commitText("1234567890".repeat(4));
  assert.equal(folderNameInput.input.value.length, 32, "folder names must be limited to 32 characters");
  folderNameInput.input.selectAll();folderNameInput.input.commitText(originalFolderName);
  onKey({ type: "down", key: "Enter" });await saves.flush();
  await present("folder title restored");
  assert.equal(savedFolderName(), originalFolderName);
  assert.equal(folderNameInput.input.value, originalFolderName);
  await runNativeFolderClosingContextSmoke(context, smokeFolder);
  console.log("Native inline folder rename: pointer, context menu, IME, empty restore, length and persistence passed");
}
