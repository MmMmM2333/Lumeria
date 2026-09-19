import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createNativeEditing } from "../nativeEditing.js";
import type { createNativeLayoutState } from "../nativeStartup.js";

type NativeLayoutState = ReturnType<typeof createNativeLayoutState>;

// Tray-restart smoke: attempt 0 saves a named layout and restarts, attempt 1
// injects a renderer fault and restarts, attempt 2 verifies persistence and
// exits. The single tray action per attempt is deliberate; each attempt is a
// fresh process, so this scenario owns no product state.
export type NativeRestartSmokeContext = Readonly<{
  app: NativePixiApplication;
  editing: () => ReturnType<typeof createNativeEditing> | null;
  layoutState: NativeLayoutState;
  log: (event: string) => void;
  nativeLogPath: string;
  saves: Readonly<{ flush(): Promise<void> }>;
  tray: () => Readonly<{ id: number }> | null;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
}>;

export async function runNativeRestartSmoke(context: NativeRestartSmokeContext): Promise<void> {
  const { app, editing, layoutState, log, nativeLogPath, saves, tray, waitFor } = context;
  const {sendTrayTestAction}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/tray-smoke.js");
  assert.ok(process.env.LUMERIA_NATIVE_DATA_DIR,"restart smoke must use isolated data");
  const attempt=Number(process.env.LAUNCHPAD_NATIVE_RESTART_ATTEMPT);
  const trayHandle=tray();
  assert.ok(trayHandle);
  if(attempt===0){
    editing()!.rename("native-layout-icon","Tray restart saved");await saves.flush();
    app.window.minimize();await waitFor("restart fixture minimized",()=>app.window.isMinimized()&&app.state==="suspended");
    await sendTrayTestAction(trayHandle.id,"menu",4);
  }else if(attempt===1){
    const {getNativePixiApplicationTesting}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
    const testing=getNativePixiApplicationTesting(app);testing.injectFault("out-of-memory");app.invalidate();
    await waitFor("injected fatal recorded",()=>app.state==="failed");
    assert.ok(readFileSync(nativeLogPath,"utf8").includes('"event":"fatal"'),"fatal error must reach the persistent journal");
    await sendTrayTestAction(trayHandle.id,"menu",4);
  }else{
    assert.equal(attempt,2);assert.equal(layoutState.presentation.pages.value.flat().find(item=>item.id==="native-layout-icon")?.name,"Tray restart saved");
    log("restart-smoke-restored");
    await sendTrayTestAction(trayHandle.id,"menu",5);
  }
}
