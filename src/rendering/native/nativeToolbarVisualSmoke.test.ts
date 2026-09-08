import assert from "node:assert/strict";
import { Container, Graphics, Rectangle } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { NativeSelectionToolbar } from "./NativeSelectionToolbar.js";
import { NativeToolbarBackdrop } from "./ui/NativeToolbarBackdrop.js";
import { getNativeLocale, setNativeLocale } from "../../native/nativeLocalization.js";

/** GPU pixel and layout regression, invoked only by the native smoke runner. */
export async function runNativeToolbarVisualSmoke(app:NativePixiApplication,present:()=>Promise<void>,capture:(name:string)=>Promise<void>){
  const root=new Container(),stripes=new Graphics(),sample=new Graphics().roundRect(80,110,220,80,18).fill({color:0x202020,alpha:0.94});
  for(let x=0;x<380;x+=8)stripes.rect(x,80,8,140).fill(x%16===0?0xffffff:0x000000);
  root.addChild(stripes,sample);app.stage.addChild(root);
  const filter=new NativeToolbarBackdrop();
  const read=async()=>{
    const pixels=await app.renderer.extract.pixels({target:root,frame:new Rectangle(100,140,160,12),resolution:1});
    const values=[];for(let i=0;i<pixels.pixels.length;i+=4)values.push(pixels.pixels[i]!);
    const mean=values.reduce((sum,v)=>sum+v,0)/values.length;
    return values.reduce((sum,v)=>sum+(v-mean)**2,0)/values.length;
  };
  const locale=getNativeLocale();
  const existing=app.stage.getChildByLabel("native-selection-toolbar",true),existingRenderable=existing?.renderable;
  if(existing)existing.renderable=false;
  let toolbar:NativeSelectionToolbar|null=null;
  try{
    await present();const rawVariance=await read();sample.filters=[filter];await present();const blurredVariance=await read();
    assert.ok(rawVariance>20&&blurredVariance<rawVariance*0.4,`backdrop must blur underlying stripes (${rawVariance} -> ${blurredVariance})`);
    await capture("toolbar-backdrop-gpu-proof");root.removeChildren();stripes.destroy();sample.filters=[];sample.destroy();
    setNativeLocale("zh-CN");
    toolbar=new NativeSelectionToolbar({invalidate:()=>app.invalidate(),selectScope:()=>{},clear:()=>{},createFolder:()=>{},removeMenu:()=>{},done:()=>{}});root.addChild(toolbar);
    for(const theme of ["dark","light"] as const){
      for(const width of [480,app.contentSize.width]){
        toolbar.update({width,chromeInset:0,theme,active:true,count:3,hiddenCount:1,frozen:false,canCancel:false,cancelArmed:false});
        root.x=(app.contentSize.width-width)/2;await new Promise(resolve=>setTimeout(resolve,220));await present();
        await capture(`toolbar-${theme}-${width<=760?"compact":"full"}`);
      }
    }
    return {rawVariance,blurredVariance};
  }finally{setNativeLocale(locale);if(existing)existing.renderable=existingRenderable!;if(!sample.destroyed)sample.filters=[];filter.destroy();toolbar?.destroy();root.destroy({children:true});await present();}
}
