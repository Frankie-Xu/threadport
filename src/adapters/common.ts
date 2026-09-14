import { z } from 'zod';
import { deriveTask } from '../domain/derive-task.js';
import { commandGroupKey, hasCompleteCommandIdentity, latestCommandRuns } from '../domain/command-state.js';
import type { CommandRun, DerivedTaskState, NormalizedEvent } from '../domain/models.js';
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { sourcePlatformForRoot } from "../workspace/paths.js";
import { protectCapsule } from "../privacy.js";
import { validateCapsule } from "../capsule.js";
import { readGitState } from "../git.js";
import { redactSecrets } from "../redact.js";
import type {
  AgentId,
  Capsule,
  CapsuleCommand,
  CapsuleDecision,
  CapsuleEvidence,
  CapsuleFailure,
  CapsuleFile,
  CapsuleStatus,
  CapsuleTest,
  FileAction
} from "../types.js";
import type { SessionExtractInput } from "./types.js";

export const DEFAULT_NEXT_ACTION = "Review the capsule and confirm the next edit.";
export const DERIVED_ACCEPTANCE_NOTE =
  "acceptance_criteria is derived from the objective; the session did not state explicit acceptance criteria.";
// Recognize a direct invocation only; shell compositions have a different exit-status meaning.
export const TEST_COMMAND = /^(?![\s\S]*[;&|<>`$\r\n])\s*(?:(?:\/(?:[^\s/]+\/)*|[A-Za-z]:\\(?:[^\s\\]+\\)*)?node(?:\.exe)?\s+--test|(?:npm|pnpm|yarn)(?:\s+run)?\s+test(?::[\w:-]+)?|(?:npx|pnpm\s+exec|yarn)\s+(?:vitest|jest)|vitest|pytest|go\s+test|cargo\s+test|mvn\s+test|(?:\.\/)?gradle(?:w)?\s+test|jest|bun\s+test)(?=\s|$)/;
export const HISTORICAL_TEST_NOTE = "Historical result; current workspace validity unknown.";
export const USER_DONE = /^\s*(?:done|completed|that'?s all|finished|lgtm)[.!]?\s*$/i;

export type SessionRecord = Record<string, unknown>;

export type TraceEvent = (
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "file"; path: string; action: FileAction; outcome?: 'succeeded' | 'failed' | 'unknown'; output?: string }
  | { type: "command"; command: string; exitCode?: number | null; cwd?: string | null; sessionId?: string; output?: string }
) & { /** Observed result position, or call position when no result exists. Not serialized. */ order?: number; occurredAt?: string | null };

export interface SessionTraces {
  objective: string;
  acceptanceCriteria: string[];
  constraints: string[];
  files: Map<string, CapsuleFile>;
  commands: CapsuleCommand[];
  commandRuns: CommandRun[];
  normalizedEvents: NormalizedEvent[];
  derived: DerivedTaskState;
  tests: CapsuleTest[];
  failures: CapsuleFailure[];
  decisions: CapsuleDecision[];
  completed: string[];
  nextAction: string;
  status: CapsuleStatus;
}

export async function loadSessionText(input: SessionExtractInput): Promise<string> {
  if (typeof input.sessionText === "string") {
    return input.sessionText;
  }
  if (!input.sessionPath) {
    throw new Error("SessionExtractInput requires sessionPath or sessionText.");
  }
  return readFile(input.sessionPath, "utf8");
}

export function parseSessionRecords(text: string, label: string): SessionRecord[] {
  const trimmed = text.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter(isRecord);
    }
    if (isRecord(parsed)) {
      const messages = parsed.messages;
      if (Array.isArray(messages)) {
        return [parsed, ...messages.filter(isRecord)];
      }
      return [parsed];
    }
  } catch {
    // JSONL transcripts fall through.
  }
  const records: SessionRecord[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) {
        records.push(parsed);
      }
    } catch {
      throw new Error(`Invalid ${label} session JSONL at line ${index + 1}.`);
    }
  }
  return records;
}

export function tracesFromEvents(events: TraceEvent[], sessionId = 'inline-session'): SessionTraces {
  if (!events.length) throw new Error('No observable session events found; unsupported or empty transcript.');
  events = events.map((event, index) => ({ event, order: event.order ?? index }))
    .sort((a, b) => a.order - b.order).map(item => item.event);
  const files = new Map<string, CapsuleFile>();
  const commands: CapsuleCommand[] = [];
  const commandRuns: CommandRun[] = [];
  const openCommandGroups = new Set<string>();
  const tests: CapsuleTest[] = [];
  const completed: string[] = [];
  const userTexts: string[] = [];
  let lastUserIndex = -1;
  let lastToolIndex = -1;
  let lastSpokenAfterFailure: string | undefined;
  let sawUnresolvedFailure = false;
  const fileFailures = new Map<string, CapsuleFailure>();

  events.forEach((event, index) => {
    if (event.type === "user") {
      userTexts.push(event.text);
      lastUserIndex = index;
      return;
    }
    if (event.type === "assistant") {
      if (sawUnresolvedFailure) {
        lastSpokenAfterFailure = firstSentence(event.text);
      }
      return;
    }
    if (event.type === "file") {
      lastToolIndex = index;
      if (event.outcome === 'succeeded') {
        const previous = files.get(event.path);
        const action = previous?.action === 'added' && event.action === 'modified' && previous.summary === 'Created in session.' ? 'added' : event.action;
        files.set(event.path, { path: event.path, action, summary: action === 'added' ? 'Created in session.' : 'Confirmed in session.' });
        completed.push(fileCompletion(event.action, event.path));
        const failure = fileFailures.get(event.path);
        if (failure) failure.resolution = `A later file operation on ${event.path} succeeded.`;
      } else {
        if (!files.has(event.path)) files.set(event.path, { path: event.path, action: event.action, summary: `Attempted ${event.action}; outcome ${event.outcome ?? 'unknown'}.` });
        if (event.outcome === 'failed') {
          fileFailures.set(event.path, { summary: event.output ? summarize(event.output) : `File operation failed: ${event.path}` });
          sawUnresolvedFailure = true;
        }
      }
      return;
    }

    lastToolIndex = index;
    const summary = event.output ? summarize(event.output) : undefined;
    const run: CommandRun = {
      id: `${event.sessionId ?? sessionId}:command:${index}`, sessionId: event.sessionId ?? sessionId,
      ordinal: index, command: event.command, cwd: event.cwd ?? null, exitCode: event.exitCode ?? null,
      startedAt: null, completedAt: null, eventId: `${event.sessionId ?? sessionId}:event:${index}`, snapshotId: null,
    };
    commandRuns.push(run);
    commands.push({
      command: event.command,
      ...(event.exitCode == null ? {} : { exit_code: event.exitCode }),
      ...(summary ? { summary } : {})
    });
    if (TEST_COMMAND.test(event.command)) {
      tests.push({
        command: event.command,
        status: testStatus(event.exitCode),
        summary: summary ? `${summary} ${HISTORICAL_TEST_NOTE}` : HISTORICAL_TEST_NOTE
      });
    }
    if (event.exitCode === 0) {
      completed.push(`Ran \`${event.command}\` (exit 0).`);
      if (hasCompleteCommandIdentity(run)) openCommandGroups.delete(commandGroupKey(run));
    } else if (event.exitCode != null) {
      openCommandGroups.add(commandGroupKey(run));
    }
    sawUnresolvedFailure = openCommandGroups.size > 0 || [...fileFailures.values()].some(failure => !failure.resolution);
  });

  const runsByOrdinal = new Map(commandRuns.map(run => [run.ordinal, run]));
  const normalizedEvents: NormalizedEvent[] = events.map((event, ordinal) => {
    const run = runsByOrdinal.get(ordinal) ?? null;
    const eventSession = run?.sessionId ?? sessionId;
    return {
      id: run?.eventId ?? `${eventSession}:event:${ordinal}`, sessionId: eventSession, ordinal,
      occurredAt: event.occurredAt ?? null,
      kind: event.type === 'user' ? 'user-message' : event.type === 'assistant' ? 'assistant-message'
        : event.type === 'file' ? 'file-change' : 'command',
      text: event.type === 'user' || event.type === 'assistant' ? event.text : event.output ?? '',
      commandRun: run, relativePaths: [], omitted: false,
    };
  });
  const derived = deriveTask(normalizedEvents);
  const objective = derived.objective?.text ?? 'Unknown objective; review the session evidence.';
  const acceptanceCriteria = extractAcceptance(userTexts.at(-1) ?? '');
  const constraints = derived.constraints.map(claim => claim.text);
  const failures = [...collapseFailures(commandRuns, commands), ...fileFailures.values()];
  const lastUserText = userTexts.at(-1) ?? "";
  const userDeclaredDone = USER_DONE.test(lastUserText);
  const unresolvedFailures = failures.some((item) => !item.resolution);
  const openUserInstruction = lastUserIndex > lastToolIndex && lastUserText && !userDeclaredDone
    ? firstLine(lastUserText)
    : undefined;

  return {
    objective,
    acceptanceCriteria,
    constraints,
    files,
    commands,
    commandRuns,
    normalizedEvents,
    derived,
    tests,
    failures,
    decisions: [],
    completed: unique(completed),
    nextAction: openUserInstruction
      ?? (unresolvedFailures ? lastSpokenAfterFailure : undefined)
      ?? DEFAULT_NEXT_ACTION,
    status: unresolvedFailures ? "blocked" : userDeclaredDone ? "completed" : "active"
  };
}

