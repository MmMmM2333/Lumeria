import { Container,Graphics,Sprite,TilingSprite,TilingSpritePipe,extensions,Texture,type Renderer } from "pixi.js";
import type { LayoutSettings } from "../../domain/layoutDocument.js";
import { resolveBackgroundImagePlacement,type WindowsImagePlacementContext } from "../../domain/backgroundImageLayout.js";
import { createBackgroundEffectPlan } from "../../domain/backgroundEffectPlan.js";
import { BackgroundEffectPipeline } from "../pixi/background/backgroundEffectPipeline.js";
import { loadNativeIconTexture } from "./nativeIconTextureLoader.js";
import { resolveAppearancePreference } from "../../domain/appearancePreference.js";
import { prepareNativeIconTextures } from "./nativeRecoverableIconSource.js";

export type NativeBackgroundHost = {
  readonly renderer: Renderer;
  readonly state?: string;
  beforeRender?(prepare: () => void | Promise<void>): () => void;
};
type BackgroundRecipe = {
  config: NativeBackgroundConfig; width: number; height: number;
  context: WindowsImagePlacementContext | undefined; systemAppearance: "light" | "dark";
};

export type NativeBackgroundConfig = Pick<LayoutSettings,
  "backgroundSource"|"backgroundImagePath"|"backgroundBaseColor"|"backgroundBaseOpacity"|
  "backgroundImageLayout"|"backgroundEffect"|"backgroundBlurStrength"|"backgroundAcrylicBlurStrength"|
  "backgroundImageOpacity"|"backgroundAcrylicAppearance"|"backgroundAcrylicLightParams"|
  "backgroundAcrylicDarkParams"|"backgroundDarkenColor"|"backgroundDarkenStrength">;

// Native host intentionally disables automatic Pixi extension imports.
extensions.add(TilingSpritePipe);

