import { buildNativeBytecode } from "../vendor/electrobun-pixi-native-starter/consumer/bytecode-postbuild.mjs";

buildNativeBytecode({ entrypoint: "src/native/nativeMain.ts", tsconfig: "tsconfig.electrobun.json" });
