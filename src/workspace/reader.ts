import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { GitState } from '../types.js';
import type { SnapshotReason, WorkspaceBinding } from './contracts.js';
import { sensitivePath, WORKSPACE_ALGORITHM, WORKSPACE_POLICY } from './policy.js';
const execute=promisify(execFile);
export class CaptureFault extends Error {constructor(readonly reason:SnapshotReason,readonly omissions:{reason:SnapshotReason|'GIT_IGNORED';count:number}[]=[]){super(reason);}}
function fail(reason:SnapshotReason):never{throw new CaptureFault(reason);}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const signature=(value:Awaited<ReturnType<typeof stat>>)=>[value.dev,value.ino,value.mode,value.size,value.mtimeNs,value.ctimeNs].join(':');
const stat=(path:string)=>lstat(path,{bigint:true});
function inside(root:string,target:string):boolean{
 const rel=relative(root,target);
 return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));
}
async function git(root:string,args:string[],signal:AbortSignal):Promise<string>{
 signal.throwIfAborted();const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_NO_LAZY_FETCH:'1'});
 try{
  const result=await execute('git',['--no-optional-locks','-c','core.fsmonitor=false','-C',root,...args],{env,encoding:'buffer',maxBuffer:1024*1024,timeout:5000,signal});
  const text=result.stdout.toString('utf8');if(!Buffer.from(text).equals(result.stdout))fail('PATH_ENCODING_UNSUPPORTED');return text;
 }catch(error){signal.throwIfAborted();if(error instanceof CaptureFault)throw error;const e=error as {code?:string;killed?:boolean};if(e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'||e.killed)fail('LIMIT_EXCEEDED');throw error;}
}
interface Inventory {head:string;index:string;untracked:string;ignored:string;bindingDigest:string;branch:string;tree:string;files:{path:string;tracked:boolean}[]}
async function inventory(binding:WorkspaceBinding,maxFiles:number,signal:AbortSignal,projection=false):Promise<Inventory>{
 const root=binding.canonicalRoot;if(!isAbsolute(root))fail('WORKSPACE_UNBOUND');
 const info=await stat(root);if(info.isSymbolicLink()||!info.isDirectory())fail('WORKSPACE_UNBOUND');
 const canonical=await realpath(root);let top:string;
 try{top=(await git(canonical,['rev-parse','--show-toplevel'],signal)).replace(/\r?\n$/,'');}catch(error){if(error instanceof CaptureFault)throw error;signal.throwIfAborted();fail('NO_GIT');}
 if(await realpath(top)!==canonical)fail('WORKSPACE_UNBOUND');
 let head:string;try{head=(await git(canonical,['rev-parse','--verify','HEAD^{commit}'],signal)).trim();}catch(error){if(error instanceof CaptureFault)throw error;signal.throwIfAborted();fail('NO_COMMIT');}
 if(!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(head))fail('READ_FAILED');
 const gitDir=await realpath((await git(canonical,['rev-parse','--absolute-git-dir'],signal)).replace(/\r?\n$/,''));
 const common=await realpath(resolve(canonical,(await git(canonical,['rev-parse','--git-common-dir'],signal)).replace(/\r?\n$/,'')));
 const gitInfo=await stat(gitDir);const commonInfo=await stat(common);
 const bindingDigest=hash(JSON.stringify([binding.id,binding.projectId,canonical,gitDir,common,String(info.dev),String(info.ino),String(gitInfo.dev),String(gitInfo.ino),String(commonInfo.dev),String(commonInfo.ino)]));
 const branch=projection?(await git(canonical,['rev-parse','--abbrev-ref','HEAD'],signal)).trim():'';
 const tree=projection?await git(canonical,['ls-tree','-r','-z','HEAD'],signal):'';
 const index=await git(canonical,['ls-files','--stage','-z'],signal);
 const untracked=await git(canonical,['ls-files','--others','--exclude-standard','-z'],signal);
 const ignored=await git(canonical,['ls-files','--others','--ignored','--exclude-standard','--directory','-z'],signal);
 const files=new Map<string,boolean>();
 for(const entry of index.split('\0').filter(Boolean)){
  const match=/^(\d{6}) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([0-3])\t([\s\S]+)$/.exec(entry);if(!match)fail('READ_FAILED');
  if(match[1]==='160000')fail('SUBMODULE_UNSUPPORTED');if(!['100644','100755','120000'].includes(match[1]))fail('READ_FAILED');files.set(match[4],true);
 }
 for(const path of untracked.split('\0').filter(Boolean))if(!files.has(path))files.set(path,false);
 const sensitive=[...files.keys()].filter(sensitivePath);if(sensitive.length)throw new CaptureFault('SENSITIVE_EXCLUDED',[{reason:'SENSITIVE_EXCLUDED',count:sensitive.length}]);
 if(files.size>maxFiles)fail('LIMIT_EXCEEDED');
 return {head,index,untracked,ignored,bindingDigest,branch,tree,files:[...files].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,tracked])=>({path,tracked}))};
}
/** Check every existing component, including parent directories, before reading file content. */
async function safePath(root:string,path:string):Promise<{absolute:string;info:Awaited<ReturnType<typeof stat>>|null}>{
 const absolute=resolve(root,path);const rel=relative(root,absolute);
 if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('READ_FAILED');
 const parts=rel.split(sep);let current=root;
 for(const [index,part] of parts.entries()){
  current=resolve(current,part);let info:Awaited<ReturnType<typeof stat>>;
  try{info=await stat(current);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {absolute,info:null};throw error;}
  if(info.isSymbolicLink()){
   // lstat() preserves the link itself on Windows, where junctions otherwise
   // appear as directories. Resolve only to classify the boundary; never read
   // through the link while checking a tracked descendant.
   let resolved:string;
   try{resolved=await realpath(current);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')fail('READ_FAILED');throw error;}
   if(!inside(root,resolved))fail('SYMLINK_OUTSIDE');
   if(index<parts.length-1)fail('SYMLINK_UNSUPPORTED');
  }
  if(index<parts.length-1&&!info.isDirectory()&&!info.isSymbolicLink())fail('READ_FAILED');
  if(index===parts.length-1)return {absolute,info};
 }
 fail('READ_FAILED');
}
export async function readSnapshot(binding:WorkspaceBinding,limits:{maxFiles:number;maxBytes:number},signal:AbortSignal,projection=false){
 const before=await inventory(binding,limits.maxFiles,signal,projection);const root=await realpath(binding.canonicalRoot);
 const changed=new Set<string>();const indexed=new Map<string,{mode:string;oid:string}>();
 if(projection){
  const committed=new Map<string,{mode:string;oid:string}>();
  for(const entry of before.tree.split('\0').filter(Boolean)){
   const match=/^(\d{6}) (?:blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);if(!match)fail('READ_FAILED');
   committed.set(match[3],{mode:match[1],oid:match[2]});
  }
  for(const entry of before.index.split('\0').filter(Boolean)){
   const match=/^(\d{6}) ([a-f0-9]+) ([0-3])\t([\s\S]+)$/.exec(entry)!;
   indexed.set(match[4],{mode:match[1],oid:match[2]});
   const original=committed.get(match[4]);if(match[3]!=='0'||original?.mode!==match[1]||original?.oid!==match[2])changed.add(match[4]);
  }
  for(const path of committed.keys())if(!indexed.has(path))changed.add(path);
 }
 const digest=createHash('sha256');const field=(value:string|Buffer)=>{digest.update(String(Buffer.byteLength(value))).update(':').update(value);};
 field(WORKSPACE_ALGORITHM);field(WORKSPACE_POLICY);field(before.head);field(before.index);field(before.untracked);
 let bytes=0;const observations=new Map<string,string|null>();
 for(const file of before.files){
  signal.throwIfAborted();const {absolute,info}=await safePath(root,file.path);field(file.path);
  if(!info){if(!file.tracked)fail('RACED');field('deleted');changed.add(file.path);observations.set(file.path,null);continue;}
  if(info.isSymbolicLink()){
   const link=await readlink(absolute,{encoding:'buffer'});const text=link.toString('utf8');if(!Buffer.from(text).equals(link))fail('PATH_ENCODING_UNSUPPORTED');
   const target=resolve(dirname(absolute),text),rel=relative(root,target);
   if(!inside(root,target))fail('SYMLINK_OUTSIDE');
   // A dangling link has no realpath; retain the existing policy of hashing
   // its link text as long as its lexical target remains inside the workspace.
   try{if(!inside(root,await realpath(absolute)))fail('SYMLINK_OUTSIDE');}
   catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
   if(rel){const checked=await safePath(root,rel);if(checked.info?.isSymbolicLink())fail('SYMLINK_UNSUPPORTED');}
   bytes+=link.length;if(bytes>limits.maxBytes)fail('LIMIT_EXCEEDED');
   field('symlink');field(link);observations.set(file.path,signature(info));
   if(projection){const entry=indexed.get(file.path);const oid=createHash(before.head.length===40?'sha1':'sha256').update(`blob ${link.length}\0`).update(link).digest('hex');if(entry?.mode!=='120000'||entry.oid!==oid)changed.add(file.path);}
   continue;
  }
  if(!info.isFile())fail('READ_FAILED');bytes+=Number(info.size);if(bytes>limits.maxBytes)fail('LIMIT_EXCEEDED');
  const handle=await open(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
   const opened=await handle.stat({bigint:true});if(!opened.isFile()||signature(opened)!==signature(info))fail('RACED');
   // Check resolved ancestors again after opening, before any content read.
   if(await realpath(absolute)!==absolute)fail('READ_FAILED');
   field((info.mode&0o111n)?'executable':'file');field(String(info.size));
   const buffer=Buffer.alloc(64*1024);let offset=0;const content=createHash('sha256');
   const blob=projection?createHash(before.head.length===40?'sha1':'sha256').update(`blob ${info.size}\0`):null;
   while(offset<Number(info.size)){
    signal.throwIfAborted();const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,Number(info.size)-offset),offset);if(!bytesRead)fail('RACED');content.update(buffer.subarray(0,bytesRead));blob?.update(buffer.subarray(0,bytesRead));offset+=bytesRead;
   }
   if(signature(await handle.stat({bigint:true}))!==signature(opened))fail('RACED');
   if(blob){const entry=indexed.get(file.path);if(!entry||entry.oid!==blob.digest('hex')||(process.platform!=='win32'&&entry.mode!==((info.mode&0o111n)?'100755':'100644')))changed.add(file.path);}
   field(content.digest('hex'));observations.set(file.path,signature(info));
  }finally{await handle.close();}
 }
 const after=await inventory(binding,limits.maxFiles,signal,projection);
 if(before.branch!==after.branch||before.tree!==after.tree||before.head!==after.head||before.index!==after.index||before.untracked!==after.untracked||before.ignored!==after.ignored||before.bindingDigest!==after.bindingDigest)fail('RACED');
 for(const [path,observed] of observations){signal.throwIfAborted();const {info}=await safePath(root,path);if((info?signature(info):null)!==observed)fail('RACED');}
 const value=digest.digest('hex');
 const state:GitState|null=projection&&before.head.length===40?{root,branch:before.branch,head:before.head,dirty:changed.size>0,dirty_diff_hash:value,changed_files:[...changed].sort(),...(before.branch==='HEAD'?{detached:true}:{})}:null;
 return {head:before.head,bindingDigest:before.bindingDigest,digest:value,omissions:before.ignored?[{reason:'GIT_IGNORED' as const,count:before.ignored.split('\0').filter(Boolean).length}]:[],git:state};
}
