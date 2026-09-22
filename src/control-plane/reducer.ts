import { controlEventSchema, type ControlEvent, type ContextManifestV1, type ObservationHealth, type ReceiptSummary, type RunFact, canonicalDigest } from './contracts.js';

export type EvidenceLevel = 'runtime-explicit' | 'trusted-integration' | 'user-confirmed' | 'inferred';
export type LineageRelation = 'fork' | 'delegate' | 'handoff' | 'resume' | 'compact' | 'host-move' | 'manual-takeover';
export interface SessionProjection { runState: RunFact; health: ObservationHealth; lastEvidenceId: string | null; lastOccurredAt: string | null }
export interface LineageRecord { id: string; parentSessionId: string; childSessionId: string; relation: LineageRelation; evidenceLevel: EvidenceLevel; status: 'candidate' | 'confirmed' | 'rejected'; evidenceIds: string[]; occurredAt: string | null }
export interface ResponsibilityRecord { id: string; taskId: string; scope: string; roles: Partial<Record<'initiator' | 'authorizer' | 'dispatcher' | 'executor' | 'reviewer' | 'next-owner', string>>; status: 'proposed' | 'confirmed' | 'ended'; evidenceIds: string[]; confirmedAt: string | null }
export interface AttentionItem { id: string; kind: string; severity: 'info' | 'warning' | 'error'; message: string; status: 'open' | 'resolved'; evidenceIds: string[] }
export interface ControlState {
  sessions: Record<string, SessionProjection>;
  lineage: LineageRecord[];
  responsibilities: ResponsibilityRecord[];
  manifests: Record<string, ContextManifestV1>;
  receipts: Record<string, ReceiptSummary | Record<string, any>>;
  attention: AttentionItem[];
}
const eventLogs = new WeakMap<object, ControlEvent[]>();
export const emptyControlState = (): ControlState => { const state: ControlState = { sessions: {}, lineage: [], responsibilities: [], manifests: {}, receipts: {}, attention: [] }; eventLogs.set(state, []); return state; };

