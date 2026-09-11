import { buildNativeBytecode } from "../vendor/electrobun-pixi-native-starter/consumer/bytecode-postbuild.mjs";
import { brandNativeRuntime } from "./nativeRuntimeBranding.js";

buildNativeBytecode({ entrypoint: "src/native/nativeMain.ts", tsconfig: "tsconfig.electrobun.json" });
brandNativeRuntime();
