import { createHash } from 'node:crypto';
import { z } from 'zod';
import { redactSecrets } from '../redact.js';
import { relativeInside, sourcePlatformForRoot } from '../workspace/paths.js';
import type { NormalizedEvent } from '../domain/models.js';
import type { PendingCall } from './contracts.js';
export type RecordValue = Record<string, unknown>;
export const record = (value:unknown):value is RecordValue => typeof value==='object'&&value!==null&&!Array.isArray(value);
export function stableId(...parts:unknown[]):string {
 const hex=createHash('sha256').update(JSON.stringify(parts)).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function bounded(value:string,limit=4096):{text:string;omitted:boolean}{
 const redacted=redactSecrets(value).text;const bytes=Buffer.from(redacted);if(bytes.length<=limit)return {text:redacted,omitted:false};
 let end=limit;while(end>0&&(bytes[end]&0xc0)===0x80)end--;return {text:bytes.subarray(0,end).toString('utf8'),omitted:true};
}
export function timestamp(value:unknown):string|null{const parsed=z.string().datetime({offset:true}).safeParse(value);return parsed.success?new Date(parsed.data).toISOString():null;}
function visible(value:unknown):string{
 if(typeof value==='string')return value;
 if(Array.isArray(value))return value.filter(record).filter(x=>x.type==='text').map(x=>typeof x.text==='string'?x.text:'').join('\n');
 if(record(value))return typeof value.output==='string'?value.output:typeof value.text==='string'?value.text:typeof value.content==='string'?value.content:'';
 return '';
}
export function normalizeBlock(input:{block:RecordValue;row:RecordValue;role:'user'|'assistant';sessionId:string;offset:number;blockIndex:number;recordHash:string;ordinal:number;pending:Map<string,PendingCall>;warnings:Set<string>}):NormalizedEvent|null{
 const {block,row,role,sessionId,offset,blockIndex,ordinal,pending,warnings}=input;
 const base={id:stableId(sessionId,offset,blockIndex,input.recordHash),sessionId,ordinal,occurredAt:timestamp(row.timestamp),relativePaths:[] as string[],omitted:false,commandRun:null};
 if(block.type==='thinking'||block.type==='redacted_thinking'||block.type==='reasoning')return null;
 if(block.type==='text'&&typeof block.text==='string')return {...base,kind:role==='user'?'user-message':'assistant-message',...bounded(block.text)};
 if(block.type==='tool_use'&&role==='assistant'&&record(block.input)){
  const args=block.input;const cwd=typeof args.cwd==='string'?args.cwd:typeof row.cwd==='string'?row.cwd:null;
  if(block.name==='Bash'&&typeof args.command==='string'&&args.command.trim()){
   const command=bounded(args.command);const location=cwd===null?null:bounded(cwd);
   const vendorId=typeof block.id==='string'&&block.id.length<=512?stableId(sessionId,'call',block.id):null;
   const id=vendorId??stableId(base.id,'call');if(!vendorId)warnings.add('MISSING_TOOL_ID');
   const run={id,sessionId,ordinal,command:command.omitted?'[REDACTED:oversize-command]':command.text,cwd:location?.omitted?'[REDACTED:oversize-cwd]':location?.text??null,exitCode:null,startedAt:base.occurredAt,completedAt:null,eventId:base.id,snapshotId:null};
   if(vendorId&&!warnings.has('DUPLICATE_TOOL_ID')){if(pending.has(vendorId)){pending.clear();warnings.add('DUPLICATE_TOOL_ID');}else if(pending.size<128)pending.set(vendorId,{id,command:run.command,cwd:run.cwd,startedAt:run.startedAt});else warnings.add('PENDING_CALL_LIMIT');}
   return {...base,kind:'command',text:'Observed command invocation; result unknown.',omitted:command.omitted||!!location?.omitted,commandRun:run};
  }
  if(['Write','Edit','MultiEdit','NotebookEdit'].includes(String(block.name))){
   const path=typeof args.file_path==='string'?args.file_path:typeof args.notebook_path==='string'?args.notebook_path:null;
   const relative=path&&cwd?relativeInside(path,cwd,sourcePlatformForRoot(cwd)):undefined;
   const safe=relative?bounded(relative):null;
   return {...base,kind:'file-change',text:'Observed file tool invocation; outcome unknown.',relativePaths:safe&&!safe.omitted?[safe.text]:[],omitted:!!safe?.omitted};
  }
  warnings.add('UNKNOWN_TOOL');return null;
 }
 if(block.type==='tool_result'){
  const callId=typeof block.tool_use_id==='string'?stableId(sessionId,'call',block.tool_use_id):null;
  const call=callId?pending.get(callId):undefined;if(callId)pending.delete(callId);
  const text=bounded(visible(block.content));
  if(!call){warnings.add('UNMATCHED_TOOL_RESULT');return {...base,kind:'command',...text};}
  const content=record(block.content)?block.content:{};
  const explicit='exit_code' in block?block.exit_code:'exit_code' in content?content.exit_code:undefined;
  // Missing, null, or malformed exits remain unknown; only explicit observed integers count.
  let exitCode=typeof explicit==='number'&&Number.isSafeInteger(explicit)?explicit:null;
  if(block.is_error===true){warnings.add('TOOL_REPORTED_ERROR');if(exitCode===0){exitCode=null;warnings.add('CONFLICTING_COMMAND_RESULT');}}
   return {...base,kind:'command',...text,commandRun:{...call,sessionId,ordinal,exitCode,completedAt:base.occurredAt,eventId:base.id,snapshotId:null}};
 }
 warnings.add('UNKNOWN_BLOCK');return null;
}
