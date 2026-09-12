import { buildNativeBytecode } from "../vendor/electrobun-pixi-native-starter/consumer/bytecode-postbuild.mjs";
import { brandNativeRuntime } from "./nativeRuntimeBranding.js";
import { nativeBuildDefines } from "./nativeBuildDefines.js";
import { checkNativeDiagnosticsArtifact } from "./nativeDiagnosticsArtifact.js";

const defines = nativeBuildDefines();
buildNativeBytecode({ entrypoint: "src/native/nativeMain.ts", tsconfig: "tsconfig.electrobun.json", define: defines });
checkNativeDiagnosticsArtifact(defines.__LUMERIA_DIAGNOSTICS__ === "true");
brandNativeRuntime();
