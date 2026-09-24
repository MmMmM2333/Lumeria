import {Container,Graphics,Sprite,type Texture} from "pixi.js";
import type {createLaunchpadApps} from "../../application/launchpadApps.js";
import type {createLaunchpadSettings} from "../../application/launchpadSettings.js";
import type {NativeManagement} from "./NativeManagement.js";
import type {NativeModalBody} from "./NativeModalPanel.js";
import type {NativeSettingsControl} from "./NativeSettingsShell.js";
import {NativeFluentButton,nativeSettingsStyle,type NativeTheme} from "./NativeFluentButton.js";
import {NativeFluentToggle} from "./NativeFluentToggle.js";
import {NativeSegmentedControl} from "./NativeSegmentedControl.js";
import {motion,killMotionOf} from "../pixi/animation/motionTween.js";
import {createNativeText,NATIVE_UI_FONT_FAMILY} from "./nativeTypography.js";
import {DEFAULT_MAIN_WINDOW_SHORTCUT,formatMainWindowShortcut,normalizeMainWindowShortcut} from "../../domain/mainWindowShortcut.js";
import {t} from "../../native/nativeLocalization.js";
import type {NativeNavigationKey} from "../../native/nativeStartup.js";
import {nativeFluentIcon} from "./nativeFluentIcons.js";

