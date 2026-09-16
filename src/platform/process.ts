import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import type { LaunchSpec } from '../targets/contracts.js';
export interface ProcessResult {status:'exited'|'failed'|'cancelled'|'interrupted'|'unknown';exitCode:number;errorCode:string|null}
/** Inherit the user's terminal. No shell, command parsing, detached child or background retry. */
export async function runProcess(spec:LaunchSpec,signal?:AbortSignal,onSpawn?:(pid:number)=>void):Promise<ProcessResult>{
 if(signal?.aborted)return {status:'cancelled',exitCode:130,errorCode:'SIGINT'};
 return new Promise(resolve=>{
  let requested:NodeJS.Signals|undefined;let settled=false;let spawned=false;
  const child=spawn(spec.executable,spec.args,{cwd:spec.cwd,shell:false,stdio:'inherit'});
  const interrupt=()=>{requested='SIGINT';child.kill('SIGINT');};const terminate=()=>{requested='SIGTERM';child.kill('SIGTERM');};
  const finish=(result:ProcessResult)=>{if(settled)return;settled=true;process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);signal?.removeEventListener('abort',interrupt);resolve(result);};
  child.once('spawn',()=>{spawned=true;try{if(child.pid!==undefined)onSpawn?.(child.pid);}catch{finish({status:'unknown',exitCode:5,errorCode:'TARGET_OBSERVATION_FAILED'});}});
  process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);signal?.addEventListener('abort',interrupt,{once:true});if(signal?.aborted)interrupt();
  child.on('error',()=>finish(spawned?{status:'unknown',exitCode:5,errorCode:'TARGET_OBSERVATION_FAILED'}:{status:'failed',exitCode:5,errorCode:'SPAWN_FAILED'}));
  child.once('exit',(code,exitSignal)=>{
   const stopped=requested??exitSignal;
   if(stopped){const exitCode=128+(constants.signals[stopped]??1);return finish({status:stopped==='SIGINT'?'cancelled':'interrupted',exitCode,errorCode:stopped});}
   finish(code===0?{status:'exited',exitCode:0,errorCode:null}:{status:'failed',exitCode:code??5,errorCode:code===null?'TARGET_EXIT_UNKNOWN':`TARGET_EXIT_${code}`});
  });
 });
}
