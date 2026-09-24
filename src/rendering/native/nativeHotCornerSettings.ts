import { Container, Graphics } from "pixi.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { HOT_CORNER_DELAY_PRESETS, HOT_CORNER_MAX_DELAY_MS, type HotCornerSettings } from "../../domain/hotCorners.js";
import { t } from "../../native/nativeLocalization.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import type { NativeSettingsControl, NativeSettingsContent } from "./NativeSettingsShell.js";
import type { NativeManagement } from "./NativeManagement.js";
import { createNativeText, NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { NativeSettingsLayout, nativeSettingsChevron } from "./nativeSettingsLayout.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";

export function nativeHotCornerSettings(settings:ReturnType<typeof createLaunchpadSettings>,width:number,theme:NativeTheme,
  management:NativeManagement,invalidate:()=>void,redraw:()=>void,expanded:boolean,expand:()=>void):NativeSettingsContent {
  const node=new Container({label:"native-hot-corners-settings"}),controls:NativeSettingsControl[]=[];
  const layout=new NativeSettingsLayout(node,width,theme);
  const style=nativeSettingsStyle(theme),config=settings.draft.hotCorners.value;
  const available=settings.presentation.canConfigureHotCorners.value;
  const label=(parent:Container,value:string,x:number,y:number,size=13,wrap=width-32)=>{
    const text=createNativeText({text:value,style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fill:style.text,wordWrap:true,wordWrapWidth:wrap}});
    text.eventMode="none";text.position.set(x,y);parent.addChild(text);return text;
  };
  const change=(patch:Partial<HotCornerSettings>)=>{settings.actions.setDraftHotCorners({...config,...patch});redraw();};
  const button=(parent:Container,title:string,x:number,y:number,w:number,action:()=>void,appearance:"outline"|"settings-row"|"option"="outline",height=34)=>{
    const control=new NativeFluentButton(title,w,action,invalidate,theme,appearance,false,height);
    control.position.set(x,y);control.disabled=!available;parent.addChild(control);
    controls.push({node:control,focus:value=>{control.focused=value;},disabled:()=>control.disabled,
      handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;control.activate();return true;}});
    return control;
  };
  const check=(parent:Container,value:boolean,x:number,y:number,action:()=>void)=>{
    const control=new NativeFluentToggle("switch",action,invalidate,theme);
    control.position.set(x,y);control.checked=value;control.disabled=!available;parent.addChild(control);
    const focus=new Graphics({eventMode:"none"});control.addChild(focus);
    controls.push({node:control,focus:active=>{focus.clear();if(active)focus.roundRect(-4,-2,48,36,5).stroke({color:style.accent,width:2});invalidate();},disabled:()=>control.disabled,
      handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;control.toggle();return true;}});
    return control;
  };
  const header=button(node,"",0,0,width,expand,"settings-row",72);
  header.disabled=false;header.label="native-setting:hot-corners-expand";
  const icon=nativeFluentIcon("desktop-cursor-24-regular",style.accent,22);icon.position.set(23,25);header.addChild(icon);
  label(header,t("settings.general.hotCorners.title"),70,17).style.fontWeight="600";
  const summary=new NativeSingleLineText(t(available?"settings.general.hotCorners.description":"settings.general.hotCorners.unavailable"),
    {fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,lineHeight:16.2,fill:style.muted},Math.max(80,width-190));
  summary.position.set(70,38);header.addChild(summary);
  const chevron=nativeSettingsChevron(header,width-26,36,style.muted);
  check(node,config.enabled,width-102,20,()=>change({enabled:!config.enabled,corners:config.corners||1})).label="native-setting:hot-corners-enabled";
  const start=node.children.length,controlStart=controls.length;
  const body=new Container();body.y=72;node.addChild(body);
  const cx=width/2,monitorWidth=Math.min(140,width-280),left=cx-monitorWidth/2,right=cx+monitorWidth/2;
  body.addChild(new Graphics({eventMode:"none"}).roundRect(left,24,monitorWidth,94,6).fill(style.row).stroke({color:style.muted,width:1.5})
    .moveTo(cx,118).lineTo(cx,132).moveTo(cx-22,132).lineTo(cx+22,132).stroke({color:style.muted,width:1.5}));
  for(const [bit,key,isLeft,isTop] of [[1,"topLeft",true,true],[2,"topRight",false,true],[4,"bottomLeft",true,false],[8,"bottomRight",false,false]] as const){
    const selected=(config.corners&bit)!==0;
    const control=button(body,t(`settings.general.hotCorners.${key}`),isLeft?left-124:right+12,isTop?24:84,112,()=>change({corners:config.corners^bit}),"option");
    control.selected=selected;control.label=`native-setting:hot-corner-${key}`;
    const x=isLeft?left+7:right-7,y=isTop?31:111,dx=isLeft?1:-1,dy=isTop?1:-1;
    body.addChild(new Graphics({eventMode:"none"}).moveTo(x,y+dy*12).lineTo(x,y).lineTo(x+dx*12,y).stroke({color:selected?style.accent:style.border,width:3}));
  }
  const hint=label(body,t(config.enabled&&!config.corners?"settings.general.hotCorners.selectCorner":"settings.general.hotCorners.hint"),20,148,12,width-40);
  hint.style.fill=style.muted;
  let y=148+Math.max(32,hint.height)+12;
  const selector=(key:string,value:string,entries:{label:string;selected:boolean;run:()=>void}[])=>{
    label(body,t(key),20,y+8,13,width-208);
    const control=button(body,value,width-180,y,160,()=>{const p=control.toGlobal({x:0,y:36});management.menu(p.x,p.y,entries,160);});
    control.caption.x-=10;nativeSettingsChevron(control,144,17,style.muted);
    y+=48;return control;
  };
  selector("settings.general.hotCorners.delay",config.delayMs===0?t("settings.general.hotCorners.immediate"):`${config.delayMs} ms`,
    [...HOT_CORNER_DELAY_PRESETS.map(value=>({label:value===0?t("settings.general.hotCorners.immediate"):`${value} ms`,selected:value===config.delayMs,run:()=>change({delayMs:value})})),
      {label:t("settings.general.hotCorners.custom"),selected:!HOT_CORNER_DELAY_PRESETS.some(value=>value===config.delayMs),run:()=>{
        management.form(t("settings.general.hotCorners.customTitle"),[{label:t("settings.general.hotCorners.customField"),value:String(config.delayMs)}],t("common.actions.apply"),values=>{
          const raw=values[0]?.trim()??"",delayMs=Number(raw);
          if(!/^\d+$/.test(raw)||!Number.isInteger(delayMs)||delayMs>HOT_CORNER_MAX_DELAY_MS)throw new Error(t("settings.general.hotCorners.customRange"));
          change({delayMs});
        },t("settings.general.hotCorners.customRange"));
      }}]).label="native-setting:hot-corners-delay";
  const modifiers={none:t("settings.general.hotCorners.none"),alt:"Alt",control:"Ctrl",shift:"Shift"};
  selector("settings.general.hotCorners.modifier",modifiers[config.modifier],
    (["none","alt","control","shift"] as const).map(value=>({label:modifiers[value],selected:value===config.modifier,run:()=>change({modifier:value})}))).label="native-setting:hot-corners-modifier";
  for(const [key,value,action] of [
    ["pause",config.pauseFullscreen,()=>change({pauseFullscreen:!config.pauseFullscreen})],
    ["toggle",config.toggle,()=>change({toggle:!config.toggle})],
    ["seams",config.allowSeams??false,()=>change({allowSeams:!config.allowSeams})],
  ] as const){
    label(body,t(`settings.general.hotCorners.${key}`),20,y+7,13,width-100);
    check(body,value,width-60,y,action).label=`native-setting:hot-corners-${key}`;
    const detail=label(body,t(`settings.general.hotCorners.${key}Hint`),20,y+30,12,width-100);detail.style.fill=style.muted;
    y+=30+detail.height+(key==="seams"?20:16);
  }
  const height=y;
  layout.disclosure("general.hotCorners",expanded,start,72,height,controls.slice(controlStart),chevron,true,header);
  return {node,controls,height:72+height,layout:layout.finish(72+height),update:()=>{},dispose:()=>{}};
}
