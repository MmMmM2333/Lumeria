import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { findNsis } from "./windowsBuildTools.js";
import { nsisString } from "./windowsRelease.js";

// Exercise the production NSIS macros under a unique test-only HKCU key.
// No installation, shortcuts, Run or StartupApproved system keys are changed.
if(process.platform!=="win32")throw new Error("Windows autostart installer tests require Windows");
mkdirSync(".codex-dev",{recursive:true});
const root=mkdtempSync(join(process.cwd(),".codex-dev/autostart-installer-"));
const source=join(root,"test.nsi"),executable=join(root,"test.exe");
const key=`Software\\LumeriaAutostartTests\\${randomUUID()}`;
const run=key+"\\Run",approved=key+"\\Approved";
const quote=(value:string)=>`"${nsisString(value)}"`;
const normal="'$\\\"$INSTDIR\\Lumeria.exe$\\\" --lumeria-autostart'";
const legacy="'$\\\"\\\\?\\$INSTDIR\\Lumeria.exe$\\\" --lumeria-autostart'";
const foreign="'$\\\"C:\\Other\\Lumeria.exe$\\\" --lumeria-autostart'";
const lines=["Unicode true","RequestExecutionLevel user","SilentInstall silent",`OutFile ${quote(executable)}`,
  `!include ${quote(join(process.cwd(),"release/windows/autostart.nsh"))}`,"Section",'StrCpy $INSTDIR "C:\\测试 安装\\Lumeria"'];
const readRun=()=>lines.push(`ReadRegStr $1 HKCU ${quote(run)} "Lumeria"`);
const equal=(actual:string,expected:string)=>lines.push(`StrCmp ${actual} ${expected} +2 0`,"Goto failed");
const migrate=()=>lines.push(`!insertmacro LumeriaMigrateAutostart ${quote(run)} failed`);
const remove=()=>lines.push(`!insertmacro LumeriaRemoveAutostart ${quote(run)} ${quote(approved)}`);
const assertApproval=(first:number,second=0,third=0)=>{
  lines.push('System::Alloc 12','Pop $2',`System::Call 'advapi32::RegGetValueW(p 0x80000001, w ${quote(approved)}, w "Lumeria", i 8, p 0, p r2, *i 12) i.r3'`,"System::Call '*$2(i.r4, i.r5, i.r6)'",'System::Free $2');
  equal("$3","0");equal("$4",String(first));equal("$5",String(second));equal("$6",String(third));
};
for(const bytes of ["020000000000000000000000","030000000102030405060708"]){
  lines.push(`WriteRegStr HKCU ${quote(run)} "Lumeria" ${legacy}`,`WriteRegBin HKCU ${quote(approved)} "Lumeria" ${bytes}`);
  migrate();readRun();equal("$1",normal);
  assertApproval(bytes.startsWith("02")?2:3,bytes.startsWith("02")?0:67305985,bytes.startsWith("02")?0:134678021);
  migrate();readRun();equal("$1",normal); // Reinstall is idempotent.
}
for(const value of [normal,legacy]){
  lines.push(`WriteRegStr HKCU ${quote(run)} "Lumeria" ${value}`);remove();
  lines.push("ClearErrors");readRun();lines.push("IfErrors +2 0","Goto failed");
  lines.push(`EnumRegValue $1 HKCU ${quote(approved)} 0`);equal("$1",'""');
}
// Another installation and a command with unexpected extra arguments are owned
// by neither migration nor uninstall, including their approval value.
for(const value of [foreign,"'$\\\"$INSTDIR\\Lumeria.exe$\\\" --lumeria-autostart --other'"]){
  lines.push(`WriteRegStr HKCU ${quote(run)} "Lumeria" ${value}`,`WriteRegBin HKCU ${quote(approved)} "Lumeria" 030000000000000000000000`);
  migrate();readRun();equal("$1",value);remove();readRun();equal("$1",value);
  assertApproval(3);
}
lines.push(`DeleteRegKey HKCU ${quote(key)}`);migrate();lines.push("ClearErrors");readRun();lines.push("IfErrors +2 0","Goto failed");remove();
lines.push("SetErrorLevel 0","Goto done","failed:","SetErrorLevel 1","done:",`DeleteRegKey HKCU ${quote(key)}`,"SectionEnd");
writeFileSync(source,lines.join("\n"));
const build=spawnSync(findNsis(),["/V2",source],{encoding:"utf8",windowsHide:true});
if(build.error)throw build.error;
assert.equal(build.status,0,build.stdout+build.stderr);
const result=spawnSync(executable,[],{encoding:"utf8",windowsHide:true,timeout:10000});
if(result.error)throw result.error;
assert.equal(result.status,0,`Autostart macros failed; inspect ${source}`);
writeFileSync(join(root,"proof.json"),JSON.stringify({passed:true,cases:["enabled/disabled legacy migration","idempotent reinstall","normal/legacy uninstall","foreign and extra-argument preservation","missing registration"]},null,2));
console.log(`Autostart installer migration and cleanup passed; evidence: ${root}`);
