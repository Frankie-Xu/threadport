import { EventEmitter } from 'node:events';
import { expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({spawn:vi.fn(),execFileSync:vi.fn(()=> '1\n')}));
vi.mock('node:child_process',()=>({spawn:mocks.spawn,execFileSync:mocks.execFileSync}));
import { runProcess } from '../../src/platform/process.js';
import { observeProcess,processIdentity } from '../../src/platform/process-identity.js';
const spec={executable:process.execPath,args:[],cwd:process.cwd(),input:{kind:'argv' as const,value:''}};
it('captures a stable identity for the current observer',()=>{
 const identity=processIdentity(process.pid);
 expect(identity).toMatchObject({pid:process.pid,platform:process.platform});
 expect(observeProcess(identity)).toBe('same');
 if(process.platform==='win32')expect(identity.start).toMatch(/^\d+$/);
});
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
