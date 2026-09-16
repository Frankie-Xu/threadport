import { EventEmitter } from 'node:events';
import { expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock('node:child_process',()=>({spawn:mocks.spawn}));
import { runProcess } from '../../src/platform/process.js';
const spec={executable:process.execPath,args:[],cwd:process.cwd(),input:{kind:'argv' as const,value:''}};
it('retains uncertainty when a process error occurs after successful spawn',async()=>{
 const child=Object.assign(new EventEmitter(),{pid:123,kill:vi.fn()});mocks.spawn.mockReturnValue(child);
 const result=runProcess(spec);child.emit('spawn');child.emit('error',new Error('synthetic kill failure'));
 expect(await result).toMatchObject({status:'unknown',errorCode:'TARGET_OBSERVATION_FAILED'});
 child.emit('exit',0,null);
});
it('distinguishes an observed spawn failure from a post-spawn error',async()=>{
 const child=Object.assign(new EventEmitter(),{kill:vi.fn()});mocks.spawn.mockReturnValue(child);
 const result=runProcess(spec);child.emit('error',new Error('synthetic ENOENT'));
 expect(await result).toMatchObject({status:'failed',errorCode:'SPAWN_FAILED'});
});
