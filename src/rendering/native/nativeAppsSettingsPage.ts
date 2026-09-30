import {NativeSegmentedControl} from "./NativeSegmentedControl.js";
import {openNativeImportHelp} from "./NativeImportHelp.js";
import { createNativeText } from "./nativeTypography.js";
import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadApps } from "../../application/launchpadApps.js";
import type { ReadonlyLaunchpadApp } from "../../domain/launchpadLayout.js";
import type { IconTextureRepository, IconTextureItem } from "../pixi/assets/iconTextureRepository.js";
import { t, formatNativeScanTime } from "../../native/nativeLocalization.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import { NativeSettingsLayout, nativeSettingsChevron } from "./nativeSettingsLayout.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import type { NativeManagement } from "./NativeManagement.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { createNativeSettingsInput } from "./nativeSettingsInput.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";
import { NativeVirtualList } from "./ui/NativeVirtualList.js";
import { NativeScrollView } from "./NativeScrollView.js";
import type { NativeButtonAppearance } from "./NativeFluentButton.js";
import { getNativeIconTextureSource } from "./nativeIconTextureSource.js";

export type NativeAppsPageState={keywords:boolean;excludedQuery:string;excludedKeys:Set<string>;scrollOffsets?:Record<string,number>};
type Options={apps:ReturnType<typeof createLaunchpadApps>;host:TextInputHost;width:number;theme:NativeTheme;state:NativeAppsPageState;
  subPage:string|null;management:NativeManagement;icons:IconTextureRepository & {retainTemporary?(item:IconTextureItem):()=>void};invalidate():void;redraw():void;refreshSelection?():void;
  navigate(page:"manager"|"excluded"):void;edit(app:ReadonlyLaunchpadApp|null):void;};

