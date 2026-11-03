import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { controlEventSchema, contextManifestSchema, receiptInputSchema, receiptSummarySchema, canonicalDigest, controlIdSchema, type ControlEvent, type ContextManifestV1, type ReceiptInput, type ReceiptSummary, type RunFact, type ObservationHealth } from '../control-plane/contracts.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assertManifestDigest } from '../control-plane/manifest.js';
import { assertReceiptInputAllowed, receiptStageOrder, sameReceiptIdentity } from '../control-plane/receipts.js';

import { isPublicManifest, privateControlKey, protectControlEvent } from '../control-plane/privacy.js';
import { rebuildControlState, type ControlState } from '../control-plane/reducer.js';
import { asImportedControlEvent } from '../control-plane/import.js';

const attestationSchema = receiptInputSchema.pick({ handoffId:true, targetSessionId:true, targetRunId:true, manifestDigest:true }).extend({
  receiptId:controlIdSchema, taskId:controlIdSchema, stage:z.enum(['received','verified-complete']),
}).strict();
const confirmationSchema = z.object({receiptId:controlIdSchema,stage:attestationSchema.shape.stage,evidenceIds:z.array(controlIdSchema).min(1).max(128)}).strict();
export type ReceiptAttestation = z.infer<typeof attestationSchema>;
export type ReceiptConfirmation = z.infer<typeof confirmationSchema>;

