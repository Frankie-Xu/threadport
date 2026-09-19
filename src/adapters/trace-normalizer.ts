import { deriveTask } from '../domain/derive-task.js';
import { commandGroupKey, hasCompleteCommandIdentity, latestCommandRuns } from '../domain/command-state.js';
import type { CommandRun, NormalizedEvent } from '../domain/models.js';
import type { CapsuleCommand, CapsuleFailure, CapsuleTest } from '../types.js';
import { DEFAULT_NEXT_ACTION, HISTORICAL_TEST_NOTE, TEST_COMMAND, USER_DONE, type SessionTraces, type TraceEvent, asString, isRecord } from './session-records.js';

export function tracesFromEvents(events: TraceEvent[], sessionId = 'inline-session'): SessionTraces {
  if (!events.length) throw new Error('No observable session events found; unsupported or empty transcript.');
  events = events.map((event, index) => ({ event, order: event.order ?? index })).sort((a, b) => a.order - b.order).map(item => item.event);
  const files = new Map<string, import('../types.js').CapsuleFile>();
  const commands: CapsuleCommand[] = []; const commandRuns: CommandRun[] = []; const openCommandGroups = new Set<string>();
  const tests: CapsuleTest[] = []; const completed: string[] = []; const userTexts: string[] = [];
  let lastUserIndex = -1; let lastToolIndex = -1; let lastSpokenAfterFailure: string | undefined; let sawUnresolvedFailure = false;
  const fileFailures = new Map<string, CapsuleFailure>();
  events.forEach((event, index) => {
    if (event.type === 'user') { userTexts.push(event.text); lastUserIndex = index; return; }
    if (event.type === 'assistant') { if (sawUnresolvedFailure) lastSpokenAfterFailure = firstSentence(event.text); return; }
    if (event.type === 'file') {
      lastToolIndex = index;
      if (event.outcome === 'succeeded') {
        const previous = files.get(event.path);
        const action = previous?.action === 'added' && event.action === 'modified' && previous.summary === 'Created in session.' ? 'added' : event.action;
        files.set(event.path, { path: event.path, action, summary: action === 'added' ? 'Created in session.' : 'Confirmed in session.' });
        completed.push(fileCompletion(event.action, event.path));
        const failure = fileFailures.get(event.path); if (failure) failure.resolution = `A later file operation on ${event.path} succeeded.`;
      } else {
        if (!files.has(event.path)) files.set(event.path, { path: event.path, action: event.action, summary: `Attempted ${event.action}; outcome ${event.outcome ?? 'unknown'}.` });
        if (event.outcome === 'failed') { fileFailures.set(event.path, { summary: event.output ? summarize(event.output) : `File operation failed: ${event.path}` }); sawUnresolvedFailure = true; }
      }
      return;
    }
    lastToolIndex = index;
    const summary = event.output ? summarize(event.output) : undefined;
    const run: CommandRun = { id: `${event.sessionId ?? sessionId}:command:${index}`, sessionId: event.sessionId ?? sessionId, ordinal: index, command: event.command, cwd: event.cwd ?? null, exitCode: event.exitCode ?? null, startedAt: null, completedAt: null, eventId: `${event.sessionId ?? sessionId}:event:${index}`, snapshotId: null };
    commandRuns.push(run); commands.push({ command: event.command, ...(event.exitCode == null ? {} : { exit_code: event.exitCode }), ...(summary ? { summary } : {}) });
    if (TEST_COMMAND.test(event.command)) tests.push({ command: event.command, status: testStatus(event.exitCode), summary: summary ? `${summary} ${HISTORICAL_TEST_NOTE}` : HISTORICAL_TEST_NOTE });
    if (event.exitCode === 0) { completed.push(`Ran \`${event.command}\` (exit 0).`); if (hasCompleteCommandIdentity(run)) openCommandGroups.delete(commandGroupKey(run)); }
    else if (event.exitCode != null) openCommandGroups.add(commandGroupKey(run));
    sawUnresolvedFailure = openCommandGroups.size > 0 || [...fileFailures.values()].some(failure => !failure.resolution);
  });
  const runsByOrdinal = new Map(commandRuns.map(run => [run.ordinal, run]));
  const normalizedEvents: NormalizedEvent[] = events.map((event, ordinal) => {
    const run = runsByOrdinal.get(ordinal) ?? null; const eventSession = run?.sessionId ?? sessionId;
    return { id: run?.eventId ?? `${eventSession}:event:${ordinal}`, sessionId: eventSession, ordinal, occurredAt: event.occurredAt ?? null, kind: event.type === 'user' ? 'user-message' : event.type === 'assistant' ? 'assistant-message' : event.type === 'file' ? 'file-change' : 'command', text: event.type === 'user' || event.type === 'assistant' ? event.text : event.output ?? '', commandRun: run, relativePaths: [], omitted: false, ...(event.innerObservation === undefined ? {} : { innerObservation: event.innerObservation }) };
  });
  const derived = deriveTask(normalizedEvents); const objective = derived.objective?.text ?? 'Unknown objective; review the session evidence.';
  const acceptanceCriteria = extractAcceptance(userTexts.at(-1) ?? ''); const constraints = derived.constraints.map(claim => claim.text);
  const failures = [...collapseFailures(commandRuns, commands), ...fileFailures.values()]; const lastUserText = userTexts.at(-1) ?? ''; const userDeclaredDone = USER_DONE.test(lastUserText);
  const unresolvedFailures = failures.some(item => !item.resolution); const openUserInstruction = lastUserIndex > lastToolIndex && lastUserText && !userDeclaredDone ? firstLine(lastUserText) : undefined;
  return { objective, acceptanceCriteria, constraints, files, commands, commandRuns, normalizedEvents, derived, tests, failures, decisions: [], completed: unique(completed), nextAction: openUserInstruction ?? (unresolvedFailures ? lastSpokenAfterFailure : undefined) ?? DEFAULT_NEXT_ACTION, status: unresolvedFailures ? 'blocked' : userDeclaredDone ? 'completed' : 'active' };
}

