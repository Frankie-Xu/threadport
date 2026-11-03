import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, lstat, open, readlink, realpath, stat as fileStat } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
type ReadMode = 'snapshot'|'projection'|'legacy';
type GitQuery = (root: string, args: string[]) => Promise<string>;

async function gitReader(signal: AbortSignal, legacy: boolean): Promise<GitQuery> {
 const env={...process.env};
 const pathKey=Object.keys(env).find(key=>process.platform==='win32'?key.toUpperCase()==='PATH':key==='PATH');
 const searchPath=pathKey ? env[pathKey] ?? '' : '/usr/bin:/bin';
 for(const key of Object.keys(env)) {
  if(key.toUpperCase().startsWith('GIT_') || (process.platform==='win32'?key.toUpperCase()==='PATH':key==='PATH')) delete env[key];
 }
 const windows=process.platform==='win32';
 const directories=searchPath.split(delimiter)
  .map(entry=>windows?entry.replace(/^"(.*)"$/,'$1'):entry)
  .filter(entry=>isAbsolute(entry)&&(!windows||/^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(entry)));
 env.PATH=directories.join(delimiter);
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:windows?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_NO_LAZY_FETCH:'1',GIT_ALLOW_PROTOCOL:''});
 // Resolve an explicit executable. Windows can otherwise search the current
 // directory even when PATH itself contains only absolute directories.
 let executable:string|undefined;
 for(const directory of directories){
  signal.throwIfAborted();
  const candidate=join(directory,windows?'git.exe':'git');
  try {
   if(!(await fileStat(candidate)).isFile())continue;
   await access(candidate,constants.X_OK);
   executable=candidate;
   break;
  }catch(error){
   if(!['ENOENT','ENOTDIR','EACCES','EPERM'].includes((error as NodeJS.ErrnoException).code??''))throw error;
  }
 }
 if(!executable)throw new Error('Git executable not found in the absolute PATH entries.');
 const gitPath=executable;
 return async(root,args)=>{
  signal.throwIfAborted();
  try{
   // Older Git interprets "false" as a program name. Empty disables its
   // hook and also disables the built-in monitor in newer Git.
   const result=await execute(gitPath,['--no-optional-locks','-c','core.fsmonitor=','-C',root,...args],{env,encoding:'buffer',maxBuffer:legacy?32*1024*1024:1024*1024,timeout:legacy?30000:5000,signal});
   const text=result.stdout.toString('utf8');
   if(!Buffer.from(text).equals(result.stdout))fail('PATH_ENCODING_UNSUPPORTED');
   return text;
  }catch(error){
   signal.throwIfAborted();
   const e=error as {code?:string;killed?:boolean};
   if(e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'||e.killed)fail('LIMIT_EXCEEDED');
   throw error;
  }
 };
}
interface Repository { root:string; gitDir:string; device:bigint; inode:bigint }
async function discoverRepository(cwd:string,query:GitQuery,signal:AbortSignal):Promise<Repository>{
 let result:string;
 try{result=await query(cwd,['rev-parse','--absolute-git-dir','--show-toplevel']);}
 catch(error){if(error instanceof CaptureFault)throw error;signal.throwIfAborted();fail('NO_GIT');}
 const lines=result.replace(/\r?\n$/,'').split(/\r?\n/);
 if(lines.length!==2||!lines.every(isAbsolute))fail('WORKSPACE_UNBOUND');
 const gitDir=await realpath(lines[0]), root=await realpath(lines[1]);
 const info=await stat(gitDir);
 return {root,gitDir,device:info.dev,inode:info.ino};
}
interface Inventory {
 head:string;index:string;indexTags:string;untracked:string;ignored:string;bindingDigest:string;branch:string;tree:string;
 files:{path:string;tracked:boolean;skipWorktree:boolean}[];
}
async function inventory(binding:WorkspaceBinding,maxFiles:number,signal:AbortSignal,mode:ReadMode,query:GitQuery,expected?:Repository):Promise<Inventory>{
 const legacy=mode==='legacy',projection=mode!=='snapshot';
 const root=binding.canonicalRoot;if(!isAbsolute(root))fail('WORKSPACE_UNBOUND');
 const info=await stat(root);if(info.isSymbolicLink()||!info.isDirectory())fail('WORKSPACE_UNBOUND');
 const canonical=await realpath(root);
 const repository=await discoverRepository(canonical,query,signal);
 if(repository.root!==canonical||expected&&(repository.gitDir!==expected.gitDir||repository.device!==expected.device||repository.inode!==expected.inode))fail('WORKSPACE_UNBOUND');
 // After discovery, pin both paths for every inventory command. Local
 // core.worktree cannot change the repository between those commands.
 const read=(args:string[])=>query(canonical,[`--git-dir=${repository.gitDir}`,`--work-tree=${canonical}`,...args]);
 let head:string;try{head=(await read(['rev-parse','--verify','HEAD^{commit}'])).trim();}catch(error){if(error instanceof CaptureFault)throw error;signal.throwIfAborted();fail('NO_COMMIT');}
 if(!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(head))fail('READ_FAILED');
 const common=await realpath(resolve(canonical,(await read(['rev-parse','--git-common-dir'])).replace(/\r?\n$/,'')));
 const commonInfo=await stat(common);
 const bindingDigest=hash(JSON.stringify([binding.id,binding.projectId,canonical,repository.gitDir,common,String(info.dev),String(info.ino),String(repository.device),String(repository.inode),String(commonInfo.dev),String(commonInfo.ino)]));
 const branch=projection?(await read(['rev-parse','--abbrev-ref','HEAD'])).trim():'';
 const tree=projection?await read(['ls-tree','-r','-z','HEAD']):'';
 const indexTags=await read(['ls-files','--stage','-z',...(legacy?['-t']:[])]);
 const entries=indexTags.split('\0').filter(Boolean);
 const index=legacy?entries.map(entry=>entry.slice(2)+'\0').join(''):indexTags;
 const untracked=await read(['ls-files','--others','--exclude-standard','-z']);
 const ignored=legacy?'':await read(['ls-files','--others','--ignored','--exclude-standard','--directory','-z']);
 const files=new Map<string,{tracked:boolean;skipWorktree:boolean}>();
 for(const entry of entries){
  const row=legacy?entry.slice(2):entry;
  const match=/^(\d{6}) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([0-3])\t([\s\S]+)$/.exec(row);if(!match)fail('READ_FAILED');
  if(match[1]==='160000')fail('SUBMODULE_UNSUPPORTED');
  if(!['100644','100755','120000'].includes(match[1]))fail('READ_FAILED');
  files.set(match[4],{tracked:true,skipWorktree:legacy&&entry.startsWith('S ')&&match[3]==='0'});
 }
 for(const path of untracked.split('\0').filter(Boolean))if(!files.has(path))files.set(path,{tracked:false,skipWorktree:false});
 const sensitive=legacy?[]:[...files.keys()].filter(sensitivePath);if(sensitive.length)throw new CaptureFault('SENSITIVE_EXCLUDED',[{reason:'SENSITIVE_EXCLUDED',count:sensitive.length}]);
 if(files.size>maxFiles)fail('LIMIT_EXCEEDED');
 return {head,index,indexTags,untracked,ignored,bindingDigest,branch,tree,files:[...files].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,file])=>({path,...file}))};
}
/** Check every existing component, including parent directories, before reading file content. */
async function safePath(root:string,path:string,legacy:boolean):Promise<{absolute:string;info:Awaited<ReturnType<typeof stat>>|null}>{
 const absolute=resolve(root,path);const rel=relative(root,absolute);
 if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('READ_FAILED');
 const parts=rel.split(sep);let current=root;
 for(const [index,part] of parts.entries()){
  current=resolve(current,part);let info:Awaited<ReturnType<typeof stat>>;
  try{info=await stat(current);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {absolute,info:null};throw error;}
  if(info.isSymbolicLink()){
   if(legacy)return {absolute,info:index===parts.length-1?info:null};
   // lstat() preserves the link itself on Windows, where junctions otherwise
   // appear as directories. Resolve only to classify the boundary; never read
   // through the link while checking a tracked descendant.
   let resolved:string;
   try{resolved=await realpath(current);}catch(error){
    // A dangling leaf link is still safely representable by its link text;
    // descendants cannot be traversed without resolving the ancestor.
    if((error as NodeJS.ErrnoException).code==='ENOENT'&&index===parts.length-1)return {absolute,info};
    if((error as NodeJS.ErrnoException).code==='ENOENT')fail('READ_FAILED');
    throw error;
   }
   if(!inside(root,resolved))fail('SYMLINK_OUTSIDE');
   if(index<parts.length-1)fail('SYMLINK_UNSUPPORTED');
  }
  if(index<parts.length-1&&!info.isDirectory()&&!info.isSymbolicLink()){if(legacy)return {absolute,info:null};fail('READ_FAILED');}
  if(legacy&&info.isDirectory()&&index===parts.length-1)return {absolute,info:null};
  if(index===parts.length-1)return {absolute,info};
 }
 fail('READ_FAILED');
}
export async function readLegacyGitState(cwd:string):Promise<GitState>{
 const signal=AbortSignal.timeout(30000);
 const query=await gitReader(signal,true);
 const input=await realpath(cwd);
 const repository=await discoverRepository(input,query,signal);
 if(!inside(repository.root,input))fail('WORKSPACE_UNBOUND');
 const {git:state}=await readTree({id:'legacy',projectId:'legacy',canonicalRoot:repository.root},{maxFiles:Number.MAX_SAFE_INTEGER,maxBytes:256*1024*1024},signal,'legacy',query,repository);
 if(!state)fail('READ_FAILED');
 return state;
}
export async function readSnapshot(binding:WorkspaceBinding,limits:{maxFiles:number;maxBytes:number},signal:AbortSignal,projection=false){
 return readTree(binding,limits,signal,projection?'projection':'snapshot',await gitReader(signal,false));
}
async function readTree(binding:WorkspaceBinding,limits:{maxFiles:number;maxBytes:number},signal:AbortSignal,mode:ReadMode,query:GitQuery,expected?:Repository){
 const legacy=mode==='legacy',projection=mode!=='snapshot';
 const before=await inventory(binding,limits.maxFiles,signal,mode,query,expected);const root=await realpath(binding.canonicalRoot);
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
 if(legacy)field('threadport.git.index-worktree.raw.v3');else{field(WORKSPACE_ALGORITHM);field(WORKSPACE_POLICY);}field(before.head);field(before.index);field(before.untracked);
 let bytes=0,untrackedBytes=0;const observations=new Map<string,string|null>();
 for(const file of before.files){
  signal.throwIfAborted();const {absolute,info}=await safePath(root,file.path,legacy);field(file.path);
  if(!info){
   if(!file.tracked)fail('RACED');
   // A missing skip-worktree path is the expected checkout shape. Index
   // changes are already accounted for, and present paths are still read.
   field(file.skipWorktree?'sparse-omitted':'deleted');
   if(!file.skipWorktree)changed.add(file.path);
   observations.set(file.path,null);
   continue;
  }
  if(info.isSymbolicLink()){
   const link=await readlink(absolute,{encoding:'buffer'});const text=link.toString('utf8');if(!Buffer.from(text).equals(link))fail('PATH_ENCODING_UNSUPPORTED');
   if(!legacy){
    const target=resolve(dirname(absolute),text),rel=relative(root,target);
    if(!inside(root,target))fail('SYMLINK_OUTSIDE');
    // A dangling link has no realpath; retain the existing policy of hashing
    // its link text as long as its lexical target remains inside the workspace.
    try{if(!inside(root,await realpath(absolute)))fail('SYMLINK_OUTSIDE');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(rel){const checked=await safePath(root,rel,legacy);if(checked.info?.isSymbolicLink())fail('SYMLINK_UNSUPPORTED');}
   }
   bytes+=link.length;if(bytes>limits.maxBytes)fail('LIMIT_EXCEEDED');
   field('symlink');field(link);observations.set(file.path,signature(info));
   if(projection){const entry=indexed.get(file.path);const oid=createHash(before.head.length===40?'sha1':'sha256').update(`blob ${link.length}\0`).update(link).digest('hex');if(entry?.mode!=='120000'||entry.oid!==oid)changed.add(file.path);}
   continue;
  }
  if(!info.isFile())fail('READ_FAILED');bytes+=Number(info.size);if(legacy&&!file.tracked)untrackedBytes+=Number(info.size);if(bytes>limits.maxBytes||untrackedBytes>64*1024*1024)fail('LIMIT_EXCEEDED');
  const handle=await open(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
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
 const after=await inventory(binding,limits.maxFiles,signal,mode,query,expected);
 if(before.branch!==after.branch||before.tree!==after.tree||before.head!==after.head||before.indexTags!==after.indexTags||before.untracked!==after.untracked||before.ignored!==after.ignored||before.bindingDigest!==after.bindingDigest)fail('RACED');
 for(const [path,observed] of observations){signal.throwIfAborted();const {info}=await safePath(root,path,legacy);if((info?signature(info):null)!==observed)fail('RACED');}
 const value=digest.digest('hex');
 const state:GitState|null=projection&&(legacy||before.head.length===40)?{root,branch:before.branch,head:before.head,dirty:changed.size>0,dirty_diff_hash:value,changed_files:[...changed].sort(),...(before.branch==='HEAD'?{detached:true}:{})}:null;
 return {head:before.head,bindingDigest:before.bindingDigest,digest:value,omissions:before.ignored?[{reason:'GIT_IGNORED' as const,count:before.ignored.split('\0').filter(Boolean).length}]:[],git:state};
}
