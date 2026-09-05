import { Container, Graphics, Rectangle, type FederatedPointerEvent } from "pixi.js";
import { nativeFluentTheme, type NativeTheme } from "./NativeFluentButton.js";

export class NativeFluentSlider extends Container {
  readonly #track=new Graphics({eventMode:"none"});
  #pointer:number|null=null;
  #value:number;
  #disabled=false;
  constructor(readonly controlWidth:number,readonly min:number,readonly max:number,readonly step:number,
    value:number,readonly onChange:(value:number)=>void,readonly invalidate:()=>void,
    readonly theme:NativeTheme="dark"){
    super({eventMode:"static",cursor:"pointer"});
    if(![min,max,step,value].every(Number.isFinite)||max<min||step<=0)throw new TypeError("Invalid slider range");
    this.#value=this.#normalize(value);
    this.hitArea=new Rectangle(0,0,controlWidth,32);this.addChild(this.#track);
    this.on("pointerdown",(event:FederatedPointerEvent)=>{
      event.stopPropagation();if(this.#disabled||event.button!==0||this.#pointer!==null)return;
      this.#pointer=event.pointerId;this.#point(event);
    });
    this.on("globalpointermove",(event:FederatedPointerEvent)=>{if(event.pointerId===this.#pointer)this.#point(event);});
    const release=(event:FederatedPointerEvent)=>{if(event.pointerId===this.#pointer){this.#pointer=null;event.stopPropagation();}};
    this.on("pointerup",release);this.on("pointerupoutside",release);this.on("pointercancel",release);
    this.#draw();
  }
  #normalize(value:number):number {
    return Math.min(this.max,Math.max(this.min,Number((this.min+Math.round((value-this.min)/this.step)*this.step).toPrecision(12))));
  }
  get value():number{return this.#value;}
  get disabled():boolean{return this.#disabled;}
  set value(value:number){if(!Number.isFinite(value))throw new TypeError("Slider value must be finite");this.#value=this.#normalize(value);this.#draw();}
  set disabled(value:boolean){this.#disabled=value;this.#pointer=null;this.eventMode=value?"none":"static";this.#draw();}
  handleKey(key:string):boolean {
    if(this.#disabled)return false;
    const next=key==="Home"?this.min:key==="End"?this.max
      :key==="ArrowLeft"||key==="ArrowDown"?this.#value-this.step
      :key==="ArrowRight"||key==="ArrowUp"?this.#value+this.step:null;
    if(next===null)return false;this.#commit(next);return true;
  }
  #point(event:FederatedPointerEvent):void {
    const x=this.toLocal(event.global).x;
    this.#commit(this.min+(this.max-this.min)*Math.min(1,Math.max(0,(x-10)/(this.controlWidth-20))));
  }
  #commit(value:number):void {const before=this.#value;this.value=value;if(before!==this.#value)this.onChange(this.#value);}
  #draw():void {
    const colors=nativeFluentTheme(this.theme);
    const x=10+(this.controlWidth-20)*(this.max===this.min?0:(this.#value-this.min)/(this.max-this.min));
    const accent=this.#disabled?colors.colorNeutralForegroundDisabled:colors.colorBrandBackground;
    this.#track.clear().roundRect(10,14,this.controlWidth-20,4,2).fill(colors.colorNeutralStrokeAccessible)
      .roundRect(10,14,Math.max(0,x-10),4,2).fill(accent)
      .circle(x,16,10).fill(colors.colorNeutralBackground1).stroke({color:colors.colorNeutralStroke1,width:1})
      .circle(x,16,5).fill(accent);
    this.invalidate();
  }
}