export async function assembleCapsule(options: {
  agent: AgentId;
  sessionId: string;
  traces: SessionTraces;
  input: SessionExtractInput;
  evidenceTitle: string;
  redactionCount?: number;
}): Promise<Capsule> {
  const tally = { count: 0 };
  const { traces, input } = options;
  const objective = redactField(traces.objective, tally);
  const acceptance = traces.acceptanceCriteria.length > 0
    ? traces.acceptanceCriteria.map((item) => redactField(item, tally))
    : traces.derived.objective ? [redactField(`The objective is satisfied: ${traces.objective}`, tally)] : [];
  const constraints = traces.constraints.map((item) => redactField(item, tally));
  constraints.push(traces.derived.objective
    ? "Objective is a derived candidate from the latest visible user message; confirm it before continuing."
    : "Objective is unknown because no visible user message was recorded.");
  if (traces.acceptanceCriteria.length === 0 && traces.derived.objective) {
    constraints.push(DERIVED_ACCEPTANCE_NOTE);
  }
  const files = [...traces.files.values()].map((file) => ({
    path: redactField(file.path, tally),
    action: file.action,
    ...(file.summary ? { summary: redactField(file.summary, tally) } : {})
  }));
  const commands = traces.commands.map((command) => ({
    command: redactField(command.command, tally),
    ...(command.exit_code === undefined ? {} : { exit_code: command.exit_code }),
    ...(command.summary ? { summary: redactField(command.summary, tally) } : {})
  }));
  const tests = traces.tests.map((item) => ({
    command: redactField(item.command, tally),
    status: item.status,
    ...(item.summary ? { summary: redactField(item.summary, tally) } : {})
  }));
  const failures = traces.failures.map((item) => ({
    summary: redactField(item.summary, tally),
    ...(item.resolution ? { resolution: redactField(item.resolution, tally) } : {})
  }));
  const decisions = traces.decisions.map((item) => ({
    decision: redactField(item.decision, tally)
  }));
  const completed = traces.completed.map((item) => redactField(item, tally));
  const nextAction = redactField(traces.nextAction, tally);
  // Session files are read relative to the process cwd, not the project's root.
  const sessionLocator = input.sessionPath && input.privacy !== 'local' ? resolve(input.sessionPath) : input.sessionPath;
  const evidence = buildEvidence(options.evidenceTitle, sessionLocator, files, commands, traces.normalizedEvents).map((item) => ({
    kind: item.kind,
    title: redactField(item.title, tally),
    ...(item.locator ? { locator: redactField(item.locator, tally) } : {})
  }));

  const git = await readGitState(input.project.root);
  return validateCapsule(protectCapsule({
    schema_version: "1.0",
    id: sanitizeCapsuleId(options.sessionId, options.agent),
    created_at: resolveCreatedAt(input.now),
    source_agent: options.agent,
    source_session_id: options.sessionId,
    project: {
      name: input.project.name,
      root: input.project.root,
      ...(input.project.repository ? { repository: input.project.repository } : {})
    },
    objective,
    acceptance_criteria: acceptance,
    status: traces.status,
    completed,
    decisions,
    constraints,
    files,
    commands,
    tests,
    failures,
    next_action: nextAction,
    evidence,
    git,
    redaction: {
      applied: tally.count > 0,
      count: tally.count
    }
  }, input.privacy ?? 'portable', [resolve(input.project.root), git.root], tally.count + (options.redactionCount ?? 0), sourcePlatformForRoot(git.root)));
}

