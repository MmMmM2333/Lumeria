import {nativeFluentIcon} from "./nativeFluentIcons.js";
import {NativeScrollView} from "./NativeScrollView.js";
import {Container,Graphics} from "pixi.js";
import type {createAppImportSession} from "../../application/appImportSession.js";
import {t} from "../../native/nativeLocalization.js";
import {NativeFluentButton,nativeSettingsStyle,type NativeTheme} from "./NativeFluentButton.js";
import {createNativeText,NATIVE_UI_FONT_FAMILY} from "./nativeTypography.js";
import type {NativeModalBody} from "./NativeModalPanel.js";
import type {NativeSettingsControl} from "./NativeSettingsShell.js";

export function nativeImportPlacement(session:ReturnType<typeof createAppImportSession>,width:number,theme:NativeTheme,invalidate:()=>void,refresh:()=>void,expanded:Set<string>,artwork?:(parent:Container,id:string,x:number,y:number)=>void):NativeModalBody{
  const updates:(()=>void)[]=[];
  const structure=()=>JSON.stringify([session.rows.map(r=>[r.key,r.name,r.ids,r.suggested]),[...expanded],theme]);const signature=structure();
  const node=new Container(),controls:NativeSettingsControl[]=[],style=nativeSettingsStyle(theme);let y=0;
  const text=(value:string,x:number,top:number,size=13,muted=false)=>{
    const label=createNativeText({text:value,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fill:muted?style.muted:style.text,wordWrap:true,breakWords:true,wordWrapWidth:width-32}});label.position.set(x,top);node.addChild(label);return label;
  };
  const button=(label:string,x:number,top:number,w:number,action:()=>void,height=36)=>{
    const b=new NativeFluentButton(label,w,action,invalidate,theme,"outline",false,height);b.position.set(x,top);node.addChild(b);
    controls.push({node:b,disabled:()=>b.disabled,focus:active=>{b.focused=active;},handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;b.activate();return true;}});return b;
  };
  const disclosure=(label:string,x:number,top:number,w:number,open:boolean,action:()=>void)=>{
    const b=button(label,x,top,w,action,40);b.caption.anchor.x=0;b.caption.x=14;
    const fill=new Graphics({eventMode:"none"});b.addChildAt(fill,1);
    const paint=(hover=false)=>{fill.clear().roundRect(.5,.5,w-1,39,4).fill(theme==="dark"?(hover?"rgba(255,255,255,.09)":"rgba(255,255,255,.055)"):(hover?"#e9e9e9":"#f0f0f0"));invalidate();};paint();b.on("pointerover",()=>paint(true));b.on("pointerout",()=>paint());
    const arrow=new Graphics({eventMode:"none"}).moveTo(-4,open?2:-2).lineTo(0,open?-2:2).lineTo(4,open?2:-2).stroke({color:style.muted,width:1.4});arrow.position.set(w-20,20);b.addChild(arrow);return b;
  };
  const names=new Map(session.catalog.map(app=>[app.id,app.name]));
  const members=(ids:readonly string[])=>{
    const scroll=new NativeScrollView(invalidate,()=>{},theme);scroll.position.set(16,y);node.addChild(scroll);
    const height=Math.min(160,ids.length*40);scroll.resize(width-32,height,ids.length*40);
    // Bubble at an edge so the outer modal remains scrollable.
    scroll.removeAllListeners("wheel");scroll.on("wheel",event=>{const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?height:1);if((delta<0&&scroll.offset===0)||(delta>0&&scroll.offset===scroll.maxOffset))return;event.stopPropagation();event.preventDefault();scroll.scrollTo(scroll.offset+delta);});
    ids.forEach((id,index)=>{const yy=index*40;if(artwork)artwork(scroll.content,id,0,yy+5);else{const icon=nativeFluentIcon("window-24-regular",style.accent,24);icon.position.set(0,yy+5);scroll.content.addChild(icon);}
      const label=createNativeText({text:names.get(id)??id,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,fill:style.text}});label.position.set(36,yy+9);if(label.width>width-92)label.scale.x=(width-92)/label.width;scroll.content.addChild(label);
    });
    controls.push({node:scroll,disabled:()=>ids.length<=4,focus:active=>{scroll.alpha=active?.85:1;invalidate();},handleKey:key=>{if(!["ArrowUp","ArrowDown","PageUp","PageDown"].includes(key))return false;scroll.scrollTo(scroll.offset+(key.endsWith("Up")?-1:1)*(key.startsWith("Page")?height:40));return true;}});y+=height;
  };
  for(const row of session.rows.filter(row=>row.suggested!=="desktop")){
    const top=y,bg=new Graphics({eventMode:"none"});node.addChild(bg);
    const icon=nativeFluentIcon("folder-open-20-regular",style.accent,28);icon.position.set(16,top+18);node.addChild(icon);
    const title=text(t(row.suggested==="new"?"imports.newFolder":"imports.joinFolder",{name:row.name}),56,top+14,15);title.style.fontWeight="600";title.style.wordWrapWidth=width-76;
    y=top+title.height+22;
    const existing=session.folderCount(row.suggested);
    const detail=text(t(row.suggested==="new"?"imports.folderNewDetail":"imports.folderJoinDetail",{count:row.ids.length,before:existing,after:existing+row.ids.length}),56,y,12,true);detail.style.wordWrapWidth=width-76;y+=detail.height+16;
    const open=row.ids.length<=4?!expanded.has(`closed:${row.key}`):expanded.has(row.key);
    const expand=disclosure(t("imports.viewMembers",{count:row.ids.length}),16,y,width-32,open,()=>{const key=row.ids.length<=4?`closed:${row.key}`:row.key;if(expanded.has(key))expanded.delete(key);else expanded.add(key);refresh();});expand.label=`native-import:members:${row.key}`;y+=48;
    if(open){members(row.ids);y+=12;}
    for(const [index,target] of [row.suggested,"desktop"].entries()){
      const label=target==="desktop"?t("imports.placeSeparately"):t(row.suggested==="new"?"imports.placeInNew":"imports.placeInExisting");
      const b=button(label,16,y,width-32,()=>{session.choose(row.key,target);refresh();},42);b.label=`native-import:option:${row.key}:${index}`;b.disabled=session.staged;b.selected=row.target===target;
      b.caption.anchor.x=0;b.caption.x=38;b.caption.style.fontSize=13;
      const ring=new Graphics({eventMode:"none"});b.addChild(ring);
      const update=()=>{b.disabled=session.staged;b.selected=row.target===target;ring.clear().circle(18,21,7).stroke({color:row.target===target?style.accent:style.muted,width:1.5});if(row.target===target)ring.circle(18,21,3.5).fill(style.accent);};update();updates.push(update);
      if(target!=="desktop"){const badge=createNativeText({text:t("imports.suggestion"),eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:11,fill:style.accent}});badge.position.set(b.controlWidth-badge.width-16,13);b.addChild(badge);}
      const control=controls.at(-1)!,original=control.handleKey;control.handleKey=key=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(key)){session.choose(row.key,row.target==="desktop"?row.suggested:"desktop");refresh();return true;}return original(key);};y+=48;
    }
    y+=10;bg.roundRect(0,top,width,y-top,8).fill(style.row).stroke({color:style.border,width:1});y+=14;
  }
  const direct=session.rows.filter(row=>row.suggested==="desktop").flatMap(row=>row.ids);
  if(direct.length){
    const top=y,bg=new Graphics({eventMode:"none"});node.addChild(bg);
    const open=direct.length<=4?!expanded.has("direct-closed"):expanded.has("direct-open");
    const header=disclosure(t("imports.directAppsCount",{count:direct.length}),0,y,width,open,()=>{const key=direct.length<=4?"direct-closed":"direct-open";if(expanded.has(key))expanded.delete(key);else expanded.add(key);refresh();});
    header.label="native-import:direct-expand";header.caption.anchor.x=0;header.caption.x=48;
    const icon=nativeFluentIcon("apps-24-regular",style.accent,24);icon.position.set(14,8);header.addChild(icon);y+=50;
    const detail=text(t(session.mode==="recent"?"imports.directAlready":"imports.directPending"),16,y,12,true);y+=detail.height+12;
    if(open)members(direct);y+=8;
    bg.roundRect(0,top,width,y-top,8).fill(style.row).stroke({color:style.border,width:1});y+=16;
  }
  const summaryValues=()=>{const total=session.rows.reduce((n,r)=>n+r.ids.length,0),created=session.rows.filter(r=>r.target==="new").length,joined=session.rows.filter(r=>!["desktop","new"].includes(r.target)).reduce((n,r)=>n+r.ids.length,0),directCount=session.rows.filter(r=>r.target==="desktop").reduce((n,r)=>n+r.ids.length,0);
return {total,created,joined,directCount};};
  const {total,created,joined,directCount}=summaryValues();
  const summary=text(t("imports.totalApps",{count:total}),0,0,13);summary.style.fontWeight="600";
  const parts=[created?t("imports.summaryNew",{count:created}):"",joined?t("imports.summaryJoin",{count:joined}):"",directCount?t("imports.summaryDirect",{count:directCount}):""].filter(Boolean);
  const detail=text(parts.join(t("imports.summarySeparator")),0,summary.height+6,12,true);
  updates.push(()=>{const v=summaryValues();summary.text=t("imports.totalApps",{count:v.total});detail.text=[v.created?t("imports.summaryNew",{count:v.created}):"",v.joined?t("imports.summaryJoin",{count:v.joined}):"",v.directCount?t("imports.summaryDirect",{count:v.directCount}):""].filter(Boolean).join(t("imports.summarySeparator"));});
  const summaryNode=new Container({label:"native-import:summary"});node.removeChild(summary,detail);summaryNode.addChild(summary,detail);
  const summaryHeight=summary.height+6+Math.max(detail.height,38)+16;
  return {node,controls,height:y,fixedHeader:{node:summaryNode,height:summaryHeight,controls:[]},maxVisibleHeight:480,update:()=>{if(signature!==structure())return true;for(const update of updates)update();invalidate();return false;}};
}
