import type { ElectrobunConfig } from "electrobun";
import { nativePixiElectrobunCopy } from "./vendor/electrobun-pixi-native-starter/consumer/electrobun";

export default {
  app: {
    identifier: "dev.lumeria.launchpad-native-smoke",
    name: "LaunchPad Native Smoke",
    version: "0.1.0",
  },
  build: {
    bun: {
      entrypoint: "src/native/electrobunSmoke.ts",
    },
    copy: nativePixiElectrobunCopy,
    linux: { bundleWGPU: true },
    mac: { bundleWGPU: true },
    mainProcess: "bun",
    win: { bundleWGPU: true },
  },
} satisfies ElectrobunConfig;
