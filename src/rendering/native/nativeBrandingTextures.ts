import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas,loadImage } from "@napi-rs/canvas";
import { BufferImageSource,Texture } from "pixi.js";
import { LAUNCHPAD_ICON_VARIANTS,type LaunchpadIconVariant } from "../../domain/launchpadIconVariant.js";

// The largest settings preview is 128 logical pixels; keep the same 2x minimum
// as UI text and rerasterize from the vector for higher-DPI displays.
export function nativeBrandingPixelSize(resolution:number):number{
  if(!Number.isFinite(resolution)||resolution<=0)throw new RangeError("Branding resolution must be positive");
  return Math.ceil(128*Math.max(2,resolution));
}
export async function loadNativeBrandingTexture(path:string,pixels:number):Promise<Texture>{
  if(!Number.isInteger(pixels)||pixels<1||pixels>4096)throw new RangeError("Invalid branding raster size");
  const source=await readFile(path,"utf8");
  const svg=source.replace(/<svg\b[^>]*>/,tag=>{
    if(!/\bviewBox\s*=/.test(tag))throw new Error("Branding SVG must define its viewBox");
    return tag.replace(/\s(?:width|height)\s*=\s*["'][^"']*["']/g,"").replace(/>$/,` width="${pixels}" height="${pixels}">`);
  });
  const image=await loadImage(Buffer.from(svg));
  if(image.width!==pixels||image.height!==pixels)throw new Error("Branding SVG did not rasterize at the requested size");
  const canvas=createCanvas(pixels,pixels),context=canvas.getContext("2d");context.drawImage(image,0,0);
  const rgba=context.getImageData(0,0,pixels,pixels).data;
  return new Texture({source:new BufferImageSource({resource:new Uint8Array(rgba.buffer,rgba.byteOffset,rgba.byteLength),width:pixels,height:pixels,
    format:"rgba8unorm",alphaMode:"no-premultiply-alpha",autoGenerateMipmaps:true})});
}
export function createNativeBrandingTextures(directory:string,changed:()=>void){
  const textures=new Map<LaunchpadIconVariant,Texture>();let size=0,requested=0,generation=0,closed=false;
  let pending:Promise<void>|null=null;
  const synchronize=(resolution:number):Promise<void>=>{
    const pixels=nativeBrandingPixelSize(resolution);
    if(closed)return Promise.resolve();
    if(pixels<=size)return Promise.resolve();
    if(pending&&pixels<=requested)return pending;
    requested=pixels;const current=++generation;
    const task=(async()=>{
      const results=await Promise.allSettled(LAUNCHPAD_ICON_VARIANTS.map(async variant=>[variant,await loadNativeBrandingTexture(join(directory,variant+".svg"),pixels)] as const));
      const next=results.flatMap(result=>result.status==="fulfilled"?[result.value]:[]);
      const error=results.find(result=>result.status==="rejected");
      if(closed||current!==generation||error){for(const [,texture]of next)texture.destroy(true);if(error?.status==="rejected")throw error.reason;return;}
      const previous=[...textures.values()];for(const [variant,texture]of next)textures.set(variant,texture);size=pixels;
      try{changed();}finally{for(const texture of previous)texture.destroy(true);}
    })();
    pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;
  };
  return {textures,synchronize,destroy(){closed=true;generation++;for(const texture of textures.values())texture.destroy(true);textures.clear();}};
}
