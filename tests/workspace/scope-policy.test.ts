import { afterEach,expect,it,vi } from 'vitest';
const reads=vi.hoisted(()=>({paths:[] as string[]}));
vi.mock('node:fs/promises',async()=>{
 const real=await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
 return {...real,open:async(...args:Parameters<typeof real.open>)=>{reads.paths.push(String(args[0]));return real.open(...args);}};
});
import { mkdir, realpath,rm,symlink,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { git,project,temporary } from '../helpers.js';
import { captureWorkspace } from '../../src/workspace/snapshot.js';
import { compareWorkspaceSnapshots } from '../../src/workspace/verify.js';
import { fixture } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
afterEach(()=>{reads.paths=[];});
it.each(['.env','.env.local','credentials.json','server.key','.npmrc'])('does not open sensitive %s even when tracked by Git',async name=>{
 const root=await realpath(await project());await writeFile(join(root,name),'SYNTHETIC_PRIVATE_CONTENT');git(root,'add','--',name);reads.paths=[];
 const snapshot=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:root});
 expect(snapshot).toMatchObject({algorithm:'threadport.workspace.raw.v2',policy:'threadport.workspace.scope.v1',digest:null,incompleteReasons:['SENSITIVE_EXCLUDED']});
 expect(reads.paths).not.toContain(join(root,name));expect(JSON.stringify(snapshot)).not.toContain('SYNTHETIC_PRIVATE_CONTENT');
},30000);
it('reports ignored data as outside the declared policy without reading it',async()=>{
 const root=await realpath(await project());await writeFile(join(root,'.gitignore'),'.env\n');await writeFile(join(root,'.env'),'SYNTHETIC_PRIVATE_CONTENT');reads.paths=[];
 const snapshot=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:root});
 expect(snapshot.digest).not.toBeNull();expect(snapshot.omissions).toContainEqual({reason:'GIT_IGNORED',count:1});expect(reads.paths).not.toContain(join(root,'.env'));
 const legacy={...snapshot,algorithm:'threadport.workspace.raw.v1' as const,policy:undefined,omissions:undefined};
 expect(compareWorkspaceSnapshots(legacy,snapshot)).toMatchObject({status:'unverifiable',reasons:[{code:'SCOPE_CHANGED'}]});
},30000);
it('hashes internal link text and rejects external links without reading their targets',async()=>{
 const root=await realpath(await project()),outside=await temporary();const target=join(outside,'outside.txt');await writeFile(target,'SYNTHETIC_PRIVATE_CONTENT');
 await symlink('README.md',join(root,'inside'),'file');const binding={id:'w',projectId:'p',canonicalRoot:root};
 expect((await captureWorkspace(binding)).digest).not.toBeNull();
 await symlink(target,join(root,'outside'),'file');reads.paths=[];
 expect(await captureWorkspace(binding)).toMatchObject({digest:null,incompleteReasons:['SYMLINK_OUTSIDE']});expect(reads.paths).not.toContain(target);expect(reads.paths).not.toContain(join(root,'outside'));
},30000);
it('retains a dangling internal leaf link as link metadata',async()=>{
 const root=await realpath(await project());await symlink('missing.txt',join(root,'dangling'),'file');
 const snapshot=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:root});
 expect(snapshot.digest).not.toBeNull();expect(snapshot.incompleteReasons).toEqual([]);
 expect(reads.paths).not.toContain(join(root,'missing.txt'));
},30000);
it('classifies an external directory link before opening tracked descendants',async()=>{
 const root=await realpath(await project()),outside=await temporary();
 await mkdir(join(root,'linked'));await writeFile(join(root,'linked','tracked.txt'),'SYNTHETIC_PRIVATE_CONTENT');git(root,'add','.');git(root,'commit','-m','linked');
 await rm(join(root,'linked'),{recursive:true});await writeFile(join(outside,'tracked.txt'),'outside');
 await symlink(outside,join(root,'linked'),process.platform==='win32'?'junction':'dir');reads.paths=[];
 const snapshot=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:root});
 expect(snapshot).toMatchObject({digest:null,incompleteReasons:['SYMLINK_OUTSIDE']});
 expect(reads.paths).not.toContain(join(root,'linked','tracked.txt'));expect(reads.paths).not.toContain(join(outside,'tracked.txt'));
},30000);
it('blocks prepare when sensitive untracked data would make the capture incomplete',async()=>{
 const f=await fixture();try{
  await writeFile(join(f.root,'.env'),'SYNTHETIC_PRIVATE_CONTENT');reads.paths=[];
  await expect(new HandoffService(f.store).prepareHandoff(f.input)).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(reads.paths).not.toContain(join(f.root,'.env'));
 }finally{f.store.close();}
},30000);

it('classifies submodules and non-UTF8 paths without claiming complete coverage',async()=>{
 const root=await realpath(await project());const binding={id:'w',projectId:'p',canonicalRoot:root};
 const head=git(root,'rev-parse','HEAD').trim();git(root,'update-index','--add','--cacheinfo',`160000,${head},module`);
 expect(await captureWorkspace(binding)).toMatchObject({digest:null,incompleteReasons:['SUBMODULE_UNSUPPORTED']});
 git(root,'update-index','--force-remove','module');
 {
  const oid=git(root,'rev-parse','HEAD:README.md').trim();
  execFileSync('git',['-C',root,'update-index','-z','--index-info'],{input:Buffer.concat([Buffer.from(`100644 ${oid}\t`),Buffer.from([0xff,0])])});reads.paths=[];
  expect(await captureWorkspace(binding)).toMatchObject({digest:null,incompleteReasons:['PATH_ENCODING_UNSUPPORTED']});expect(reads.paths).toEqual([]);
 }
},30000);