export function createNativeOnboarding(o:{apps:ReturnType<typeof createLaunchpadApps>;settings:ReturnType<typeof createLaunchpadSettings>;management:NativeManagement;icon():Texture;theme():NativeTheme;invalidate():void;save():Promise<void>;scan():Promise<void>;complete():void}){
  let step=0,recording=false,prepared=false,applied=false,transitioning=false,direction=0,grouped=true;let currentBody:Container|null=null;
  const changeStep=async(next:number,refresh=true)=>{if(transitioning)return;transitioning=true;direction=next>step?1:-1;const body=currentBody;if(body&&!body.destroyed){body.interactiveChildren=false;await new Promise<void>(resolve=>{motion(body).duration(.1).to({alpha:0,x:body.x-direction*16,onComplete:resolve}).start();});}step=next;recording=false;transitioning=false;if(refresh)redraw();};
  const redraw=()=>o.management.refresh();
  const build=(availableWidth:number):NativeModalBody=>{
    const inset=step===0?0:16,width=availableWidth-2*inset;

    const node=new Container({label:`native-onboarding:step:${step}`}),controls:NativeSettingsControl[]=[],style=nativeSettingsStyle(o.theme());let y=0;
    const text=(value:string,x:number,top:number,size=13)=>{const label=createNativeText({text:value,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fill:style.text,wordWrap:true,breakWords:true,wordWrapWidth:width-36}});label.position.set(x,top);node.addChild(label);return label;};
    const button=(label:string,top:number,action:()=>void)=>{const b=new NativeFluentButton(label,Math.min(210,width-32),action,o.invalidate,o.theme(),"outline");b.position.set(width-b.controlWidth-16,top);node.addChild(b);controls.push({node:b,disabled:()=>b.disabled,focus:active=>{b.focused=active;},handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;b.activate();return true;}});return b;};
    const row=(label:string,icon:Parameters<typeof nativeFluentIcon>[0])=>{const top=y;node.addChild(new Graphics({eventMode:"none"}).roundRect(0,y,width,76,8).fill(style.row).stroke({color:style.border,width:1}));const mark=nativeFluentIcon(icon,style.text,22);mark.position.set(18,y+27);node.addChild(mark);text(label,56,y+17);y+=82;return top;};
    const toggle=(label:string,value:boolean,top:number,action:(value:boolean)=>void)=>{const control=new NativeFluentToggle("switch",value=>{action(value);redraw();},o.invalidate,o.theme());control.checked=value;control.position.set(width-58,top);node.addChild(control);controls.push({node:control,disabled:()=>control.disabled,focus:active=>{control.alpha=active?.75:1;o.invalidate();},handleKey:key=>{if(key!==" "&&key!=="Enter")return false;control.toggle();return true;}});control.label=label;};
    currentBody=node;node.x=inset;
    if(direction){node.alpha=0;node.x=inset+direction*16;direction=0;motion(node).duration(.14).ease("power2.out").to({alpha:1,x:inset}).start();}
    if(step===0){
      const icon=new Sprite({texture:o.icon(),eventMode:"none"});icon.anchor.set(.5);icon.width=icon.height=144;icon.position.set(width/2,204);node.addChild(icon);
      const heading=text(t("imports.welcomeTitle"),0,300,28);heading.style.fontWeight="600";heading.style.align="center";heading.style.wordWrapWidth=width-32;heading.x=(width-heading.width)/2;
      const subtitle=text(t("imports.welcomeSubtitle"),0,348,15);subtitle.style.fill=style.muted;subtitle.x=(width-subtitle.width)/2;y=410;
    }else if(step===1){
      const title=text(t("imports.preferencesTitle"),0,12,24);title.style.fontWeight="600";
      const detail=text(t("imports.preferencesHint"),0,48,13);detail.style.fill=style.muted;y=84;
      let top=row(t("imports.theme"),"color-background-24-regular");
      const themeHint=text(t("imports.themeHint"),56,top+42,12);themeHint.style.fill=style.muted;
      const themes=new NativeSegmentedControl(["light","dark","system"].map(value=>({value,label:t(`imports.theme_${value}`),id:`native-onboarding:theme:${value}`})),o.settings.draft.settingsThemePreference.value,value=>{o.settings.actions.setDraftSettingsThemePreference(value);redraw();},o.invalidate,o.theme());themes.position.set(width-themes.controlWidth-16,top+21);node.addChild(themes);controls.push(...themes.controls);
      top=row(t("settings.general.shortcut.title"),"keyboard-24-regular");const hint=text(t(recording?"settings.general.shortcut.recordingHint":"settings.general.shortcut.hint"),56,top+42,12);hint.style.fill=style.muted;hint.style.wordWrapWidth=Math.max(100,width-340);button(recording?t("imports.recording"):(o.settings.draft.mainWindowShortcut.value===null?t("settings.general.shortcut.notSet"):formatMainWindowShortcut(o.settings.draft.mainWindowShortcut.value)),top+22,()=>{recording=true;redraw();}).label="native-onboarding:shortcut";
      const shortcutButton=node.getChildByLabel("native-onboarding:shortcut") as NativeFluentButton;shortcutButton.resizeWidth(145);shortcutButton.x=width-265;
      if(o.settings.draft.mainWindowShortcut.value!==null){
        shortcutButton.caption.x-=10;
        const clear=new NativeFluentButton("",22,()=>{recording=false;o.settings.actions.setDraftMainWindowShortcut(null);redraw();},o.invalidate,o.theme(),"subtle",false,22);
        clear.label="native-onboarding:clear-shortcut";clear.position.set(118,5);shortcutButton.addChild(clear);
        const mark=nativeFluentIcon("dismiss-16-regular",style.muted,12);mark.position.set(5,5);clear.addChild(mark);
        controls.push({node:clear,focus:active=>{clear.focused=active;},disabled:()=>clear.disabled,handleKey:key=>{if(key!==" "&&key!=="Enter")return false;clear.activate();return true;}});
      }
      const reset=button(t("imports.resetDefault"),top+22,()=>{o.settings.actions.setDraftMainWindowShortcut(DEFAULT_MAIN_WINDOW_SHORTCUT);recording=false;redraw();});reset.resizeWidth(96);reset.x=width-112;reset.disabled=o.settings.draft.mainWindowShortcut.value===DEFAULT_MAIN_WINDOW_SHORTCUT;
      top=row(t("settings.interface.window.mode"),"window-24-regular");const modeHint=text(t("imports.windowHint"),56,top+42,12);modeHint.style.fill=style.muted;
      const modes=new NativeSegmentedControl(["fullscreen","windowed"].map(value=>({value,label:t(`settings.interface.window.${value}`),id:`native-onboarding:${value}`})),o.settings.draft.windowMode.value,value=>{o.settings.actions.setDraftWindowMode(value);redraw();},o.invalidate,o.theme());modes.position.set(width-modes.controlWidth-16,top+21);node.addChild(modes);controls.push(...modes.controls);
      top=row(t("settings.general.startup.title"),"power-24-regular");const startupHint=text(t("settings.general.startup.description"),56,top+42,12);startupHint.style.fill=style.muted;toggle("native-onboarding:login",o.settings.draft.launchAtLogin.value,top+22,value=>o.settings.actions.setDraftLaunchAtLogin(value));
    }else{
      const title=text(t("imports.sourcesTitle"),0,12,24);title.style.fontWeight="600";
      const detail=text(t("imports.sourcesHint"),0,48,13);detail.style.fill=style.muted;y=84;
      for(const source of o.apps.presentation.scanRoots.value){
        const top=y;
        node.addChild(new Graphics({eventMode:"none"}).roundRect(0,top,width,72,8).fill(style.row).stroke({color:style.border,width:1}));
        const icon=nativeFluentIcon(source.type==="windowsAppCatalog"?"apps-24-regular":"folder-open-20-regular",style.text,20);icon.position.set(18,top+26);node.addChild(icon);text(source.label,54,top+15);
        const description=source.type==="windowsAppCatalog"?"imports.windowsSource":source.type==="startMenuUser"?"imports.userSource":source.type==="startMenuSystem"?"imports.systemSource":"imports.customSource";
        const hint=text(t(description),54,top+40,12);hint.style.fill=style.muted;hint.style.wordWrapWidth=width-126;
        toggle(`native-onboarding:source:${source.id}`,source.enabled,top+20,value=>{prepared=false;o.apps.toggleScanRootEnabled(source.id,value);});y+=80;
      }
      y+=16;const heading=text(t("imports.arrangementTitle"),0,y,17);heading.style.fontWeight="600";y+=32;
      const options=new NativeSegmentedControl([{value:"flat",label:t("imports.arrangeFlat"),id:"native-onboarding:arrangement:flat"},{value:"group",label:t("imports.arrangeGrouped"),id:"native-onboarding:arrangement:group"}],grouped?"group":"flat",value=>{grouped=value==="group";prepared=false;redraw();},o.invalidate,o.theme(),width);
      options.position.set(0,y);node.addChild(options);controls.push(...options.controls);y+=46;
      const rule=text(t(grouped?"imports.treeGroupedHint":"imports.treeFlatHint"),0,y,12);rule.style.fill=style.muted;y+=rule.height+20;
      const top=y,half=(width-52)/2;
      node.addChild(new Graphics({eventMode:"none"}).roundRect(0,top,width,306,8).fill(style.row).stroke({color:style.border,width:1}));
      const sourceTitle=text(t("imports.treeSource"),20,top+16,12);sourceTitle.style.fontWeight="600";
      const resultTitle=text(t("imports.treeResult"),width/2+30,top+16,12);resultTitle.style.fontWeight="600";
      const appIcons=["window-24-regular","apps-24-regular","window-24-regular"] as const;
      const colors=["#4289c1","#8871b5","#48a08b"];
      const sourceRows=[
        {depth:0,name:t("imports.treeRoot"),app:-1},
        {depth:1,name:t("imports.treeApp",{letter:"A"}),app:0},
        {depth:1,name:t("imports.treeApp",{letter:"B"}),app:1},
        {depth:1,name:t("imports.treeGroup"),app:-1},
        {depth:2,name:t("imports.treeApp",{letter:"C"}),app:2},
        {depth:2,name:t("imports.treeApp",{letter:"D"}),app:0},
        {depth:1,name:t("imports.treeSingle"),app:-1},
        {depth:2,name:t("imports.treeApp",{letter:"E"}),app:1},
      ];
      const lines=new Graphics({eventMode:"none"});node.addChild(lines);
      // Draw each parent spine once, from below its icon to its final child.
      // Row-by-row segments overlap or leave gaps when a nested group intervenes.
      for(const [parentIndex,parent] of sourceRows.entries()){
        if(parent.app>=0)continue;
        const children:number[]=[];
        for(let i=parentIndex+1;i<sourceRows.length;i++){
          const child=sourceRows[i]!;if(child.depth<=parent.depth)break;
          if(child.depth===parent.depth+1)children.push(i);
        }
        if(!children.length)continue;
        const spineX=20+parent.depth*20+9;
        lines.moveTo(spineX,top+46+parentIndex*29+21).lineTo(spineX,top+46+children.at(-1)!*29+9);
        for(const i of children){const yy=top+46+i*29+9;lines.moveTo(spineX,yy).lineTo(20+sourceRows[i]!.depth*20-4,yy);}
      }
      for(const [i,entry] of sourceRows.entries()){
        const yy=top+46+i*29,xx=20+entry.depth*20;
        const icon=nativeFluentIcon(entry.app<0?"folder-open-20-regular":appIcons[entry.app]!,entry.app<0?"#c49538":colors[entry.app]!,18);icon.position.set(xx,yy);node.addChild(icon);
        const label=text(entry.name,xx+26,yy+1,12);label.style.wordWrapWidth=half-26-entry.depth*20;
      }
      lines.stroke({color:style.muted,alpha:.4,width:1});
      text("→",width/2-9,top+140,20);
      const resultX=width/2+30,resultWidth=width-resultX-20;
      const tiles=grouped?[{folder:false,name:t("imports.treeApp",{letter:"A"}),index:0},{folder:false,name:t("imports.treeApp",{letter:"B"}),index:1},{folder:false,name:t("imports.treeApp",{letter:"E"}),index:1},{folder:true,name:t("imports.treeGroup"),index:2}]:[0,1,2,3,4].map(index=>({folder:false,name:t("imports.treeApp",{letter:String.fromCharCode(65+index)}),index:index%3}));
      const tileWidth=resultWidth/3;
      for(const [i,tile] of tiles.entries()){
        const cx=resultX+tileWidth*(i%3+.5),yy=top+65+Math.floor(i/3)*105;
        const surface=new Graphics({eventMode:"none"}).roundRect(cx-23,yy,46,46,11).fill({color:tile.folder?style.muted:colors[tile.index]!,alpha:.16}).stroke({color:style.border,width:1});node.addChild(surface);
        if(tile.folder){for(let n=0;n<2;n++){const index=(n+2)%3,icon=nativeFluentIcon(appIcons[index]!,colors[index]!,16);icon.position.set(cx-18+n*20,yy+15);node.addChild(icon);}}
        else{const icon=nativeFluentIcon(appIcons[tile.index]!,colors[tile.index]!,26);icon.position.set(cx-13,yy+10);node.addChild(icon);}
        const label=text(tile.name,0,yy+56,12);label.style.wordWrapWidth=tileWidth-6;label.style.align="center";label.x=cx-label.width/2;
      }
      y+=322;
    }
    return {node,controls,height:y,dispose:()=>{killMotionOf(node);}};
  };
  return {
    open(){
      step=0;recording=false;prepared=false;applied=false;grouped=true;o.settings.beginEdit();o.settings.actions.setDraftSettingsThemePreference("light");
      o.management.dialog({id:"onboarding",title:"",width:800,fixedHeight:640,scrollGutter:16,maxHeight:640,showClose:false,dismissible:false,
        get busyText(){return step===2?t("imports.preparing"):"";},
        get footerStatus(){return `${step+1} / 3`;},
        get cancelText(){return step===0?"":t("imports.back");},get confirmText(){return t(step===0?"imports.begin":step===1?"imports.next":"imports.finish");},
        cancel:()=>{if(step>0&&!transitioning&&!applied&&!o.apps.imports.staged)void changeStep(step-1);},
        canConfirm:()=>!recording&&!transitioning,onClose:()=>{recording=false;if(!applied)o.settings.cancelEdit();o.apps.imports.finish();},
        confirm:async()=>{
          if(step<2){await changeStep(step+1,false);return false;}
          if(!prepared){for(const source of o.apps.presentation.scanRoots.value)if(source.type!=="windowsAppCatalog")o.apps.imports.policy(source.id,grouped,false);await o.scan();o.apps.imports.open("initial",o.apps.imports.catalog.map(a=>a.id));prepared=true;}
          if(!applied){if(!(await o.settings.applyEdit()).ok)throw new Error([o.settings.presentation.mainWindowShortcutError.value,o.settings.presentation.launchAtLoginError.value].filter(Boolean).join("\n")||t("imports.changed"));applied=true;}
          if(o.apps.imports.rows.length)o.apps.imports.apply();else o.apps.imports.completeEmpty();await o.save();o.complete();return true;
        },build});
    },
    handleKey(event:NativeNavigationKey){
      if(transitioning)return true;if(!recording)return false;if(event.type!=="down")return true;
      if(event.key==="Escape"){recording=false;redraw();return true;}
      if(!event.key||["Control","Shift","Alt","Meta"].includes(event.key))return true;
      try{const key=event.key===" "?"Space":event.key;const value=normalizeMainWindowShortcut([event.ctrlKey?"ctrl":"",event.altKey?"alt":"",event.shiftKey?"shift":"",event.metaKey?"meta":"",key].filter(Boolean).join("+"));o.settings.actions.setDraftMainWindowShortcut(value);recording=false;redraw();}catch{/* Continue recording until a supported combination is pressed. */}return true;
    },
  };
}
