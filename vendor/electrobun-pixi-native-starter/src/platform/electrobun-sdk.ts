// Every consumer uses the pinned SDK instance. Mixing this with the CLI's
// electrobun/main alias creates two callback registries in stable bundles.
export * from "../../.hutch/devkit-dcomp-2.0.1/api/sdks/main/index";
export { default } from "../../.hutch/devkit-dcomp-2.0.1/api/sdks/main/index";
