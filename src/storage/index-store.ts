import type Database from 'better-sqlite3';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { deriveTask } from '../domain/derive-task.js';
import type { NormalizedEvent } from '../domain/models.js';
import type { ReadCursor, SourceReadResult, SourceSession } from '../sources/contracts.js';
import { validateCursor } from '../sources/jsonl-reader.js';
import { storageError } from './migrations.js';
const id=z.string().min(1).max(512);
const configSchema=z.object({id,agent:z.enum(['claude','codex']),roots:z.array(z.string().min(1).max(32768)).min(1).max(100),enabled:z.boolean(),parserVersion:z.string().min(1).max(128)}).strict();
export type SourceConfig=z.infer<typeof configSchema>;
const sessionSchema=z.object({id,sourceId:id,agent:z.enum(['claude','codex']),vendorSessionId:z.string().max(512).nullable(),projectId:id.nullable(),workspaceId:id.nullable(),sourcePath:z.string().min(1).max(32768),parserVersion:z.string().max(128),formatVersion:z.string().max(128).nullable(),lastEventAt:z.string().datetime().nullable(),status:z.enum(['ready','partial','unsupported','missing','error'])}).strict();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const parsed=schema.safeParse(value);if(!parsed.success)throw new DomainError('INVALID_INPUT','Invalid indexing input.');return parsed.data;}
function pagination(limit:number,offset:number){parse(z.number().int().min(1).max(1000),limit);parse(z.number().int().nonnegative().safe(),offset);}
export class IndexStore {
 constructor(protected readonly db:Database.Database){}
 protected run<T>(fn:()=>T):T{try{return fn();}catch(error){throw storageError(error);}}
 saveSource(input:SourceConfig):void{
  const config=parse(configSchema,input);
  this.run(()=>this.db.transaction(()=>{
   const existing=this.getSource(config.id);
   if(existing&&existing.agent!==config.agent)throw new DomainError('INVALID_INPUT','Use a new source ID for a different agent.');
   if(existing&&JSON.stringify(existing)!==JSON.stringify(config)&&this.db.prepare('SELECT 1 FROM index_leases WHERE source_id=? AND expires_at>?').get(config.id,Date.now()))throw new DomainError('STORAGE_BUSY','Cancel the active source scan before changing its settings.');
   this.db.prepare('INSERT INTO sources(id,agent,root,enabled,parser_version) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET agent=excluded.agent,root=excluded.root,enabled=excluded.enabled,parser_version=excluded.parser_version').run(config.id,config.agent,JSON.stringify(config.roots),Number(config.enabled),config.parserVersion);
  }).immediate());
 }
 getSource(sourceId:string):SourceConfig|null{
  return this.run(()=>{const row=this.db.prepare('SELECT * FROM sources WHERE id=?').get(parse(id,sourceId)) as {id:string;agent:string;root:string;enabled:number;parser_version:string}|undefined;return row?parse(configSchema,{id:row.id,agent:row.agent,roots:JSON.parse(row.root),enabled:!!row.enabled,parserVersion:row.parser_version}):null;});
 }
 listSources(limit=100,offset=0):SourceConfig[]{pagination(limit,offset);return this.run(()=> (this.db.prepare('SELECT id FROM sources ORDER BY id LIMIT ? OFFSET ?').pluck().all(limit,offset) as string[]).map(key=>this.getSource(key)!));}
 acquireIndexLease(sourceId:string,owner:string,now=Date.now()):boolean{
  return this.run(()=>this.db.transaction(()=>{
   this.db.prepare('DELETE FROM index_leases WHERE expires_at<=?').run(now);
   if(this.db.prepare('SELECT 1 FROM index_leases WHERE source_id=?').get(sourceId))return false;
   const used=this.db.prepare('SELECT slot FROM index_leases').pluck().all() as number[];const slot=[0,1].find(x=>!used.includes(x));if(slot===undefined)return false;
   this.db.prepare('INSERT INTO index_leases(source_id,owner,slot,expires_at) VALUES(?,?,?,?)').run(parse(id,sourceId),parse(id,owner),slot,now+30000);return true;
  }).immediate());
 }
 renewIndexLease(sourceId:string,owner:string):void{this.run(()=>{if(this.db.prepare('UPDATE index_leases SET expires_at=? WHERE source_id=? AND owner=? AND expires_at>?').run(Date.now()+30000,sourceId,owner,Date.now()).changes!==1)throw new DomainError('INDEX_STALE','Scan ownership expired; retry this source.');});}
 releaseIndexLease(sourceId:string,owner:string):void{this.run(()=>this.db.prepare('DELETE FROM index_leases WHERE source_id=? AND owner=?').run(sourceId,owner));}
 getIndexedSession(sourceId:string,path:string):{session:SourceSession;cursor:ReadCursor|null}|null{
  return this.run(()=>{const row=this.db.prepare('SELECT metadata_json,cursor_json FROM sessions LEFT JOIN source_cursors ON sessions.id=source_cursors.session_id WHERE source_id=? AND source_path=?').get(sourceId,path) as {metadata_json:string;cursor_json:string|null}|undefined;return row?{session:parse(sessionSchema,JSON.parse(row.metadata_json).session),cursor:row.cursor_json?validateCursor(JSON.parse(row.cursor_json)):null}:null;});
 }
 listIndexedSessions(sourceId:string,limit=100,offset=0):SourceSession[]{pagination(limit,offset);return this.run(()=> (this.db.prepare('SELECT metadata_json FROM sessions WHERE source_id=? ORDER BY id LIMIT ? OFFSET ?').pluck().all(sourceId,limit,offset) as string[]).map(body=>parse(sessionSchema,JSON.parse(body).session)));}
 listEvents(sessionId:string,limit=100,offset=0):NormalizedEvent[]{pagination(limit,offset);return this.run(()=>{const events=(this.db.prepare('SELECT body_json FROM events WHERE session_id=? ORDER BY ordinal LIMIT ? OFFSET ?').pluck().all(sessionId,limit,offset) as string[]).map(body=>JSON.parse(body) as NormalizedEvent);deriveTask(events);return events;});}
 commitIndexPage(sourceId:string,owner:string,input:SourceReadResult,expectedCursor:ReadCursor|null,reset=false):void{
  const session=parse(sessionSchema,input.session);const cursor=validateCursor(input.cursor)!;const expected=validateCursor(expectedCursor);
  if(input.events.length>100||session.sourceId!==sourceId||input.events.some(event=>event.sessionId!==session.id))throw new DomainError('INVALID_INPUT','Invalid index batch identity or size.');deriveTask(input.events);
  const warnings=parse(z.array(z.string().regex(/^[A-Z_]+$/)).max(32),input.warnings);
  this.run(()=>this.db.transaction(()=>{
   if(!this.db.prepare('SELECT 1 FROM index_leases WHERE source_id=? AND owner=? AND expires_at>?').get(sourceId,owner,Date.now()))throw new DomainError('INDEX_STALE','Scan ownership expired; retry this source.');
   const actual=this.db.prepare('SELECT cursor_json FROM source_cursors WHERE session_id=?').pluck().get(session.id)??null;
   if(actual!==(expected?JSON.stringify(expected):null))throw new DomainError('INDEX_STALE','Index cursor changed; reload before committing.');
   if(!reset&&expected&&(cursor.byteOffset<expected.byteOffset||cursor.nextOrdinal<expected.nextOrdinal||cursor.fileIdentity!==expected.fileIdentity))throw new DomainError('INDEX_STALE','A changed source requires an explicit index reset.');
   const bound=this.db.prepare('SELECT project_id,workspace_id,source_id,metadata_json FROM sessions WHERE id=?').get(session.id) as {project_id:string|null;workspace_id:string|null;source_id:string|null;metadata_json:string}|undefined;
   if(bound?.source_id&&bound.source_id!==sourceId)throw new DomainError('INVALID_INPUT','Session belongs to another source.');
   const saved={...session,status:input.hasMore&&session.status==='ready'?'partial':session.status,projectId:bound?.project_id??session.projectId,workspaceId:bound?.workspace_id??session.workspaceId};
   const projectionClean=!reset&&input.events.length===0&&this.db.prepare('SELECT 1 FROM session_search WHERE session_id=? AND dirty=0').get(session.id);
   // A checkpoint-verified no-op needs no WAL writes, including lease churn.
   if(projectionClean&&actual===JSON.stringify(cursor)&&bound?.metadata_json===JSON.stringify({session:saved,warnings}))return;
   this.renewIndexLease(sourceId,owner);
   this.db.prepare('INSERT INTO sessions(id,source_id,vendor_id,source_path,project_id,workspace_id,last_event_at,metadata_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,vendor_id=excluded.vendor_id,source_path=excluded.source_path,last_event_at=excluded.last_event_at,metadata_json=excluded.metadata_json').run(session.id,sourceId,session.vendorSessionId,session.sourcePath,saved.projectId,saved.workspaceId,session.lastEventAt,JSON.stringify({session:saved,warnings}));
   if(reset)this.db.prepare('DELETE FROM events WHERE session_id=?').run(session.id);
   for(const event of input.events){const ownerSession=this.db.prepare('SELECT session_id FROM events WHERE id=?').pluck().get(event.id);if(ownerSession!==undefined&&ownerSession!==session.id)throw new DomainError('INVALID_INPUT','Event belongs to another session.');this.db.prepare('INSERT INTO events(id,session_id,ordinal,body_json,search_text) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ordinal=excluded.ordinal,body_json=excluded.body_json,search_text=excluded.search_text').run(event.id,session.id,event.ordinal,JSON.stringify(event),[event.text,...event.relativePaths].join('\n'));}
   if(!projectionClean)this.db.prepare(`INSERT INTO session_search(session_id,search_text,dirty)
     SELECT ?,lower(COALESCE((SELECT group_concat(search_text,char(10)) FROM (SELECT search_text FROM events WHERE session_id=? ORDER BY ordinal)),'')),0
     ON CONFLICT(session_id) DO UPDATE SET search_text=excluded.search_text,dirty=0`).run(session.id,session.id);
   this.db.prepare('INSERT INTO source_cursors(session_id,file_identity,byte_offset,parser_version,cursor_json) VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET file_identity=excluded.file_identity,byte_offset=excluded.byte_offset,parser_version=excluded.parser_version,cursor_json=excluded.cursor_json').run(session.id,cursor.fileIdentity,cursor.byteOffset,cursor.parserVersion,JSON.stringify(cursor));
   if((this.db.prepare('SELECT count(*) FROM events').pluck().get() as number)>100000||(this.db.prepare('SELECT coalesce(sum(byte_offset),0) FROM source_cursors').pluck().get() as number)>1024*1024*1024)throw new DomainError('INDEX_LIMIT','Index capacity reached; narrow the allowed sources.');
  }).immediate());
 }
}
