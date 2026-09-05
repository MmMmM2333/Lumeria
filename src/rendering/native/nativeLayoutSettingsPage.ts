import { Container, Graphics, Text } from "pixi.js";
import type { TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import { nativeFluentTheme, nativeSettingsStyle, NativeFluentButton, type NativeTheme } from "./NativeFluentButton.js";
import { NativeSpinButton } from "./NativeSpinButton.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import { PIXI_UI_FONT_FAMILY } from "../typography.js";
import { t } from "../../native/nativeLocalization.js";
import { ICON_SIZE_MIN, ICON_SIZE_MAX } from "../../domain/launchpadGridDefaults.js";

export function nativeLayoutSettingsPage(fullSettings:ReturnType<typeof createLaunchpadSettings>,host:TextInputHost,
  width:number,invalidate:()=>void,theme:NativeTheme,redraw:()=>void):NativeSettingsContent{
  const settings=fullSettings.layoutSettings;
  const node=new Container(),controls:NativeSettingsControl[]=[],inputs:NativeSpinButton[]=[];
  const colors=nativeFluentTheme(theme),style=nativeSettingsStyle(theme);
  let y=0;
  const row=(title:string,description:string)=>{
    const rowNode=new Container();rowNode.y=y;node.addChild(rowNode);y+=78;
    rowNode.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,width,72,8).fill(style.row).stroke({color:style.border,width:1}));
    const label=new Text({text:title,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fontWeight:"600",fill:style.text}});
    label.position.set(14,description?17:27);rowNode.addChild(label);
    const detail=new Text({text:description,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,fill:colors.colorNeutralForeground2,wordWrap:true,wordWrapWidth:Math.max(60,width-260)}});
    detail.position.set(14,38);rowNode.addChild(detail);
    return rowNode;
  };
  const number=(parent:Container,key:string,cell:{value:number},min:number,max:number,step:number,x:number,controlWidth=86,unit="")=>{
    const spin=new NativeSpinButton(host,controlWidth,min,max,step,cell.value,value=>{cell.value=value;},invalidate,theme,unit);
    spin.label=`native-setting:${key}`;spin.position.set(x,20);parent.addChild(spin);inputs.push(spin);
    controls.push({node:spin,focus:active=>{if(active)spin.input.focus();else if(spin.input.focused)spin.input.blur();},
      handleKey:key=>spin.handleKey(key),disabled:()=>spin.input.disabled});
    return spin;
  };
  const themeHeading=new Text({text:t("settings.interface.theme.title"),style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fontWeight:"600",fill:colors.colorNeutralForeground1}});
  node.addChild(themeHeading);y=30;
  const themeRow=row(t("settings.interface.theme.mode"),t("settings.interface.theme.description"));
  for(const [index,value] of ["system","light","dark"].entries()){
    const button=new NativeFluentButton(t(`settings.interface.theme.${value}`),84,()=>{
      fullSettings.actions.setDraftSettingsThemePreference(value);redraw();
    },invalidate,theme,"subtle");
    button.label=`native-setting:theme-${value}`;button.position.set(width-276+index*86,23);themeRow.addChild(button);
    if(fullSettings.draft.settingsThemePreference.value===value)button.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,84,34,4).fill(style.selected),1);
    controls.push({node:button,focus:active=>{button.focused=active;},disabled:()=>button.disabled,
      handleKey:key=>{if(key!==" "&&key!=="Enter")return false;button.activate();return true;}});
  }
  const layoutHeading=new Text({text:t("settings.interface.layout.title"),style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fontWeight:"600",fill:colors.colorNeutralForeground1}});
  y+=14;layoutHeading.y=y;node.addChild(layoutHeading);y+=30;
  for(const [name,rows,cols,maxRows,minCols,maxCols] of [
    ["desktop",settings.draftRows,settings.draftCols,8,3,10],
    ["folder",settings.draftFolderRows,settings.draftFolderCols,6,2,8],
  ] as const){
    const parent=row(t(`settings.interface.layout.${name}`),t(`settings.interface.layout.${name}Description`));
    number(parent,name+"Rows",rows,2,maxRows,1,width-214);
    const separator=new Text({text:"x",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,fill:style.muted}});separator.position.set(width-119,27);parent.addChild(separator);
    number(parent,name+"Cols",cols,minCols,maxCols,1,width-100);
  }
  const sizeRow=row(t("settings.interface.layout.iconSize"),t("settings.interface.layout.iconSizeDescription"));
  number(sizeRow,"iconSize",settings.draftIconSize,ICON_SIZE_MIN,ICON_SIZE_MAX,8,width-118,104,"px");
  const modeRow=row(t("settings.interface.layout.folderIconSize"),t("settings.interface.layout.folderIconSizeDescription"));
  const custom=settings.draftFolderIconSizeMode.value==="custom";
  for(const [index,mode] of ["global","custom"].entries()){
    const button=new NativeFluentButton(t(`settings.interface.layout.${mode}`),80,()=>{
      settings.setDraftFolderIconSizeMode(mode);redraw();
    },invalidate,theme,"subtle");
    button.label=`native-setting:folder-size-${mode}`;button.position.set(width-174-(custom?114:0)+index*80,19);
    if(settings.draftFolderIconSizeMode.value===mode)button.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,80,34,4).fill(style.selected),1);
    modeRow.addChild(button);
    controls.push({node:button,focus:active=>{button.focused=active;},handleKey:key=>{
      if(key!==" "&&key!=="Enter")return false;button.activate();return true;
    },disabled:()=>button.disabled});
  }
  if(custom)number(modeRow,"folderIconSize",settings.draftFolderIconSize,ICON_SIZE_MIN,ICON_SIZE_MAX,8,width-118,104,"px");
  const textlessRow=row(t("settings.interface.layout.textless"),t("settings.interface.layout.textlessDescription"));
  const toggle=new NativeFluentToggle("switch",value=>{settings.draftIsTextlessMode.value=value;},invalidate,theme);
  toggle.label="native-setting:textless";toggle.checked=settings.draftIsTextlessMode.value;
  toggle.position.set(width-60,23);textlessRow.addChild(toggle);
  const focusRing=new Graphics({eventMode:"none"});textlessRow.addChild(focusRing);
  controls.push({node:toggle,focus:active=>{
    focusRing.clear();if(active)focusRing.roundRect(width-64,25,48,28,5).stroke({color:colors.colorStrokeFocus2,width:2});invalidate();
  },handleKey:key=>{if(key!==" "&&key!=="Enter")return false;toggle.toggle();return true;},disabled:()=>toggle.disabled});
  return {node,height:y,controls,dispose:()=>{
    for(const input of inputs){input.input.removeAllListeners("blur");input.destroy();}
  }};
}
