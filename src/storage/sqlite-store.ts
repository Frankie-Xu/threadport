import { ObservationStore } from './observation-store.js';
import { AssertionStore } from './assertion-store.js';
import {deleteOwnedData} from './delete-data.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { Task, NormalizedEvent } from '../domain/models.js';
import { DomainError } from '../domain/errors.js';
import { openDatabase, type DatabaseOptions } from './database.js';
import { registerSearchFunctions, searchHistory } from './search-store.js';
import type { SearchInput, SearchPage } from '../search/contracts.js';
import { bindingSchema, snapshotSchema, type WorkspaceBinding, type WorkspaceSnapshot } from '../workspace/contracts.js';
import { IndexStore } from './index-store.js';
import { LaunchStore } from './launch-store.js';
import { HandoffStore } from './handoff-store.js';
import { MaintenanceStore } from './maintenance.js';
import { BusinessStore } from './api-store.js';
import { innerObservationSchema, type InnerAgentObservation } from '../evidence/observations.js';
const id = z.string().min(1).max(512);
const date = z.string().datetime();
const claim = z.object({ text: z.string(), origin: z.enum(['observed', 'user-confirmed', 'derived', 'unknown']), evidence: z.array(z.object({ sessionId: id, eventId: id }).strict()), updatedAt: date.nullable() }).strict();
const taskSchema = z.object({ id, projectId: id, revision: z.number().int().positive().safe(), title: z.string().min(1), objective: claim, constraints: z.array(claim), nextAction: claim, lifecycle: z.enum(['active', 'paused', 'completed']), archived: z.boolean(), createdAt: date, updatedAt: date }).strict();
const taskWriteSchema = taskSchema.extend({ title: z.string().min(1).max(120).refine(value => value.trim().length > 0), objective: claim.extend({ text: z.string().max(8000) }), constraints: z.array(claim.extend({ text: z.string().max(2000) })).max(50), nextAction: claim.extend({ text: z.string().max(4000) }) });
function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value); if (!parsed.success) throw new DomainError('INVALID_INPUT', 'Invalid storage input.'); return parsed.data;
}
function page(limit: number, offset: number) {
  validate(z.number().int().min(1).max(1000), limit); validate(z.number().int().nonnegative().safe(), offset);
}
/** Infrastructure boundary. Callers supply already redacted task fields; Store validates shape and atomicity. */
export class SqliteStore extends IndexStore {
  constructor(db:Database.Database){super(db);registerSearchFunctions(db);}
  observationStore():ObservationStore{return new ObservationStore(this.db);}
  assertionStore():AssertionStore{return new AssertionStore(this.db,this);}
  maintenance():MaintenanceStore{return new MaintenanceStore(this.db);}
  launchStore():LaunchStore{return new LaunchStore(this.db);}
  handoffStore():HandoffStore{return new HandoffStore(this.db);}
  apiStore():BusinessStore{return new BusinessStore(this.db);}
  searchHistory(input:SearchInput={}):SearchPage{return this.run(()=>searchHistory(this.db,input));}
  getWorkspace(workspaceId:string):WorkspaceBinding|null {
    return this.run(()=>{const row=this.db.prepare('SELECT id,project_id AS projectId,canonical_root AS canonicalRoot FROM workspaces WHERE id=?').get(validate(id,workspaceId));return row?validate(bindingSchema,row):null;});
  }
  getSnapshot(snapshotId:string):WorkspaceSnapshot|null {
    return this.run(()=>{const body=this.db.prepare('SELECT body_json FROM snapshots WHERE id=?').pluck().get(validate(id,snapshotId));return body===undefined?null:validate(snapshotSchema,JSON.parse(body as string));});
  }
  saveSnapshot(input:WorkspaceSnapshot,expectedWorkspace?:WorkspaceBinding):void {
    const snapshot=validate(snapshotSchema,input);
    const expected=expectedWorkspace?validate(bindingSchema,expectedWorkspace):undefined;
    this.run(()=>this.db.transaction(()=>{
      const workspace=this.getWorkspace(snapshot.workspaceId);
      if(!workspace)throw new DomainError('NOT_FOUND','Workspace does not exist.');
      if(expected&&JSON.stringify(workspace)!==JSON.stringify(expected))throw new DomainError('REVISION_CONFLICT','Workspace binding changed during capture.');
      const existing=this.getSnapshot(snapshot.id);
      if(existing){if(JSON.stringify(existing)!==JSON.stringify(snapshot))throw new DomainError('REVISION_CONFLICT','Snapshots are immutable.');return;}
      this.db.prepare('INSERT INTO snapshots(id,workspace_id,captured_at,body_json) VALUES(?,?,?,?)').run(snapshot.id,snapshot.workspaceId,snapshot.capturedAt,JSON.stringify(snapshot));
    }).immediate());
  }
  statusCounts():{events:number;indexedBytes:number;sources:number;sessions:number;tasks:number}{
    return this.run(()=>this.db.prepare('SELECT (SELECT count(*) FROM events) AS events, (SELECT coalesce(sum(byte_offset),0) FROM source_cursors) AS indexedBytes, (SELECT count(*) FROM sources) AS sources, (SELECT count(*) FROM sessions) AS sessions, (SELECT count(*) FROM tasks) AS tasks').get() as {events:number;indexedBytes:number;sources:number;sessions:number;tasks:number});
  }
  deleteAll(dataDir:string){return deleteOwnedData(this.db,dataDir);}
  isOpen():boolean{return this.db.open;}
  close(): void { this.db.close(); }
  createProject(projectId: string, name: string): void {
    validate(id, projectId); validate(z.string().min(1).max(120), name);
    this.run(() => this.db.prepare('INSERT INTO projects(id,name) VALUES (?,?)').run(projectId, name));
  }
  deleteProject(projectId: string): void {
    this.run(() => this.db.prepare('DELETE FROM projects WHERE id=?').run(validate(id, projectId)));
  }
  /** Reserve or retain a session tombstone. Indexer will fill source metadata without REPLACE. */
  saveSession(sessionId: string): void {
    this.run(() => this.db.prepare("INSERT INTO sessions(id,metadata_json) VALUES (?,?) ON CONFLICT(id) DO NOTHING").run(validate(id, sessionId), JSON.stringify({ status: 'missing' })));
  }
  getTask(taskId: string): Task | null {
    return this.run(() => {
      const body = this.db.prepare("SELECT body_json FROM tasks WHERE id=?").pluck().get(validate(id, taskId));
      return body === undefined ? null : validate(taskSchema, JSON.parse(body as string));
    });
  }
  listTasks(limit = 100, offset = 0, includeArchived = true): Task[] {
    page(limit, offset); validate(z.boolean(),includeArchived);
    return this.run(() => (this.db.prepare("SELECT body_json FROM tasks WHERE ?=1 OR json_extract(body_json,'$.archived')=0 ORDER BY updated_at DESC,id LIMIT ? OFFSET ?").pluck().all(Number(includeArchived),limit, offset) as string[]).map(body => validate(taskSchema, JSON.parse(body))));
  }
  sessionIds(taskId: string): string[] {
    return this.run(() => this.db.prepare('SELECT session_id FROM task_sessions WHERE task_id=? ORDER BY session_id').pluck().all(validate(id, taskId)) as string[]);
  }
  getRevisions(taskId: string, limit = 100, offset = 0): Task[] {
    page(limit, offset);
    return this.run(() => (this.db.prepare('SELECT body_json FROM task_revisions WHERE task_id=? ORDER BY revision DESC LIMIT ? OFFSET ?').pluck().all(validate(id, taskId), limit, offset) as string[]).map(body => validate(taskSchema, JSON.parse(body))));
  }
  getSessionBinding(sessionId: string): {id:string;projectId:string|null;workspaceId:string|null} | null {
    return this.run(() => this.db.prepare('SELECT id,project_id AS projectId,workspace_id AS workspaceId FROM sessions WHERE id=?').get(validate(id,sessionId)) as {id:string;projectId:string|null;workspaceId:string|null}|undefined ?? null);
  }
  saveInnerObservation(sessionId:string,eventId:string,kind:'command'|'test',input:InnerAgentObservation):NormalizedEvent {
    const result=innerObservationSchema.parse(input);
    if(result.eventId!==eventId||result.kind!==kind)throw new DomainError('INVALID_INPUT','Inner observation identity does not match the request.');
    return this.run(()=>this.db.transaction(()=>{
      const session=this.db.prepare('SELECT id,workspace_id AS workspaceId FROM sessions WHERE id=?').get(sessionId) as {id:string;workspaceId:string|null}|undefined;
      if(!session)throw new DomainError('NOT_FOUND','Session does not exist.');
      const id=`inner:${eventId}`;
      let stored:InnerAgentObservation=result;
      const snapshotIds=[result.workspace.beforeSnapshotId,result.workspace.afterSnapshotId].filter((value):value is string=>value!==null);
      const foreign=snapshotIds.some(snapshotId=>{
        const snapshot=this.db.prepare('SELECT workspace_id AS workspaceId FROM snapshots WHERE id=?').get(snapshotId) as {workspaceId:string}|undefined;
        return !!snapshot && (session.workspaceId===null || snapshot.workspaceId!==session.workspaceId);
      });
      if(foreign)stored={...result,status:'unknown',exitCode:null,workspace:{...result.workspace,beforeSnapshotId:null,afterSnapshotId:null},environment:{...result.environment,digest:null,complete:false}};
      const existing=this.db.prepare('SELECT session_id,body_json FROM events WHERE id=?').get(id) as {session_id:string;body_json:string}|undefined;
      if(existing){
        if(existing.session_id!==sessionId)throw new DomainError('INVALID_INPUT','Event belongs to another session.');
        const body=JSON.parse(existing.body_json) as NormalizedEvent;
        if(JSON.stringify(body.innerObservation)!==JSON.stringify(stored))throw new DomainError('INVALID_INPUT','Event already contains a different observation.');
        return body;
      }
      const ordinal=this.db.prepare('SELECT coalesce(max(ordinal),-1)+1 FROM events WHERE session_id=?').pluck().get(sessionId) as number;
      const event:NormalizedEvent={id,sessionId,ordinal,occurredAt:stored.completedAt??stored.startedAt,kind:kind,text:'Imported structured inner observation.',commandRun:null,relativePaths:[],omitted:false,innerObservation:stored};
      this.db.prepare('INSERT INTO events(id,session_id,ordinal,body_json,search_text) VALUES(?,?,?,?,?)').run(event.id,event.sessionId,event.ordinal,JSON.stringify(event),event.text);
      return event;
    }).immediate());
  }
  listUnassignedSessions(limit=100,offset=0): {id:string;projectId:string|null;workspaceId:string|null}[] {
    page(limit,offset);
    return this.run(() => this.db.prepare('SELECT id,project_id AS projectId,workspace_id AS workspaceId FROM sessions WHERE NOT EXISTS(SELECT 1 FROM task_sessions WHERE session_id=sessions.id) ORDER BY id LIMIT ? OFFSET ?').all(limit,offset) as {id:string;projectId:string|null;workspaceId:string|null}[]);
  }
  /** Explicit binding only. Path identity verification belongs to the workspace use case. */
  createWorkspace(workspaceId:string,projectId:string,canonicalRoot:string):void {
    validate(id,workspaceId);validate(id,projectId);validate(z.string().min(1).max(32768),canonicalRoot);
    this.run(() => this.db.prepare('INSERT INTO workspaces(id,project_id,canonical_root) VALUES(?,?,?)').run(workspaceId,projectId,canonicalRoot));
  }
  bindSession(sessionId:string,projectId:string,workspaceId:string|null):void {
    validate(id,sessionId);validate(id,projectId);validate(id.nullable(),workspaceId);
    this.run(() => this.db.transaction(() => {
      if(!this.getSessionBinding(sessionId))throw new DomainError('NOT_FOUND','Session does not exist.');
      if(!this.db.prepare('SELECT 1 FROM projects WHERE id=?').get(projectId))throw new DomainError('NOT_FOUND','Project does not exist.');
      const owner=this.db.prepare('SELECT t.project_id FROM task_sessions ts JOIN tasks t ON t.id=ts.task_id WHERE ts.session_id=?').pluck().get(sessionId);
      if(owner!==undefined && owner!==projectId)throw new DomainError('PROJECT_MISMATCH','Detach the session before changing its project.');
      if(workspaceId!==null){
        const workspace=this.db.prepare('SELECT project_id FROM workspaces WHERE id=?').pluck().get(workspaceId);
        if(workspace===undefined)throw new DomainError('NOT_FOUND','Workspace does not exist.');
        if(workspace!==projectId)throw new DomainError('PROJECT_MISMATCH','Workspace belongs to another project.');
      }
      this.db.prepare("UPDATE sessions SET project_id=?,workspace_id=?,metadata_json=CASE WHEN json_type(metadata_json,'$.session')='object' THEN json_set(metadata_json,'$.session.projectId',?,'$.session.workspaceId',?) ELSE metadata_json END WHERE id=?").run(projectId,workspaceId,projectId,workspaceId,sessionId);
    }).immediate());
  }
  /** null means a pre-T08 revision whose historical links were never recorded. */
  revisionSessionIds(taskId:string,revision:number):string[]|null {
    validate(id,taskId);validate(z.number().int().positive().safe(),revision);
    return this.run(() => {
      const row=this.db.prepare('SELECT session_ids_json FROM task_revisions WHERE task_id=? AND revision=?').get(taskId,revision) as {session_ids_json:string|null}|undefined;
      if(!row)throw new DomainError('NOT_FOUND','Task revision does not exist.');
      return row.session_ids_json===null?null:validate(z.array(id),JSON.parse(row.session_ids_json));
    });
  }
  readTaskContext(taskId:string): {task:Task;sessionIds:string[];events:NormalizedEvent[];newActivity:boolean} {
    validate(id,taskId);
    return this.run(() => this.db.transaction(() => {
      const task=this.getTask(taskId);if(!task)throw new DomainError('NOT_FOUND','Task does not exist.');
      const events=(this.db.prepare('SELECT e.body_json FROM events e JOIN task_sessions ts ON ts.session_id=e.session_id WHERE ts.task_id=? ORDER BY e.session_id,e.ordinal').pluck().all(taskId) as string[]).map(body=>JSON.parse(body) as NormalizedEvent);
      const newActivity=task.lifecycle==='completed' && !!this.db.prepare('SELECT 1 FROM events e JOIN task_sessions ts ON ts.session_id=e.session_id WHERE ts.task_id=? AND NOT EXISTS(SELECT 1 FROM completed_task_events c WHERE c.task_id=? AND c.event_id=e.id) LIMIT 1').get(taskId,taskId);
      return {task,sessionIds:this.sessionIds(taskId),events,newActivity};
    })());
  }
  /** expectedRevision=0 creates; omitted sessionIds preserves links, [] explicitly detaches all. */
  saveTask(input: Task, expectedRevision: number, sessionIds?: readonly string[]): Task {
    const task = validate(taskWriteSchema, input);
    validate(z.number().int().nonnegative().safe(), expectedRevision);
    if (task.revision !== expectedRevision + 1) throw new DomainError('REVISION_CONFLICT', 'Task revision must advance by one.');
    const links = sessionIds === undefined ? undefined : validate(z.array(id), sessionIds);
    return this.run(() => this.db.transaction(() => {
      const existing = this.getTask(task.id);
      if ((existing?.revision ?? 0) !== expectedRevision) throw new DomainError('REVISION_CONFLICT', 'Task revision changed; reload before saving.');
      if (existing && (existing.createdAt !== task.createdAt || existing.projectId !== task.projectId)) throw new DomainError('INVALID_INPUT', 'Task identity fields are immutable.');
      if (!this.db.prepare('SELECT 1 FROM projects WHERE id=?').get(task.projectId)) throw new DomainError('NOT_FOUND','Project does not exist.');
      if (expectedRevision === 0) this.db.prepare('INSERT INTO tasks(id,project_id,revision,body_json,updated_at) VALUES (?,?,?,?,?)').run(task.id, task.projectId, task.revision, JSON.stringify(task), task.updatedAt);
      else if (this.db.prepare('UPDATE tasks SET revision=?,body_json=?,updated_at=? WHERE id=? AND revision=?').run(task.revision, JSON.stringify(task), task.updatedAt, task.id, expectedRevision).changes !== 1) throw new DomainError('REVISION_CONFLICT', 'Task revision changed; reload before saving.');
      this.db.prepare('INSERT INTO task_revisions(task_id,revision,changed_at,body_json) VALUES (?,?,?,?)').run(task.id, task.revision, task.updatedAt, JSON.stringify(task));
      if (links !== undefined) {
        this.db.prepare('DELETE FROM task_sessions WHERE task_id=?').run(task.id);
        for (const sessionId of new Set(links)) {
          const owner = this.db.prepare('SELECT task_id FROM task_sessions WHERE session_id=?').pluck().get(sessionId);
          if (owner !== undefined) throw new DomainError('REVISION_CONFLICT', 'Session already belongs to another task.');
          const binding=this.getSessionBinding(sessionId);
          if(!binding)throw new DomainError('NOT_FOUND','Session does not exist.');
          if(binding.projectId!==null && binding.projectId!==task.projectId)throw new DomainError('PROJECT_MISMATCH','Session belongs to another project.');
          this.bindSession(sessionId,task.projectId,binding.workspaceId);
          this.db.prepare('INSERT INTO task_sessions(session_id,task_id) VALUES (?,?)').run(sessionId, task.id);
        }
      }
      this.db.prepare('UPDATE task_revisions SET session_ids_json=? WHERE task_id=? AND revision=?').run(JSON.stringify(this.sessionIds(task.id)),task.id,task.revision);
      if(task.lifecycle!=='completed' || existing?.lifecycle!=='completed'){
        this.db.prepare('DELETE FROM completed_task_events WHERE task_id=?').run(task.id);
        if(task.lifecycle==='completed')this.db.prepare('INSERT INTO completed_task_events(task_id,event_id) SELECT ?,e.id FROM events e JOIN task_sessions ts ON ts.session_id=e.session_id WHERE ts.task_id=?').run(task.id,task.id);
      }
      return task;
    }).immediate());
  }
}
export async function openStore(options: DatabaseOptions = {}): Promise<SqliteStore> { return new SqliteStore(await openDatabase(options)); }

export { restoreBackup } from './database.js';
