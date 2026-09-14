import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { captureWorkspace, verifyWorkspace } from '../../src/workspace/index.js';
const roots:string[]=[];
const git=(root:string,...args:string[])=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function repo(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'threadport-verify-')));roots.push(root);
 git(root,'init','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await writeFile(join(root,'a.txt'),'original');git(root,'add','.');git(root,'commit','-m','initial');
 return{id:'workspace',projectId:'project',canonicalRoot:root};
}
it('matches a complete snapshot through an explicit binding without altering it',async()=>{
 const workspace=await repo();const snapshot=await captureWorkspace(workspace);const before=JSON.stringify(snapshot);
 expect(await verifyWorkspace(snapshot,workspace)).toMatchObject({status:'matched',snapshotId:snapshot.id,workspaceId:workspace.id,scope:snapshot.scope,reasons:[]});
 expect(JSON.stringify(snapshot)).toBe(before);expect(JSON.stringify(snapshot)).not.toContain(workspace.canonicalRoot);
},30000);
it('detects tracked, untracked, deletion, rename and index changes',async()=>{
 const workspace=await repo();const snapshot=await captureWorkspace(workspace);const root=workspace.canonicalRoot;
 for(const mutate of [()=>writeFile(join(root,'a.txt'),'changed'),()=>writeFile(join(root,'new.txt'),'new'),()=>rm(join(root,'a.txt')),()=>rename(join(root,'a.txt'),join(root,'renamed.txt')),async()=>{await writeFile(join(root,'a.txt'),'staged');git(root,'add','.');await writeFile(join(root,'a.txt'),'original');}]){
  git(root,'reset','--hard','HEAD');git(root,'clean','-fd');await mutate();
  expect(await verifyWorkspace(snapshot,workspace)).toMatchObject({status:'drifted',reasons:[{code:'CONTENT_CHANGED'}]});
 }
},30000);
it('reports HEAD drift without claiming that an empty commit changed file content',async()=>{
 const workspace=await repo();const snapshot=await captureWorkspace(workspace);git(workspace.canonicalRoot,'commit','--allow-empty','-m','empty');
 expect(await verifyWorkspace(snapshot,workspace)).toMatchObject({status:'drifted',reasons:[{code:'HEAD_CHANGED'}]});
},30000);
it('rejects absent, relative, mismatched and wrong physical bindings',async()=>{
 const workspace=await repo();const snapshot=await captureWorkspace(workspace);const other=await repo();
 for(const binding of [null,{...workspace,id:'other'},{...workspace,canonicalRoot:'.'},other,{...workspace,projectId:'other'}]){
  expect(await verifyWorkspace(snapshot,binding)).toMatchObject({status:'unverifiable',reasons:[{code:'WORKSPACE_UNBOUND'}]});
 }
},30000);
it('keeps missing sources, limits and incomplete historical scope unverifiable',async()=>{
 const workspace=await repo();const snapshot=await captureWorkspace(workspace);
 expect(await verifyWorkspace(snapshot,workspace,{limits:{maxBytes:1}})).toMatchObject({status:'unverifiable',reasons:[{code:'LIMIT_EXCEEDED'}]});
 const incomplete=await captureWorkspace(workspace,{limits:{maxBytes:1}});
 git(workspace.canonicalRoot,'commit','--allow-empty','-m','changed');
 expect((await verifyWorkspace(incomplete,workspace)).status).toBe('unverifiable');
 await rm(workspace.canonicalRoot,{recursive:true,force:true});
 expect(await verifyWorkspace(snapshot,workspace)).toMatchObject({status:'unverifiable',reasons:[{code:'SOURCE_MISSING'}]});
},30000);
it('validates input and propagates explicit cancellation',async()=>{
 const workspace=await repo();const snapshot=await captureWorkspace(workspace);
 await expect(verifyWorkspace({...snapshot,scope:'unknown'} as never,workspace)).rejects.toMatchObject({code:'INVALID_INPUT'});
 await expect(verifyWorkspace(snapshot,workspace,{signal:AbortSignal.abort()})).rejects.toBeDefined();
},30000);

it('does not accept another worktree with identical content',async()=>{
 const workspace=await repo();const snapshot=await captureWorkspace(workspace);
 const linked=workspace.canonicalRoot+'-linked';roots.push(linked);
 git(workspace.canonicalRoot,'worktree','add','--detach',linked,'HEAD');
 const binding={...workspace,canonicalRoot:await realpath(linked)};
 expect((await captureWorkspace(binding)).digest).toBe(snapshot.digest);
 expect(await verifyWorkspace(snapshot,binding)).toMatchObject({status:'unverifiable',reasons:[{code:'WORKSPACE_UNBOUND'}]});
},30000);
