import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadApps } from "../../application/launchpadApps.js";
import type { ReadonlyLaunchpadApp } from "../../domain/launchpadLayout.js";
import type { IconTextureRepository } from "../pixi/assets/iconTextureRepository.js";
import { t } from "../../native/nativeLocalization.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import { NativeSegmentedControl } from "./NativeSegmentedControl.js";
import { NativeSettingsLayout, nativeSettingsChevron } from "./nativeSettingsLayout.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import type { NativeManagement } from "./NativeManagement.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { createNativeSettingsInput } from "./nativeSettingsInput.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";

export type NativeAppsPageState={keywords:boolean;excludedQuery:string;excludedKeys:Set<string>};
type Options={apps:ReturnType<typeof createLaunchpadApps>;host:TextInputHost;width:number;theme:NativeTheme;state:NativeAppsPageState;
  subPage:string|null;management:NativeManagement;icons:IconTextureRepository;invalidate():void;redraw():void;
  navigate(page:"manager"|"excluded"|"scan"):void;edit(app:ReadonlyLaunchpadApp|null):void;icon(app:ReadonlyLaunchpadApp,reset:boolean):void;};

/** Uses the same scan, exclusion and selection commands as the original settings page. */
export function nativeAppsSettingsPage(options:Options):NativeSettingsContent{
  const {apps,host,width,theme,state,invalidate,redraw}=options,style=nativeSettingsStyle(theme);
  const node=new Container(),controls:NativeSettingsControl[]=[],cleanup:(()=>void)[]=[];
  const layout=new NativeSettingsLayout(node,width,theme);let y=0;
  const key=(value:string,params:Record<string,string|number>={})=>t(`settings.apps.${value}`,params);
  const text=(value:string,x:number,top:number,size=13,muted=false)=>{
    const label=new Text({text:value,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fill:muted?style.muted:style.text}});
    label.position.set(x,top);node.addChild(label);return label;
  };
  const button=(id:string,label:string,x:number,top:number,w:number,action:()=>void,disabled=false,appearance:"outline"|"primary"="outline",danger=false)=>{
    const b=new NativeFluentButton(label,w,action,invalidate,theme,appearance,danger);b.label=`native-apps:${id}`;b.position.set(x,top);b.disabled=disabled;node.addChild(b);
    b.caption.style.fontSize=12;
    if(b.caption.width>w-16)b.caption.scale.x=(w-16)/b.caption.width;
    controls.push({node:b,disabled:()=>b.disabled,focus:active=>{b.focused=active;},handleKey:k=>{if(k!=="Enter"&&k!==" ")return false;b.activate();return true;}});return b;
  };
  const input=(id:string,value:string,x:number,top:number,w:number,change:(value:string)=>void,readOnly=false,live=false)=>{
    const label=id.startsWith("source-label-"),path=id.startsWith("source-path-");
    const field=createNativeSettingsInput(host,{width:w,height:label?26:path?30:34,value,theme,readOnly,disabled:readOnly&&path,
      variant:label?"label":"normal",placeholder:id==="search"?key("manager.search"):id==="excluded-search"?key("excluded.search"):"",invalidate});
    field.label=`native-apps:${id}`;field.position.set(x,top);node.addChild(field);
    let committed=value;
    const commit=()=>{if(!readOnly&&!field.composing&&field.value!==committed){committed=field.value;change(committed);}};field.on(live?"input":"blur",commit);
    controls.push({node:field,disabled:()=>field.disabled,restoreFocus:true,selection:()=>field.selection,restoreSelection:selection=>field.setSelectionRange(selection.anchor,selection.focus),focus:active=>{if(active)field.focus();else if(field.focused)field.blur();},handleKey:k=>{if(k!=="Enter")return false;commit();return true;}});
    cleanup.push(()=>{field.removeAllListeners("blur");field.removeAllListeners("input");field.destroy();});return field;
  };
  const toggle=(id:string,checked:boolean,x:number,top:number,action:(value:boolean)=>void,kind:"checkbox"|"switch"="switch")=>{
    const b=new NativeFluentToggle(kind,action,invalidate,theme);b.label=`native-apps:${id}`;b.checked=checked;b.position.set(x,top);node.addChild(b);
    const ring=new Graphics({eventMode:"none"});b.addChild(ring);
    controls.push({node:b,disabled:()=>b.disabled,focus:active=>{ring.clear();if(active)ring.roundRect(0,1,kind==="switch"?40:32,30,4).stroke({color:style.accent,width:2});invalidate();},handleKey:k=>{if(k!==" "&&k!=="Enter")return false;b.toggle();return true;}});return b;
  };
  const heading=(label:string)=>{text(label,0,y,18).style.fontWeight="600";y+=34;};
  const row=(height=72)=>{const top=y;node.addChild(new Graphics({eventMode:"none"}).roundRect(0,top,width,height,8).fill(style.row).stroke({color:style.border,width:1}));y+=height+6;return top;};
  const navigationRow=(id:string,title:string,description:string,icon:Parameters<typeof nativeFluentIcon>[0],action:()=>void,expand=false)=>{
    const control=new NativeFluentButton("",width,action,invalidate,theme,"settings-row",false,72);control.label=`native-apps:${id}`;control.y=y;node.addChild(control);
    const mark=nativeFluentIcon(icon,style.accent,22);mark.position.set(25,25);control.addChild(mark);
    const label=new NativeSingleLineText(title,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fontWeight:"600",fill:style.text},width-118);label.position.set(70,17);control.addChild(label);
    const detail=new NativeSingleLineText(description,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,lineHeight:16.2,fill:style.muted},width-118);detail.position.set(70,38);control.addChild(detail);
    const chevron=nativeSettingsChevron(control,width-26,36,style.muted);if(!expand)chevron.rotation=-Math.PI/2;
    controls.push({node:control,disabled:()=>control.disabled,focus:active=>{control.focused=active;},handleKey:key=>{if(key!==" "&&key!=="Enter")return false;control.activate();return true;}});
    y+=72;return {control,chevron};
  };
  const scan=()=>{void apps.rescanManagedApps().then(()=>{if(apps.scanResultModel.isOpen.value)options.navigate("scan");redraw();});};
  const appRow=(app:ReadonlyLaunchpadApp,selected:boolean,select:(checked:boolean)=>void,more:()=>void)=>{
    const top=row();
    const background=new NativeFluentButton("",width,()=>select(!selected),invalidate,theme,"subtle",false,72);background.label=`native-apps:row-${app.id}`;background.y=top;
    node.addChild(background);
    if(selected)background.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,width,72,8).fill(style.selected).stroke({color:style.accent,alpha:0.4,width:1}),0);
    toggle(`select-${app.id}`,selected,8,top+20,select,"checkbox");
    const texture=options.icons.resolve(app);if(texture){const icon=new Sprite({texture,eventMode:"none"});icon.position.set(50,top+18);icon.width=icon.height=36;node.addChild(icon);}
    else text(app.emoji||"▣",52,top+20,26);
    const name=text(app.name,100,top+14);name.style.fontWeight="600";
    const target=text(apps.getLaunchTargetPath(app)||key("manager.targetMissing"),100,top+39,11,true);
    target.style.wordWrap=true;target.style.wordWrapWidth=Math.max(80,width-164);target.style.breakWords=true;
    const clip=new Graphics({eventMode:"none"}).rect(100,top+8,Math.max(80,width-160),55).fill(0xffffff);node.addChild(clip);target.mask=clip;name.mask=clip;
    const moreButton=button(`more-${app.id}`,key("manager.more",{name:app.name}),width-50,top+19,36,more);moreButton.caption.visible=false;
    const dots=new Graphics({eventMode:"none"});for(const x of [12,18,24])dots.circle(x,17,1.25).fill(style.text);moreButton.addChild(dots);
  };
  const selectionBar=(count:number,actions:()=>void)=>{
    const start=node.children.length,top=y,first=controls.length;
    text(key("manager.selected",{count}),14,y+9);actions();y+=46;
    layout.disclosure(`apps.selection.${options.subPage}`,count>0,start,top,46,controls.slice(first),undefined,false);
  };
  if(options.subPage==="apps.appManager"){
    input("search",apps.appManagerSearchQuery.value,0,y,Math.max(100,width-254),value=>{apps.appManagerSearchQuery.value=value;},false,true);
    button("scan",key(apps.isScanningApps.value?"manager.scanning":"manager.scanApps"),width-242,y,116,scan,!apps.canScanManagedApps.value||apps.isScanningApps.value);
    button("add",key("manager.addApp"),width-116,y,116,()=>options.edit(null));y+=48;
    selectionBar(apps.selectedManagedAppCount.value,()=>{
      button("remove-selected",key("manager.remove"),width-360,y,150,()=>apps.removeSelectedManagedAppsFromLaunchpad());
      button("exclude-selected",key("manager.exclude"),width-200,y,200,()=>apps.excludeSelectedManagedAppsFromScan(),!apps.canExcludeSelectedManagedAppsFromScan.value);
    });
    text(key("manager.count",{filtered:apps.filteredManagedApps.value.length,total:apps.managedApps.value.length}),0,y+9,12,true);
    button("all",t("common.actions.selectAll"),width-188,y,88,apps.selectAllManagedApps);button("clear",t("common.actions.clearSelection"),width-96,y,96,apps.clearManagedAppSelection);y+=46;
    for(const app of apps.filteredManagedApps.value)appRow(app,apps.appManagerSelectedIds.value.includes(app.id),checked=>apps.toggleManagedAppSelection(app.id,checked),()=>{
      const control=node.getChildByLabel(`native-apps:more-${app.id}`,true)!;const p=control.toGlobal({x:0,y:34});
      options.management.menu(p.x,p.y,[{label:t("dialogs.appEditor.editTitle"),run:()=>options.edit(app)},
        {label:key("icon.change"),run:()=>options.icon(app,false)},{label:t("common.actions.restoreDefault"),run:()=>options.icon(app,true)},
        {label:key("manager.remove"),run:()=>apps.removeManagedAppFromLaunchpad(app.id)},
        ...(apps.canExcludeManagedAppFromScan(app)?[{label:key("manager.exclude"),run:()=>apps.excludeManagedAppFromScan(app)}]:[])]);
    });
    if(!apps.filteredManagedApps.value.length){text(key("manager.noMatch"),14,y+24,13,true);y+=80;}
  }else if(options.subPage==="apps.excludedApps"){
    input("excluded-search",state.excludedQuery,0,y,width,value=>{state.excludedQuery=value;redraw();},false,true);y+=48;
    const detail=text(key("excluded.description"),0,y,12,true);detail.style.wordWrap=true;detail.style.wordWrapWidth=width;y+=detail.height+16;
    const entries=apps.presentation.excludedScanApps.value.map((app,index)=>({app,index,key:app.catalogId}));
    const valid=new Set(entries.map(item=>item.key));for(const id of state.excludedKeys)if(!valid.has(id))state.excludedKeys.delete(id);
    const filtered=entries.filter(item=>`${item.app.name??""} ${item.key}`.toLowerCase().includes(state.excludedQuery.toLowerCase().trim()));
    selectionBar(state.excludedKeys.size,()=>{button("restore-selected",key("excluded.removeSelected"),width-160,y,160,()=>{apps.cancelScanAppExclusions(entries.filter(item=>state.excludedKeys.has(item.key)).map(item=>item.index));state.excludedKeys.clear();redraw();});});
    text(key("excluded.results",{count:filtered.length}),0,y+9,12,true);
    button("all",t("common.actions.selectAll"),width-188,y,88,()=>{state.excludedKeys=new Set(filtered.map(item=>item.key));redraw();});button("clear",t("common.actions.clearSelection"),width-96,y,96,()=>{state.excludedKeys.clear();redraw();});y+=46;
    for(const entry of filtered){
      const top=row(),name=entry.app.name||entry.key,selected=state.excludedKeys.has(entry.key);
      const select=(checked:boolean)=>{if(checked)state.excludedKeys.add(entry.key);else state.excludedKeys.delete(entry.key);redraw();};
      const background=new NativeFluentButton("",width,()=>select(!selected),invalidate,theme,"subtle",false,72);background.y=top;node.addChild(background);
      if(selected)background.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,width,72,8).fill(style.selected).stroke({color:style.accent,alpha:0.4,width:1}),0);
      toggle(`excluded-${entry.key}`,selected,8,top+20,select,"checkbox");text(name,52,top+17);text(entry.key.slice(0,70),52,top+40,11,true);
      button(`restore-${entry.key}`,key("excluded.restoreTitle"),width-142,top+19,128,()=>{apps.cancelScanAppExclusion(entry.index);redraw();});
    }
    if(!filtered.length){text(key(entries.length?"excluded.noMatch":"excluded.empty"),14,y+24,13,true);y+=80;}
  }else if(options.subPage==="apps.scanResults"){
    const result=apps.scanResultModel;
    const tabs=new NativeSegmentedControl([{value:"available",label:t("dialogs.scanResults.tabs.available",{count:result.apps.value.length}),id:"native-apps:available"},{value:"ignored",label:t("dialogs.scanResults.tabs.ignored",{count:result.keywordExcludedApps.value.length}),id:"native-apps:ignored"}],result.activeTab.value,value=>{result.actions.selectTab(value);redraw();},invalidate,theme);node.addChild(tabs);controls.push(...tabs.controls);y+=48;
    button("all",t("common.actions.selectAll"),0,y,88,()=>result.actions.selectAll());button("clear",t("common.actions.clearSelection"),98,y,100,()=>result.actions.clearSelection());
    button("add-selected",t("dialogs.scanResults.addSelected"),width-130,y,130,()=>{result.actions.addSelected();options.navigate("manager");},!result.canAdd.value);y+=46;
    const list=result.activeTab.value==="available"?result.apps.value:result.keywordExcludedApps.value.map(entry=>entry.app);
    for(const app of list)appRow(app,result.selectedIds.value.includes(app.id),checked=>result.actions.toggleSelection(app.id,checked),()=>options.edit(app));
    if(!list.length){text(key("manager.noMatch"),14,y+24,13,true);y+=80;}
    for(const warning of result.warnings.value){const label=text(`${warning.rootLabel}: ${warning.message}`,14,y,12,true);label.style.wordWrap=true;label.style.wordWrapWidth=width-28;y+=label.height+8;}
  }else{
    const roots=apps.presentation.scanRoots.value;
    const title=text(key("sources.title"),0,y+7,18);title.style.fontWeight="600";
    const summary=text(key("sources.summary",{total:roots.length,enabled:roots.filter(root=>root.enabled).length}),title.width+12,y+11,12,true);
    const headerWrap=summary.x+summary.width>width-272;
    if(headerWrap)summary.position.set(0,y+35);
    button("reset-sources",key("sources.reset"),width-260,y,144,apps.confirmResetScanRoots);
    button("add-source",`+ ${key("sources.add")}`,width-108,y,108,apps.addScanRoot,false,"primary");y+=headerWrap?66:48;
    for(const root of roots){
      const locked=root.type==="windowsAppCatalog",top=y,detailsX=66,detailsWidth=Math.max(100,width-66-174);
      const meta:Text[]=[];let height=82;
      if(locked){const description=text(key("sources.windowsManaged"),detailsX+10,top+75,11,true);description.style.wordWrap=true;description.style.wordWrapWidth=detailsWidth-10;meta.push(description);height=85+description.height;}
      if(root.lastScannedAt){const status=text(key("sources.lastScan",{time:new Date(root.lastScannedAt).toLocaleString()}),detailsX+10,top+height-15,11,true);meta.push(status);height+=18;}
      const background=new Graphics({eventMode:"none"});node.addChildAt(background,node.children.length-meta.length);
      const draw=(hover:boolean)=>{background.clear().roundRect(0,top,width,height,8).fill(hover?(theme==="dark"?"rgba(255,255,255,0.065)":style.row):style.row).stroke({color:style.border,width:1});invalidate();};draw(false);
      const switchControl=toggle(`source-enabled-${root.id}`,root.enabled,12,top+(height-32)/2,checked=>apps.toggleScanRootEnabled(root.id,checked));
      const name=input(`source-label-${root.id}`,root.label,detailsX,top+9,Math.min(320,detailsWidth),value=>apps.changeScanRootLabel(root.id,value));
      const path=input(`source-path-${root.id}`,root.path,detailsX,top+40,detailsWidth,value=>apps.changeScanRootPath(root.id,value),locked);
      const browse=button(`browse-${root.id}`,t("common.actions.browse"),width-164,top+(height-34)/2,72,()=>{void apps.browseScanRootDirectory(root.id);},locked||apps.isBrowsingScanRoot(root.id));
      const remove=button(`delete-${root.id}`,t("common.actions.delete"),width-84,top+(height-34)/2,72,()=>apps.removeScanRoot(root.id),root.removable===false,"outline",true);
      for(const control of [switchControl,name,path,browse,remove]){control.on("pointerover",()=>draw(true));control.on("pointerout",()=>draw(false));}
      y+=height+8;
    }
    y+=16;heading(key("filters.title"));
    const keywordRow=navigationRow("keywords-expand",key("filters.keywords"),key("filters.keywordCount",{count:apps.presentation.scanKeywordBlacklist.value.length}),"filter-24-regular",()=>{state.keywords=!state.keywords;redraw();},true);
    const first=node.children.length,top=y,firstControl=controls.length;
    input("keyword",apps.newScanKeyword.value,14,y,width-142,value=>{apps.newScanKeyword.value=value;});button("add-keyword",t("common.actions.add"),width-112,y,98,apps.addScanKeywordBlacklistItem);y+=46;
    for(const [index,word] of apps.presentation.scanKeywordBlacklist.value.entries()){text(word,14,y+9);button(`remove-keyword-${index}`,t("common.actions.delete"),width-100,y,86,()=>apps.removeScanKeywordBlacklistItem(index));y+=42;}
    layout.disclosure("apps.keywords",state.keywords,first,top,y-top,controls.slice(firstControl),keywordRow.chevron,true,keywordRow.control);y+=6;
    navigationRow("excluded",key("excluded.title"),key("filters.appCount",{count:apps.presentation.scanAppBlacklist.value.length}),"apps-list-detail-24-regular",()=>options.navigate("excluded"));y+=22;
    heading(key("manager.title"));
    navigationRow("manager",key("manager.title"),key("overview.appCount",{count:apps.managedApps.value.length}),"apps-24-regular",()=>options.navigate("manager"));y+=6;
    button("scan",key(apps.isScanningApps.value?"manager.scanning":"manager.scanApps"),0,y,140,scan,!apps.canScanManagedApps.value||apps.isScanningApps.value);button("add",key("manager.addApp"),152,y,140,()=>options.edit(null));y+=52;
    const topBadge=row();text(key("overview.missingTarget"),14,topBadge+14);text(key("overview.missingTargetDescription"),14,topBadge+39,12,true);toggle("missing-badge",apps.presentation.showMissingLaunchTargetBadge.value,width-60,topBadge+20,apps.toggleMissingLaunchTargetBadge);
  }
  return {node,height:y,controls,layout:layout.finish(y),dispose:()=>{for(const run of cleanup)run();}};
}
