import { resolve } from 'node:path';
import { commandGroupKey, hasCompleteCommandIdentity } from '../domain/command-state.js';
import { readGitState } from '../git.js';
import { protectCapsule } from '../privacy.js';
import { redactSecrets } from '../redact.js';
import { validateCapsule } from '../capsule.js';
import { sourcePlatformForRoot } from '../workspace/paths.js';
import type { AgentId, Capsule, CapsuleCommand, CapsuleEvidence, CapsuleFile } from '../types.js';
import type { SessionExtractInput } from './types.js';
import { DERIVED_ACCEPTANCE_NOTE, type SessionTraces } from './session-records.js';

export async function assembleCapsule(options: { agent: AgentId; sessionId: string; traces: SessionTraces; input: SessionExtractInput; evidenceTitle: string; redactionCount?: number }): Promise<Capsule> {
  const tally = { count: 0 }; const { traces, input } = options;
  const objective = redactField(traces.objective, tally);
  const acceptance = traces.acceptanceCriteria.length > 0 ? traces.acceptanceCriteria.map(item => redactField(item, tally)) : traces.derived.objective ? [redactField(`The objective is satisfied: ${traces.objective}`, tally)] : [];
  const constraints = traces.constraints.map(item => redactField(item, tally));
  constraints.push(traces.derived.objective ? 'Objective is a derived candidate from the latest visible user message; confirm it before continuing.' : 'Objective is unknown because no visible user message was recorded.');
  if (traces.acceptanceCriteria.length === 0 && traces.derived.objective) constraints.push(DERIVED_ACCEPTANCE_NOTE);
  const files = [...traces.files.values()].map(file => ({ path: redactField(file.path, tally), action: file.action, ...(file.summary ? { summary: redactField(file.summary, tally) } : {}) }));
  const commands = traces.commands.map(command => ({ command: redactField(command.command, tally), ...(command.exit_code === undefined ? {} : { exit_code: command.exit_code }), ...(command.summary ? { summary: redactField(command.summary, tally) } : {}) }));
  const tests = traces.tests.map(item => ({ command: redactField(item.command, tally), status: item.status, ...(item.summary ? { summary: redactField(item.summary, tally) } : {}) }));
  const failures = traces.failures.map(item => ({ summary: redactField(item.summary, tally), ...(item.resolution ? { resolution: redactField(item.resolution, tally) } : {}) }));
  const decisions = traces.decisions.map(item => ({ decision: redactField(item.decision, tally) })); const completed = traces.completed.map(item => redactField(item, tally)); const nextAction = redactField(traces.nextAction, tally);
  const sessionLocator = input.sessionPath && input.privacy !== 'local' ? resolve(input.sessionPath) : input.sessionPath;
  const evidence = buildEvidence(options.evidenceTitle, sessionLocator, files, commands, traces.normalizedEvents).map(item => ({ kind: item.kind, title: redactField(item.title, tally), ...(item.locator ? { locator: redactField(item.locator, tally) } : {}) }));
  const git = await readGitState(input.project.root);
  return validateCapsule(protectCapsule({ schema_version: '1.0', id: sanitizeCapsuleId(options.sessionId, options.agent), created_at: resolveCreatedAt(input.now), source_agent: options.agent, source_session_id: options.sessionId, project: { name: input.project.name, root: input.project.root, ...(input.project.repository ? { repository: input.project.repository } : {}) }, objective, acceptance_criteria: acceptance, status: traces.status, completed, decisions, constraints, files, commands, tests, failures, next_action: nextAction, evidence, git, redaction: { applied: tally.count > 0, count: tally.count } }, input.privacy ?? 'portable', [resolve(input.project.root), git.root], tally.count + (options.redactionCount ?? 0), sourcePlatformForRoot(git.root)));
}

function resolveCreatedAt(now: Date | undefined): string { return (now ?? new Date()).toISOString(); }
function redactField(value: string, tally: { count: number }): string { const result = redactSecrets(value); tally.count += result.count; return result.text; }
function sanitizeCapsuleId(sessionId: string, agent: AgentId): string { const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[^A-Za-z0-9]+/, ''); return cleaned.slice(0, 128) || `${agent}-session`; }
function buildEvidence(title: string, sessionPath: string | undefined, files: CapsuleFile[], commands: CapsuleCommand[], events: readonly import('../domain/models.js').NormalizedEvent[]): CapsuleEvidence[] {
  const evidence: CapsuleEvidence[] = [{ kind: 'session', title, locator: sessionPath ?? 'inline-session' }];
  for (const event of events) if ((event.kind === 'user-message' || event.kind === 'assistant-message') && event.text.trim()) evidence.push({ kind: 'other', title: `Observed ${event.kind}: ${summarize(event.text)}`, locator: `session-event:${event.ordinal}` });
  for (const file of files) evidence.push({ kind: 'file', title: file.path, locator: file.path });
  for (const command of commands) evidence.push({ kind: 'command', title: command.command, locator: command.command });
  return evidence;
}
function summarize(value: string): string { const compact = value.replace(/\s+/g, ' ').trim(); return compact.length <= 180 ? compact : `${compact.slice(0, 179)}…`; }
