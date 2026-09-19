import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { accessSync,constants } from 'node:fs';
import { assertionInput,assertionSchema,type Assertion,type AssertionInput,type AssertionView } from '../assertions/contracts.js';
import { compileAssertions,overlaps } from '../assertions/compile.js';
import { DomainError } from '../domain/errors.js';
import { canonical,sha256 } from '../handoff/contracts.js';
import { redactSecrets } from '../redact.js';
import { storageError } from './migrations.js';
import type { SqliteStore } from './sqlite-store.js';
export class AssertionStore {
 constructor(private readonly db:Database.Database,private readonly tasks:Pick<SqliteStore,'getTask'|'saveTask'>){}
 private transaction<T>(action:()=>T,write=true):T{try{const transaction=this.db.transaction(action);return write?transaction.immediate():transaction();}catch(error){throw storageError(error);}}
 private latest(taskId:string):Assertion[]{return (this.db.prepare('SELECT a.body_json FROM assertion_revisions a WHERE a.task_id=? AND a.revision=(SELECT max(b.revision) FROM assertion_revisions b WHERE b.id=a.id) ORDER BY a.task_revision,a.id').pluck().all(taskId) as string[]).map(raw=>assertionSchema.parse(JSON.parse(raw)));}
 private source(taskId:string,ref:NonNullable<Assertion['source']>){
  return this.db.prepare('SELECT e.body_json AS body,s.source_path AS path,src.enabled FROM events e JOIN sessions s ON s.id=e.session_id JOIN sources src ON src.id=s.source_id JOIN task_sessions t ON t.session_id=s.id WHERE t.task_id=? AND s.id=? AND e.id=?').get(taskId,ref.sessionId,ref.eventId) as {body:string;path:string|null;enabled:number}|undefined;
 }
 view(taskId:string){return this.transaction(()=>{
  if(!this.tasks.getTask(taskId))throw new DomainError('NOT_FOUND','Task does not exist.');
  const project=(entry:Assertion):AssertionView=>{
   let sourceAvailability:AssertionView['sourceAvailability']='none';
   if(entry.source){sourceAvailability='unavailable';const ref=this.source(taskId,entry.source);if(ref?.enabled&&ref.path&&sha256(canonical(JSON.parse(ref.body)))===entry.sourceDigest){try{accessSync(ref.path,constants.R_OK);sourceAvailability='indexed-only';}catch{/* Cached provenance is not proof of source availability. */}}}
   return {...entry,sourceAvailability};
  };
  const entries=this.latest(taskId).map(project);
  const history=(this.db.prepare('SELECT body_json FROM assertion_revisions WHERE task_id=? ORDER BY task_revision,id,revision').pluck().all(taskId) as string[]).map(raw=>project(assertionSchema.parse(JSON.parse(raw))));
  return {entries,history,...compileAssertions(entries)};
 },false);}
 private mutate<T>(taskId:string,revision:number,action:(entries:Assertion[],next:number,now:string)=>T):T{return this.transaction(()=>{
  const task=this.tasks.getTask(taskId);if(!task)throw new DomainError('NOT_FOUND','Task does not exist.');
  if(!Number.isSafeInteger(revision)||task.revision!==revision)throw new DomainError('REVISION_CONFLICT','Task changed; retain your draft and review the latest revision.');
  const count=this.db.prepare('SELECT count(*) FROM assertion_revisions WHERE task_id=?').pluck().get(taskId) as number;
  if(count>=2000)throw new DomainError('INVALID_INPUT','Assertion history reached the task limit; narrow the task.');
  const now=new Date().toISOString();this.tasks.saveTask({...task,revision:revision+1,updatedAt:now},revision);
  return action(this.latest(taskId),revision+1,now);
 });}
 private insert(entry:Assertion){const value=assertionSchema.parse(entry);this.db.prepare('INSERT INTO assertion_revisions(id,task_id,revision,task_revision,body_json) VALUES(?,?,?,?,?)').run(value.id,value.taskId,value.revision,value.taskRevision,JSON.stringify(value));return value;}
 append(taskId:string,revision:number,input:AssertionInput):Assertion{
  const parsed=assertionInput.safeParse(input);if(!parsed.success)throw new DomainError('INVALID_INPUT','Invalid assertion fields.');const value=parsed.data;
  if(redactSecrets(value.text).text!==value.text||redactSecrets(value.topic).text!==value.topic)throw new DomainError('REDACTION_REQUIRED','Remove credentials before confirming this assertion.');
  return this.mutate(taskId,revision,(entries,next,now)=>{
   if(entries.length>=200)throw new DomainError('INVALID_INPUT','A task may contain at most 200 assertion entries.');
   const task=this.tasks.getTask(taskId)!;
   if(value.scope.workspaceId){const project=this.db.prepare('SELECT project_id FROM workspaces WHERE id=?').pluck().get(value.scope.workspaceId);if(project!==task.projectId)throw new DomainError('PROJECT_MISMATCH','Scope must belong to the task project.');}
   if(value.supersedes.length&&!value.confirmed)throw new DomainError('INVALID_INPUT','A candidate cannot replace an assertion.');
   if(new Set(value.supersedes).size!==value.supersedes.length)throw new DomainError('INVALID_INPUT','Replacement IDs must be unique.');
   for(const id of value.supersedes){
    const old=entries.find(e=>e.id===id);
    if(!old||!['candidate','confirmed'].includes(old.state)||old.kind!==value.kind||old.topic!==value.topic||canonical(old.scope)!==canonical(value.scope))throw new DomainError('INVALID_INPUT','Replace only active entries in the same task, topic, kind and scope.');
    this.insert({...old,revision:old.revision+1,taskRevision:next,state:'superseded',updatedAt:now});
   }
   const ref=value.source?this.source(taskId,value.source):null;
   if(value.source&&!ref)throw new DomainError('NOT_FOUND','Referenced evidence is unavailable or belongs to another task.');
   const {confirmed,...fields}=value;
   return this.insert({...fields,disputedWith:[],protocol:'threadport.assertion.v1',id:randomUUID(),taskId,revision:1,taskRevision:next,state:confirmed?'confirmed':'candidate',origin:ref?JSON.parse(ref.body).kind:'manual',sourceDigest:ref?sha256(canonical(JSON.parse(ref.body))):null,createdAt:now,updatedAt:now});
  });
 }
 declareConflict(taskId:string,revision:number,ids:[string,string]):void{
  if(ids.length!==2||ids[0]===ids[1])throw new DomainError('INVALID_INPUT','Choose two different confirmed entries.');
  this.mutate(taskId,revision,(entries,next,now)=>{
   const pair=ids.map(id=>entries.find(e=>e.id===id));
   if(pair.some(e=>!e||e.state!=='confirmed')||!overlaps(pair[0]!.scope,pair[1]!.scope))throw new DomainError('INVALID_INPUT','Conflict entries must be confirmed in overlapping scopes of this task.');
   pair.forEach((entry,i)=>this.insert({...entry!,revision:entry!.revision+1,taskRevision:next,updatedAt:now,disputedWith:[...new Set([...entry!.disputedWith,ids[1-i]])]}));
  });
 }
 transition(taskId:string,revision:number,id:string,state:'confirmed'|'rejected'):Assertion{
  if(!['confirmed','rejected'].includes(state))throw new DomainError('INVALID_INPUT','Invalid assertion transition.');
  return this.mutate(taskId,revision,(entries,next,now)=>{
   const entry=entries.find(e=>e.id===id);if(!entry)throw new DomainError('NOT_FOUND','Assertion does not belong to this task.');
   if(entry.state!=='candidate'&&!(entry.state==='confirmed'&&state==='rejected'))throw new DomainError('INVALID_INPUT','Retired assertions cannot be revived. Add an explicit replacement instead.');
   return this.insert({...entry,revision:entry.revision+1,taskRevision:next,state,updatedAt:now});
  });
 }
}
