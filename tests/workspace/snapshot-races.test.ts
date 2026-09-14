import { afterEach, expect, it, vi } from 'vitest';
const fault=vi.hoisted(()=>({mode:'' as ''|'once'|'always'|'denied',reads:0,controller:undefined as AbortController|undefined}));
vi.mock('node:fs/promises',async()=>{
 const actual=await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
 return {...actual,open:vi.fn(async(...args:Parameters<typeof actual.open>)=>{
  if(fault.mode==='denied')throw Object.assign(new Error('synthetic private error'),{code:'EACCES'});
  const handle=await actual.open(...args);const read=handle.read.bind(handle);
  handle.read=async(...readArgs:Parameters<typeof read>)=>{
   const result=await read(...readArgs);fault.reads++;
   if(fault.mode==='always'||fault.mode==='once'&&fault.reads===1)await actual.utimes(String(args[0]),new Date(),new Date(Date.now()+fault.reads*10000));
   fault.controller?.abort();return result;
  };
  return handle;
 })};
});
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureWorkspace } from '../../src/workspace/index.js';
const dirs:string[]=[];
afterEach(async()=>{fault.mode='';fault.reads=0;fault.controller=undefined;for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function setup(){const root=await realpath(await mkdtemp(join(tmpdir(),'tp-snapshot-race-')));dirs.push(root);for(const args of [['init','-b','main'],['config','user.email','synthetic@example.com'],['config','user.name','Synthetic']])execFileSync('git',['-C',root,...args]);await writeFile(join(root,'a'),'content');execFileSync('git',['-C',root,'add','.']);execFileSync('git',['-C',root,'commit','-m','initial']);return{id:'w',projectId:'p',canonicalRoot:root};}
it('retries a detected file metadata race once and succeeds only on a stable attempt',async()=>{const binding=await setup();fault.mode='once';expect((await captureWorkspace(binding)).incompleteReasons).toEqual([]);expect(fault.reads).toBe(2);},15000);
it('stops after two changing attempts and reports RACED without a usable digest',async()=>{const binding=await setup();fault.mode='always';expect(await captureWorkspace(binding)).toMatchObject({digest:null,incompleteReasons:['RACED']});expect(fault.reads).toBe(2);},15000);
it('maps unreadable content to a safe reason and observes cancellation during reads',async()=>{const binding=await setup();fault.mode='denied';expect(await captureWorkspace(binding)).toMatchObject({digest:null,incompleteReasons:['READ_FAILED']});fault.mode='';fault.controller=new AbortController();await expect(captureWorkspace(binding,{signal:fault.controller.signal})).rejects.toBeDefined();},15000);
