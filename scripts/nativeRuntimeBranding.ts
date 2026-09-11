import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

/** Keep the upstream launcher lifecycle, with an application-owned runtime name. */
export function brandNativeRuntime():void {
  if(process.env.ELECTROBUN_OS!=="win"||process.env.ELECTROBUN_ARCH!=="x64")throw new Error("Lumeria runtime branding requires Windows x64");
  const project=realpathSync(process.cwd());
  const within=(path:string)=>{
    const result=realpathSync(path),rel=relative(project,result);
    if(!rel||rel.startsWith("..")||isAbsolute(rel))throw new Error("Runtime branding output must stay inside the project");
    return result;
  };
  if(!process.env.ELECTROBUN_BUILD_DIR)throw new Error("Runtime branding requires the Electrobun postBuild environment");
  const build=within(resolve(process.env.ELECTROBUN_BUILD_DIR));
  const bundles=readdirSync(build,{withFileTypes:true}).filter(item=>item.isDirectory())
    .map(item=>join(build,item.name)).filter(path=>existsSync(join(path,"Resources/app/bun/index.js")));
  if(bundles.length!==1)throw new Error("Expected one freshly built native application");
  const bundle=within(bundles[0]!);
  const bun=within(join(bundle,"bin/bun.exe"));
  const version=JSON.parse(readFileSync(join(project,"package.json"),"utf8")).version as string;
  const source=join(project,"vendor/electrobun-launcher");
  const helper=join(project,"scripts/windowsExecutableBranding.rs");
  const hash=createHash("sha256");
  for(const file of readdirSync(source).filter(name=>name.endsWith(".zig")).sort())hash.update(file).update(readFileSync(join(source,file)));
  hash.update(readFileSync(helper));
  hash.update(readFileSync(join(project,"scripts/nativeRuntimeBranding.ts")));
  const cache=join(project,".codex-dev/runtime-branding",hash.digest("hex").slice(0,20));mkdirSync(cache,{recursive:true});
  const run=(command:string,args:string[],cwd=project)=>{
    const result=spawnSync(command,args,{cwd,stdio:"inherit",windowsHide:true});
    if(result.error)throw result.error;
    if(result.status!==0)throw new Error(`Runtime branding command failed: ${command} (${result.status})`);
  };
  const launcher=join(cache,"launcher.exe"),editor=join(cache,"windowsExecutableBranding.exe");
  if(!existsSync(launcher)){
    const localZig=join(project,".codex-dev/toolchains/zig-x86_64-windows-0.16.0/zig.exe");
    const zig=process.env.LUMERIA_ZIG??(existsSync(localZig)?localZig:"zig");
    const probe=spawnSync(zig,["version"],{encoding:"utf8",windowsHide:true});
    if(probe.error||probe.status!==0||probe.stdout.trim()!=="0.16.0")throw new Error("Install Zig 0.16.0 or set LUMERIA_ZIG to its executable (see vendor/electrobun-launcher/README.md)");
    run(zig,["build-exe","main.zig","-O","ReleaseSafe","-target","x86_64-windows-gnu","-lc","--subsystem","windows","--cache-dir",join(cache,"zig-cache"),"-femit-bin="+launcher],source);
  }
  if(!existsSync(editor))run("rustc",["--edition=2021",helper,"-C","opt-level=2","-o",editor]);
  // Hutch may embed icons before or after postBuild. Use our own ICO resource so
  // replacing the launcher does not depend on that ordering.
  const png=readFileSync(join(project,"src-tauri/icons/launchpad/light/256x256.png"));
  const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
  header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  const icon=join(cache,"app.ico");
  // Avoid touching the shared Bun toolchain or vendored devkit: all writes target the fresh bundle.
  writeFileSync(icon,Buffer.concat([header,png]));
  const stagedLauncher=within(join(bundle,"bin/launcher.exe"));
  copyFileSync(launcher,stagedLauncher);
  const runtime=join(bundle,"bin/Lumeria.exe");
  if(existsSync(runtime))throw new Error("Fresh bundle unexpectedly contains Lumeria.exe");
  renameSync(bun,runtime);
  run(editor,[runtime,icon,version]);run(editor,[stagedLauncher,icon,version]);
  console.log("Native runtime branded: launcher.exe -> Lumeria.exe");
}
