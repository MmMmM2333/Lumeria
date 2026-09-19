import { Utils } from "../../vendor/electrobun-pixi-native-starter/src/platform/electrobun-sdk.js";
import { createNativePixiApplication } from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { PRODUCT } from "../platform/product.js";
import { NativeDataHost } from "./nativeDataHost.js";
import { runWithNativeResources } from "./nativeRuntimeLifecycle.js";
import { acquireNativeSession,type NativeSession } from "./nativeSession.js";
import { resolveNativeMode,type NativeMode } from "./product/nativeEntryMode.js";
import { runNativeProduct } from "./product/nativeProduct.js";
import { nativeRuntimePaths } from "./runtimePaths.js";

declare const __LUMERIA_DIAGNOSTICS__: boolean;

async function runNativeApplication(session: NativeSession): Promise<void> {
const configuredNativeMode = process.env.LAUNCHPAD_NATIVE_MODE;
const nativeMode: NativeMode = resolveNativeMode(configuredNativeMode, __LUMERIA_DIAGNOSTICS__);
const smoke = __LUMERIA_DIAGNOSTICS__ ? await import("./nativeSmokeSupport.js") : null;
// The outer helper owns the sidecar and window resources, so a failure during
// application creation or UI assembly still releases both exactly once.
await runWithNativeResources(
  () => new NativeDataHost(),
  () => createNativePixiApplication({
    // FIFO presentation supplies display pacing; do not impose a 60 Hz timer cap.
    maxFps: 0,
    presentationMode: "fifo",
    transparent:true,
    titleBarStyle:"hidden",
    antialias: true,
    background: 0x090b14,
    height: 600,
    resizeMode: "live",
    title: nativeMode === "app" ? PRODUCT.name : (__LUMERIA_DIAGNOSTICS__ ? process.env.LAUNCHPAD_NATIVE_SETTINGS_ONLY : undefined)==="1"?"LaunchPad · Settings style preview":`LaunchPad · Native WebGPU ${nativeMode}`,
    width: 900,
  }),
  (nativeData, app) => runNativeProduct(nativeData, app, session, nativeMode, smoke),
);
}

// Keep failures observable by the Worker error handler after existing finally
// blocks have released application resources; never turn startup failure into success.
async function runNativeEntry(): Promise<void> {
  const session=await acquireNativeSession(nativeRuntimePaths(),process.env.LUMERIA_LAUNCH_ORIGIN==="login"?"login":"manual");
  if(!session){Utils.quit();return;}
  try { await runNativeApplication(session); }
  finally { await session.dispose(); }
}
void runNativeEntry().catch(error => { queueMicrotask(() => { throw error; }); });