export interface ToolResult { text: string; exitCode?: number; outcome: 'succeeded' | 'failed' | 'unknown'; }
export function parseExitCode(text: string | undefined): number | undefined { if (!text) return undefined; const tagged = text.match(/<exit_code>\s*(-?\d+)\s*<\/exit_code>/i); if (tagged?.[1]) return Number(tagged[1]); const labeled = text.match(/exit(?:[\s_-]*)code\s*[:=]\s*(-?\d+)/i); if (labeled?.[1]) return Number(labeled[1]); const processExit = text.match(/Process exited with code\s+(-?\d+)/i); return processExit ? Number(processExit[1]) : undefined; }
export function toolResult(value: unknown, isError = false): ToolResult { const text = typeof value === 'string' ? value : isRecord(value) ? asString(value.output) ?? asString(value.content) ?? asString(value.text) ?? JSON.stringify(value) : contentText(value); const explicit = isRecord(value) && ('exit_code' in value || 'exitCode' in value); const numeric = isRecord(value) ? ('exit_code' in value ? value.exit_code : value.exitCode) : undefined; const exitCode = numeric === null ? undefined : isError ? 1 : typeof numeric === 'number' && Number.isSafeInteger(numeric) ? numeric : explicit ? undefined : parseExitCode(text); const failed = isError || (exitCode !== undefined && exitCode !== 0) || /^\s*(?:error|failed|failure)\b/i.test(text); const succeeded = exitCode === 0 || /^\s*(?:success|wrote|edited|created|deleted|updated)\b/i.test(text); return { text, exitCode, outcome: failed ? 'failed' : succeeded ? 'succeeded' : 'unknown' }; }
export function contentText(content: unknown): string { if (typeof content === 'string') return content.trim(); if (!Array.isArray(content)) return asString((content as { text?: unknown } | undefined)?.text)?.trim() ?? ''; return content.filter(isRecord).filter(block => { const type = asString(block.type) ?? 'text'; return type === 'text' || type === 'input_text' || type === 'output_text'; }).map(block => asString(block.text) ?? '').join('\n').trim(); }
export function isHiddenType(type: string | undefined): boolean { return Boolean(type && /thinking|reasoning/.test(type)); }

function collapseFailures(runs: readonly CommandRun[], commands: readonly CapsuleCommand[]): CapsuleFailure[] { const groups = new Map<string, { run: CommandRun; summary?: string }[]>(); runs.forEach((run, index) => { const key = commandGroupKey(run); const group = groups.get(key) ?? []; group.push({ run, summary: commands[index].summary }); groups.set(key, group); }); const failures: { ordinal: number; failure: CapsuleFailure }[] = []; for (const latest of latestCommandRuns(runs)) { let resolution: string | undefined; for (const { run, summary } of groups.get(commandGroupKey(latest))!.slice().reverse()) { if (run.exitCode === 0 && hasCompleteCommandIdentity(run)) resolution = `Retried \`${run.command}\` and it passed.`; else if (run.exitCode !== null && run.exitCode !== 0) failures.push({ ordinal: run.ordinal, failure: { summary: summary ?? `Command failed: ${run.command}`, ...(resolution ? { resolution } : {}) } }); } } return failures.sort((a, b) => a.ordinal - b.ordinal).map(item => item.failure); }
function extractAcceptance(userText: string): string[] { const items: string[] = []; let inAcceptance = false; for (const line of userText.split(/\r?\n/)) { if (/^acceptance(?:\s+criteria)?\s*:/i.test(line.trim())) { inAcceptance = true; const rest = line.replace(/^acceptance(?:\s+criteria)?\s*:/i, '').trim(); if (rest) items.push(rest.replace(/^[-*]\s*/, '')); continue; } if (!inAcceptance) continue; const bullet = line.match(/^\s*[-*]\s+(.+)/); if (bullet?.[1]) { items.push(bullet[1].trim()); continue; } if (line.trim()) break; } return items; }
function testStatus(exitCode: number | null | undefined): CapsuleTest['status'] { return exitCode === 0 ? 'passed' : exitCode == null ? 'unknown' : 'failed'; }
function fileCompletion(action: import('../types.js').FileAction, path: string): string { return action === 'added' ? `Wrote ${path}.` : action === 'deleted' ? `Deleted ${path}.` : `Edited ${path}.`; }
function summarize(value: string): string { const compact = value.replace(/\s+/g, ' ').trim(); return compact.length <= 180 ? compact : `${compact.slice(0, 179)}…`; }
function firstLine(value: string): string { return value.split(/\r?\n/).find(line => line.trim())?.trim() ?? value.trim(); }
function firstSentence(value: string): string { const match = value.trim().match(/^[\s\S]+?[.!?](?=\s|$)/); return (match?.[0] ?? value).trim(); }
function unique(items: string[]): string[] { return [...new Set(items)]; }
