import { Color, Container, Graphics, Rectangle } from "pixi.js";
import { nativeFluentTheme, type NativeTheme } from "./NativeFluentButton.js";
import { motion, killMotionOf } from "../pixi/animation/motionTween.js";
import { nativeUiTheme } from "./ui/nativeUiTheme.js";

export class NativeFluentToggle extends Container {
  readonly #track=new Graphics({eventMode:"none",label:"native-toggle-track"});
  readonly #mark=new Graphics({eventMode:"none",label:"native-toggle-mark"});
  #checked=false;
  #disabled=false;
  #hover=false;
  #pressed=false;
  readonly #transition={value:0};
  constructor(readonly kind:"switch"|"checkbox",readonly onChange:(checked:boolean)=>void,
    readonly invalidate:()=>void,readonly theme:NativeTheme="dark",readonly checkboxSize=20) {
    super({eventMode:"static",cursor:"pointer"});
    this.hitArea=new Rectangle(0,0,kind==="switch"?40:32,32);
    this.addChild(this.#track,this.#mark);
    // The thumb shape is fixed. Animate its transform/tint, keeping the GPU
    // geometry stable when settings update an existing switch in place.
    if(kind==="switch")this.#mark.circle(0,16,7).fill(0xffffff);
    this.on("pointerdown",event=>{event.stopPropagation();if(event.button===0){this.#pressed=true;this.#draw();}});
    for(const event of ["pointerup","pointerupoutside","pointercancel"] as const)this.on(event,()=>{this.#pressed=false;this.#draw();});
    this.on("pointertap",event=>{event.stopPropagation();if(event.button===0)this.toggle();});
    this.on("pointerover",()=>{this.#hover=true;this.#draw();});
    this.on("pointerout",()=>{this.#hover=false;this.#draw();});
    this.#draw();
  }
  get checked():boolean{return this.#checked;}
  set checked(value:boolean){this.#checked=value;killMotionOf(this.#transition);this.#transition.value=value?1:0;this.#draw();}
  get transitionProgress():number{return this.#transition.value;}
  captureTransition():{value:number;hover:boolean;pressed:boolean}{return {value:this.#transition.value,hover:this.#hover,pressed:this.#pressed};}
  restoreTransition(previous:{value:number;hover:boolean;pressed:boolean}):void{
    if(this.kind!=="switch")return;
    this.#transition.value=previous.value;this.#hover=previous.hover;this.#pressed=previous.pressed;this.#animate();
  }
  get disabled():boolean{return this.#disabled;}
  set disabled(value:boolean){this.#disabled=value;this.eventMode=value?"none":"static";this.#draw();}
  toggle():void {if(this.#disabled)return;this.#checked=!this.#checked;if(this.kind==="switch")this.#animate();else this.#draw();this.onChange(this.#checked);}
  #animate():void{
    killMotionOf(this.#transition);this.#draw();
    const target=this.#checked?1:0;
    if(Math.abs(this.#transition.value-target)<0.001){this.#transition.value=target;this.#draw();return;}
    motion(this.#transition).duration(0.16).ease("power2.out").to({value:target,onUpdate:()=>this.#draw()}).start();
  }
  #draw():void {
    const colors=nativeFluentTheme(this.theme);
    const fill=this.#disabled?colors.colorNeutralBackgroundDisabled
      :this.#checked?(this.#hover?colors.colorBrandBackgroundHover:colors.colorBrandBackground):colors.colorNeutralBackground1;
    const foreground=this.#disabled?colors.colorNeutralForegroundDisabled
      :this.#checked?colors.colorNeutralForegroundOnBrand:colors.colorNeutralForeground2;
    this.#track.clear();
    if(this.kind==="switch"){
      const state=nativeUiTheme(this.theme);
      const progress=this.#transition.value;
      const mix=(from:string,to:string)=>{const a=new Color(from),b=new Color(to);return {color:new Color([a.red+(b.red-a.red)*progress,a.green+(b.green-a.green)*progress,a.blue+(b.blue-a.blue)*progress]).toNumber(),alpha:a.alpha+(b.alpha-a.alpha)*progress};};
      const on=this.#pressed?state.switchOnPressed:this.#hover?state.switchOnHover:state.switchOn;
      const track=this.#disabled?{color:colors.colorNeutralBackgroundDisabled}:mix(state.switchOff,on);
      const border=this.#disabled?{color:colors.colorNeutralStrokeDisabled}:mix(colors.colorNeutralStrokeAccessible,on);
      this.#track.roundRect(0.5,6.5,39,19,9.5).fill(track).stroke({...border,width:1});
      const disabledThumb=new Color(colors.colorNeutralForegroundDisabled);
      const thumb=this.#disabled?{color:disabledThumb.toNumber(),alpha:disabledThumb.alpha}:mix(state.switchOffThumb,state.switchThumb);
      this.#mark.tint=thumb.color;this.#mark.alpha=thumb.alpha;
      this.#mark.x=10+20*progress;
    }else{
      this.#mark.clear();
      const size=this.checkboxSize,inset=(32-size)/2,compact=size===16;
      this.#track.roundRect(inset+0.5,inset+0.5,size-1,size-1,compact?2:4).fill(compact&&!this.#checked?"transparent":fill).stroke({color:colors.colorNeutralStrokeAccessible,width:1});
      if(this.#checked)this.#mark.moveTo(inset+size*0.2,16).lineTo(inset+size*0.4,inset+size*0.7).lineTo(inset+size*0.8,inset+size*0.3).stroke({color:foreground,width:compact?1.6:2});
    }
    this.invalidate();
  }
  override destroy():void{killMotionOf(this.#transition);super.destroy({children:true});}
}
