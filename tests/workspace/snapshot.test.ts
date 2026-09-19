import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, symlink, realpath, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureWorkspace, SnapshotService } from '../../src/workspace/index.js';
import { openStore } from '../../src/storage/sqlite-store.js';
const dirs:string[]=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
// Each integration case performs several bounded captures and real Git processes.
const git=(root:string,...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function temp(){const dir=await realpath(await mkdtemp(join(tmpdir(),'tp-snapshot-')));dirs.push(dir);return dir;}
async function repo(){const root=await temp();git(root,'init','-b','main');git(root,'config','user.email','synthetic@example.com');git(root,'config','user.name','Synthetic');await writeFile(join(root,'a.txt'),'initial');git(root,'add','.');git(root,'commit','-m','initial');return {root,binding:{id:'w',projectId:'p',canonicalRoot:root}};}
it('captures immutable current snapshots, distinguishes index/worktree/HEAD and persists without source writes',async()=>{
 const {root,binding}=await repo();const before=git(root,'status','--porcelain');const clean=await captureWorkspace(binding);expect(clean.incompleteReasons).toEqual([]);expect(clean.digest).toMatch(/^[a-f0-9]{64}$/);expect((await captureWorkspace(binding)).digest).toBe(clean.digest);
 await writeFile(join(root,'a.txt'),'one');git(root,'add','.');await writeFile(join(root,'a.txt'),'same');const a=await captureWorkspace(binding);
 await writeFile(join(root,'a.txt'),'two');git(root,'add','.');await writeFile(join(root,'a.txt'),'same');const b=await captureWorkspace(binding);expect(b.digest).not.toBe(a.digest);
 await writeFile(join(root,'new.txt'),'untracked');expect((await captureWorkspace(binding)).digest).not.toBe(b.digest);
 git(root,'add','.');git(root,'commit','-m','new');const next=await captureWorkspace(binding);expect(next.head).not.toBe(clean.head);git(root,'checkout','--detach');expect((await captureWorkspace(binding)).digest).toBe(next.digest);
 const data=await temp();const store=await openStore({dataDir:data});try{store.createProject('p','P');store.createWorkspace('w','p',root);const snapshot=await new SnapshotService(store).capture('w');expect(store.getSnapshot(snapshot.id)).toEqual(snapshot);store.saveSnapshot(snapshot);expect(()=>store.saveSnapshot({...snapshot,digest:'a'.repeat(64)})).toThrow();expect(store.getSnapshot(snapshot.id)).toEqual(snapshot);}finally{store.close();}
 expect(git(root,'status','--porcelain')).toBe(before);expect(await readFile(join(root,'a.txt'),'utf8')).toBe('same');
},30000);
it('returns incomplete reasons for no repository, missing root, no commit, symlinks and limits',async()=>{
 const root=await temp();const binding={id:'w',projectId:'p',canonicalRoot:root};expect((await captureWorkspace(binding)).incompleteReasons).toContain('NO_GIT');
 expect((await captureWorkspace({...binding,canonicalRoot:join(root,'missing')})).incompleteReasons).toContain('SOURCE_MISSING');git(root,'init','-b','main');expect((await captureWorkspace(binding)).incompleteReasons).toContain('NO_COMMIT');
 const repoState=await repo();await writeFile(join(repoState.root,'extra'),'123456');const limited=await captureWorkspace(repoState.binding,{limits:{maxBytes:2}});expect(limited).toMatchObject({digest:null,incompleteReasons:['LIMIT_EXCEEDED']});
 await symlink(join(repoState.root,'a.txt'),join(repoState.root,'link'),'file');expect((await captureWorkspace(repoState.binding)).incompleteReasons).toEqual([]);
 await mkdir(join(repoState.root,'child'));expect((await captureWorkspace({...repoState.binding,canonicalRoot:join(repoState.root,'child')})).incompleteReasons).toContain('WORKSPACE_UNBOUND');
},30000);
it('cancels without creating a stored snapshot',async()=>{
 const {root}=await repo();const store=await openStore({dataDir:await temp()});try{store.createProject('p','P');store.createWorkspace('w','p',root);const controller=new AbortController();controller.abort();await expect(new SnapshotService(store).capture('w',{signal:controller.signal})).rejects.toBeDefined();}finally{store.close();}
},30000);
it('never runs configured filters or fsmonitor hooks and ignores inherited Git redirection',async()=>{
 const {root,binding}=await repo();const other=await repo();const marker=join(root,'executed-marker');
 git(root,'config','filter.danger.clean','touch executed-marker');git(root,'config','filter.danger.process','touch executed-marker');git(root,'config','core.fsmonitor','touch executed-marker');git(root,'config','diff.external','touch executed-marker');
 await writeFile(join(root,'.gitattributes'),'a.txt filter=danger diff=danger\n');git(root,'config','diff.danger.textconv','touch executed-marker');await writeFile(join(root,'a.txt'),'changed');
 vi.stubEnv('GIT_DIR',join(other.root,'.git'));vi.stubEnv('GIT_WORK_TREE',other.root);
 const snapshot=await captureWorkspace(binding);expect(snapshot.incompleteReasons).toEqual([]);await expect(readFile(marker)).rejects.toMatchObject({code:'ENOENT'});
},30000);
it('captures deletion and rename changes and enforces file count and input budgets',async()=>{
 const {root,binding}=await repo();const initial=await captureWorkspace(binding);git(root,'mv','a.txt','renamed.txt');const renamed=await captureWorkspace(binding);expect(renamed.digest).not.toBe(initial.digest);
 await rm(join(root,'renamed.txt'));const deleted=await captureWorkspace(binding);expect(deleted.incompleteReasons).toEqual([]);expect(deleted.digest).not.toBe(renamed.digest);
 await writeFile(join(root,'new'),'extra');expect((await captureWorkspace(binding,{limits:{maxFiles:1}})).incompleteReasons).toContain('LIMIT_EXCEEDED');
 await expect(captureWorkspace(binding,{limits:{maxFiles:10001}})).rejects.toMatchObject({code:'INVALID_INPUT'});
},30000);
it('rejects stale workspace bindings and preserves snapshots across reopen',async()=>{
 const {root}=await repo();const dataDir=await temp();let store=await openStore({dataDir});
 try{store.createProject('p','P');store.createWorkspace('w','p',root);const service=new SnapshotService(store);const snapshot=await service.capture('w');
  expect(()=>store.saveSnapshot({...snapshot,id:'other'},{id:'w',projectId:'p',canonicalRoot:join(root,'wrong')})).toThrowError(expect.objectContaining({code:'REVISION_CONFLICT'}));expect(store.getSnapshot('other')).toBeNull();
  store.close();store=await openStore({dataDir});expect(store.getSnapshot(snapshot.id)).toEqual(snapshot);
  await expect(new SnapshotService(store).capture('missing')).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(()=>store.saveSnapshot({...snapshot,id:'bad',incompleteReasons:['RACED']})).toThrowError(expect.objectContaining({code:'INVALID_INPUT'}));
 }finally{store.close();}
},30000);
it('distinguishes linked worktree identity and classifies external directory links',async()=>{
 const {root,binding}=await repo();const other=await temp();const worktree=join(other,'linked');git(root,'worktree','add','--detach',worktree,'HEAD');
 const original=await captureWorkspace(binding);const linked=await captureWorkspace({...binding,canonicalRoot:worktree});expect(linked.incompleteReasons).toEqual([]);expect(linked.bindingDigest).not.toBe(original.bindingDigest);expect(linked.digest).toBe(original.digest);
 await mkdir(join(root,'nested'));await writeFile(join(root,'nested','file'),'tracked');git(root,'add','.');git(root,'commit','-m','nested');await rm(join(root,'nested'),{recursive:true});
 const outside=await temp();await writeFile(join(outside,'file'),'outside');await symlink(outside,join(root,'nested'),process.platform==='win32'?'junction':'dir');
 expect((await captureWorkspace(binding)).incompleteReasons).toContain('SYMLINK_OUTSIDE');expect(await readFile(join(outside,'file'),'utf8')).toBe('outside');
},30000);
