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

console.log("Native icon texture source tests passed");
