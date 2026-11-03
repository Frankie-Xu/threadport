import { controlEventSchema, contextManifestSchema, receiptInputSchema, receiptSummarySchema, controlIdSchema, type ControlEvent, type ContextManifestV1, type ObservationHealth, type ReceiptSummary, type ReceiptInput, type RunFact, type SafePayload, canonicalDigest, lineagePayloadSchema, lineageRelations, lineageEvidenceLevels, responsibilityPayloadSchema, attentionPayloadSchema } from './contracts.js';
import { protectControlEvent } from './privacy.js';
import { assertManifestDigest } from './manifest.js';
import { receiptStageOrder, sameReceiptIdentity } from './receipts.js';

export type EvidenceLevel = typeof lineageEvidenceLevels[number];
export type LineageRelation = typeof lineageRelations[number];
export interface SessionProjection { runState: RunFact; health: ObservationHealth; lastEvidenceId: string | null; lastOccurredAt: string | null }
export interface LineageRecord { id: string; parentSessionId: string; childSessionId: string; relation: LineageRelation; evidenceLevel: EvidenceLevel; status: 'candidate' | 'confirmed' | 'rejected'; evidenceIds: string[]; occurredAt: string | null }
export interface ResponsibilityRecord { id: string; taskId: string; scope: string; roles: Partial<Record<'initiator' | 'authorizer' | 'dispatcher' | 'executor' | 'reviewer' | 'next-owner', string>>; status: 'proposed' | 'confirmed' | 'ended'; evidenceIds: string[]; confirmedAt: string | null }
export interface AttentionItem { id: string; kind: string; severity: 'info' | 'warning' | 'error'; message: string; status: 'open' | 'resolved'; evidenceIds: string[] }
export interface ControlState {
  sessions: Record<string, SessionProjection>;
  lineage: LineageRecord[];
  responsibilities: ResponsibilityRecord[];
  manifests: Record<string, ContextManifestV1>;
  receipts: Record<string, ReceiptSummary>;
  attention: AttentionItem[];
}
const eventLogs = new WeakMap<object, ControlEvent[]>();
const eventConflicts=new WeakMap<object,ReadonlySet<string>>();
const dictionary=<T>():Record<string,T>=>Object.create(null) as Record<string,T>;
const newControlState=():ControlState=>({sessions:dictionary(),lineage:[],responsibilities:[],manifests:dictionary(),receipts:dictionary(),attention:[]});
export const emptyControlState = (): ControlState => { const state=newControlState(); eventLogs.set(state, []); return state; };