export function sessionIdFrom(records: SessionRecord[], sessionPath: string | undefined, fallback: string): string {
  const ids = new Set<string>();
  for (const record of records) {
    const sessionId = asString(record.sessionId) ?? asString(record.session_id);
    if (sessionId?.trim()) ids.add(sessionId.trim());
    if (asString(record.type) === "session_meta") {
      const nested = isRecord(record.payload) ? asString(record.payload.id) : undefined;
      const id = nested ?? asString(record.id);
      if (id?.trim()) ids.add(id.trim());
    }
  }
  // A legacy Capsule represents one session; refuse concatenated sessions rather than merging retries.
  if (ids.size > 1) throw new Error('Multiple session IDs in one transcript; extract each session separately.');
  if (ids.size) return [...ids][0];
  if (sessionPath) {
    const fromName = basename(sessionPath).replace(/\.[^.]+$/, "");
    if (fromName && fromName !== "session-basic") {
      return fromName;
    }
  }
  return fallback;
}

/** Only normalize an explicit valid timestamp; an absent or invalid source time is unknown. */
export function sourceTimestamp(value: unknown): string | null {
  const parsed = z.string().datetime({ offset: true }).safeParse(value);
  return parsed.success ? new Date(parsed.data).toISOString() : null;
}

export function resolveCreatedAt(now: Date | undefined, records: SessionRecord[] = []): string {
  if (now) {
    return now.toISOString();
  }
  let earliest = Infinity;
  for (const record of records) {
    const timestamp = asString(record.timestamp) ?? asString(record.created_at);
    if (timestamp && !Number.isNaN(Date.parse(timestamp))) {
      earliest = Math.min(earliest, Date.parse(timestamp));
    }
  }
  return new Date(Number.isFinite(earliest) ? earliest : Date.now()).toISOString();
}

