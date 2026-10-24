import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors.js';
import { z } from 'zod';
import { controlIdSchema } from './contracts.js';
export type TakeoverStatus = 'requested'|'stop-requested'|'stop-confirmed'|'stop-unavailable'|'snapshot-fixed'|'successor-confirmed'|'active'|'closed';
export interface StopController { requestStop: (input:{runId:string;sessionId:string})=>Promise<boolean> }
export interface TakeoverRecord { id:string; taskId:string; runId:string; ownerSessionId:string; targetSessionId:string; successorSessionId:string|null; status:TakeoverStatus; requestedAt:string; updatedAt:string; attention:string|null }
export interface TakeoverRequest { taskId:string; runId:string; ownerSessionId:string; targetSessionId:string; controller?:StopController; timeoutMs?:number }
const requestSchema=z.object({taskId:controlIdSchema,runId:controlIdSchema,ownerSessionId:controlIdSchema,targetSessionId:controlIdSchema,timeoutMs:z.number().int().min(1).max(30000).optional(),controller:z.custom<StopController>(value=>value!==null&&typeof value==='object'&&typeof (value as StopController).requestStop==='function').optional()}).strict();
export class TakeoverManager {
 private readonly records = new Map<string,TakeoverRecord>();
 private activeFor(runId:string):TakeoverRecord|undefined { return [...this.records.values()].find(r=>r.runId===runId && !['closed','stop-unavailable'].includes(r.status)); }
 async request(input:TakeoverRequest):Promise<TakeoverRecord> {
  const parsed=requestSchema.safeParse(input);if(!parsed.success)throw new DomainError('INVALID_INPUT','Invalid takeover request.');input=parsed.data;
  if (this.activeFor(input.runId)) throw new DomainError('TAKEOVER_CONFLICT','A takeover is already active for this run.');
  const now = new Date().toISOString(); const record:TakeoverRecord={id:`takeover-${randomUUID()}`,taskId:input.taskId,runId:input.runId,ownerSessionId:input.ownerSessionId,targetSessionId:input.targetSessionId,successorSessionId:null,status:'requested',requestedAt:now,updatedAt:now,attention:null}; this.records.set(record.id,record);
  if (!input.controller) { record.status='stop-unavailable'; record.attention='No reliable stop control is available; original owner remains responsible.'; record.updatedAt=new Date().toISOString(); return {...record}; }
  record.status='stop-requested'; record.updatedAt=new Date().toISOString();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
   const deadline=new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),input.timeoutMs??5000);});
   const result=await Promise.race([input.controller.requestStop({runId:input.runId,sessionId:input.targetSessionId}),deadline]);
   if(record.status==='stop-requested'){
    if(result)record.status='stop-confirmed';
    else{record.status='stop-unavailable';record.attention='Stop was requested but no confirmation was received.';}
   }
  }catch{
   if(record.status==='stop-requested'){record.status='stop-unavailable';record.attention='Stop request failed; confirmation is unavailable.';}
  }finally{if(timer!==undefined)clearTimeout(timer);}
  record.updatedAt=new Date().toISOString(); return {...record};
 }
 get(id:string):TakeoverRecord { const record=this.records.get(id); if(!record) throw new DomainError('NOT_FOUND','Takeover does not exist.'); return {...record}; }
 confirmStop(id:string):TakeoverRecord { const record=this.getMutable(id); if(record.status!=='stop-requested') throw new DomainError('TAKEOVER_CONFLICT','Takeover is not awaiting stop confirmation.'); record.status='stop-confirmed'; record.updatedAt=new Date().toISOString(); return {...record}; }
 fixSnapshot(id:string):TakeoverRecord { const record=this.getMutable(id); if(record.status!=='stop-confirmed') throw new DomainError('TAKEOVER_CONFLICT','Stop must be confirmed before fixing a snapshot.'); record.status='snapshot-fixed'; record.updatedAt=new Date().toISOString(); return {...record}; }
 confirmSuccessor(id:string, successorSessionId:string):TakeoverRecord { if(!controlIdSchema.safeParse(successorSessionId).success)throw new DomainError('INVALID_INPUT','Invalid successor identity.');const record=this.getMutable(id); if(record.status!=='stop-confirmed' && record.status!=='snapshot-fixed') throw new DomainError('TAKEOVER_CONFLICT','Stop must be confirmed before successor confirmation.'); record.successorSessionId=successorSessionId; record.status='successor-confirmed'; record.updatedAt=new Date().toISOString(); return {...record}; }
 acknowledge(id:string, successorSessionId:string):TakeoverRecord { return this.confirmSuccessor(id,successorSessionId); }
 activate(id:string):TakeoverRecord { const record=this.getMutable(id); if(record.status!=='successor-confirmed' || !record.successorSessionId) throw new DomainError('TAKEOVER_CONFLICT','Successor confirmation is required before activation.'); record.status='active'; record.ownerSessionId=record.successorSessionId; record.updatedAt=new Date().toISOString(); return {...record}; }
 close(id:string):TakeoverRecord { const record=this.getMutable(id); record.status='closed'; record.updatedAt=new Date().toISOString(); return {...record}; }
 list():TakeoverRecord[] { return [...this.records.values()].map(r=>({...r})); }
 private getMutable(id:string):TakeoverRecord { const record=this.records.get(id); if(!record) throw new DomainError('NOT_FOUND','Takeover does not exist.'); return record; }
}
