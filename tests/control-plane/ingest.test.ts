import { expect, it, vi } from 'vitest';
import { ingestCandidate, ingestRoots, type ControlEventSource } from '../../src/control-plane/ingest.js';
import { coverageGap } from '../../src/control-plane/coverage.js';
import type { ControlEvent } from '../../src/control-plane/contracts.js';
import { openStore } from '../../src/storage/sqlite-store.js';
import { temporary } from '../helpers.js';

const candidate={sourceId:'source',agent:'threadport' as const};
const event:ControlEvent={eventId:'import-event',protocol:'threadport.control-event.v1',occurredAt:null,recordedAt:'2026-10-25T00:00:00.000Z',source:{kind:'threadport',sourceId:'source',parserVersion:'test',coverage:'full'},taskId:'task',sessionId:'session',runId:'run',ordinal:0,type:'run.started',payload:{},idempotencyKey:null,evidenceIds:[]};
const result={events:[event],cursor:{token:'one',offset:1},coverage:coverageGap('source','Synthetic test')};
function source():ControlEventSource{return{agent:'threadport',parserVersion:'test',capabilities:new Set(),async *discover(){yield candidate;},async read(){return result;}};}

it('does not discover or read after cancellation is already requested',async()=>{
 const store=await openStore({dataDir:await temporary()});
 try{
  const controller=new AbortController();controller.abort();const adapter=source(),read=vi.spyOn(adapter,'read'),discover=vi.spyOn(adapter,'discover');
  await expect(ingestCandidate(store.controlPlane(),adapter,candidate,null,controller.signal)).rejects.toMatchObject({name:'AbortError'});
  await expect(ingestRoots(store.controlPlane(),adapter,[],controller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(read).not.toHaveBeenCalled();expect(discover).not.toHaveBeenCalled();
 }finally{store.close();}
});
it('never commits results returned by a source that ignored cancellation',async()=>{
 const store=await openStore({dataDir:await temporary()});
 try{
  const controller=new AbortController(),adapter=source();let finish!:(value:typeof result)=>void;
  adapter.read=()=>new Promise(resolve=>{finish=resolve;});
  const pending=ingestCandidate(store.controlPlane(),adapter,candidate,null,controller.signal);
  controller.abort();finish(result);
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
  expect(store.controlPlane().readAllEvents()).toEqual([]);
 }finally{store.close();}
});
it('closes discovery on cancellation and still commits a successful import',async()=>{
 const store=await openStore({dataDir:await temporary()});
 try{
  const controller=new AbortController(),adapter=source();let closed=false;
  adapter.discover=async function*(){try{yield candidate;yield candidate;}finally{closed=true;}};
  adapter.read=async()=>{controller.abort();return result;};
  await expect(ingestRoots(store.controlPlane(),adapter,[],controller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(closed).toBe(true);expect(store.controlPlane().readAllEvents()).toEqual([]);
  expect(await ingestCandidate(store.controlPlane(),source(),candidate)).toMatchObject({inserted:['import-event'],cursor:result.cursor});
 }finally{store.close();}
});
