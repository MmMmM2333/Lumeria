export type ReleaseInfo=Readonly<{version:string;releaseUrl:string}>;
export type ReleaseSource=(signal:AbortSignal)=>Promise<ReleaseInfo|null>;
export type ReleaseCheckResult=Readonly<{status:"available";release:ReleaseInfo}>|Readonly<{status:"current"|"unpublished"}>;

export function stableVersion(value:string):number[]{
  if(!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))throw new Error("Invalid stable release version");
  const parts=value.replace(/^v/,"").split(".").map(Number);
  if(!parts.every(Number.isSafeInteger))throw new Error("Invalid version component");
  return parts;
}

/** Independent of UI, network transport and application host. */
export async function checkRelease(current:string,source:ReleaseSource,signal:AbortSignal):Promise<ReleaseCheckResult>{
  const local=stableVersion(current),release=await source(signal);
  signal.throwIfAborted();
  if(!release)return {status:"unpublished"};
  const remote=stableVersion(release.version);
  for(let i=0;i<3;i++){
    if(remote[i]!>local[i]!)return {status:"available",release};
    if(remote[i]!<local[i]!)break;
  }
  return {status:"current"};
}
