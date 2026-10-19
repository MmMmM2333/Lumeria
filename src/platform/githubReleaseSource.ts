import { stableVersion,type ReleaseInfo,type ReleaseSource } from "../application/releaseCheck.js";
import { PRODUCT } from "./product.js";

/** Public stable releases only. Never embeds a GitHub token in the application. */
export function createGitHubReleaseSource(request:typeof fetch=fetch):ReleaseSource{
  return async signal=>{
    const repository=new URL(PRODUCT.repositoryUrl);
    // The public latest-release link resolves to the same stable release without
    // consuming the anonymous REST quota shared by everyone on the same IP.
    // Inspect the redirect without downloading HTML or following another host.
    const response=await request(`${repository.href}/releases/latest`,{
      signal,method:"HEAD",redirect:"manual",
    });
    signal.throwIfAborted();
    if(response.status===404)return null;
    if(![301,302,303,307,308].includes(response.status))throw new Error(`Release request failed (${response.status})`);
    const location=response.headers.get("location");
    if(!location)throw new Error("Missing release URL");
    const url=new URL(location,repository),prefix=`${repository.pathname}/releases/tag/`;
    if(url.origin!==repository.origin||url.username||url.password||url.search||url.hash)throw new Error("Unexpected release URL");
    if(url.pathname===`${repository.pathname}/releases`)return null;
    if(!url.pathname.startsWith(prefix))throw new Error("Unexpected release URL");
    const tag=url.pathname.slice(prefix.length);
    stableVersion(tag);
    return {version:tag.replace(/^v/,""),releaseUrl:url.href} satisfies ReleaseInfo;
  };
}
