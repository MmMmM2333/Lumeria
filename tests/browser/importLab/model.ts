import {planAppImport,type AppImportPlan} from "../../../src/domain/appImportPlan.js";
import {catalogFor,defaultSources,type LabSource} from "./fixtures.js";

export type LabFolder={kind:"folder";id:string;name:string;apps:string[];groupKey:string|null};
export type LabItem={kind:"app";id:string}|LabFolder;
export type LabState={version:1;started:boolean;sources:LabSource[];installed:string[];items:LabItem[];hidden:string[];deferred?:string[];excluded:string[];dismissedGroups:string[];recent:string[];notice:boolean;visible:boolean;offline:boolean;history:string[];nextId:number;revision:number};
export function freshState():LabState{return {version:1,started:false,sources:defaultSources(),installed:[],items:[],hidden:[],excluded:[],dismissedGroups:[],recent:[],notice:false,visible:true,offline:false,history:[],nextId:1,revision:0};}
export function placedIds(state:LabState):string[]{return state.items.flatMap(item=>item.kind==="folder"?item.apps:[item.id]);}
export function importPlan(state:LabState,restoreIds:readonly string[]=[]):AppImportPlan{
  return planAppImport({apps:catalogFor(state.installed),sources:state.sources,existingIds:placedIds(state),hiddenIds:[...state.hidden,...(state.deferred??[])].filter(id=>!restoreIds.includes(id)),excludedIds:state.excluded,dismissedGroups:state.dismissedGroups});
}
export function record(state:LabState,message:string):void{state.revision++;state.history=[message,...state.history].slice(0,24);}
export function appendPlan(state:LabState,plan:AppImportPlan):string[]{
  for(const group of plan.groups)state.items.push({kind:"folder",id:`folder-${state.nextId++}`,name:group.name,groupKey:group.key,apps:[...group.appIds]});
  for(const id of plan.singles)state.items.push({kind:"app",id});
  return plan.decisions.filter(item=>item.reason==="new").map(item=>item.id);
}
export function startLab(state:LabState):void{
  const added=appendPlan(state,importPlan(state));state.started=true;
  record(state,`首次导入 ${added.length} 个应用；创建 ${state.items.filter(item=>item.kind==="folder").length} 个文件夹。`);
}
export function scanLab(state:LabState):AppImportPlan{
  const plan=importPlan(state);
  if(state.offline){record(state,"模拟来源扫描失败：保留全部布局，本次结果不应用。");return plan;}
  // Automatic scans append individual entries. Grouping is a reviewable suggestion.
  const ids=plan.decisions.filter(item=>item.reason==="new").map(item=>item.id);
  for(const id of ids)state.items.push({kind:"app",id});
  state.recent=[...new Set([...state.recent,...ids])];if(ids.length)state.notice=true;
  record(state,ids.length?`自动扫描：新增 ${ids.length} 个应用到末尾；已有位置不变。`:"自动扫描：无新增；不重复提示，不恢复已移除应用。");return plan;
}
function detach(state:LabState,id:string):void{
  state.items=state.items.filter(item=>!(item.kind==="app"&&item.id===id));
  for(const item of state.items)if(item.kind==="folder")item.apps=item.apps.filter(appId=>appId!==id);
  state.items=state.items.filter(item=>item.kind!=="folder"||item.apps.length>0);
}
export function removeApp(state:LabState,id:string,exclude=false):void{
  if(!placedIds(state).includes(id))return;
  detach(state,id);state.hidden=[...new Set([...state.hidden,id])];
  if(exclude)state.excluded=[...new Set([...state.excluded,id])];
  state.recent=state.recent.filter(appId=>appId!==id);if(!state.recent.length)state.notice=false;
  record(state,exclude?"已排除此应用：不参与自动导入和普通恢复列表。":"已从启动台移除：自动扫描不会带回，可在手动扫描中重新添加。");
}
export function moveApp(state:LabState,id:string,target:string):void{
  if(!placedIds(state).includes(id))return;
  const folder=state.items.find((item):item is LabFolder=>item.kind==="folder"&&item.id===target);
  if(target!=="desktop"&&!folder)return;
  if(folder?.apps.includes(id))return;
  detach(state,id);
  if(folder)folder.apps.push(id);else state.items.push({kind:"app",id});
  // A user-positioned item is no longer part of one-click recent arrangement.
  state.recent=state.recent.filter(appId=>appId!==id);
  record(state,"已手动移动应用；后续扫描和本批整理不会搬回。");
}
export function dissolveFolder(state:LabState,id:string):void{
  const index=state.items.findIndex(item=>item.kind==="folder"&&item.id===id),folder=state.items[index];
  if(!folder||folder.kind!=="folder")return;
  state.items.splice(index,1,...folder.apps.map(appId=>({kind:"app" as const,id:appId})));
  if(folder.groupKey)state.dismissedGroups=[...new Set([...state.dismissedGroups,folder.groupKey])];
  state.recent=state.recent.filter(appId=>!folder.apps.includes(appId));record(state,`已解散「${folder.name}」；自动扫描不会重建此分组。`);
}
export function manualCandidates(state:LabState){
  const plan=importPlan(state,[...state.hidden,...(state.deferred??[])]);
  return plan.decisions.filter(row=>row.reason==="new"||(row.reason==="existing"&&state.recent.includes(row.id)))
    .map(row=>({...row,status:placedIds(state).includes(row.id)?"recent":state.hidden.includes(row.id)?"hidden":state.deferred?.includes(row.id)?"deferred":"new"}));
}
export type PlacementChoice={key:string;name:string;ids:string[];target:string;suggestedTarget:string;folderName:string;groupKey:string|null};
export function placementPreview(state:LabState,selected:readonly string[]):PlacementChoice[]{
  const eligible=new Set(manualCandidates(state).map(r=>r.id));
  const plan=planAppImport({apps:catalogFor(state.installed).filter(a=>selected.includes(a.id)&&eligible.has(a.id)),sources:state.sources,existingIds:[],hiddenIds:[],excludedIds:state.excluded,dismissedGroups:state.dismissedGroups});
  const rows:PlacementChoice[]=[];
  for(const decision of plan.decisions.filter(d=>d.reason==="new")){
    const matching=state.items.filter((i):i is LabFolder=>i.kind==="folder"&&i.groupKey!==null&&i.groupKey===decision.groupKey);
    const group=matching.length>1?undefined:plan.groups.find(g=>g.appIds.includes(decision.id));
    const folder=matching.length===1?matching[0]:undefined;
    const key=folder?.id??group?.key??decision.id;
    const existing=rows.find(r=>r.key===key);
    if(existing){existing.ids.push(decision.id);continue;}
    rows.push({key,name:folder?.name??group?.name??decision.name,ids:[decision.id],target:folder?.id??(group?"new":"desktop"),suggestedTarget:folder?.id??(group?"new":"desktop"),folderName:group?.name??decision.name,groupKey:decision.groupKey});
  }
  return rows;
}
/** Validate the entire preview before changing layout; no partial commits. */
export function applyPlacementPreview(state:LabState,rows:readonly PlacementChoice[],offered:readonly string[]):void{
  if(state.offline)throw new Error("来源不可访问，请重新扫描。");
  const eligible=new Set(manualCandidates(state).map(r=>r.id)),ids=rows.flatMap(r=>r.ids);
  if(new Set(ids).size!==ids.length||ids.some(id=>!eligible.has(id)))throw new Error("应用状态已改变，请重新预览。");
  for(const row of rows){
    if(row.target!=="desktop"&&row.target!==row.suggestedTarget)throw new Error("请选择末尾或建议方案。");
    if(row.target==="new"&&!row.folderName.trim())throw new Error("请填写新文件夹名称。");
    if(!["desktop","new"].includes(row.target)&&!state.items.some(i=>i.kind==="folder"&&i.id===row.target))throw new Error("目标文件夹已改变，请重新预览。");
  }
  const placed=new Set(placedIds(state));
  for(const row of rows){
    if(row.target==="desktop"){
      for(const id of row.ids)if(!placed.has(id))state.items.push({kind:"app",id});
    }else{
      for(const id of row.ids)detach(state,id);
      if(row.target==="new")state.items.push({kind:"folder",id:`folder-${state.nextId++}`,name:row.folderName.trim().slice(0,32),apps:[...row.ids],groupKey:row.groupKey});
      else {const folder=state.items.find((i):i is LabFolder=>i.kind==="folder"&&i.id===row.target)!;folder.apps.push(...row.ids);}
    }
  }
  state.deferred=[...new Set([...(state.deferred??[]),...offered.filter(id=>!ids.includes(id)&&!placed.has(id)&&!state.hidden.includes(id))])].filter(id=>!ids.includes(id));
  state.hidden=state.hidden.filter(id=>!ids.includes(id));state.recent=state.recent.filter(id=>!ids.includes(id));state.notice=state.notice&&state.recent.length>0;
  record(state,`确认放置：已确认 ${ids.length} 个应用的放置方式，不再重复提醒；未选中的新应用暂不自动加入。`);
}
/** The sandbox persists only its own versioned key; corrupted data is surfaced. */
export function decodeLabState(raw:string):LabState{
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=="object")throw new Error("实验数据格式无效");
  const v=value as Record<string,unknown>;
  const strings=(x:unknown):x is string[]=>Array.isArray(x)&&x.every(i=>typeof i==="string");
  if(v.deferred!==undefined&&!strings(v.deferred))throw new Error("暂不添加记录无效");
  if(v.version!==1||!["started","notice","visible","offline"].every(k=>typeof v[k]==="boolean")
    ||!["installed","hidden","excluded","dismissedGroups","recent","history"].every(k=>strings(v[k]))
    ||!Number.isSafeInteger(v.nextId)||Number(v.nextId)<1||!Number.isSafeInteger(v.revision)||Number(v.revision)<0
    ||!Array.isArray(v.sources)||!Array.isArray(v.items))throw new Error("实验数据版本或结构无效，请重置实验");
  const sourceIds=new Set(defaultSources().map(s=>s.id));
  for(const s of v.sources){if(!s||typeof s!=="object"||!sourceIds.delete(s.id)||typeof s.name!=="string"||typeof s.path!=="string"||!["enabled","grouped","keepSingle"].every(k=>typeof s[k]==="boolean"))throw new Error("实验来源配置无效");}
  if(sourceIds.size)throw new Error("实验来源不完整");
  const state=v as unknown as LabState,catalog=new Set(catalogFor(state.installed).map(a=>a.id)),used=new Set<string>(),folders=new Set<string>();
  for(const item of state.items){
    if(!item||typeof item.id!=="string"||!["app","folder"].includes(item.kind))throw new Error("实验布局无效");
    if(item.kind==="folder"&&(typeof item.name!=="string"||!item.name.trim()||!strings(item.apps)||!item.apps.length||(item.groupKey!==null&&typeof item.groupKey!=="string")||folders.has(item.id)))throw new Error("实验文件夹无效");
    if(item.kind==="folder")folders.add(item.id);
    for(const id of item.kind==="folder"?item.apps:[item.id]){if(!catalog.has(id)||used.has(id))throw new Error("实验布局包含未知或重复应用");used.add(id);}
  }
  return state;
}
