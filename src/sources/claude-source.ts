import { opendir, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DomainError } from '../domain/errors.js';
import { inside, PARSER_VERSION, readJsonl, validateCursor } from './jsonl-reader.js';
import { bounded, normalizeBlock, record, stableId, timestamp } from './claude-events.js';
import type { ReadCursor, SourceAdapter, SourceCandidate, SourceDiagnostic, SourceReadResult, SourceSession } from './contracts.js';
export function createClaudeSource(options:{sourceId:string;roots:readonly string[];onDiagnostic?:(diagnostic:SourceDiagnostic)=>void}):SourceAdapter{
 if(typeof options.sourceId!=='string'||!options.sourceId||!Array.isArray(options.roots)||options.sourceId.length>512||!options.roots.length||options.roots.length>100||options.roots.some(root=>typeof root!=='string'||!root))throw new DomainError('INVALID_INPUT','Configure explicit allowed source roots.');
 const roots=[...new Set(options.roots.map(root=>resolve(root)))];
 const diagnostics:SourceDiagnostic[]=[];
 const diagnostic=(rootIndex:number,code:string)=>{const item={sourceId:options.sourceId,rootIndex,code};if(diagnostics.length<1000)diagnostics.push(item);else diagnostics[999]={...item,code:'DIAGNOSTIC_LIMIT'};options.onDiagnostic?.(item);};
 async function allowed(path:string):Promise<string>{
  const canonical=await realpath(path);
  for(const root of roots){
   try{const info=await lstat(root);if(info.isDirectory()&&!info.isSymbolicLink()){const resolvedRoot=await realpath(root);if(inside(resolvedRoot,canonical))return resolvedRoot;}}catch{/* Other allowed roots can still be used. */}
  }
  throw new DomainError('INVALID_INPUT','Source is outside allowed roots; revise source settings.');
 }
 return {
  agent:'claude',parserVersion:PARSER_VERSION,
  get diagnostics(){return diagnostics.map(item=>({...item}));},
  async *discover(requested,signal){
   diagnostics.length=0;
   let entries=0,totalBytes=0;const emitted=new Set<string>();
   for(const [rootIndex,root] of requested.entries()){
    signal.throwIfAborted();if(!roots.includes(resolve(root))){diagnostic(rootIndex,'ROOT_NOT_ALLOWED');continue;}
    let canonical:string;try{canonical=await allowed(root);}catch(error){const code=(error as NodeJS.ErrnoException).code;diagnostic(rootIndex,code==='ENOENT'?'SOURCE_MISSING':code==='EACCES'?'SOURCE_PERMISSION_DENIED':'SOURCE_UNAVAILABLE');continue;}
    const queue:[string,number][]=[[canonical,0]];
    while(queue.length){
     signal.throwIfAborted();const [directory,depth]=queue.pop()!;
     try{
      const current=await realpath(directory);if(!inside(canonical,current)||(await lstat(directory)).isSymbolicLink()){diagnostic(rootIndex,'SYMLINK_SKIPPED');continue;}
      const handle=await opendir(directory);
      for await(const entry of handle){
       signal.throwIfAborted();if(++entries>10000){diagnostic(rootIndex,'DISCOVERY_ENTRY_LIMIT');return;}
       if(entry.isSymbolicLink()){diagnostic(rootIndex,'SYMLINK_SKIPPED');continue;}
       const path=join(directory,entry.name);
       if(entry.isDirectory()){if(depth<16)queue.push([path,depth+1]);else diagnostic(rootIndex,'DISCOVERY_DEPTH_LIMIT');continue;}
       if(!entry.isFile()||!entry.name.endsWith('.jsonl')||emitted.has(path))continue;
       const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())continue;
       totalBytes+=info.size;if(totalBytes>1024*1024*1024){diagnostic(rootIndex,'SOURCE_INPUT_LIMIT');return;}
       emitted.add(path);yield {sourceId:options.sourceId,path,agent:'claude'};
      }
     }catch(error){signal.throwIfAborted();diagnostic(rootIndex,(error as NodeJS.ErrnoException).code==='EACCES'?'SOURCE_PERMISSION_DENIED':'SOURCE_UNAVAILABLE');}
    }
   }
  },
  async read(input):Promise<SourceReadResult>{
   input.signal.throwIfAborted();const prior=validateCursor(input.cursor);
   if(prior&&prior.nextOrdinal>100000)throw new DomainError('INVALID_INPUT','Invalid session event cursor.');
   if(typeof input.candidate.path!=='string'||!input.candidate.path||input.candidate.path.length>32768||input.candidate.agent!=='claude'||input.candidate.sourceId!==options.sourceId||!Number.isSafeInteger(input.maxEvents)||input.maxEvents<1||input.maxEvents>1000)throw new DomainError('INVALID_INPUT','Invalid source candidate or page limit.');
   const session:SourceSession={id:prior?.metadata?.sessionId??stableId('claude',options.sourceId,resolve(input.candidate.path)),sourceId:options.sourceId,agent:'claude',vendorSessionId:prior?.metadata?.vendorSessionId??null,projectId:null,workspaceId:null,sourcePath:resolve(input.candidate.path),parserVersion:PARSER_VERSION,formatVersion:prior?.metadata?.formatVersion??null,lastEventAt:prior?.metadata?.lastEventAt??null,status:'ready'};
   let cursor:ReadCursor=prior??{fileIdentity:'',byteOffset:0,nextOrdinal:0,parserVersion:PARSER_VERSION};
   try{
    const root=await allowed(input.candidate.path);
    session.sourcePath=await realpath(input.candidate.path);session.id=stableId('claude',options.sourceId,session.sourcePath);
    if(prior?.metadata?.sessionId&&prior.metadata.sessionId!==session.id)throw new DomainError('INVALID_INPUT','Cursor belongs to another source session.');
    const page=await readJsonl({path:input.candidate.path,root,cursor:prior,maxRecords:1,signal:input.signal});
    const reset=page.warnings.includes('SOURCE_RESET');if(reset){session.vendorSessionId=null;session.formatVersion=null;session.lastEventAt=null;}
    const warnings=new Set([...(reset?[]:prior?.warnings??[]),...page.warnings]);
    let recognized=reset?false:prior?.recognized??false;
    const pending=new Map((reset?[]:prior?.pendingCalls??[]).map(call=>[call.id,call]));
    const events:SourceReadResult['events']=[];let ordinal=reset?0:prior?.nextOrdinal??0;
    cursor={...page.cursor,nextOrdinal:ordinal};let more=page.hasMore;
    const line=page.lines[0];
    if(line?.text?.trim()){
     let row:unknown;try{row=JSON.parse(line.text);}catch{warnings.add('INVALID_JSON');}
     if(record(row)){
      if(row.type==='user'||row.type==='assistant'){
       recognized=true;const role=row.type;
       const vendor=typeof row.sessionId==='string'?bounded(row.sessionId,512):null;
       if(vendor&&!vendor.omitted){if(session.vendorSessionId&&session.vendorSessionId!==vendor.text){warnings.add('MULTIPLE_SESSION_IDS');}else session.vendorSessionId=vendor.text;}else warnings.add('MISSING_SESSION_ID');
       if(typeof row.version==='string')session.formatVersion=bounded(row.version,128).text;
       const time=timestamp(row.timestamp);if(time)session.lastEventAt=time;
       const message=!warnings.has('MULTIPLE_SESSION_IDS')&&record(row.message)?row.message:{};
       if(!warnings.has('MULTIPLE_SESSION_IDS')&&typeof message.content!=='string'&&!Array.isArray(message.content))warnings.add('UNSUPPORTED_MESSAGE');
       const blocks=typeof message.content==='string'?[{type:'text',text:message.content}]:Array.isArray(message.content)?message.content:[];
       if(blocks.length>256)warnings.add('BLOCK_LIMIT');
       const from=reset?0:prior?.blockOffset??0;let index=from;
       const recordHash=createHash('sha256').update(line.text).digest('hex');
       for(;index<Math.min(blocks.length,256);index++){
        input.signal.throwIfAborted();if(ordinal>=100000){warnings.add('EVENT_LIMIT');break;}const block=blocks[index];if(!record(block)){warnings.add('UNKNOWN_BLOCK');continue;}
        const event=normalizeBlock({block,row,role,sessionId:session.id,offset:line.start,blockIndex:index,recordHash,ordinal,pending,warnings});
        if(event){events.push(event);ordinal++;}
        if(events.length>=input.maxEvents){index++;break;}
       }
       if(index<Math.min(blocks.length,256)){
        cursor.byteOffset=line.start;cursor.blockOffset=index;more=!warnings.has('EVENT_LIMIT');
        cursor.checkpoint={...page.cursor.checkpoint!,tailHash:reset||!prior?createHash('sha256').update('').digest('hex'):prior.checkpoint?.tailHash??createHash('sha256').update('').digest('hex')};
       }
      }else warnings.add('UNKNOWN_EVENT');
     }else if(row!==undefined)warnings.add('UNKNOWN_EVENT');
    }
    cursor.nextOrdinal=ordinal;cursor.pendingCalls=[...pending.values()];cursor.recognized=recognized;
    // Incomplete tails are transient; do not persist their warning after completion.
    cursor.warnings=[...warnings].filter(x=>!['INCOMPLETE_LINE','INCOMPLETE_OVERSIZED_LINE','SOURCE_RESET'].includes(x));
    cursor.metadata={sessionId:session.id,vendorSessionId:session.vendorSessionId,formatVersion:session.formatVersion,lastEventAt:session.lastEventAt};
    session.status=warnings.size?'partial':recognized?'ready':'unsupported';
    if(warnings.has('MULTIPLE_SESSION_IDS')||(!recognized&&warnings.has('UNKNOWN_EVENT')))session.status='unsupported';
    return {session,events,cursor,warnings:[...warnings],hasMore:more};
   }catch(error){
    input.signal.throwIfAborted();if(error instanceof DomainError)throw error;
    const code=(error as NodeJS.ErrnoException).code;session.status=code==='ENOENT'?'missing':'error';
    return {session,events:[],cursor,warnings:[code==='ENOENT'?'SOURCE_MISSING':code==='EACCES'?'SOURCE_PERMISSION_DENIED':'SOURCE_READ_FAILED'],hasMore:false};
   }
  }
 };
}
