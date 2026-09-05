import { Container, Graphics, Text } from "pixi.js";
import type { TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLayoutSettings } from "../../application/layoutSettings.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import { nativeFluentTheme, NativeFluentButton, type NativeTheme } from "./NativeFluentButton.js";
import { NativeSpinButton } from "./NativeSpinButton.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import { PIXI_UI_FONT_FAMILY } from "../typography.js";
import { t } from "../../native/nativeLocalization.js";
import { ICON_SIZE_MIN, ICON_SIZE_MAX } from "../../domain/launchpadGridDefaults.js";

export function nativeLayoutSettingsPage(settings:ReturnType<typeof createLayoutSettings>,host:TextInputHost,
  width:number,invalidate:()=>void,theme:NativeTheme):NativeSettingsContent{
  const node=new Container(),controls:NativeSettingsControl[]=[],inputs:NativeSpinButton[]=[];
  const colors=nativeFluentTheme(theme);
  let y=0;
  const row=(title:string,description:string)=>{
    const rowNode=new Container();rowNode.y=y;node.addChild(rowNode);y+=88;
    rowNode.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,width,80,4).fill(colors.colorNeutralBackground1).stroke({color:colors.colorNeutralStroke2,width:1}));
    const label=new Text({text:title,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:14,fill:colors.colorNeutralForeground1}});
    label.position.set(16,14);rowNode.addChild(label);
    const detail=new Text({text:description,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,fill:colors.colorNeutralForeground2,wordWrap:true,wordWrapWidth:Math.max(60,width-260)}});
    detail.position.set(16,38);rowNode.addChild(detail);
    return rowNode;
  };
  const number=(key:string,cell:{value:number},min:number,max:number,step:number)=>{
    const parent=row(t(`settings.interface.layout.${key}`),"");
    const spin=new NativeSpinButton(host,196,min,max,step,cell.value,value=>{cell.value=value;},invalidate,theme);
    spin.label=`native-setting:${key}`;spin.position.set(width-212,23);parent.addChild(spin);inputs.push(spin);
    controls.push({node:spin,focus:active=>{if(active)spin.input.focus();else if(spin.input.focused)spin.input.blur();},
      handleKey:key=>spin.handleKey(key),disabled:()=>spin.input.disabled});
    return spin;
  };
  number("desktopRows",settings.draftRows,2,8,1);
  number("desktopCols",settings.draftCols,3,10,1);
  number("folderRows",settings.draftFolderRows,2,6,1);
  number("folderCols",settings.draftFolderCols,2,8,1);
  number("iconSize",settings.draftIconSize,ICON_SIZE_MIN,ICON_SIZE_MAX,8);
  const modeRow=row(t("settings.interface.layout.folderIconSizeMode"),"");
  let customSize:NativeSpinButton;
  const modeButtons:NativeFluentButton[]=[];
  for(const [index,mode] of ["global","custom"].entries()){
    const button=new NativeFluentButton(t(`settings.interface.layout.${mode}`),104,()=>{
      settings.setDraftFolderIconSizeMode(mode);
      customSize.value=settings.draftFolderIconSize.value;customSize.disabled=mode!=="custom";
      modeButtons.forEach((button,i)=>{button.alpha=i===index?1:0.65;});
    },invalidate,theme);
    button.label=`native-setting:folder-size-${mode}`;button.position.set(width-228+index*110,23);
    button.alpha=settings.draftFolderIconSizeMode.value===mode?1:0.65;modeRow.addChild(button);modeButtons.push(button);
    controls.push({node:button,focus:active=>{button.focused=active;},handleKey:key=>{
      if(key!==" "&&key!=="Enter")return false;button.activate();return true;
    },disabled:()=>button.disabled});
  }
  customSize=number("folderIconSize",settings.draftFolderIconSize,ICON_SIZE_MIN,ICON_SIZE_MAX,8);
  customSize.disabled=settings.draftFolderIconSizeMode.value!=="custom";
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
