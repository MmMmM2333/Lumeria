import assert from "node:assert/strict";
import {
  getNativeIconTextureSource,
  isNativeFileIconSource,
} from "../rendering/native/nativeIconTextureSource.js";

assert(isNativeFileIconSource("C:\\Icons\\app.png"));
assert(isNativeFileIconSource("\\\\server\\icons\\app.png"));
assert(isNativeFileIconSource("file:///C:/Icons/app.png"));
assert(!isNativeFileIconSource("Icons/app.png"));
assert(!isNativeFileIconSource("https://example.com/app.png"));
assert.equal(
  getNativeIconTextureSource({
    customIconPath: "C:\\Icons\\custom.png",
    iconPath: "C:\\Icons\\default.png",
  }),
  "C:\\Icons\\custom.png",
);
assert.equal(getNativeIconTextureSource({ iconUrl: "https://example.com/app.png" }), null);
assert.equal(getNativeIconTextureSource({customIconPath:"C:/icons/icon-content-one.png",customIconDataUrl:"data:image/png;base64,one"}),"C:/icons/icon-content-one.png","cached content paths share one texture identity across upload and restart");

console.log("Native icon texture source tests passed");