export function parseExitCode(text: string | undefined): number | undefined {
  if (!text) {
    return undefined;
  }
  const tagged = text.match(/<exit_code>\s*(-?\d+)\s*<\/exit_code>/i);
  if (tagged?.[1]) {
    return Number(tagged[1]);
  }
  const labeled = text.match(/exit(?:[\s_-]*)code\s*[:=]\s*(-?\d+)/i);
  if (labeled?.[1]) {
    return Number(labeled[1]);
  }
  const processExit = text.match(/Process exited with code\s+(-?\d+)/i);
  if (processExit) return Number(processExit[1]);
  return undefined;
}

export interface ToolResult { text: string; exitCode?: number; outcome: 'succeeded' | 'failed' | 'unknown'; }
export function toolResult(value: unknown, isError = false): ToolResult {
  const text = typeof value === 'string' ? value : isRecord(value)
    ? asString(value.output) ?? asString(value.content) ?? asString(value.text) ?? JSON.stringify(value) : contentText(value);
  const explicit = isRecord(value) && ('exit_code' in value || 'exitCode' in value);
  const numeric = isRecord(value) ? ('exit_code' in value ? value.exit_code : value.exitCode) : undefined;
  const exitCode = numeric === null ? undefined : isError ? 1 : typeof numeric === 'number' && Number.isSafeInteger(numeric) ? numeric : explicit ? undefined : parseExitCode(text);
  const failed = isError || (exitCode !== undefined && exitCode !== 0) || /^\s*(?:error|failed|failure)\b/i.test(text);
  const succeeded = exitCode === 0 || /^\s*(?:success|wrote|edited|created|deleted|updated)\b/i.test(text);
  return { text, exitCode, outcome: failed ? 'failed' : succeeded ? 'succeeded' : 'unknown' };
}

