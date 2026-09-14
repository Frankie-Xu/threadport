import type Database from 'better-sqlite3';
import { DomainError } from '../domain/errors.js';
import { canonical,sha256,type TaskHandoff } from '../handoff/contracts.js';
import { validateExport } from '../handoff/export.js';
import type { WorkspaceBinding,WorkspaceSnapshot } from '../workspace/contracts.js';
export interface HandoffSource {id:string;agent:'claude'|'codex';vendorSessionId:string|null;status:string;projectId:string|null;workspaceId:string|null}
export interface HandoffRecord {handoff:TaskHandoff;workspace:WorkspaceBinding;reviewSnapshot:WorkspaceSnapshot;source:HandoffSource;approval:null|{digest:string;confirmedAt:string;acknowledgeUncertainty:boolean;launch?:{attemptId:string;ownerPid:number}}}
export const recordDigest=(record:HandoffRecord)=>sha256(canonical({...record,approval:null}));
export class HandoffStore {
 constructor(private readonly db:Database.Database){}
 source(id:string):HandoffSource|null{
  const row=this.db.prepare('SELECT metadata_json FROM sessions WHERE id=?').pluck().get(id) as string|undefined;
  const session=row?JSON.parse(row).session:null;if(!session)return null;
  return {id:session.id,agent:session.agent,vendorSessionId:session.vendorSessionId,status:session.status,projectId:session.projectId,workspaceId:session.workspaceId};
 }
 assertCurrent(record:HandoffRecord){
  const h=record.handoff;
  const revision=this.db.prepare('SELECT revision FROM tasks WHERE id=?').pluck().get(h.taskId);
  const workspace=this.db.prepare('SELECT id,project_id AS projectId,canonical_root AS canonicalRoot FROM workspaces WHERE id=?').get(h.workspaceId);
  const linked=this.db.prepare('SELECT 1 FROM task_sessions WHERE task_id=? AND session_id=?').get(h.taskId,h.sourceSessionId);
  if(revision!==h.taskRevision||!linked||canonical(workspace??null)!==canonical(record.workspace)||canonical(this.source(h.sourceSessionId))!==canonical(record.source))throw new DomainError('REVISION_CONFLICT','Task, source or workspace changed; prepare again.');
  if(Date.now()>=Date.parse(h.expiresAt))throw new DomainError('REVISION_CONFLICT','Preview expired; prepare again.');
 }
 save(record:HandoffRecord){this.db.transaction(()=>{
  validateExport(record.handoff);this.assertCurrent(record);const h=record.handoff;
  this.db.prepare('INSERT INTO handoffs(id,task_id,task_revision,digest,expires_at,body_json,state) VALUES(?,?,?,?,?,?,?)').run(h.id,h.taskId,h.taskRevision,recordDigest(record),h.expiresAt,JSON.stringify(record),'prepared');
 }).immediate();}
 read(id:string):{record:HandoffRecord;state:string;expired:boolean}{
  const row=this.db.prepare('SELECT body_json,digest,state FROM handoffs WHERE id=?').get(id) as {body_json:string;digest:string;state:string}|undefined;
  if(!row||row.state==='retained')throw new DomainError('NOT_FOUND','Handoff does not exist.');
  let record:HandoffRecord;try{record=JSON.parse(row.body_json);validateExport(record.handoff);if(recordDigest(record)!==row.digest||record.handoff.id!==id||record.approval&&record.approval.digest!==row.digest)throw new Error();}catch{throw new DomainError('REVISION_CONFLICT','Stored preview changed; prepare again.');}
  return {record,state:row.state,expired:Date.now()>=Date.parse(record.handoff.expiresAt)};
 }
 confirm(record:HandoffRecord,acknowledgeUncertainty:boolean){this.db.transaction(()=>{
  const current=this.read(record.handoff.id);this.assertCurrent(current.record);
  if(!['prepared','confirmed'].includes(current.state)||recordDigest(current.record)!==recordDigest(record))throw new DomainError('REVISION_CONFLICT','Handoff cannot be confirmed.');
  const approval={digest:recordDigest(record),confirmedAt:new Date().toISOString(),acknowledgeUncertainty};
  this.db.prepare("UPDATE handoffs SET state='confirmed',body_json=? WHERE id=?").run(JSON.stringify({...record,approval}),record.handoff.id);
 }).immediate();}
}
