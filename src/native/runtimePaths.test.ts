import assert from "node:assert/strict";
import { nativeDataExecutableName, nativePlatform, nativeUserDirectories } from "./runtimePaths.js";
import { assertReleaseVersion } from "../platform/product.js";

assert.deepEqual(nativeUserDirectories("win32", { APPDATA: "C:\\Users\\测试 用户\\AppData\\Roaming" }, "C:\\Users\\测试 用户"), {
  data: "C:\\Users\\测试 用户\\AppData\\Roaming\\com.lumeria.app",
  logs: "C:\\Users\\测试 用户\\AppData\\Roaming\\com.lumeria.app\\logs", isolated: false,
});
assert.equal(nativeUserDirectories("darwin", {}, "/Users/test").data, "/Users/test/Library/Application Support/com.lumeria.app");
assert.equal(nativeUserDirectories("linux", {}, "/home/test").data, "/home/test/.local/share/com.lumeria.app");
assert.equal(nativeUserDirectories("linux", { XDG_DATA_HOME: "/data/apps" }, "/home/test").data, "/data/apps/com.lumeria.app");
assert.equal(nativeUserDirectories("win32", { LUMERIA_NATIVE_DATA_DIR: "D:\\isolated" }, "").data, "D:\\isolated");
assert.throws(() => nativeUserDirectories("win32", {}, "C:\\Users\\test"), /APPDATA/);
for (const override of ["", "relative", "C:relative"]) {
  assert.throws(() => nativeUserDirectories("win32", { LUMERIA_NATIVE_DATA_DIR: override }, "C:\\Users\\test"), /absolute path/);
}
assert.throws(() => nativeUserDirectories("linux", { XDG_DATA_HOME: "relative" }, "/home/test"), /absolute path/);
assert.throws(() => nativePlatform("freebsd"), /Unsupported/);
assert.equal(nativeDataExecutableName("win32"), "lumeria-native-data.exe");
assert.equal(nativeDataExecutableName("darwin"), "lumeria-native-data");
assertReleaseVersion("0.1.0");
for (const version of ["1.0", "01.0.0", "1.0.0-beta", "65536.0.0"]) assert.throws(() => assertReleaseVersion(version));
console.log("Native platform paths passed");
