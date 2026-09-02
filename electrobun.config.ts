import type { ElectrobunConfig } from "electrobun";
import { nativePixiElectrobunCopy } from "./vendor/electrobun-pixi-native-starter/consumer/electrobun";

export default {
  app: {
    identifier: "dev.lumeria.launchpad-native",
    name: "LaunchPad Native",
    version: "0.1.0",
  },
  build: {
    bun: {
      entrypoint: "src/native/nativeMain.ts",
    },
    copy: {
      ...nativePixiElectrobunCopy,
      "src-tauri/target/release/lumeria_native_data.exe": "bun/lumeria-native-data.exe",
    },
    linux: { bundleWGPU: true },
    mac: { bundleWGPU: true },
    mainProcess: "bun",
    win: { bundleWGPU: true },
  },
} satisfies ElectrobunConfig;
