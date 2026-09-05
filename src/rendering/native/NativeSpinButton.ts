import { Color, Container } from "pixi.js";
import type { TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { createNumericControlModel } from "../../domain/numericControl.js";
import { NativeFluentButton, nativeFluentTheme, type NativeTheme } from "./NativeFluentButton.js";
import { PIXI_UI_FONT_FAMILY } from "../typography.js";

export class NativeSpinButton extends Container {
  readonly input;
  readonly #model;
  #value:number;
  #disabled=false;
  readonly #increase:NativeFluentButton;
  readonly #decrease:NativeFluentButton;
  constructor(host:TextInputHost,width:number,readonly min:number,readonly max:number,readonly step:number,value:number,
    readonly onChange:(value:number)=>void,invalidate:()=>void,theme:NativeTheme="dark"){
    super({eventMode:"passive"});
    this.#model=createNumericControlModel({min,max,step});this.#value=this.#model.normalizeValue(value);
    const colors=nativeFluentTheme(theme);
    this.input=host.create({width:width-68,height:34,value:this.#model.formatValue(this.#value),
      style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,lineHeight:18,padding:8,
        backgroundColor:new Color(colors.colorNeutralBackground3).toNumber(),
        borderColor:new Color(colors.colorNeutralStroke1).toNumber(),focusColor:new Color(colors.colorBrandStroke1).toNumber(),
        textColor:new Color(colors.colorNeutralForeground1).toNumber()}});
    this.#decrease=new NativeFluentButton("−",32,()=>this.#step(-1),invalidate,theme);
    this.#increase=new NativeFluentButton("+",32,()=>this.#step(1),invalidate,theme);
    this.#decrease.x=width-68;this.#increase.x=width-32;
    this.addChild(this.input,this.#decrease,this.#increase);
    this.input.on("blur",()=>this.commit());
    this.value=this.#value;
  }
  get value():number{return this.#value;}
  set value(value:number){
    this.#value=this.#model.normalizeValue(value);this.input.value=this.#model.formatValue(this.#value);
    this.#increase.disabled=this.#disabled||this.#value>=this.max;
    this.#decrease.disabled=this.#disabled||this.#value<=this.min;
  }
  set disabled(value:boolean){this.#disabled=value;this.input.disabled=value;this.value=this.#value;}
  commit():void {
    if(this.#disabled)return;
    const parsed=this.#model.parseNumber(this.input.value);
    this.#commit(Number.isFinite(parsed)?parsed:this.#value);
  }
  #commit(value:number):void{const before=this.#value;this.value=value;if(this.#value!==before)this.onChange(this.#value);}
  #step(direction:number):void{
    if(this.#disabled)return;
    const parsed=this.#model.parseNumber(this.input.value);
    this.#commit((Number.isFinite(parsed)?parsed:this.#value)+direction*this.#model.getSafeStep());this.input.focus();
  }
  handleKey(key:string):boolean{
    if(this.#disabled)return false;
    if(key==="ArrowUp"||key==="ArrowDown"||key==="PageUp"||key==="PageDown"){
      this.#step((key==="ArrowUp"||key==="PageUp"?1:-1)*(key.startsWith("Page")?10:1));return true;
    }
    if((key==="Home"&&Number.isFinite(this.min))||(key==="End"&&Number.isFinite(this.max))){
      this.#commit(key==="Home"?this.min:this.max);return true;
    }
    if(key==="Enter"){this.commit();this.input.selectAll();return true;}
    if(key==="Escape"){this.input.value=this.#model.formatValue(this.#value);this.input.blur();return true;}
    return false;
  }
  override destroy():void{this.input.destroy();super.destroy({children:true});}
}
