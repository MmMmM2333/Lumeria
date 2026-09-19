import { TexturePool, type Container, type Texture, type TextureSource, type Renderer } from "pixi.js";
import type { DesktopLayer } from "../pixi/scene/DesktopLayer.js";
import type { NativeSelectionToolbar } from "./NativeSelectionToolbar.js";

/** Explicit diagnostic experiment. Caller restricts it to isolated selection-only runs. */
export function isolateNativeSelection(stage:Container,toolbar:NativeSelectionToolbar,mode:"none"|"no-prewarm"|"no-backdrop"|"neither"){
  const layer=stage.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
  const group=layer.groupDragLayer!;
  const prewarm=group.prewarmReleaseNodes,backdrop=toolbar.backdropEnabled;
  if(mode==="no-prewarm"||mode==="neither")group.prewarmReleaseNodes=()=>false;
  if(mode==="no-backdrop"||mode==="neither")toolbar.setBackdropEnabled(false);
  return ()=>{group.prewarmReleaseNodes=prewarm;toolbar.setBackdropEnabled(backdrop);};
}

/** Read-only, Pixi 8.20.1 free texture pool, not total GPU/process allocation. */
export function inspectSelectionTexturePool(renderer:Renderer){
  const rendererUid=renderer.uid;
  const pool=TexturePool as unknown as {_texturePool:Record<string,Texture[]>};
  const textures=Object.values(pool._texturePool).flat().map(texture=>{
    const source=texture.source,data=source._gpuData[rendererUid];
    return {label:texture.label,width:source.pixelWidth,height:source.pixelHeight,format:source.format,
      antialias:source.antialias,resident:Boolean(data&&"gpuTexture" in data&&data.gpuTexture)};
  });
  const targets=renderer.renderTarget as unknown as {_gpuRenderTargetHash:Record<string,{
    width:number;height:number;msaaSamples:number;msaaTextures?:TextureSource[];
  }|null>;_renderSurfaceToRenderTargetHash:Map<unknown,{uid:number;depthStencilTexture?:TextureSource}>};
  const msaa=Object.entries(targets._gpuRenderTargetHash).flatMap(([uid,target])=>target?[{uid,width:target.width,height:target.height,
    samples:target.msaaSamples,sources:target.msaaTextures?.filter(Boolean).map(source=>({width:source.pixelWidth,height:source.pixelHeight,format:source.format,samples:source.sampleCount}))??[]}]:[]);
  const depth=[...new Set(targets._renderSurfaceToRenderTargetHash.values())].flatMap(target=>target.depthStencilTexture?[{
    uid:target.uid,width:target.depthStencilTexture.pixelWidth,height:target.depthStencilTexture.pixelHeight,
    format:target.depthStencilTexture.format,samples:target.depthStencilTexture.sampleCount}]:[]);
  return {scope:"free Pixi texture pool and cached render-target attachments; excludes upload buffers and driver allocations",textures,msaa,depth};
}
