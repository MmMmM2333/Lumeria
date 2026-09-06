import type { CatalogPort } from "../platform/launchpadPortContracts.js";
import type { NativeDataHost } from "./nativeDataHost.js";
import { nativeHost } from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { makeLaunchTarget } from "../domain/launchpadData.js";

export function createNativeCatalogPort(data:NativeDataHost):CatalogPort {
  return {
    toAssetUrl:path=>path??null,
    cacheCustomIcon:dataUrl=>data.cacheCustomIcon(dataUrl),
    loadIconChoices:path=>data.loadIconChoices(path),
    pickScanRoot:async()=>{
      const result=await nativeHost.platform.dialogs.openFolder();
      if(!result.ok){if(result.error.code==="CANCELLED")return null;throw new Error(result.error.message);}
      return result.value;
    },
    pickLaunchFile:async()=>{
      const result=await nativeHost.platform.dialogs.openFiles({multiple:false});
      if(!result.ok){if(result.error.code==="CANCELLED")return null;throw new Error(result.error.message);}
      const path=result.value[0];if(!path)return null;
      const launchTarget=makeLaunchTarget(path);if(!launchTarget)throw new Error("Invalid launch target");
      return {name:path.split(/[\\/]/).pop()??path,path,launchTarget,launchArgs:"",iconPath:null,iconDataUrl:null};
    },
    scan:(roots=[],filters={keywordBlacklist:[],keywordAllowlist:[],appBlacklist:[]})=>data.scanApps(roots,filters),
  };
}
