import { formatMainWindowShortcut } from "../domain/mainWindowShortcut.js";
import { NativeLaunchError } from "./nativeDataProtocol.js";
import { t } from "./nativeLocalization.js";
import { NativeShortcutError } from "./nativeShortcut.js";

/** Save failures already own a retry notice; downstream operations preserve it. */
export class NativeLayoutSaveError extends Error {
  constructor(cause:unknown){super("Layout save failed",{cause});this.name="NativeLayoutSaveError";}
}
export type NativeErrorOperation="runtime"|"launch"|"shortcut"|"hotCorners"|"background"|"appearance"|"icons"|"logs"|"location"|"scan"|"window"|"close";
export function nativeShortcutErrorMessage(error:unknown):string {
  if(!(error instanceof NativeShortcutError))return t("settings.general.shortcut.unavailable");
  return t(`settings.general.shortcut.failure.${error.operation}`,{shortcut:formatMainWindowShortcut(error.shortcut)});
}
export function nativeLaunchErrorFeedback(error:unknown){
  const reasons:Record<string,[string,string]>={
    accessDenied:["accessDenied","checkPermission"],appNotInstalled:["packageMissing","rescanOrRemove"],
    brokenShortcut:["shortcutInvalid","replaceShortcut"],layoutReadFailed:["savedTargetInvalid","rescanOrReadd"],
    missingLaunchInfo:["pathEmpty","chooseTarget"],noAssociation:["noAssociation","checkAssociation"],
    targetNotFound:["pathMissing","checkExplorer"],unsupportedTarget:["unsupported","supportedType"],
    windowsLaunchFailed:["windowsFailure","checkExplorer"],
  };
  const [reason,suggestion]=error instanceof NativeLaunchError?reasons[error.kind]??["windowsFailure","checkExplorer"]:["windowsFailure","checkExplorer"];
  return {title:t("errors.launch.genericTitle"),message:t(`errors.launch.reason.${reason}`),suggestion:t(`errors.launch.suggestion.${suggestion}`)};
}
export function nativeErrorFeedback(error:unknown,operation:NativeErrorOperation="runtime"){
  if(error instanceof NativeLayoutSaveError)return null;
  if(error instanceof NativeShortcutError)operation="shortcut";
  if(operation==="launch"){
    const feedback=nativeLaunchErrorFeedback(error);
    return {title:feedback.title,message:`${feedback.message} ${feedback.suggestion}`,intent:"error" as const};
  }
  return {title:t(`errors.native.${operation}.title`),
    message:operation==="shortcut"?nativeShortcutErrorMessage(error):t(`errors.native.${operation}.message`),
    intent:operation==="shortcut"?"warning" as const:"error" as const};
}
