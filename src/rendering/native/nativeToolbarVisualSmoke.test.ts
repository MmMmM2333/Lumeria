import assert from "node:assert/strict";
import { AlphaFilter, Container, Graphics, Rectangle } from "pixi.js";
import { drawBatchSelectionCheck } from "../pixi/nodes/iconControlDrawing.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { NativeSelectionToolbar } from "./NativeSelectionToolbar.js";
import { NativeToolbarBackdrop } from "./ui/NativeToolbarBackdrop.js";
import { getNativeLocale, setNativeLocale } from "../../native/nativeLocalization.js";

/** GPU pixel and layout regression, invoked only by the native smoke runner. */
export async function runNativeToolbarVisualSmoke(app:NativePixiApplication,present:()=>Promise<void>,capture:(name:string)=>Promise<void>){
  // The stage filter required by the backdrop must preserve MSAA for vector badges.
  const badgeRoot=new Container(),badge=new Container(),circle=new Graphics(),check=new Graphics();
  circle.circle(0,0,12).fill(0x1687ff).stroke({color:0xffffff,width:2});drawBatchSelectionCheck(check,24);
  badge.addChild(circle,check);badge.position.set(20.35,20.65);badgeRoot.addChild(badge);
  const coverage:number[]=[];
  for(const antialias of [false,true]){
    const surface=new AlphaFilter({alpha:1,resolution:"inherit",antialias});badgeRoot.filters=[surface];
    const pixels=await app.renderer.extract.pixels({target:badgeRoot,frame:new Rectangle(0,0,42,42),resolution:1,antialias:true});
    let partial=0;for(let index=3;index<pixels.pixels.length;index+=4)if(pixels.pixels[index]!>0&&pixels.pixels[index]!<255)partial++;
    coverage.push(partial);badgeRoot.filters=[];surface.destroy();
  }
  badgeRoot.destroy({children:true});
  assert.ok(coverage[1]!>coverage[0]!+10,`selection filter must preserve fractional edge coverage (${coverage})`);
  console.log("Selection badge MSAA edge pixels",coverage);
  const root=new Container(),stripes=new Graphics(),sample=new Graphics().roundRect(80,110,220,80,18).fill({color:0x202020,alpha:0.94});
  for(let x=0;x<380;x+=8)stripes.rect(x,80,8,140).fill(x%16===0?0xffffff:0x000000);
  root.addChild(stripes,sample);app.stage.addChild(root);
  const filter=new NativeToolbarBackdrop();
  const read=async()=>{
    // Render the surrounding stripes too: the backdrop kernel samples up to
    // 40px away, so extracting only a 12px-high strip clips its input domain.
    const pixels=await app.renderer.extract.pixels({target:root,frame:new Rectangle(0,0,384,240),resolution:1});
    const values=[];
    for(let y=140;y<152;y++)for(let x=100;x<260;x++)values.push(pixels.pixels[(y*384+x)*4]!);
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
