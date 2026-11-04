import { z } from 'zod';

export const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const candidate = z.string().regex(/^[a-f0-9]{40}$/);
export const version = z.string().max(80).regex(/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/);
export const scenario = z.enum(['A', 'B', 'C']);
const agent = z.object({ agent: z.enum(['claude', 'codex']), version }).strict();
export const binding = z.object({
  candidateSha: candidate,
  tarballSha256: hash,
  harnessDigest: hash,
  fixtureDigest: hash,
  scenario,
  platform: z.enum(['darwin', 'linux', 'win32']),
  arch: z.enum(['arm64', 'x64']),
  node: z.string().regex(/^24\.\d+\.\d+$/),
  osRelease: z.string().max(100).regex(/^[0-9A-Za-z.+_()-]+$/),
  source: agent,
  target: agent,
  mode: z.enum(['native-resume', 'new-session']),
}).strict().superRefine((value, context) => {
  const same = value.source.agent === value.target.agent;
  if (same !== (value.mode === 'native-resume')) context.addIssue({ code: 'custom', message: 'Matrix path/mode mismatch.' });
});
export const preparation = z.object({
  schema: z.literal('threadport.agent-certification.preparation.v1'),
  runId: z.string().uuid(),
  preparedAt: z.string().datetime(),
  binding,
  contextDigest: hash,
  baselineReportDigest: hash,
}).strict();

const observed = z.enum(['passed', 'failed', 'unknown', 'not_run']);
const optionalHash = hash.nullable();
const failure = z.enum(['task', 'authentication', 'service', 'redacted-command', 'interrupted', 'unknown']);
// This schema is a developer evidence format, not a control-plane import.
// Every nested object is strict: authority/attestation/event payloads cannot be
// smuggled into a record and are never mapped to production persistence.
export const evidence = z.object({
  schema: z.literal('threadport.agent-certification.evidence.v1'),
  kind: z.literal('operator-observation'),
  runId: z.string().uuid(),
  binding,
  state: z.enum(['not_run', 'observed_pass', 'observed_with_issue', 'failed', 'interrupted', 'unknown']),
  startedAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  budget: z.object({ seconds: z.number().int().min(1).max(3600), costUsd: z.number().min(0).max(1000) }).strict(),
  observations: z.object({
    handoffDigest: optionalHash,
    previewDigest: optionalHash,
    launchPlanDigest: optionalHash,
    taskRevision: z.number().int().positive().nullable(),
    workspaceDigest: optionalHash,
    sourceSessionDigest: optionalHash,
    targetSessionDigest: optionalHash,
    targetRunDigest: optionalHash,
    reviewedArgvDigest: optionalHash,
    actualArgvDigest: optionalHash,
    sessionRelation: z.enum(['same-source-session', 'new-target-session', 'unknown']),
    environmentScope: z.enum(['host-runtime-only', 'host-and-target-runtime', 'unknown']),
    checks: z.object({
      workspaceIdentity: observed,
      cwd: observed,
      humanContext: observed,
      argv: observed,
      sourceUnchanged: observed,
      inputObservation: observed,
    }).strict(),
  }).strict(),
  artifactReportDigest: optionalHash,
  process: z.object({
    state: z.enum(['not_run', 'exited', 'failed', 'cancelled', 'unknown']),
    exitCode: z.number().int().min(0).max(255).nullable(),
  }).strict(),
  warnings: z.array(z.enum(['redacted-command', 'partial-source', 'input-unobservable', 'environment-unknown',
    'budget-exceeded', 'authentication-failed', 'service-unreachable', 'first-attempt-failed'])).max(16),
  firstFailure: z.object({ category: failure, exitCode: z.number().int().min(0).max(255).nullable(),
    retainedLocally: z.boolean(), diagnosticDigest: hash }).strict().nullable(),
  drift: z.object({
    stalePreviewDigest: hash,
    staleLaunchPlanDigest: hash,
    freshPreviewDigest: hash,
    freshLaunchPlanDigest: hash,
    staleErrorCode: z.enum(['REVISION_CONFLICT', 'WORKSPACE_DRIFT']),
    staleRejected: z.boolean(),
    staleLaunchCount: z.number().int().min(0).max(100),
    totalLaunchCount: z.number().int().min(0).max(100),
    reprepared: z.boolean(),
    humanChangeDigest: hash,
  }).strict().nullable(),
}).strict();

export const driftRecord = z.object({
  schema: z.literal('threadport.agent-certification.drift.v1'),
  runId: z.string().uuid(),
  preparationDigest: hash,
  humanChangeDigest: hash,
}).strict();

export function evidenceTemplate(prepared) {
  return {
    schema: 'threadport.agent-certification.evidence.v1', kind: 'operator-observation',
    runId: prepared.runId, binding: prepared.binding, state: 'not_run', startedAt: null, endedAt: null,
    budget: { seconds: 600, costUsd: 5 },
    observations: {
      handoffDigest: null, previewDigest: null, launchPlanDigest: null, taskRevision: null,
      workspaceDigest: null, sourceSessionDigest: null, targetSessionDigest: null, targetRunDigest: null,
      reviewedArgvDigest: null, actualArgvDigest: null, sessionRelation: 'unknown', environmentScope: 'unknown',
      checks: { workspaceIdentity: 'not_run', cwd: 'not_run', humanContext: 'not_run', argv: 'not_run',
        sourceUnchanged: 'not_run', inputObservation: 'unknown' },
    },
    artifactReportDigest: null, process: { state: 'not_run', exitCode: null }, warnings: [], firstFailure: null, drift: null,
  };
}
