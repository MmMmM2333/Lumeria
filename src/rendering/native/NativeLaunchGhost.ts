import { Container, Sprite, Text } from "pixi.js";
import type { LaunchGhost } from "../../application/launchpadLaunchFlow.js";
import { APP_LAUNCH_DURATION } from "../../composables/launchpadConstants.js";
import { motion, killMotionOf } from "../pixi/animation/motionTween.js";

export function fadeNativeLaunchpadChrome(nodes:readonly Container[],visible:boolean):void{
  for(const node of nodes)motion(node).duration(0.24).ease("power2.out").to({alpha:visible?1:0}).start();
}

/** Original launch ghost: keep the icon's screen rect, expand 1.92x and fade. */
export class NativeLaunchGhost extends Container {
  #ghost:LaunchGhost|null=null;
  constructor(){super({label:"native-launch-ghost",eventMode:"none"});}
  update(ghost:LaunchGhost|null,source:Container|null):void{
    if(ghost===this.#ghost)return;this.#ghost=ghost;
    killMotionOf(this);killMotionOf(this.scale);
    for(const child of this.removeChildren())child.destroy();
    this.visible=Boolean(ghost);if(!ghost)return;
    const icon=source as (Container & {iconSprite?:Sprite;emojiText?:Text})|null;
    let visual:Sprite|Text;
    if(icon?.iconSprite?.visible)visual=new Sprite(icon.iconSprite.texture);
    else visual=new Text({text:icon?.emojiText?.text??ghost.app.emoji??"",...(icon?.emojiText?{style:icon.emojiText.style.clone()}:{})});
    visual.anchor.set(0.5);visual.width=ghost.rect.width;visual.height=ghost.rect.height;
    this.addChild(visual);this.position.set(ghost.rect.left+ghost.rect.width/2,ghost.rect.top+ghost.rect.height/2);
    this.alpha=1;this.scale.set(1);
    motion(this).duration(APP_LAUNCH_DURATION/1000).ease("power2.out").to({alpha:0}).start();
    motion(this.scale).duration(APP_LAUNCH_DURATION/1000).ease("power2.out").to({x:1.92,y:1.92}).start();
  }
  override destroy():void{killMotionOf(this);killMotionOf(this.scale);super.destroy({children:true});}
}
