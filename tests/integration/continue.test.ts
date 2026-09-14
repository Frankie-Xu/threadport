import { expect,it } from 'vitest';
import { execFile,spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { writeFile,readFile,access } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { recordDigest } from '../../src/storage/handoff-store.js';
import { runProcess } from '../../src/platform/process.js';
const execute=promisify(execFile);
const storeUrl=pathToFileURL(resolve('dist/src/storage/sqlite-store.js')).href;
const cli=resolve('dist/src/cli.js');
it('rejects non-TTY and --yes before creating a requested data directory',async()=>{
 const f=await fixture();try{const destination=join(f.dataDir,'must-not-exist');
 for(const extra of [[],['--yes']]){const result=await execute(process.execPath,[cli,'continue','--handoff','11111111-1111-4111-8111-111111111111','--data-dir',destination,...extra]).catch(error=>error);expect(result.code).toBe(2);}
 await expect(access(destination)).rejects.toThrow();
 }finally{f.store.close();}
},30000);
it('allows only one of two independent processes to claim and execute a handoff',async()=>{
 const f=await fixture();try{const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);await service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:true});const digest=recordDigest(f.store.handoffStore().read(h.id).record);const marker=join(f.dataDir,'executions');
 const code=`import {openStore} from ${JSON.stringify(storeUrl)};import {appendFileSync} from 'node:fs';const store=await openStore({dataDir:process.argv[1]});try{const attempt=store.launchStore().claim(process.argv[2],process.argv[3]);appendFileSync(process.argv[4],'executed\\n');store.launchStore().finish(process.argv[2],attempt,{status:'exited',exitCode:0,errorCode:null});}catch(error){process.exitCode=error.code==='REVISION_CONFLICT'?4:5;}finally{store.close();}`;
 const launch=()=>execute(process.execPath,['--input-type=module','-e',code,f.dataDir,h.id,digest,marker]).then(()=>0,error=>error.code);
 expect((await Promise.all([launch(),launch()])).sort()).toEqual([0,4]);expect(await readFile(marker,'utf8')).toBe('executed\n');expect(service.get(h.id).attempts).toHaveLength(1);
 }finally{f.store.close();}
},30000);
it('recovers a lost launcher as interrupted without allowing automatic retry',async()=>{
 const f=await fixture();try{const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);await service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:true});const digest=recordDigest(f.store.handoffStore().read(h.id).record);
 const code=`import {openStore} from ${JSON.stringify(storeUrl)};const store=await openStore({dataDir:process.argv[1]});store.launchStore().claim(process.argv[2],process.argv[3]);process.stdout.write('claimed\\n');setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',code,f.dataDir,h.id,digest],{stdio:['ignore','pipe','pipe']});
 try{await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Claim worker exited before readiness');})]);expect(service.get(h.id).state).toBe('launching');const exited=once(child,'exit');child.kill('SIGKILL');await exited;expect(service.get(h.id).state).toBe('interrupted');expect(service.get(h.id).attempts[0].errorCode).toBe('OWNER_LOST');expect(()=>f.store.launchStore().claim(h.id,digest)).toThrow();}finally{child.kill('SIGKILL');}
 }finally{f.store.close();}
},30000);
it('records real child exit, spawn failure and cancellation outcomes without a shell',async()=>{
 const f=await fixture();try{const spec={executable:process.execPath,args:['-e','process.exit(7)'],cwd:f.root,input:{kind:'argv' as const,value:''}};
 expect(await runProcess(spec)).toEqual({status:'failed',exitCode:7,errorCode:'TARGET_EXIT_7'});
 expect(await runProcess({...spec,executable:join(f.root,'missing-executable')})).toEqual({status:'failed',exitCode:5,errorCode:'SPAWN_FAILED'});
 const abort=new AbortController();const run=runProcess({...spec,args:['-e','setInterval(()=>{},1000)']},abort.signal);const timer=setTimeout(()=>abort.abort(),100);try{expect(await run).toMatchObject({status:'cancelled',errorCode:'SIGINT'});}finally{clearTimeout(timer);}
 }finally{f.store.close();}
},30000);
