import { z } from 'zod';
import { commandGroupKey, hasCompleteCommandIdentity, latestCommandRuns } from './command-state.js';
import { DomainError } from './errors.js';
import type { Claim, DerivedTaskState, NormalizedEvent, ResolvedTaskState, Task } from './models.js';

const id = z.string().min(1);
const timestamp = z.string().datetime().nullable();
const ordinal = z.number().int().nonnegative().safe();
const eventSchema: z.ZodType<NormalizedEvent> = z.object({
  id, sessionId: id, ordinal, occurredAt: timestamp,
  kind: z.enum(['user-message', 'assistant-message', 'file-change', 'command']),
  text: z.string(), relativePaths: z.array(z.string()), omitted: z.boolean(),
  commandRun: z.object({
    id, sessionId: id, ordinal, command: z.string().min(1), cwd: z.string().nullable(),
    exitCode: z.number().int().safe().nullable(), startedAt: timestamp, completedAt: timestamp,
    eventId: id, snapshotId: id.nullable(),
  }).strict().nullable(),
}).strict().refine(event => event.commandRun === null || (event.kind === 'command'
  && event.commandRun.eventId === event.id && event.commandRun.sessionId === event.sessionId
  && event.commandRun.ordinal === event.ordinal));

/** Deterministic lexical ordering within sessions; wall-clock timestamps do not reorder events. */
export function deriveTask(events: readonly NormalizedEvent[]): DerivedTaskState {
  const parsed = z.array(eventSchema).safeParse(events);
  if (!parsed.success) throw new DomainError('INVALID_INPUT', 'Invalid normalized events.');
  const seenIds = new Set<string>();
  const seenOrdinals = new Set<string>();
  for (const event of parsed.data) {
    const key = JSON.stringify([event.sessionId, event.ordinal]);
    if (seenIds.has(event.id) || seenOrdinals.has(key)) {
      throw new DomainError('INVALID_INPUT', 'Duplicate normalized event identity.');
    }
    seenIds.add(event.id); seenOrdinals.add(key);
  }
  const ordered = parsed.data.sort((a, b) => a.sessionId === b.sessionId
    ? a.ordinal - b.ordinal : a.sessionId < b.sessionId ? -1 : 1);
  let objective: Claim | null = null;
  const constraints = new Map<string, Claim>();
  const userSessions = new Set<string>();
  const attention = new Set<string>();
  const runs = ordered.flatMap(event => event.commandRun ? [event.commandRun] : []);
  const failedGroups = new Set<string>();

  for (const event of ordered) {
    if (event.omitted) attention.add('INCOMPLETE_EVIDENCE');
    if (event.occurredAt === null) attention.add('EVIDENCE_TIME_UNKNOWN');
    if (event.kind === 'command' && event.commandRun === null) attention.add('COMMAND_RESULT_UNKNOWN');
    if (event.kind !== 'user-message' || !event.text.trim()) continue;
    userSessions.add(event.sessionId);
    const evidence = { sessionId: event.sessionId, eventId: event.id };
    objective = {
      text: event.text.split(/\r?\n/).find(line => line.trim())!.trim(), origin: 'derived',
      evidence: [evidence], updatedAt: event.occurredAt,
    };
    for (const line of event.text.split(/\r?\n/)) {
      const candidate = line.trim().replace(/^[-*]\s+/, '');
      if (!/^(?:(?:do not|don't|never)\b|(?:请)?不要|禁止|不得|请勿|不允许)/i.test(candidate)) continue;
      const claim = constraints.get(line);
      if (claim) {
        if (!claim.evidence.some(ref => ref.eventId === event.id)) claim.evidence.push(evidence);
        claim.updatedAt = event.occurredAt;
      } else constraints.set(line, { text: line, origin: 'derived', evidence: [evidence], updatedAt: event.occurredAt });
    }
  }
  for (const run of runs) {
    const key = commandGroupKey(run);
    if (run.exitCode === 0 && hasCompleteCommandIdentity(run)) failedGroups.delete(key);
    else if (run.exitCode !== null && run.exitCode !== 0) failedGroups.add(key);
    if (!hasCompleteCommandIdentity(run)) attention.add('COMMAND_IDENTITY_INCOMPLETE');
  }
  const latestRuns = latestCommandRuns(runs);
  if (objective === null) attention.add('OBJECTIVE_UNKNOWN');
  if (userSessions.size > 1) attention.add('MULTIPLE_SESSION_OBJECTIVES');
  if (failedGroups.size) attention.add('COMMAND_FAILED');
  if (latestRuns.some(run => run.exitCode === null)) attention.add('COMMAND_RESULT_UNKNOWN');
  if (latestRuns.some(run => run.cwd === null)) attention.add('COMMAND_CONTEXT_UNKNOWN');
  // Even a stored historical snapshot is not a current workspace verification.
  if (runs.length) attention.add('HISTORICAL_VALIDITY_UNKNOWN');
  return { objective, constraints: [...constraints.values()], latestRuns, attention: [...attention].sort() };
}

/** A rescan proposes candidates; it never rewrites saved task fields, including an empty constraint list. */
export function resolveTaskState(task: Task | null, derived: DerivedTaskState): ResolvedTaskState {
  return structuredClone({
    objective: task ? task.objective : derived.objective,
    constraints: task ? task.constraints : derived.constraints,
    nextAction: task?.nextAction ?? null,
    lifecycle: task?.lifecycle ?? null,
    archived: task?.archived ?? false,
    attention: derived.attention,
  });
}
