import { observationSchema,type ExecutionObservation } from './observations.js';
import { z } from 'zod';
import type { NormalizedEvent } from '../domain/models.js';
import { snapshotReasonSchema, type WorkspaceSnapshot } from '../workspace/contracts.js';
import { compareWorkspaceSnapshots } from '../workspace/verify.js';

const id = z.string().min(1);
const historicalSchema = z.object({
  result: z.enum(['succeeded', 'failed', 'unknown']),
  exitCode: z.number().int().safe().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
}).strict().refine(value => value.result === (value.exitCode === null ? 'unknown' : value.exitCode === 0 ? 'succeeded' : 'failed'));

/** Current is deliberately unavailable until execution environment evidence is supported. */
export const commandEvidenceSchema = z.object({
  protocol: z.literal('threadport.command-evidence.v1'),
  eventId: id, sessionId: id, commandRunId: id,
  historical: historicalSchema,
  applicability: z.enum(['unverified', 'stale', 'unknown']),
  workspace: z.object({
    status: z.enum(['matched', 'drifted', 'unverifiable']),
    snapshotId: id.nullable(), reviewSnapshotId: id,
    scope: z.literal('head-tracked-diff-untracked'),
    reasons: z.array(z.union([snapshotReasonSchema, z.enum(['HEAD_CHANGED', 'CONTENT_CHANGED', 'SCOPE_CHANGED'])])),
  }).strict(),
  observation:observationSchema.optional(),
  environment: z.literal('unknown'), testScope: z.literal('unknown'),
  reasons: z.array(z.enum([
    'EXECUTION_RESULT_UNKNOWN', 'SOURCE_INCOMPLETE', 'COMMAND_IDENTITY_MISMATCH',
    'SNAPSHOT_MISSING', 'SNAPSHOT_REFERENCE_MISMATCH', 'WORKSPACE_CHANGED',
    'WORKSPACE_UNKNOWN', 'ENVIRONMENT_UNKNOWN', 'TEST_SCOPE_UNKNOWN', 'EXECUTION_WORKSPACE_CHANGED', 'EXECUTION_ENVIRONMENT_CHANGED', 'EXECUTION_OBSERVATION_INCOMPLETE',
  ])),
}).strict();
export type CommandEvidence = z.infer<typeof commandEvidenceSchema>;

/** Compare evidence only. Never infer argv, test counts or historical runtime from command prose. */
export function evaluateCommandEvidence(
  event: NormalizedEvent, historical: WorkspaceSnapshot | null, current: WorkspaceSnapshot,
  observation?:{record:ExecutionObservation;after:WorkspaceSnapshot|null},
): CommandEvidence | null {
  const run = event.commandRun;
  if (!run) return null;
  const reasons: CommandEvidence['reasons'] = [];
  const workspace: CommandEvidence['workspace'] = {
    status: 'unverifiable', snapshotId: run.snapshotId,
    reviewSnapshotId: current.id, scope: current.scope, reasons: [],
  };
  if (run.snapshotId === null || historical === null) reasons.push('SNAPSHOT_MISSING');
  else if (historical.id !== run.snapshotId) reasons.push('SNAPSHOT_REFERENCE_MISMATCH');
  else {
    const comparison = compareWorkspaceSnapshots(historical, current);
    workspace.status = comparison.status;
    workspace.reasons = comparison.reasons.map(reason => reason.code);
  }
  if (workspace.status === 'drifted') reasons.push('WORKSPACE_CHANGED');
  if (workspace.status === 'unverifiable') reasons.push('WORKSPACE_UNKNOWN');
  if (run.exitCode === null) reasons.push('EXECUTION_RESULT_UNKNOWN');
  if (event.omitted) reasons.push('SOURCE_INCOMPLETE');
  const identityMatches = event.kind === 'command' && run.eventId === event.id
    && run.sessionId === event.sessionId && run.ordinal === event.ordinal;
  if (!identityMatches) reasons.push('COMMAND_IDENTITY_MISMATCH');
  let incompleteExecution=false;
  if(observation){
    const value=observation.record;
    if(!value.startedAt||!value.completedAt||!observation.after||!value.environmentAfter||['running','unknown'].includes(value.status)){
      reasons.push('EXECUTION_OBSERVATION_INCOMPLETE');incompleteExecution=true;
    }
    if(historical&&observation.after){const during=compareWorkspaceSnapshots(historical,observation.after);if(during.status!=='matched'){reasons.push(during.status==='drifted'?'EXECUTION_WORKSPACE_CHANGED':'EXECUTION_OBSERVATION_INCOMPLETE');incompleteExecution=true;}}
    if(value.environmentAfter&&value.environmentBefore.digest!==value.environmentAfter.digest){reasons.push('EXECUTION_ENVIRONMENT_CHANGED');incompleteExecution=true;}
  }
  reasons.push('ENVIRONMENT_UNKNOWN', 'TEST_SCOPE_UNKNOWN');
  const applicability = run.exitCode === null || event.omitted || !identityMatches || incompleteExecution
    ? 'unverified' : workspace.status === 'drifted' ? 'stale' : 'unknown';
  return commandEvidenceSchema.parse({
    protocol: 'threadport.command-evidence.v1', eventId: event.id, sessionId: event.sessionId, commandRunId: run.id,
    historical: {result: run.exitCode === null ? 'unknown' : run.exitCode === 0 ? 'succeeded' : 'failed', exitCode: run.exitCode, startedAt: run.startedAt, completedAt: run.completedAt},
    ...(observation?{observation:observation.record}:{}),
    applicability, workspace, environment: 'unknown', testScope: 'unknown', reasons,
  });
}

export function commandEvidenceSummary(evidence: CommandEvidence): string {
  const outcome = evidence.historical.result === 'unknown' ? 'result unknown'
    : `${evidence.historical.result} (exit ${evidence.historical.exitCode})`;
  const validity = evidence.applicability === 'stale' ? 'recorded workspace changed; current result needs revalidation'
    : evidence.applicability === 'unverified' ? 'execution evidence incomplete; current validity unverified'
    : 'current validity unknown';
  return `Historical command ${outcome}; ${validity}. Test scope and environment unknown.`;
}
