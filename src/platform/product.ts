import packageJson from "../../package.json";

/** Product identity is independent of the current application host. */
export const PRODUCT = Object.freeze({
  name: "Lumeria",
  identifier: "com.lumeria.app",
  version: packageJson.version,
  channel: "stable",
  repositoryUrl: "https://github.com/MmMmM2333/Lumeria",
} as const);

export const WINDOWS_RELEASE = Object.freeze({
  platform: "win32",
  arch: "x64",
  launcher: "Lumeria.exe",
  runtime: "runtime/bin/LumeriaRuntime.exe",
  main: "runtime/Resources/main.js",
  control: "runtime/control.js",
  dataHost: "runtime/Resources/app/bun/lumeria-native-data.exe",
  manifest: "lumeria.json",
  receipt: "install.ini",
} as const);

export function assertReleaseVersion(version: string): void {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
    || version.split(".").some(part => Number(part) > 65535)) {
    throw new Error("A stable Windows release requires a numeric major.minor.patch version (each component <= 65535)");
  }
}
