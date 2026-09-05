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
      "src/assets/branding/lumeria-app-icon.svg": "bun/branding/light.svg",
      "src/assets/branding/lumeria-app-icon-dark.svg": "bun/branding/dark.svg",
      "src/assets/branding/lumeria-app-icon-pastel-grid.svg": "bun/branding/pastelLight.svg",
      "src/assets/branding/lumeria-app-icon-dark-pastel-grid.svg": "bun/branding/pastelDark.svg",
    },
    linux: { bundleWGPU: true },
    mac: { bundleWGPU: true },
    mainProcess: "bun",
    win: { bundleWGPU: true },
  },
} satisfies ElectrobunConfig;
