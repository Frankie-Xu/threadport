import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectTargets,type TargetDetectionOptions } from '../targets.js';
import { publicText } from '../privacy.js';
import type { TargetAgent,TargetCapability } from './contracts.js';
const execute=promisify(execFile);
export interface ProbeOptions extends TargetDetectionOptions {probe?:(executable:string,args:string[])=>Promise<string>}
export interface Inspection {executable:string|null;installed:boolean;version:string|null;help:string;extraHelp:string;reason:string|null}
const probe=async(executable:string,args:string[])=> (await execute(executable,args,{shell:false,encoding:'utf8',timeout:5000,maxBuffer:256*1024,windowsHide:true})).stdout;
/** Match declarations in the Options section, never flag substrings in prose. */
export function declaresOption(help:string,declarations:readonly string[]):boolean{
 const lines=help.split(/\r?\n/);const sections=lines.flatMap((line,index)=>line==='Options:'?[index]:[]);
 if(sections.length!==1)return false;const start=sections[0]!;
 // Examples/quoted sections are not the command's declarations. Unknown or
 // duplicate top-level sections are conservatively unverified.
 if(lines.slice(0,start).some(line=>/^[A-Za-z][A-Za-z -]*:(?:[ \t]|$)/.test(line)&&!line.startsWith('Usage:')&&!['Arguments:','Commands:'].includes(line)))return false;
 if(lines.some(line=>/^[ \t]*(?:```|~~~|>)/.test(line)))return false;
 const flag=declarations[0]?.match(/--[a-z][a-z-]*/)?.[0];if(!flag)return false;
 const matching:string[]=[];
 for(const line of lines.slice(start+1)){
  if(/^\S/.test(line))break;
  if(!/^ {1,8}-/.test(line))continue;
  const declaration=line.trim().split(/[ \t]{2,}/,1)[0]!;
  if(declaration.match(/(?:^|, )(--[a-z][a-z-]*)(?: |$)/)?.[1]===flag)matching.push(declaration);
 }
 return matching.length===1&&declarations.includes(matching[0]!);
}
export function declaresUsage(help:string,usage:string):boolean{
 const lines=help.split(/\r?\n/);const usages=lines.flatMap((line,index)=>line.startsWith('Usage:')?[index]:[]);
 if(usages.length!==1||lines[usages[0]!]!==usage)return false;
 if(lines.some(line=>/^[ \t]*(?:```|~~~|>)/.test(line)))return false;
 return !lines.slice(0,usages[0]).some(line=>/^[A-Za-z][A-Za-z -]*:(?:[ \t]|$)/.test(line));
}
/** Fixed read-only arguments. Discovery/probing never implies login or a successful continuation. */
export async function inspect(agent:TargetAgent,versionPattern:RegExp,acceptedVersions:string|readonly string[],options:ProbeOptions,extraHelpArgs?:string[]):Promise<Inspection>{
 const detected=(await detectTargets(options)).find(target=>target.agent===agent)!;
 const base:Inspection={executable:detected.executable??null,installed:detected.available,version:null,help:'',extraHelp:'',reason:detected.reason};
 if(!detected.executable)return base;
 if((options.platform??process.platform)==='win32'&&!/\.(exe|com)$/i.test(detected.executable))return {...base,reason:'unsupported_executable'};
 const run=async(executable:string,args:string[])=>{
  const output=await (options.probe??probe)(executable,args);
  if(typeof output!=='string'||Buffer.byteLength(output,'utf8')>256*1024)throw new Error('Probe output exceeds budget.');
  return output;
 };
 try{
  const candidate=new RegExp(versionPattern).exec((await run(detected.executable,['--version'])).trim())?.[1]??null;
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
