import {Container,Graphics,RoundedRectangle} from "pixi.js";
import {createNativeText,NATIVE_UI_FONT_FAMILY} from "./nativeTypography.js";
import {t} from "../../native/nativeLocalization.js";

/** Desktop-only pill; deliberately matches the circular settings control. */
export class NativeNewAppsButton extends Container{
  readonly background=new Graphics({eventMode:"none"});
  readonly caption=createNativeText({text:"",eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,fill:0xffffff}});
  #hover=false;#text="";controlWidth=90;
  constructor(readonly activate:()=>void,readonly invalidate:()=>void){
    super({label:"native-new-apps",eventMode:"static",cursor:"pointer"});this.addChild(this.background,this.caption);
    this.on("pointerdown",event=>event.stopPropagation());this.on("pointertap",event=>{event.stopPropagation();if(event.button===0)this.activate();});
    this.on("pointerover",()=>{this.#hover=true;this.draw();});this.on("pointerout",()=>{this.#hover=false;this.draw();});
  }
  update(count:number,shown:boolean,interactive:boolean,compact=false):void{
    this.visible=shown&&count>0;this.eventMode=this.visible&&interactive?"static":"none";
    const label=t(compact?"imports.recent":count===1?"imports.recentPillOne":"imports.recentPill",{count:count>999?"999+":count});
    if(label!==this.#text){this.#text=label;this.caption.text=label;this.controlWidth=Math.max(86,Math.ceil(this.caption.width)+32);this.caption.position.set(16,(34-this.caption.height)/2);this.hitArea=new RoundedRectangle(0,0,this.controlWidth,34,17);this.draw();}
  }
  draw():void{this.background.clear().roundRect(0,3,this.controlWidth,34,17).fill({color:0,alpha:0.08}).roundRect(.5,.5,this.controlWidth-1,33,16.5).fill({color:0xffffff,alpha:this.#hover?.17:.11}).stroke({color:0xffffff,alpha:this.#hover?.28:.2,width:1});this.invalidate();}
}
