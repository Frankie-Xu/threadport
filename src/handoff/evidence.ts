import { evaluateInnerObservation, innerObservationSchema, unknownInnerEvidence, type ExecutionObservation, type InnerAgentEvidence, type InnerAgentObservation } from '../evidence/observations.js';
import type { NormalizedEvent } from '../domain/models.js';
import { evaluateCommandEvidence, type CommandEvidence } from '../evidence/command.js';
import type { WorkspaceSnapshot, VerificationReport } from '../workspace/contracts.js';
import { compareWorkspaceSnapshots } from '../workspace/verify.js';

export interface InnerObservationInput {
  eventId:string;
  kind:'command'|'test';
  /** A structured vendor payload. Strings/prose are intentionally rejected. */
  result?:unknown;
}

/**
 * Prepare inner Agent evidence independently from outer process evidence. A
 * missing or malformed result is retained as explicit unverified metadata;
 * it is never promoted from assistant prose, a turn boundary, or an exit
 * string. Snapshot lookup is required for a `current` classification.
 */
export function prepareInnerEvidence(
  inputs:readonly InnerObservationInput[],
  current:WorkspaceSnapshot,
  getSnapshot:(id:string)=>WorkspaceSnapshot|null,
):{byEvent:Map<string,InnerAgentEvidence>;warnings:string[]}{
  const byEvent=new Map<string,InnerAgentEvidence>();
  const counts={current:0,stale:0,unverified:0,unknown:0};
  for(const input of inputs){
    const parsed=innerObservationSchema.safeParse(input.result);
    let evidence:InnerAgentEvidence;
    if(!input.result)evidence=unknownInnerEvidence(input.eventId,input.kind,'NO_STRUCTURED_RESULT');
    else if(!parsed.success)evidence=unknownInnerEvidence(input.eventId,input.kind,'PARTIAL_LOG');
    else {
      const value:InnerAgentObservation=parsed.data;
      const before=value.workspace.beforeSnapshotId?getSnapshot(value.workspace.beforeSnapshotId):null;
      const after=value.workspace.afterSnapshotId?getSnapshot(value.workspace.afterSnapshotId):null;
      evidence=evaluateInnerObservation(value,{current,before,after});
    }
    byEvent.set(input.eventId,evidence);counts[evidence.applicability]++;
  }
  const warnings=byEvent.size?[`Inner Agent evidence: ${counts.current} current, ${counts.stale} stale, ${counts.unverified} unverified, ${counts.unknown} unknown.`]:[];
  return {byEvent,warnings};
}

/** All selected-session commands contribute warnings, even if their excerpts are later omitted. */
export function prepareCommandEvidence(
  events: readonly NormalizedEvent[], current: WorkspaceSnapshot,
  getSnapshot: (id: string) => WorkspaceSnapshot | null,
  observations:ReadonlyMap<string,ExecutionObservation>=new Map(),
): { byEvent: Map<string, CommandEvidence>; verification: VerificationReport; warnings: string[] } {
  const snapshots = new Map<string, WorkspaceSnapshot | null>();
  const byEvent = new Map<string, CommandEvidence>();
  const counts = {stale: 0, unknown: 0, unverified: 0};
  const review = compareWorkspaceSnapshots(current, current);
  let verification = review;
  const reasons = new Map<string, VerificationReport['reasons'][number]>();
  const rank = {matched: 0, drifted: 1, unverifiable: 2};
  for (const event of events) {
    const run = event.commandRun;
    if (!run) continue;
    if (run.snapshotId !== null && !snapshots.has(run.snapshotId)) snapshots.set(run.snapshotId, getSnapshot(run.snapshotId));
    const historical = run.snapshotId === null ? null : snapshots.get(run.snapshotId)!;
    const observation=observations.get(event.id);
    const evidence = evaluateCommandEvidence(event, historical, current,observation?{record:observation,after:observation.afterSnapshotId?getSnapshot(observation.afterSnapshotId):null}:undefined)!;
    byEvent.set(event.id, evidence);
    counts[evidence.applicability]++;
    const report: VerificationReport = historical && historical.id === run.snapshotId
      ? compareWorkspaceSnapshots(historical, current)
      : {...review, status: 'unverifiable', snapshotId: run.snapshotId ?? current.id,
        reasons: [{code: 'READ_FAILED', message: 'A historical command snapshot is unavailable; its workspace cannot be compared.'}]};
    if (rank[report.status] > rank[verification.status]) verification = report;
    for (const reason of report.reasons) reasons.set(reason.code, reason);
  }
  verification = {...verification, reasons: [...reasons.values()]};
  const warnings = byEvent.size ? [
    `Historical command applicability: ${counts.stale} stale, ${counts.unknown} unknown, ${counts.unverified} unverified (${byEvent.size} recorded commands; includes omitted excerpts).`,
    ...(counts.stale ? ['Changed workspace evidence means those historical results need revalidation; it does not mean the commands now fail.'] : []),
  ] : [];
  return {byEvent, verification, warnings};
}
