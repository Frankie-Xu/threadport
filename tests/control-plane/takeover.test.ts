import { afterEach, describe, expect, it, vi } from 'vitest';
import { TakeoverManager } from '../../src/control-plane/takeover.js';
afterEach(()=>vi.useRealTimers());

describe('takeover state machine',()=>{
 it('validates identities and deadlines before calling controllers or mutating state',async()=>{
  const manager=new TakeoverManager(),requestStop=vi.fn(async()=>true);
  const base={taskId:'t',runId:'r',ownerSessionId:'s',targetSessionId:'s',controller:{requestStop}};
  for(const key of ['taskId','runId','ownerSessionId','targetSessionId'])for(const value of ['','bad/id','x'.repeat(513)])await expect(manager.request({...base,[key]:value})).rejects.toMatchObject({code:'INVALID_INPUT'});
  for(const timeoutMs of [0,-1,1.5,30001,NaN,Infinity])await expect(manager.request({...base,timeoutMs})).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(requestStop).not.toHaveBeenCalled();expect(manager.list()).toEqual([]);
  const record=await manager.request({...base,timeoutMs:30000});
  for(const successor of ['','bad/id','x'.repeat(513)])expect(()=>manager.confirmSuccessor(record.id,successor)).toThrowError(expect.objectContaining({code:'INVALID_INPUT'}));
  expect(manager.get(record.id).status).toBe('stop-confirmed');
 });
 it('cleans timeout handles after fast success, refusal and controller failure',async()=>{
  vi.useFakeTimers();const manager=new TakeoverManager();
  for(const [runId,requestStop] of [['success',async()=>true],['refusal',async()=>false],['failure',async()=>{throw new Error('synthetic');}]] as const){
   await manager.request({taskId:'t',runId,ownerSessionId:'s',targetSessionId:'s',controller:{requestStop}});
   expect(vi.getTimerCount()).toBe(0);
  }
 });
 it('keeps an explicitly closed takeover closed when a pending controller settles',async()=>{
  for(const outcome of [true,false,'reject'] as const){
   const manager=new TakeoverManager();let finish!:(value:boolean)=>void,reject!:(error:Error)=>void;
   const pending=new Promise<boolean>((resolve,fail)=>{finish=resolve;reject=fail;});
   const request=manager.request({taskId:'t',runId:'r',ownerSessionId:'s',targetSessionId:'s',controller:{requestStop:()=>pending}});
   const id=manager.list()[0].id;manager.close(id);
   if(outcome==='reject')reject(new Error('synthetic'));else finish(outcome);
   expect((await request).status).toBe('closed');expect(manager.get(id).status).toBe('closed');
  }
 });
 it('times out unresponsive controllers and ignores their later completion',async()=>{
  vi.useFakeTimers();const manager=new TakeoverManager();let finish!:(value:boolean)=>void;
  const pending=manager.request({taskId:'t',runId:'r',ownerSessionId:'s',targetSessionId:'s',timeoutMs:25,controller:{requestStop:()=>new Promise(resolve=>{finish=resolve;})}});
  await vi.advanceTimersByTimeAsync(25);const record=await pending;expect(record.status).toBe('stop-unavailable');expect(vi.getTimerCount()).toBe(0);
  finish(true);await Promise.resolve();expect(manager.get(record.id).status).toBe('stop-unavailable');
 });
 it('keeps owner when stop is unavailable and permits successor only after confirmation',async()=>{
  const manager=new TakeoverManager(); const request=await manager.request({taskId:'t',runId:'r',ownerSessionId:'s1',targetSessionId:'s1'});
  expect(request.status).toBe('stop-unavailable'); expect(request.ownerSessionId).toBe('s1');
  expect(()=>manager.confirmSuccessor(request.id,'s2')).toThrowError(expect.objectContaining({code:'TAKEOVER_CONFLICT'}));
 });
 it('requires confirmed stop before activating a controllable successor',async()=>{
  const manager=new TakeoverManager(); const request=await manager.request({taskId:'t',runId:'r2',ownerSessionId:'s1',targetSessionId:'s1',controller:{requestStop:async()=>true}});
  expect(request.status).toBe('stop-confirmed'); const active=manager.confirmSuccessor(request.id,'s2'); expect(active.status).toBe('successor-confirmed'); expect(manager.activate(request.id)).toMatchObject({status:'active',ownerSessionId:'s2'});
 });
 it('rejects concurrent active takeover requests',async()=>{const manager=new TakeoverManager(); const a=await manager.request({taskId:'t',runId:'r3',ownerSessionId:'s1',targetSessionId:'s1',controller:{requestStop:async()=>true}}); manager.confirmSuccessor(a.id,'s2'); manager.activate(a.id); await expect(manager.request({taskId:'t',runId:'r3',ownerSessionId:'s2',targetSessionId:'s2',controller:{requestStop:async()=>true}})).rejects.toMatchObject({code:'TAKEOVER_CONFLICT'});});
 it('keeps stop unconfirmed when the controller throws',async()=>{
  const manager=new TakeoverManager();
  const request=await manager.request({taskId:'t',runId:'r4',ownerSessionId:'s1',targetSessionId:'s1',controller:{requestStop:async()=>{throw new Error('unavailable');}}});
  expect(request.status).toBe('stop-unavailable');
  expect(request.ownerSessionId).toBe('s1');
 });
});