/** The native desktop and settings previews use the same placement and effect pipeline as Web. */
export class NativeBackground extends Container {
  readonly #base=new Graphics({eventMode:"none",label:"native-background-base"});
  readonly #display=new Sprite({texture:Texture.EMPTY,label:"native-background-image"});
  readonly #shade=new Graphics({eventMode:"none"});
  readonly #source=new Container();
  readonly #image=new Sprite(Texture.EMPTY);
  readonly #tile=new TilingSprite({texture:Texture.EMPTY});
  readonly #pipeline:BackgroundEffectPipeline;
  #texture:Texture|null=null;
  #path:string|null=null;
  #request=0;
  #renderKey="";
  #rendererUid:number|null=null;
  #recipe:BackgroundRecipe|null=null;
  #pendingRender:Promise<void>|null=null;
  readonly #offPrepare:(()=>void)|undefined;
  constructor(readonly host:NativeBackgroundHost,readonly invalidate:()=>void){
    super({eventMode:"none",label:"native-background"});
    this.addChild(this.#base,this.#display,this.#shade);this.#source.addChild(this.#image,this.#tile);
    this.#pipeline=new BackgroundEffectPipeline(host,{displaySprite:this.#display});
    this.#offPrepare=host.beforeRender?.(()=>this.prepare());
  }
  async configure(config:NativeBackgroundConfig,width:number,height:number,context?:WindowsImagePlacementContext,systemAppearance:"light"|"dark"="dark"):Promise<void>{
    const request=++this.#request;
    const path=config.backgroundSource==="customImage"||config.backgroundSource==="windowsWallpaper"?config.backgroundImagePath:null;
    if(path!==this.#path){
      let next:Texture|null;
      try{next=path?await loadNativeIconTexture(path):null;}
      catch(error){
        // A superseded or disposed request must not clear a newer background.
        if(this.destroyed||request!==this.#request)return;
        this.#image.texture=this.#tile.texture=Texture.EMPTY;
        this.#texture?.destroy(true);this.#texture=null;this.#path=null;this.#renderKey="";this.#recipe=null;
        this.#pipeline.destroyRenderTextures();this.#display.visible=false;this.#shade.clear();
        this.#paintBase(config,width,height);this.invalidate();
        // Keep the configured path untouched and retry on a later configure call.
        // The caller still receives the real IO/decode error for its notice.
        throw error;
      }
      if(this.destroyed||request!==this.#request){next?.destroy(true);return;}
      this.#image.texture=this.#tile.texture=Texture.EMPTY;
      this.#texture?.destroy(true);this.#texture=next;this.#path=path;this.#renderKey="";
    }
    if(this.destroyed||request!==this.#request)return;
    const recipe={config,width,height,context,systemAppearance};
    this.#recipe=recipe;
    return this.#render(recipe,request);
  }
  /** RenderTexture contents are derived GPU data, not a recoverable image source. */
  prepare():void|Promise<void>{
    if(this.destroyed||!this.#recipe)return;
    if(this.#pendingRender)return this.#pendingRender;
    if(this.#texture&&this.#needsRedraw())return this.#render(this.#recipe,this.#request);
  }
  #needsRedraw():boolean{
    const renderer=this.host.renderer;
    if(this.#rendererUid!==renderer.uid)return true;
    const data=this.#display.texture.source._gpuData[renderer.uid];
    return !data||!("gpuTexture" in data)||!data.gpuTexture;
  }
  #render(recipe:BackgroundRecipe,request:number):Promise<void>{
    const pending=this.#draw(recipe,request);
    this.#pendingRender=pending;
    const clear=()=>{if(this.#pendingRender===pending)this.#pendingRender=null;};
    void pending.then(clear,clear);
    return pending;
  }
  async #draw({config,width,height,context,systemAppearance}:BackgroundRecipe,request:number):Promise<void>{
    const renderer=this.host.renderer;
    const key=JSON.stringify([config,width,height,context,systemAppearance]);
    if(key===this.#renderKey&&(!this.#texture||!this.#needsRedraw()))return;
    // The original image lives in an off-stage container, so the desktop icon
    // preparation walk cannot restore it after device loss or texture GC.
    const restore=prepareNativeIconTextures(this.#source,renderer);
    if(restore)await restore;
    if(this.destroyed||request!==this.#request||(this.host.state&&this.host.state!=="running")||renderer!==this.host.renderer)return;
    if(this.#rendererUid!==renderer.uid){
      // These off-stage render groups are outside the host's stage recovery walk.
      // Their old instruction sets reference batchers owned by the retired renderer.
      for(const root of [this.#source,this.#pipeline.passSprite])if(root?.renderGroup)root.renderGroup.structureDidChange=true;
      this.#image.unload();this.#tile.unload();this.#pipeline.passSprite?.unload();
    }else if(this.#texture&&this.#needsRedraw()){
      // Recreate the derived targets after GC/unload: cached attachments and bind
      // groups in the current renderer may still refer to their retired GPU texture.
      this.#pipeline.destroyRenderTextures();
    }
    this.#paintBase(config,width,height);
    this.#display.visible=Boolean(this.#texture);this.#shade.clear();
    if(this.#texture){
      const texture=this.#texture;
      const effect=createBackgroundEffectPlan({backgroundEffect:config.backgroundEffect,
        backgroundBlurStrength:config.backgroundEffect==="acrylic"?config.backgroundAcrylicBlurStrength:config.backgroundBlurStrength,
        backgroundImageOpacity:config.backgroundImageOpacity,
        backgroundAcrylicParams:resolveAppearancePreference(config.backgroundAcrylicAppearance,systemAppearance)==="light"
          ?config.backgroundAcrylicLightParams:config.backgroundAcrylicDarkParams});
      const renderSize = config.backgroundEffect === "blur" || config.backgroundEffect === "acrylic"
        ? this.#pipeline.ensureRenderTexturesForTarget(width,height,effect).renderSize
        : {width,height};
      this.#pipeline.ensureRenderTextures(renderSize,effect);
      const placement=resolveBackgroundImagePlacement({sourceWidth:texture.width,sourceHeight:texture.height,
        targetWidth:width,targetHeight:height,layout:config.backgroundImageLayout,layoutContext:context,
        renderScaleX:renderSize.width/width,renderScaleY:renderSize.height/height});
      this.#image.visible=!placement.tile;this.#tile.visible=Boolean(placement.tile);
      if(placement.tile){this.#tile.texture=texture;this.#tile.position.set(placement.x,placement.y);this.#tile.setSize(placement.width,placement.height);
        this.#tile.tilePosition.set(placement.tileX!,placement.tileY!);this.#tile.tileScale.set(placement.tileScaleX!,placement.tileScaleY!);
      }else{this.#image.texture=texture;this.#image.position.set(placement.x,placement.y);this.#image.setSize(placement.width,placement.height);}
      this.host.renderer.render({container:this.#source,target:this.#pipeline.sourceRenderTexture!,clear:true});
      if(config.backgroundEffect==="blur"||config.backgroundEffect==="acrylic"){
        this.#pipeline.renderBlur(effect,{width,height});
        if(config.backgroundEffect==="acrylic"){this.#pipeline.renderAcrylicComposite(effect.acrylic);this.#display.texture=this.#pipeline.finalRenderTexture!;}
        else this.#display.texture=this.#pipeline.finalBlurTexture!;
      }else this.#display.texture=this.#pipeline.sourceRenderTexture!;
      this.#display.alpha=config.backgroundEffect==="acrylic"?1:config.backgroundImageOpacity/100;this.#display.setSize(width,height);
      if(config.backgroundEffect==="dimmed")this.#shade.rect(0,0,width,height).fill({color:config.backgroundDarkenColor,alpha:config.backgroundDarkenStrength/100});
    }
    this.#rendererUid=renderer.uid;this.#renderKey=key;this.invalidate();
  }
  #paintBase(config:NativeBackgroundConfig,width:number,height:number):void{
    // Live Desktop is composed below the GPU child window; its pixels need the
    // child surface to stay transparent. Failed starts keep the previous base.
    this.#base.clear().rect(0,0,width,height).fill({color:config.backgroundBaseColor,alpha:config.backgroundSource==="windowsLiveDesktop"?0:config.backgroundBaseOpacity/100});
  }
  override destroy():void{
    this.#offPrepare?.();this.#request++;this.#recipe=null;this.#pipeline.destroy();this.#source.destroy({children:true});this.#texture?.destroy(true);super.destroy({children:true});
  }
}
