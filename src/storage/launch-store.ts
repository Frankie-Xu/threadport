import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors.js';
import { storageError } from './migrations.js';
import { HandoffStore,recordDigest } from './handoff-store.js';
import type { ProcessResult } from '../platform/process.js';
export interface LaunchAttempt {id:string;handoffId:string;status:string;startedAt:string;endedAt:string|null;errorCode:string|null;targetExitCode:number|null}
export class LaunchStore {
 constructor(private readonly db:Database.Database){}
 private transaction<T>(action:()=>T):T{try{return this.db.transaction(action).immediate();}catch(error){throw storageError(error);}}
 attempts(id:string):LaunchAttempt[]{const rows=this.db.prepare('SELECT id,handoff_id AS handoffId,status,started_at AS startedAt,ended_at AS endedAt,error_code AS errorCode FROM launch_attempts WHERE handoff_id=? ORDER BY started_at,id').all(id) as Omit<LaunchAttempt,'targetExitCode'>[];return rows.map(row=>{const code=/^TARGET_EXIT_(\d+)$/.exec(row.errorCode??'');return {...row,errorCode:code?'TARGET_EXITED':row.errorCode,targetExitCode:code?Number(code[1]):row.status==='exited'?0:null};});}
 claim(id:string,digest:string):string{return this.transaction(()=>{
  const repository=new HandoffStore(this.db);const {record,state}=repository.read(id);repository.assertCurrent(record);
  if(state!=='confirmed'||!record.approval||record.approval.digest!==digest||recordDigest(record)!==digest)throw new DomainError('REVISION_CONFLICT','Handoff is not available for launch.');
  const attemptId=randomUUID();const now=new Date().toISOString();record.approval.launch={attemptId,ownerPid:process.pid};
  this.db.prepare("UPDATE handoffs SET state='launching',body_json=? WHERE id=? AND state='confirmed'").run(JSON.stringify(record),id);
  this.db.prepare('INSERT INTO launch_attempts(id,handoff_id,status,started_at) VALUES(?,?,?,?)').run(attemptId,id,'launching',now);return attemptId;
 });}
 cancel(id:string,digest:string):void{this.transaction(()=>{
  const {record,state}=new HandoffStore(this.db).read(id);
  if(!['prepared','confirmed'].includes(state)||recordDigest(record)!==digest)throw new DomainError('REVISION_CONFLICT','Handoff changed during review.');
  const now=new Date().toISOString();this.db.prepare("UPDATE handoffs SET state='cancelled' WHERE id=?").run(id);
  this.db.prepare('INSERT INTO launch_attempts(id,handoff_id,status,started_at,ended_at,error_code) VALUES(?,?,?,?,?,?)').run(randomUUID(),id,'cancelled',now,now,'USER_CANCELLED');
 });}
 finish(id:string,attemptId:string,result:ProcessResult):void{this.transaction(()=>{
  const {record,state}=new HandoffStore(this.db).read(id);
  if(state!=='launching'||record.approval?.launch?.attemptId!==attemptId||record.approval.launch.ownerPid!==process.pid)throw new DomainError('REVISION_CONFLICT','Launch ownership changed.');
  this.db.prepare('UPDATE launch_attempts SET status=?,ended_at=?,error_code=? WHERE id=? AND handoff_id=?').run(result.status,new Date().toISOString(),result.errorCode,attemptId,id);
  this.db.prepare('UPDATE handoffs SET state=? WHERE id=?').run(result.status,id);
 });}
 /** Lost observer means interrupted, not proof the Agent child stopped. Never retries or kills. */
 reconcile(id:string):void{this.transaction(()=>{
  const {record,state}=new HandoffStore(this.db).read(id);const owner=record.approval?.launch;
  if(state!=='launching'||!owner||!Number.isSafeInteger(owner.ownerPid)||owner.ownerPid<=0)return;
  try{process.kill(owner.ownerPid,0);return;}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')return;}
  this.db.prepare("UPDATE launch_attempts SET status='interrupted',ended_at=?,error_code='OWNER_LOST' WHERE id=? AND handoff_id=? AND status='launching'").run(new Date().toISOString(),owner.attemptId,id);
  this.db.prepare("UPDATE handoffs SET state='interrupted' WHERE id=? AND state='launching'").run(id);
 });}
}
