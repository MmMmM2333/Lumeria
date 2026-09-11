import { snapshotContractValue } from "../contractSnapshot.js";

/** Retain one immutable snapshot, invalidating it when any input reference/value changes. */
export function createNativeRecordSnapshot<T extends object>(): (input:T)=>T {
  let previous:T|null=null;
  let snapshot:T;
  return input=>{
    const keys=Object.keys(input) as (keyof T)[];
    if(previous&&keys.length===Object.keys(previous).length&&keys.every(key=>
      Object.prototype.hasOwnProperty.call(previous,key)&&Object.is(input[key],previous![key])))return snapshot;
    snapshot=snapshotContractValue(input);
    previous=input;
    return snapshot;
  };
}
