import { Container,Graphics,Rectangle } from "pixi.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";

/** WindowChromeOverlay's transparent 42x44 caption button and original Fluent glyph. */
export class NativeCaptionButton extends Container {
  constructor(name:"minimize"|"maximize"|"restore"|"close",action:()=>void,invalidate:()=>void){
    super({label:`native-window-chrome:${name}`,eventMode:"static",cursor:"default"});
    this.hitArea=new Rectangle(0,0,42,44);
    const background=new Graphics({eventMode:"none"});this.addChild(background);
    const names={minimize:"subtract-24-regular",maximize:"maximize-24-regular",restore:"square-multiple-24-regular",close:"dismiss-24-regular"} as const;
    const icon=nativeFluentIcon(names[name],0xffffff,12);icon.position.set(15,16);icon.alpha=0.82;this.addChild(icon);
    this.on("pointerover",()=>{background.clear().rect(0,0,42,44).fill({color:name==="close"?0xe81123:0xffffff,alpha:name==="close"?0.88:0.12});icon.alpha=1;invalidate();});
    this.on("pointerout",()=>{background.clear();icon.alpha=0.82;invalidate();});
    this.on("pointerdown",event=>event.stopPropagation());
    this.on("pointertap",event=>{event.stopPropagation();if(event.button===0)action();});
  }
}