export interface ResponsibilityRecordInput { id: string; taskId: string; scope: string; roles: Record<string, string>; status: 'proposed'|'confirmed'|'ended'; evidenceIds: string[]; confirmedAt: string|null }
export interface RunObservation { observationId: string; runId: string; sessionId: string|null; runState: RunFact; health: ObservationHealth; observedAt: string|null; evidenceId: string|null }
interface EventRow {event_json:string;sequence:number}
const responsibilitySchema = z.object({ id: controlIdSchema, taskId: controlIdSchema, scope: z.string().min(1).max(160), roles: z.record(controlIdSchema), status: z.enum(['proposed','confirmed','ended']), evidenceIds: z.array(controlIdSchema).max(128), confirmedAt: z.string().datetime({ offset: true }).nullable() }).strict().superRefine((value, ctx) => { if (Object.keys(value.roles).length > 16) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Too many roles.' }); });
const observationSchema = z.object({ observationId: z.string().min(1).max(512), runId: z.string().min(1).max(512), sessionId: z.string().min(1).max(512).nullable(), runState: z.enum(['running','waiting','interrupted','ended','unknown']), health: z.enum(['current','stale','missing-receipt','coverage-gap','unverified']), observedAt: z.string().datetime({ offset: true }).nullable(), evidenceId: z.string().min(1).max(512).nullable() }).strict();
const sql = (() => { try { return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../migrations/005-control-plane.sql'), 'utf8'); } catch { return ''; } })();
const fallbackSql = `CREATE TABLE IF NOT EXISTS control_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,idempotency_key TEXT UNIQUE,payload_digest TEXT NOT NULL,event_json TEXT NOT NULL CHECK(json_valid(event_json)),recorded_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS control_event_evidence(event_id TEXT NOT NULL,evidence_id TEXT NOT NULL,PRIMARY KEY(event_id,evidence_id)); CREATE TABLE IF NOT EXISTS session_lineage(id TEXT PRIMARY KEY,parent_session_id TEXT NOT NULL,child_session_id TEXT NOT NULL,relation TEXT NOT NULL,evidence_level TEXT NOT NULL,status TEXT NOT NULL,evidence_ids_json TEXT NOT NULL,occurred_at TEXT); CREATE TABLE IF NOT EXISTS responsibility_edges(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,scope TEXT NOT NULL,roles_json TEXT NOT NULL,status TEXT NOT NULL,evidence_ids_json TEXT NOT NULL,confirmed_at TEXT); CREATE TABLE IF NOT EXISTS context_manifests(handoff_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,task_revision INTEGER NOT NULL,digest TEXT NOT NULL,body_json TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS handoff_receipts(receipt_id TEXT PRIMARY KEY,handoff_id TEXT NOT NULL,target_session_id TEXT NOT NULL,target_run_id TEXT NOT NULL,manifest_digest TEXT NOT NULL,stage TEXT NOT NULL,status TEXT NOT NULL,nonce TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,confirmed_at TEXT,evidence_ids_json TEXT NOT NULL,UNIQUE(handoff_id,nonce)); CREATE TABLE IF NOT EXISTS run_observations(observation_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,session_id TEXT,run_state TEXT NOT NULL,health TEXT NOT NULL,observed_at TEXT,evidence_id TEXT); CREATE TABLE IF NOT EXISTS attention_items(id TEXT PRIMARY KEY,kind TEXT NOT NULL,severity TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL,evidence_ids_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS projection_cursors(name TEXT PRIMARY KEY,sequence INTEGER NOT NULL);`;
export function ensureControlPlaneSchema(db: Database.Database): void { db.exec(sql || fallbackSql); }
function validate<T>(schema: { parse(input: unknown): T }, value: unknown): T { try { return schema.parse(value); } catch { throw new DomainError('INVALID_INPUT', 'Invalid control plane input.'); } }
function transaction<T>(db: Database.Database, fn: () => T): T { try { return db.transaction(fn).immediate(); } catch (error) { if (error instanceof DomainError) throw error; const code = (error as { code?: string }).code; if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') throw new DomainError('STORAGE_BUSY','Storage is busy; retry the short transaction.'); throw new DomainError('IO_FAILED','Control plane storage operation failed.'); } }
export class ControlPlaneStore {
  constructor(private readonly db: Database.Database) { ensureControlPlaneSchema(db); }
  appendEvents(input: readonly ControlEvent[]): { inserted: string[]; duplicate: string[] } {
    return this.append(input, 'observed');
  }
  appendImportedEvents(input: readonly ControlEvent[]): { inserted: string[]; duplicate: string[] } {
    return this.append(input, 'imported');
  }
  /** In-process authority for a verified integration or an authenticated user action. */
  appendAuthorizedEvents(input: readonly ControlEvent[]): { inserted: string[]; duplicate: string[] } {
    if(input.some(event=>!['lineage.relation','responsibility.confirmed','responsibility.ended'].includes(event.type))){
      throw new DomainError('INVALID_INPUT','This writer only authorizes lineage and responsibility decisions.');
    }
    return this.append(input,'authorized');
  }
  private append(input: readonly ControlEvent[], origin: 'observed'|'imported'|'authorized'): { inserted: string[]; duplicate: string[] } {
    const events = input.map(item => validate(controlEventSchema, item));
    const imported=origin==='imported';
    return transaction(this.db, () => {
      const inserted: string[] = [], duplicate: string[] = [];
      for (const raw of events) {
        const classified = imported ? asImportedControlEvent(raw) : raw;
        const event = protectControlEvent(classified);
        const digest = canonicalDigest(classified);
        // Keep the original digest for replay integrity even when the public
        // forms of two different credential strings are identical.
        const isRetry = (previous: string) => previous===digest || (imported && previous===canonicalDigest(raw));
        const existing = this.db.prepare('SELECT payload_digest FROM control_events WHERE event_id IN (?,?)').pluck().get(event.eventId,raw.eventId) as string|undefined;
        if (existing) { if (!isRetry(existing)) throw new DomainError('REVISION_CONFLICT','Control event content conflicts with the existing event.'); duplicate.push(event.eventId); continue; }
        if (event.idempotencyKey) {
          const idem = this.db.prepare('SELECT payload_digest FROM control_events WHERE idempotency_key IN (?,?)').pluck().get(event.idempotencyKey,raw.idempotencyKey) as string|undefined;
          if (idem) { if (!isRetry(idem)) throw new DomainError('REVISION_CONFLICT','Idempotency key was reused with different content.'); duplicate.push(event.eventId); continue; }
        }
        this.db.prepare('INSERT INTO control_events(event_id,idempotency_key,payload_digest,event_json,recorded_at) VALUES(?,?,?,?,?)').run(event.eventId,event.idempotencyKey,digest,JSON.stringify(event),event.recordedAt);
        // A duplicate or previously imported row can never acquire authority.
        if(origin==='authorized')this.db.prepare('INSERT INTO control_event_authority(event_id) VALUES(?)').run(event.eventId);
        for (const evidenceId of event.evidenceIds) this.db.prepare('INSERT OR IGNORE INTO control_event_evidence(event_id,evidence_id) VALUES(?,?)').run(event.eventId,evidenceId);
        inserted.push(event.eventId);
      }
      return { inserted, duplicate };
    });
  }
  projectState(taskId?: string): ControlState {
    return this.db.transaction(()=>{
      const manifests=this.listManifests(taskId);
      const handoffs=new Set(manifests.map(manifest=>manifest.handoffId));
      const receipts=taskId===undefined?this.listAllReceipts():this.listReceiptsForTask(taskId);
      const authorityQuery='SELECT e.event_json FROM control_event_authority a JOIN control_events e ON a.event_id=e.event_id';
      const rows=taskId===undefined ? this.db.prepare(authorityQuery).pluck().all()
        : this.db.prepare(authorityQuery+" WHERE json_extract(e.event_json,'$.taskId') IN (?,?)").pluck().all(taskId,privateControlKey(taskId));
      const authorizedEvents=new Map<string,string>();
      for(const body of rows as string[]){
        const parsed=controlEventSchema.safeParse(JSON.parse(body));
        if(parsed.success){
          const event=protectControlEvent(parsed.data);
          authorizedEvents.set(event.eventId,canonicalDigest(event));
        }
      }
      return rebuildControlState(taskId===undefined?this.readAllEvents():this.readTaskEvents(taskId),{
        manifests,receipts:receipts.filter(receipt=>handoffs.has(receipt.handoffId)),authorizedEvents,
      });
    })();
  }
  readEvents(afterSequence = 0, limit = 1000): ControlEvent[] {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new DomainError('INVALID_INPUT','Invalid event page.');
    return (this.db.prepare('SELECT event_json,sequence FROM control_events WHERE sequence>? ORDER BY sequence LIMIT ?').all(afterSequence,limit) as EventRow[]).map(row => this.replayRow(row));
  }
  readAllEvents(): ControlEvent[] {
    const events: ControlEvent[] = [];
    for(const row of this.db.prepare('SELECT event_json,sequence FROM control_events ORDER BY sequence').iterate())events.push(this.replayRow(row as EventRow));
    return events;
  }
  readTaskEvents(taskId:string):ControlEvent[]{return this.readScopedEvents('taskId',taskId);}
  readRunEvents(runId:string):ControlEvent[]{return this.readScopedEvents('runId',runId);}
  private readScopedEvents(field:'taskId'|'runId',value:string):ControlEvent[]{
    const id=validate(controlIdSchema,value),events:ControlEvent[]=[];
    for(const row of this.db.prepare(`SELECT event_json,sequence FROM control_events WHERE json_extract(event_json,'$.${field}') IN (?,?) ORDER BY sequence`).iterate(id,privateControlKey(id)))events.push(this.replayRow(row as EventRow));
    return events;
  }
  private replayRow(row: EventRow): ControlEvent {
    const raw:unknown = JSON.parse(row.event_json);
    const parsed = controlEventSchema.safeParse(raw);
    if (parsed.success) return protectControlEvent(parsed.data);
    const taskId = controlIdSchema.safeParse(raw && typeof raw==='object' && 'taskId' in raw ? raw.taskId : null);
    // The database sequence is internal and always valid, even if the
    // envelope was written by an older build or independently damaged.
    return controlEventSchema.parse({
      eventId:`invalid-stored-event:${row.sequence}`,protocol:'threadport.control-event.v1',occurredAt:null,
      recordedAt:'1970-01-01T00:00:00.000Z',taskId:taskId.success&&taskId.data?privateControlKey(taskId.data):null,sessionId:null,runId:null,ordinal:null,
      source:{kind:'threadport',sourceId:'control-storage',coverage:'full',parserVersion:null},
      type:'attention.opened',payload:{kind:'invalid-stored-event',severity:'warning',message:'A stored control event is invalid and was excluded.'},
      idempotencyKey:null,evidenceIds:[],
    });
  }
  saveManifest(input: ContextManifestV1): void {
    const manifest = validate(contextManifestSchema, input);
    assertManifestDigest(manifest);
    if (!isPublicManifest(manifest)) throw new DomainError('REDACTION_REQUIRED','Remove private content and recompute the manifest digest before saving.');
    transaction(this.db, () => { const existing = this.db.prepare('SELECT body_json FROM context_manifests WHERE handoff_id=?').pluck().get(manifest.handoffId) as string|undefined; if (existing) { if (existing !== JSON.stringify(manifest)) throw new DomainError('REVISION_CONFLICT','Context manifests are immutable.'); return; } this.db.prepare('INSERT INTO context_manifests(handoff_id,task_id,task_revision,digest,body_json,created_at) VALUES(?,?,?,?,?,?)').run(manifest.handoffId,manifest.taskId,manifest.taskRevision,manifest.digest,JSON.stringify(manifest),manifest.createdAt); });
  }
  getManifest(handoffId: string): ContextManifestV1|null { const body = this.db.prepare('SELECT body_json FROM context_manifests WHERE handoff_id=?').pluck().get(handoffId) as string|undefined; if (!body) return null; const manifest = validate(contextManifestSchema, JSON.parse(body)); assertManifestDigest(manifest); return isPublicManifest(manifest)?manifest:null; }
  saveReceipt(input: ReceiptInput): ReceiptSummary {
    const receipt = validate(receiptInputSchema, input); const now = new Date().toISOString();
    assertReceiptInputAllowed(receipt);
    if (privateControlKey(receipt.nonce)!==receipt.nonce) throw new DomainError('REDACTION_REQUIRED','Use a fresh receipt nonce without private content.');
    return transaction(this.db, () => {
      const manifest = this.db.prepare('SELECT digest FROM context_manifests WHERE handoff_id=?').pluck().get(receipt.handoffId) as string|undefined;
      if (!manifest) throw new DomainError('CONTROL_COVERAGE_GAP','A prepared context manifest is required before accepting a receipt.');
      if (manifest !== receipt.manifestDigest) throw new DomainError('RECEIPT_DIGEST_MISMATCH','Receipt manifest digest does not match the prepared manifest.');
      const prepared = this.getManifest(receipt.handoffId);
      if (!prepared) throw new DomainError('CONTROL_COVERAGE_GAP','A public prepared manifest is required before accepting a receipt.');
      if (!prepared.targetSessionId || !prepared.targetRunId || prepared.targetSessionId !== receipt.targetSessionId || prepared.targetRunId !== receipt.targetRunId) throw new DomainError('RECEIPT_TARGET_MISMATCH','Receipt target does not match the prepared target.');
      const receiptId = `receipt-${canonicalDigest(receipt).slice(0,32)}`;
      const existing = this.db.prepare('SELECT * FROM handoff_receipts WHERE handoff_id=? AND nonce=?').get(receipt.handoffId,receipt.nonce) as Record<string, unknown>|undefined;
      if (existing) {
        const saved = this.rowReceipt(existing);
        if (!sameReceiptIdentity(saved,receipt) || existing.receipt_id !== receiptId) throw new DomainError('RECEIPT_NONCE_CONFLICT','Receipt nonce was already used for a different request.');
        return saved;
      }
      const expired = Date.parse(receipt.expiresAt) <= Date.now(); const status = expired ? 'expired' : 'pending';
      this.db.prepare('INSERT INTO handoff_receipts(receipt_id,handoff_id,target_session_id,target_run_id,manifest_digest,stage,status,nonce,expires_at,created_at,confirmed_at,evidence_ids_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(receiptId,receipt.handoffId,receipt.targetSessionId,receipt.targetRunId,receipt.manifestDigest,receipt.stage,status,receipt.nonce,receipt.expiresAt,now,null,JSON.stringify([]));
      return this.rowReceipt(this.db.prepare('SELECT * FROM handoff_receipts WHERE receipt_id=?').get(receiptId) as Record<string, unknown>);
    });
  }
  /**
   * Trusted in-process boundary: a local reviewer or verifier attests to an
   * independently checked result. No event import or receipt HTTP route calls this.
   * The returned ID identifies a stored attestation, never a source-log ID.
   */
  recordReceiptAttestation(input: ReceiptAttestation): string {
    const claim = validate(attestationSchema, input);
    return transaction(this.db, () => {
      const receipt = this.receiptById(claim.receiptId), manifest = this.getManifest(claim.handoffId);
      if (!receipt || !manifest || !this.matchesPrepared(receipt, manifest) || claim.taskId !== manifest.taskId
        || claim.handoffId !== receipt.handoffId || claim.targetSessionId !== receipt.targetSessionId
        || claim.targetRunId !== receipt.targetRunId || claim.manifestDigest !== receipt.manifestDigest) {
        throw new DomainError('RECEIPT_TARGET_MISMATCH','Attestation must match the persisted receipt and prepared task and target.');
      }
      const now = new Date().toISOString();
      if (Date.parse(receipt.expiresAt) <= Date.parse(now) || receipt.status === 'rejected' || receipt.status === 'expired'
        || (receipt.status === 'confirmed' && receipt.stage === 'verified-complete') || receiptStageOrder(claim.stage) < receiptStageOrder(receipt.stage)) {
        throw new DomainError('REVISION_CONFLICT','The receipt cannot accept an attestation for this stage.');
      }
      const id = `attestation-${randomUUID()}`;
      this.db.prepare('INSERT INTO receipt_attestations(id,receipt_id,task_id,handoff_id,target_session_id,target_run_id,manifest_digest,stage,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id,claim.receiptId,claim.taskId,claim.handoffId,claim.targetSessionId,claim.targetRunId,claim.manifestDigest,claim.stage,now);
      return id;
    });
  }
  confirmReceipt(input: ReceiptConfirmation): ReceiptSummary {
    const claim = validate(confirmationSchema, input);
    const ids = [...new Set(claim.evidenceIds)].sort();
    return transaction(this.db, () => {
      const receipt = this.receiptById(claim.receiptId);
      if (!receipt) throw new DomainError('NOT_FOUND','Receipt does not exist.');
      if (receipt.status === 'confirmed' && receipt.stage === claim.stage && canonicalDigest(receipt.evidenceIds) === canonicalDigest(ids)) return receipt;
      const now = new Date().toISOString();
      if (receipt.status === 'expired' || receipt.status === 'rejected' || Date.parse(receipt.expiresAt) <= Date.parse(now)
        || (receipt.status === 'confirmed' && receiptStageOrder(claim.stage) <= receiptStageOrder(receipt.stage))
        || receiptStageOrder(claim.stage) < receiptStageOrder(receipt.stage)) {
        throw new DomainError('REVISION_CONFLICT','Receipt stages cannot move backwards or replace a completed confirmation.');
      }
      if (!this.hasAttestations(receipt,claim.stage,ids,now)) throw new DomainError('RECEIPT_VERIFICATION_REQUIRED','Confirmation requires stored attestations for this receipt and stage.');
      this.db.prepare("UPDATE handoff_receipts SET stage=?,status='confirmed',confirmed_at=?,evidence_ids_json=? WHERE receipt_id=?")
        .run(claim.stage,now,JSON.stringify(ids),receipt.receiptId);
      return {...receipt,stage:claim.stage,status:'confirmed',confirmedAt:now,evidenceIds:ids};
    });
  }
  private receiptById(id: string): ReceiptSummary|null {
    const row = this.db.prepare('SELECT * FROM handoff_receipts WHERE receipt_id=?').get(id) as Record<string, unknown>|undefined;
    return row ? this.rowReceipt(row) : null;
  }
  private matchesPrepared(receipt: ReceiptInput, manifest: ContextManifestV1): boolean {
    return receipt.handoffId===manifest.handoffId && receipt.manifestDigest===manifest.digest
      && receipt.targetSessionId===manifest.targetSessionId && receipt.targetRunId===manifest.targetRunId;
  }
  private hasAttestations(receipt: ReceiptSummary, stage: ReceiptInput['stage'], ids: string[], at: string): boolean {
    const manifest = this.getManifest(receipt.handoffId);
    if (!manifest || !this.matchesPrepared(receipt,manifest) || !ids.length || Date.parse(at)>=Date.parse(receipt.expiresAt)) return false;
    const evidence = this.db.prepare('SELECT recorded_at FROM receipt_attestations WHERE id=? AND receipt_id=? AND task_id=? AND handoff_id=? AND target_session_id=? AND target_run_id=? AND manifest_digest=? AND stage=?').pluck();
    return ids.every(id => {
      const recorded = evidence.get(id,receipt.receiptId,manifest.taskId,receipt.handoffId,receipt.targetSessionId,receipt.targetRunId,receipt.manifestDigest,stage);
      return typeof recorded==='string' && Date.parse(recorded)>=Date.parse(receipt.createdAt) && Date.parse(recorded)<=Date.parse(at);
    });
  }
  listReceipts(handoffId: string): ReceiptSummary[] { return (this.db.prepare('SELECT * FROM handoff_receipts WHERE handoff_id=? ORDER BY created_at,receipt_id').all(handoffId) as Record<string, unknown>[]).map(row => this.rowReceipt(row)); }
  listAllReceipts():ReceiptSummary[]{return (this.db.prepare('SELECT r.* FROM handoff_receipts r JOIN context_manifests m ON m.handoff_id=r.handoff_id ORDER BY r.created_at,r.receipt_id').all() as Record<string,unknown>[]).map(row=>this.rowReceipt(row));}
  listManifests(taskId?: string): ContextManifestV1[] {
    const rows = (taskId === undefined
      ? this.db.prepare('SELECT body_json FROM context_manifests ORDER BY created_at,handoff_id').all()
      : this.db.prepare('SELECT body_json FROM context_manifests WHERE task_id=? ORDER BY created_at,handoff_id').all(taskId)) as { body_json: string }[];
    return rows.map(row => { const manifest = validate(contextManifestSchema, JSON.parse(row.body_json)); assertManifestDigest(manifest); return manifest; }).filter(isPublicManifest);
  }
  listReceiptsForTask(taskId: string): ReceiptSummary[] {
    return (this.db.prepare('SELECT r.* FROM handoff_receipts r JOIN context_manifests m ON m.handoff_id=r.handoff_id WHERE m.task_id=? ORDER BY r.created_at,r.receipt_id').all(taskId) as Record<string, unknown>[]).map(row => this.rowReceipt(row));
  }
  saveResponsibility(record: ResponsibilityRecordInput): void { const value=validate(responsibilitySchema,record); transaction(this.db,()=>this.db.prepare('INSERT INTO responsibility_edges(id,task_id,scope,roles_json,status,evidence_ids_json,confirmed_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,scope=excluded.scope,roles_json=excluded.roles_json,status=excluded.status,evidence_ids_json=excluded.evidence_ids_json,confirmed_at=excluded.confirmed_at').run(value.id,value.taskId,value.scope,JSON.stringify(value.roles),value.status,JSON.stringify(value.evidenceIds),value.confirmedAt)); }
  saveRunObservation(observation: RunObservation): void { const value=validate(observationSchema,observation); transaction(this.db,()=>this.db.prepare('INSERT OR REPLACE INTO run_observations(observation_id,run_id,session_id,run_state,health,observed_at,evidence_id) VALUES(?,?,?,?,?,?,?)').run(value.observationId,value.runId,value.sessionId,value.runState,value.health,value.observedAt,value.evidenceId)); }
  private rowReceipt(row: Record<string, unknown>): ReceiptSummary { const receipt = validate(receiptSummarySchema,{ receiptId: row.receipt_id, handoffId: row.handoff_id, targetSessionId: row.target_session_id, targetRunId: row.target_run_id, manifestDigest: row.manifest_digest, stage: row.stage, status: row.status==='pending'&&Date.parse(String(row.expires_at))<=Date.now()?'expired':row.status, nonce: typeof row.nonce==='string'?privateControlKey(row.nonce):row.nonce, expiresAt: row.expires_at, createdAt: row.created_at, confirmedAt: row.confirmed_at, evidenceIds: JSON.parse(String(row.evidence_ids_json)) });
    if ((receipt.status==='confirmed' || receipt.stage==='verified-complete') && (!receipt.confirmedAt || !this.hasAttestations(receipt,receipt.stage,receipt.evidenceIds,receipt.confirmedAt))) {
      return {...receipt,stage:receipt.stage==='verified-complete'?'reported-complete':receipt.stage,status:'unknown',confirmedAt:null};
    }
    return receipt;
  }
}
