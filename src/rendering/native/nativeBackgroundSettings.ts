import { NativeSpinButton } from "./NativeSpinButton.js";
import { createNativeText } from "./nativeTypography.js";
import { Container, Graphics, Text, type Renderer } from "pixi.js";
import type { TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { rgbArrayToHex, ACRYLIC_PARAM_STEP, ACRYLIC_TINT_STRENGTH_MIN, ACRYLIC_TINT_STRENGTH_MAX,
  ACRYLIC_BRIGHTNESS_MIN, ACRYLIC_BRIGHTNESS_MAX, ACRYLIC_CONTRAST_MIN, ACRYLIC_CONTRAST_MAX,
  ACRYLIC_SATURATION_MIN, ACRYLIC_SATURATION_MAX } from "../../domain/backgroundAcrylicParams.js";
import { t } from "../../native/nativeLocalization.js";
import { NATIVE_UI_FONT_FAMILY as PIXI_UI_FONT_FAMILY } from "./nativeTypography.js";
import { NativeBackground, type NativeBackgroundConfig, type NativeBackgroundHost } from "./NativeBackground.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NativeFluentSlider } from "./NativeFluentSlider.js";
import { NativeSegmentedControl } from "./NativeSegmentedControl.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { NativeSettingsLayout, nativeSettingsChevron } from "./nativeSettingsLayout.js";
import { createNativeSettingsInput } from "./nativeSettingsInput.js";
import { nativeRowSummary } from "./ui/nativeRowSummary.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";

type Settings = ReturnType<typeof createLaunchpadSettings>;
export type NativeBackgroundPanelState = { layer:boolean; effect:boolean; profile:"light"|"dark"; error:string };
export function nativeDraftBackground(settings:Settings):NativeBackgroundConfig {
  const d=settings.draft;
  return {
    backgroundSource:d.backgroundSource.value,backgroundImagePath:d.backgroundImagePath.value,
    backgroundBaseColor:d.backgroundBaseColor.value,backgroundBaseOpacity:d.backgroundBaseOpacity.value,
    backgroundImageLayout:d.backgroundImageLayout.value,backgroundImageOpacity:d.backgroundImageOpacity.value,
    backgroundEffect:d.backgroundEffect.value,backgroundBlurStrength:d.backgroundBlurStrength.value,
    backgroundAcrylicBlurStrength:d.backgroundAcrylicBlurStrength.value,backgroundAcrylicAppearance:d.backgroundAcrylicAppearance.value,
    backgroundAcrylicLightParams:d.backgroundAcrylicLightParams.value,backgroundAcrylicDarkParams:d.backgroundAcrylicDarkParams.value,
    backgroundDarkenColor:d.backgroundDarkenColor.value,backgroundDarkenStrength:d.backgroundDarkenStrength.value,
  };
}

export function nativeBackgroundSettings(options:{
  settings:Settings;host:TextInputHost;renderer:Renderer;width:number;theme:NativeTheme;
  renderHost?: NativeBackgroundHost;
  systemAppearance:"light"|"dark";size:{width:number;height:number};state:NativeBackgroundPanelState;
  invalidate():void;redraw():void;
  chooseColor?: ((color:number)=>Promise<number|null>) | undefined;
}):NativeSettingsContent {
  const {settings,host,width,theme,state,invalidate,redraw}=options;
  const d=settings.draft,a=settings.actions,style=nativeSettingsStyle(theme);
  const node=new Container(),controls:NativeSettingsControl[]=[],cleanup:(()=>void)[]=[];
  const layout=new NativeSettingsLayout(node,width,theme);
  const previews:{view:NativeBackground;effect:boolean}[]=[];
  let y=0,disposed=false,fieldWidth=width;
  const text=(value:string,x:number,top:number,size=13,bold=false)=>{
    const label=createNativeText({text:value,eventMode:"none",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:size,
      fontWeight:bold?"600":"400",fill:style.text}});
    label.position.set(x,top);node.addChild(label);return label;
  };
  const key=(suffix:string)=>t(`settings.interface.background.${suffix}`);
  const refreshPreviews=()=>{
    for(const {view,effect} of previews){
      const config=nativeDraftBackground(settings);
      if(!effect)config.backgroundEffect="none";
      void view.configure(config,options.size.width,options.size.height,undefined,options.systemAppearance).then(()=>{
        if(!disposed){view.visible=true;invalidate();}
      }).catch(error=>{
        if(!disposed&&state.error!==String(error)){state.error=String(error);redraw();}
      });
    }
  };
  const button=(label:string,id:string,x:number,top:number,w:number,run:()=>void,selected=false,height=34)=>{
    const b=new NativeFluentButton(label,w,run,invalidate,theme,height===72?"settings-row":"outline",false,height);
    if(selected)b.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,w,height,4).fill(style.selected),1);
    b.label=`native-background:${id}`;b.position.set(x,top);node.addChild(b);
    controls.push({node:b,focus:value=>{b.focused=value;},disabled:()=>b.disabled,
      handleKey:k=>{if(k!==" "&&k!=="Enter")return false;b.activate();return true;}});
    return b;
  };
  const choices=(label:string,id:string,values:readonly (readonly [string,string])[],current:string,change:(value:string)=>void,disabled=false)=>{
    text(label,14,y+9,12);y+=30;
    const segmented=new NativeSegmentedControl(values.map(([value,label])=>({value,label,id:`native-background:${id}-${value}`,disabled})),
      current,value=>{change(value);redraw();},invalidate,theme,fieldWidth-30);
    segmented.position.set(14,y);node.addChild(segmented);controls.push(...segmented.controls);
    y+=44;
  };
  const slider=(label:string,id:string,value:number,change:(value:number)=>void,min=0,max=100,step=1)=>{
    const caption=text(label,14,y+9,12),factor=max<=2?100:1;
    const start=caption.x+caption.width+12,inputWidth=86,inputX=fieldWidth-inputWidth-14;
    const stacked=inputX-start<72,controlY=stacked?y+30:y,sliderX=stacked?14:start;
    const numeric=new NativeSpinButton(host,inputWidth,min*factor,max*factor,step*factor,value*factor,next=>{
      control.value=next/factor;change(next/factor);refreshPreviews();
    },invalidate,theme,"%");
    numeric.label=`native-background:${id}-value`;numeric.input.label=`native-background:${id}-input`;
    numeric.position.set(inputX,controlY);node.addChild(numeric);
    const control=new NativeFluentSlider(inputX-sliderX-10,min,max,step,value,next=>{
      change(next);numeric.value=next*factor;refreshPreviews();
    },invalidate,theme);
    control.label=`native-background:${id}`;control.position.set(sliderX,controlY);node.addChild(control);
    const focus=new Graphics({eventMode:"none"});control.addChild(focus);
    controls.push({node:control,disabled:()=>control.disabled,handleKey:k=>control.handleKey(k),focus:active=>{
      focus.clear();if(active)focus.roundRect(0,0,control.controlWidth,32,4).stroke({color:style.accent,width:2});invalidate();
    }},{node:numeric.input,commit:()=>numeric.commit(),disabled:()=>numeric.input.disabled,
      handleKey:k=>numeric.handleKey(k),focus:active=>{if(active)numeric.input.focus();else numeric.input.blur();}});
    y=controlY+42;
  };
  const color=(label:string,id:string,value:string,change:(value:string)=>void)=>{
    text(label,14,y+9,12);
    const swatch=button("",`${id}-picker`,fieldWidth-176,y+3,28,()=>{void chooseColor();},false,28);
    swatch.disabled=!options.chooseColor;
    const fill=new Graphics({eventMode:"none"});swatch.addChild(fill);
    const paint=(hex:string)=>fill.clear().roundRect(1,1,26,26,3).fill(hex).stroke({color:style.border,width:1});paint(value);
    const input=createNativeSettingsInput(host,{width:126,height:34,value,theme,invalidate});
    input.label=`native-background:${id}`;input.position.set(fieldWidth-140,y);node.addChild(input);
    async function chooseColor(){
      if(!options.chooseColor||disposed||swatch.disabled)return;
      swatch.disabled=true;
      try{
        const selected=await options.chooseColor(Number.parseInt(value.slice(1),16));
        if(disposed||selected===null)return;
        value=`#${selected.toString(16).padStart(6,"0")}`;input.value=value;change(value);paint(value);refreshPreviews();
      }catch(error){if(!disposed){state.error=String(error);redraw();}}
      finally{if(!disposed){swatch.disabled=false;invalidate();}}
    }
    const commit=()=>{if(/^#[a-f\d]{6}$/i.test(input.value)){value=input.value.toLowerCase();change(value);paint(value);refreshPreviews();}else input.value=value;};
    input.on("blur",commit);cleanup.push(()=>{input.removeAllListeners("blur");input.destroy();});
    controls.push({node:input,commit,disabled:()=>input.disabled,focus:active=>{if(active)input.focus();else if(input.focused)input.blur();},
      handleKey:k=>{if(k==="Enter"){commit();return true;}if(k==="Escape"){input.value=value;input.blur();return true;}return false;}});y+=42;
  };
  const expandable=(title:string,id:"layer"|"effect",description:string,summary:string)=>{
    const top=y;
    const b=button(title,`${id}-expand`,0,top,width,()=>{state[id]=!state[id];redraw();},false,72);
    b.caption.anchor.set(0,0.5);b.caption.position.set(70,25);b.caption.style.fontWeight="600";
    const icon=nativeFluentIcon(id==="layer"?"image-24-regular":"blur-24-regular",style.accent,22);icon.position.set(25,25);b.addChild(icon);
    const chevron=nativeSettingsChevron(b,width-26,36,style.muted);
    const value=nativeRowSummary(b,summary,width,28,theme,`native-background:${id}-summary`);
    const detail=new NativeSingleLineText(description,{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,lineHeight:16.2,fill:style.muted},Math.max(80,width-70-value.width-59));
    detail.position.set(70,top+40);node.addChild(detail);
    y+=72;
    return {chevron,header:b};
  };
  const preview=(effect:boolean,top:number)=>{
    const view=new NativeBackground(options.renderHost??{renderer:options.renderer},invalidate);
    view.visible=false;
    const previewWidth=Math.min(320,width*0.43),scale=previewWidth/options.size.width;
    view.label=`native-background-preview:${effect?"effect":"layer"}`;
    view.position.set(width-previewWidth-14,top);view.scale.set(scale);node.addChild(view);previews.push({view,effect});
    y=Math.max(y,top+options.size.height*scale)+14;
  };
  const choose=async(wallpaper:boolean)=>{
    state.error="";
    const pending=wallpaper?a.useDraftDesktopWallpaper():a.chooseDraftBackgroundImage();redraw();
    const result=await pending;
    if(!result.ok&&"error" in result)state.error=String(result.error);
    redraw();
  };
  text(key("title"),0,0,18,true);y=32;
  const baseTop=y;
  node.addChild(new Graphics({eventMode:"none"}).roundRect(0,baseTop,width,72,8).fill(style.row).stroke({color:style.border,width:1}));
  const baseIcon=nativeFluentIcon("paint-brush-24-regular",style.accent,22);baseIcon.position.set(25,baseTop+25);node.addChild(baseIcon);
  text(key("base.title"),70,baseTop+17,13,true);
  const baseDescription=text(key("base.description"),70,baseTop+37,12);baseDescription.style.fill=style.muted;
  baseDescription.style.wordWrap=true;baseDescription.style.wordWrapWidth=Math.max(100,width-485);
  const baseColors=new Container();let start=node.children.length;fieldWidth=180;y=baseTop+19;
  color("","base-color",d.backgroundBaseColor.value,a.setDraftBackgroundBaseColor);
  const colorChildren=node.children.slice(start);node.removeChildren(start);baseColors.addChild(...colorChildren);baseColors.x=width-468;node.addChild(baseColors);
  const baseOpacity=new Container();start=node.children.length;fieldWidth=286;y=baseTop+19;
  slider(key("base.opacity"),"base-opacity",d.backgroundBaseOpacity.value,a.setDraftBackgroundBaseOpacity);
  const opacityChildren=node.children.slice(start);node.removeChildren(start);baseOpacity.addChild(...opacityChildren);baseOpacity.x=width-286;node.addChild(baseOpacity);
  fieldWidth=width;y=baseTop+78;
  const source=d.backgroundSource.value,usesImage=source==="customImage"||source==="windowsWallpaper",usesLive=source==="windowsLiveDesktop";
  const layerName=usesLive?t("debug.panel.tabs.liveDesktop"):key(source==="customImage"?"layer.custom":source==="windowsWallpaper"?"layer.wallpaper":"layer.none");
  const layerSummary=usesImage?`${layerName} · ${key(`layer.layout.${d.backgroundImageLayout.value}`)} · ${d.backgroundImageOpacity.value}%`:layerName;
  const layerRow=expandable(key("layer.title"),"layer",key(`layer.${usesLive?"hintLive":source==="customImage"?"hintCustom":source==="windowsWallpaper"?"hintWallpaper":"hintNone"}`),layerSummary);
  const layerStart=node.children.length,layerTop=y,layerControls=controls.length;
  {
    const detailTop=y;fieldWidth=width-Math.min(320,width*0.43)-30;
    const busy=settings.presentation.isChoosingBackgroundImage.value;
    const sources:[string,string][]=[["systemMaterial",key("layer.none")],["customImage",key("layer.custom")],["windowsWallpaper",key("layer.wallpaper")]];
    if(a.canUseLiveDesktopBackground())sources.push(["windowsLiveDesktop",t("debug.panel.tabs.liveDesktop")]);
    choices(key("layer.source"),"source",sources,source,value=>{
      if(value==="windowsWallpaper")void choose(true);
      else if(value==="customImage"&&!d.backgroundImagePath.value)void choose(false);
      else a.setDraftBackgroundSource(value);
    },busy);
    if(usesImage){
      slider(key("layer.imageOpacity"),"image-opacity",d.backgroundImageOpacity.value,a.setDraftBackgroundImageOpacity);
      const name=(d.backgroundImagePath.value??"").split(/[\\/]/).pop()??"";
      text(/^background-[a-f\d]+\./i.test(name)?key(source==="windowsWallpaper"?"layer.currentWallpaper":"layer.custom"):name.length>36?name.slice(0,33)+"…":name,14,y+9,12);y+=32;
      button(source==="windowsWallpaper"?key("layer.refreshWallpaper"):t("common.actions.selectImage"),"choose",14,y,140,()=>void choose(source==="windowsWallpaper")).disabled=busy;
      button(t("common.actions.restoreDefault"),"clear",162,y,128,()=>{a.clearDraftBackgroundImage();redraw();}).disabled=busy;y+=46;
      choices(key("layer.display"),"layout",["fill","fit","stretch","tile","center"].map(value=>[value,key(`layer.layout.${value}`)]),d.backgroundImageLayout.value,a.setDraftBackgroundImageLayout);
    }
    if(usesLive)slider(key("layer.liveOpacity"),"live-opacity",d.backgroundLiveDesktopOpacity.value,a.setDraftBackgroundLiveDesktopOpacity);
    if(!usesLive)preview(false,detailTop);fieldWidth=width;
  }
  layout.disclosure("background.layer",state.layer,layerStart,layerTop,y-layerTop,controls.slice(layerControls),layerRow.chevron,true,layerRow.header);y+=6;
  const effectSummary=!(usesImage||usesLive)?key("effect.unavailable"):d.backgroundEffect.value==="blur"?`${key("effect.blur")} · ${d.backgroundBlurStrength.value}%`
    :d.backgroundEffect.value==="dimmed"?`${key("effect.dim")} · ${d.backgroundDarkenStrength.value}%`
    :d.backgroundEffect.value==="acrylic"?`Acrylic · ${d.backgroundAcrylicAppearance.value==="system"?key("effect.system"):t(`settings.interface.window.${d.backgroundAcrylicAppearance.value}`)} · ${d.backgroundAcrylicBlurStrength.value}%`:key("effect.original");
  const effectRow=expandable(key("effect.title"),"effect",(usesImage||usesLive)?key(`effect.${d.backgroundEffect.value==="none"?"hintOriginal":d.backgroundEffect.value==="dimmed"?"hintDim":d.backgroundEffect.value==="blur"?"hintBlur":"hintAcrylic"}`):key("effect.unavailable"),effectSummary);
  const effectStart=node.children.length,effectTop=y,effectControls=controls.length;
  {
    const detailTop=y;fieldWidth=width-Math.min(320,width*0.43)-30;
    choices(key("effect.effect"),"effect",[["none",key("effect.original")],["dimmed",key("effect.dim")],["blur",key("effect.blur")],["acrylic","Acrylic"]],d.backgroundEffect.value,a.setDraftBackgroundEffect,!(usesImage||usesLive));
    if(usesImage||usesLive){
      if(d.backgroundEffect.value==="blur")slider(key("effect.blurStrength"),"blur",d.backgroundBlurStrength.value,a.setDraftBackgroundBlurStrength);
      if(d.backgroundEffect.value==="dimmed"){
        color(key("effect.dimColor"),"dim-color",d.backgroundDarkenColor.value,a.setDraftBackgroundDarkenColor);
        slider(key("effect.dimStrength"),"dim",d.backgroundDarkenStrength.value,a.setDraftBackgroundDarkenStrength);
      }
      if(d.backgroundEffect.value==="acrylic"){
        slider(key("effect.blurStrength"),"acrylic-blur",d.backgroundAcrylicBlurStrength.value,a.setDraftBackgroundAcrylicBlurStrength);
        choices(key("effect.acrylicAppearance"),"appearance",["system","dark","light"].map(v=>[v,t(`settings.interface.window.${v}`)]),d.backgroundAcrylicAppearance.value,a.setDraftBackgroundAcrylicAppearance);
        choices(key("effect.params"),"profile",[["dark",key("effect.darkParams")],["light",key("effect.lightParams")]],state.profile,v=>{state.profile=v as "dark"|"light";});
        const params=state.profile==="light"?d.backgroundAcrylicLightParams.value:d.backgroundAcrylicDarkParams.value;
        color(key("effect.tint"),"tint",rgbArrayToHex(params.tintColor),v=>a.setDraftBackgroundAcrylicParam(state.profile,"tintColor",v));
        slider(key("effect.tintStrength"),"tint-strength",params.tintStrength,v=>a.setDraftBackgroundAcrylicParam(state.profile,"tintStrength",v),ACRYLIC_TINT_STRENGTH_MIN,ACRYLIC_TINT_STRENGTH_MAX,ACRYLIC_PARAM_STEP);
        slider(key("effect.brightness"),"brightness",params.brightness,v=>a.setDraftBackgroundAcrylicParam(state.profile,"brightness",v),ACRYLIC_BRIGHTNESS_MIN,ACRYLIC_BRIGHTNESS_MAX,ACRYLIC_PARAM_STEP);
        slider(key("effect.contrast"),"contrast",params.contrast,v=>a.setDraftBackgroundAcrylicParam(state.profile,"contrast",v),ACRYLIC_CONTRAST_MIN,ACRYLIC_CONTRAST_MAX,ACRYLIC_PARAM_STEP);
        slider(key("effect.saturation"),"saturation",params.saturation,v=>a.setDraftBackgroundAcrylicParam(state.profile,"saturation",v),ACRYLIC_SATURATION_MIN,ACRYLIC_SATURATION_MAX,ACRYLIC_PARAM_STEP);
        button(t("common.actions.restoreDefault"),"reset-acrylic",14,y,150,()=>{a.resetDraftBackgroundAcrylicParams(state.profile);redraw();});y+=44;
      }
      if(!usesLive)preview(true,detailTop);
    }
    fieldWidth=width;
  }
  layout.disclosure("background.effect",state.effect,effectStart,effectTop,y-effectTop,controls.slice(effectControls),effectRow.chevron,true,effectRow.header);y+=6;
  if(state.error){const error=text(state.error,14,y,12);error.style.wordWrap=true;error.style.wordWrapWidth=width-28;y+=error.height+12;}
  refreshPreviews();
  return {node,height:y,controls,layout:layout.finish(y),dispose:()=>{disposed=true;for(const run of cleanup)run();}};
}
