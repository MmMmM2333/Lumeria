import assert from "node:assert/strict";
import { Container, type Renderer } from "pixi.js";
import { installNativeCanvasTestAdapter } from "./nativeCanvasTestAdapter.js";
import { NativeSelectionToolbar } from "../rendering/native/NativeSelectionToolbar.js";
import { isolateNativeSelection,inspectSelectionTexturePool } from "../rendering/native/nativeSelectionStressIsolation.js";

installNativeCanvasTestAdapter();
const toolbar=new NativeSelectionToolbar({invalidate(){},selectScope(){},clear(){},createFolder(){},removeMenu(){},done(){}});
const stage=new Container(),layer=new Container({label:"launchpad-native-desktop"});stage.addChild(layer);
const original=()=>true;
Object.assign(layer,{groupDragLayer:{prewarmReleaseNodes:original}});
const group=(layer as Container&{groupDragLayer:{prewarmReleaseNodes:()=>boolean}}).groupDragLayer;
try{
  const renderer={uid:123456,renderTarget:{_gpuRenderTargetHash:{retired:null},_renderSurfaceToRenderTargetHash:new Map()}} as unknown as Renderer;
  assert.deepEqual(inspectSelectionTexturePool(renderer).msaa,[],"GPU GC leaves null cache entries; the observer must skip them");
  const sharedTarget={uid:2,depthStencilTexture:{pixelWidth:32,pixelHeight:16,format:"depth24plus-stencil8",sampleCount:4}};
  Object.assign(renderer.renderTarget,{_renderSurfaceToRenderTargetHash:new Map([[{},sharedTarget],[{},sharedTarget]])});
  assert.equal(inspectSelectionTexturePool(renderer).depth.length,1,"surface aliases must not double-count a depth attachment");
  for(const mode of ["none","no-prewarm","no-backdrop","neither"] as const){
    const restore=isolateNativeSelection(stage,toolbar,mode);
    assert.equal(toolbar.backdropEnabled,mode!=="no-backdrop"&&mode!=="neither");
    assert.equal(group.prewarmReleaseNodes(),mode!=="no-prewarm"&&mode!=="neither");
    restore();assert.equal(toolbar.backdropEnabled,true);assert.equal(group.prewarmReleaseNodes,original);
  }
}finally{toolbar.destroy();stage.destroy({children:true});}
console.log("Selection isolation controls are independent and restore defaults");
