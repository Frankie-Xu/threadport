import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors.js';
import { storageError } from './migrations.js';
import { HandoffStore,recordDigest } from './handoff-store.js';
import type { ProcessResult } from '../platform/process.js';
import { launchPlanDigest } from '../targets/review.js';
import { realpathSync } from 'node:fs';
import { processIdentity,observeProcess,type ProcessIdentity } from '../platform/process-identity.js';
interface WorkspaceRun {id:string;workspaceRoot:string;owner:ProcessIdentity;target:ProcessIdentity|null;state:'running'|'unknown'|'released';nonce:string}
export interface LaunchAttempt {id:string;handoffId:string;status:string;startedAt:string;endedAt:string|null;errorCode:string|null;targetExitCode:number|null}
export class LaunchStore {
 constructor(private readonly db:Database.Database){}
 private transaction<T>(action:()=>T):T{try{return this.db.transaction(action).immediate();}catch(error){throw storageError(error);}}
 attempts(id:string):LaunchAttempt[]{const rows=this.db.prepare('SELECT id,handoff_id AS handoffId,status,started_at AS startedAt,ended_at AS endedAt,error_code AS errorCode FROM launch_attempts WHERE handoff_id=? ORDER BY started_at,id').all(id) as Omit<LaunchAttempt,'targetExitCode'>[];return rows.map(row=>{const code=/^TARGET_EXIT_(\d+)$/.exec(row.errorCode??'');return {...row,errorCode:code?'TARGET_EXITED':row.errorCode,targetExitCode:code?Number(code[1]):row.status==='exited'?0:null};});}
 claim(id:string,digest:string,expectedPlanDigest?:string):string{return this.transaction(()=>{
  const repository=new HandoffStore(this.db);const {record,state}=repository.read(id);repository.assertCurrent(record);
  if(state!=='confirmed'||!record.approval||record.approval.digest!==digest||recordDigest(record)!==digest)throw new DomainError('REVISION_CONFLICT','Handoff is not available for launch.');
  if(!expectedPlanDigest||!record.approval.plan||record.approval.planDigest!==expectedPlanDigest||record.approval.planDigest!==launchPlanDigest(record.approval.plan)||record.approval.plan.handoffDigest!==digest)throw new DomainError('REVISION_CONFLICT','A reviewed terminal launch plan is required.');
  const root=realpathSync(record.workspace.canonicalRoot);
  if(this.db.prepare("SELECT 1 FROM workspace_runs WHERE workspace_root=? AND state!='released'").get(root))throw new DomainError('WORKSPACE_BUSY','This workspace has a running or unknown attempt. Inspect and resolve it before another launch.');
  const attemptId=randomUUID();const now=new Date().toISOString();record.approval.launch={attemptId,ownerPid:process.pid};
  this.db.prepare("UPDATE handoffs SET state='launching',body_json=? WHERE id=? AND state='confirmed'").run(JSON.stringify(record),id);
  this.db.prepare('INSERT INTO launch_attempts(id,handoff_id,status,started_at) VALUES(?,?,?,?)').run(attemptId,id,'launching',now);
  this.db.prepare("INSERT INTO workspace_runs(id,workspace_root,owner_json,state,nonce) VALUES(?,?,?,'running',?)").run(attemptId,root,JSON.stringify(processIdentity(process.pid)),record.approval.plan.nonce);
  return attemptId;
 });}
 cancel(id:string,digest:string):void{this.transaction(()=>{
  const {record,state}=new HandoffStore(this.db).read(id);
  if(!['prepared','confirmed'].includes(state)||recordDigest(record)!==digest)throw new DomainError('REVISION_CONFLICT','Handoff changed during review.');
  const now=new Date().toISOString();this.db.prepare("UPDATE handoffs SET state='cancelled' WHERE id=?").run(id);
  this.db.prepare('INSERT INTO launch_attempts(id,handoff_id,status,started_at,ended_at,error_code) VALUES(?,?,?,?,?,?)').run(randomUUID(),id,'cancelled',now,now,'USER_CANCELLED');
 });}
 finish(id:string,attemptId:string,result:ProcessResult):void{this.transaction(()=>{
  const {record,state}=new HandoffStore(this.db).read(id);
  const run=this.inspectRun(id);
  if(!run||run.id!==attemptId||observeProcess(run.owner)!=='same'||!['launching','unknown'].includes(state)||record.approval?.launch?.attemptId!==attemptId||record.approval.launch.ownerPid!==process.pid)throw new DomainError('REVISION_CONFLICT','Launch ownership changed.');
  this.db.prepare('UPDATE launch_attempts SET status=?,ended_at=?,error_code=? WHERE id=? AND handoff_id=?').run(result.status,new Date().toISOString(),result.errorCode,attemptId,id);
  this.db.prepare('UPDATE handoffs SET state=? WHERE id=?').run(result.status,id);
  this.db.prepare('UPDATE workspace_runs SET state=? WHERE id=?').run(result.status==='unknown'?'unknown':'released',attemptId);
 });}
 recordTarget(id:string,attemptId:string,pid:number):void{this.transaction(()=>{
  const run=this.inspectRun(id);
  if(!run||run.id!==attemptId||run.state!=='running'||observeProcess(run.owner)!=='same'||run.owner.pid!==process.pid)throw new DomainError('REVISION_CONFLICT','Launch ownership changed.');
  this.db.prepare('UPDATE workspace_runs SET target_json=? WHERE id=?').run(JSON.stringify(processIdentity(pid)),attemptId);
 });}
 inspectRun(id:string):WorkspaceRun|null{
  const row=this.db.prepare('SELECT r.* FROM workspace_runs r JOIN launch_attempts a ON a.id=r.id WHERE a.handoff_id=? ORDER BY a.started_at DESC LIMIT 1').get(id) as {id:string;workspace_root:string;owner_json:string;target_json:string|null;state:WorkspaceRun['state'];nonce:string}|undefined;
  return row?{id:row.id,workspaceRoot:row.workspace_root,owner:JSON.parse(row.owner_json),target:row.target_json?JSON.parse(row.target_json):null,state:row.state,nonce:row.nonce}:null;
 }
 recover(id:string,nonce:string,confirmation:string):void{this.transaction(()=>{
  const run=this.inspectRun(id);
  if(!run||run.state!=='unknown'||run.nonce!==nonce||confirmation!=='I checked the target has stopped')throw new DomainError('REVISION_CONFLICT','Review the exact unknown attempt before recovery.');
  const owner=observeProcess(run.owner),target=run.target?observeProcess(run.target):'unavailable';
  if(owner==='same'||target==='same')throw new DomainError('WORKSPACE_BUSY','A recorded process is still alive. Stop it before releasing the workspace.');
  this.db.prepare('INSERT INTO run_recoveries(attempt_id,recovered_at,evidence_json,confirmation) VALUES(?,?,?,?)').run(run.id,new Date().toISOString(),JSON.stringify({run,owner,target}),confirmation);
  this.db.prepare("UPDATE workspace_runs SET state='released' WHERE id=?").run(run.id);
  this.db.prepare("UPDATE handoffs SET state='recovered' WHERE id=? AND state='unknown'").run(id);
  this.db.prepare('UPDATE launch_attempts SET ended_at=? WHERE id=?').run(new Date().toISOString(),run.id);
 });}
 /** Unknown keeps the reservation. A dead/reused observer PID never proves the target has stopped. */
 reconcile(id:string):void{this.transaction(()=>{
  const {record,state}=new HandoffStore(this.db).read(id);const owner=record.approval?.launch;
  if(state!=='launching'||!owner||!Number.isSafeInteger(owner.ownerPid)||owner.ownerPid<=0)return;
  const run=this.inspectRun(id);if(run&&observeProcess(run.owner)==='same')return;
  this.db.prepare("UPDATE launch_attempts SET status='unknown',error_code='OWNER_LOST' WHERE id=? AND handoff_id=? AND status='launching'").run(owner.attemptId,id);
  this.db.prepare("UPDATE handoffs SET state='unknown' WHERE id=? AND state='launching'").run(id);
  this.db.prepare("UPDATE workspace_runs SET state='unknown' WHERE id=?").run(owner.attemptId);
 });}
}
