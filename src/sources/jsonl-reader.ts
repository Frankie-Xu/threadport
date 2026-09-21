import { open, realpath, lstat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { constants } from 'node:fs';
import { relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import type { ReadCursor } from './contracts.js';
export const PARSER_VERSION = 'claude-jsonl-v1';
export const FILE_BYTES = 50 * 1024 * 1024;
export const LINE_BYTES = 1024 * 1024;
export function inside(root: string, path: string): boolean {
  const value = relative(root, path); return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}
const natural = z.number().int().nonnegative().safe();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const cursorSchema = z.object({
  fileIdentity: z.string().max(512), byteOffset: natural, nextOrdinal: natural, parserVersion: z.string().max(128),
  checkpoint: z.object({headLength:natural.max(4096),headHash:hash,tailHash:hash}).strict().optional(),
  blockOffset:natural.max(256).optional(), recognized:z.boolean().optional(), warnings:z.array(z.string().regex(/^[A-Z_]+$/)).max(32).optional(),
  pendingCalls:z.array(z.object({id:z.string().max(512),command:z.string().max(4096),cwd:z.string().max(4096).nullable(),startedAt:z.string().datetime().nullable()}).strict()).max(128).optional(),
  metadata:z.object({cwd:z.string().max(4096).nullable().optional(),sessionId:z.string().uuid().optional(),vendorSessionId:z.string().max(512).nullable(),formatVersion:z.string().max(128).nullable(),lastEventAt:z.string().datetime().nullable()}).strict().optional(),
}).strict();
export function validateCursor(cursor: ReadCursor | null): ReadCursor | null {
  if (cursor === null) return null;
  const parsed=cursorSchema.safeParse(cursor); if(!parsed.success) throw new DomainError('INVALID_INPUT','Invalid source cursor; rebuild this session.'); return parsed.data;
}
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function bytes(file:FileHandle, start:number, size:number):Promise<Buffer>{
 const buffer=Buffer.alloc(size);const result=await file.read(buffer,0,size,start);return buffer.subarray(0,result.bytesRead);
}
export async function checkpoint(file:FileHandle, offset:number, size:number):Promise<NonNullable<ReadCursor['checkpoint']>>{
 const headLength=Math.min(size,4096);
 return {headLength,headHash:digest(await bytes(file,0,headLength)),tailHash:digest(await bytes(file,Math.max(0,offset-4096),Math.min(offset,4096)))};
}
export interface JsonlLine { start:number; end:number; text:string|null; issue?:string }
/** Revisit leaves the cursor at the record start when only some blocks were consumed. */
export type JsonlLineDecision = 'continue' | 'stop' | 'revisit';
export interface JsonlPage { lines:JsonlLine[]; cursor:ReadCursor; warnings:string[]; hasMore:boolean }
export async function readJsonl(input:{path:string;root:string;cursor:ReadCursor|null;maxRecords:number;signal:AbortSignal;consumeLine?:(line:JsonlLine,reset:boolean)=>JsonlLineDecision;maxLineBytes?:number;maxFileBytes?:number;parserVersion?:string}):Promise<JsonlPage>{
 const parserVersion=input.parserVersion??PARSER_VERSION;
 input.signal.throwIfAborted();const prior=validateCursor(input.cursor);
 const maxLine=input.maxLineBytes??LINE_BYTES, maxFile=input.maxFileBytes??FILE_BYTES;
 if(!Number.isSafeInteger(input.maxRecords)||input.maxRecords<1||input.maxRecords>1000||!Number.isSafeInteger(maxLine)||maxLine<1||maxLine>LINE_BYTES||!Number.isSafeInteger(maxFile)||maxFile<1||maxFile>FILE_BYTES) throw new DomainError('INVALID_INPUT','Invalid source read budget.');
 const root=await realpath(input.root), path=await realpath(input.path);
 const link=await lstat(input.path);
 if(!inside(root,path)||link.isSymbolicLink()||!link.isFile()) throw new DomainError('INVALID_INPUT','Source path is outside the allowed regular files.');
 const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const stat=await file.stat();input.signal.throwIfAborted();
  if(!stat.isFile()||stat.dev!==link.dev||stat.ino!==link.ino||await realpath(input.path)!==path)throw new DomainError('INVALID_INPUT','Source changed during opening; retry.');
  const identity=createHash('sha256').update(JSON.stringify([stat.dev,stat.ino,stat.birthtimeMs])).digest('hex');
  let offset=prior?.byteOffset??0; const warnings:string[]=[];
  const headMatches=!prior?.checkpoint||digest(await bytes(file,0,prior.checkpoint.headLength))===prior.checkpoint.headHash;
  const tailMatches=!prior?.checkpoint||digest(await bytes(file,Math.max(0,offset-4096),Math.min(offset,4096)))===prior.checkpoint.tailHash;
  const reset=!!prior&&(prior.fileIdentity!==identity||prior.parserVersion!==parserVersion||offset>stat.size||!headMatches||!tailMatches);
  if(reset){offset=0;warnings.push('SOURCE_RESET');}
  const cursor:ReadCursor={fileIdentity:identity,byteOffset:offset,nextOrdinal:reset?0:prior?.nextOrdinal??0,parserVersion};
  if(stat.size>maxFile)return {lines:[],cursor,warnings:[...warnings,'FILE_TOO_LARGE'],hasMore:false};
  const lines:JsonlLine[]=[];let position=offset,start=offset,total=0,oversized=false;let fragments:Buffer[]=[];
  const chunk=Buffer.alloc(64*1024);let stop=false;
  while(position<stat.size&&!stop){
   input.signal.throwIfAborted();const {bytesRead}=await file.read(chunk,0,Math.min(chunk.length,stat.size-position),position);if(!bytesRead)break;
   let index=0;
   while(index<bytesRead){
    const found=chunk.indexOf(10,index);const newline=found>=0&&found<bytesRead?found:-1;const end=newline<0?bytesRead:newline;
    const segment=chunk.subarray(index,end);total+=segment.length;
    if(total>maxLine){oversized=true;fragments=[];}else if(!oversized)fragments.push(Buffer.from(segment));
    if(newline<0)break;
    const lineEnd=position+newline+1;let text:string|null=null;let issue:string|undefined;
    if(oversized)issue='LINE_TOO_LARGE';else try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(fragments)).replace(/\r$/,'');}catch{issue='INVALID_UTF8';}
    const line={start,end:lineEnd,text,...(issue?{issue}:{})};lines.push(line);if(issue)warnings.push(issue);
    const decision=input.consumeLine?.(line,reset)??'continue';input.signal.throwIfAborted();
    cursor.byteOffset=decision==='revisit'?start:lineEnd;if(decision!=='revisit')cursor.nextOrdinal++;
    start=lineEnd;total=0;oversized=false;fragments=[];index=newline+1;
    if(decision!=='continue'||lines.length>=input.maxRecords||lineEnd-offset>=4*1024*1024){stop=true;break;}
   }
   position+=bytesRead;
  }
  if(!stop&&start<stat.size)warnings.push(oversized?'INCOMPLETE_OVERSIZED_LINE':'INCOMPLETE_LINE');
  const after=await file.stat();if(after.size<stat.size||after.ino!==stat.ino||(after.size===stat.size&&after.mtimeMs!==stat.mtimeMs))throw new DomainError('INVALID_INPUT','Source changed during reading; retry from the last committed cursor.');
  cursor.checkpoint=await checkpoint(file,cursor.byteOffset,stat.size);
  // A half-line is waiting for the writer, not an immediately consumable next page.
  return {lines,cursor,warnings:[...new Set(warnings)],hasMore:stop&&cursor.byteOffset<stat.size};
 }finally{await file.close();}
}
