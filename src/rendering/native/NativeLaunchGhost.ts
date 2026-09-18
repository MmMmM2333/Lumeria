import { createNativeText } from "./nativeTypography.js";
import { BlurFilter, Container, Rectangle, Sprite, Text } from "pixi.js";
import type { LaunchGhost } from "../../application/launchpadLaunchFlow.js";
import { APP_LAUNCH_DURATION } from "../../domain/launchpadConstants.js";
import { motion, killMotionOf } from "../pixi/animation/motionTween.js";

export function fadeNativeLaunchpadChrome(nodes:readonly Container[],visible:boolean,immediate=false):void{
  for(const node of nodes){
    if(immediate){killMotionOf(node,"alpha");node.alpha=visible?1:0;}
    else motion(node).duration(0.24).ease("power2.out").to({alpha:visible?1:0}).start();
  }
}

/** Match the DOM ghost's configured size, screen center and image drop shadow. */
export class NativeLaunchGhost extends Container {
  #ghost:LaunchGhost|null=null;
  #finished:Promise<void>=Promise.resolve();
  #finish:()=>void=()=>{};
  constructor(){super({label:"native-launch-ghost",eventMode:"none",visible:false});}
  update(ghost:LaunchGhost|null,source:Container|null,iconSize:number,resolution=1):void{
    if(ghost===this.#ghost)return;this.#ghost=ghost;
    this.#finish();
    killMotionOf(this);killMotionOf(this.scale);
    this.cacheAsTexture(false);
    for(const child of this.removeChildren())child.destroy();
    this.visible=Boolean(ghost);if(!ghost)return;
    const icon=source as (Container & {iconSprite?:Sprite;emojiText?:Text})|null;
    let visual:Sprite|Text;
    if(icon?.iconSprite?.visible){
      visual=new Sprite(icon.iconSprite.texture);visual.width=visual.height=iconSize;
      const shadow=new Sprite(icon.iconSprite.texture);shadow.anchor.set(0.5);shadow.width=shadow.height=iconSize;
      shadow.tint=0;shadow.alpha=0.24;shadow.y=6;shadow.label="native-launch-shadow";
      const blur=new BlurFilter({strength:10,quality:4});shadow.filters=[blur];
      shadow.on("destroyed",()=>{blur.blurXFilter.destroy();blur.blurYFilter.destroy();blur.destroy();});
      this.addChild(shadow);
    }else {
      const style=icon?.emojiText?.style.clone();
      if(style){style.fontSize=iconSize;style.lineHeight=iconSize;}
      visual=createNativeText({text:icon?.emojiText?.text??ghost.app.emoji??"",style:style??{fontSize:iconSize,lineHeight:iconSize}});
    }
    visual.anchor.set(0.5);visual.label="native-launch-image";
    this.addChild(visual);this.position.set(ghost.rect.left+ghost.rect.width/2,ghost.rect.top+ghost.rect.height/2);
    this.boundsArea=new Rectangle(-visual.width/2,-visual.height/2,visual.width,visual.height);
    if(visual instanceof Sprite){
      // CSS fades the filtered image as one group. Cache the image + shadow so
      // the shadow cannot bleed through its opaque pixels during the fade.
      this.boundsArea=new Rectangle(-iconSize/2-30,-iconSize/2-30,iconSize+60,iconSize+66);
      this.cacheAsTexture({resolution:resolution*1.92,antialias:true});
    }
    this.alpha=1;this.scale.set(1);
    this.#finished=new Promise(resolve=>{this.#finish=resolve;});
    motion(this).duration(APP_LAUNCH_DURATION/1000).ease("power2.out").to({alpha:0}).start();
    motion(this.scale).duration(APP_LAUNCH_DURATION/1000).ease("power2.out").to({x:1.92,y:1.92,onComplete:()=>this.#finish()}).start();
  }
  async waitForCompletion():Promise<void>{
    const ghost=this.#ghost;
    // A stalled renderer must not leave a transparent input-blocking window.
    const timer=setTimeout(()=>{
      if(this.#ghost!==ghost||this.destroyed)return;
      console.warn("Launch animation exceeded its completion deadline; finishing the visual");
      killMotionOf(this);killMotionOf(this.scale);this.alpha=0;this.scale.set(1.92);this.#finish();
    },2000);
    try{await this.#finished;}finally{clearTimeout(timer);}
  }
  override destroy():void{this.#finish();killMotionOf(this);killMotionOf(this.scale);super.destroy({children:true});}
}
