import { Container,Graphics,Sprite,TilingSprite,TilingSpritePipe,extensions,Texture,type Renderer } from "pixi.js";
import type { LayoutSettings } from "../../domain/layoutDocument.js";
import { resolveBackgroundImagePlacement,type WindowsImagePlacementContext } from "../../domain/backgroundImageLayout.js";
import { createBackgroundEffectPlan } from "../../domain/backgroundEffectPlan.js";
import { BackgroundEffectPipeline } from "../pixi/background/backgroundEffectPipeline.js";
import { loadNativeIconTexture } from "./nativeIconTextureLoader.js";
import { resolveAppearancePreference } from "../../domain/appearancePreference.js";

export type NativeBackgroundConfig = Pick<LayoutSettings,
  "backgroundSource"|"backgroundImagePath"|"backgroundBaseColor"|"backgroundBaseOpacity"|
  "backgroundImageLayout"|"backgroundEffect"|"backgroundBlurStrength"|"backgroundAcrylicBlurStrength"|
  "backgroundImageOpacity"|"backgroundAcrylicAppearance"|"backgroundAcrylicLightParams"|
  "backgroundAcrylicDarkParams"|"backgroundDarkenColor"|"backgroundDarkenStrength">;

// Native host intentionally disables automatic Pixi extension imports.
extensions.add(TilingSpritePipe);

/** The native desktop and settings previews use the same placement and effect pipeline as Web. */
export class NativeBackground extends Container {
  readonly #base=new Graphics({eventMode:"none"});
  readonly #display=new Sprite(Texture.EMPTY);
  readonly #shade=new Graphics({eventMode:"none"});
  readonly #source=new Container();
  readonly #image=new Sprite(Texture.EMPTY);
  readonly #tile=new TilingSprite({texture:Texture.EMPTY});
  readonly #pipeline:BackgroundEffectPipeline;
  #texture:Texture|null=null;
  #path:string|null=null;
  #request=0;
  #renderKey="";
  constructor(readonly host:{readonly renderer:Renderer},readonly invalidate:()=>void){
    super({eventMode:"none",label:"native-background"});
    this.addChild(this.#base,this.#display,this.#shade);this.#source.addChild(this.#image,this.#tile);
    this.#pipeline=new BackgroundEffectPipeline(host,{displaySprite:this.#display});
  }
  async configure(config:NativeBackgroundConfig,width:number,height:number,context?:WindowsImagePlacementContext,systemAppearance:"light"|"dark"="dark"):Promise<void>{
    const request=++this.#request;
    const path=config.backgroundSource==="customImage"||config.backgroundSource==="windowsWallpaper"?config.backgroundImagePath:null;
    if(path!==this.#path){
      const next=path?await loadNativeIconTexture(path):null;
      if(this.destroyed||request!==this.#request){next?.destroy(true);return;}
      this.#image.texture=this.#tile.texture=Texture.EMPTY;
      this.#texture?.destroy(true);this.#texture=next;this.#path=path;this.#renderKey="";
    }
    if(this.destroyed||request!==this.#request)return;
    const key=JSON.stringify([config,width,height,context,systemAppearance]);if(key===this.#renderKey)return;
    this.#base.clear().rect(0,0,width,height).fill({color:config.backgroundBaseColor,alpha:config.backgroundBaseOpacity/100});
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
    this.#renderKey=key;this.invalidate();
  }
  override destroy():void{
    this.#request++;this.#pipeline.destroy();this.#source.destroy({children:true});this.#texture?.destroy(true);super.destroy({children:true});
  }
}
