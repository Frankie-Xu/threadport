import { createJsonlSource, type SourceOptions } from './jsonl-source.js';
import { record } from './claude-events.js';
import type { ReadCursor } from './contracts.js';
function translate(row:Record<string,unknown>,metadata:ReadCursor['metadata']):Record<string,unknown>{
 const payload=record(row.payload)?row.payload:{};
 if(row.type==='session_meta')return {type:'metadata',sessionId:payload.id,version:payload.cli_version,cwd:payload.cwd};
 if(row.type==='turn_context')return {type:'metadata',cwd:payload.cwd};
 if(row.type!=='response_item')return {type:'unknown'};
 const common={timestamp:row.timestamp,sessionId:metadata?.vendorSessionId,cwd:metadata?.cwd};
 if(payload.type==='reasoning')return {type:'metadata'};
 if(payload.type==='message'&&(payload.role==='user'||payload.role==='assistant'))return {...common,type:payload.role,message:{content:Array.isArray(payload.content)?payload.content.filter(record).filter(x=>['input_text','output_text','text'].includes(String(x.type))).map(x=>({type:'text',text:x.text})):[]}};
 if(payload.type==='function_call'){
  let args:unknown;try{args=typeof payload.arguments==='string'?JSON.parse(payload.arguments):payload.arguments;}catch{return {type:'unknown'};}
  if(!record(args)||!['exec_command','shell_command','shell'].includes(String(payload.name)))return {type:'unknown'};
  return {...common,type:'assistant',message:{content:[{type:'tool_use',id:payload.call_id,name:'Bash',input:{command:args.cmd??args.command,cwd:args.workdir??args.cwd??metadata?.cwd}}]}};
 }
 if(payload.type==='function_call_output')return {...common,type:'user',message:{content:[{type:'tool_result',tool_use_id:payload.call_id,content:payload.output}]}};
 return {type:'unknown'};
}
export function createCodexSource(options:SourceOptions){return createJsonlSource({...options,agent:'codex',parserVersion:'codex-jsonl-v1',translate});}
