import { readFile, stat } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { CUSTOM_ICON_SOURCE_MAX_BYTES, CUSTOM_ICON_MIN_SOURCE_SIZE, CUSTOM_ICON_DATA_URL_MAX_LENGTH, getCustomIconPlacement } from "../domain/customIcon.js";
import { t } from "./nativeLocalization.js";

export async function normalizeNativeCustomIcon(path:string):Promise<string>{
  const metadata=await stat(path);
  if(!metadata.isFile())throw new Error(t("settings.apps.icon.chooseImage"));
  if(metadata.size>CUSTOM_ICON_SOURCE_MAX_BYTES)throw new Error(t("settings.apps.icon.tooLarge"));
  const bytes=await readFile(path);
  if(bytes.length>CUSTOM_ICON_SOURCE_MAX_BYTES)throw new Error(t("settings.apps.icon.tooLarge"));
  let image;
  try{image=await loadImage(bytes);}
  catch(error){throw new Error(t("settings.apps.icon.readFailed"),{cause:error});}
  if(image.width<CUSTOM_ICON_MIN_SOURCE_SIZE||image.height<CUSTOM_ICON_MIN_SOURCE_SIZE)throw new Error(t("settings.apps.icon.tooSmall"));
  const placement=getCustomIconPlacement(image.width,image.height);
  const canvas=createCanvas(placement.size,placement.size),context=canvas.getContext("2d");
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";
  context.drawImage(image,placement.x,placement.y,placement.width,placement.height);
  const data=canvas.toDataURL("image/png");
  if(data.length>CUSTOM_ICON_DATA_URL_MAX_LENGTH)throw new Error(t("settings.apps.icon.compressedTooLarge"));
  return data;
}
