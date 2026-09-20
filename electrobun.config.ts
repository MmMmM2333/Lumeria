import type { ElectrobunConfig } from "electrobun";
import { nativePixiElectrobunCopy } from "./vendor/electrobun-pixi-native-starter/consumer/electrobun";
import { nativeBuildDefines } from "./scripts/nativeBuildDefines.js";
import { PRODUCT } from "./src/platform/product.js";
import { join } from "node:path";

const rustRelease=join(process.env.CARGO_TARGET_DIR??"target","release");

export default {
  scripts: { postBuild: "scripts/nativePostBuild.ts" },
  app: {
    identifier: PRODUCT.identifier,
    name: PRODUCT.name,
    version: PRODUCT.version,
  },
  build: {
    artifactFolder: "build/electrobun-artifacts",
    bun: {
      entrypoint: "src/native/nativeMain.ts",
      define: nativeBuildDefines(),
    },
    copy: {
      ...nativePixiElectrobunCopy,
      [join(rustRelease,"lumeria_native_data.exe")]: "bun/lumeria-native-data.exe",
      [join(rustRelease,"lumeria_live_desktop.dll")]: "bun/lumeria_live_desktop.dll",
      "src/assets/branding/lumeria-app-icon.svg": "bun/branding/light.svg",
      "src/assets/branding/lumeria-app-icon-dark.svg": "bun/branding/dark.svg",
      "src/assets/branding/lumeria-app-icon-pastel-grid.svg": "bun/branding/pastelLight.svg",
      "src/assets/branding/lumeria-app-icon-dark-pastel-grid.svg": "bun/branding/pastelDark.svg",
      "src/assets/branding/app-icons/light/256x256.png": "bun/branding/light.png",
      "src/assets/branding/app-icons/dark/256x256.png": "bun/branding/dark.png",
      "src/assets/branding/app-icons/pastelLight/256x256.png": "bun/branding/pastelLight.png",
      "src/assets/branding/app-icons/pastelDark/256x256.png": "bun/branding/pastelDark.png",
    },
    linux: { bundleWGPU: true },
    mac: { bundleWGPU: true },
    mainProcess: "bun",
    win: { bundleWGPU: true, icon: "src/assets/branding/app-icons/light/256x256.png" },
  },
} satisfies ElectrobunConfig;
