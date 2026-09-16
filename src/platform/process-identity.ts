import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export interface ProcessIdentity {pid:number;instance:string|null;platform:string;boot:string|null;start:string|null}
const instance=randomUUID();
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
  }
 }catch{/* Inspection is deliberately conservative. */}
 return value;
}
export function observeProcess(prior:ProcessIdentity):'same'|'different'|'unavailable'{
 if(prior.pid===process.pid&&prior.instance!==null)return prior.instance===instance?'same':'different';
 const current=processIdentity(prior.pid);
 if(!prior.boot||!prior.start||!current.boot||!current.start)return 'unavailable';
 return prior.platform===current.platform&&prior.boot===current.boot&&prior.start===current.start?'same':'different';
}
