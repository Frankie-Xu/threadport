import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectTargets,type TargetDetectionOptions } from '../targets.js';
import { publicText } from '../privacy.js';
import type { TargetAgent,TargetCapability } from './contracts.js';
const execute=promisify(execFile);
export interface ProbeOptions extends TargetDetectionOptions {probe?:(executable:string,args:string[])=>Promise<string>}
export interface Inspection {executable:string|null;installed:boolean;version:string|null;help:string;extraHelp:string;reason:string|null}
const probe=async(executable:string,args:string[])=> (await execute(executable,args,{shell:false,encoding:'utf8',timeout:5000,maxBuffer:256*1024,windowsHide:true})).stdout;
/** Fixed read-only arguments. Discovery/probing never implies login or a successful continuation. */
export async function inspect(agent:TargetAgent,versionPattern:RegExp,acceptedVersions:string|readonly string[],options:ProbeOptions,extraHelpArgs?:string[]):Promise<Inspection>{
 const detected=(await detectTargets(options)).find(target=>target.agent===agent)!;
 const base:Inspection={executable:detected.executable??null,installed:detected.available,version:null,help:'',extraHelp:'',reason:detected.reason};
 if(!detected.executable)return base;
 if((options.platform??process.platform)==='win32'&&!/\.(exe|com)$/i.test(detected.executable))return {...base,reason:'unsupported_executable'};
 const run=options.probe??probe;
 try{
  const candidate=versionPattern.exec((await run(detected.executable,['--version'])).trim())?.[1]??null;
  const version=candidate&&candidate.length<=80&&publicText(candidate)===candidate?candidate:null;
  const accepted=typeof acceptedVersions==='string'?[acceptedVersions]:acceptedVersions;
  if(!version||!accepted.includes(version))return {...base,version,reason:'unverified_version'};
  const [help,extraHelp]=await Promise.all([run(detected.executable,['--help']),extraHelpArgs?run(detected.executable,extraHelpArgs):Promise.resolve('')]);
  return {...base,version,help,extraHelp,reason:null};
 }catch{return {...base,reason:'probe_failed'};}
}
export function capability(agent:TargetAgent,result:Inspection,newSessionWithContext:boolean,nativeResume:boolean):TargetCapability{
 return {agent,installed:result.installed,version:result.version,auth:'unknown',newSessionWithContext,nativeResume,reason:result.reason??(!newSessionWithContext?'unverified_help':!nativeResume?'native_resume_unverified':null)};
}
