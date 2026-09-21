import {Container,Graphics} from "pixi.js";
import type {NativeManagement} from "./NativeManagement.js";
import type {NativeSettingsControl} from "./NativeSettingsShell.js";
import {NativeSegmentedControl} from "./NativeSegmentedControl.js";
import {NativeFluentToggle} from "./NativeFluentToggle.js";
import {nativeSettingsStyle,type NativeTheme} from "./NativeFluentButton.js";
import {nativeFluentIcon} from "./nativeFluentIcons.js";
import {createNativeText,NATIVE_UI_FONT_FAMILY} from "./nativeTypography.js";
import {t} from "../../native/nativeLocalization.js";

/** A self-contained illustration: controls never write app settings or layout. */
export function openNativeImportHelp(management:NativeManagement,theme:NativeTheme,invalidate:()=>void):void{
  let stage="initial",grouped=true,single=false,change="rename",after=false;
  const refresh=()=>management.refresh();
  management.dialog({id:"import-help",title:t("imports.groupHelpTitle"),subtitle:t("imports.helpIntro"),width:760,maxHeight:820,confirmText:t("notices.acknowledge"),confirm:()=>{},build:width=>{
    const node=new Container(),controls:NativeSettingsControl[]=[],style=nativeSettingsStyle(theme);let y=0;
    const text=(value:string,x:number,top:number,size=13,w=width)=>{const label=createNativeText({text:value,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fill:style.text,wordWrap:true,breakWords:true,wordWrapWidth:w,lineHeight:size*1.5}});label.position.set(x,top);node.addChild(label);return label;};
    const segmented=(entries:{value:string;label:string}[],value:string,choose:(v:string)=>void)=>{const control=new NativeSegmentedControl(entries.map(e=>({...e,id:`native-import-help:${e.value}`})),value,v=>{choose(v);refresh();},invalidate,theme,width);control.y=y;node.addChild(control);controls.push(...control.controls);y+=46;};
    segmented(["initial","new","changes"].map(value=>({value,label:t(`imports.helpTab_${value}`)})),stage,value=>{stage=value;});
    if(stage==="initial"){
      segmented([{value:"flat",label:t("imports.arrangeFlat")},{value:"group",label:t("imports.arrangeGrouped")}],grouped?"group":"flat",v=>{grouped=v==="group";});
      const toggle=new NativeFluentToggle("checkbox",v=>{single=v;refresh();},invalidate,theme);toggle.checked=single;toggle.disabled=!grouped;toggle.y=y;node.addChild(toggle);
      text(t("imports.single"),38,y+5,12);controls.push({node:toggle,disabled:()=>toggle.disabled,focus:active=>{toggle.alpha=active?.7:1;invalidate();},handleKey:key=>{if(key!==" "&&key!=="Enter")return false;toggle.toggle();return true;}});y+=44;
    }else if(stage==="changes")segmented(["rename","move","dissolve","flatRule","singleRule"].map(value=>({value,label:t(`imports.helpChange_${value}`)})),change,value=>{change=value;});
    if(stage==="new")segmented([{value:"before",label:t("imports.beforeArrange")},{value:"after",label:t("imports.afterArrange")}],after?"after":"before",value=>{after=value==="after";});
    const top=y,height=306,half=(width-60)/2;
    node.addChild(new Graphics({eventMode:"none"}).roundRect(0,top,width,height,8).fill(style.row).stroke({color:style.border,width:1}));
    text(t("imports.treeSource"),16,top+12,12);text(t("imports.treeResult"),width/2+28,top+12,12);
    const source=[{label:t("imports.helpRoot"),depth:0,folder:true},{label:"A",depth:1,folder:false},{label:"B",depth:1,folder:false},{label:t("imports.treeGroup"),depth:1,folder:true},{label:"C",depth:2,folder:false},{label:"D",depth:2,folder:false},...(stage!=="initial"?[{label:"G",depth:2,folder:false}]:[]),{label:t("imports.treeSingle"),depth:1,folder:true},{label:"E",depth:2,folder:false},...(stage!=="initial"?[{label:"F",depth:1,folder:false}]:[])];
    source.forEach((row,i)=>{const x=16+row.depth*16,yy=top+39+i*25;const icon=nativeFluentIcon(row.folder?"folder-open-20-regular":"window-24-regular",row.folder?"#c49538":style.accent,17);icon.position.set(x,yy);node.addChild(icon);const label=row.folder?row.label:t("imports.treeApp",{letter:row.label});text(label+(["F","G"].includes(row.label)?`  ${t("imports.newFound")}`:""),x+23,yy,12,half-45);});
    text("→",width/2-10,top+130,20,25);
    let result:{name:string;folder:boolean;members:string}[];
    if(stage==="initial")result=grouped?[{name:"A",folder:false,members:""},{name:"B",folder:false,members:""},...(!single?[{name:"E",folder:false,members:""}]:[]),{name:t("imports.treeGroup"),folder:true,members:"C  D"},...(single?[{name:t("imports.treeSingle"),folder:true,members:"E"}]:[])]:["A","B","C","D","E"].map(name=>({name,folder:false,members:""}));
    else result=[{name:"A",folder:false,members:""},{name:"B",folder:false,members:""},{name:"E",folder:false,members:""},{name:change==="rename"&&stage==="changes"?t("imports.helpRenamed"):t("imports.treeGroup"),folder:true,members:"C  D"},{name:"F",folder:false,members:""},{name:"G",folder:false,members:""}];
    if(stage==="changes"&&change==="dissolve")result=["A","B","C","D","E","F","G"].map(name=>({name,folder:false,members:""}));
    if(stage==="changes"&&change==="move"){result.find(r=>r.folder)!.members="D";result.splice(2,0,{name:"C",folder:false,members:""});}
    if(stage==="new"&&after){result=result.filter(r=>r.name!=="G");result.find(r=>r.folder)!.members="C  D  G";}
    const x0=width/2+28,cell=(width-x0-12)/3;
    result.forEach((row,i)=>{const x=x0+cell*(i%3+.5),yy=top+46+Math.floor(i/3)*82;
      node.addChild(new Graphics({eventMode:"none"}).roundRect(x-20,yy,40,40,9).fill({color:style.accent,alpha:row.folder?.12:.07}));
      const icon=nativeFluentIcon(row.folder?"folder-open-20-regular":"window-24-regular",style.accent,24);icon.position.set(x-12,yy+8);node.addChild(icon);
      const name=text(row.folder?row.name:t("imports.treeApp",{letter:row.name}),0,yy+44,11,cell-6);name.style.align="center";name.x=x-name.width/2;
      if(row.folder){const members=text(row.members,0,yy+62,10,cell);members.style.fill=style.muted;members.x=x-members.width/2;}
    });y+=height+16;
    const message=stage==="initial"?t("imports.helpInitial"):stage==="new"?t("imports.helpNew"):t(`imports.helpExplain_${change}`);
    const explanation=text(message,0,y,13);y+=explanation.height+16;
    const note=text(t("imports.helpDemoOnly"),0,y,12);note.style.fill=style.muted;y+=note.height;
    return {node,controls,height:y,maxVisibleHeight:580};
  }});
}
