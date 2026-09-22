import type Database from 'better-sqlite3';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { controlEventSchema, contextManifestSchema, receiptInputSchema, receiptSummarySchema, canonicalDigest, controlIdSchema, type ControlEvent, type ContextManifestV1, type ReceiptInput, type ReceiptSummary, type RunFact, type ObservationHealth } from '../control-plane/contracts.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assertManifestDigest } from '../control-plane/manifest.js';

export interface ResponsibilityRecordInput { id: string; taskId: string; scope: string; roles: Record<string, string>; status: 'proposed'|'confirmed'|'ended'; evidenceIds: string[]; confirmedAt: string|null }
export interface RunObservation { observationId: string; runId: string; sessionId: string|null; runState: RunFact; health: ObservationHealth; observedAt: string|null; evidenceId: string|null }
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
    const events = input.map(item => validate(controlEventSchema, item));
    return transaction(this.db, () => {
      const inserted: string[] = [], duplicate: string[] = [];
      for (const event of events) {
        const digest = canonicalDigest(event); const existing = this.db.prepare('SELECT payload_digest,event_json FROM control_events WHERE event_id=?').get(event.eventId) as {payload_digest:string;event_json:string}|undefined;
        if (existing) { if (existing.payload_digest !== digest) throw new DomainError('REVISION_CONFLICT','Control event content conflicts with the existing event.'); duplicate.push(event.eventId); continue; }
        if (event.idempotencyKey) {
          const idem = this.db.prepare('SELECT payload_digest FROM control_events WHERE idempotency_key=?').get(event.idempotencyKey) as {payload_digest:string}|undefined;
          if (idem) { if (idem.payload_digest !== digest) throw new DomainError('REVISION_CONFLICT','Idempotency key was reused with different content.'); duplicate.push(event.eventId); continue; }
        }
        this.db.prepare('INSERT INTO control_events(event_id,idempotency_key,payload_digest,event_json,recorded_at) VALUES(?,?,?,?,?)').run(event.eventId,event.idempotencyKey,digest,JSON.stringify(event),event.recordedAt);
        for (const evidenceId of event.evidenceIds) this.db.prepare('INSERT OR IGNORE INTO control_event_evidence(event_id,evidence_id) VALUES(?,?)').run(event.eventId,evidenceId);
        inserted.push(event.eventId);
      }
      return { inserted, duplicate };
    });
  }
  readEvents(afterSequence = 0, limit = 1000): ControlEvent[] {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new DomainError('INVALID_INPUT','Invalid event page.');
    return (this.db.prepare('SELECT event_json FROM control_events WHERE sequence>? ORDER BY sequence LIMIT ?').pluck().all(afterSequence,limit) as string[]).map(body => validate(controlEventSchema, JSON.parse(body)));
  }
  readAllEvents(): ControlEvent[] {
    const events: ControlEvent[] = [];
    let afterSequence = 0;
    for (;;) {
      const page = this.readEvents(afterSequence, 1000);
      events.push(...page);
      if (page.length < 1000) return events;
      afterSequence += page.length;
    }
  }
  saveManifest(input: ContextManifestV1): void {
    const manifest = validate(contextManifestSchema, input);
    assertManifestDigest(manifest);
    transaction(this.db, () => { const existing = this.db.prepare('SELECT body_json FROM context_manifests WHERE handoff_id=?').pluck().get(manifest.handoffId) as string|undefined; if (existing) { if (existing !== JSON.stringify(manifest)) throw new DomainError('REVISION_CONFLICT','Context manifests are immutable.'); return; } this.db.prepare('INSERT INTO context_manifests(handoff_id,task_id,task_revision,digest,body_json,created_at) VALUES(?,?,?,?,?,?)').run(manifest.handoffId,manifest.taskId,manifest.taskRevision,manifest.digest,JSON.stringify(manifest),manifest.createdAt); });
  }
  getManifest(handoffId: string): ContextManifestV1|null { const body = this.db.prepare('SELECT body_json FROM context_manifests WHERE handoff_id=?').pluck().get(handoffId) as string|undefined; return body ? validate(contextManifestSchema, JSON.parse(body)) : null; }
  listManifests(taskId?: string): ContextManifestV1[] { const rows = (taskId === undefined ? this.db.prepare('SELECT body_json FROM context_manifests ORDER BY created_at,handoff_id').all() : this.db.prepare('SELECT body_json FROM context_manifests WHERE task_id=? ORDER BY created_at,handoff_id').all(taskId)) as { body_json: string }[]; return rows.map(row => validate(contextManifestSchema, JSON.parse(row.body_json))); }
  saveReceipt(input: ReceiptInput): ReceiptSummary {
    const receipt = validate(receiptInputSchema, input); const now = new Date().toISOString();
    return transaction(this.db, () => {
      const manifest = this.db.prepare('SELECT digest FROM context_manifests WHERE handoff_id=?').pluck().get(receipt.handoffId) as string|undefined;
      if (!manifest) throw new DomainError('CONTROL_COVERAGE_GAP','A prepared context manifest is required before accepting a receipt.');
      if (manifest !== receipt.manifestDigest) throw new DomainError('RECEIPT_DIGEST_MISMATCH','Receipt manifest digest does not match the prepared manifest.');
      const existing = this.db.prepare('SELECT * FROM handoff_receipts WHERE handoff_id=? AND nonce=?').get(receipt.handoffId,receipt.nonce) as Record<string, unknown>|undefined;
      if (existing) {
        const same = existing.target_session_id === receipt.targetSessionId && existing.target_run_id === receipt.targetRunId && existing.manifest_digest === receipt.manifestDigest && existing.stage === receipt.stage && existing.expires_at === receipt.expiresAt;
        if (!same) throw new DomainError('RECEIPT_NONCE_CONFLICT','Receipt nonce was already used for a different request.');
        return this.rowReceipt(existing);
      }
      const prepared = this.getManifest(receipt.handoffId)!;
      if (!prepared.targetSessionId || !prepared.targetRunId || prepared.targetSessionId !== receipt.targetSessionId || prepared.targetRunId !== receipt.targetRunId) throw new DomainError('RECEIPT_TARGET_MISMATCH','Receipt target does not match the prepared target.');
      if (receipt.stage === 'verified-complete') throw new DomainError('RECEIPT_VERIFICATION_REQUIRED','Verified completion requires an evidence-backed receipt transition.');
      const receiptId = `receipt-${canonicalDigest(receipt).slice(0,32)}`; const expired = Date.parse(receipt.expiresAt) <= Date.now(); const status = expired ? 'expired' : 'pending';
      this.db.prepare('INSERT INTO handoff_receipts(receipt_id,handoff_id,target_session_id,target_run_id,manifest_digest,stage,status,nonce,expires_at,created_at,confirmed_at,evidence_ids_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(receiptId,receipt.handoffId,receipt.targetSessionId,receipt.targetRunId,receipt.manifestDigest,receipt.stage,status,receipt.nonce,receipt.expiresAt,now,null,JSON.stringify([]));
      return this.rowReceipt(this.db.prepare('SELECT * FROM handoff_receipts WHERE receipt_id=?').get(receiptId) as Record<string, unknown>);
    });
  }
  listReceipts(handoffId: string): ReceiptSummary[] { return (this.db.prepare('SELECT * FROM handoff_receipts WHERE handoff_id=? ORDER BY created_at,receipt_id').all(handoffId) as Record<string, unknown>[]).map(row => this.rowReceipt(row)); }
  saveResponsibility(record: ResponsibilityRecordInput): void { const value=validate(responsibilitySchema,record); transaction(this.db,()=>this.db.prepare('INSERT INTO responsibility_edges(id,task_id,scope,roles_json,status,evidence_ids_json,confirmed_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,scope=excluded.scope,roles_json=excluded.roles_json,status=excluded.status,evidence_ids_json=excluded.evidence_ids_json,confirmed_at=excluded.confirmed_at').run(value.id,value.taskId,value.scope,JSON.stringify(value.roles),value.status,JSON.stringify(value.evidenceIds),value.confirmedAt)); }
  saveRunObservation(observation: RunObservation): void { const value=validate(observationSchema,observation); transaction(this.db,()=>this.db.prepare('INSERT OR REPLACE INTO run_observations(observation_id,run_id,session_id,run_state,health,observed_at,evidence_id) VALUES(?,?,?,?,?,?,?)').run(value.observationId,value.runId,value.sessionId,value.runState,value.health,value.observedAt,value.evidenceId)); }
  private rowReceipt(row: Record<string, unknown>): ReceiptSummary { const status = row.status === 'pending' && Date.parse(String(row.expires_at)) <= Date.now() ? 'expired' : row.status; return validate(receiptSummarySchema,{ receiptId: row.receipt_id, handoffId: row.handoff_id, targetSessionId: row.target_session_id, targetRunId: row.target_run_id, manifestDigest: row.manifest_digest, stage: row.stage, status, nonce: row.nonce, expiresAt: row.expires_at, createdAt: row.created_at, confirmedAt: row.confirmed_at, evidenceIds: JSON.parse(String(row.evidence_ids_json)) }); }
}