function eventOrder(a: ControlEvent, b: ControlEvent): number {
  const ordinalA = a.ordinal === null ? Number.MAX_SAFE_INTEGER : a.ordinal;
  const ordinalB = b.ordinal === null ? Number.MAX_SAFE_INTEGER : b.ordinal;
  return ordinalA - ordinalB || (a.occurredAt ?? '\uffff').localeCompare(b.occurredAt ?? '\uffff') || a.eventId.localeCompare(b.eventId) || a.recordedAt.localeCompare(b.recordedAt);
}
function payload(event: ControlEvent): Record<string, SafePayload> {
  const value=event.payload;
  return value && typeof value==='object' && !Array.isArray(value) ? value : {};
}
function observedHealth(event: ControlEvent): ObservationHealth { return event.source.kind === 'agent-report' ? 'unverified' : event.source.coverage !== 'full' ? 'coverage-gap' : 'current'; }
function addAttention(state: ControlState, item: AttentionItem): void {
  const existing = state.attention.find(value => value.id === item.id);
  if (existing) return;
  state.attention.push(item);
}
function retainConflicts(state:ControlState,conflicts:Iterable<string>):void{
  const ids=new Set(conflicts);
  for(const eventId of ids)addAttention(state,{id:`conflict:${eventId}`,kind:'event-conflict',severity:'error',message:'The same event ID was replayed with different content.',status:'open',evidenceIds:[eventId]});
  state.attention.sort((a,b)=>a.id.localeCompare(b.id));
  eventConflicts.set(state,ids);
}
function receiptPayload(event: ControlEvent): Record<string, unknown> {
  const value = payload(event).receipt;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : payload(event);
}
function receiptSummary(event: ControlEvent, input: ReceiptInput, receiptId: string, status: ReceiptSummary['status'], stage: ReceiptInput['stage']): ReceiptSummary {
  return receiptSummarySchema.parse({
    ...input,
    receiptId,
    stage,
    status,
    createdAt: event.recordedAt,
    confirmedAt: status === 'confirmed' ? event.occurredAt ?? event.recordedAt : null,
    evidenceIds: [...new Set([event.eventId, ...event.evidenceIds])].slice(0, 128),
  });
}
function receiptAttention(state: ControlState, event: ControlEvent, kind: string, message: string): void {
  addAttention(state, { id: `receipt:${kind}:${event.eventId}`, kind, severity: 'warning', message, status: 'open', evidenceIds: [...new Set([...event.evidenceIds, event.eventId])] });
}
interface PreparedState {
  manifests: readonly ContextManifestV1[];
  receipts: readonly ReceiptSummary[];
  authorizedEvents?: ReadonlyMap<string,string>;
}
function authorized(event: ControlEvent, prepared?: PreparedState): boolean {
  const digest=prepared?.authorizedEvents?.get(event.eventId);
  return digest!==undefined && canonicalDigest(event)===digest;
}
function project(events: readonly ControlEvent[], prepared?: PreparedState): ControlState {
  const state=newControlState();
  for (const manifest of prepared?.manifests ?? []) state.manifests[manifest.handoffId]=manifest;
  const persisted=new Set<string>(), nonces=new Map<string,string>();
  const nonceKey=(receipt:ReceiptInput)=>`${receipt.handoffId}\0${receipt.nonce}`;
  for (const receipt of prepared?.receipts ?? []) {
    state.receipts[receipt.receiptId]=receipt;
    persisted.add(receipt.receiptId); nonces.set(nonceKey(receipt),receipt.receiptId);
  }
  for (const event of [...events].sort(eventOrder)) {
    const p = payload(event);
    const runId = event.sessionId ?? event.runId;
    if (runId && /^run\./.test(event.type)) {
      const current = state.sessions[runId];
      const runState: RunFact = event.type === 'run.started' ? 'running' : event.type === 'run.waiting' ? 'waiting' : event.type === 'run.interrupted' ? 'interrupted' : event.type === 'run.ended' ? 'ended' : 'unknown';
      if (runState !== 'unknown') state.sessions[runId] = { runState, health: observedHealth(event), lastEvidenceId: event.evidenceIds.at(-1) ?? event.eventId, lastOccurredAt: event.occurredAt };
      else if (!current) state.sessions[runId] = { runState, health: observedHealth(event), lastEvidenceId: event.evidenceIds.at(-1) ?? event.eventId, lastOccurredAt: event.occurredAt };
    }
    if (event.type === 'lineage.relation') {
      const result=lineagePayloadSchema.safeParse(p);
      if (!result.success) continue;
      const claim=result.data;
      const {childSessionId,relation}=claim;
      const parentSessionId=claim.parentSessionId??event.sessionId;
      // Compaction preserves a single vendor session.
      if (!parentSessionId || relation==='compact' && parentSessionId!==childSessionId) continue;
      const trusted=authorized(event,prepared);
      const evidenceLevel=trusted ? claim.evidenceLevel??'inferred' : 'inferred';
      const id=claim.id??`${parentSessionId}:${childSessionId}:${relation}`;
      const current=state.lineage.find(item=>item.id===id);
      if (current && current.status!=='candidate' && !trusted) continue;
      const status=trusted && claim.status==='rejected'?'rejected':evidenceLevel!=='inferred'?'confirmed':'candidate';
      if (current && current.status!=='candidate' && status==='candidate') continue;
      const record:LineageRecord={
        id,parentSessionId,childSessionId,relation,status,evidenceLevel,occurredAt:event.occurredAt,
        evidenceIds:[...new Set([...event.evidenceIds,event.eventId])],
      };
      if (!current) state.lineage.push(record);
      else if (trusted) Object.assign(current,record);
      else if (current.parentSessionId===parentSessionId && current.childSessionId===childSessionId && current.relation===relation) {
        current.evidenceIds=[...new Set([...current.evidenceIds,...record.evidenceIds])];
      }
    }
    if (event.type === 'responsibility.proposed' || event.type === 'responsibility.confirmed' || event.type === 'responsibility.ended') {
      const result=responsibilityPayloadSchema.safeParse(p);
      if (!result.success) continue;
      const claim=result.data;
      const taskId=event.taskId??claim.taskId??'unknown';
      const scope=claim.scope??'task';
      const id=claim.id??claim.responsibilityId??`${taskId}:${scope}`;
      const current=state.responsibilities.find(item=>item.id===id&&item.taskId===taskId);
      const trusted=authorized(event,prepared);
      if (current?.status==='ended' || current?.status==='confirmed' && !trusted) continue;
      const evidenceIds=[...new Set([...event.evidenceIds,event.eventId])];
      if (event.type==='responsibility.ended') {
        if (trusted && current?.status==='confirmed') {
          current.status='ended';
          current.evidenceIds=[...new Set([...current.evidenceIds,...evidenceIds])];
        }
        continue;
      }
      const status=trusted && event.type==='responsibility.confirmed'?'confirmed':'proposed';
      // A confirmed action replaces the untrusted candidate. It cannot
      // inherit roles, evidence, or a scope supplied by an earlier import.
      const previous=current?.status===status?current:undefined;
      const roles={...previous?.roles,...claim.roles};
      if(claim.ownerSessionId&&!roles.executor)roles.executor=claim.ownerSessionId;
      const record:ResponsibilityRecord={
        id,taskId,scope,roles,status,evidenceIds:[...new Set([...(previous?.evidenceIds??[]),...evidenceIds])],
        confirmedAt:status==='confirmed'?event.occurredAt??event.recordedAt:null,
      };
      if(current)Object.assign(current,record);
      else state.responsibilities.push(record);
    }
    if (event.type === 'manifest.saved' && typeof p.handoffId === 'string') {
      const parsed = contextManifestSchema.safeParse(p.manifest);
      if (!parsed.success||parsed.data.handoffId!==p.handoffId||parsed.data.taskId!==event.taskId) receiptAttention(state, event, 'manifest-integrity', 'Prepared manifest is invalid or belongs to another handoff.');
      else {
        try {
          assertManifestDigest(parsed.data);
          const current=state.manifests[p.handoffId];
          if(current&&canonicalDigest(current)!==canonicalDigest(parsed.data))receiptAttention(state,event,'manifest-conflict','A prepared manifest cannot be replaced by different replayed content.');
          else state.manifests[p.handoffId] = parsed.data;
        }
        catch { receiptAttention(state, event, 'manifest-integrity', 'Prepared manifest digest does not match its contents.'); }
      }
    }
    if (event.type === 'attention.opened' || event.type === 'attention.resolved') {
      const result=attentionPayloadSchema.safeParse(p);
      if (!result.success) continue;
      const claim=result.data;
      if (event.type==='attention.opened') {
        addAttention(state,{
          id:claim.id??event.eventId,kind:claim.kind??'unknown',severity:claim.severity??'info',
          message:claim.message??'Control plane attention required.',status:'open',
          evidenceIds:[...new Set([...event.evidenceIds,event.eventId])],
        });
      } else {
        const item=state.attention.find(value=>value.id===claim.id);
        if(item)item.status='resolved';
      }
    }
    if (event.source.coverage !== 'full') addAttention(state, { id: `coverage:${event.source.sourceId}:${event.type}`, kind: 'coverage-gap', severity: 'warning', message: 'Evidence source coverage is incomplete.', status: 'open', evidenceIds: [...new Set([...event.evidenceIds, event.eventId])] });
    if (event.type === 'handoff.reported-complete' || event.type === 'run.ended' && event.source.kind === 'agent-report') addAttention(state, { id: `unverified:${event.eventId}`, kind: 'unverified-completion', severity: 'warning', message: 'Agent-reported completion requires verification evidence.', status: 'open', evidenceIds: [...new Set([...event.evidenceIds, event.eventId])] });
  }
  // Receipt identity follows ledger arrival order. A later import can claim
  // an earlier ordinal, but cannot use it to replace the first identity.
  for (const event of events) {
    if (!['receipt.requested','receipt.confirmed','receipt.rejected'].includes(event.type)) continue;
    const raw = receiptPayload(event);
    const id = controlIdSchema.safeParse(raw.receiptId);
    const { receiptId: _receiptId, status: _status, createdAt: _createdAt, confirmedAt: _confirmedAt, evidenceIds: _evidenceIds, ...inputRaw } = raw;
    const parsed = receiptInputSchema.safeParse(inputRaw);
    if (!id.success || !parsed.success) { receiptAttention(state, event, 'receipt-integrity', 'Receipt input is incomplete or invalid.'); continue; }
    const receiptId = id.data, input = parsed.data;
    const manifest = state.manifests[input.handoffId];
    let integrity = true;
    if (!manifest) { integrity = false; receiptAttention(state, event, 'coverage-gap', 'Receipt has no prepared manifest to verify against.'); }
    else {
      try { assertManifestDigest(manifest); }
      catch { integrity = false; receiptAttention(state, event, 'receipt-integrity', 'Prepared manifest digest is invalid.'); }
      if (!manifest.targetSessionId || !manifest.targetRunId || manifest.targetSessionId !== input.targetSessionId || manifest.targetRunId !== input.targetRunId) { integrity = false; receiptAttention(state, event, 'receipt-integrity', 'Receipt target does not match the prepared target.'); }
      if (manifest.digest !== input.manifestDigest) { integrity = false; receiptAttention(state, event, 'receipt-integrity', 'Receipt manifest digest does not match the prepared manifest.'); }
    }
    // Replayed events, including old rows claiming to be from the runtime,
    // are observations. Only the dedicated persisted receipt writer can attest.
    if (event.taskId !== manifest?.taskId || event.sessionId !== input.targetSessionId || event.runId !== input.targetRunId) {
      integrity = false; receiptAttention(state, event, 'receipt-integrity', 'Receipt event does not match the task and target.');
    }
    const requestedVerified = input.stage === 'verified-complete';
    const effectiveStage = requestedVerified ? 'reported-complete' : input.stage;
    if (requestedVerified) receiptAttention(state, event, 'unverified-completion', 'Receipt claims verified completion without trusted verification evidence.');
    const expired = Date.parse(input.expiresAt) <= Date.parse(event.occurredAt ?? event.recordedAt);
    const nextStatus: ReceiptSummary['status'] = !integrity || requestedVerified || event.type !== 'receipt.requested' ? 'unknown' : expired ? 'expired' : 'pending';
    const current = state.receipts[receiptId];
    const claimedNonce=nonces.get(nonceKey(input));
    if ((claimedNonce && claimedNonce !== receiptId) || (current && (!sameReceiptIdentity(current,input)
      || receiptStageOrder(effectiveStage)<receiptStageOrder(current.stage)))) {
      receiptAttention(state,event,'receipt-conflict','Receipt identity, nonce or stage conflicts with the existing receipt.');
      continue;
    }
    // A log cannot replace a persisted receipt, including its expiry or
    // confirmation. An invalid later observation cannot modify an existing row.
    if (persisted.has(receiptId) || current && (!integrity || current.status==='expired' || current.status==='rejected')) continue;
    const projected = receiptSummary(event,input,receiptId,nextStatus,effectiveStage);
    state.receipts[receiptId] = current ? {...projected,createdAt:current.createdAt} : projected;
    if (integrity) nonces.set(nonceKey(input),receiptId);
  }
  state.lineage.sort((a,b) => a.id.localeCompare(b.id)); state.responsibilities.sort((a,b) => a.id.localeCompare(b.id)); state.attention.sort((a,b) => a.id.localeCompare(b.id));
  return state;
}
export function applyControlEvent(state: ControlState, input: ControlEvent): ControlState {
  const event = protectControlEvent(controlEventSchema.parse(input));
  const previous = eventLogs.get(state) ?? [];
  const same = previous.find(item => item.eventId === event.eventId);
  const events = same ? previous : [...previous, event];
  const conflicts=new Set(eventConflicts.get(state));
  if(same&&canonicalDigest(same)!==canonicalDigest(event))conflicts.add(event.eventId);
  const next = project(events);retainConflicts(next,conflicts);eventLogs.set(next, events); return next;
}
export function rebuildControlState(events: Iterable<ControlEvent>, prepared?: PreparedState): ControlState {
  const unique = new Map<string, ControlEvent>();
  const conflicts: string[] = [];
  for (const input of events) {
    const event = protectControlEvent(controlEventSchema.parse(input));
    const previous = unique.get(event.eventId);
    if (!previous) unique.set(event.eventId, event);
    else if (canonicalDigest(previous) !== canonicalDigest(event)) {
      conflicts.push(event.eventId);
      if (authorized(event,prepared)) unique.set(event.eventId,event);
    }
  }
  const state = project([...unique.values()], prepared);
  retainConflicts(state,conflicts);
  eventLogs.set(state, [...unique.values()]); return state;
}
