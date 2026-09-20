import { describe, expect, it } from 'vitest';
import { TakeoverManager } from '../../src/control-plane/takeover.js';

describe('takeover state machine',()=>{
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