function eventOrder(a: ControlEvent, b: ControlEvent): number {
  const ordinalA = a.ordinal === null ? Number.MAX_SAFE_INTEGER : a.ordinal;
  const ordinalB = b.ordinal === null ? Number.MAX_SAFE_INTEGER : b.ordinal;
  return ordinalA - ordinalB || (a.occurredAt ?? '\uffff').localeCompare(b.occurredAt ?? '\uffff') || a.eventId.localeCompare(b.eventId) || a.recordedAt.localeCompare(b.recordedAt);
}
function payload(event: ControlEvent): Record<string, any> { return (event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)) ? event.payload as Record<string, any> : {}; }
function observedHealth(event: ControlEvent): ObservationHealth { return event.source.kind === 'agent-report' ? 'unverified' : event.source.coverage === 'none' ? 'coverage-gap' : 'current'; }
function severity(value: unknown): AttentionItem['severity'] { return value === 'error' || value === 'warning' ? value : 'info'; }
function addAttention(state: ControlState, item: AttentionItem): void {
  const existing = state.attention.find(value => value.id === item.id);
  if (existing) return;
  state.attention.push(item);
}
function project(events: readonly ControlEvent[]): ControlState {
  const state: ControlState = { sessions: {}, lineage: [], responsibilities: [], manifests: {}, receipts: {}, attention: [] };
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
      const parentSessionId = typeof p.parentSessionId === 'string' ? p.parentSessionId : event.sessionId;
      const childSessionId = typeof p.childSessionId === 'string' ? p.childSessionId : null;
      const relation = p.relation as LineageRelation;
      if (!parentSessionId || !childSessionId || !['fork','delegate','handoff','resume','compact','host-move','manual-takeover'].includes(relation)) continue;
      // Compaction preserves one vendor session. It is a lifecycle fact, not a
      // parent/child edge; accepting a different child here would invent a
      // session that the source never created.
      if (relation === 'compact' && parentSessionId !== childSessionId) continue;
      const evidenceLevel = (p.evidenceLevel as EvidenceLevel) ?? 'inferred';
      const userConfirmed = event.source.kind === 'user' || evidenceLevel === 'user-confirmed';
      const runtimeConfirmed = event.source.kind === 'runtime' || event.source.kind === 'threadport';
      const confirmed = (userConfirmed || (runtimeConfirmed && evidenceLevel === 'runtime-explicit')) && event.source.kind !== 'agent-report';
      const id = String(p.id ?? `${parentSessionId}:${childSessionId}:${relation}`);
      const current = state.lineage.find(item => item.id === id);
      const status: LineageRecord['status'] = p.status === 'rejected' ? 'rejected' : confirmed ? 'confirmed' : 'candidate';
      if (!current || current.status !== 'confirmed' || status === 'confirmed') {
        if (current) Object.assign(current, { status, evidenceLevel: confirmed ? evidenceLevel : current.evidenceLevel, evidenceIds: [...new Set([...current.evidenceIds, ...event.evidenceIds, event.eventId])] });
        else state.lineage.push({ id, parentSessionId, childSessionId, relation, evidenceLevel, status, evidenceIds: [...new Set([...event.evidenceIds, event.eventId])], occurredAt: event.occurredAt });
      }
    }
    if (event.type === 'responsibility.proposed' || event.type === 'responsibility.confirmed' || event.type === 'responsibility.ended') {
      const id = String(p.id ?? p.responsibilityId ?? `${event.taskId ?? 'task'}:${p.scope ?? 'task'}`);
      const existing = state.responsibilities.find(item => item.id === id);
      const nextStatus: ResponsibilityRecord['status'] = event.type === 'responsibility.confirmed' && (event.source.kind === 'user' || event.source.kind === 'runtime' || event.source.kind === 'threadport') ? 'confirmed' : event.type === 'responsibility.ended' ? 'ended' : 'proposed';
      const roles = (p.roles && typeof p.roles === 'object' ? p.roles : {}) as ResponsibilityRecord['roles'];
      const record: ResponsibilityRecord = existing ?? { id, taskId: event.taskId ?? String(p.taskId ?? 'unknown'), scope: String(p.scope ?? 'task'), roles: {}, status: 'proposed', evidenceIds: [], confirmedAt: null };
      // Agent reports are pending input. Once a responsibility is confirmed,
      // an untrusted proposal must not replace its executor or role bindings.
      const trustedSource = event.source.kind !== 'agent-report';
      if (!existing || existing.status !== 'confirmed' || (trustedSource && event.type === 'responsibility.confirmed')) {
        record.roles = { ...record.roles, ...roles };
        if (typeof p.ownerSessionId === 'string' && !record.roles.executor) record.roles.executor = p.ownerSessionId;
      }
      record.evidenceIds = [...new Set([...record.evidenceIds, ...event.evidenceIds, event.eventId])];
      if (nextStatus === 'ended' && trustedSource) record.status = 'ended';
      else if (nextStatus === 'confirmed' && record.status !== 'ended') record.status = 'confirmed';
      else if (nextStatus === 'proposed' && record.status === 'proposed') record.status = 'proposed';
      if (record.status === 'confirmed') record.confirmedAt = event.occurredAt ?? event.recordedAt;
      if (!existing) state.responsibilities.push(record);
    }
    if (event.type === 'manifest.saved' && typeof p.handoffId === 'string' && p.manifest) state.manifests[p.handoffId] = p.manifest;
    if (event.type.startsWith('receipt.')) {
      const receipt = p.receipt && typeof p.receipt === 'object' ? p.receipt : p;
      if (typeof receipt.receiptId === 'string') {
        const current = state.receipts[receipt.receiptId];
        const agentReported = event.source.kind === 'agent-report';
        const handoffId = typeof receipt.handoffId === 'string' ? receipt.handoffId : null;
        const manifest = handoffId ? state.manifests[handoffId] : undefined;
        const bound = !!manifest && manifest.digest === receipt.manifestDigest && manifest.targetSessionId === receipt.targetSessionId && manifest.targetRunId === receipt.targetRunId;
        const verifiedStageHasEvidence = receipt.stage !== 'verified-complete' || (Array.isArray(receipt.evidenceIds) && receipt.evidenceIds.length > 0);
        const nextStatus = agentReported ? 'unknown' : event.type.endsWith('.confirmed') ? (bound && verifiedStageHasEvidence ? 'confirmed' : 'unknown') : event.type.endsWith('.rejected') ? 'rejected' : receipt.status ?? 'pending';
        if (!current || event.type.endsWith('.confirmed') || event.type.endsWith('.rejected')) state.receipts[receipt.receiptId] = { ...current, ...receipt, status: nextStatus, evidenceIds: [...new Set([...(current?.evidenceIds ?? []), ...event.evidenceIds, event.eventId])] };
        if (event.type.endsWith('.confirmed') && !agentReported && !bound) addAttention(state, { id: `unverified:${event.eventId}`, kind: 'unverified-completion', severity: 'warning', message: 'Receipt confirmation lacks a matching prepared manifest and target binding.', status: 'open', evidenceIds: [...new Set([...event.evidenceIds, event.eventId])] });
      }
    }
    if (event.type === 'attention.opened') addAttention(state, { id: String(p.id ?? event.eventId), kind: String(p.kind ?? 'unknown'), severity: severity(p.severity), message: String(p.message ?? 'Control plane attention required.'), status: 'open', evidenceIds: [...new Set([...event.evidenceIds, event.eventId])] });
    if (event.type === 'attention.resolved') { const item = state.attention.find(value => value.id === p.id); if (item) item.status = 'resolved'; }
    if (event.source.coverage === 'none' || event.source.coverage === 'unknown') addAttention(state, { id: `coverage:${event.source.sourceId}:${event.type}`, kind: 'coverage-gap', severity: 'warning', message: 'Evidence source coverage is incomplete.', status: 'open', evidenceIds: [...new Set([...event.evidenceIds, event.eventId])] });
    if (event.type === 'handoff.reported-complete' || event.type === 'run.ended' && event.source.kind === 'agent-report') addAttention(state, { id: `unverified:${event.eventId}`, kind: 'unverified-completion', severity: 'warning', message: 'Agent-reported completion requires verification evidence.', status: 'open', evidenceIds: [...new Set([...event.evidenceIds, event.eventId])] });
  }
  state.lineage.sort((a,b) => a.id.localeCompare(b.id)); state.responsibilities.sort((a,b) => a.id.localeCompare(b.id)); state.attention.sort((a,b) => a.id.localeCompare(b.id));
  return state;
}
export function applyControlEvent(state: ControlState, input: ControlEvent): ControlState {
  const event = controlEventSchema.parse(input);
  const previous = eventLogs.get(state) ?? [];
  const same = previous.find(item => item.eventId === event.eventId);
  const events = same ? previous : [...previous, event];
  if (same && canonicalDigest(same) !== canonicalDigest(event)) {
    const next = project(events); addAttention(next, { id: `conflict:${event.eventId}`, kind: 'event-conflict', severity: 'error', message: 'The same event ID was replayed with different content.', status: 'open', evidenceIds: [event.eventId] }); eventLogs.set(next, events); return next;
  }
  const next = project(events); eventLogs.set(next, events); return next;
}
export function rebuildControlState(events: Iterable<ControlEvent>): ControlState {
  const unique = new Map<string, ControlEvent>();
  const conflicts: string[] = [];
  for (const input of events) {
    const event = controlEventSchema.parse(input);
    const previous = unique.get(event.eventId);
    if (!previous) unique.set(event.eventId, event);
    else if (canonicalDigest(previous) !== canonicalDigest(event)) conflicts.push(event.eventId);
  }
  const state = project([...unique.values()]);
  for (const eventId of [...new Set(conflicts)]) addAttention(state, { id: `conflict:${eventId}`, kind: 'event-conflict', severity: 'error', message: 'The same event ID was replayed with different content.', status: 'open', evidenceIds: [eventId] });
  state.attention.sort((a,b) => a.id.localeCompare(b.id));
  eventLogs.set(state, [...unique.values()]); return state;
}
