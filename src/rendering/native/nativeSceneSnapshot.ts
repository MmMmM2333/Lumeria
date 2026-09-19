import { snapshotContractValue } from "../contractSnapshot.js";

/** Retain immutable fields independently so a scalar change does not clone every
 * nested collection and spuriously invalidate renderer structure dependencies. */
export function createNativeRecordSnapshot<T extends object>(): (input:T)=>T {
  let previous:T|null=null;
  let snapshot:T;
  return input=>{
    const keys=Object.keys(input) as (keyof T)[];
    if(previous&&keys.length===Object.keys(previous).length&&keys.every(key=>
      Object.prototype.hasOwnProperty.call(previous,key)&&Object.is(input[key],previous![key])))return snapshot;
    const seen=new WeakMap<object,unknown>();
    if(previous)for(const key of keys){
      const value=input[key];
      if(value!==null&&typeof value==="object"&&Object.prototype.hasOwnProperty.call(previous,key)&&Object.is(value,previous[key])){
        seen.set(value,snapshot[key]);
      }
    }
    snapshot=snapshotContractValue(input,"native record",seen);
    previous=input;
    return snapshot;
  };
}
