import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export interface ProcessIdentity {pid:number;instance:string|null;platform:string;boot:string|null;start:string|null}
const instance=randomUUID();
function windowsProcessStart(pid:number):string|null{
 // Win32_Process.CreationDate is stable for the lifetime of a PID and is
 // available without opening a process handle. Keep the probe text-only so a
 // permission failure remains an unavailable observation.
 const command=`$p=Get-CimInstance -ClassName Win32_Process -Filter \"ProcessId = ${pid}\"; if($null -eq $p){exit 3}; [DateTime]::Parse($p.CreationDate).ToUniversalTime().Ticks`;
 for(const executable of ['powershell.exe','pwsh.exe']){
  try{
   const value=execFileSync(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',timeout:2000,stdio:['ignore','pipe','ignore']}).trim();
   if(/^\d+$/.test(value))return value;
  }catch{/* Probe failure is deliberately represented as unavailable. */}
 }
 return null;
}
/** Missing platform evidence stays unknown. No process is terminated or considered safely stopped here. */
export function processIdentity(pid:number):ProcessIdentity{
 const value:ProcessIdentity={pid,instance:pid===process.pid?instance:null,platform:process.platform,boot:null,start:null};
 if(!Number.isSafeInteger(pid)||pid<=0)return value;
 try{
  if(process.platform==='linux'){
   value.boot=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
   const stat=readFileSync(`/proc/${pid}/stat`,'utf8');value.start=stat.slice(stat.lastIndexOf(')')+2).split(' ')[19]??null;
  }else if(process.platform==='darwin'){
   value.boot=execFileSync('/usr/sbin/sysctl',['-n','kern.boottime'],{encoding:'utf8',timeout:2000,stdio:['ignore','pipe','ignore']}).trim();
   value.start=execFileSync('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:2000,stdio:['ignore','pipe','ignore']}).trim()||null;
  }else if(process.platform==='win32'){
   value.start=windowsProcessStart(pid);
  }
 }catch{/* Inspection is deliberately conservative. */}
 return value;
}
function hasComparableEvidence(identity:ProcessIdentity):boolean{
 return identity.platform==='win32'?Boolean(identity.start):Boolean(identity.boot&&identity.start);
}
export function observeProcess(prior:ProcessIdentity):'same'|'different'|'unavailable'{
 if(prior.pid===process.pid&&prior.instance!==null)return prior.instance===instance?'same':'different';
 const current=processIdentity(prior.pid);
 if(!hasComparableEvidence(prior)||!hasComparableEvidence(current))return 'unavailable';
 const bootMatches=prior.platform==='win32'||prior.boot===current.boot;
 return prior.platform===current.platform&&bootMatches&&prior.start===current.start?'same':'different';
}
