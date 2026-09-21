import type { ImportSourcePolicy } from "./appImportPlan.js";

export type AppImportState={completed:boolean;policies:ImportSourcePolicy[];bindings:{folderId:string;groupKey:string}[];dismissedGroups:string[];deferredIds:string[];recentIds:string[]};
export const emptyAppImportState=():AppImportState=>({completed:false,policies:[],bindings:[],dismissedGroups:[],deferredIds:[],recentIds:[]});
export function assertAppImportState(value:unknown):asserts value is AppImportState{
  const object=(v:unknown,keys:string[]):Record<string,unknown>=>{
    if(!v||typeof v!=="object"||Array.isArray(v))throw new TypeError("Invalid app import state");
    const r=v as Record<string,unknown>;
    if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k)))throw new TypeError("Invalid app import fields");return r;
  };
  const strings=(v:unknown)=>{if(!Array.isArray(v)||v.some(s=>typeof s!=="string"||!s)||new Set(v).size!==v.length)throw new TypeError("Invalid app import identifiers");};
  const r=object(value,["completed","policies","bindings","dismissedGroups","deferredIds","recentIds"]);
  if(typeof r.completed!=="boolean"||!Array.isArray(r.policies)||!Array.isArray(r.bindings))throw new TypeError("Invalid app import state");
  for(const key of ["dismissedGroups","deferredIds","recentIds"])strings(r[key]);
  for(const policy of r.policies){const p=object(policy,["id","enabled","grouped","keepSingle"]);if(typeof p.id!=="string"||!p.id||["enabled","grouped","keepSingle"].some(k=>typeof p[k]!=="boolean"))throw new TypeError("Invalid import policy");}
  for(const binding of r.bindings){const b=object(binding,["folderId","groupKey"]);if(Object.values(b).some(v=>typeof v!=="string"||!v))throw new TypeError("Invalid import binding");}
  strings(r.policies.map(p=>p.id));strings(r.bindings.map(b=>b.folderId));
}
export function copyAppImportState(value:unknown):AppImportState{assertAppImportState(value);return JSON.parse(JSON.stringify(value)) as AppImportState;}
