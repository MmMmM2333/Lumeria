import assert from "node:assert/strict";
import { mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { Container,Graphics,Rectangle,type Texture } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { nativeAboutSettingsPage } from "../../rendering/native/nativeAboutSettingsPage.js";
import { NativeFluentButton } from "../../rendering/native/NativeFluentButton.js";
import { getNativeLocale,setNativeLocale } from "../nativeLocalization.js";
import { PRODUCT } from "../../platform/product.js";
import type { ReleaseInfo } from "../../application/releaseCheck.js";

/** Isolated visual review of About only; no network, browser launch or full smoke. */
export async function nativeAboutPreview(options:{app:NativePixiApplication;texture:Texture;directory:string;openAbout():void;present(name:string):Promise<void>;quit():void}){
  const {app,directory,present}=options;mkdirSync(directory,{recursive:true});
  const capture=async(name:string)=>{
    await present(name);
    const data=await app.renderer.extract.base64({target:app.stage,frame:new Rectangle(0,0,app.contentSize.width,app.contentSize.height),resolution:1,format:"png"});
    writeFileSync(join(directory,`${name}.png`),Buffer.from(data.split(",")[1]!,"base64"));
  };
  const locale=getNativeLocale();setNativeLocale("zh-CN");
  options.openAbout();await new Promise(resolve=>setTimeout(resolve,350));await capture("about-settings");
  try{
    for(const theme of ["dark","light"] as const){
      const root=new Container(),width=Math.min(740,app.contentSize.width-80);
      root.addChild(new Graphics().rect(0,0,app.contentSize.width,app.contentSize.height).fill(theme==="dark"?"#1f1f1f":"#f5f5f5"));app.stage.addChild(root);
      let settle!:(release:ReleaseInfo|null)=>void,reject!:(reason:Error)=>void,calls=0,opened="";
      const page=nativeAboutSettingsPage(width,theme,options.texture,{invalidate:()=>app.invalidate(),openExternalUrl:url=>{opened=url;},
        releaseSource:()=>{calls++;return new Promise((resolve,fail)=>{settle=resolve;reject=fail;});}});
      page.node.position.set(40,64);root.addChild(page.node);
      try{
        const check=page.controls[0]!.node as NativeFluentButton,github=page.controls[1]!.node as NativeFluentButton;
        await capture(`about-${theme}-idle`);
        check.activate();check.activate();assert.equal(calls,1,"checking blocks duplicate requests");
        await new Promise(resolve=>setTimeout(resolve,150));await capture(`about-${theme}-checking`);
        github.activate();await Promise.resolve();assert.equal(opened,PRODUCT.repositoryUrl,"GitHub remains available during checking");
        const rotation=check.getChildByLabel("native-about:progress")!.rotation;
        await new Promise(resolve=>setTimeout(resolve,120));assert.notEqual(check.getChildByLabel("native-about:progress")!.rotation,rotation,"progress ring animates");
        settle({version:PRODUCT.version,releaseUrl:PRODUCT.repositoryUrl+"/releases/tag/v"+PRODUCT.version});await new Promise(resolve=>setTimeout(resolve,20));await capture(`about-${theme}-current`);
        check.activate();reject(new Error("offline"));await new Promise(resolve=>setTimeout(resolve,20));await capture(`about-${theme}-failed`);
        check.activate();settle(null);await new Promise(resolve=>setTimeout(resolve,20));await capture(`about-${theme}-unpublished`);
        check.activate();settle({version:"1.1.0",releaseUrl:PRODUCT.repositoryUrl+"/releases/tag/v1.1.0"});await new Promise(resolve=>setTimeout(resolve,20));await capture(`about-${theme}-available`);
        page.controls[0]!.handleKey("Enter");await Promise.resolve();assert.ok(opened.endsWith("/releases/tag/v1.1.0"));
      }finally{page.dispose();root.destroy({children:true});}
    }
    const narrowRoot=new Container();narrowRoot.addChild(new Graphics().rect(0,0,app.contentSize.width,app.contentSize.height).fill("#1f1f1f"));app.stage.addChild(narrowRoot);
    const narrow=nativeAboutSettingsPage(420,"dark",options.texture,{invalidate:()=>app.invalidate(),openExternalUrl:()=>{},releaseSource:async()=>null});
    narrow.node.position.set(40,64);narrowRoot.addChild(narrow.node);
    try{await capture("about-narrow");}finally{narrow.dispose();narrowRoot.destroy({children:true});}
    setNativeLocale("en-US");
    const englishRoot=new Container();englishRoot.addChild(new Graphics().rect(0,0,app.contentSize.width,app.contentSize.height).fill("#1f1f1f"));app.stage.addChild(englishRoot);
    let canceled=false;
    const english=nativeAboutSettingsPage(Math.min(740,app.contentSize.width-80),"dark",options.texture,{invalidate:()=>app.invalidate(),openExternalUrl:()=>{},
      releaseSource:signal=>new Promise((_resolve,reject)=>{signal.addEventListener("abort",()=>{canceled=true;reject(signal.reason);},{once:true});})});
    english.node.position.set(40,64);englishRoot.addChild(english.node);
    try{
      await capture("about-english");(english.controls[0]!.node as NativeFluentButton).activate();
      await new Promise(resolve=>setTimeout(resolve,100));await capture("about-english-checking");
      english.dispose();assert.equal(canceled,true,"leaving About cancels its pending request");
      await Promise.resolve();await Promise.resolve();
    }finally{english.dispose();englishRoot.destroy({children:true});}
    writeFileSync(join(directory,"result.json"),JSON.stringify({passed:true,states:6,themes:2,duplicateRequests:"blocked",githubDuringCheck:"passed",spinner:"animated",releaseLink:"passed"},null,2));
  }finally{setNativeLocale(locale);options.quit();}
}
