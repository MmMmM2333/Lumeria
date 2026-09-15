import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import { PRODUCT, WINDOWS_RELEASE } from "../platform/product.js";

export type NativePlatform = "win32" | "darwin" | "linux";
export type NativeEnvironment = Readonly<Record<string, string | undefined>>;

export function nativePlatform(platform: string): NativePlatform {
  if (platform === "win32" || platform === "darwin" || platform === "linux") return platform;
  throw new Error(`Unsupported native platform: ${platform}`);
}

/** Pure platform policy; no filesystem access or fallback to a working directory. */
export function nativeUserDirectories(platform: NativePlatform, environment: NativeEnvironment, userHome: string) {
  const path = platform === "win32" ? win32 : posix;
  const absolute = (value: string | undefined, name: string): string => {
    if (!value || !path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
    return path.normalize(value);
  };
  const override = environment.LUMERIA_NATIVE_DATA_DIR;
  const data = override !== undefined ? absolute(override, "LUMERIA_NATIVE_DATA_DIR")
    : platform === "win32" ? path.join(absolute(environment.APPDATA, "APPDATA"), PRODUCT.identifier)
      : platform === "darwin" ? path.join(absolute(userHome, "Home directory"), "Library/Application Support", PRODUCT.identifier)
        : path.join(environment.XDG_DATA_HOME
          ? absolute(environment.XDG_DATA_HOME, "XDG_DATA_HOME")
          : path.join(absolute(userHome, "Home directory"), ".local/share"), PRODUCT.identifier);
  // Keep the existing Windows log location. Logs are not part of the installation.
  return Object.freeze({ data, logs: path.join(data, "logs"), isolated: override !== undefined });
}

export function nativeDataExecutableName(platform: NativePlatform): string {
  return platform === "win32" ? "lumeria-native-data.exe" : "lumeria-native-data";
}

export type ProductManifest = Readonly<{
  schemaVersion: 1;
  identifier: typeof PRODUCT.identifier;
  name: typeof PRODUCT.name;
  version: string;
  channel: typeof PRODUCT.channel;
  platform: typeof WINDOWS_RELEASE.platform;
  arch: typeof WINDOWS_RELEASE.arch;
}>;

export function readProductManifest(root: string): ProductManifest {
  const value: unknown = JSON.parse(readFileSync(join(root, WINDOWS_RELEASE.manifest), "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Lumeria product manifest");
  const manifest = value as Record<string, unknown>;
  if (manifest.schemaVersion !== 1 || manifest.identifier !== PRODUCT.identifier || manifest.name !== PRODUCT.name
    || manifest.channel !== PRODUCT.channel || manifest.platform !== WINDOWS_RELEASE.platform
    || manifest.arch !== WINDOWS_RELEASE.arch || typeof manifest.version !== "string") {
    throw new Error("Incompatible Lumeria product manifest");
  }
  return manifest as ProductManifest;
}

export function nativeRuntimePaths(environment: NativeEnvironment = process.env, executable = process.execPath) {
  const platform = nativePlatform(process.platform);
  const directories = nativeUserDirectories(platform, environment, homedir());
  const runtimeRoot = dirname(dirname(executable));
  const candidate = environment.LUMERIA_PRODUCT_ROOT;
  let productRoot: string | null = null;
  if (candidate !== undefined) {
    if (platform !== "win32" || !win32.isAbsolute(candidate)) throw new Error("Invalid product installation root");
    productRoot = realpathSync(candidate);
    readProductManifest(productRoot);
    if (realpathSync(executable).toLowerCase() !== realpathSync(join(productRoot, WINDOWS_RELEASE.runtime)).toLowerCase()) {
      throw new Error("The runtime does not belong to its product installation");
    }
  }
  const launcher = productRoot ? join(productRoot, WINDOWS_RELEASE.launcher)
    : join(runtimeRoot, "bin", platform === "win32" ? "launcher.exe" : "launcher");
  return Object.freeze({
    ...directories, platform, productRoot, runtimeRoot,
    launcher: existsSync(launcher) ? launcher : null,
    installationRoot: productRoot ?? runtimeRoot,
  });
}
