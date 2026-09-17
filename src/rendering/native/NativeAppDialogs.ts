import { createNativeText } from "./nativeTypography.js";
import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { TextInputHost, TextInput } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadApps, ManagedAppIcon } from "../../application/launchpadApps.js";
import type { NativeManagement } from "./NativeManagement.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import type { NativeSettingsControl } from "./NativeSettingsShell.js";
import type { NativeModalBody } from "./NativeModalPanel.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";
import { NativeVirtualList } from "./ui/NativeVirtualList.js";
import { createNativeSettingsInput } from "./nativeSettingsInput.js";
import { getNativeIconTextureSource } from "./nativeIconTextureSource.js";
import { loadNativeIconTexture } from "./nativeIconTextureLoader.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { t } from "../../native/nativeLocalization.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import { cubicBezier } from "../pixi/animation/motionRuntime.js";

type Options={apps:ReturnType<typeof createLaunchpadApps>;management:NativeManagement;host:TextInputHost;theme():NativeTheme;invalidate():void;save():Promise<void>;pickIcon():Promise<ManagedAppIcon|null>};
export class NativeAppDialogs{
  constructor(readonly options:Options){}
  sync():void{
    const {apps,management}=this.options;
    if(apps.editorModel.isOpen.value&&!management.hasDialog("editor"))this.editor();
    if(apps.iconChooserModel.chooser.value&&!management.hasDialog("icon-chooser"))this.iconChooser();
    if(!apps.iconChooserModel.chooser.value&&management.activeId==="icon-chooser")management.close(true);
    if(apps.scanResultModel.isOpen.value&&!management.hasDialog("scan-results"))this.scan();
    if(!apps.scanResultModel.isOpen.value&&management.activeId==="scan-results")management.close(true);
    management.refresh();
  }
  #text(value:string,size=13,muted=false,width=1000):Text{
    return createNativeText({text:value,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fill:muted?nativeSettingsStyle(this.options.theme()).muted:nativeSettingsStyle(this.options.theme()).text,wordWrap:true,wordWrapWidth:Math.max(1,width),breakWords:true}});
  }
  #button(node:Container,controls:NativeSettingsControl[],id:string,label:string,x:number,y:number,width:number,action:()=>void,appearance:"outline"|"subtle"|"primary"|"list-row"|"secondary"="outline",height=32):NativeFluentButton{
    const button=new NativeFluentButton(label,width,action,this.options.invalidate,this.options.theme(),appearance,false,height);button.label=`native-dialog:${id}`;button.position.set(x,y);node.addChild(button);
    controls.push({node:button,disabled:()=>button.disabled,focus:active=>{button.focused=active;},handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;button.activate();return true;}});return button;
  }
  #image(parent:Container,source:string|null,glyph:string,x:number,y:number,size:number):void{
    const fallback=this.#text(glyph,Math.min(36,size*0.65));fallback.anchor.set(0.5);fallback.position.set(x+size/2,y+size/2);parent.addChild(fallback);
    if(!source)return;
    void loadNativeIconTexture(source).then(texture=>{
      if(parent.destroyed){texture.destroy(true);return;}
      const sprite=new Sprite({texture,eventMode:"none"});const ratio=Math.min(size/texture.width,size/texture.height);sprite.scale.set(ratio);sprite.position.set(x+(size-sprite.width)/2,y+(size-sprite.height)/2);parent.addChild(sprite);fallback.visible=false;
      sprite.on("destroyed",()=>texture.destroy(true));this.options.invalidate();
    },()=>{});
  }
  #emptyPlate(width:number,height:number):Container{
    const style=nativeSettingsStyle(this.options.theme()),node=new Container({eventMode:"none"}),plate=new Graphics({eventMode:"none"});
    node.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,width,height,8).fill(style.row),plate);
    for(let x=8;x<width-8;x+=7){plate.moveTo(x,0).lineTo(Math.min(x+4,width-8),0);plate.moveTo(x,height).lineTo(Math.min(x+4,width-8),height);}
    for(let y=8;y<height-8;y+=7){plate.moveTo(0,y).lineTo(0,Math.min(y+4,height-8));plate.moveTo(width,y).lineTo(width,Math.min(y+4,height-8));}
    for(const [cx,cy,start] of [[width-8,8,-Math.PI/2],[width-8,height-8,0],[8,height-8,Math.PI/2],[8,8,Math.PI]] as const){
      for(let offset=0;offset<Math.PI/2;offset+=7/8){const a=start+offset;plate.moveTo(cx+8*Math.cos(a),cy+8*Math.sin(a)).arc(cx,cy,8,a,Math.min(a+4/8,start+Math.PI/2));}
    }
    plate.stroke({color:this.options.theme()==="dark"?"rgba(255,255,255,0.12)":style.border,width:1});return node;
  }
  editor():void{
    const {apps,management,host,theme,invalidate}=this.options,model=apps.editorModel;
    const creating=model.mode.value==="create";
    management.dialog({id:"editor",title:t(creating?"dialogs.appEditor.addTitle":"dialogs.appEditor.editTitle"),subtitle:creating?t("dialogs.appEditor.addDescription"):"",width:540,footerGap:18,
      closeLabel:t(creating?"dialogs.appEditor.closeAdd":"dialogs.appEditor.closeEdit"),cancelText:t("common.actions.cancel"),confirmText:t("common.actions.save"),canConfirm:()=>model.canSave.value,
      onClose:()=>model.actions.cancel(),confirm:async()=>{if(!model.actions.save({keepOpen:true}))throw new Error(t("dialogs.appEditor.target"));await this.options.save();},
      build:width=>{
        const node=new Container(),controls:NativeSettingsControl[]=[],style=nativeSettingsStyle(theme());
        let iconKey="";const image=new Container();node.addChild(image);
        node.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,54,54,8).fill(style.row),0);
        const refreshIcon=()=>{
          const app=model.app.value,source=model.iconDataUrl.value||model.iconPath.value||(model.isIconReset.value?getNativeIconTextureSource(app?{iconDataUrl:app.iconDataUrl??null,iconPath:app.iconPath??null}:null):getNativeIconTextureSource(app));
          const key=source??model.glyph.value;if(key===iconKey)return;iconKey=key;for(const child of image.removeChildren())child.destroy({children:true});const content=new Container();image.addChild(content);this.#image(content,source,model.glyph.value,6,6,42);
        };
        refreshIcon();
        const changeIcon=this.#button(node,controls,"editor-icon",t("dialogs.appEditor.changeIcon"),68,11,136,()=>model.actions.openIconChooser());
        changeIcon.resizeWidth(Math.ceil(changeIcon.caption.width)+24);
        const resetIcon=this.#button(node,controls,"editor-reset-icon",t("common.actions.restoreDefault"),76+changeIcon.controlWidth,11,136,model.actions.resetIcon);
        resetIcon.resizeWidth(Math.ceil(resetIcon.caption.width)+24);
        const wrapped=resetIcon.x+resetIcon.controlWidth>width;if(wrapped){changeIcon.y=0;resetIcon.position.set(68,40);}
        let y=(wrapped?72:54)+14;const fields:{input:TextInput;read:()=>string}[]=[];
        const field=(id:string,label:string,cell:{value:string},readonly=false,short=false,maxLength?:number)=>{
          const title=this.#text(label,12,true);title.y=y;node.addChild(title);y+=21;
          const input=createNativeSettingsInput(host,{width:width-(short?96:0),height:34,value:cell.value,theme:theme(),disabled:readonly,readOnly:readonly,invalidate,...(maxLength?{maxLength}:{})});
          input.label=`native-editor:${id}`;input.y=y;node.addChild(input);input.on("input",()=>{cell.value=input.value;});
          controls.push({node:input,disabled:()=>input.disabled,focus:active=>{if(active)input.focus();else input.blur();},handleKey:()=>false,restoreFocus:true,selection:()=>input.selection,restoreSelection:selection=>input.setSelectionRange(selection.anchor,selection.focus)});
          fields.push({input,read:()=>cell.value});y+=48;return input;
        };
        field("name",t("dialogs.appEditor.name"),model.name,false,false,64);
        const target=field("target",t(model.targetReadOnly.value?"dialogs.appEditor.windowsIdManaged":"dialogs.appEditor.target"),model.target,model.targetReadOnly.value,true);
        const browse=this.#button(node,controls,"editor-browse",t("common.actions.browse"),width-88,target.y,88,()=>{void model.actions.browseTarget();});
        const argsShown=model.canEditArgs.value;if(argsShown)field("args",t("dialogs.appEditor.args"),model.args);
        return {node,height:y-14,controls,update:()=>{
          if(argsShown!==model.canEditArgs.value)return true;
          for(const entry of fields)if(entry.input.value!==entry.read()&&!entry.input.composing)entry.input.value=entry.read();
          browse.disabled=!model.canBrowseTarget.value;browse.caption.text=t(model.isBrowsingTarget.value?"dialogs.appEditor.choosing":"common.actions.browse");refreshIcon();return false;
        }};
      }});
    management.refresh();
  }
  iconChooser():void{
    const {apps,management}=this.options,model=apps.iconChooserModel,chooser=model.chooser.value;if(!chooser)return;
    management.dialog({id:"icon-chooser",title:chooser.title,subtitle:chooser.subtitle,width:560,maxHeight:720,closeLabel:t("dialogs.iconChooser.close"),onClose:()=>model.actions.close(),build:width=>{
      const node=new Container(),controls:NativeSettingsControl[]=[],signature=JSON.stringify([model.isLoading.value,model.error.value,model.choices.value]);let y=0;
      const title=this.#text(t("dialogs.iconChooser.embedded"),13);title.style.fontWeight="600";node.addChild(title);y+=27;
      const choices=model.choices.value;
      if(choices.length){const count=this.#text(t("dialogs.iconChooser.count",{count:choices.length}),12,true);count.anchor.x=1;count.x=width;node.addChild(count);}
      let virtual:NativeVirtualList|null=null;
      if(!choices.length){
        const loading=model.isLoading.value;
        const hint=this.#text(t(loading?"dialogs.iconChooser.loading":"dialogs.iconChooser.empty"),12,true,width-28);
        if(model.error.value)hint.text=model.error.value;
        const height=Math.max(76,hint.height+28);
        if(!loading){const plate=this.#emptyPlate(width,height);plate.label="native-icon-empty";plate.y=y;node.addChild(plate);}
        hint.label=loading?"native-icon-loading":"native-icon-status";
        hint.position.set(14,y+(height-hint.height)/2);node.addChild(hint);y+=height+16;
      }
      else{
        const columns=Math.max(1,Math.floor((width+10)/74)),tileWidth=(width-(columns-1)*10)/columns,stride=tileWidth+10,rows=Math.ceil(choices.length/columns),top=y;
        virtual=new NativeVirtualList(rows,stride,columns,index=>{
          const row=new Container(),rowControls:NativeSettingsControl[]=[];
          for(let column=0;column<columns;column++){
            const choice=choices[index*columns+column];
            const button=this.#button(row,rowControls,`icon-choice-${index*columns+column}`,t("dialogs.iconChooser.chooseEmbedded"),column*stride,0,tileWidth,()=>{if(choice)model.actions.choose(choice);},"list-row",tileWidth);button.caption.visible=false;button.disabled=!choice;
            const lift=(y:number)=>{killMotionOf(button);motion(button).duration(0.16).ease(cubicBezier(0.25,0.1,0.25,1)).to({y}).start();};
            button.on("pointerover",()=>lift(-1));button.on("pointerout",()=>lift(0));button.on("destroyed",()=>killMotionOf(button));
            if(choice)this.#image(button,choice.iconDataUrl,"",(tileWidth-42)/2,(tileWidth-42)/2,42);else button.visible=false;
          }
          return {node:row,controls:rowControls};
        },index=>String(index),(index,part)=>index*columns+part>=choices.length);virtual.y=top;node.addChild(virtual);controls.push(...virtual.controls);y+=rows*stride+6;
      }
      const local=this.#text(t("dialogs.iconChooser.local"),13);local.style.fontWeight="600";local.y=y;node.addChild(local);y+=27;
      const upload=this.#button(node,controls,"icon-upload",t("common.actions.selectImage"),0,y,160,()=>{
        upload.disabled=true;
        void this.options.pickIcon().then(icon=>{if(icon&&model.chooser.value===chooser)model.actions.choose({id:"local",...icon});},error=>{if(model.chooser.value===chooser)management.warning({title:t("settings.apps.icon.errorTitle"),message:String(error),intent:"error",confirmText:t("notices.acknowledge")});}).finally(()=>{if(!upload.destroyed)upload.disabled=false;});
      },"secondary",36);upload.resizeWidth(Math.max(96,Math.ceil(upload.caption.width)+28));y+=36;
      return {node,height:y,controls,update:()=>signature!==JSON.stringify([model.isLoading.value,model.error.value,model.choices.value]),viewport:(top,height)=>virtual?.viewport(top-virtual.y,height)};
    }});
  }
  scan():void{
    const {apps,management}=this.options,model=apps.scanResultModel;
    management.dialog({id:"scan-results",title:t("dialogs.scanResults.title"),width:720,maxHeight:720,closeLabel:t("dialogs.scanResults.close"),cancelText:t("common.actions.cancel"),confirmText:t("dialogs.scanResults.addSelected"),canConfirm:()=>model.canAdd.value,onClose:()=>model.actions.close(),confirm:async()=>{model.actions.addSelected({keepOpen:true});await this.options.save();},build:width=>this.#scanBody(width)});
  }
  #scanBody(width:number):NativeModalBody{
    const {apps,theme,invalidate}=this.options,model=apps.scanResultModel,style=nativeSettingsStyle(theme()),node=new Container(),controls:NativeSettingsControl[]=[];
    let y=0;const summary=this.#text(t("dialogs.scanResults.summary",{selected:model.selectedCount.value}),12,true,width);node.addChild(summary);y+=summary.height+12;
    if(model.warnings.value.length){const partial=this.#text(t("dialogs.scanResults.partial"),12,true,width);partial.y=y;node.addChild(partial);y+=partial.height+8;}
    const total=Number(model.stats.value?.keywordExcludedApps)||model.keywordExcludedApps.value.length;
    for(const [index,tab] of (["available","ignored"] as const).entries()){
      const button=this.#button(node,controls,`scan-tab-${tab}`,t(`dialogs.scanResults.tabs.${tab}`,{count:tab==="available"?model.apps.value.length:total}),index*(width/2+2),y,width/2-4,()=>model.actions.selectTab(tab),"subtle");
      if(tab===model.activeTab.value)button.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,button.controlWidth,32,4).fill(style.selected),0);
    }y+=50;
    const ignored=model.activeTab.value==="ignored";
    if(ignored){const intro=this.#text(t("dialogs.scanResults.ignoredIntro"),12,true,width-180);intro.y=y;node.addChild(intro);this.#button(node,controls,"scan-keywords",t("dialogs.scanResults.manageKeywords"),width-170,y,170,model.actions.manageKeywords,"subtle");y+=Math.max(32,intro.height)+10;}
    const entries=ignored?model.keywordExcludedApps.value:model.apps.value.map(app=>({app,matchedKeyword:""}));
    if(entries.length){this.#button(node,controls,"scan-all",t("common.actions.selectAll"),0,y,88,model.actions.selectAll,"subtle");this.#button(node,controls,"scan-clear",t("common.actions.clearSelection"),96,y,110,model.actions.clearSelection,"subtle");y+=40;}
    const top=y;
    const list=new NativeVirtualList(entries.length,70,1,index=>{
      const {app,matchedKeyword}=entries[index]!,row=new Container(),rowControls:NativeSettingsControl[]=[];
      const selected=model.selectedIds.value.includes(app.id);
      const background=new NativeFluentButton("",width-10,()=>model.actions.toggleSelection(app.id,!selected),invalidate,theme(),"list-row",false,64);background.selected=selected;row.addChild(background);
      const toggle=new NativeFluentToggle("checkbox",value=>model.actions.toggleSelection(app.id,value),invalidate,theme(),16);toggle.checked=selected;toggle.label=`native-scan:select-${app.id}`;toggle.position.set(5,16);row.addChild(toggle);
      rowControls.push({node:toggle,disabled:()=>false,focus:active=>{background.focused=active;},handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;toggle.toggle();return true;}});
      this.#image(row,getNativeIconTextureSource(app),app.emoji??"",45,19,26);
      const name=new NativeSingleLineText(app.name,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fill:style.text},width-105);name.position.set(87,12);row.addChild(name);
      const target=new NativeSingleLineText(model.getLaunchTargetPath(app)||t("settings.apps.manager.targetMissing"),{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:11,fill:style.muted},width-105);target.position.set(87,31);row.addChild(target);
      if(matchedKeyword){const match=new NativeSingleLineText(matchedKeyword,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:10,fill:style.accent},width-105);match.position.set(87,47);row.addChild(match);}
      return {node:row,controls:rowControls};
    },index=>entries[index]!.app.id);list.y=top;node.addChild(list);controls.push(...list.controls);y+=entries.length*70;
    if(!entries.length){const empty=this.#text(t(ignored?"dialogs.scanResults.ignoredEmpty":"dialogs.scanResults.empty"),13,true,width);empty.y=y+20;node.addChild(empty);y+=empty.height+60;}
    if(ignored&&total>entries.length){const hint=this.#text(t("dialogs.scanResults.ignoredTruncated",{shown:entries.length,total}),12,true,width);hint.y=y;node.addChild(hint);y+=hint.height+12;}
    return {node,height:y,controls,viewport:(offset,height)=>list.viewport(offset-list.y,height)};
  }
}