export function contentText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return asString((content as { text?: unknown } | undefined)?.text)?.trim() ?? "";
  }
  return content
    .filter(isRecord)
    .filter((block) => {
      const type = asString(block.type) ?? "text";
      return type === "text" || type === "input_text" || type === "output_text";
    })
    .map((block) => asString(block.text) ?? "")
    .join("\n")
    .trim();
}

export function isHiddenType(type: string | undefined): boolean {
  return Boolean(type && /thinking|reasoning/.test(type));
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function isRecord(value: unknown): value is SessionRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeCapsuleId(sessionId: string, agent: AgentId): string {
  const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  return cleaned.slice(0, 128) || `${agent}-session`;
}

function extractAcceptance(userText: string): string[] {
  const items: string[] = [];
  let inAcceptance = false;
  for (const line of userText.split(/\r?\n/)) {
    if (/^acceptance(?:\s+criteria)?\s*:/i.test(line.trim())) {
      inAcceptance = true;
      const rest = line.replace(/^acceptance(?:\s+criteria)?\s*:/i, "").trim();
      if (rest) {
        items.push(rest.replace(/^[-*]\s*/, ""));
      }
      continue;
    }
    if (!inAcceptance) {
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (bullet?.[1]) {
      items.push(bullet[1].trim());
      continue;
    }
    if (line.trim()) {
      break;
    }
  }
  return items;
}

function collapseFailures(runs: readonly CommandRun[], commands: readonly CapsuleCommand[]): CapsuleFailure[] {
  const groups = new Map<string, { run: CommandRun; summary?: string }[]>();
  runs.forEach((run, index) => {
    const key = commandGroupKey(run);
    const group = groups.get(key) ?? [];
    group.push({ run, summary: commands[index].summary });
    groups.set(key, group);
  });
  const failures: { ordinal: number; failure: CapsuleFailure }[] = [];
  for (const latest of latestCommandRuns(runs)) {
    let resolution: string | undefined;
    // Walking backwards associates each failure only with a later success in its own group.
    for (const { run, summary } of groups.get(commandGroupKey(latest))!.slice().reverse()) {
      if (run.exitCode === 0 && hasCompleteCommandIdentity(run)) resolution = `Retried \`${run.command}\` and it passed.`;
      else if (run.exitCode !== null && run.exitCode !== 0) failures.push({ ordinal: run.ordinal, failure: {
        summary: summary ?? `Command failed: ${run.command}`,
        ...(resolution ? { resolution } : {}),
      } });
    }
  }
  return failures.sort((a, b) => a.ordinal - b.ordinal).map(item => item.failure);
}

function buildEvidence(
  title: string,
  sessionPath: string | undefined,
  files: CapsuleFile[],
  commands: CapsuleCommand[],
  events: readonly NormalizedEvent[]
): CapsuleEvidence[] {
  const evidence: CapsuleEvidence[] = [{
    kind: "session",
    title,
    locator: sessionPath ?? "inline-session"
  }];
  for (const event of events) {
    if ((event.kind === 'user-message' || event.kind === 'assistant-message') && event.text.trim()) {
      evidence.push({ kind: 'other', title: `Observed ${event.kind}: ${summarize(event.text)}`,
        locator: `session-event:${event.ordinal}` });
    }
  }
  for (const file of files) {
    evidence.push({ kind: "file", title: file.path, locator: file.path });
  }
  for (const command of commands) {
    evidence.push({ kind: "command", title: command.command, locator: command.command });
  }
  return evidence;
}

function testStatus(exitCode: number | null | undefined): CapsuleTest["status"] {
  if (exitCode === 0) {
    return "passed";
  }
  if (exitCode == null) {
    return "unknown";
  }
  return "failed";
}

function fileCompletion(action: FileAction, path: string): string {
  if (action === "added") {
    return `Wrote ${path}.`;
  }
  if (action === "deleted") {
    return `Deleted ${path}.`;
  }
  return `Edited ${path}.`;
}

function redactField(value: string, tally: { count: number }): string {
  const result = redactSecrets(value);
  tally.count += result.count;
  return result.text;
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? text.trim();
}

function firstSentence(text: string): string {
  const match = text.trim().match(/^[\s\S]+?[.!?](?=\s|$)/);
  return (match?.[0] ?? text).trim();
}

function summarize(text: string, max = 180): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
