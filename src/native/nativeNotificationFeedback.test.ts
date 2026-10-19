import assert from "node:assert/strict";
import { NativeLaunchError } from "./nativeDataProtocol.js";
import { NativeLayoutSaveError, nativeErrorFeedback, nativeLaunchErrorFeedback, nativeShortcutErrorMessage, type NativeErrorOperation } from "./nativeErrorFeedback.js";
import { getNativeLocale, setNativeLocale, t } from "./nativeLocalization.js";
import { createNativeShortcut, NativeShortcutError } from "./nativeShortcut.js";
import { createLaunchpadNotices } from "../application/launchpadNotices.js";
import { createNativeStateHost } from "../application/stateHost.js";

export function runNativeNotificationFeedbackTests():void {
  const previousLocale=getNativeLocale();
  try{
    for(const locale of ["zh-CN","en-US"]){
      setNativeLocale(locale);
      for(const operation of ["runtime","hotCorners","background","appearance","icons","logs","location","scan","window","close"] satisfies NativeErrorOperation[]){
        const feedback=nativeErrorFeedback(new Error("opaque English native exception"),operation)!;
        assert.equal(feedback.title,t(`errors.native.${operation}.title`));
        assert.notEqual(feedback.title,t("errors.launch.genericTitle"));
        assert.ok(!feedback.message.includes("opaque"));
      }
      for(const operation of ["register","unregister","restore","rollback"] as const){
        const error=new NativeShortcutError(operation,"control+Space");
        const feedback=nativeErrorFeedback(error)!;
        assert.equal(feedback.intent,"warning");assert.equal(feedback.title,t("errors.native.shortcut.title"));
        assert.equal(feedback.message,nativeShortcutErrorMessage(error));
        if(operation!=="rollback")assert.ok(feedback.message.includes("Ctrl + Space"));
      }
      for(const [kind,reason,suggestion] of [
        ["accessDenied","accessDenied","checkPermission"],["appNotInstalled","packageMissing","rescanOrRemove"],
        ["brokenShortcut","shortcutInvalid","replaceShortcut"],["layoutReadFailed","savedTargetInvalid","rescanOrReadd"],
        ["missingLaunchInfo","pathEmpty","chooseTarget"],["noAssociation","noAssociation","checkAssociation"],
        ["targetNotFound","pathMissing","checkExplorer"],["unsupportedTarget","unsupported","supportedType"],
        ["windowsLaunchFailed","windowsFailure","checkExplorer"],
      ]){
        const feedback=nativeLaunchErrorFeedback(new NativeLaunchError(kind!,"Windows technical detail"));
        assert.equal(feedback.message,t(`errors.launch.reason.${reason}`));
        assert.equal(feedback.suggestion,t(`errors.launch.suggestion.${suggestion}`));
      }
      const notices=createLaunchpadNotices({localizationText:{t}},createNativeStateHost(()=>{}));
      const disk=new Error("disk access denied");let retries=0;
      notices.showLayoutSaveFailed({error:disk,onRetry:()=>{retries++;}});
      const specific=notices.transientNotice.value;
      const feedback=nativeErrorFeedback(new NativeLayoutSaveError(disk),"window");
      if(feedback)notices.showTransientNotice(feedback);
      assert.equal(notices.transientNotice.value,specific,"downstream errors preserve the save retry notice");
      specific?.onAction?.();assert.equal(retries,1);notices.closeTransientNotice();
    }
  }finally{setNativeLocale(previousLocale);}
  {
    let unavailable=true;const registered=new Set<string>();
    const shortcut=createNativeShortcut({register:accelerator=>{if(unavailable||registered.has(accelerator))return false;registered.add(accelerator);return true;},unregister:accelerator=>registered.delete(accelerator)},()=>{});
    assert.equal(shortcut.apply("control+Space").ok,false);
    assert.equal(shortcut.failure?.shortcut,"control+Space","startup failure is owned by the runtime, not a settings draft");
    assert.equal(shortcut.current,null);
    unavailable=false;assert.equal(shortcut.apply("control+Space").ok,true);assert.equal(shortcut.failure,null);
    unavailable=true;assert.equal(shortcut.apply("alt+F9").ok,false);assert.equal(shortcut.failure,null,"an unsuccessful draft does not invalidate the active shortcut");
    assert.equal(shortcut.current,"control+Space");assert.equal(registered.has("Control+Space"),true);
    shortcut.suspend();assert.throws(()=>shortcut.resume(),NativeShortcutError);assert.equal(shortcut.failure?.operation,"restore");
    unavailable=false;shortcut.resume();assert.equal(shortcut.failure,null);shortcut.dispose();
  }
}
