import { Container, Graphics, Rectangle } from "pixi.js";
import { nativeFluentTheme, type NativeTheme } from "./NativeFluentButton.js";
import { motion, killMotionOf } from "../pixi/animation/motionTween.js";

export class NativeFluentToggle extends Container {
  readonly #track=new Graphics({eventMode:"none"});
  readonly #mark=new Graphics({eventMode:"none"});
  #checked=false;
  #disabled=false;
  #hover=false;
  constructor(readonly kind:"switch"|"checkbox",readonly onChange:(checked:boolean)=>void,
    readonly invalidate:()=>void,readonly theme:NativeTheme="dark") {
    super({eventMode:"static",cursor:"pointer"});
    this.hitArea=new Rectangle(0,0,kind==="switch"?40:32,32);
    this.addChild(this.#track,this.#mark);
    this.on("pointerdown",event=>event.stopPropagation());
    this.on("pointertap",event=>{event.stopPropagation();if(event.button===0)this.toggle();});
    this.on("pointerover",()=>{this.#hover=true;this.#draw();});
    this.on("pointerout",()=>{this.#hover=false;this.#draw();});
    this.#draw();
  }
  get checked():boolean{return this.#checked;}
  set checked(value:boolean){this.#checked=value;this.#draw();}
  get disabled():boolean{return this.#disabled;}
  set disabled(value:boolean){this.#disabled=value;this.eventMode=value?"none":"static";this.#draw();}
  toggle():void {if(this.#disabled)return;this.checked=!this.#checked;this.onChange(this.#checked);}
  #draw():void {
    const colors=nativeFluentTheme(this.theme);
    const fill=this.#disabled?colors.colorNeutralBackgroundDisabled
      :this.#checked?(this.#hover?colors.colorBrandBackgroundHover:colors.colorBrandBackground):colors.colorNeutralBackground1;
    const foreground=this.#disabled?colors.colorNeutralForegroundDisabled
      :this.#checked?colors.colorNeutralForegroundOnBrand:colors.colorNeutralForeground2;
    this.#track.clear();this.#mark.clear();
    if(this.kind==="switch"){
      this.#track.roundRect(0,6,40,20,10).fill(fill).stroke({color:colors.colorNeutralStrokeAccessible,width:1});
      this.#mark.circle(0,16,this.#hover?7:6).fill(foreground);
      motion(this.#mark).duration(0.12).to({x:this.#checked?30:10}).start();
    }else{
      this.#track.roundRect(6,6,20,20,4).fill(fill).stroke({color:colors.colorNeutralStrokeAccessible,width:1});
      if(this.#checked)this.#mark.moveTo(10,16).lineTo(14,20).lineTo(22,12).stroke({color:foreground,width:2});
    }
    this.invalidate();
  }
  override destroy():void{killMotionOf(this.#mark);super.destroy({children:true});}
}
