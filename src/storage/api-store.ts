import { z } from 'zod';
import type Database from 'better-sqlite3';
import { createHash,randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors.js';
import type { Task } from '../domain/models.js';
export class BusinessStore {
 constructor(private readonly db:Database.Database){}
 generation(){return this.db.prepare('SELECT generation FROM search_state WHERE id=1').pluck().get() as number;}
 projects(){return this.db.prepare('SELECT id,name FROM projects ORDER BY name,id').all() as {id:string;name:string}[];}
 workspaces(projectId?:string){return this.db.prepare('SELECT id,project_id AS projectId,canonical_root AS canonicalRoot FROM workspaces WHERE ? IS NULL OR project_id=? ORDER BY id').all(projectId??null,projectId??null) as {id:string;projectId:string;canonicalRoot:string}[];}
 bindWorkspace(root:string,projectId:string|undefined,name:string){return this.db.transaction(()=>{
  const existing=this.db.prepare('SELECT id,project_id AS projectId,canonical_root AS canonicalRoot FROM workspaces WHERE canonical_root=?').get(root) as {id:string;projectId:string;canonicalRoot:string}|undefined;
  if(existing){if(projectId&&existing.projectId!==projectId)throw new DomainError('PROJECT_MISMATCH','Workspace belongs to another project.');return existing;}
  if(projectId&&!this.db.prepare('SELECT 1 FROM projects WHERE id=?').get(projectId))throw new DomainError('NOT_FOUND','Project does not exist.');
  const project=projectId??randomUUID();if(!projectId)this.db.prepare('INSERT INTO projects(id,name) VALUES(?,?)').run(project,name);
  const id=randomUUID();this.db.prepare('INSERT INTO workspaces(id,project_id,canonical_root) VALUES(?,?,?)').run(id,project,root);
  return{id,projectId:project,canonicalRoot:root};
 }).immediate();}
 taskPage(input:{q:string;projectId?:string;lifecycle?:string;archived:boolean;limit:number;cursor?:string}){
  const {cursor,...filters}=input;const key=createHash('sha256').update(JSON.stringify(filters)).digest('hex');
  return this.db.transaction(()=>{
   const generation=this.db.prepare('SELECT generation FROM search_state WHERE id=1').pluck().get() as number;
   let offset=0;
   if(cursor){try{const value=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(value.key!==key||value.generation!==generation)throw new DomainError('SEARCH_STALE','Task list changed; restart pagination.');if(!Number.isSafeInteger(value.offset)||value.offset<0)throw new Error();offset=value.offset;}catch(error){if(error instanceof DomainError)throw error;throw new DomainError('INVALID_INPUT','Invalid task cursor.');}}
   const rows=this.db.prepare("SELECT body_json FROM tasks WHERE json_extract(body_json,'$.archived')=? AND (? IS NULL OR project_id=?) AND (? IS NULL OR json_extract(body_json,'$.lifecycle')=?) AND instr(lower(json_extract(body_json,'$.title')||' '||json_extract(body_json,'$.objective.text')),lower(?))>0 ORDER BY updated_at DESC,id LIMIT ? OFFSET ?").pluck().all(Number(input.archived),input.projectId??null,input.projectId??null,input.lifecycle??null,input.lifecycle??null,input.q,input.limit+1,offset) as string[];
   return{data:rows.slice(0,input.limit).map(body=>JSON.parse(body) as Task),nextCursor:rows.length>input.limit?Buffer.from(JSON.stringify({key,generation,offset:offset+input.limit})).toString('base64url'):null};
  })();
 }
 unassignedPage(input:{projectId?:string;limit:number;cursor?:string}){
  const {cursor,...filters}=input,key=createHash('sha256').update(JSON.stringify(filters)).digest('hex');
  return this.db.transaction(()=>{
   const generation=this.generation();let offset=0;
   if(cursor){try{const value=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(value.key!==key||value.generation!==generation)throw new DomainError('SEARCH_STALE','Sessions changed; restart pagination.');if(!Number.isSafeInteger(value.offset)||value.offset<0)throw new Error();offset=value.offset;}catch(error){if(error instanceof DomainError)throw error;throw new DomainError('INVALID_INPUT','Invalid session cursor.');}}
   const rows=this.db.prepare("SELECT s.id,src.agent,s.project_id AS projectId,s.workspace_id AS workspaceId,s.last_event_at AS lastEventAt,coalesce(json_extract(s.metadata_json,'$.session.status'),json_extract(s.metadata_json,'$.status')) AS status FROM sessions s JOIN sources src ON src.id=s.source_id WHERE src.enabled=1 AND NOT EXISTS(SELECT 1 FROM task_sessions ts WHERE ts.session_id=s.id) AND (? IS NULL OR s.project_id=? OR s.project_id IS NULL) ORDER BY s.last_event_at DESC,s.id LIMIT ? OFFSET ?").all(input.projectId??null,input.projectId??null,input.limit+1,offset) as {id:string;agent:string;projectId:string|null;workspaceId:string|null;lastEventAt:string|null;status:string|null}[];
   return{data:rows.slice(0,input.limit).map(row=>({...row,title:'Imported session',status:row.status??'unknown'})),nextCursor:rows.length>input.limit?Buffer.from(JSON.stringify({key,generation,offset:offset+input.limit})).toString('base64url'):null};
  })();
 }
 taskActivity(taskId:string){return this.db.prepare('SELECT max(s.last_event_at) FROM sessions s JOIN task_sessions ts ON ts.session_id=s.id WHERE ts.task_id=?').pluck().get(taskId) as string|null;}
 taskSessions(taskId:string){return this.db.prepare("SELECT s.id,coalesce(src.agent,json_extract(s.metadata_json,'$.session.agent')) AS agent,s.project_id AS projectId,s.workspace_id AS workspaceId,s.last_event_at AS lastEventAt,coalesce(json_extract(s.metadata_json,'$.session.status'),json_extract(s.metadata_json,'$.status'),'unknown') AS status,s.vendor_id AS vendorId FROM sessions s JOIN task_sessions ts ON ts.session_id=s.id LEFT JOIN sources src ON src.id=s.source_id WHERE ts.task_id=? ORDER BY s.last_event_at DESC,s.id").all(taskId).map(value=>{const row=value as {id:string;agent:string|null;projectId:string|null;workspaceId:string|null;lastEventAt:string|null;status:string;vendorId:string|null};const {vendorId,...safe}=row;return {...safe,title:'Imported session',nativeSessionAvailable:z.string().uuid().safeParse(vendorId).success};});}
 fileEvidence(taskId:string){const rows=this.db.prepare("SELECT e.id AS eventId,e.session_id AS sessionId,j.value AS path FROM events e JOIN task_sessions ts ON ts.session_id=e.session_id JOIN json_each(e.body_json,'$.relativePaths') j WHERE ts.task_id=? ORDER BY e.session_id,e.ordinal,j.key LIMIT 201").all(taskId) as {eventId:string;sessionId:string;path:string}[];return {items:rows.slice(0,200),hasMore:rows.length>200};}
 eventOffset(sessionId:string,eventId:string){const row=this.db.prepare('SELECT ordinal FROM events WHERE session_id=? AND id=?').get(sessionId,eventId) as {ordinal:number}|undefined;if(!row)throw new DomainError('NOT_FOUND','Evidence is no longer available.');return this.db.prepare('SELECT count(*) FROM events WHERE session_id=? AND ordinal<?').pluck().get(sessionId,row.ordinal) as number;}
 diagnosticErrors(){const allowed=new Set(['OWNER_LOST','USER_CANCELLED','SPAWN_FAILED','SIGNAL_INTERRUPTED','TARGET_EXITED']);return (this.db.prepare('SELECT error_code AS code,ended_at AS at FROM launch_attempts WHERE error_code IS NOT NULL ORDER BY ended_at DESC LIMIT 20').all() as {code:string;at:string|null}[]).map(row=>({code:allowed.has(row.code)?row.code:/^TARGET_EXIT_[0-9]{1,3}$/.test(row.code)?'TARGET_EXITED':'UNKNOWN_ERROR',at:row.at&&z.string().datetime({offset:true}).safeParse(row.at).success?row.at:null}));}
 revokeSource(id:string){this.db.transaction(()=>{
  if(!this.db.prepare('SELECT 1 FROM sources WHERE id=?').get(id))throw new DomainError('NOT_FOUND','Source does not exist.');
  if(this.db.prepare('SELECT 1 FROM index_leases WHERE source_id=? AND expires_at>?').get(id,Date.now()))throw new DomainError('STORAGE_BUSY','Source is being indexed.');
  this.db.prepare('DELETE FROM source_cursors WHERE session_id IN(SELECT id FROM sessions WHERE source_id=?)').run(id);
  this.db.prepare('DELETE FROM events WHERE session_id IN(SELECT id FROM sessions WHERE source_id=?)').run(id);
  this.db.prepare("UPDATE sessions SET source_path=NULL,vendor_id=NULL,last_event_at=NULL,metadata_json=? WHERE source_id=?").run(JSON.stringify({status:'missing'}),id);
  this.db.prepare('DELETE FROM sources WHERE id=?').run(id);
 }).immediate();}
}
