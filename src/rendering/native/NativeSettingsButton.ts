import { Circle, Container, Graphics } from "pixi.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { motion, killMotionOf } from "../pixi/animation/motionTween.js";

/** Original 34px circular header control; reveal timing is separate from input gating. */
export class NativeSettingsButton extends Container {
  readonly #background=new Graphics({eventMode:"none"});
  #hover=false;
  #shown=true;
  constructor(readonly activate:()=>void,readonly invalidate:()=>void){
    super({label:"native-settings-button",eventMode:"static",cursor:"pointer"});
    this.hitArea=new Circle(17,17,17);this.addChild(this.#background);
    const icon=nativeFluentIcon("settings-24-regular",0xffffff,16);icon.position.set(9,9);this.addChild(icon);
    this.on("pointerdown",event=>event.stopPropagation());
    this.on("pointertap",event=>{event.stopPropagation();if(event.button===0)this.activate();});
    this.on("pointerover",()=>{this.#hover=true;this.#draw();});
    this.on("pointerout",()=>{this.#hover=false;this.#draw();});this.#draw();
  }
  reveal(shown:boolean,interactive:boolean):void{
    this.eventMode=interactive?"static":"none";
    if(shown===this.#shown)return;this.#shown=shown;
    motion(this).duration(0.24).ease("power2.out").to({alpha:shown?1:0}).start();
  }
  #draw():void{
    this.#background.clear().circle(17,20,17).fill({color:0,alpha:0.08})
      .circle(17,17,16.5).fill({color:0xffffff,alpha:this.#hover?0.17:0.11})
      .stroke({color:0xffffff,alpha:this.#hover?0.28:0.2,width:1});this.invalidate();
  }
  override destroy():void{killMotionOf(this);super.destroy({children:true});}
}
