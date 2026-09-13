import { readFile } from "node:fs/promises";
import { basename } from "node:path";
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
export const TEST_COMMAND = /(?:^|[\s/])(?:npm(?:\s+run)?\s+test|npx\s+vitest|vitest|pytest|go\s+test|cargo\s+test|mvn\s+test|gradle(?:w)?\s+test|jest|bun\s+test)\b/i;
export const SPOKEN_DECISION = /^(?:I(?:'ll| will)|Let's|I am going to)\b/i;
export const USER_DONE = /^\s*(?:done|completed|that'?s all|finished|lgtm)[.!]?\s*$/i;

export type SessionRecord = Record<string, unknown>;

export type TraceEvent = (
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "file"; path: string; action: FileAction; outcome?: 'succeeded' | 'failed' | 'unknown'; output?: string }
  | { type: "command"; command: string; exitCode?: number; output?: string }
) & { /** Observed result position, or call position when no result exists. Not serialized. */ order?: number };

export interface SessionTraces {
  objective: string;
  acceptanceCriteria: string[];
  constraints: string[];
  files: Map<string, CapsuleFile>;
  commands: CapsuleCommand[];
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

export function tracesFromEvents(events: TraceEvent[]): SessionTraces {
  if (!events.length) throw new Error('No observable session events found; unsupported or empty transcript.');
  events = events.map((event, index) => ({ event, order: event.order ?? index }))
    .sort((a, b) => a.order - b.order).map(item => item.event);
  const files = new Map<string, CapsuleFile>();
  const commands: CapsuleCommand[] = [];
  const tests: CapsuleTest[] = [];
  const decisions: CapsuleDecision[] = [];
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
      if (SPOKEN_DECISION.test(event.text)) {
        decisions.push({ decision: firstSentence(event.text) });
      }
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
    commands.push({
      command: event.command,
      ...(event.exitCode === undefined ? {} : { exit_code: event.exitCode }),
      ...(summary ? { summary } : {})
    });
    if (TEST_COMMAND.test(event.command)) {
      tests.push({
        command: event.command,
        status: testStatus(event.exitCode),
        ...(summary ? { summary } : {})
      });
    }
    if (event.exitCode === 0) {
      completed.push(`Ran \`${event.command}\` (exit 0).`);
      sawUnresolvedFailure = false;
    } else if (event.exitCode !== undefined) {
      sawUnresolvedFailure = true;
    }
  });

  const objective = firstLine(userTexts[0] ?? "Resume the recorded session.");
  const acceptanceCriteria = extractAcceptance(userTexts[0] ?? "");
  const constraints = extractConstraints(userTexts);
  const failures = [...collapseFailures(commands), ...fileFailures.values()];
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
    tests,
    failures,
    decisions,
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
    : [redactField(`The objective is satisfied: ${traces.objective}`, tally)];
  const constraints = traces.constraints.map((item) => redactField(item, tally));
  if (traces.acceptanceCriteria.length === 0) {
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
  const evidence = buildEvidence(options.evidenceTitle, input.sessionPath, files, commands).map((item) => ({
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
  }, input.privacy ?? 'portable', [input.project.root, git.root], tally.count + (options.redactionCount ?? 0)));
}

export function sessionIdFrom(records: SessionRecord[], sessionPath: string | undefined, fallback: string): string {
  for (const record of records) {
    const sessionId = asString(record.sessionId) ?? asString(record.session_id);
    if (sessionId?.trim()) {
      return sessionId.trim();
    }
    if (asString(record.type) === "session_meta") {
      const nested = isRecord(record.payload) ? asString(record.payload.id) : undefined;
      const id = nested ?? asString(record.id);
      if (id?.trim()) {
        return id.trim();
      }
    }
  }
  if (sessionPath) {
    const fromName = basename(sessionPath).replace(/\.[^.]+$/, "");
    if (fromName && fromName !== "session-basic") {
      return fromName;
    }
  }
  return fallback;
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
  const numeric = isRecord(value) ? value.exit_code ?? value.exitCode : undefined;
  const exitCode = isError ? 1 : typeof numeric === 'number' && Number.isSafeInteger(numeric) ? numeric : parseExitCode(text);
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

function extractConstraints(userTexts: string[]): string[] {
  const constraints: string[] = [];
  for (const text of userTexts) {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim().replace(/^[-*]\s+/, "");
      if (/^do not\b/i.test(trimmed) || /^don't\b/i.test(trimmed)) {
        constraints.push(trimmed);
      }
    }
  }
  return unique(constraints);
}

function collapseFailures(commands: CapsuleCommand[]): CapsuleFailure[] {
  const failures: CapsuleFailure[] = [];
  const open = new Map<string, CapsuleFailure>();
  for (const command of commands) {
    if (command.exit_code === undefined) continue;
    if (command.exit_code === 0) {
      const failure = open.get(command.command);
      if (failure) failure.resolution = `Retried \`${command.command}\` and it passed.`;
      open.delete(command.command);
    } else if (!open.has(command.command)) {
      const failure = { summary: command.summary ?? `Command failed: ${command.command}` };
      failures.push(failure); open.set(command.command, failure);
    }
  }
  return failures;
}

function buildEvidence(
  title: string,
  sessionPath: string | undefined,
  files: CapsuleFile[],
  commands: CapsuleCommand[]
): CapsuleEvidence[] {
  const evidence: CapsuleEvidence[] = [{
    kind: "session",
    title,
    locator: sessionPath ?? "inline-session"
  }];
  for (const file of files) {
    evidence.push({ kind: "file", title: file.path, locator: file.path });
  }
  for (const command of commands) {
    evidence.push({ kind: "command", title: command.command, locator: command.command });
  }
  return evidence;
}

function testStatus(exitCode: number | undefined): CapsuleTest["status"] {
  if (exitCode === 0) {
    return "passed";
  }
  if (exitCode === undefined) {
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