/** Uses the same scan, exclusion and selection commands as the original settings page. */
export function nativeAppsSettingsPage(options:Options):NativeSettingsContent{
  const {apps,host,theme,state,invalidate,redraw}=options,style=nativeSettingsStyle(theme);
  const listGutter=options.subPage==="apps.appManager"||options.subPage==="apps.excludedApps"?12:0;
  const width=options.width-listGutter;
  const node=new Container(),controls:NativeSettingsControl[]=[],cleanup:(()=>void)[]=[];
  const layout=new NativeSettingsLayout(node,width,theme);let y=0;
  let resizeList=(_height:number)=>{};
  let update:(()=>void)|undefined;
  const virtualRows=(count:number,controlCount:number,build:(index:number)=>((index:number)=>boolean|void)|void,key:(index:number)=>string)=>{
    const top=y;
    const list=new NativeVirtualList(count,70,controlCount,index=>{
      const savedY=y,start=node.children.length,controlStart=controls.length;y=0;
      const update=build(index);y=savedY;
      const row=new Container();const children=node.children.slice(start);node.removeChildren(start);row.addChild(...children);return {node:row,controls:controls.splice(controlStart),...(update?{update}:{})};
    },key);
    const route=options.subPage??"";let listHeight=450;
    const scroll=new NativeScrollView(invalidate,offset=>{(state.scrollOffsets??={})[route]=offset;list.viewport(offset,listHeight);},theme);
    scroll.label="native-apps:list-scroll";scroll.y=top;scroll.content.addChild(list);node.addChild(scroll);
    const wrapControls=()=>{for(const control of list.controls){
      const focus=control.focus,rect=control.revealRect!;
      control.focus=active=>{if(active){const target=rect();scroll.reveal(target.top,target.height);}focus(active);};
      control.revealRect=()=>({top:scroll.y,height:Math.min(70,listHeight)});
    }};wrapControls();
    resizeList=height=>{const offset=state.scrollOffsets?.[route]??0;listHeight=Math.max(1,height-scroll.y);scroll.resize(width+listGutter,listHeight,count*70);scroll.scrollTo(offset);list.viewport(scroll.offset,listHeight);};
    const controlStart=controls.length;controls.push(...list.controls);y+=1;
    return {list,refresh:(nextCount:number)=>{count=nextCount;if(list.updateItems(count)){wrapControls();controls.splice(controlStart,controls.length-controlStart,...list.controls);}}};
  };
  const key=(value:string,params:Record<string,string|number>={})=>t(`settings.apps.${value}`,params);
  const text=(value:string,x:number,top:number,size=13,muted=false)=>{
    const label=createNativeText({text:value,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fill:muted?style.muted:style.text}});
    label.position.set(x,top);node.addChild(label);return label;
  };
  const button=(id:string,label:string,x:number,top:number,w:number,action:()=>void,disabled=false,appearance:NativeButtonAppearance="outline",danger=false,height=32)=>{
    const b=new NativeFluentButton(label,w,action,invalidate,theme,appearance,danger,height);b.label=`native-apps:${id}`;b.position.set(x,top);b.disabled=disabled;node.addChild(b);
    b.caption.style.fontSize=12;
    if(appearance!=="link"&&b.caption.width>w-16)b.caption.scale.x=(w-16)/b.caption.width;
    controls.push({node:b,disabled:()=>b.disabled,focus:active=>{b.focused=active;},handleKey:k=>{if(k!=="Enter"&&k!==" ")return false;b.activate();return true;}});return b;
  };
  const input=(id:string,value:string,x:number,top:number,w:number,change:(value:string)=>void,readOnly=false,live=false)=>{
    const label=id.startsWith("source-label-"),path=id.startsWith("source-path-");
    const search=id==="search"||id==="excluded-search",inset=search?26:0;
    const field=createNativeSettingsInput(host,{width:w,height:label?26:path?30:search?36:34,value,theme,readOnly,disabled:readOnly&&path,leadingInset:inset,
      variant:label?"label":"normal",placeholder:id==="search"?key("manager.search"):id==="excluded-search"?key("excluded.search"):id==="keyword"?key("filters.keywordInput"):"",invalidate});
    field.label=`native-apps:${id}`;field.position.set(x+inset,top);node.addChild(field);
    if(search){const icon=nativeFluentIcon("search-20-regular",style.muted,16);icon.position.set(-16,10);field.addChild(icon);}
    let committed=value;
    const commit=()=>{if(!readOnly&&!field.composing&&field.value!==committed){committed=field.value;change(committed);}};field.on(live?"input":"blur",commit);
    controls.push({node:field,disabled:()=>field.disabled,restoreFocus:true,selection:()=>field.selection,restoreSelection:selection=>field.setSelectionRange(selection.anchor,selection.focus),focus:active=>{if(active)field.focus();else if(field.focused)field.blur();},handleKey:k=>{if(k!=="Enter"||field.composing)return false;commit();if(id==="keyword")apps.addScanKeywordBlacklistItem();return true;}});
    cleanup.push(()=>{field.removeAllListeners("blur");field.removeAllListeners("input");field.destroy();});return field;
  };
  const toggle=(id:string,checked:boolean,x:number,top:number,action:(value:boolean)=>void,kind:"checkbox"|"switch"="switch")=>{
    const b=new NativeFluentToggle(kind,action,invalidate,theme,16);b.label=`native-apps:${id}`;b.checked=checked;b.position.set(x,top);node.addChild(b);
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
  const scan=()=>{void apps.rescanManagedApps();};
  const buttonIcon=(b:NativeFluentButton,icon:Parameters<typeof nativeFluentIcon>[0])=>{
    const mark=nativeFluentIcon(icon,b.appearance==="primary"?"#ffffff":style.text,16);mark.position.set(10,8);b.addChild(mark);mark.alpha=b.disabled?0.38:1;b.caption.x+=9;
    return mark;
  };
  const listActions=(total:string,all:()=>void,clear:()=>void)=>{
    const label=text(total,0,y+2,12,true);
    const clearButton=button("clear",t("common.actions.clearSelection"),0,y,96,clear,false,"link",false,18);
    const allButton=button("all",t("common.actions.selectAll"),0,y,88,all,false,"link",false,18);
    clearButton.resizeWidth(Math.ceil(clearButton.caption.width));clearButton.caption.x=clearButton.controlWidth/2;clearButton.x=width-clearButton.controlWidth;
    allButton.resizeWidth(Math.ceil(allButton.caption.width));allButton.caption.x=allButton.controlWidth/2;allButton.x=clearButton.x-10-allButton.controlWidth;
    y+=26;return label;
  };
  const appArtwork=(app:IconTextureItem & {emoji?:string},top:number)=>{
    const artwork=new Container({eventMode:"none"});node.addChild(artwork);
    const release=options.icons.retainTemporary?.(app);if(release)artwork.on("destroyed",release);
    const icon=new Sprite({eventMode:"none"});icon.position.set(45,top+19);icon.visible=false;artwork.addChild(icon);
    const fallback=createNativeText({text:app.emoji||"▣",style:{fill:style.text,fontSize:15}});fallback.position.set(58,top+32);fallback.anchor.set(0.5);artwork.addChild(fallback);
    // Settlement listeners are removed by the repository before invocation. A
    // virtual row may disappear before IO finishes, so retain it only weakly.
    const weakArtwork=new WeakRef(artwork);
    const applyTexture=(texture:ReturnType<IconTextureRepository["resolve"]>)=>{
      const current=weakArtwork.deref();if(!current||current.destroyed||!texture)return;
      const sprite=current.children[0] as Sprite;sprite.texture=texture;sprite.width=sprite.height=26;sprite.visible=true;
      current.children[1]!.visible=false;invalidate();
    };
    const ready=()=>{if(weakArtwork.deref()?.destroyed!==false)return;applyTexture(options.icons.resolve(app));};
    applyTexture(options.icons.resolve(app,ready));
  };
  const appRow=(app:ReadonlyLaunchpadApp,selected:boolean,select:(checked:boolean)=>void,more:()=>void)=>{
    const top=y;y+=70;
    const background=new NativeFluentButton("",width,()=>select(!apps.appManagerSelectedIds.value.includes(app.id)),invalidate,theme,"list-row",false,64);background.label=`native-apps:row-${app.id}`;background.y=top;
    node.addChild(background);
    background.selected=selected;
    const checkbox=toggle(`select-${app.id}`,selected,5,top+16,select,"checkbox");
    appArtwork(app,top);
    const name=new NativeSingleLineText(app.name,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fill:style.text},Math.max(1,width-156));name.position.set(87,top+16);node.addChild(name);
    const target=new NativeSingleLineText(apps.getLaunchTargetPath(app)||key("manager.targetMissing"),{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:11,fill:theme==="dark"?"rgba(255,255,255,0.48)":style.muted},Math.max(1,width-156));target.position.set(87,top+33);node.addChild(target);
    const moreButton=button(`more-${app.id}`,key("manager.more",{name:app.name}),width-44,top+16,32,more,false,"subtle");moreButton.caption.visible=false;
    const dots=new Graphics({eventMode:"none"});for(const x of [11,16,21])dots.circle(x,16,1).fill(style.text);moreButton.addChild(dots);
    const source=getNativeIconTextureSource(app),targetPath=apps.getLaunchTargetPath(app);
    return (next:ReadonlyLaunchpadApp,checked:boolean):boolean=>{
      if(next.name!==app.name||next.emoji!==app.emoji||getNativeIconTextureSource(next)!==source||apps.getLaunchTargetPath(next)!==targetPath)return false;
      if(background.selected!==checked)background.selected=checked;
      if(checkbox.checked!==checked)checkbox.checked=checked;
      return true;
    };
  };
  const selectionBar=(count:number,actions:()=>void)=>{
    const start=node.children.length,top=y,first=controls.length;
    const background=new Graphics({eventMode:"none"});node.addChild(background);
    const label=text(key("manager.selected",{count}),12,y+16,12);y+=8;actions();
    const buttons=controls.slice(first).map(control=>control.node as NativeFluentButton);
    for(const b of buttons){b.caption.scale.x=1;b.resizeWidth(Math.ceil(b.caption.width)+24);}
    const total=buttons.reduce((sum,b)=>sum+b.controlWidth,0)+Math.max(0,buttons.length-1)*8;
    let actionY=top+8,right=width-10;
    if(total+label.width+34>width)actionY=top+36;
    for(const b of [...buttons].reverse()){
      if(right-b.controlWidth<12){actionY+=40;right=width-10;}
      b.position.set(right-b.controlWidth,actionY);right=b.x-8;
    }
    const height=actionY-top+40;
    background.roundRect(0,top,width,height,8).fill(theme==="dark"?"rgba(75,163,246,0.16)":style.selected).stroke({color:style.accent,alpha:0.22,width:1});
    y=top+height+8;
    layout.disclosure(`apps.selection.${options.subPage}`,count>0,start,top,height+8,controls.slice(first),undefined,false);return label;
  };
  if(options.subPage==="apps.appManager"){
    const queryInput=input("search",apps.appManagerSearchQuery.value,0,y,Math.max(100,width-232),value=>{apps.appManagerSearchQuery.value=value;},false,true);
    const scanButton=button("scan",key(apps.isScanningApps.value?"manager.scanning":"manager.scanApps"),width-222,y+2,112,scan,!apps.canScanManagedApps.value||apps.isScanningApps.value);
    const scanIcon=buttonIcon(scanButton,"arrow-sync-20-regular");
    buttonIcon(button("add",key("manager.addApp"),width-102,y+2,102,()=>options.edit(null),false,"primary"),"add-20-regular");y+=44;
    let excludeSelected:NativeFluentButton;
    const selectedLabel=selectionBar(apps.selectedManagedAppCount.value,()=>{
      button("remove-selected",key("manager.remove"),width-360,y,150,()=>apps.removeSelectedManagedAppsFromLaunchpad());
      excludeSelected=button("exclude-selected",key("manager.exclude"),width-200,y,200,()=>apps.excludeSelectedManagedAppsFromScan(),!apps.canExcludeSelectedManagedAppsFromScan.value);
    });
    const countLabel=listActions(key("manager.count",{filtered:apps.filteredManagedApps.value.length,total:apps.managedApps.value.length}),apps.selectAllManagedApps,apps.clearManagedAppSelection);
    let managed=apps.filteredManagedApps.value;
    const list=virtualRows(managed.length,2,index=>{const app=managed[index]!;const refresh=appRow(app,apps.appManagerSelectedIds.value.includes(app.id),checked=>apps.toggleManagedAppSelection(app.id,checked),()=>{
      const current=managed.find(item=>item.id===app.id);if(!current)return;
      const control=node.getChildByLabel(`native-apps:more-${app.id}`,true)!;const p=control.toGlobal({x:0,y:34});
      options.management.menu(p.x,p.y,[{label:t("common.actions.edit"),run:()=>options.edit(current)},
        {label:key("manager.remove"),separatorBefore:true,run:()=>apps.removeManagedAppFromLaunchpad(app.id)},
        ...(apps.canExcludeManagedAppFromScan(current)?[{label:key("manager.exclude"),danger:true,run:()=>apps.excludeManagedAppFromScan(current)}]:[])]);
    });return next=>refresh(managed[next]!,apps.appManagerSelectedIds.value.includes(managed[next]!.id));},index=>managed[index]!.id);
    const empty=text(key("manager.noMatch"),14,y+24,13,true);empty.visible=managed.length===0;
    update=()=>{
      managed=apps.filteredManagedApps.value;
      if(!queryInput.composing&&queryInput.value!==apps.appManagerSearchQuery.value)queryInput.value=apps.appManagerSearchQuery.value;
      scanButton.caption.text=key(apps.isScanningApps.value?"manager.scanning":"manager.scanApps");
      const scanDisabled=!apps.canScanManagedApps.value||apps.isScanningApps.value;if(scanButton.disabled!==scanDisabled)scanButton.disabled=scanDisabled;
      scanIcon.alpha=scanDisabled?0.38:1;
      const count=apps.selectedManagedAppCount.value;selectedLabel.text=key("manager.selected",{count});
      layout.setExpanded(`apps.selection.${options.subPage}`,count>0);
      const excludedDisabled=!apps.canExcludeSelectedManagedAppsFromScan.value;if(excludeSelected.disabled!==excludedDisabled)excludeSelected.disabled=excludedDisabled;
      countLabel.text=key("manager.count",{filtered:managed.length,total:apps.managedApps.value.length});
      list.refresh(managed.length);empty.visible=managed.length===0;invalidate();
    };
  }else if(options.subPage==="apps.excludedApps"){
    input("excluded-search",state.excludedQuery,0,y,width,value=>{state.excludedQuery=value;redraw();},false,true);y+=48;
    const detail=text(key("excluded.description"),0,y,12,true);detail.style.wordWrap=true;detail.style.wordWrapWidth=width;y+=detail.height+16;
    const entries=apps.presentation.excludedScanApps.value.map((app,index)=>({app,index,key:app.catalogId}));
    const valid=new Set(entries.map(item=>item.key));for(const id of state.excludedKeys)if(!valid.has(id))state.excludedKeys.delete(id);
    const filtered=entries.filter(item=>`${item.app.name??""} ${item.key}`.toLowerCase().includes(state.excludedQuery.toLowerCase().trim()));
    const excludedLabel=selectionBar(state.excludedKeys.size,()=>{button("restore-selected",key("excluded.removeSelected"),width-160,y,160,()=>{apps.cancelScanAppExclusions(entries.filter(item=>state.excludedKeys.has(item.key)).map(item=>item.index));state.excludedKeys.clear();redraw();});});
    listActions(key("excluded.results",{count:filtered.length}),()=>{state.excludedKeys=new Set(filtered.map(item=>item.key));refreshSelection();},()=>{state.excludedKeys.clear();refreshSelection();});
    const excludedList=virtualRows(filtered.length,2,index=>{const entry=filtered[index]!;
      const top=y,name=entry.app.name||entry.key,selected=state.excludedKeys.has(entry.key);y+=70;
      const select=(checked:boolean)=>{if(checked)state.excludedKeys.add(entry.key);else state.excludedKeys.delete(entry.key);refreshSelection();};
      const background=new NativeFluentButton("",width,()=>select(!state.excludedKeys.has(entry.key)),invalidate,theme,"list-row",false,64);background.y=top;background.selected=selected;node.addChild(background);
      const checkbox=toggle(`excluded-${entry.key}`,selected,5,top+16,select,"checkbox");
      appArtwork({...entry.app,id:entry.key},top);
      const nameLabel=new NativeSingleLineText(name,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fill:style.text},width-158);nameLabel.position.set(87,top+16);node.addChild(nameLabel);
      const subtitle=new NativeSingleLineText(entry.key,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:11,fill:style.muted},width-158);subtitle.position.set(87,top+33);node.addChild(subtitle);
      const restore=button(`restore-${entry.key}`,key("excluded.restoreTitle"),width-44,top+16,32,()=>{apps.cancelScanAppExclusion(entry.index);redraw();},false,"subtle");restore.caption.visible=false;
      const restoreIcon=nativeFluentIcon("arrow-counterclockwise-20-regular",style.text,18);restoreIcon.position.set(7,7);restore.addChild(restoreIcon);
      return ()=>{const checked=state.excludedKeys.has(entry.key);if(background.selected!==checked)background.selected=checked;if(checkbox.checked!==checked)checkbox.checked=checked;};
    },index=>filtered[index]!.key);
    update=()=>{excludedList.list.refreshRows();};
    const refreshSelection=()=>{
      excludedLabel.text=key("manager.selected",{count:state.excludedKeys.size});
      layout.setExpanded(`apps.selection.${options.subPage}`,state.excludedKeys.size>0);
      excludedList.list.refreshRows();options.refreshSelection?.();invalidate();
    };
    if(!filtered.length){text(key(entries.length?"excluded.noMatch":"excluded.empty"),14,y+24,13,true);y+=80;}
  }else{
    const roots=apps.presentation.scanRoots.value;
    const title=text(key("sources.title"),0,y+7,18);title.style.fontWeight="600";
    const summary=text(key("sources.summary",{total:roots.length,enabled:roots.filter(root=>root.enabled).length}),title.width+12,y+11,12,true);
    const reset=button("reset-sources",key("sources.reset"),0,y,110,apps.confirmResetScanRoots);
    const add=button("add-source",`+ ${key("sources.add")}`,0,y,104,apps.addScanRoot,false,"primary");
    for(const b of [reset,add]){b.caption.scale.x=1;b.resizeWidth(Math.max(b.controlWidth,b.caption.width+24));}
    add.x=width-add.controlWidth;reset.x=add.x-8-reset.controlWidth;
    const headerWrap=summary.x+summary.width>reset.x-12;
    if(headerWrap)summary.position.set(0,y+35);
    y+=headerWrap?66:46;
    for(const root of roots){
      const locked=root.type==="windowsAppCatalog",top=y,detailsX=66;
      const background=new Graphics({eventMode:"none",label:`native-apps:source-card-${root.id}`});node.addChild(background);
      const browse=button(`browse-${root.id}`,t("common.actions.browse"),0,0,64,()=>{void apps.browseScanRootDirectory(root.id);},locked||apps.isBrowsingScanRoot(root.id));
      const remove=button(`delete-${root.id}`,t("common.actions.delete"),0,0,64,()=>apps.removeScanRoot(root.id),root.removable===false,"outline",true);
      for(const b of [browse,remove]){b.caption.scale.x=1;b.resizeWidth(Math.max(64,b.caption.width+24));}
      remove.x=width-12-remove.controlWidth;browse.x=remove.x-8-browse.controlWidth;
      const stacked=browse.x-detailsX-14<120;
      const detailsWidth=Math.max(1,(stacked?width-12:browse.x-14)-detailsX);
      input(`source-label-${root.id}`,root.label,detailsX,top+10,Math.min(320,detailsWidth),value=>apps.changeScanRootLabel(root.id,value));
      input(`source-path-${root.id}`,root.path,detailsX,top+41,detailsWidth,value=>apps.changeScanRootPath(root.id,value),locked);
      let bottom=top+71;
      const metadata=(id:string,value:string)=>{const label=text(value,detailsX+10,bottom+5,11,true);label.label=`native-apps:source-${id}-${root.id}`;label.style.lineHeight=13.2;label.style.wordWrap=true;label.style.wordWrapWidth=Math.max(1,detailsWidth-10);bottom=label.y+label.height;return label;};
      if(locked)metadata("description",key("sources.windowsManaged"));
      if(root.lastScannedAt)metadata("last-scan",key("sources.lastScan",{time:formatNativeScanTime(root.lastScannedAt)}));
      if(stacked){browse.y=remove.y=bottom+10;bottom+=42;}
      if(!locked){
        const policy=apps.imports.policies.find(p=>p.id===root.id)!;
        const ruleY=bottom+10;
        const arrangement=new NativeSegmentedControl([
          {value:"flat",label:t("imports.arrangeFlat"),id:`native-apps:group-flat-${root.id}`},
          {value:"group",label:t("imports.arrangeGrouped"),id:`native-apps:group-${root.id}`},
        ],policy.grouped?"group":"flat",value=>{apps.imports.policy(root.id,value==="group",policy.keepSingle);redraw();},invalidate,theme,detailsWidth-40);
        arrangement.position.set(detailsX,ruleY);node.addChild(arrangement);controls.push(...arrangement.controls);
        const groupWidth=arrangement.controlWidth;
        const label=text(t("imports.single"),0,0,12,true);label.visible=policy.grouped;
        const inline=groupWidth+16+32+label.width+12+28<=detailsWidth;
        const checkX=inline?detailsX+groupWidth+16:detailsX,checkY=inline?ruleY:ruleY+40;
        if(policy.grouped){
          label.position.set(checkX+32,checkY+8);
          toggle(`single-${root.id}`,policy.keepSingle,checkX,checkY,value=>{apps.imports.policy(root.id,policy.grouped,value);redraw();},"checkbox");
        }
        const infoX=policy.grouped?Math.min(width-44,checkX+32+label.width+12):detailsX+groupWidth+12;
        const info=button(`group-info-${root.id}`,t("imports.groupHelpTitle"),infoX,policy.grouped?checkY:ruleY,28,()=>openNativeImportHelp(options.management,theme,invalidate,{grouped:policy.grouped,keepSingle:policy.keepSingle}),false,"subtle",false,32);
        info.caption.text="i";info.caption.scale.set(1);info.caption.style.fontStyle="italic";
        info.addChild(new Graphics({eventMode:"none"}).circle(14,16,8).stroke({color:style.muted,width:1.2}));
        bottom=(policy.grouped?checkY:ruleY)+36;

      }
      const height=Math.max(100,bottom-top+10);
      background.roundRect(0,top,width,height,8).fill(style.row).stroke({color:style.border,width:1});
      toggle(`source-enabled-${root.id}`,root.enabled,12,top+(height-32)/2,checked=>apps.toggleScanRootEnabled(root.id,checked));
      if(!stacked)browse.y=remove.y=top+(height-32)/2;
      y+=height+8;
    }
    y+=16;heading(key("filters.title"));
    const keywordRow=navigationRow("keywords-expand",key("filters.keywords"),key("filters.keywordCount",{count:apps.presentation.scanKeywordBlacklist.value.length}),"filter-24-regular",()=>{state.keywords=!state.keywords;redraw();},true);
    const first=node.children.length,top=y,firstControl=controls.length;
    input("keyword",apps.newScanKeyword.value,14,y,width-142,value=>{apps.newScanKeyword.value=value;},false,true);button("add-keyword",t("common.actions.add"),width-112,y,98,apps.addScanKeywordBlacklistItem);y+=46;
    let chipX=14;
    for(const [index,word] of apps.presentation.scanKeywordBlacklist.value.entries()){
      const label=new NativeSingleLineText(word,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,fill:style.text},Math.max(1,width-76));
      const chipWidth=label.width+45;
      if(chipX>14&&chipX+chipWidth>width-14){chipX=14;y+=38;}
      node.addChild(new Graphics({eventMode:"none"}).roundRect(chipX,y,chipWidth,30,15).fill(theme==="dark"?"rgba(255,255,255,0.1)":style.row).stroke({color:style.border,width:1}));
      label.position.set(chipX+10,y+7);node.addChild(label);
      const remove=button(`remove-keyword-${index}`,key("filters.keywordRemove",{keyword:word}),chipX+chipWidth-26,y+6,18,()=>apps.removeScanKeywordBlacklistItem(index),false,"chip-remove",true,18);remove.caption.visible=false;
      remove.addStateGraphic((g,color)=>{g.clear().moveTo(6,6).lineTo(12,12).moveTo(12,6).lineTo(6,12).stroke({color,width:1});});
      chipX+=chipWidth+8;
    }
    if(chipX>14)y+=30;else {text(key("filters.keywordEmpty"),14,y+8,12,true);y+=34;}
    layout.disclosure("apps.keywords",state.keywords,first,top,y-top,controls.slice(firstControl),keywordRow.chevron,true,keywordRow.control);y+=6;
    navigationRow("excluded",key("excluded.title"),key("filters.appCount",{count:apps.presentation.scanAppBlacklist.value.length}),"apps-list-detail-24-regular",()=>options.navigate("excluded"));y+=22;
    heading(key("manager.title"));
    navigationRow("manager",key("manager.title"),key("overview.appCount",{count:apps.managedApps.value.length}),"apps-list-24-regular",()=>options.navigate("manager"));y+=6;
    const actionRow=(title:string,description:string,icon:Parameters<typeof nativeFluentIcon>[0])=>{
      const top=row();const mark=nativeFluentIcon(icon,style.accent,22);mark.position.set(25,top+25);node.addChild(mark);
      const name=new NativeSingleLineText(title,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fontWeight:"600",fill:style.text},Math.max(1,width-200));name.position.set(70,top+17);node.addChild(name);
      const detail=new NativeSingleLineText(description,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,fill:style.muted},Math.max(1,width-200));detail.position.set(70,top+38);node.addChild(detail);return top;
    };
    const scanTop=actionRow(key(apps.isScanningApps.value?"manager.scanning":"manager.scanApps"),key(apps.canScanManagedApps.value?"overview.scanReady":"overview.scanDisabled"),"arrow-sync-20-regular");
    button("scan",key(apps.isScanningApps.value?"manager.scanning":"overview.scan"),width-110,scanTop+20,96,scan,!apps.canScanManagedApps.value||apps.isScanningApps.value);
    const addTop=actionRow(key("manager.addApp"),key("overview.addDescription"),"add-20-regular");button("add",key("overview.add"),width-110,addTop+20,96,()=>options.edit(null));
      const topBadge=actionRow(key("overview.missingTarget"),key("overview.missingTargetDescription"),"tab-prohibited-24-regular");
      const styles=["none","question","prohibited"] as const;
      const choice=button("missing-style",key(`overview.missingStyle.${apps.presentation.missingTargetStyle.value}`),width-186,topBadge+19,172,()=>{
        activeLine.clear().moveTo(2,33).lineTo(170,33).stroke({color:style.accent,width:2});
        const point=choice.toGlobal({x:0,y:34});options.management.menu(point.x,point.y,styles.map(value=>({label:key(`overview.missingStyle.${value}`),selected:apps.presentation.missingTargetStyle.value===value,run:()=>{
          apps.presentation.missingTargetStyle.value=value;apps.toggleMissingLaunchTargetBadge(true);redraw();
        }})),176,{restore:()=>{if(!choice.destroyed){activeLine.clear();choice.focused=true;invalidate();}}});
      });
      const activeLine=new Graphics({eventMode:"none"});choice.addChild(activeLine);
      choice.caption.anchor.x=0;choice.caption.x=10;
      choice.addChild(new Graphics({eventMode:"none"}).moveTo(151,14).lineTo(156,19).lineTo(161,14).stroke({color:style.text,width:1.5,cap:"round",join:"round"}));
      const shieldTop=actionRow(key("overview.adminShield"),key("overview.adminShieldDescription"),"shield-20-regular");
      toggle("admin-shield",apps.presentation.showAdminShield.value,width-54,shieldTop+20,checked=>{apps.presentation.showAdminShield.value=checked;});
      const elevationTop=actionRow(key("overview.waitElevation"),key("overview.waitElevationDescription"),"play-circle-24-regular");
      toggle("wait-elevation",apps.presentation.waitForElevationAnimation.value,width-54,elevationTop+20,checked=>{apps.presentation.waitForElevationAnimation.value=checked;});
  }
  return {node,height:y,controls,layout:layout.finish(y),...(update?{update}:{}),viewport:(_top,height)=>resizeList(height-38),dispose:()=>{for(const run of cleanup)run();}};
}
