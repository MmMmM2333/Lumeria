import { watch, type FSWatcher } from "node:fs";
import type { CatalogScanFilters, CatalogScanRoot } from "../domain/applicationCatalog.js";
import { nativeCatalogCacheKey } from "./nativeCatalogCache.js";

type Request = { roots: readonly CatalogScanRoot[]; filters: CatalogScanFilters };
type Options<T> = {
  request(): Request | null;
  scan(request: Request): Promise<T>;
  apply(result: T, request: Request, current: () => boolean): void;
  report(error: unknown): void;
  watchRoot?: (path: string, changed: () => void, failed: (error: unknown) => void) => { close(): void };
  schedule?: (run: () => void, delay: number) => () => void;
  intervalMs?: number;
};

/** Watch events are hints. Periodic enumeration covers missing roots, renamed
 * directories, AppsFolder and icon resources outside watched launch roots. */
export function createNativeCatalogRefresh<T>(options: Options<T>) {
  const schedule = options.schedule ?? ((run, delay) => { const timer = setTimeout(run, delay); timer.unref?.(); return () => clearTimeout(timer); });
  const watchRoot = options.watchRoot ?? ((path, changed, failed) => {
    const watcher: FSWatcher = watch(path, { recursive: true, persistent: false }, changed);
    watcher.on("error", failed); return watcher;
  });
  let disposed = false, started = false, running = false, dirty = false, generation = 0, key = "";
  let cancelPending = () => {}, cancelPeriodic = () => {};
  let watchers: { close(): void }[] = [];
  const trigger = () => { if(disposed || !started)return;generation++;dirty=true;cancelPending();
    if(!running)cancelPending=schedule(()=>{cancelPending=()=>{};void run();},250); };
  function sync() {
    if(disposed)return;
    const request=options.request(), next=request?nativeCatalogCacheKey(request.roots,request.filters):"";
    if(next===key)return;
    key=next;generation++;for(const watcher of watchers)watcher.close();watchers=[];
    if(request)for(const root of request.roots.filter(root=>root.enabled&&root.type!=="windowsAppCatalog")) {
      const path=root.path.replace(/%([^%]+)%/g,(_,name:string)=>process.env[name]??process.env[name.toUpperCase()]??`%${name}%`);
      try { watchers.push(watchRoot(path,trigger,error=>{options.report(error);trigger();})); }
      catch(error) { options.report(error); }
    }
    if(started)trigger();
  }
  async function run() {
    if(disposed||running||!dirty)return;sync();
    const request=options.request();dirty=false;if(!request)return;
    running=true;const epoch=generation, scanKey=nativeCatalogCacheKey(request.roots,request.filters);
    const current=()=>!disposed&&epoch===generation&&scanKey===key;
    try { const result=await options.scan(request);if(current())options.apply(result,request,current); }
    catch(error){if(current())options.report(error);}
    finally{running=false;if(!disposed&&dirty)cancelPending=schedule(()=>{cancelPending=()=>{};void run();},250);}
  }
  function periodic() {
    if(disposed)return;
    // Re-establish watchers even if a directory was moved/replaced or absent.
    for(const watcher of watchers)watcher.close();watchers=[];key="";sync();trigger();
    cancelPeriodic=schedule(periodic,options.intervalMs??300_000);
  }
  return {
    start(refresh:boolean){if(started||disposed)return;sync();started=true;if(refresh)trigger();cancelPeriodic=schedule(periodic,options.intervalMs??300_000);},
    sync, trigger,
    dispose(){disposed=true;generation++;cancelPending();cancelPeriodic();for(const watcher of watchers)watcher.close();watchers=[];},
  };
}
