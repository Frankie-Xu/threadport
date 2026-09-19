import type Database from 'better-sqlite3';
import { launchPlanDigest } from '../targets/review.js';
import { LaunchStore } from './launch-store.js';
import { observeProcess } from '../platform/process-identity.js';
import { DomainError } from '../domain/errors.js';
import { HandoffStore } from './handoff-store.js';
import { observationSchema,observeEnvironment,type ExecutionObservation } from '../evidence/observations.js';
import type { ProcessResult } from '../platform/process.js';
import { storageError } from './migrations.js';
export class ObservationStore {
 constructor(private readonly db:Database.Database){}
 private transaction<T>(action:()=>T):T{try{return this.db.transaction(action).immediate();}catch(error){throw storageError(error);}}
 assertCapacity(taskId:string):void{if((this.db.prepare('SELECT count(*) FROM execution_observations WHERE task_id=?').pluck().get(taskId) as number)>=1000)throw new DomainError('INVALID_INPUT','Task execution history reached 1000 observations; start a separately scoped task.');}
 start(handoffId:string,attemptId:string):void{this.transaction(()=>{
  const {record,state}=new HandoffStore(this.db).read(handoffId);const h=record.handoff;
  if(state!=='launching'||record.approval?.launch?.attemptId!==attemptId||record.approval.launch.ownerPid!==process.pid||!record.approval.planDigest)throw new DomainError('REVISION_CONFLICT','Execution evidence requires the claimed launch.');
  this.assertCapacity(h.taskId);
  const value:ExecutionObservation={protocol:'threadport.execution-observation.v1',id:attemptId,handoffId,taskId:h.taskId,sessionId:h.sourceSessionId,kind:'threadport-target-process',planDigest:record.approval.planDigest,beforeSnapshotId:record.reviewSnapshot.id,afterSnapshotId:null,createdAt:new Date().toISOString(),startedAt:null,completedAt:null,status:'running',exitCode:null,environmentBefore:observeEnvironment(),environmentAfter:null,testCounts:null,testScope:null};
  this.db.prepare('INSERT INTO execution_observations VALUES(?,?,?,?,?)').run(attemptId,h.taskId,h.sourceSessionId,handoffId,JSON.stringify(observationSchema.parse(value)));
 });}
 get(id:string):ExecutionObservation|null{const value=this.db.prepare('SELECT body_json FROM execution_observations WHERE id=?').pluck().get(id) as string|undefined;return value?observationSchema.parse(JSON.parse(value)):null;}
 list(taskId:string,sessionId?:string):ExecutionObservation[]{return (this.db.prepare('SELECT body_json FROM execution_observations WHERE task_id=? AND (? IS NULL OR session_id=?) ORDER BY rowid').pluck().all(taskId,sessionId??null,sessionId??null) as string[]).map(value=>observationSchema.parse(JSON.parse(value)));}
 plan(id:string){
  const value=this.get(id);if(!value)return null;
  try{const approval=new HandoffStore(this.db).read(value.handoffId).record.approval;return approval?.launch?.attemptId===id&&approval.plan&&launchPlanDigest(approval.plan)===value.planDigest?approval.plan:null;}catch{return null;}
 }
 private update(id:string,change:(value:ExecutionObservation)=>ExecutionObservation){this.transaction(()=>{
  const value=this.get(id);if(!value||value.status!=='running')throw new DomainError('REVISION_CONFLICT','Execution observation is missing or already completed.');
  const run=new LaunchStore(this.db).inspectRun(value.handoffId);
  if(!run||run.id!==id||observeProcess(run.owner)!=='same'||run.owner.pid!==process.pid)throw new DomainError('REVISION_CONFLICT','Process observation ownership changed.');
  const launch=new HandoffStore(this.db).read(value.handoffId).record.approval?.launch;
  if(launch?.attemptId!==id||launch.ownerPid!==process.pid)throw new DomainError('REVISION_CONFLICT','Only the current observer can write execution evidence.');
  const next=observationSchema.parse(change(value));this.db.prepare('UPDATE execution_observations SET body_json=? WHERE id=?').run(JSON.stringify(next),id);
 });}
 spawned(id:string){this.update(id,value=>{if(value.startedAt)throw new DomainError('REVISION_CONFLICT','Spawn was already observed.');return {...value,startedAt:new Date().toISOString()};});}
 finish(id:string,result:ProcessResult,afterSnapshotId:string|null){this.update(id,value=>{
  const exit=/^TARGET_EXIT_(\d+)$/.exec(result.errorCode??'');
  return {...value,status:result.status,completedAt:new Date().toISOString(),exitCode:value.startedAt?(result.status==='exited'?0:exit?Number(exit[1]):null):null,afterSnapshotId,environmentAfter:observeEnvironment()};
 });}
}
