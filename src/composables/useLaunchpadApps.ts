import { type Ref } from "vue";
import { createLaunchpadApps, type LaunchpadAppsOptions } from "../application/launchpadApps.js";
import { vueStateHost } from "./vueStateHost.js";
import { catalogPort } from "../platform/launchpadPorts.js";
import { CUSTOM_ICON_SOURCE_MAX_BYTES, CUSTOM_ICON_DATA_URL_MAX_LENGTH, CUSTOM_ICON_MIN_SOURCE_SIZE, getCustomIconPlacement } from "../domain/customIcon.js";
export type { ScanResultTab, LaunchTargetStatus, ManagedAppIcon, ManagedAppIconChoice, ManagedAppEditorSession, ManagedAppIconChooser, LaunchpadAppsDialogConfig, LaunchpadAppsNotice, LaunchpadAppsPersistenceFragment, LaunchpadAppsOptions } from "../application/launchpadApps.js";
export { getCustomIconCanvasSize } from "../domain/customIcon.js";

type VueState<T> = T extends (...args:never[])=>unknown ? T : T extends {value:infer V} ? Ref<V> : T extends readonly unknown[] ? T : T extends object ? {[K in keyof T]:VueState<T[K]>} : T;
export function useLaunchpadApps(options:LaunchpadAppsOptions) {
  const t=options.localizationText.t;
  function loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(t("settings.apps.icon.readFailed")));
      };
      image.src = url;
    });
  }

  function canvasToPngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error(t("settings.apps.icon.compressFailed")));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error(t("settings.apps.icon.compressFailed")));
        };
        reader.onerror = () => reject(new Error(t("settings.apps.icon.compressFailed")));
        reader.readAsDataURL(blob);
      }, "image/png");
    });
  }

  async function normalizeCustomIconFile(file: File): Promise<string> {
    if (!file.type || !file.type.startsWith("image/")) {
      throw new Error(t("settings.apps.icon.chooseImage"));
    }
    if (file.size > CUSTOM_ICON_SOURCE_MAX_BYTES) {
      throw new Error(t("settings.apps.icon.tooLarge"));
    }

    const image = await loadImageFromFile(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width < CUSTOM_ICON_MIN_SOURCE_SIZE || height < CUSTOM_ICON_MIN_SOURCE_SIZE) {
      throw new Error(t("settings.apps.icon.tooSmall"));
    }

    const placement = getCustomIconPlacement(width,height);
    const canvasSize = placement.size;
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(t("settings.apps.icon.compressFailed"));
    context.clearRect(0, 0, canvasSize, canvasSize);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      placement.x,
      placement.y,
      placement.width,
      placement.height
    );

    const dataUrl = await canvasToPngDataUrl(canvas);
    if (dataUrl.length > CUSTOM_ICON_DATA_URL_MAX_LENGTH) {
      throw new Error(t("settings.apps.icon.compressedTooLarge"));
    }
    return dataUrl;
  }


  const apps=createLaunchpadApps({...options,catalogPort:options.catalogPort??catalogPort,normalizeCustomIconFile},vueStateHost);
  return apps as unknown as VueState<typeof apps>;
}
